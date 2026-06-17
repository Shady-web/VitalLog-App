// app-node/server.ts — local web UI server for VitalLog (Phase 3).
//
// Fully offline: Node's built-in http server, no framework, no external assets. It
// serves the static UI from app-node/public/ and exposes a tiny API that calls the
// existing core/ modules. All AI runs through core/ -> @qvac/sdk; nothing leaves the box.
//
// Accounts are local (app-node/auth.ts). Each account has its own private journal at
// data/journal/<userId>/entries.json. Generation endpoints stream NDJSON so the UI can
// show progress as the local models produce tokens.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

import { getEntries, addEntry } from "../core/store.ts";
import { transcribeFile } from "../core/transcribe.ts";
import { extractText } from "../core/ocr.ts";
import { explain } from "../core/explain.ts";
import { answer as ragAnswer, ingest as ragIngest } from "../core/rag.ts";
import { summarize } from "../core/summary.ts";
import { getWarmModel, unloadAllWarm } from "../core/models.ts";
import {
  register, login, createSession, getSession, destroySession,
  parseCookies, SESSION_COOKIE,
} from "./auth.ts";

const PORT = Number(process.env.PORT) || 8787;
const PUBLIC_DIR = resolve("app-node/public");
const UPLOAD_DIR = resolve("data/uploads");

function journalPathFor(userId: string): string {
  return resolve("data/journal", userId, "entries.json");
}

// ---- inference serialization ------------------------------------------------
// Models load/unload per call and the worker handles one job at a time, so run
// inference requests strictly one-after-another to avoid concurrent-load errors.
let queue: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.catch(() => {});
  return result;
}

// ---- helpers ----------------------------------------------------------------
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => res(Buffer.concat(chunks)));
    req.on("error", rej);
  });
}

function sendJSON(res: ServerResponse, status: number, data: unknown, extraHeaders: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(body);
}

// NDJSON stream: returns a writer that emits {type,...} objects, one per line.
function ndjson(res: ServerResponse) {
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" });
  return {
    send(obj: unknown) { res.write(JSON.stringify(obj) + "\n"); },
    end() { res.end(); },
  };
}

// Re-send the current stage label as work progresses. The client owns the animated
// 0→100 counter, so we only need to tell it which stage we're in.
function stageProgress(out: { send: (o: unknown) => void }, label: string) {
  return () => out.send({ type: "status", text: label });
}

// Documents: give a short, plain-language summary of what the results MEAN —
// not a read-back of the numbers.
const DOCUMENT_GUIDANCE =
  "This text was extracted from a lab report. Write a short, plain-language summary of what " +
  "the results MEAN for the person — do NOT read back, list, or repeat the raw numbers, units, " +
  "or reference ranges. For each notable result, say simply whether it is normal, high, or low " +
  "and what that generally indicates, e.g. \"Your blood sugar is slightly above the normal range\" " +
  "or \"Your cholesterol is in a healthy range.\" Focus on what stands out (anything flagged high " +
  "or low) and you may note briefly that the rest looks normal. Keep it to a few simple sentences. " +
  "Do NOT mention the laboratory, the patient's name, age, gender, IDs, or any dates. Finish by " +
  "gently suggesting they discuss the results with their doctor.";

// Map raw SDK errors to a clear, actionable message for the UI (testers see the cause).
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  // Model couldn't be downloaded (first run needs network).
  if (m.includes("request_timeout") || m.includes("host_not_allowed") || m.includes("download") || /\b403\b/.test(m)) {
    return "Couldn't download the AI model. The first use of each feature needs an internet connection to download its model once (after that it works offline). Check your connection and try again — the app's terminal window shows the details.";
  }
  // On-device engine couldn't start — missing VC++ runtime (Windows) or incomplete install.
  if (
    m.includes("rpc") || m.includes("worker") || m.includes("timed out") ||
    m.includes("module_not_found") || m.includes("model_load_failed") || m.includes("@qvac") ||
    m.includes("specified module") || m.includes("3221226505")
  ) {
    return (
      "The on-device AI engine couldn't start. On Windows this is usually a missing " +
      "Microsoft Visual C++ Redistributable (x64) — install it from " +
      "https://aka.ms/vs/17/release/vc_redist.x64.exe and REBOOT. Otherwise it's an " +
      "incomplete install: delete the node_modules folder and run \"npm install\" again. " +
      "The terminal window running the app shows the real cause; see the Troubleshooting " +
      "section in the README."
    );
  }
  return msg;
}

function saveUpload(buf: Buffer, filename: string): string {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = extname(filename) || ".bin";
  const path = join(UPLOAD_DIR, `${randomUUID()}${ext}`);
  writeFileSync(path, buf);
  return path;
}

