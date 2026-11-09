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
  ? "Systems online. Type, or tap TALK and speak. Try: weather in King City, or directions from Vaughan Mills to Union Station by bus."
  : "Demo mode: no AI backend connected yet. Follow README.md to connect Claude. Try asking for the time or date.");

// ---------- AI call ----------
function demoReply(text) {
  const t = text.toLowerCase();
  if (t.includes("time")) return "It is " + new Date().toLocaleTimeString() + ".";
  if (t.includes("date") || t.includes("day")) return "Today is " + new Date().toLocaleDateString([], { dateStyle: "full" }) + ".";
  if (t.includes("hello") || t.includes("hi")) return "Hello. I'm running in demo mode. Connect the backend to give me a real brain.";
  return "I'm in demo mode, so I can only handle the time and date. Deploy worker.js and set WORKER_URL in app.js to enable full AI.";
}

// ---------- weather (Ontario) ----------
// Free data from Open-Meteo (no key needed). Runs in your browser, not the Worker.
const PLACES = {
  "downtown toronto":   { name: "downtown Toronto", lat: 43.6532, lon: -79.3832 },
  "king city":          { name: "King City",        lat: 43.9267, lon: -79.5283 },
  "vaughan":            { name: "Vaughan",          lat: 43.8361, lon: -79.4983 },
  "woodbridge":         { name: "Woodbridge",       lat: 43.7833, lon: -79.6000 },
  "maple":              { name: "Maple",            lat: 43.8506, lon: -79.5106 },
  "kleinburg":          { name: "Kleinburg",        lat: 43.8333, lon: -79.6167 },
  "nobleton":           { name: "Nobleton",         lat: 43.9000, lon: -79.6500 },
  "schomberg":          { name: "Schomberg",        lat: 44.0000, lon: -79.6833 },
  "aurora":             { name: "Aurora",           lat: 44.0065, lon: -79.4504 },
  "newmarket":          { name: "Newmarket",        lat: 44.0592, lon: -79.4613 },
  "richmond hill":      { name: "Richmond Hill",    lat: 43.8828, lon: -79.4403 },
  "thornhill":          { name: "Thornhill",        lat: 43.8161, lon: -79.4228 },
  "markham":            { name: "Markham",          lat: 43.8561, lon: -79.3370 },
  "north york":         { name: "North York",       lat: 43.7615, lon: -79.4111 },
  "scarborough":        { name: "Scarborough",      lat: 43.7731, lon: -79.2578 },
  "etobicoke":          { name: "Etobicoke",        lat: 43.6205, lon: -79.5132 },
  "toronto":            { name: "Toronto",          lat: 43.6532, lon: -79.3832 },
  "mississauga":        { name: "Mississauga",      lat: 43.5890, lon: -79.6441 },
  "brampton":           { name: "Brampton",         lat: 43.7315, lon: -79.7624 },
  "caledon":            { name: "Caledon",          lat: 43.8667, lon: -79.8667 },
  "oakville":           { name: "Oakville",         lat: 43.4675, lon: -79.6877 },
  "burlington":         { name: "Burlington",       lat: 43.3255, lon: -79.7990 },
  "hamilton":           { name: "Hamilton",         lat: 43.2557, lon: -79.8711 },
  "barrie":             { name: "Barrie",           lat: 44.3894, lon: -79.6903 },
  "pickering":          { name: "Pickering",        lat: 43.8384, lon: -79.0868 },
  "oshawa":             { name: "Oshawa",           lat: 43.8971, lon: -78.8658 },
  "ottawa":             { name: "Ottawa",           lat: 45.4215, lon: -75.6972 },
  "niagara falls":      { name: "Niagara Falls",    lat: 43.0896, lon: -79.0849 },
  "kitchener":          { name: "Kitchener",        lat: 43.4516, lon: -80.4925 },
  "london":             { name: "London, Ontario",  lat: 42.9849, lon: -81.2453 },
};
const PLACE_KEYS = Object.keys(PLACES).sort((a, b) => b.length - a.length); // longest first

const WEATHER_WORDS = /\b(temperature|temp|weather|forecast|how (hot|cold|warm|chilly)|degrees|is it (hot|cold|warm|raining|snowing))\b/i;

const WMO = {
  0: "clear skies", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  56: "freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
  77: "snow grains", 80: "light showers", 81: "showers", 82: "heavy showers",
  85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail",
};

const sayTemp = (n) => (n < 0 ? "minus " + Math.abs(n) : String(n));

