# VitalLog

A private, on-device health **journal and explainer** — not a diagnostician. All AI
inference runs locally through the [`@qvac/sdk`](https://www.npmjs.com/package/@qvac/sdk);
nothing leaves the device. License: **Apache-2.0**.

> **Status: Phase 1 (SDK bring-up).** Only the QVAC quickstart and the guardrailed
> explainer are implemented. OCR, transcription, RAG, summary, and the UI/Expo app
> are not built yet.

## Requirements

- Node.js 18+ (developed on Node 22).
- Network access **on first run only**, to download the model. After the weights are
  cached locally, everything runs fully offline. See [Model download](#model-download).

## Setup

```bash
npm install
```

This installs `@qvac/sdk` (which ships a prebuilt native Bare runtime — **no compiler /
node-gyp build step is required**) plus the TypeScript toolchain.

## Run the QVAC SDK quickstart

Sanity-checks the SDK end to end: loads `LLAMA_3_2_1B_INST_Q4_0`, runs one streamed
completion, unloads.

```bash
npm run quickstart
# or: node quickstart.mjs
```

## Run the explainer CLI

`core/explain.ts` takes a block of text and returns a plain-language explanation under
the safety guardrails (no diagnosis, no dosage, always ends with the disclaimer).

```bash
# Pass the text as an argument:
npm run explain -- "Hemoglobin A1c: 6.1% (reference 4.0-5.6). LDL: 162 mg/dL (reference <100)."

# Or pipe it on stdin:
echo "TSH: 6.2 mIU/L (reference 0.4-4.0). Free T4: 0.9 ng/dL." | npm run explain

# Or run with no input to use the built-in sample lab result:
npm run explain
```

Type-check without running inference:

```bash
npm run typecheck
```

## Model download

The first `loadModel(LLAMA_3_2_1B_INST_Q4_0)` downloads the GGUF weights
(**~773 MB**, `q4_0`, Llama 3.2 1B Instruct) into the SDK's local cache, then runs
offline thereafter. The SDK fetches from the QVAC model registry over a Hypercore
(Pear) peer-to-peer swarm, with HuggingFace (`unsloth/Llama-3.2-1B-Instruct-GGUF`) as
the upstream source.

> **Restricted networks:** this download needs outbound access to the Pear swarm /
> HuggingFace. In a locked-down sandbox (e.g. a Claude Code web session with a
> restrictive network policy) the download can fail with `REQUEST_TIMEOUT` or
> `403 host_not_allowed`. Run the verification on a normal network for the first
> fetch; subsequent runs work offline from cache.

## Safety & scope

VitalLog organizes, explains, and defers to professionals. It does not diagnose or
recommend treatments/medications. Every explanation ends with:
*"This is general information, not medical advice."*