function cookieFor(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`;
}
function clearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
function currentUser(req: IncomingMessage) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return getSession(token);
}

// ---- static files -----------------------------------------------------------
async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

// ---- auth handlers ----------------------------------------------------------
async function handleAuth(req: IncomingMessage, res: ServerResponse, mode: "register" | "login") {
  const body = await readBody(req);
  let username = "", password = "";
  try { const j = JSON.parse(body.toString("utf8")); username = j.username || ""; password = j.password || ""; } catch {}
  const result = (mode === "register" ? register : login)(username, password);
  if (!result.ok || !result.account) return sendJSON(res, 400, { error: result.error });
  const token = createSession(result.account);
  sendJSON(res, 200, { user: { username: result.account.username } }, { "set-cookie": cookieFor(token) });
}

function handleLogout(req: IncomingMessage, res: ServerResponse) {
  destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  sendJSON(res, 200, { ok: true }, { "set-cookie": clearCookie() });
}

// ---- data handlers (require a session) --------------------------------------
function handleJournal(res: ServerResponse, userId: string) {
  sendJSON(res, 200, { entries: getEntries(journalPathFor(userId)) });
}

async function handleTranscribe(req: IncomingMessage, res: ServerResponse, userId: string) {
  const filename = String(req.headers["x-filename"] || "recording.wav");
  const buf = await readBody(req);
  if (buf.length === 0) return sendJSON(res, 400, { error: "Empty audio upload." });
  const path = saveUpload(buf, filename);
  try {
    const entry = await runExclusive(async () => {
      const whisperId = await getWarmModel("whisper");
      const text = await transcribeFile(path, { modelId: whisperId });
      return addEntry({ type: "voice", text, source: path }, journalPathFor(userId));
    });
    sendJSON(res, 200, { entry });
  } catch (err) {
    sendJSON(res, 500, { error: friendlyError(err) });
  }
}

async function handleAsk(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  let question = "";
  try { question = JSON.parse(body.toString("utf8")).question || ""; } catch {}
  if (!question.trim()) return sendJSON(res, 400, { error: "Question is empty." });

  const out = ndjson(res);
  try {
    await runExclusive(async () => {
      out.send({ type: "status", text: "Generating explanation…" });
      const progress = stageProgress(out, "Generating explanation…");
      const embedModelId = await getWarmModel("embeddings", progress);
      const llmModelId = await getWarmModel("llm", progress);
      await ragAnswer(question, {
        embedModelId,
        llmModelId,
        onToken: (t) => out.send({ type: "token", text: t }),
      });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: friendlyError(err) });
  } finally {
    out.end();
  }
}

async function handleDocument(req: IncomingMessage, res: ServerResponse) {
  const filename = String(req.headers["x-filename"] || "image.png");
  const buf = await readBody(req);
  if (buf.length === 0) return sendJSON(res, 400, { error: "Empty image upload." });
  const path = saveUpload(buf, filename);

  const out = ndjson(res);
  try {
    await runExclusive(async () => {
      // OCR runs in the background — the extracted text is not shown to the user.
      out.send({ type: "status", text: "Extracting text…" });
      const ocrId = await getWarmModel("ocr", stageProgress(out, "Extracting text…"));
      const text = await extractText(path, { modelId: ocrId });
      if (!text.trim()) { out.send({ type: "error", message: "Couldn't read any text from that image." }); return; }

      // Explain the test results in plain language (no citations, no jargon).
      out.send({ type: "status", text: "Generating explanation…" });
      const llmId = await getWarmModel("llm", stageProgress(out, "Generating explanation…"));
      await explain(text, {
        modelId: llmId,
        guidance: DOCUMENT_GUIDANCE,
        onToken: (t) => out.send({ type: "token", text: t }),
      });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: friendlyError(err) });
  } finally {
    out.end();
  }
}

async function handleSummary(res: ServerResponse, userId: string) {
  const out = ndjson(res);
  try {
    await runExclusive(async () => {
      out.send({ type: "status", text: "Building your summary…" });
      const llmId = await getWarmModel("llm", stageProgress(out, "Building your summary…"));
      await summarize({
        modelId: llmId,
        journalPath: journalPathFor(userId),
        onToken: (t) => out.send({ type: "token", text: t }),
      });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: friendlyError(err) });
  } finally {
    out.end();
  }
}

async function handleRagIngest(res: ServerResponse) {
  const out = ndjson(res);
  try {
    await runExclusive(async () => {
      out.send({ type: "status", text: "Getting things ready…" });
      const embedModelId = await getWarmModel("embeddings", stageProgress(out, "Getting things ready…"));
      const n = await ragIngest({ embedModelId });
      out.send({ type: "ingested", count: n });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: friendlyError(err) });
  } finally {
    out.end();
  }
}

// ---- routing ----------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  const method = req.method || "GET";
  try {
    // public auth routes
    if (method === "POST" && url === "/api/register") return await handleAuth(req, res, "register");
    if (method === "POST" && url === "/api/login") return await handleAuth(req, res, "login");
    if (method === "POST" && url === "/api/logout") return handleLogout(req, res);
    if (method === "GET" && url === "/api/me") {
      const u = currentUser(req);
      return sendJSON(res, 200, { user: u ? { username: u.username } : null });
    }

    // protected data routes
    if (url.startsWith("/api/")) {
      const user = currentUser(req);
      if (!user) return sendJSON(res, 401, { error: "Please sign in." });
      if (method === "GET" && url === "/api/journal") return handleJournal(res, user.userId);
      if (method === "POST" && url === "/api/transcribe") return await handleTranscribe(req, res, user.userId);
      if (method === "POST" && url === "/api/ask") return await handleAsk(req, res);
      if (method === "POST" && url === "/api/document") return await handleDocument(req, res);
      if (method === "POST" && url === "/api/summary") return await handleSummary(res, user.userId);
      if (method === "POST" && url === "/api/rag/ingest") return await handleRagIngest(res);
      res.writeHead(404); res.end("Not found"); return;
    }

    if (method === "GET") return await serveStatic(req, res);
    res.writeHead(404); res.end("Not found");
  } catch (err) {
    if (!res.headersSent) sendJSON(res, 500, { error: friendlyError(err) });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n  VitalLog UI running — open  http://localhost:${PORT}\n`);
});

// On Ctrl+C, unload the warm models so the inference worker shuts down cleanly.
let shuttingDown = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    if (shuttingDown) process.exit(0);
    shuttingDown = true;
    try { await unloadAllWarm(); } catch { /* best effort */ }
    process.exit(0);
  });
}
