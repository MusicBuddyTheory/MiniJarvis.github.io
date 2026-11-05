# NOVA — Command Interface

A sci-fi HUD website with a voice-enabled AI assistant powered by Claude.

```
index.html   the page
style.css    the HUD look
app.js       UI + chat + voice (runs in the browser)
worker.js    tiny backend that holds your API key (runs on Cloudflare)
```

The site works immediately in **demo mode** (no AI, just the interface). Follow
the steps below to connect real Claude.

---

## 1. Put the site on GitHub Pages

1. Create a new GitHub repo and upload `index.html`, `style.css`, `app.js`
   (you can upload `worker.js` and this README too; they're harmless).
2. Repo **Settings → Pages → Deploy from branch → main / root**.
3. Your site will be at `https://YOURNAME.github.io/REPO-NAME/`.

## 2. Get an API key

1. Make an account at <https://console.anthropic.com>.
2. Add a small amount of credit and **set a monthly spend limit** (Settings → Limits).
   Start with something like $5. This is your safety net.
3. Create an API key. Treat it like a password.

## 3. Deploy the proxy (keeps your key out of GitHub)

Never put the API key in `app.js`. Anything in a GitHub repo or a website is public,
and people will find and drain the key.

1. Make a free account at <https://dash.cloudflare.com>.
2. **Workers & Pages → Create → Worker**, name it `nova-proxy`, deploy, then **Edit code**.
3. Paste the contents of `worker.js` and deploy.
4. In the Worker's **Settings → Variables and Secrets**, add:
   - `ANTHROPIC_API_KEY` (type **Secret**): your key
   - `ALLOWED_ORIGIN` (type **Text**): `https://YOURNAME.github.io` (no trailing slash, no path)
5. Copy the Worker URL (like `https://nova-proxy.yourname.workers.dev`).

## 4. Connect the site to the proxy

In `app.js`, set:

```js
WORKER_URL: "https://nova-proxy.yourname.workers.dev",
```

Commit. After GitHub Pages rebuilds (about a minute), the badge turns green and NOVA
answers with real AI.

## Notes

- **Voice input** uses the browser's Speech Recognition (best in Chrome / Edge).
  **Voice output** uses built-in browser text-to-speech. Both are free.
- **Cost:** the Claude API is pay-per-use, not free or unlimited. The worker uses the
  cheapest model and caps reply length, so casual use costs very little, but set the
  spend limit anyway.
- **Anyone who visits your site can use your proxy** (and spend your credit). The
  `ALLOWED_ORIGIN` check stops other websites, not people on yours. If you share the
  link widely, add a login or rate limiting first.
- **Email / calendar access** is a later step. It needs Google OAuth and a backend
  that stores tokens securely. Don't try to do it from the browser code.
