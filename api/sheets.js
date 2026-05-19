// Career Pakistan — /api/sheets.js
// Vercel Serverless Function
// Server-side proxy for Google Sheets CSV data.
// Each category maps to its own published Google Sheet.
//
// BUG FIX #2 (master prompt):
//   Was: Cache-Control: no-store, no-cache, must-revalidate, max-age=0
//   Now: Cache-Control: s-maxage=1800, stale-while-revalidate=3600
//   Effect: Vercel edge caches each sheet for 30 minutes — biggest single
//   performance win. Removes the cold-hit on Google's CDN every page load.
//
// IMPORTANT — DO NOT CHANGE THESE URLs (master prompt rule):
//   They are your live published Google Sheets. Changing them will break
//   all content loading across the entire site.

'use strict';

const SHEET_URLS = {
  Scholarships:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRdaG_r04rwKR63qkpha0v-REFHkI2M7aXIGNQZf7zmduv8tvV1k4TRBlafEIKKgI8QbXuL6r3rTuMo/pub?output=csv',
  Jobs:          'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfOHaqq2H2iBXWn90i11S0bfbPUa--m4Hrkvh34TC11KDTyZymdcTCryAnckRZ8MjeAUb7Bh1-6i4s/pub?output=csv',
  Internships:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vRrDPiwb4Ow0LwD2RJWpATk0b3Blrd_PR21vBn3IPes1EC6Uf9YqDucsF5jWwFrlVB_kA7oaca8uMCS/pub?output=csv',
  Exams:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1ISsMtV-TMyTQleaS7sxDXAkrGHgk-MobAwOgHry2PLpKaZDQSJbu3JtiaYEYMDQW3M7cFAJO6IPp/pub?output=csv',
  Books:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUvgf_xYBH5igPoaGKEWTvk9MxA_VJ7a8104rnB1GJz0ef-zpjy05CjF5_XSlOEDAXh_2CzQOqn9ww/pub?output=csv',
  Notifications: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQlGJdIw3YLBDWCXA7xnDyruQXlsDzm8KJ1cEqrjjwy-0G4leIFOp2yQF6FMhbw9hBnbajs0qb-dsrB/pub?output=csv',
  Blogs:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vRciVbiyyI9Kk7LS99tAB3fAYMmMebHCAAi4WdpzKwPLKh0xb57GHRr99sN1audsiOqP2Ix_kx3Ocmo/pub?output=csv',
};

const VALID_SHEETS = Object.keys(SHEET_URLS);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function handler(req, res) {
  setCors(res);

  // ✅ BUG FIX #2 — was: 'no-store, no-cache, must-revalidate, max-age=0'
  // Vercel edge caches per sheet for 30 min; stale responses served during revalidation.
  // Per-sheet caching means a cold hit on one sheet does not affect the others.
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Support both ?sheet= and ?type= query params for backwards compatibility
  const sheet = (req.query.sheet || req.query.type || '').trim();
  const sourceUrl = SHEET_URLS[sheet];

  if (!sheet) {
    return res.status(400).json({
      error: `Missing ?sheet= parameter. Valid values: ${VALID_SHEETS.join(', ')}`,
    });
  }

  if (!sourceUrl) {
    return res.status(400).json({
      error: `Unknown sheet "${sheet}". Valid values: ${VALID_SHEETS.join(', ')}`,
    });
  }

  try {
    const upstream = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CareerPakistan/2.0; +https://careerpk.vercel.app)',
        'Accept': 'text/csv, text/plain, */*',
      },
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: `Google Sheets returned HTTP ${upstream.status} for sheet "${sheet}". The sheet may be temporarily unavailable.`,
      });
    }

    const text = await upstream.text();

    // Detect error pages returned with HTTP 200
    if (text.trim().startsWith('<!')) {
      return res.status(502).json({
        error: `Sheet "${sheet}" returned an HTML error page. Ensure it is published publicly: File → Share → Publish to web → CSV.`,
      });
    }

    if (text.includes('Host not in allowlist')) {
      return res.status(502).json({
        error: `Sheet "${sheet}" is not accessible from this server. Check publish settings in Google Sheets.`,
      });
    }

    // Empty sheet — return empty CSV header response rather than crashing the loader
    if (!text.trim()) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.status(200).send('');
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    console.error(`[CareerPK] sheets.js fetch error for "${sheet}":`, err.message);
    return res.status(500).json({
      error: `Failed to fetch sheet "${sheet}": ${err.message}`,
    });
  }
}

module.exports = handler;
