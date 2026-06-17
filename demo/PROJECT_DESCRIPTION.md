# VitalLog — DoraHacks submission copy

Ready-to-paste text for the BUIDL submission form.

---

## Tagline (one line)

A private health journal and explainer that runs entirely on your device — log
symptoms by voice, understand your lab results in plain language, and generate a
doctor-ready summary, all 100% offline via the QVAC SDK.

## Short description

VitalLog is a personal health companion that keeps your most sensitive data where it
belongs — on your own device. It does three things: **log** symptoms by voice
(transcribed locally), **understand** your medical documents like lab results and
medication labels (read with on-device OCR and explained in plain language), and
**summarize** everything into a clean, doctor-ready one-pager to bring to an
appointment.

Every bit of AI — speech-to-text, OCR, the language model, and the embeddings that
ground its answers — runs locally through the **`@qvac/sdk`**. Nothing leaves the
device, there are no cloud calls, and the whole app works in **airplane mode**. That
offline guarantee isn't a feature bolted on; it's the entire point. Your health data is
the most private data you have.

VitalLog is deliberately a **journal and explainer, not a diagnostician**. It never
diagnoses, never recommends a treatment or a dose — ask it to and it declines and points
you to a licensed professional. A persistent "Not medical advice" notice is on every
screen, answers are grounded in a bundled, license-clean medical glossary, and every
output ends with "This is general information, not medical advice."

## How it uses QVAC

- **Transcription** (Whisper) — voice notes → text, on-device.
- **OCR** (ONNX) — a photo of a lab result/label → text, in the background.
- **Completion** (Llama 3.2 1B) — plain-language explanations and the doctor-ready summary.
- **Embeddings** (EmbeddingGemma) — retrieval over a bundled medical reference so answers
  are grounded, not hallucinated.

All four load and run via `@qvac/sdk`. Run `npm run verify` to confirm the source makes
no external/cloud calls.

## Tech & highlights

- Shared `core/` logic over `@qvac/sdk`, a dependency-free local web app (Node + vanilla
  HTML/CSS/JS), and a work-in-progress on-device Android port (Expo + react-native-bare-kit).
- No database, no cloud, no CDN, no web fonts, no analytics — bundled locally for true offline.
- Private local accounts (salted password hashes); each person's journal stays on-device.
- Apache-2.0. Bundled glossary is original text based on public-domain NIH/MedlinePlus facts.

## Built for

QVAC Hackathon I — Unleash Edge AI. The demo runs in airplane mode from start to finish.
