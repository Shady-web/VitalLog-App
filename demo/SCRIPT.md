# VitalLog — Demo Video Script (~2.5 min)

Goal: show that a useful health companion runs **entirely on the device** — the
airplane-mode shot is the strongest proof. Record the screen with the network visibly
off the whole time.

**Before recording:** run the app once on a normal network so all models are cached
(`npm run ui`, then exercise Documents, Ask, Journal, Summary once). Then disconnect.

---

### 0:00–0:20 — Hook + the offline proof
- On camera, **turn off Wi-Fi / enable airplane mode** (show the system toggle).
- Voiceover: *"Your health data is the most private data you have. VitalLog runs entirely
  on this machine — no cloud, no network. Watch — I'm turning the network off now, and
  everything you'll see runs locally."*
- Open `http://localhost:8787`. Show the clean login screen.

### 0:20–0:35 — Sign in (private, on-device accounts)
- Create an account / sign in. Voiceover: *"Accounts and journals are stored locally and
  kept private to each person — nothing leaves the device."*

### 0:35–1:05 — Journal (voice → transcript)
- Go to **Journal**, record a short voice note: *"I've had a headache and dizziness for
  the past three days."*
- Show it transcribed on-device and saved to the journal list. Voiceover: *"Speech-to-text,
  running locally."*

### 1:05–1:45 — Documents (photo → plain-language explanation)
- Go to **Documents**, upload a photo of a lab result.
- Show the staged status ("Extracting text…" → "Generating explanation…"), then the
  **plain-language summary of what the results mean** (e.g. "your hemoglobin is a little
  low, your fasting blood sugar is slightly above the normal range…").
- Voiceover: *"It reads the document and explains what the results mean in plain language —
  all on-device."*

### 1:45–2:05 — Guardrail moment (a feature, not a limitation)
- Go to **Ask**, type: *"What medication should I take for this?"*
- Show it **decline** and suggest consulting a licensed professional. Pause on it.
- Voiceover: *"It won't diagnose or recommend medication — by design. It explains and
  defers to professionals."*

### 2:05–2:30 — Doctor-ready summary + close
- Go to **Summary**, tap **Generate summary** → show the one-pager (symptom timeline,
  medications, questions for the doctor). Mention **Print / save as PDF**.
- Voiceover: *"And it pulls everything into a one-pager to bring to an appointment."*
- End on the airplane-mode indicator still on: *"Still offline. Nothing left this device.
  Powered entirely by the QVAC SDK."*

---

### Notes
- Keep the airplane-mode/network-off indicator visible throughout — it is the proof.
- The persistent **"Not medical advice"** banner is visible on every screen; let it show.
- If recording the phone instead: same flow over LAN, but do the voice-recording step on
  the desktop (browser mic needs localhost/HTTPS).
