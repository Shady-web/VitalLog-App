// VitalLog UI logic — vanilla JS, no dependencies. Talks to the local server,
// which runs all inference through core/ -> @qvac/sdk. No network calls leave the box.
"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function spinner(text) {
  return `<div class="status"><span class="spinner"></span>${esc(text)}</div>`;
}
function errorBox(msg) {
  return `<div class="alert alert-danger" style="margin-top:var(--s-3)"><svg><use href="#i-warn"/></svg><div>${esc(msg)}</div></div>`;
}
function infoBox(msg) {
  return `<div class="alert alert-info" style="margin-top:var(--s-3)"><svg><use href="#i-shield"/></svg><div>${esc(msg)}</div></div>`;
}

// Strip markdown markers so the explanation reads as clean prose (no asterisks/headings).
function cleanText(s) {
  return s
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "");
}

// Animated loading status: a counter that climbs 0 -> 96% while a stage runs, snaps
// to 100% when finished. The label can change between stages (e.g. extracting -> generating).
function makeProgress(el) {
  let timer = null, val = 0, label = "";
  const render = () => {
    el.innerHTML = `<div class="status"><span class="spinner"></span>${esc(label)} <span class="pct">${Math.round(val)}%</span></div>`;
  };
  return {
    start(l) { label = l; val = 0; clearInterval(timer); render(); timer = setInterval(() => { val += Math.max(0.5, (96 - val) * 0.04); if (val > 96) val = 96; render(); }, 160); },
    label(l) { label = l; render(); },
    finish() { clearInterval(timer); timer = null; val = 100; render(); },
    clear() { clearInterval(timer); timer = null; el.innerHTML = ""; },
  };
}

// ---- NDJSON streaming reader ----
async function streamPost(url, { body, headers } = {}, onEvent) {
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.body) {
    const data = await res.json().catch(() => ({}));
    if (data.error) onEvent({ type: "error", message: data.error });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf.trim()));
}

// ---- tabs ----
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", "false"));
    tab.setAttribute("aria-selected", "true");
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#screen-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "journal") loadJournal();
  });
});

// ====================================================================
// JOURNAL
// ====================================================================
const journalList = $("#journalList");
const journalStatus = $("#journalStatus");
const ENTRY_ICON = { voice: "i-mic", lab: "i-doc", note: "i-journal" };

async function loadJournal() {
  try {
    const { entries } = await (await fetch("/api/journal")).json();
    if (!entries.length) {
      journalList.innerHTML =
        '<div class="empty"><svg><use href="#i-empty"/></svg><div>No entries yet. Record a voice note above to get started.</div></div>';
      return;
    }
    journalList.innerHTML = entries
      .slice()
      .reverse()
      .map((e) => {
        const when = new Date(e.timestamp).toLocaleString();
        return `<div class="entry">
          <div class="entry-icon"><svg><use href="#${ENTRY_ICON[e.type] || "i-journal"}"/></svg></div>
          <div class="entry-body">
            <div class="entry-meta">${esc(e.type)} · ${esc(when)}</div>
            <div class="entry-text">${esc(e.text)}</div>
          </div></div>`;
      })
      .join("");
  } catch (err) {
    journalList.innerHTML = errorBox("Could not load journal: " + err.message);
  }
}

async function submitAudio(blob, filename) {
  journalStatus.innerHTML = spinner("Transcribing…");
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "x-filename": filename, "content-type": "application/octet-stream" },
      body: blob,
    });
    const data = await res.json();
    if (data.error) { journalStatus.innerHTML = errorBox(data.error); return; }
    journalStatus.innerHTML = `<div class="alert alert-info" style="margin-top:var(--s-3)"><svg><use href="#i-shield"/></svg><div>Saved: “${esc(data.entry.text)}”</div></div>`;
    loadJournal();
  } catch (err) {
    journalStatus.innerHTML = errorBox(err.message);
  }
}

// audio upload
$("#audioUploadBtn").addEventListener("click", () => $("#audioInput").click());
$("#audioInput").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) submitAudio(f, f.name);
  e.target.value = "";
});

// in-browser recording -> WAV (works in every browser, a supported format)
let recState = null;
const recBtn = $("#recBtn");
const recTime = $("#recTime");

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const w = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain(); mute.gain.value = 0; // avoid mic echo
  const chunks = [];
  processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(processor); processor.connect(mute); mute.connect(ctx.destination);
  recState = { stream, ctx, source, processor, chunks, started: Date.now() };
  recBtn.classList.add("recording");
  recBtn.querySelector("use").setAttribute("href", "#i-stop");
  tickTimer();
}

