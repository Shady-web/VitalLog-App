// core/transcribe.ts — transcribe an audio file to text via QVAC Whisper, fully offline.
//
// API + load pattern verified against the SDK's own example
// (node_modules/@qvac/sdk/dist/examples/transcription/whispercpp-filesystem.js) and the
// installed 0.12.2 types:
//   loadModel({ modelSrc: WHISPER_TINY, modelType: "whisper", modelConfig }) -> modelId
//   transcribe({ modelId, audioChunk }) -> Promise<string>   (full transcript)
//   unloadModel({ modelId })
// Supported audio inputs (SUPPORTED_AUDIO_FORMATS): .mp3 .m4a .ogg .wav .flac .aac .raw
import { transcribe as runTranscribe } from "@qvac/sdk";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { addEntry, type JournalEntry } from "./store.ts";
import { withModel } from "./models.ts";

export interface TranscribeOptions {
  /** Report model download progress on first run. */
  onProgress?: (progress: unknown) => void;
  /** Reuse this already-loaded Whisper id (warm pool) instead of loading/unloading. */
  modelId?: string;
}

/** Transcribe an audio file and return the transcript text (no storage side effect). */
export async function transcribeFile(
  audioPath: string,
  options: TranscribeOptions = {},
): Promise<string> {
  const absPath = resolve(audioPath);
  if (!existsSync(absPath)) {
    throw new Error(`transcribeFile(): audio file not found: ${absPath}`);
  }

  return withModel("whisper", options.modelId, options.onProgress, async (modelId) => {
    // Without `metadata: true`, transcribe resolves to the full transcript string.
    const transcript = await runTranscribe({ modelId, audioChunk: absPath });
    return transcript.trim();
  });
}

/**
 * Transcribe an audio file and save the transcript as a "voice" journal entry on disk.
 * Returns the stored entry (with its assigned id/timestamp).
 */
export async function transcribeToJournal(
  audioPath: string,
  options: TranscribeOptions = {},
): Promise<JournalEntry> {
  const text = await transcribeFile(audioPath, options);
  return addEntry({ type: "voice", text, source: resolve(audioPath) });
}
