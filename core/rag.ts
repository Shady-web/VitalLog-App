// core/rag.ts — grounded glossary Q&A via local embeddings, fully offline, SDK-only.
//
// Pipeline:
//   ingest():  parse data/reference/*.md into entries, embed each with
//              EMBEDDINGGEMMA_300M_Q4_0, save vectors to data/embeddings/glossary.json.
//   answer():  embed the question, cosine-rank the stored entries, then ask the LLM to
//              answer using ONLY the top entries, reusing the guardrail prompt. Returns
//              the answer plus citations to the source snippets.
//
// Verified against the SDK's rag-sqlite example + installed 0.12.2 types:
//   loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q4_0, modelType: "embeddings" })
//   embed({ modelId, text }) -> { embedding: number[] }
//   completion({ modelId, history, stream }) -> CompletionRun (used for the grounded answer)
import {
  loadModel,
  unloadModel,
  embed,
  completion,
  EMBEDDINGGEMMA_300M_Q4_0,
  LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { GUARDRAIL_SYSTEM_PROMPT } from "./explain.ts";

const REFERENCE_DIR = resolve("data/reference");
const EMBEDDINGS_PATH = resolve("data/embeddings/glossary.json");
const EMBED_MODEL_NAME = "EMBEDDINGGEMMA_300M_Q4_0";
const DISCLAIMER = "This is general information, not medical advice.";
const TOP_K = 3;

export interface GlossaryEntry {
  /** Heading of the entry, e.g. "LDL Cholesterol (LDL-C)". */
  term: string;
  /** Body text of the entry. */
  text: string;
  /** Source file (relative), used for citations. */
  source: string;
}

interface EmbeddedEntry extends GlossaryEntry {
  vector: number[];
}

interface EmbeddingsStore {
  model: string;
  entries: EmbeddedEntry[];
}

export interface RagCitation {
  term: string;
  source: string;
  score: number;
}

export interface RagAnswer {
  answer: string;
  citations: RagCitation[];
}

export interface RagOptions {
  onProgress?: (progress: unknown) => void;
}

// --- glossary parsing -------------------------------------------------------

/** Parse a markdown reference file into entries, one per "## " heading. */
function parseGlossary(content: string, source: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  let term: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (term) {
      const text = body.join("\n").trim();
      if (text) entries.push({ term, text, source });
    }
  };

  for (const line of content.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      term = m[1];
      body = [];
    } else if (term) {
      body.push(line);
    }
  }
  flush();
  return entries;
}

/** Read and parse all .md files in data/reference/. */
export function loadReferenceEntries(): GlossaryEntry[] {
  if (!existsSync(REFERENCE_DIR)) {
    throw new Error(`reference directory not found: ${REFERENCE_DIR}`);
  }
  const entries: GlossaryEntry[] = [];
  for (const file of readdirSync(REFERENCE_DIR)) {
    if (!file.endsWith(".md")) continue;
    const full = join(REFERENCE_DIR, file);
    entries.push(...parseGlossary(readFileSync(full, "utf8"), `data/reference/${file}`));
  }
  return entries;
}

// --- vector math ------------------------------------------------------------

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// --- ingest -----------------------------------------------------------------

/** Embed every reference entry once and write the vector store to disk. */
export async function ingest(options: RagOptions = {}): Promise<number> {
  const entries = loadReferenceEntries();
  if (entries.length === 0) {
    throw new Error(`no reference entries found in ${REFERENCE_DIR}`);
  }

  const modelId = await loadModel({
    modelSrc: EMBEDDINGGEMMA_300M_Q4_0,
    modelType: "embeddings",
    onProgress: options.onProgress,
  });

  try {
    const embedded: EmbeddedEntry[] = [];
    for (const entry of entries) {
      // Embed the term + text so the heading contributes to retrieval.
      const { embedding } = await embed({
        modelId,
        text: `${entry.term}\n${entry.text}`,
      });
      embedded.push({ ...entry, vector: embedding });
    }

    const store: EmbeddingsStore = { model: EMBED_MODEL_NAME, entries: embedded };
    mkdirSync(dirname(EMBEDDINGS_PATH), { recursive: true });
    writeFileSync(EMBEDDINGS_PATH, JSON.stringify(store), "utf8");
    return embedded.length;
  } finally {
    await unloadModel({ modelId });
  }
}

// --- answer -----------------------------------------------------------------

function loadStore(): EmbeddingsStore {
  if (!existsSync(EMBEDDINGS_PATH)) {
    throw new Error(
      `glossary embeddings not found at ${EMBEDDINGS_PATH}. Run the ingest step first (npm run rag:ingest).`,
    );
  }
  return JSON.parse(readFileSync(EMBEDDINGS_PATH, "utf8")) as EmbeddingsStore;
}

/**
 * Answer a question grounded in the bundled glossary.
 *
 * Embeds the query, retrieves the top entries by cosine similarity, then asks the
 * LLM to answer using ONLY those entries (guardrail prompt reused). Returns the
 * answer and the citations it was grounded in.
 */
export async function answer(
  query: string,
  options: RagOptions & { onToken?: (t: string) => void } = {},
): Promise<RagAnswer> {
  const question = query.trim();
  if (!question) throw new Error("answer(): query is empty.");

  const store = loadStore();

  // 1. Embed the query with the same model used at ingest time.
  const embedModelId = await loadModel({
    modelSrc: EMBEDDINGGEMMA_300M_Q4_0,
    modelType: "embeddings",
    onProgress: options.onProgress,
  });
  let queryVec: number[];
  try {
    const { embedding } = await embed({ modelId: embedModelId, text: question });
    queryVec = embedding;
  } finally {
    await unloadModel({ modelId: embedModelId });
  }

  // 2. Rank entries by cosine similarity, take the top-k.
  const ranked = store.entries
    .map((e) => ({ entry: e, score: cosine(queryVec, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  const citations: RagCitation[] = ranked.map((r) => ({
    term: r.entry.term,
    source: r.entry.source,
    score: Number(r.score.toFixed(4)),
  }));

  // 3. Build a grounded prompt: answer using ONLY the retrieved entries.
  const context = ranked
    .map((r, i) => `[${i + 1}] ${r.entry.term}\n${r.entry.text}`)
    .join("\n\n");

  const system =
    GUARDRAIL_SYSTEM_PROMPT +
    "\n\nAnswer the user's question using ONLY the numbered reference entries provided. " +
    "Cite the entries you use by their number, like [1]. If the reference entries do not " +
    "contain the answer, say you don't have that information and suggest asking a licensed professional.";

  const history = [
    { role: "system", content: system },
    {
      role: "user",
      content: `Reference entries:\n${context}\n\nQuestion: ${question}`,
    },
  ];

  // 4. Generate the grounded answer.
  const llmId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    modelType: "llm",
    modelConfig: { ctx_size: 4096 },
    onProgress: options.onProgress,
  });

  try {
    const run = completion({
      modelId: llmId,
      history,
      stream: true,
      generationParams: { predict: 512 },
    });

    let text = "";
    for await (const event of run.events) {
      if (event.type === "contentDelta") {
        text += event.text;
        options.onToken?.(event.text);
      }
    }
    text = text.trim();

    if (!text.endsWith(DISCLAIMER)) {
      const tail = `\n\n${DISCLAIMER}`;
      text += tail;
      options.onToken?.(tail);
    }

    return { answer: text, citations };
  } finally {
    await unloadModel({ modelId: llmId });
  }
}
