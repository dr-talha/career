// Career Pakistan — /api/web-search.js
// Vercel Serverless Function
// Provides web search capability for the Gemini AI chatbot.
// Called by the chatbot when it needs real-time information (latest exam dates,
// recent job listings, current scholarship deadlines, etc.).
//
// CRITICAL BUG FIX: This file contained the subscribe.js code (file swap).
// This is now the correct web-search implementation.
//
// Required environment variable (set in Vercel Dashboard):
//   GOOGLE_SEARCH_API_KEY  — from https://developers.google.com/custom-search/v1/introduction
//   GOOGLE_SEARCH_CX       — Custom Search Engine ID from https://programmablesearchengine.google.com
//
// Fallback: If keys are not set, returns a graceful "search unavailable" response
// instead of crashing, so the chatbot continues working without search.

'use strict';

const GOOGLE_API = 'https://www.googleapis.com/customsearch/v1';

// Safe-list of domains the chatbot should prefer for Pakistan-related queries
const TRUSTED_DOMAINS = [
  'hec.gov.pk', 'fpsc.gov.pk', 'ppsc.gop.pk', 'nts.org.pk',
  'agakhanuniversity.edu.pk', 'punjab.gov.pk', 'sindh.gov.pk',
  'mdcat.pk', 'aga-khan.org', 'dawn.com', 'geo.tv',
  'tribune.com.pk', 'brecorder.com',
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (!req.body) return {};
  const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!b || typeof b !== 'object') throw new Error('Body must be JSON object.');
  return b;
}

// Sanitise and truncate snippet for chatbot consumption
function sanitiseSnippet(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

async function searchGoogle(query, num) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx     = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    return { results: [], warning: 'Web search is not configured (missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX).' };
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q:   query,
    num: String(Math.min(Math.max(Number(num) || 5, 1), 10)),
    gl:  'pk',   // geo-locate to Pakistan
    hl:  'en',
  });

  const res = await fetch(`${GOOGLE_API}?${params.toString()}`);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Search API ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();

  const results = (data.items || []).map((item) => ({
    title:   item.title   || '',
    url:     item.link    || '',
    snippet: sanitiseSnippet(item.snippet),
    trusted: TRUSTED_DOMAINS.some((d) => (item.link || '').includes(d)),
  }));

  // Sort: trusted/official sources first
  results.sort((a, b) => (b.trusted ? 1 : 0) - (a.trusted ? 1 : 0));

  return { results };
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

  // No caching on search — results must always be fresh
  res.setHeader('Cache-Control', 'no-store');

  let body;
  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: `Bad request: ${err.message}` });
  }

  const query = String(body?.query || body?.q || '').trim();
  const num   = body?.num || 5;

  if (!query) {
    return res.status(400).json({ error: 'Missing required field: query' });
  }

  if (query.length > 500) {
    return res.status(400).json({ error: 'Query too long (max 500 characters).' });
  }

  try {
    const { results, warning } = await searchGoogle(query, num);
    return res.status(200).json({
      query,
      results,
      count:     results.length,
      ...(warning && { warning }),
    });
  } catch (err) {
    console.error('[CareerPK] web-search error:', err.message);
    return res.status(502).json({
      error: 'Search temporarily unavailable.',
      query,
      results: [],
    });
  }
}

module.exports = handler;
