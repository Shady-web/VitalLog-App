# Stage 3 — Verify / reproduce

Show that someone else can reproduce it and that the safety guardrails work. Capture:

- [ ] The README Quick Start reproduced (ideally on a different/clean machine) — a short
  note or screenshots confirming the steps work as written.
- [ ] **Guardrail refusal:** on the **Ask** screen, ask something like *"What medication
  should I take for this?"* and capture the app **declining** and pointing to a
  professional. (This is a feature — show it on purpose.)
- [ ] The persistent **"Not medical advice"** banner visible on a screen.
- [ ] `npm run verify` output showing **PASS** (no external/cloud calls).

Save screenshots / logs here.
