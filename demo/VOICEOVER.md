# VitalLog — Demo voiceover script (~3 min)

Paste the **Narration** block below straight into your text-to-speech / voice model. It's
clean spoken text only (no stage directions), about 3 minutes at a calm pace (~150 wpm).
The **Sync guide** after it maps each paragraph to what to show on screen.

> Voice direction for the TTS: calm, warm, trustworthy, unhurried — it's a health app.
> Let it breathe; don't rush.

---

## Narration (paste this into the voice model)

Your health data is the most private information you own. Your symptoms. Your lab results. The medications you take. And yet almost every health app sends all of it to the cloud. VitalLog is different. It's a private health journal and explainer that runs entirely on your own device. And to prove that nothing leaves this machine, I'm going to turn on airplane mode — right now. No Wi-Fi. No signal. No connection of any kind. Everything you're about to see runs locally, on this device, powered by the QVAC SDK.

Let's start. VitalLog keeps each person's journal in a private account that stays on the device, so I'll sign in.

The first thing I can do is keep a journal — just by speaking. I'll record how I'm feeling. "I've had a headache and some dizziness for the past three days." In a moment, that's transcribed right here on the device — no audio ever uploaded — and saved to my journal.

Now, documents. Most of us have stared at a lab result we couldn't make sense of. So let me upload a photo of one. VitalLog reads the text directly from the image, and then explains what the results actually mean, in plain language — telling me that my hemoglobin is a little low, and my fasting blood sugar is slightly above the normal range. Not a wall of numbers — an explanation. And again, all of it happens locally.

I can also simply ask a question. "What does LDL cholesterol mean?" I get a clear, simple answer, grounded in a trusted medical reference that's bundled with the app — not invented by the model. But here is the most important part. Watch what happens when I ask it to cross a line. "What medication should I take?" It declines — and points me to a licensed professional. That is by design. VitalLog explains and organizes; it never diagnoses, and it never recommends treatment. And that reminder stays visible on every single screen.

Finally, the feature I'd genuinely use. With a single tap, VitalLog turns everything in my journal into a doctor-ready summary — a timeline of my symptoms, the medications I've mentioned, and a list of questions to bring to my next appointment. Something I can print out, or hand straight to my doctor.

And remember — this entire time, we've stayed in airplane mode. Nothing has left this device. No cloud. No servers. No tracking. Just a calm, private health companion that works completely offline, powered end to end by the QVAC SDK.

That's VitalLog. Your health, kept exactly where it belongs — with you.

---

## Sync guide (what to show under each paragraph)

1. **Intro** — slow pan of the app/login screen; on "airplane mode — right now," toggle airplane mode **on camera** and leave the indicator visible for the rest of the video.
2. **Sign in** — the login screen → create/sign in → land on Journal.
3. **Journal** — tap record, speak the symptom line, show it transcribed and saved under "Your entries."
4. **Documents** — upload a lab photo (e.g. `data/samples/sample-lab.png`); show "Extracting text…" then the plain-language explanation appearing.
5. **Ask + guardrail** — type the LDL question, show the answer; then type "What medication should I take?" and let the refusal sit on screen for a beat. Point to the "Not medical advice" banner.
6. **Summary** — the Summary screen, tap Generate, show the one-pager; hover the Print button.
7. **Close** — end on the airplane-mode indicator still on.

### Tips
- Pre-cache the models on a normal network **before** recording, so each step responds
  quickly while you're offline.
- If a step takes a few seconds (CPU inference), trim the dead time in editing so the
  voiceover stays tight — or let the narration cover it.
- Keep total length ~2.5–3.5 min; trim pauses to match the narration.
