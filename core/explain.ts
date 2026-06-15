// core/explain.ts — the guardrailed plain-language explainer (VitalLog Phase 1).
//
// A single function that takes a block of text (e.g. a lab result) and returns a
// plain-language explanation. All inference runs locally via @qvac/sdk; no network
// calls happen here once the model is cached on disk.
//
// API surface verified against @qvac/sdk@0.12.2:
//   loadModel({ modelSrc, modelType, onProgress? }) -> Promise<string> (modelId)
//   completion({ modelId, history, stream }) -> CompletionRun ({ text, tokenStream, events, final })
//   unloadModel({ modelId }) -> Promise<void>
import { completion } from "@qvac/sdk";
import { withModel } from "./models.ts";

/**
 * Guardrail system prompt — copied verbatim from section 5 of the build plan.
 * It does the safety work: no diagnosis, no treatment/dosage advice, and every
 * answer ends with the standard disclaimer.
 */
export const GUARDRAIL_SYSTEM_PROMPT = `You are a health information assistant. You explain medical text in plain,
simple language a non-expert can understand. You DO NOT diagnose, DO NOT
recommend treatments or medications, and DO NOT give dosage advice. When
asked for any of those, you say you can't and suggest the user ask a
licensed professional. You only explain terms and what a document says.
Always end with: "This is general information, not medical advice."`;

const DISCLAIMER = "This is general information, not medical advice.";

export interface ExplainOptions {
  /** Stream tokens to this callback as they are generated (e.g. process.stdout.write). */
  onToken?: (token: string) => void;
  /** Report model download progress on first run. */
  onProgress?: (progress: unknown) => void;
  /** Extra task-specific instruction appended to the system prompt (e.g. focus only on test results). */
  guidance?: string;
  /** Reuse this already-loaded LLM id (warm pool) instead of loading/unloading. */
  modelId?: string;
}

/**
 * Explain a block of medical text in plain language, under the safety guardrails.
 *
 * Loads the model, runs one completion grounded only in the supplied text, unloads,
 * and returns the full explanation as a string. Defensively appends the disclaimer
 * if the model omitted it.
 */
export async function explain(
  text: string,
  options: ExplainOptions = {},
): Promise<string> {
  const input = text.trim();
  if (!input) {
    throw new Error("explain(): input text is empty.");
  }

  const system =
    GUARDRAIL_SYSTEM_PROMPT +
    "\n\nWrite in plain, refined prose. Do NOT use markdown, asterisks (*), bold, " +
    "bullet characters, or section headings — just clear sentences." +
    (options.guidance ? `\n\n${options.guidance}` : "");

  const history = [
    { role: "system", content: system },
    {
      role: "user",
      content: `Explain the following in plain language:\n\n${input}`,
    },
  ];

  return withModel("llm", options.modelId, options.onProgress, async (modelId) => {
    // Cap generation so prompt + output stays within the context window.
    const run = completion({
      modelId,
      history,
      stream: true,
      generationParams: { predict: 512 },
    });

    // `run.events` is the canonical consumption API. Accumulate the assistant
    // text from `contentDelta` events (and forward each delta to onToken).
    let answer = "";
    for await (const event of run.events) {
      if (event.type === "contentDelta") {
        answer += event.text;
        options.onToken?.(event.text);
      }
    }
    answer = answer.trim();

    // Guardrail backstop: every output must END WITH the exact disclaimer. Models
    // often paraphrase it, so append the canonical line if missing — and push it
    // through onToken too, so a streaming consumer (the CLI) shows it.
    if (!answer.endsWith(DISCLAIMER)) {
      const tail = `\n\n${DISCLAIMER}`;
      answer = `${answer}${tail}`;
      options.onToken?.(tail);
    }

    return answer;
  });
}
