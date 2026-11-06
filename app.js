// ============================================================
//  Calvin — Command Interface
//  Set WORKER_URL after you deploy worker.js (see README.md).
//  NEVER put your Anthropic API key in this file.
// ============================================================
const CONFIG = {
  WORKER_URL: "https://calvin-proxy.liberlupus-boxing.workers.dev",
  NAME: "Calvin",
};

const $ = (id) => document.getElementById(id);
const els = {
  log: $("log"), form: $("form"), input: $("input"),
  reactor: $("reactor"),
  state: $("state"), count: $("count"),
  mic: $("micBtn"), tts: $("ttsBtn"), clear: $("clearBtn"),
  net: $("net"), clock: $("clock"), date: $("date"), uptime: $("uptime"),
};

let history = [];       // [{role, content}]
let msgCount = 0;
let voiceOn = true;
let busy = false;

// ---------- HUD decoration ----------
(function buildTicks() {
  const g = document.querySelector(".ticks");
  const NS = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const long = i % 5 === 0;
    const r1 = 176, r2 = long ? 168 : 172;
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", 200 + Math.cos(a) * r1);
    l.setAttribute("y1", 200 + Math.sin(a) * r1);
    l.setAttribute("x2", 200 + Math.cos(a) * r2);
    l.setAttribute("y2", 200 + Math.sin(a) * r2);
    g.appendChild(l);
  }
})();

const started = Date.now();
function tick() {
  const now = new Date();
  els.clock.textContent = now.toLocaleTimeString([], { hour12: false });
  els.date.textContent = now.toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" }).toUpperCase();
  const s = Math.floor((Date.now() - started) / 1000);
  els.uptime.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
setInterval(tick, 1000); tick();

function jitterMeters() {
  ["m1", "m2", "m3", "m4"].forEach((id) => {
    $(id).style.width = 35 + Math.random() * 60 + "%";
  });
}
setInterval(jitterMeters, 2200); jitterMeters();

function setState(name) {
  els.state.textContent = name.toUpperCase();
  els.reactor.classList.remove("listening", "thinking", "speaking");
  if (["listening", "thinking", "speaking"].includes(name)) els.reactor.classList.add(name);
}

// connection pill
if (CONFIG.WORKER_URL) {
  els.net.textContent = "AI LINK: ONLINE"; els.net.classList.add("ok");
} else {
  els.net.textContent = "DEMO MODE"; els.net.classList.add("demo");
}
setState("online");

// ---------- chat UI ----------
function addMsg(role, text) {
  const d = document.createElement("div");
  d.className = "msg " + role;
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = role === "user" ? "YOU" : role === "assistant" ? CONFIG.NAME : "SYSTEM";
  const body = document.createElement("div");
  body.textContent = text;           // textContent => no HTML injection
  d.append(who, body);
  els.log.appendChild(d);
  els.log.scrollTop = els.log.scrollHeight;
  if (role !== "system") { msgCount++; els.count.textContent = msgCount; }
  return body;
}

addMsg("system", CONFIG.WORKER_URL
  ? "Systems online. Type, or tap TALK and speak."
  : "Demo mode: no AI backend connected yet. Follow README.md to connect Claude. Try asking for the time or date.");

// ---------- AI call ----------
function demoReply(text) {
  const t = text.toLowerCase();
  if (t.includes("time")) return "It is " + new Date().toLocaleTimeString() + ".";
  if (t.includes("date") || t.includes("day")) return "Today is " + new Date().toLocaleDateString([], { dateStyle: "full" }) + ".";
  if (t.includes("hello") || t.includes("hi")) return "Hello. I'm running in demo mode. Connect the backend to give me a real brain.";
  return "I'm in demo mode, so I can only handle the time and date. Deploy worker.js and set WORKER_URL in app.js to enable full AI.";
}

async function askAI(text) {
  if (!CONFIG.WORKER_URL) return demoReply(text);
  const res = await fetch(CONFIG.WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history.slice(-12) }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error("Backend error " + res.status + " " + err.slice(0, 120));
  }
  const data = await res.json();
  return data.reply || "(no response)";
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  addMsg("user", text);
  history.push({ role: "user", content: text });
  setState("thinking");
  try {
    const reply = await askAI(text);
    history.push({ role: "assistant", content: reply });
    addMsg("assistant", reply);
    speak(reply);
  } catch (e) {
    history.pop(); // drop the failed user turn so history stays valid
    addMsg("system", "Error: " + e.message);
    setState("online");
  } finally {
    busy = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = els.input.value;
  els.input.value = "";
  send(v);
});

