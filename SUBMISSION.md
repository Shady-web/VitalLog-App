# VitalLog — Submission Checklist (QVAC Hackathon I)

Deadline: **June 22, 2026, 00:59 (GMT+8)** · Submit the BUIDL on the DoraHacks page.

## DoraHacks requirements

- [x] **Public repo**, Apache-2.0 — see `LICENSE`.
- [x] **README** with setup + reproducibility — see `README.md` (Quick start + Reproducibility checklist).
- [ ] **Demo video** — record per `demo/SCRIPT.md` (airplane-mode desktop run), then add the link below.
- [x] **All inference via `@qvac/sdk`** — no external AI/APIs (see [Verification](#verification)).
- [ ] **3-stage verification evidence bundle** — assemble in `evidence/` (confirm exact required contents on the hackathon "more info" page).
- [ ] **Joined QVAC Discord.**
- [ ] **BUIDL submitted on DoraHacks** before the deadline.

## Links (fill in before submitting)

- Repository: `https://github.com/Shady-web/VitalLog-App`
- Demo video: `<paste link>`
- DoraHacks BUIDL: `<paste link>`

## Verification

**All AI runs through `@qvac/sdk`, locally.** Every model call goes through `core/`,
which only ever imports from `@qvac/sdk`:

```bash
# No external AI SDKs / HTTP AI calls in the source:
grep -rIn "openai\|anthropic\|googleapis\|api\.\|http" core/ app-node/*.ts | grep -vi "@qvac"
```

The only network the app needs is the **one-time model download** per model; after that it
runs with the network off (the demo records this in airplane mode). The web server binds
to `localhost` and makes no outbound calls itself.

**Models used** (all via QVAC): `LLAMA_3_2_1B_INST_Q4_0`, `WHISPER_EN_BASE_Q8_0`,
`OCR_LATIN_RECOGNIZER_1` (+ CRAFT detector), `EMBEDDINGGEMMA_300M_Q4_0`. See README.

**License:** Apache-2.0. The bundled glossary (`data/reference/`) is original text based
on public-domain NIH/MedlinePlus facts — no third-party copyrighted content is shipped.

## 3-stage evidence bundle (template)

> Confirm the exact required contents from the hackathon's "more info" link, then fill in.
> Suggested structure under `evidence/`:

```
evidence/
├── stage-1-build/      # proof it builds/installs: install log, `npm run typecheck` output
├── stage-2-run/        # proof it runs offline: screen recording / screenshots with network OFF,
│                       #   one capture per feature (Journal, Documents, Ask, Summary)
└── stage-3-verify/     # reproducibility: the README steps reproduced on a clean machine,
                        #   plus the guardrail-refusal capture (asks-for-dosage -> declines)
```

## Pre-submit pass

1. `npm install` on a clean checkout succeeds (Windows: Defender exclusion per README).
2. `npm run ui` → create account → each feature works.
3. Disconnect the network → re-run each feature → still works (record this).
4. Demo video recorded and uploaded; links pasted above.
5. Evidence bundle assembled per the hackathon's exact spec.
6. BUIDL submitted on DoraHacks before the deadline.
