# VitalLog — a private, on-device health journal &amp; explainer

VitalLog helps a person **log** symptoms by voice, **understand** their own medical
documents in plain language, and **summarize** everything into a doctor-ready one-pager —
with **all AI running locally on the device** through the
[`@qvac/sdk`](https://www.npmjs.com/package/@qvac/sdk). No cloud, no accounts in the
cloud, no network calls during use. The whole app works in **airplane mode**.

It is a **journal and explainer, not a diagnostician**: it organizes, explains, and
defers to professionals. Every AI output ends with *"This is general information, not
medical advice."*

**License:** Apache-2.0 · **Built for:** QVAC Hackathon I — Unleash Edge AI

---

## Why it matters

Your health data is the most private data you have. VitalLog keeps it on your machine:
the language model, the speech-to-text, the OCR, and the embeddings all run locally via
QVAC. Once the models are cached, you can turn off Wi-Fi and everything still works —
that offline guarantee is the whole point.

## What it does

| Feature | How | QVAC capability |
|---|---|---|
| **Journal** — log a symptom by voice | record/upload audio → transcribed on-device → saved to your private journal | Transcription (Whisper) |
| **Documents** — understand a lab result/label | snap/upload a photo → text extracted in the background → plain-language summary of what the results mean | OCR (ONNX) + Completion (Llama 3.2) |
| **Ask** — what does this term/result mean? | type a question → answer grounded in a bundled medical reference | Embeddings + Completion (RAG) |
| **Summary** — doctor-ready one-pager | one tap → symptom timeline, current medications, questions for the doctor | Completion |

Plus: **local accounts** (each person's journal is private to them), a persistent
**"Not medical advice"** safety banner on every screen, and **guardrail refusals** — ask
it to diagnose or recommend a dose and it declines and points you to a professional.

---

## Quick start (desktop web app)

Requires **Node.js 18+** (developed on 22/24). First run downloads the models once; after
that it's fully offline.

```bash
npm install
npm run ui
```

Then open **http://localhost:8787**, click **Create an account**, and you're in.

> The first time you use each feature it downloads that model once (see
> [Models](#models)); keep a network connection for that first run, then it works offline.

### Windows note (important)

On Windows, **Windows Defender real-time scanning locks native binaries as npm writes
them**, making `npm install` crawl and fail with `EIDLETIMEOUT` / `EPERM`. If install
keeps timing out, add Defender exclusions (run PowerShell **as Administrator**):

```powershell
Add-MpPreference -ExclusionPath "C:\path\to\VitalLog-App"
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\npm-cache"
```

Then re-run `npm install` — npm caches what it fetched, so re-running makes progress.

### View it on your phone (same Wi-Fi)

With `npm run ui` running, find your PC's LAN IP (`ipconfig` → IPv4) and open
`http://<that-ip>:8787` on your phone. (Voice recording needs `localhost`/HTTPS, so use it
on the PC; upload/ask/summary/documents work over LAN.)

---

## Command-line interface (for testing the core modules)

The same `core/` logic the UI uses is also runnable from a CLI:

```bash
npm run quickstart                                   # SDK sanity check
npm run explain -- "Hemoglobin: 11.2 g/dL (ref 13.5-17.5). LDL: 162 mg/dL (ref <100)."
npm run ocr -- data/samples/sample-lab.png           # image -> text -> explanation
npm run transcribe -- "/path/to/voice-note.m4a"      # audio -> transcript -> journal
npm run rag:ingest                                   # embed the glossary once
npm run rag -- "What does LDL cholesterol mean?"     # grounded answer
npm run summary                                      # doctor-ready one-pager
npm run typecheck                                    # type-check core/ + app-node/
```

On PowerShell, keep the space after `--` and quote paths.

---

## Architecture

```
core/        Runtime-agnostic AI logic over @qvac/sdk (no UI):
             explain · ocr · transcribe · rag · summary · models (warm pool) · store
app-node/    Desktop web app: a dependency-free Node HTTP server + vanilla HTML/CSS/JS
             UI, wired to core/. Local accounts, NDJSON token streaming, Seed styling.
app-expo/    Mobile (Android) port — on-device bring-up via react-native-bare-kit. WIP.
data/        reference/ (bundled glossary, tracked) · journal/ embeddings/ uploads/ (private, gitignored)
```

- **No framework, no CDN, no web fonts, no analytics.** The web UI is plain HTML/CSS/JS
  served locally; styling uses a system-font design system (Refero "Seed"). Nothing is
  fetched at runtime — required for the offline guarantee.
- **No database.** Accounts, journals, and the glossary vector store are JSON on disk.
- **Warm models.** The server loads each model once and reuses it across requests, so
  only the first request pays the load cost.

## Models

All load via `@qvac/sdk`, cached locally after first download, then run offline:

| Task | Model constant | Approx. first download |
|---|---|---|
| Completion (explain / ask / summary) | `LLAMA_3_2_1B_INST_Q4_0` | ~773 MB |
| Transcription (English) | `WHISPER_EN_BASE_Q8_0` | ~82 MB |
| OCR (recognizer + auto CRAFT detector) | `OCR_LATIN_RECOGNIZER_1` | ~98 MB |
| Embeddings (RAG) | `EMBEDDINGGEMMA_300M_Q4_0` | ~278 MB |

> **Restricted networks:** first-run model downloads need outbound access to the QVAC
> registry (Pear/Hypercore) and/or HuggingFace/S3. On a locked-down network they can fail
> with `REQUEST_TIMEOUT` / `403 host_not_allowed`. Do the first run on a normal network;
> everything is offline afterward.

## Data &amp; privacy

- **Accounts:** `data/store/accounts.json` — salted **scrypt** password hashes (Node
  `crypto`, no external auth). Gitignored.
- **Journal:** `data/journal/<userId>/entries.json` — each account's private entries.
  Gitignored.
- **Glossary (tracked):** `data/reference/*.md` — plain-language lab-term definitions
  used to ground answers. **Original text** written for this project; facts based on
  public-domain U.S. National Library of Medicine (MedlinePlus / NIH) material.
- **Embeddings / uploads:** `data/embeddings/`, `data/uploads/` — regenerable / transient,
  gitignored. Model weights (`*.gguf`, `*.onnx`) and the SDK cache (`.qvac/`) are gitignored.

## Safety &amp; scope

VitalLog explains and organizes; it does **not** diagnose or recommend treatments,
medications, or dosages. When asked to, it declines and suggests a licensed professional.
A persistent **"Not medical advice — consult a licensed professional"** banner is on every
screen, and every model-backed output ends with *"This is general information, not medical
advice."* This is local demo software, not a medical device.

## Mobile (Expo) — work in progress

`app-expo/` is an Android port that runs QVAC **on the phone** via
`react-native-bare-kit` (for the airplane-mode phone demo). It builds via EAS and is at
the bring-up stage; see `app-expo/README.md`. The desktop app above is the primary,
fully-working build.

## Reproducibility checklist

1. `node --version` ≥ 18.
2. `npm install` (see the Windows note if it stalls).
3. `npm run ui` → open `http://localhost:8787` → create an account.
4. First use of each feature downloads its model once (network needed for that step only).
5. After models are cached, disable the network — everything still works.
