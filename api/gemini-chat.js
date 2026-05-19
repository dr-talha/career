// Career Pakistan — /api/gemini-chat.js
// Vercel Serverless Function
// Unified AI proxy: Gemini primary, Groq as automatic fallback.
//
// Required environment variables (set in Vercel Dashboard → Settings → Environment Variables):
//   GEMINI_API_KEY   — from https://aistudio.google.com/app/apikey
//   GROQ_API_KEY     — from https://console.groq.com (optional, enables fallback)
//
// Optional overrides:
//   GEMINI_MODEL     — default: gemini-2.0-flash
//   GROQ_MODEL       — default: llama-3.1-8b-instant

'use strict';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GROQ_MODEL   = process.env.GROQ_MODEL   || 'llama-3.1-8b-instant';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (!req.body) return {};
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object') throw new Error('Request body must be a JSON object.');
  return body;
}

// Convert Gemini-format payload → OpenAI-compatible messages for Groq
function toGroqMessages(payload) {
  const systemText = (payload?.system_instruction?.parts || [])
    .map((p) => p.text || '')
    .filter(Boolean)
    .join('\n');

  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });

  (Array.isArray(payload?.contents) ? payload.contents : []).forEach((item) => {
    const role    = item?.role === 'model' ? 'assistant' : 'user';
    const content = (Array.isArray(item?.parts) ? item.parts : [])
      .map((p) => p?.text || '')
      .join('\n')
      .trim();
    if (content) messages.push({ role, content });
  });

  return messages;
}

async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set.');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  return res.json();
}

async function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens:  1024,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();

  // Normalise Groq response to match Gemini response shape so callers need no adapter
  return {
    candidates: [{
      content: {
        parts: [{ text: data.choices?.[0]?.message?.content || '' }],
      },
    }],
    _provider: 'groq',
  };
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    return res.status(204).end();
  }

  setCors(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: `Bad request: ${err.message}` });
  }

  // ── Try Gemini first ─────────────────────────────────────────
  try {
    const result = await callGemini(payload);
    return res.status(200).json(result);
  } catch (geminiErr) {
    console.warn('[CareerPK] gemini-chat: Gemini failed, falling back to Groq.', geminiErr.message);
  }

  // ── Groq fallback ─────────────────────────────────────────────
  try {
    const messages = toGroqMessages(payload);
    if (!messages.length) {
      return res.status(400).json({ error: 'No messages found in request payload.' });
    }
    const result = await callGroq(messages);
    return res.status(200).json(result);
  } catch (groqErr) {
    console.error('[CareerPK] gemini-chat: Both providers failed.', groqErr.message);
    return res.status(502).json({
      error: 'AI service temporarily unavailable. Please try again in a moment.',
    });
  }
}

module.exports = handler;