els.clear.addEventListener("click", () => {
  history = []; msgCount = 0; els.count.textContent = 0;
  els.log.innerHTML = "";
  window.speechSynthesis && speechSynthesis.cancel();
  addMsg("system", "Log cleared.");
  setState("online");
});

// ---------- voice out ----------
const VOICE_KEY = "calvin_voice";
const voiceSel = $("voiceSel");
let voices = [];
let speakToken = 0;

// Browsers don't say which voices are male, so recognise common male voice names.
const MALE_NAMES = /\b(guy|ryan|christopher|eric|roger|steffan|brian|andrew|davis|jason|tony|william|mark|david|george|james|richard|sean|ravi|prabhat|liam|thomas|connor|mitchell|neil|jacob|alfie|elliot|rishi|daniel|alex|fred|aaron|arthur|gordon|evan|nathan|oliver|reed|tom|lee|ralph|henry|oscar|male|man)\b/i;
const isMale = (v) => MALE_NAMES.test(v.name) && !/female/i.test(v.name);

// Rank voices so the most natural-sounding ones come first.
function scoreVoice(v) {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/^en/i.test(v.lang)) s += 10;
  if (/natural|neural|online/.test(n)) s += 50;      // Edge's neural voices sound best
  if (/google uk english male|daniel|alex|fred/.test(n)) s += 15;
  if (/google/.test(n)) s += 8;
  if (/espeak|compact|novelty/.test(n)) s -= 40;
  return s;
}

function voiceLabel(v) {
  const base = v.name.replace(/^Microsoft /, "").replace(/ - English.*$/, "").trim();
  const region = (v.lang.split(/[-_]/)[1] || "").toUpperCase();
  return region ? base + " · " + region : base;
}

function populateVoices() {
  if (!("speechSynthesis" in window) || !voiceSel) return;
  voices = speechSynthesis.getVoices()
    .filter((v) => /^en/i.test(v.lang))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));

  const male = voices.filter(isMale);
  const other = voices.filter((v) => !isMale(v));

  let saved = "";
  try { saved = localStorage.getItem(VOICE_KEY) || ""; } catch (_) {}

  voiceSel.innerHTML = "";
  const addGroup = (label, items) => {
    if (!items.length) return;
    const g = document.createElement("optgroup");
    g.label = label;
    items.forEach((it) => {
      const o = document.createElement("option");
      o.value = it.value;
      o.textContent = it.text;
      g.appendChild(o);
    });
    voiceSel.appendChild(g);
  };

  // every male voice, plus lower-pitched "deep" versions of the best few
  const maleItems = [];
  male.forEach((v) => maleItems.push({ value: v.name + "|1|1.03", text: voiceLabel(v) }));
  male.slice(0, 6).forEach((v) => maleItems.push({ value: v.name + "|0.75|0.97", text: voiceLabel(v) + " (deep)" }));
  addGroup("Male voices", maleItems);
  addGroup("Other voices", other.map((v) => ({ value: v.name + "|1|1.03", text: voiceLabel(v) })));

  const values = Array.from(voiceSel.options).map((o) => o.value);
  if (values.length) voiceSel.value = values.includes(saved) ? saved : values[0];
}
if ("speechSynthesis" in window) {
  populateVoices();
  speechSynthesis.onvoiceschanged = populateVoices;
}

function cleanForSpeech(t) {
  return t
    .replace(/```[\s\S]*?```/g, " code block. ")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[*_#`>~]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Speak in sentence-sized pieces: sounds more natural and avoids Chrome cutting off long text.
function chunks(t) {
  const parts = t.match(/[^.!?]+[.!?]*\s*/g) || [t];
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 200 && cur) { out.push(cur); cur = p; } else cur += p;
  }
  if (cur) out.push(cur);
  return out;
}

