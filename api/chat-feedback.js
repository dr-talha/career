// Career Pakistan — /api/chat-feedback.js
// Vercel Serverless Function
// Stores chatbot thumbs-up / thumbs-down feedback in Supabase.
//
// Supabase setup — run this once in your Supabase SQL editor:
// ─────────────────────────────────────────────────────────────
// create table chat_feedback (
//   id         bigserial    primary key,
//   rating     text,
//   message    text,
//   session_id text,
//   page       text,
//   user_agent text,
//   created_at timestamptz  default now()
// );
// alter table chat_feedback enable row level security;
// create policy "insert only" on chat_feedback for insert with check (true);
// ─────────────────────────────────────────────────────────────
//
// Required environment variables (set in Vercel Dashboard):
//   SUPABASE_URL       — your project URL, e.g. https://xyz.supabase.co
//   SUPABASE_ANON_KEY  — your project anon/public key
//
// Graceful degradation: if Supabase is not configured, feedback is logged to
// Vercel console (visible in Vercel → Logs) and a 200 OK is still returned
// so the chatbot UI doesn't show an error to the user.

'use strict';

const ALLOWED_RATINGS = new Set(['up', 'down', 'thumbs_up', 'thumbs_down', 'positive', 'negative', '1', '0', '-1']);

function parseBody(req) {
  if (!req.body) return {};
  const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!b || typeof b !== 'object') throw new Error('Body must be a JSON object.');
  return b;
}

async function insertToSupabase(feedback) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Graceful degradation — log and return without error
    console.log('[CareerPK] chat-feedback (no Supabase configured):', JSON.stringify(feedback));
    return { skipped: true };
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/chat_feedback`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(feedback),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase insert failed ${res.status}: ${errText.slice(0, 150)}`);
  }

  return { inserted: true };
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

  const rating     = String(payload?.rating     || '').trim().toLowerCase();
  const message    = String(payload?.message    || '').trim().slice(0, 2000);
  const sessionId  = String(payload?.sessionId  || '').trim().slice(0, 128);
  const page       = String(payload?.page       || '').trim().slice(0, 256);
  const userAgent  = String(req.headers?.['user-agent'] || '').slice(0, 256);

  // Validate rating
  if (rating && !ALLOWED_RATINGS.has(rating)) {
    return res.status(400).json({
      error: `Invalid rating "${rating}". Allowed: ${[...ALLOWED_RATINGS].join(', ')}`,
    });
  }

  const feedback = {
    rating:     rating     || null,
    message:    message    || null,
    session_id: sessionId  || null,
    page:       page       || null,
    user_agent: userAgent  || null,
  };

  try {
    await insertToSupabase(feedback);
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Non-fatal — log but return 200 so the chatbot UI doesn't break
    console.error('[CareerPK] chat-feedback: insert error (non-fatal):', err.message);
    return res.status(200).json({ ok: true, warning: 'Feedback received but could not be stored.' });
  }
}

module.exports = handler;
