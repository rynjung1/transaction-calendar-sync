import type { VercelRequest, VercelResponse } from "@vercel/node";

// Plaid's own OAuth docs describe the redirect_uri target simply as "a
// blank web page you'll need to create and host" — the actual handoff back
// into the app happens at the OS level via iOS's Universal Links (once
// Associated Domains is configured — see mobile/app.config.ts and this
// repo's .well-known/apple-app-site-association), which intercepts
// navigation to this exact path and hands it to the native app directly,
// never actually loading this page. This route only ever gets hit as a
// fallback: Associated Domains misconfigured, the app not installed, or
// someone opening this URL directly in a plain browser — so it just says
// so plainly rather than leaving a blank or broken page.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Transaction Calendar Sync</title>
    <style>
      body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0d0d0d; color: #fff; text-align: center; padding: 24px; }
      p { max-width: 340px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <p>You can close this and return to the Transaction Calendar Sync app to finish connecting your bank.</p>
  </body>
</html>`);
}
