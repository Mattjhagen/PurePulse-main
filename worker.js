/**
 * PurePulse Lead Worker
 * POST — stores lead in Supabase, sends emails via Resend, invites client to portal
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PORTAL_URL = 'https://login.purepulse.one/portal'

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

    let body
    try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const { name, email, project, plan } = body
    if (!name || !email) return json({ error: 'Name and email are required' }, 400)

    const errors = []
    let portalLink = PORTAL_URL

    // 1. Save lead to Supabase
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          name, email,
          project: project || '',
          plan: plan || 'not_sure',
          created_at: new Date().toISOString(),
          status: 'new',
        }),
      })
      if (!res.ok) errors.push(`Supabase lead: ${await res.text()}`)
    } catch (e) { errors.push(`Supabase lead: ${e.message}`) }

    // 2. Generate magic link for portal access
    try {
      const linkRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          type: 'magiclink',
          email,
          options: {
            redirect_to: 'https://login.purepulse.one/auth/callback?next=/portal',
            data: { full_name: name, role: 'client' },
          },
        }),
      })
      const linkData = await linkRes.json()
      if (linkRes.ok && linkData.action_link) {
        portalLink = linkData.action_link
      } else {
        errors.push(`Portal link: ${JSON.stringify(linkData)}`)
      }
    } catch (e) { errors.push(`Portal link: ${e.message}`) }

    // 3. Notify YOU
    const notifyResult = await sendEmail(env.RESEND_API_KEY, {
      from: 'PurePulse Leads <matty@purepulse.one>',
      to: 'matty@purepulse.one',
      subject: `New lead: ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#07070D;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
            <span style="font-size:20px;font-weight:800;color:#F4F4FF">Pure<span style="color:#A066FF">Pulse</span></span>
          </div>
          <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <h2 style="margin:0 0 20px;color:#07070D">New consultation request 🎉</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:10px 12px;font-weight:700;background:#f9f9f9;width:120px">Name</td><td style="padding:10px 12px">${esc(name)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:700;width:120px">Email</td><td style="padding:10px 12px"><a href="mailto:${esc(email)}" style="color:#7B2FFF">${esc(email)}</a></td></tr>
              <tr><td style="padding:10px 12px;font-weight:700;background:#f9f9f9;width:120px">Plan</td><td style="padding:10px 12px">${esc(plan || 'Not sure yet')}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:700;vertical-align:top">Project</td><td style="padding:10px 12px">${esc(project || '—')}</td></tr>
            </table>
            <div style="margin-top:28px">
              <a href="https://login.purepulse.one/leads" style="background:#7B2FFF;color:#fff;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block">
                View in Dashboard →
              </a>
            </div>
          </div>
        </div>
      `,
    })
    if (!notifyResult.ok) errors.push(`Notify email: ${notifyResult.error}`)

    // 4. Email CLIENT — confirmation + portal magic link
    const clientResult = await sendEmail(env.RESEND_API_KEY, {
      from: 'Matty at PurePulse <matty@purepulse.one>',
      to: email,
      subject: `Got it, ${name.split(' ')[0]} — let's get you set up`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#07070D;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
            <span style="font-size:20px;font-weight:800;color:#F4F4FF">Pure<span style="color:#A066FF">Pulse</span></span>
          </div>
          <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <h2 style="margin:0 0 12px;color:#07070D">Hey ${esc(name.split(' ')[0])}, we got your request.</h2>
            <p style="color:#555;line-height:1.7">
              Thanks for reaching out. I'll review what you shared and get back to you within one business day — no pressure, no pitch, just a real conversation.
            </p>
            ${project ? `<div style="background:#f8f8ff;border-left:3px solid #7B2FFF;padding:12px 16px;margin:20px 0;border-radius:0 8px 8px 0"><p style="margin:0;font-size:14px;color:#555;font-style:italic">"${esc(project)}"</p></div>` : ''}

            <div style="background:#f8f8ff;border-radius:12px;padding:24px;margin:28px 0;border:1px solid #e8e4ff">
              <h3 style="margin:0 0 8px;color:#07070D;font-size:16px">📋 Your client portal is ready</h3>
              <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.6">
                Click the button below to access your account at <strong>login.purepulse.one/portal</strong>.
                Track your project progress, send messages, view invoices, and submit support tickets.
              </p>
              <a href="${portalLink}" style="background:#7B2FFF;color:#fff;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block;font-size:15px">
                Set Up My Portal →
              </a>
              <p style="margin:16px 0 0;font-size:12px;color:#999">This link expires in 24 hours. If it stops working, reply to this email and I'll send a new one.</p>
            </div>

            <p style="color:#555;line-height:1.7">
              Questions before we talk? Reply to this email and I'll get back to you.
            </p>
            <p style="color:#555">— Matty<br><span style="font-size:13px;color:#999">PurePulse · Web Design &amp; Development</span></p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="font-size:12px;color:#999;margin:0">
              You're receiving this because you submitted a consultation request at <a href="https://purepulse.one" style="color:#999">purepulse.one</a>.
            </p>
          </div>
        </div>
      `,
    })
    if (!clientResult.ok) errors.push(`Client email: ${clientResult.error}`)

    return json({ success: true, emailErrors: errors.length > 0 ? errors : undefined })
  },
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function sendEmail(apiKey, { from, to, subject, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text: subject }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: JSON.stringify(data) }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}
