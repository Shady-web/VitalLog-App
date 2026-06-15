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

// Stage-aware progress: report the current stage, with a download % when a model
// is being fetched on first run, e.g. "Generating explanation… 42%".
function pctOf(p: unknown): number | null {
  if (p && typeof p === "object" && "percentage" in p) {
    const pct = Number((p as { percentage: unknown }).percentage);
    if (Number.isFinite(pct)) return Math.round(pct);
  }
  return null;
}
function stageProgress(out: { send: (o: unknown) => void }, label: string) {
  return (p: unknown) => {
    const pct = pctOf(p);
    out.send({ type: "status", text: pct == null ? label : `${label} ${pct}%` });
  };
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
      const text = await transcribeFile(path);
      return addEntry({ type: "voice", text, source: path }, journalPathFor(userId));
    });
    sendJSON(res, 200, { entry });
  } catch (err) {
    sendJSON(res, 500, { error: (err as Error).message });
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
      await ragAnswer(question, {
        onToken: (t) => out.send({ type: "token", text: t }),
        onProgress: stageProgress(out, "Generating explanation…"),
      });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: (err as Error).message });
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
      const text = await extractText(path, { onProgress: stageProgress(out, "Extracting text…") });
      if (!text.trim()) { out.send({ type: "error", message: "Couldn't read any text from that image." }); return; }

      // Explain the document in plain language (no citations, no jargon).
      out.send({ type: "status", text: "Generating explanation…" });
      await explain(text, {
        onToken: (t) => out.send({ type: "token", text: t }),
        onProgress: stageProgress(out, "Generating explanation…"),
      });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: (err as Error).message });
  } finally {
    out.end();
  }
}

async function handleSummary(res: ServerResponse, userId: string) {
  const out = ndjson(res);
  try {
    await runExclusive(async () => {
      out.send({ type: "status", text: "Building your summary…" });
      await summarize({
        journalPath: journalPathFor(userId),
        onToken: (t) => out.send({ type: "token", text: t }),
        onProgress: stageProgress(out, "Building your summary…"),
      });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: (err as Error).message });
  } finally {
    out.end();
  }
}

async function handleRagIngest(res: ServerResponse) {
  const out = ndjson(res);
  try {
    await runExclusive(async () => {
      out.send({ type: "status", text: "Getting things ready…" });
      const n = await ragIngest({ onProgress: stageProgress(out, "Getting things ready…") });
      out.send({ type: "ingested", count: n });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: (err as Error).message });
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
    if (!res.headersSent) sendJSON(res, 500, { error: (err as Error).message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n  VitalLog UI running — open  http://localhost:${PORT}\n`);
});
