// app-node/server.ts — local web UI server for VitalLog (Phase 3).
//
// Fully offline: Node's built-in http server, no framework, no external assets. It
// serves the static UI from app-node/public/ and exposes a tiny API that calls the
// existing core/ modules unchanged. All AI still runs through core/ -> @qvac/sdk.
//
// Generation endpoints stream NDJSON (one JSON object per line) so the UI can show
// tokens as the local models produce them.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

import { getEntries } from "../core/store.ts";
import { transcribeToJournal } from "../core/transcribe.ts";
import { extractText } from "../core/ocr.ts";
import { answer as ragAnswer, ingest as ragIngest } from "../core/rag.ts";
import { summarize } from "../core/summary.ts";

const PORT = Number(process.env.PORT) || 8787;
const PUBLIC_DIR = resolve("app-node/public");
const UPLOAD_DIR = resolve("data/uploads");

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

function sendJSON(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

// NDJSON stream: returns a writer that emits {type,...} objects, one per line.
function ndjson(res: ServerResponse) {
  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-cache",
  });
  return {
    send(obj: unknown) {
      res.write(JSON.stringify(obj) + "\n");
    },
    end() {
      res.end();
    },
  };
}

function friendlyProgress(p: unknown): string | null {
  if (p && typeof p === "object" && "percentage" in p) {
    const pct = Number((p as { percentage: unknown }).percentage);
    if (Number.isFinite(pct)) return `Downloading model… ${pct.toFixed(0)}%`;
  }
  return null;
}

function saveUpload(buf: Buffer, filename: string): string {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = extname(filename) || ".bin";
  const path = join(UPLOAD_DIR, `${randomUUID()}${ext}`);
  writeFileSync(path, buf);
  return path;
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

// ---- API handlers -----------------------------------------------------------
async function handleJournal(res: ServerResponse) {
  sendJSON(res, 200, { entries: getEntries() });
}

async function handleTranscribe(req: IncomingMessage, res: ServerResponse) {
  const filename = String(req.headers["x-filename"] || "recording.wav");
  const buf = await readBody(req);
  if (buf.length === 0) return sendJSON(res, 400, { error: "Empty audio upload." });
  const path = saveUpload(buf, filename);
  try {
    const entry = await runExclusive(() => transcribeToJournal(path));
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
      const { citations } = await ragAnswer(question, {
        onToken: (t) => out.send({ type: "token", text: t }),
        onProgress: (p) => { const m = friendlyProgress(p); if (m) out.send({ type: "status", text: m }); },
      });
      out.send({ type: "citations", citations });
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
      out.send({ type: "status", text: "Reading the image (OCR)…" });
      const text = await extractText(path, {
        onProgress: (p) => { const m = friendlyProgress(p); if (m) out.send({ type: "status", text: m }); },
      });
      out.send({ type: "ocr", text });
      if (!text.trim()) { out.send({ type: "error", message: "No text found in the image." }); return; }

      out.send({ type: "status", text: "Explaining the result…" });
      const { citations } = await ragAnswer(text, {
        onToken: (t) => out.send({ type: "token", text: t }),
        onProgress: (p) => { const m = friendlyProgress(p); if (m) out.send({ type: "status", text: m }); },
      });
      out.send({ type: "citations", citations });
    });
    out.send({ type: "done" });
  } catch (err) {
    out.send({ type: "error", message: (err as Error).message });
  } finally {
    out.end();
  }
}

async function handleSummary(res: ServerResponse) {
  const out = ndjson(res);
  try {
    await runExclusive(async () => {
      await summarize({
        onToken: (t) => out.send({ type: "token", text: t }),
        onProgress: (p) => { const m = friendlyProgress(p); if (m) out.send({ type: "status", text: m }); },
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
      out.send({ type: "status", text: "Preparing the reference glossary…" });
      const n = await ragIngest({
        onProgress: (p) => { const m = friendlyProgress(p); if (m) out.send({ type: "status", text: m }); },
      });
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
  try {
    if (req.method === "GET" && url === "/api/journal") return await handleJournal(res);
    if (req.method === "POST" && url === "/api/transcribe") return await handleTranscribe(req, res);
    if (req.method === "POST" && url === "/api/ask") return await handleAsk(req, res);
    if (req.method === "POST" && url === "/api/document") return await handleDocument(req, res);
    if (req.method === "POST" && url === "/api/summary") return await handleSummary(res);
    if (req.method === "POST" && url === "/api/rag/ingest") return await handleRagIngest(res);
    if (req.method === "GET") return await serveStatic(req, res);
    res.writeHead(404); res.end("Not found");
  } catch (err) {
    if (!res.headersSent) sendJSON(res, 500, { error: (err as Error).message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n  VitalLog UI running — open  http://localhost:${PORT}\n`);
  console.log("  All inference runs locally via @qvac/sdk. Nothing leaves this machine.\n");
});
