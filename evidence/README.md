# Evidence bundle

The hackathon requires a **3-stage verification evidence bundle**. This folder is the
structure to drop your captures into.

> ⚠️ Confirm the **exact required contents** on the hackathon's "more info" link — the
> three stages below are a sensible interpretation, adjust to match their spec.

- `stage-1-build/` — proof it installs/builds on a clean machine.
- `stage-2-run/` — proof it runs and works **offline** (network off).
- `stage-3-verify/` — proof it's reproducible + the safety guardrails fire.

Each subfolder's README says what to put in it. Most of it is screenshots / a short screen
recording plus the output of `npm run verify` and `npm run typecheck`.
