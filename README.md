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

These steps take a clean machine (Windows, macOS, or Linux) from nothing to a running
app. No prior setup assumed.

### 1. Install the prerequisites

- **Node.js 18 or newer** — download the **LTS** installer from
  [nodejs.org](https://nodejs.org), run it, accept the defaults. This also installs `npm`.
- **Git** (to download the code) — [git-scm.com/downloads](https://git-scm.com/downloads).
  *Or* skip Git and download the project as a ZIP from the GitHub page (green **Code**
  button → **Download ZIP**) and unzip it.
- **Windows only — Microsoft Visual C++ Redistributable (x64).** QVAC's native AI engine
  needs it; most Windows PCs already have it, but on a clean machine the app will fail to
  start the AI worker without it. If you don't have it, install it from
  [aka.ms/vs/17/release/vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)
  and **reboot**. (macOS/Linux need nothing extra.) Also note QVAC's engine is **x64** —
  it does not run on Windows-on-ARM.

### 2. Open a terminal

- **Windows:** press Start, type **PowerShell**, open it.
- **macOS:** open **Terminal** (Cmd+Space → "Terminal").
- **Linux:** your usual terminal.

Verify Node is installed (should print `v18` or higher):

```bash
node --version
```

### 3. Get the code

```bash
git clone https://github.com/Shady-web/VitalLog-App.git
cd VitalLog-App
```

(If you downloaded the ZIP instead, just `cd` into the unzipped `VitalLog-App` folder.)

### 4. Install dependencies

```bash
npm install
```

This pulls `@qvac/sdk` (which ships a prebuilt native runtime — **no compiler or Android/
Xcode tooling needed**) and the TypeScript tools. **On Windows, if this stalls or errors,
see the [Windows note](#windows-note) below — it's a known Defender issue.**

### 5. Start the app

```bash
npm run ui
```

Leave that terminal open (it's the local server). Then open **http://localhost:8787** in
your browser, click **Create an account**, pick any username/password, and sign in. To
stop the app later, press **Ctrl+C** in the terminal.

### 6. First use (please read)

- The **first time you use each feature**, it downloads that AI model once — the language
  model is **~773 MB** (see [Models](#models)). **Keep an internet connection for this
  first run.** After the models are cached, everything runs **fully offline** (airplane
  mode).
- Inference runs **on your CPU**, so the first response after a model loads can take
  several seconds to a minute — that's expected, not a freeze (a progress counter shows).
- **Try it first:** on the **Documents** screen, upload the bundled sample lab image at
  `data/samples/sample-lab.png` or find a random lab test result in your gallery to turn a photo into a plain-language explanation.

### <a name="windows-note"></a>Windows note (important)

On Windows, **Windows Defender real-time scanning locks native binaries as npm writes
them**, making `npm install` crawl and fail with `EIDLETIMEOUT` / `EPERM`. If install
keeps timing out, add Defender exclusions — open PowerShell **as Administrator**
(right-click → "Run as administrator") and run:

```powershell
Add-MpPreference -ExclusionPath "C:\path\to\VitalLog-App"
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\npm-cache"
```

Then re-run `npm install` in a normal terminal. npm caches what it already fetched, so
re-running a few times on a slow connection keeps making progress until it completes.

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
npm run verify                                       # confirm no external/cloud calls (offline proof)
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

## Troubleshooting

The browser only shows a short error; the **terminal running `npm run ui` prints the real
cause** (look for `[sdk:server]` lines). Check there first.

- **"RPC initialization timed out… the worker process may have failed to start"** (or the
  terminal shows `The specified module could not be found` / `Bare worker exited … code=3221226505`)
  — the on-device AI worker couldn't start. Two common causes:
  1. **(Windows) Missing Visual C++ Redistributable.** QVAC's native engine fails to load
     without it. Install [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)
     and **reboot**. Confirm the machine is **x64** (`node -p "process.arch"` should print
     `x64`; QVAC's engine doesn't run on Windows-on-ARM).
  2. **Incomplete `npm install`** (a large `@qvac` native package didn't finish). Fix:
     ```bash
     npm ls @qvac/llm-llamacpp     # should print a version; if "missing"/empty, reinstall
     #   Windows (PowerShell):  Remove-Item -Recurse -Force node_modules ; npm install
     #   macOS/Linux:           rm -rf node_modules && npm install
     ```
     Watch it finish with `added NNN packages` and **no** `npm error`; apply the
     [Defender exclusion](#windows-note) first on Windows.

  An **antivirus** can also block the worker (allow Node), and a one-off retry sometimes
  clears a transient timeout.
- **First click seems to hang / nothing happens** — on a feature's first use it's loading
  (and on the very first run, downloading) the model. CPU inference is slow; give it up to
  a minute. The status shows a progress counter.
- **`Error: listen EADDRINUSE … 8787`** — port 8787 is taken. Run on another port:
  ```bash
  #   Windows (PowerShell):  $env:PORT=8800 ; npm run ui
  #   macOS/Linux:           PORT=8800 npm run ui
  ```
- **Model download stalls / `REQUEST_TIMEOUT` / `403 host_not_allowed`** — you're on a
  restricted network that blocks the model registry/HuggingFace. Do the first run on a
  normal network, then it's offline (see [Models](#models)).
- **`git pull` says "local changes to package.json"** — `npm` rewrote it; discard and pull:
  `git checkout -- package.json && git pull`.

## Reproducibility checklist

1. `node --version` ≥ 18.
2. `npm install` (see the Windows note if it stalls).
3. `npm run ui` → open `http://localhost:8787` → create an account.
4. First use of each feature downloads its model once (network needed for that step only).
5. After models are cached, disable the network — everything still works.