function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) { setState("online"); return; }
  speechSynthesis.cancel();
  const token = ++speakToken;
  const parts = chunks(cleanForSpeech(text).slice(0, 1200));
  if (!parts.length) { setState("online"); return; }

  const [vName, vPitch, vRate] = (voiceSel && voiceSel.value ? voiceSel.value : "").split("|");
  const chosen = voices.find((v) => v.name === vName);

  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    if (chosen) u.voice = chosen;
    u.pitch = parseFloat(vPitch) || 1;
    u.rate = parseFloat(vRate) || 1.03;
    if (i === 0) u.onstart = () => { if (token === speakToken) setState("speaking"); };
    if (i === parts.length - 1) {
      u.onend = u.onerror = () => { if (token === speakToken) setState("online"); };
    }
    speechSynthesis.speak(u);
  });
}

if (voiceSel) {
  voiceSel.addEventListener("change", () => {
    try { localStorage.setItem(VOICE_KEY, voiceSel.value); } catch (_) {}
    const wasOn = voiceOn;
    voiceOn = true;
    speak("Hello, I'm Calvin. How does this voice sound?");
    voiceOn = wasOn;
  });
}

els.tts.addEventListener("click", () => {
  voiceOn = !voiceOn;
  els.tts.textContent = "🔊 VOICE: " + (voiceOn ? "ON" : "OFF");
  els.tts.classList.toggle("on", voiceOn);
  if (!voiceOn) speechSynthesis.cancel();
  setState("online");
});

// ---------- voice in ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const MIC_HELP = {
  "not-allowed": "Microphone access is blocked for this site. Click the lock icon next to the web address, set Microphone to Allow, then reload the page.",
  "service-not-allowed": "Microphone access is blocked for this site. Click the lock icon next to the web address, set Microphone to Allow, then reload the page.",
  "audio-capture": "No microphone found. Check that one is connected and selected in your system sound settings.",
  "network": "The browser's speech service couldn't be reached. Brave and some other browsers block it. Try Chrome or Edge, and check your internet connection.",
  "no-speech": "I didn't hear anything. Tap TALK, then start speaking right away.",
};

if (!SR) {
  els.mic.disabled = true;
  els.mic.title = "Speech recognition isn't supported in this browser (try Chrome or Edge).";
  addMsg("system", "Voice input isn't supported in this browser. Try Chrome or Edge. Typing still works.");
} else {
  let rec = null;
  let listening = false;
  let finalText = "";
  let failed = false;
  let silenceTimer = null;

  const resetMicUI = () => {
    listening = false;
    els.mic.classList.remove("active");
    els.mic.textContent = "🎙 TALK";
  };

  function startListening() {
    if (busy) return;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;         // one phrase at a time (continuous mode duplicates text on iPad/Safari)
    finalText = "";
    failed = false;
    els.input.value = "";

    rec.onstart = () => {
      listening = true;
      els.mic.classList.add("active");
      els.mic.textContent = "🎙 LISTENING…";
      setState("listening");
    };

    rec.onresult = (e) => {
      // Use only the newest result: each one already holds the full phrase so far.
      // (Adding them together is what made iPad repeat words over and over.)
      const last = e.results[e.results.length - 1];
      const heard = ((last && last[0] && last[0].transcript) || "").trim();
      if (last && last.isFinal) finalText = heard;
      els.input.value = heard;
      // after a short pause in speech, stop and send
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => { try { rec.stop(); } catch (_) {} }, 1800);
    };

    rec.onerror = (e) => {
      failed = true;
      if (e.error !== "aborted") addMsg("system", MIC_HELP[e.error] || ("Microphone error: " + e.error));
    };

    rec.onend = () => {
      clearTimeout(silenceTimer);
      resetMicUI();
      const text = (els.input.value || finalText).trim();
      if (!failed && text) { els.input.value = ""; send(text); }
      else setState("online");
    };

    try { rec.start(); }
    catch (err) { resetMicUI(); addMsg("system", "Couldn't start the microphone: " + err.message); }
  }

  els.mic.addEventListener("click", () => {
    if (listening) { try { rec.stop(); } catch (_) {} }
    else startListening();
  });
}
