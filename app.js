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
  reactor: $("reactor"), reactorLabel: $("reactorLabel"),
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
  els.reactorLabel.textContent = name.toUpperCase();
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
  ? "Systems online. Type or hold TALK to speak."
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
function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) { setState("online"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 600));
  u.rate = 1.02; u.pitch = 0.9;
  const voices = speechSynthesis.getVoices();
  const pick = voices.find((v) => /en-GB|en-US/.test(v.lang) && /male|daniel|google uk/i.test(v.name));
  if (pick) u.voice = pick;
  u.onstart = () => setState("speaking");
  u.onend = u.onerror = () => setState("online");
  speechSynthesis.speak(u);
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
if (!SR) {
  els.mic.disabled = true;
  els.mic.title = "Speech recognition isn't supported in this browser (try Chrome or Edge).";
} else {
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  let listening = false;

  rec.onstart = () => { listening = true; els.mic.classList.add("active"); els.mic.textContent = "🎙 LISTENING…"; setState("listening"); };
  rec.onresult = (e) => {
    let interim = "";
    finalText = "";
    for (const r of e.results) {
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    els.input.value = finalText || interim;
  };
  rec.onend = () => {
    listening = false;
    els.mic.classList.remove("active");
    els.mic.textContent = "🎙 TALK";
    if (finalText.trim()) { els.input.value = ""; send(finalText); }
    else setState("online");
    finalText = "";
  };
  rec.onerror = () => { listening = false; els.mic.classList.remove("active"); els.mic.textContent = "🎙 TALK"; setState("online"); };

  els.mic.addEventListener("click", () => {
    if (listening) { rec.stop(); return; }
    speechSynthesis.cancel();
    try { rec.start(); } catch (_) {}
  });
}
