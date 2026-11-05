// ============================================================
//  NOVA proxy (FREE version) — Cloudflare Worker + Workers AI
//  No API key, no credit card. Uses Cloudflare's free daily AI allowance.
//
//  One setup step in the dashboard: add a Workers AI binding named "AI"
//  (Worker -> Settings -> Bindings -> Add -> Workers AI -> variable name: AI)
//
//  Optional: add a text variable ALLOWED_ORIGIN (e.g. https://yourname.github.io)
//  to stop other websites from using your Worker.
// ============================================================

const MODEL = "@cf/meta/llama-3.2-3b-instruct"; // swap here if you want a different model
const MAX_TOKENS = 350;
const MAX_MESSAGES = 10;
const MAX_CHARS = 1500;

const SYSTEM_PROMPT =
  "You are NOVA, a calm, sharp, slightly witty AI assistant living inside a " +
  "futuristic command-center interface. Your replies are read aloud, so keep " +
  "them short and conversational: plain sentences, no markdown, no bullet " +
  "lists, no emojis. Help the user get real work done.";

function corsHeaders(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN;
  const ok = !allowed || origin === allowed;
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? (allowed || "*") : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    },
  };
}

export default {
  async fetch(req, env) {
    const { ok, headers } = corsHeaders(env, req);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return new Response("NOVA proxy is running.", { status: 200, headers });
    if (!ok) return new Response("Forbidden origin", { status: 403, headers });
    if (!env.AI) {
      return new Response("Workers AI binding missing. Add a binding named AI.", { status: 500, headers });
    }

    let body;
    try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400, headers }); }

    let messages = Array.isArray(body.messages) ? body.messages : [];
    messages = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!messages.length) return new Response("No messages", { status: 400, headers });

    try {
      const result = await env.AI.run(MODEL, {
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: MAX_TOKENS,
      });
      const reply = (result && (result.response || result.result?.response)) || "(no response)";
      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      // Most likely cause: the free daily allowance is used up (resets 00:00 UTC)
      return new Response(
        JSON.stringify({ reply: "I've hit today's free AI limit. It resets at 7 PM Eastern. Try again then." }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }
  },
};