async function getJSON(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function findKnownPlace(text) {
  const t = " " + text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ") + " ";
  for (const k of PLACE_KEYS) if (t.includes(" " + k + " ")) return PLACES[k];
  return null;
}

function extractPlaceName(text) {
  const m = text.match(/\b(?:in|for|at|near|around|of)\s+(?:the\s+)?([a-zA-Z][a-zA-Z .'\-]{1,40}?)\s*[?.!,]*\s*$/i);
  return m ? m[1].trim() : "";
}

async function geocodeOntario(name) {
  const url = "https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=" + encodeURIComponent(name);
  const data = await getJSON(url);
  const list = (data.results || []).filter((r) => r.country_code === "CA");
  const hit = list.find((r) => r.admin1 === "Ontario");
  return hit ? { name: hit.name, lat: hit.latitude, lon: hit.longitude } : null;
}

async function tryWeather(text) {
  if (!WEATHER_WORDS.test(text)) return null;

  let place = findKnownPlace(text);
  if (!place) {
    const guess = extractPlaceName(text);
    if (!guess) return "Which place in Ontario? For example, say: temperature in King City.";
    try { place = await geocodeOntario(guess); }
    catch (_) { return "I couldn't look up that place right now. Check your internet connection and try again."; }
    if (!place) return "I couldn't find \"" + guess + "\" in Ontario. Try a nearby town, or check the spelling.";
  }

  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + place.lat + "&longitude=" + place.lon +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=America%2FToronto";
    const w = await getJSON(url);
    const c = w.current;
    const temp = Math.round(c.temperature_2m);
    const feels = Math.round(c.apparent_temperature);
    const hi = Math.round(w.daily.temperature_2m_max[0]);
    const lo = Math.round(w.daily.temperature_2m_min[0]);
    const wind = Math.round(c.wind_speed_10m);
    const sky = WMO[c.weather_code] || "mixed conditions";

    let out = "It's " + sayTemp(temp) + " degrees Celsius in " + place.name + " right now, with " + sky + ".";
    if (Math.abs(feels - temp) >= 2) out += " It feels like " + sayTemp(feels) + ".";
    out += " Today's high is " + sayTemp(hi) + " and the low is " + sayTemp(lo) + ".";
    if (wind >= 20) out += " Winds around " + wind + " kilometres per hour.";
    return out;
  } catch (_) {
    return "I couldn't reach the weather service for " + place.name + ". Try again in a moment.";
  }
}

// ---------- Toronto directions, transit & traffic ----------
// No free source of live bus times or traffic exists that works without keys,
// so Calvin builds a Google Maps link, which shows live transit times and traffic.
const DIR_WORDS = /\b(directions?|route|routes|how (?:do|can) (?:i|we) get|how to get|get to|how long (?:to|does it take)|navigate|commute|drive (?:to|from)|(?:walk|walking|bike|biking|cycle|cycling|ride|go) from|take the (?:bus|ttc|subway|train|streetcar)|bus(?:es)? (?:to|from)|ttc|go train|subway|streetcar|transit|traffic)\b/i;
const TRANSIT_WORDS = /\b(bus|buses|ttc|subway|streetcar|train|go train|go transit|transit|metro|line \d|yrt|viva|up express)\b/i;

function mapsMode(text) {
  if (/\b(walk|walking|on foot)\b/i.test(text)) return "walking";
  if (/\b(bike|biking|cycle|cycling|bicycle)\b/i.test(text)) return "bicycling";
  if (TRANSIT_WORDS.test(text)) return "transit";
  return "driving";
}

function cleanPlace(s) {
  s = s.replace(/\s+(?:by|on|via|using|with)\s+(?:the\s+)?(?:bus|buses|ttc|subway|streetcar|train|go train|transit|car|foot|bike)\b.*$/i, "")
       .replace(/\b(?:calvin|please)\b[,]?/gi, "")
       .replace(/^(?:the\s+)/i, "")
       .replace(/[?.!,]+$/g, "")
       .trim();
  if (!s) return "";
  return /ontario|\bon\b|canada/i.test(s) ? s : s + ", Ontario, Canada";
}

function tryDirections(text) {
  if (!DIR_WORDS.test(text)) return null;
  // weather questions are handled elsewhere
  const mode = mapsMode(text);
  const label = { transit: "transit", driving: "driving", walking: "walking", bicycling: "cycling" }[mode];

  // traffic overview (no destination given)
  const hasTrip = /\b(?:from|to|toward|towards)\s+\S/i.test(text);
  if (/\btraffic\b/i.test(text) && !hasTrip) {
    return {
      text: "I can't read live traffic myself, but this map shows current Toronto traffic. Tap the link.",
      url: "https://www.google.com/maps/@43.70,-79.40,11z/data=!5m1!1e1",
      linkText: "Open live Toronto traffic map",
    };
  }

  let from = "", to = "";
  let m = text.match(/\bfrom\s+(.+?)\s+(?:to|toward|towards)\s+(.+)$/i);
  if (m) { from = cleanPlace(m[1]); to = cleanPlace(m[2]); }
  else {
    m = text.match(/\b(?:to|toward|towards)\s+(.+)$/i);
    if (m) to = cleanPlace(m[1]);
  }
  if (!to) return { text: "Where are you headed? Try: directions from Vaughan Mills to Union Station by bus." };

  const q = new URLSearchParams({ api: "1", destination: to, travelmode: mode });
  if (from) q.set("origin", from);
  const url = "https://www.google.com/maps/dir/?" + q.toString();

  const place = (s) => s.replace(/, Ontario, Canada$/, "");
  const trip = from ? "from " + place(from) + " to " + place(to) : "to " + place(to) + " from where you are";
  const extra = mode === "transit"
    ? " It shows the TTC, GO and YRT routes, the next departures and trip times."
    : mode === "driving" ? " It shows the drive time with live traffic." : "";
  return {
    text: "Here are " + label + " directions " + trip + "." + extra + " Tap the link below.",
    url,
    linkText: "Open " + label + " directions",
  };
}

async function askAI(text) {
  const weatherReply = await tryWeather(text);
  if (weatherReply) return weatherReply;
  const dirReply = tryDirections(text);
  if (dirReply) return dirReply;
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
    const result = await askAI(text);
    const reply = typeof result === "string" ? result : result.text;
    history.push({ role: "assistant", content: reply });
    const body = addMsg("assistant", reply);
    if (result && result.url && result.url.startsWith("https://www.google.com/maps/")) {
      const link = document.createElement("a");
      link.href = result.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "➜ " + (result.linkText || "Open map");
      link.className = "maplink";
      body.parentNode.appendChild(link);
      els.log.scrollTop = els.log.scrollHeight;
    }
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
// Calvin has ONE voice: the best male English voice this device has.
let calvinVoice = null;
let speakToken = 0;

// Browsers don't label voices by gender, so recognise common male voice names.
const MALE_NAMES = /\b(guy|ryan|christopher|eric|roger|steffan|brian|andrew|davis|jason|tony|william|mark|david|george|james|richard|sean|ravi|prabhat|liam|thomas|connor|mitchell|neil|jacob|alfie|elliot|rishi|daniel|alex|fred|aaron|arthur|gordon|evan|nathan|oliver|reed|tom|lee|ralph|henry|oscar|male|man)\b/i;
const isMale = (v) => MALE_NAMES.test(v.name) && !/female/i.test(v.name);
// Warm, natural-sounding guys first.
const PREFERRED = ["guy", "ryan", "mark", "andrew", "brian", "christopher", "aaron", "daniel", "alex", "arthur", "tom", "fred"];

function scoreVoice(v) {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/^en/i.test(v.lang)) s += 10;
  if (/^en[-_](us|ca|gb)/i.test(v.lang)) s += 4;
  if (/natural|neural|online/.test(n)) s += 50;
  if (/google/.test(n)) s += 6;
  if (/espeak|compact|novelty/.test(n)) s -= 40;
  const i = PREFERRED.findIndex((p) => n.includes(p));
  if (i >= 0) s += 30 - i;
  return s;
}

function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  if (!all.length) return;
  const male = all.filter(isMale).sort((a, b) => scoreVoice(b) - scoreVoice(a));
  calvinVoice = male[0] || all.sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
  if (!male.length && !pickVoice.warned) {
    pickVoice.warned = true;
    addMsg("system", "This device has no male voice installed, so Calvin is using the closest one. On iPad: Settings > Accessibility > Spoken Content > Voices > English, download a male voice like Aaron or Daniel, then reload.");
  }
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
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
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  const token = ++speakToken;
  const parts = chunks(cleanForSpeech(text).slice(0, 1200));
  if (!parts.length) { setState("online"); return; }

  const chosen = calvinVoice;

  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    if (chosen) { u.voice = chosen; u.lang = chosen.lang; }
    u.pitch = 0.95;
    u.rate = 1.0;
    if (i === 0) u.onstart = () => { if (token === speakToken) setState("speaking"); };
    if (i === parts.length - 1) {
      u.onend = u.onerror = () => { if (token === speakToken) setState("online"); };
    }
    speechSynthesis.speak(u);
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
// Two ways to hear you:
//  1) the browser's built-in speech recognition (Chrome, Edge, Safari), or
//  2) a backup that records your voice and sends it to your Worker for free
//     speech-to-text. Brave blocks (1), so Brave uses (2) automatically.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

const MIC_HELP = {
  "not-allowed": "Microphone access is blocked for this site. Click the lock icon next to the web address, set Microphone to Allow, then reload the page.",
  "service-not-allowed": "Microphone access is blocked for this site. Click the lock icon next to the web address, set Microphone to Allow, then reload the page.",
  "audio-capture": "No microphone found. Check that one is connected and selected in your system sound settings.",
  "network": "The browser's speech service couldn't be reached. Check your internet connection and try again.",
  "no-speech": "I didn't hear anything. Tap TALK, then start speaking right away.",
};

let useRecorder = !SR;
if (navigator.brave && navigator.brave.isBrave) {
  navigator.brave.isBrave().then((b) => { if (b) useRecorder = true; }).catch(() => {});
}

if (!SR && !canRecord) {
  els.mic.disabled = true;
  els.mic.title = "This browser can't capture your voice. Try Chrome, Edge or Safari.";
  addMsg("system", "Voice input isn't supported in this browser. Try Chrome, Edge or Safari. Typing still works.");
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

  const setMicActive = () => {
    els.mic.classList.add("active");
    els.mic.textContent = "🎙 LISTENING…";
    setState("listening");
  };

  // ----- (1) built-in recognition -----
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

    rec.onstart = () => { listening = true; setMicActive(); };

    rec.onresult = (e) => {
      // Use only the newest result: each one already holds the full phrase so far.
      const last = e.results[e.results.length - 1];
      const heard = ((last && last[0] && last[0].transcript) || "").trim();
      if (last && last.isFinal) finalText = heard;
      els.input.value = heard;
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => { try { rec.stop(); } catch (_) {} }, 1800);
    };

    rec.onerror = (e) => {
      failed = true;
      if (e.error === "aborted") return;
      if (e.error === "network" && canRecord) {
        useRecorder = true;
        addMsg("system", "This browser blocks built-in speech recognition (Brave does this). Switched to the backup microphone. Tap TALK again.");
      } else {
        addMsg("system", MIC_HELP[e.error] || ("Microphone error: " + e.error));
      }
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

  // ----- (2) backup: record, then transcribe on the Worker -----
  let mr = null, stream = null, audioCtx = null, rafId = 0;
  let recChunks = [], recording = false, recHeard = false;

  function stopRecording() {
    recording = false;
    cancelAnimationFrame(rafId);
    if (mr && mr.state !== "inactive") { try { mr.stop(); } catch (_) {} }
  }

  function releaseMic() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (audioCtx) { try { audioCtx.close(); } catch (_) {} }
    stream = null; audioCtx = null;
  }

  async function transcribe(blob) {
    const url = new URL("/transcribe", CONFIG.WORKER_URL).toString();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
    if (!res.ok) throw new Error("Transcription failed (" + res.status + "). Make sure you pasted the newest worker.js into Cloudflare and deployed it.");
    const data = await res.json();
    return (data.text || "").trim();
  }

  async function startRecording() {
    if (busy) return;
    if (!CONFIG.WORKER_URL) { addMsg("system", "Voice input in this browser needs the AI backend connected first."); return; }
    if (!canRecord) { addMsg("system", "This browser can't record audio. Try Chrome, Edge or Safari, or type instead."); return; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();

    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { addMsg("system", MIC_HELP["not-allowed"]); return; }

    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
    mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recChunks = []; recHeard = false; recording = true;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    mr.onstop = async () => {
      releaseMic();
      resetMicUI();
      const blob = new Blob(recChunks, { type: (mr && mr.mimeType) || "audio/webm" });
      if (!recHeard || blob.size < 1500) {
        setState("online");
        addMsg("system", MIC_HELP["no-speech"]);
        return;
      }
      setState("thinking");
      try {
        const text = await transcribe(blob);
        if (text) send(text);
        else { setState("online"); addMsg("system", "I couldn't make out any words. Try again a little closer to the mic."); }
      } catch (err) {
        setState("online");
        addMsg("system", "Error: " + err.message);
      }
    };
    mr.start();
    listening = true;
    setMicActive();

    // stop automatically ~1.5 s after you stop talking
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.resume) audioCtx.resume();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const t0 = Date.now();
      let lastLoud = t0;
      const loop = () => {
        if (!recording) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        const now = Date.now();
        if (peak > 14) { recHeard = true; lastLoud = now; }
        if ((recHeard && now - lastLoud > 1500) || now - t0 > 15000 || (!recHeard && now - t0 > 8000)) { stopRecording(); return; }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    } catch (_) {
      // no audio analysis available: just record for up to 6 seconds
      recHeard = true;
      setTimeout(stopRecording, 6000);
    }
  }

  els.mic.addEventListener("click", () => {
    if (recording) { stopRecording(); return; }
    if (listening && rec) { try { rec.stop(); } catch (_) {} return; }
    if (useRecorder) startRecording(); else startListening();
  });
}
