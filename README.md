# Iron Selector

A rules-based diagnostic tool that helps golfers figure out whether their 7-iron
setup (clubhead category, shaft flex, shaft weight) fits their swing — based on
swing speed, carry distance, strike tendency, and mishit pattern. Optional
freeform notes are analyzed by Claude to refine or (in some cases) override the
deterministic result; see the "AI-assisted freeform comment analysis" comment
block near the top of the `<script>` in `index.html` for exactly how and when
that happens.

## Structure

- `index.html` — the whole frontend: static HTML/CSS/JS, no build step, no
  framework, no dependencies.
- `api/diagnose.js` — a Vercel Edge Function that proxies the two AI calls
  (`evaluate_comment_alignment`, `evaluate_comment_tiebreak`) to Anthropic's
  API. This is what keeps the Anthropic API key server-side: the browser
  never sees it, only this function does, and only for the two known tool
  schemas the app actually uses.

## Deploying

1. **Get an Anthropic API key.** Console: https://console.anthropic.com/settings/keys
   Never commit this key to the repo, put it in `index.html`, or paste it into
   any file that gets pushed — it only ever goes into Vercel's environment
   variable settings (step 3).
2. **Push this repo to GitHub**, then import it into Vercel (New Project →
   Import Git Repository). No custom build settings are needed — Vercel
   auto-detects the static `index.html` plus the `api/` function.
3. **Set the environment variable.** In the Vercel project: Settings →
   Environment Variables → add `ANTHROPIC_API_KEY` with your key as the
   value, scoped to Production (and Preview/Development if you want AI
   analysis to work on preview deployments too). Redeploy after adding it.
4. Visit the deployed URL. The "Anything else about how your irons perform?"
   field's AI analysis will work automatically for every visitor — no one
   needs to paste an API key.

## Local development

There's no build step. To try it locally with the API route working, use the
Vercel CLI (`npx vercel dev`) from this directory with `ANTHROPIC_API_KEY` set
in a local `.env` file (already gitignored) — or just open `index.html`
directly in a browser to use the deterministic rules engine without AI notes
analysis (the fetch to `/api/diagnose` will simply fail, which the UI already
handles by falling back to the deterministic-only result).

## Cost note

Because the API key lives server-side and no auth/rate-limiting is in front
of `/api/diagnose`, every visitor who submits freeform notes triggers a real
Anthropic API call billed to whoever owns the key set in step 3. The function
does validate the tool name and cap prompt length, but it does not currently
rate-limit by IP or require any visitor authentication. For a small personal
or portfolio deployment this is usually fine; for a link you expect to get
wide traffic, consider adding rate limiting (e.g. Vercel's Edge Config or a
KV-backed limiter) before sharing it broadly.