let timer = null;
function tickTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!recState) return;
    const s = Math.floor((Date.now() - recState.started) / 1000);
    recTime.textContent = `Recording  ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, 250);
}

async function stopRecording() {
  const st = recState; recState = null;
  clearInterval(timer);
  recBtn.classList.remove("recording");
  recBtn.querySelector("use").setAttribute("href", "#i-mic");
  recTime.textContent = "Tap to record";
  st.processor.disconnect(); st.source.disconnect();
  st.stream.getTracks().forEach((t) => t.stop());
  const len = st.chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Float32Array(len);
  let o = 0; for (const c of st.chunks) { merged.set(c, o); o += c.length; }
  const rate = st.ctx.sampleRate;
  await st.ctx.close();
  if (len < rate * 0.4) { journalStatus.innerHTML = errorBox("That recording was too short — try again."); return; }
  submitAudio(encodeWAV(merged, rate), "recording.wav");
}

recBtn.addEventListener("click", async () => {
  try {
    if (recState) await stopRecording();
    else await startRecording();
  } catch (err) {
    journalStatus.innerHTML = errorBox("Microphone unavailable: " + err.message + " — you can upload an audio file instead.");
  }
});

// ====================================================================
// DOCUMENTS
// ====================================================================
const docDrop = $("#docDrop");
const docInput = $("#docInput");
const docPreview = $("#docPreview");
const docActions = $("#docActions");
const docRun = $("#docRun");
const docDone = $("#docDone");
const docReset = $("#docReset");
const docStatus = $("#docStatus");
let docFile = null;

// state: "empty" (dropzone) | "ready" (image chosen) | "done" (explained)
function setDocState(state) {
  docDrop.hidden = state !== "empty";
  docPreview.hidden = state === "empty";
  docActions.hidden = state === "empty";
  docRun.hidden = state === "done";
  docDone.hidden = state !== "done";
  // docReset visible in ready + done
}

function chooseDoc(f) {
  docFile = f;
  docPreview.src = URL.createObjectURL(f);
  $("#docResult").hidden = true;
  $("#docExplain").textContent = "";
  docStatus.innerHTML = "";
  setDocState("ready");
}

function resetDoc() {
  docFile = null;
  docInput.value = "";
  docPreview.removeAttribute("src");
  $("#docResult").hidden = true;
  $("#docExplain").textContent = "";
  docStatus.innerHTML = "";
  setDocState("empty");
}

docDrop.addEventListener("click", () => docInput.click());
docDrop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") docInput.click(); });
docInput.addEventListener("change", (e) => { if (e.target.files[0]) chooseDoc(e.target.files[0]); });
["dragover", "dragenter"].forEach((ev) =>
  docDrop.addEventListener(ev, (e) => { e.preventDefault(); docDrop.classList.add("drag"); })
);
["dragleave", "drop"].forEach((ev) =>
  docDrop.addEventListener(ev, (e) => { e.preventDefault(); docDrop.classList.remove("drag"); })
);
docDrop.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) chooseDoc(e.dataTransfer.files[0]); });
docReset.addEventListener("click", resetDoc);

docRun.addEventListener("click", async () => {
  if (!docFile) return;
  docRun.disabled = true;
  docReset.disabled = true;
  $("#docResult").hidden = true;
  $("#docExplain").textContent = "";
  const prog = makeProgress(docStatus);
  prog.start("Extracting text…");
  let buf = "";
  let streaming = false;
  try {
    await streamPost(
      "/api/document",
      { body: docFile, headers: { "x-filename": docFile.name, "content-type": "application/octet-stream" } },
      (ev) => {
        if (ev.type === "status") prog.label(ev.text);
        else if (ev.type === "token") {
          if (!streaming) { streaming = true; prog.finish(); setTimeout(() => prog.clear(), 400); $("#docResult").hidden = false; }
          buf += ev.text; $("#docExplain").textContent = cleanText(buf);
        }
        else if (ev.type === "error") { prog.clear(); docStatus.innerHTML = errorBox(ev.message); }
        else if (ev.type === "done") { prog.clear(); if (streaming) setDocState("done"); }
      }
    );
  } catch (err) {
    prog.clear();
    docStatus.innerHTML = errorBox(err.message);
  } finally {
    docRun.disabled = false;
    docReset.disabled = false;
  }
});

resetDoc();

// ====================================================================
// ASK
// ====================================================================
const askRun = $("#askRun");
askRun.addEventListener("click", async () => {
  const q = $("#askInput").value.trim();
  if (!q) return;
  askRun.disabled = true;
  $("#askResult").hidden = false;
  $("#askAnswer").textContent = "";
  const prog = makeProgress($("#askStatus"));
  prog.start("Generating explanation…");
  let buf = "", streaming = false;
  try {
    await streamPost("/api/ask", { body: JSON.stringify({ question: q }), headers: { "content-type": "application/json" } }, (ev) => {
      if (ev.type === "status") prog.label(ev.text);
      else if (ev.type === "token") {
        if (!streaming) { streaming = true; prog.finish(); setTimeout(() => prog.clear(), 400); }
        buf += ev.text; $("#askAnswer").textContent = cleanText(buf);
      }
      else if (ev.type === "error") { prog.clear(); $("#askStatus").innerHTML = errorBox(ev.message); }
      else if (ev.type === "done") prog.clear();
    });
  } catch (err) {
    prog.clear();
    $("#askStatus").innerHTML = errorBox(err.message);
  } finally {
    askRun.disabled = false;
  }
});

// ====================================================================
// SUMMARY
// ====================================================================
const sumRun = $("#sumRun");
const sumPrint = $("#sumPrint");
sumRun.addEventListener("click", async () => {
  sumRun.disabled = true;
  sumPrint.disabled = true;
  $("#sumResult").hidden = false;
  $("#sumReport").textContent = "";
  const prog = makeProgress($("#sumStatus"));
  prog.start("Building your summary…");
  let buf = "", streaming = false;
  try {
    await streamPost("/api/summary", {}, (ev) => {
      if (ev.type === "status") prog.label(ev.text);
      else if (ev.type === "token") {
        if (!streaming) { streaming = true; prog.finish(); setTimeout(() => prog.clear(), 400); }
        buf += ev.text; $("#sumReport").textContent = cleanText(buf);
      }
      else if (ev.type === "error") { prog.clear(); $("#sumStatus").innerHTML = errorBox(ev.message); }
      else if (ev.type === "done") { prog.clear(); sumPrint.disabled = false; }
    });
  } catch (err) {
    prog.clear();
    $("#sumStatus").innerHTML = errorBox(err.message);
  } finally {
    sumRun.disabled = false;
  }
});
sumPrint.addEventListener("click", () => window.print());

// ====================================================================
// AUTH
// ====================================================================
let authMode = "login"; // or "register"
const authView = $("#authView");
const appView = $("#app");

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === "login";
  $("#authTitle").textContent = isLogin ? "Welcome back" : "Create your account";
  $("#authSub").textContent = isLogin ? "Sign in to your account." : "Your account stays on this device.";
  $("#authSubmit").textContent = isLogin ? "Sign in" : "Create account";
  $("#authToggleText").textContent = isLogin ? "New here?" : "Already have an account?";
  $("#authToggle").textContent = isLogin ? "Create an account" : "Sign in";
  $("#authPass").setAttribute("autocomplete", isLogin ? "current-password" : "new-password");
  $("#authError").innerHTML = "";
}

$("#authToggle").addEventListener("click", (e) => {
  e.preventDefault();
  setAuthMode(authMode === "login" ? "register" : "login");
});

$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $("#authUser").value.trim();
  const password = $("#authPass").value;
  const submit = $("#authSubmit");
  if (!username || !password) { $("#authError").innerHTML = errorBox("Enter a username and password."); return; }
  submit.disabled = true;
  $("#authError").innerHTML = "";
  try {
    const res = await fetch("/api/" + authMode, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      // Tried to create an account that already exists -> send them to sign-in
      // with the username kept, instead of a dead-end "username taken" error.
      if (authMode === "register" && /taken|exists/i.test(data.error || "")) {
        setAuthMode("login");
        $("#authUser").value = username;
        $("#authPass").value = "";
        $("#authPass").focus();
        $("#authError").innerHTML = infoBox("You already have an account with that username. Enter your password to sign in.");
      } else {
        $("#authError").innerHTML = errorBox(data.error || "Something went wrong.");
      }
      return;
    }
    enterApp(data.user);
  } catch (err) {
    $("#authError").innerHTML = errorBox(err.message);
  } finally {
    submit.disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  appView.hidden = true;
  authView.hidden = false;
  $("#authUser").value = "";
  $("#authPass").value = "";
  setAuthMode("login");
});

function enterApp(user) {
  $("#userName").textContent = user.username;
  authView.hidden = true;
  appView.hidden = false;
  loadJournal();
}

async function initAuth() {
  try {
    const { user } = await (await fetch("/api/me")).json();
    if (user) { enterApp(user); return; }
  } catch {}
  authView.hidden = false;
  appView.hidden = true;
  setAuthMode("login");
}

initAuth();
