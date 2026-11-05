// ============================================================
//  NOVA proxy — Cloudflare Worker
//  Keeps your Anthropic API key secret (never in the website code).
//
//  Secrets / variables to set in Cloudflare (see README.md):
//    ANTHROPIC_API_KEY  (secret)  your key from console.anthropic.com
//    ALLOWED_ORIGIN     (var)     e.g. https://yourname.github.io
// ============================================================

const MODEL = "claude-haiku-5-5";   // cheapest/fastest current model
const MAX_TOKENS = 400;             // caps cost per reply
const MAX_MESSAGES = 12;            // caps conversation length sent each time
const MAX_CHARS = 2000;             // caps size of each message

const SYSTEM_PROMPT =
  "You are NOVA, a calm, sharp, slightly witty AI assistant living inside a " +
  "futuristic command-center interface. Your replies are often read aloud, so " +
  "keep them concise and conversational: plain sentences, no markdown, no " +
  "bullet lists, no emojis. Help the user get real work done.";

function cors(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "";
  const ok = allowed && origin === allowed;
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(req, env) {
    const headers = cors(env, req);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

    // Block requests from any site other than yours
    if (headers["Access-Control-Allow-Origin"] === "null") {
      return new Response("Forbidden origin", { status: 403, headers });
    }

    let body;
    try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400, headers }); }

    // Validate + trim messages
    let messages = Array.isArray(body.messages) ? body.messages : [];
    messages = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

    // API requires the first message to be from the user
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length) return new Response("No messages", { status: 400, headers });

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return new Response("Upstream error: " + detail.slice(0, 300), { status: 502, headers });
    }

    const data = await upstream.json();
    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  },
};
