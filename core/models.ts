// core/models.ts — model specifications + a warm-model pool.
//
// Loading a model takes several seconds, so the server keeps models resident between
// requests (a "warm pool") instead of unloading after every call. The CLI still loads
// and unloads per run by not passing a warm modelId.
//
// All model specs live here so the descriptors/configs are defined once.
import {
  loadModel,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
  EMBEDDINGGEMMA_300M_Q4_0,
  OCR_LATIN_RECOGNIZER_1,
  WHISPER_EN_BASE_Q8_0,
} from "@qvac/sdk";

export type ModelKey = "llm" | "embeddings" | "ocr" | "whisper";
export type ProgressFn = (progress: unknown) => void;

// Each loader is a direct, fully-typed loadModel call (the same config the core
// modules previously used inline).
const LOADERS: Record<ModelKey, (onProgress?: ProgressFn) => Promise<string>> = {
  llm: (onProgress) =>
    loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0, modelType: "llm", modelConfig: { ctx_size: 4096 }, onProgress }),
  embeddings: (onProgress) =>
    loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q4_0, modelType: "embeddings", onProgress }),
  ocr: (onProgress) =>
    loadModel({
      modelSrc: OCR_LATIN_RECOGNIZER_1,
      modelType: "ocr",
      modelConfig: { langList: ["en"], useGPU: false, recognizerBatchSize: 1 },
      onProgress,
    }),
  whisper: (onProgress) =>
    loadModel({
      modelSrc: WHISPER_EN_BASE_Q8_0,
      modelType: "whisper",
      modelConfig: { language: "en", contextParams: { use_gpu: false } },
      onProgress,
    }),
};

// Warm pool: load each model once and reuse its id. The promise is cached so
// concurrent first-callers share a single load.
const warm = new Map<ModelKey, Promise<string>>();

export function getWarmModel(key: ModelKey, onProgress?: ProgressFn): Promise<string> {
  let p = warm.get(key);
  if (!p) {
    p = LOADERS[key](onProgress).catch((err) => { warm.delete(key); throw err; });
    warm.set(key, p);
  }
  return p;
}

export async function unloadAllWarm(): Promise<void> {
  const loading = [...warm.values()];
  warm.clear();
  for (const p of loading) {
    try { await unloadModel({ modelId: await p }); } catch { /* best effort */ }
  }
}

/**
 * Run `fn` with a model of the given key. When `provided` (a warm modelId) is given,
 * reuse it and do not unload. Otherwise load a one-off model and unload it afterwards.
 */
export async function withModel<T>(
  key: ModelKey,
  provided: string | undefined,
  onProgress: ProgressFn | undefined,
  fn: (modelId: string) => Promise<T>,
): Promise<T> {
  if (provided) return fn(provided);
  const modelId = await LOADERS[key](onProgress);
  try {
    return await fn(modelId);
  } finally {
    await unloadModel({ modelId });
  }
}
