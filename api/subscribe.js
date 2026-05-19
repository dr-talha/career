// Career Pakistan — /api/subscribe.js
// Vercel Serverless Function
// Email subscription handler using Resend (https://resend.com).
// Adds subscriber to your Resend audience and sends a welcome email.
//
// Required environment variable (set in Vercel Dashboard):
//   RESEND_API_KEY      — from https://resend.com/api-keys
//
// Optional environment variables:
//   RESEND_FROM_EMAIL   — sender address (default: Career Pakistan <hello@careerpk.co>)
//   RESEND_AUDIENCE_ID  — your Resend audience/list ID (enables list management)
//
// Called from: contact.html subscribe form, newsletter widget on any page.

'use strict';

const RESEND_API  = 'https://api.resend.com';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBody(req) {
  if (!req.body) return {};
  const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!b || typeof b !== 'object') throw new Error('Body must be a JSON object.');
  return b;
}

function buildWelcomeHtml(name) {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#0f766e;padding:20px 24px;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;">Welcome to Career Pakistan 🎓</h1>
          <p style="margin:8px 0 0;font-size:13px;opacity:.85;">Pakistan's career platform for students &amp; professionals</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 14px;font-size:15px;">${greeting}</p>
          <p style="margin:0 0 12px;line-height:1.65;font-size:14px;">
            You're officially subscribed! We'll send you curated updates on scholarships, jobs,
            internships, and exam opportunities across Pakistan — so you never miss a deadline.
          </p>
          <p style="margin:0 0 12px;line-height:1.65;font-size:14px;">
            <strong>What to expect:</strong>
          </p>
          <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.8;">
            <li>🎓 New scholarship openings (HEC, Aga Khan, Fulbright, and more)</li>
            <li>💼 Government and private job listings</li>
            <li>🚀 Internship opportunities nationwide</li>
            <li>📝 Upcoming exam dates &amp; registration deadlines</li>
            <li>📚 Free study material &amp; past papers</li>
          </ul>
          <a href="https://careerpk.vercel.app" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
            Browse Opportunities →
          </a>
          <p style="margin:20px 0 0;font-size:13px;color:#64748b;">— Team Career Pakistan</p>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#94a3b8;line-height:1.5;">
          You received this because you subscribed on Career Pakistan.
          You can unsubscribe at any time from future emails.
        </div>
      </div>
    </div>
  `;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  let payload;
  try {
    payload = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: `Bad request: ${err.message}` });
  }

  const email = String(payload?.email || '').trim().toLowerCase();
  const name  = String(payload?.name  || '').trim().slice(0, 100);

  if (!email) {
    return res.status(400).json({ error: 'Missing required field: email' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[CareerPK] subscribe: RESEND_API_KEY is not set.');
    return res.status(503).json({ error: 'Email service is not configured.' });
  }

  const from       = process.env.RESEND_FROM_EMAIL || 'Career Pakistan <hello@careerpk.co>';
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  try {
    // ── Step 1: Add to Resend audience (if configured) ──────────
    if (audienceId) {
      const contactRes = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          email,
          first_name:   name || undefined,
          unsubscribed: false,
        }),
      });

      if (!contactRes.ok) {
        const errJson  = await contactRes.json().catch(() => ({}));
        const errMsg   = String(errJson?.message || '').toLowerCase();
        const isDup    = contactRes.status === 409
          || errMsg.includes('already exists')
          || errMsg.includes('duplicate');

        if (isDup) {
          return res.status(409).json({ error: 'This email is already subscribed.' });
        }

        // Non-fatal — log but continue to welcome email
        console.warn('[CareerPK] subscribe: Audience insert failed (non-fatal):', contactRes.status, errMsg);
      }
    }

    // ── Step 2: Send welcome email ────────────────────────────────
    const emailRes = await fetch(`${RESEND_API}/emails`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from,
        to:      [email],
        subject: "You're subscribed to Career Pakistan 🎓",
        html:    buildWelcomeHtml(name),
      }),
    });

    if (!emailRes.ok) {
      const errJson = await emailRes.json().catch(() => ({}));
      const errMsg  = String(errJson?.message || '').toLowerCase();
      const isDup   = emailRes.status === 409
        || errMsg.includes('already exists')
        || errMsg.includes('duplicate');

      if (isDup) {
        return res.status(409).json({ error: 'This email is already subscribed.' });
      }

      console.error('[CareerPK] subscribe: Resend email send failed:', emailRes.status, errMsg);
      return res.status(500).json({ error: 'Failed to send welcome email. Please try again.' });
    }

    return res.status(200).json({ ok: true, message: 'Subscribed successfully! Check your email.' });

  } catch (err) {
    console.error('[CareerPK] subscribe: Unexpected error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}

module.exports = handler;
