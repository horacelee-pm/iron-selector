// Server-side proxy for the app's optional AI-assisted note analysis.
//
// The frontend (index.html) never talks to Anthropic directly — it POSTs
// { tool, promptText } here, and this function attaches the real Anthropic
// API key (read from the ANTHROPIC_API_KEY environment variable, set in the
// Vercel project's Settings -> Environment Variables, never committed to
// the repo) before forwarding the request. This keeps the key out of the
// browser entirely.
//
// Runs as a Vercel Edge Function (no dependencies, no build step needed).

export const config = { runtime: 'edge' };

// Only the two tool-use schemas the app actually sends may be forwarded —
// this keeps the proxy from being usable as an arbitrary open relay to
// Anthropic's API using this project's key.
const ALLOWED_TOOL_NAMES = new Set([
  'evaluate_comment_alignment',
  'evaluate_comment_tiebreak'
]);

const MODEL = 'claude-sonnet-5';
const MAX_PROMPT_LENGTH = 6000;
const UPSTREAM_TIMEOUT_MS = 15000;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: 'Server is not configured with an API key. Set ANTHROPIC_API_KEY in the Vercel project settings.' }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { tool, promptText } = body || {};

  if (!tool || typeof tool !== 'object' || !ALLOWED_TOOL_NAMES.has(tool.name)) {
    return json({ error: 'Unknown or missing tool' }, 400);
  }
  if (typeof promptText !== 'string' || !promptText.trim() || promptText.length > MAX_PROMPT_LENGTH) {
    return json({ error: 'Invalid prompt' }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: promptText }]
      }),
      signal: controller.signal
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return json({ error: `Upstream error ${resp.status}`, detail: text.slice(0, 300) }, 502);
    }

    const data = await resp.json();
    const toolBlock = (data.content || []).find(b => b.type === 'tool_use' && b.name === tool.name);
    if (!toolBlock) {
      return json({ error: 'No tool_use block in response' }, 502);
    }

    return json({ input: toolBlock.input }, 200);
  } catch (err) {
    const isAbort = err && err.name === 'AbortError';
    return json({ error: isAbort ? 'Request timed out' : 'Request failed' }, 504);
  } finally {
    clearTimeout(timer);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
