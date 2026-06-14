# VitalLog

A private, on-device health **journal and explainer** — not a diagnostician. All AI
inference runs locally through the [`@qvac/sdk`](https://www.npmjs.com/package/@qvac/sdk);
nothing leaves the device. License: **Apache-2.0**.

> **Status: Phase 2 (core modules).** The shared `core/` logic is built and runs from a
> CLI: explain, OCR, transcription, grounded RAG, and the doctor-ready summary. The UI
> and the Expo phone port are intentionally **not built yet** (next phase).

## What works today

| Command | Module | What it does |
|---|---|---|
| `npm run quickstart` | — | SDK sanity check: load LLM, one streamed completion, unload |
| `npm run explain -- "<text>"` | `core/explain.ts` | Plain-language explanation of medical text, under safety guardrails |
| `npm run ocr -- <image>` | `core/ocr.ts` | Photo of a lab result/label → extracted text → explanation |
| `npm run transcribe -- <audio>` | `core/transcribe.ts` | Voice note → transcript, saved as a journal entry |
| `npm run rag:ingest` | `core/rag.ts` | Embed the bundled glossary into a local vector store (one-time) |
| `npm run rag -- "<question>"` | `core/rag.ts` | Answer grounded in the glossary, with citations |
| `npm run summary` | `core/summary.ts` | Doctor-ready one-pager from saved journal entries |
| `npm run typecheck` | — | Type-check the `core/` modules without running inference |

Every model-backed output ends with: *"This is general information, not medical advice."*

## Requirements

- Node.js 18+ (developed on Node 22/24).
- Network access **on first run only**, to download each model. After the weights are
  cached locally, everything runs **fully offline**. See [Models](#models).

## Setup

```bash
npm install
```

This installs `@qvac/sdk` (which ships a prebuilt native Bare runtime — **no compiler /
node-gyp build step is required**) plus the TypeScript toolchain (`tsx`, `typescript`).
No database or other runtime dependency: the journal and the glossary vector store are
plain JSON on disk.

### Windows note (important)

On Windows, **Windows Defender real-time scanning locks the native binaries as npm
writes them**, which makes `npm install` crawl and fail with `EIDLETIMEOUT` /
`EPERM` cleanup errors. If `npm install` keeps timing out, add Defender exclusions for
the project and the npm cache (run PowerShell **as Administrator**):

```powershell
Add-MpPreference -ExclusionPath "C:\path\to\VitalLog-App"
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\npm-cache"
```

Then re-run `npm install` in a normal terminal. npm caches what it already fetched, so
re-running a few times on a slow connection makes progress each time.

## Usage

```bash
# 1. Sanity-check the SDK end to end
npm run quickstart

# 2. Explain a block of lab text (arg, stdin, or built-in sample)
npm run explain -- "Hemoglobin A1c: 6.1% (reference 4.0-5.6). LDL: 162 mg/dL (reference <100)."
echo "TSH: 6.2 mIU/L (reference 0.4-4.0)." | npm run explain

# 3. Photo -> text -> explanation (a sample image is bundled)
npm run ocr -- data/samples/sample-lab.png

# 4. Voice note -> transcript -> journal entry (.mp3 .m4a .ogg .wav .flac .aac)
npm run transcribe -- "/path/to/voice-note.m4a"

# 5. Grounded glossary Q&A (ingest once, then ask)
npm run rag:ingest
npm run rag -- "What does LDL cholesterol mean and is 162 high?"

# 6. Doctor-ready one-pager from saved journal entries
npm run summary
```

On Windows/PowerShell, keep the space after `--` and quote paths:
`npm run transcribe -- "C:\Users\you\Music\note.m4a"`.

## Models

All models load via `@qvac/sdk` and are cached locally after the first download, then
run offline. Each `core/` module pins a specific model constant:

| Task | Constant | Approx. size (first download) |
|---|---|---|
| Completion (explain / rag / summary) | `LLAMA_3_2_1B_INST_Q4_0` | ~773 MB |
| OCR (recognizer + auto CRAFT detector) | `OCR_LATIN_RECOGNIZER_1` | ~98 MB total |
| Transcription (English) | `WHISPER_EN_BASE_Q8_0` | ~82 MB |
| Embeddings (RAG) | `EMBEDDINGGEMMA_300M_Q4_0` | ~278 MB |

> **Restricted networks:** the first download of each model needs outbound access to
> the QVAC model registry (Pear/Hypercore swarm) and/or HuggingFace / S3. In a
> locked-down sandbox (e.g. a Claude Code web session with a restrictive network policy)
> it can fail with `REQUEST_TIMEOUT` or `403 host_not_allowed`. Do the first run on a
> normal network; afterwards everything works offline from cache.

## Data & privacy

- **Journal:** `data/journal/entries.json` — your voice transcripts and notes. Private
  health data; **gitignored**, never committed.
- **Glossary (bundled reference):** `data/reference/*.md` — plain-language definitions of
  common lab terms, used to ground RAG answers. Tracked in git.
- **Embeddings:** `data/embeddings/glossary.json` — regenerable vector store from
  `rag:ingest`; gitignored.
- Model weight files (`*.gguf`, `*.onnx`) and the SDK cache (`.qvac/`) are gitignored.

The bundled glossary is **original text** written for this project; the underlying facts
are based on public-domain consumer-health information from the U.S. National Library of
Medicine (MedlinePlus / NIH).

## Safety & scope

VitalLog organizes, explains, and defers to professionals. It does **not** diagnose or
recommend treatments, medications, or dosages — when asked to, it declines and suggests
consulting a licensed professional. RAG answers are grounded in the bundled glossary and
cite the entries they used. Every model-backed output ends with:
*"This is general information, not medical advice."*
