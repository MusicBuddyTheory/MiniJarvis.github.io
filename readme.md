# NOVA — Command Interface (100% free setup)

A sci-fi HUD website with a voice-enabled AI assistant. No credit card, no API key.

```
index.html   the page
style.css    the HUD look
app.js       UI + chat + voice (runs in the browser)
worker.js    free AI backend (runs on Cloudflare Workers AI)
worker-claude-paid.js   optional: swap-in version that uses Claude (costs money)
```

The site works immediately in **demo mode** (just the interface). Do the steps below
to turn the AI on. It takes about 5 minutes, once.

## 1. Put the site on GitHub Pages

1. Create a new GitHub repo and upload `index.html`, `style.css`, `app.js`.
2. Repo **Settings → Pages → Deploy from branch → main / root**.
3. Your site will be at `https://YOURNAME.github.io/REPO-NAME/`.

## 2. Deploy the free AI backend

1. Make a free account at <https://dash.cloudflare.com> (no card needed).
2. **Workers & Pages → Create → Start with Hello World** (name it `nova-proxy`) → Deploy.
3. Click **Edit code**, delete what's there, paste all of `worker.js`, click **Deploy**.
4. Go to the Worker's **Settings → Bindings → Add → Workers AI**.
   Set the variable name to exactly `AI` and save.
5. Copy the Worker URL (looks like `https://nova-proxy.yourname.workers.dev`).

Optional but recommended: **Settings → Variables and Secrets → Add** a text variable
named `ALLOWED_ORIGIN` with value `https://YOURNAME.github.io` so only your site can use it.

## 3. Connect the site

In `app.js`, change:

```js
WORKER_URL: "https://nova-proxy.yourname.workers.dev",
```

Commit. Wait about a minute for GitHub Pages, refresh, and the badge turns green.

## Notes

- **Free limits:** Cloudflare gives 10,000 Neurons per day free, resetting at midnight UTC.
  On the free plan, going over just makes requests fail until the reset, so you can't be
  charged. NOVA tells you when it happens.
- **Quality:** this is a small open model, not Claude. Great for chat and quick help,
  weaker on complex work. To use Claude instead, deploy `worker-claude-paid.js` (needs an
  Anthropic API key and credit).
- **Voice** uses your browser's built-in speech tools (best in Chrome / Edge). Free.
- **Email access** is a later project. It needs Google login and secure token storage.
