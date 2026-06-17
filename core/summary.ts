// core/summary.ts — build a doctor-ready one-pager from stored journal entries.
//
// Reads the local JSON journal (core/store.ts) and asks the LLM to organize the
// entries into a structured summary: symptom timeline, current medications, and
// questions to ask the doctor. Reuses the guardrail prompt (no diagnosis/dosage).
// Fully offline, SDK-only (completion is already verified in explain.ts/rag.ts).
import { completion } from "@qvac/sdk";
import { getEntries, type JournalEntry } from "./store.ts";
import { GUARDRAIL_SYSTEM_PROMPT } from "./explain.ts";
import { withModel } from "./models.ts";

const DISCLAIMER = "This is general information, not medical advice.";

export interface SummaryOptions {
  onToken?: (t: string) => void;
  onProgress?: (progress: unknown) => void;
  /** Read entries from this journal file instead of the default (used for per-user journals). */
  journalPath?: string;
  /** Reuse this already-loaded LLM id (warm pool) instead of loading/unloading. */
  modelId?: string;
}

function formatEntries(entries: JournalEntry[]): string {
  return entries
    .map((e) => {
      const date = e.timestamp.slice(0, 10);
      return `- [${date}] (${e.type}) ${e.text}`;
    })
    .join("\n");
}

/**
 * Produce a doctor-ready one-pager from the journal. Returns the report text.
 * Throws if the journal is empty (nothing to summarize).
 */
export async function summarize(options: SummaryOptions = {}): Promise<string> {
  const entries = getEntries(options.journalPath);
  if (entries.length === 0) {
    throw new Error(
      "No journal entries found. Add some first, e.g. `npm run transcribe -- <audio>`.",
    );
  }

  const system =
    GUARDRAIL_SYSTEM_PROMPT +
    "\n\nYou are preparing a concise, doctor-ready summary from the patient's personal " +
    "health journal below. Use ONLY the journal entries; do not invent details. " +
    "Organize the output into exactly these three sections with these headings:\n" +
    "1. Symptom Timeline — bullet points with dates and what the person reported.\n" +
    "2. Current Medications — list any medications mentioned; if none are mentioned, " +
    "write \"None recorded.\"\n" +
    "3. Questions for the Doctor — 3 to 5 suggested questions based on the entries.\n" +
    "Do not diagnose and do not recommend treatments or dosages.";

  const history = [
    { role: "system", content: system },
    { role: "user", content: `Journal entries:\n${formatEntries(entries)}` },
  ];

  return withModel("llm", options.modelId, options.onProgress, async (modelId) => {
    const run = completion({
      modelId,
      history,
      stream: true,
      generationParams: { predict: 700 },
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

    return text;
  });
}
