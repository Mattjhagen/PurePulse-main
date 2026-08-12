/**
 * PurePulse Chat Worker
 * Proxies requests to Anthropic API for the website chat widget
 * Env vars: ANTHROPIC_API_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const AGENT_ID = 'agent_01UVQtuMpTRUvgV3mroMwejX'

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

    let body
    try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const { messages } = body
    if (!messages || !Array.isArray(messages)) return json({ error: 'messages array required' }, 400)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: `You are the PurePulse assistant — a friendly, confident web design consultant on purepulse.one.

PurePulse builds clean, fast, professional websites for small businesses. Here's what you know:

SERVICES:
- Custom website design & development starting at a $150 deposit
- Monthly maintenance plans: Basic (uptime + backups), Pro (updates + support), Business (priority + analytics)
- vibeCodes.space — AI-powered DIY site builder (Free / Pro $12/mo / Business $49/mo)

PROCESS:
1. Client fills out consultation form
2. Matty reviews and responds within 1 business day
3. Design → Build → Launch → Maintain

TONE:
- Warm, direct, no fluff
- Never oversell — let the work speak
- If someone's ready to book, direct them to the consultation form on the page by saying "scroll down to the form below"
- If they have a specific question you can't answer, tell them to email matty@purepulse.one

Keep responses short — 2-3 sentences max. This is a chat widget, not an essay.`,
          messages,
        }),
      })

      const data = await response.json()
      if (!response.ok) return json({ error: data.error?.message || 'API error' }, 500)

      const text = data.content?.find(b => b.type === 'text')?.text || ''
      return json({ response: text })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  },
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
