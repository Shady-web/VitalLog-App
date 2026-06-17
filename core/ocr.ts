// core/ocr.ts — extract text from an image (lab result / medication label) via QVAC OCR.
//
// All inference runs locally through @qvac/sdk; offline once the OCR models are cached.
//
// API + load pattern verified against the SDK's own example
// (node_modules/@qvac/sdk/dist/examples/ocr-fasttext.js) and the installed 0.12.2 types:
//   loadModel({ modelSrc: OCR_LATIN_RECOGNIZER_1, modelType: "ocr", modelConfig }) -> modelId
//   ocr({ modelId, image, options }) -> { blocks: Promise<OCRTextBlock[]>, ... }
//   unloadModel({ modelId, clearStorage: false })
// The CRAFT text detector (OCR_CRAFT_DETECTOR) is selected automatically by the
// onnx-ocr plugin when modelSrc is a registry recognizer, so we don't pass it explicitly.
import { ocr as runOcr } from "@qvac/sdk";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { withModel } from "./models.ts";

export interface OcrOptions {
  /** Report model download progress on first run. */
  onProgress?: (progress: unknown) => void;
  /** Reuse this already-loaded OCR id (warm pool) instead of loading/unloading. */
  modelId?: string;
}

/**
 * Run OCR on an image file and return the extracted text (text blocks joined by newlines).
 *
 * Loads the Latin recognizer (+ CRAFT detector), recognizes, unloads. First run downloads
 * ~98 MB of OCR models; offline thereafter.
 */
export async function extractText(
  imagePath: string,
  options: OcrOptions = {},
): Promise<string> {
  const absPath = resolve(imagePath);
  if (!existsSync(absPath)) {
    throw new Error(`extractText(): image file not found: ${absPath}`);
  }

  return withModel("ocr", options.modelId, options.onProgress, async (modelId) => {
    const { blocks } = runOcr({
      modelId,
      image: absPath,
      options: { paragraph: false },
    });
    const result = await blocks;
    return result
      .map((b) => b.text)
      .join("\n")
      .trim();
  });
}
