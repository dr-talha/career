// Career Pakistan — /api/cms.js
// Vercel Serverless Function
// Aggregates ALL published Google Sheet tabs into one JSON payload.
//
// CRITICAL BUG FIX: This file contained the chat-feedback.js code (file swap).
// This is now the correct cms.js implementation.
//
// Also fixed: Cache-Control was 'no-store'. Changed to s-maxage=1800 to match
// sheets.js so both endpoints benefit from Vercel edge caching.
//
// Usage:
//   GET /api/cms
//     → Returns all 7 sheets as typed JSON objects in a single response.
//     → Used by server-side tools, SEO scripts, and any integration that
//       needs all data in one round-trip.
//
//   GET /api/cms?tab=Jobs
//     → Returns only the Jobs tab (same mapper as /api/sheets but parsed server-side).
//
//   GET /api/cms?tab=Jobs&featured=true
//     → Returns only featured Jobs.
//
//   GET /api/cms?tab=Jobs&limit=10
//     → Returns first 10 Jobs (sorted by Posted Date desc).

'use strict';

// ── Sheet URLs — DO NOT CHANGE (master prompt rule) ───────────
const SHEET_URLS = {
  Scholarships:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRdaG_r04rwKR63qkpha0v-REFHkI2M7aXIGNQZf7zmduv8tvV1k4TRBlafEIKKgI8QbXuL6r3rTuMo/pub?output=csv',
  Jobs:          'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfOHaqq2H2iBXWn90i11S0bfbPUa--m4Hrkvh34TC11KDTyZymdcTCryAnckRZ8MjeAUb7Bh1-6i4s/pub?output=csv',
  Internships:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vRrDPiwb4Ow0LwD2RJWpATk0b3Blrd_PR21vBn3IPes1EC6Uf9YqDucsF5jWwFrlVB_kA7oaca8uMCS/pub?output=csv',
  Exams:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1ISsMtV-TMyTQleaS7sxDXAkrGHgk-MobAwOgHry2PLpKaZDQSJbu3JtiaYEYMDQW3M7cFAJO6IPp/pub?output=csv',
  Books:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUvgf_xYBH5igPoaGKEWTvk9MxA_VJ7a8104rnB1GJz0ef-zpjy05CjF5_XSlOEDAXh_2CzQOqn9ww/pub?output=csv',
  Notifications: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQlGJdIw3YLBDWCXA7xnDyruQXlsDzm8KJ1cEqrjjwy-0G4leIFOp2yQF6FMhbw9hBnbajs0qb-dsrB/pub?output=csv',
  Blogs:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vRciVbiyyI9Kk7LS99tAB3fAYMmMebHCAAi4WdpzKwPLKh0xb57GHRr99sN1audsiOqP2Ix_kx3Ocmo/pub?output=csv',
};

const VALID_TABS = Object.keys(SHEET_URLS);

// ── CSV parser ─────────────────────────────────────────────────
function parseCsv(csvText) {
  if (!csvText || !csvText.trim()) return [];
  const rows = [];
  let row = [], cell = '', inQ = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch   = csvText[i];
    const next = csvText[i + 1];

    if (inQ) {
      if (ch === '"' && next === '"') { cell += '"'; i++; continue; }
      if (ch === '"') { inQ = false; continue; }
      cell += ch;
      continue;
    }

    if (ch === '"')  { inQ = true; continue; }
    if (ch === ',')  { row.push(cell.trim()); cell = ''; continue; }
    if (ch === '\r') { continue; }
    if (ch === '\n') {
      row.push(cell.trim()); cell = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(v => v)) rows.push(row); }
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map((vals, idx) => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = (vals[i] || '').trim(); });
    // Inject synthetic id if sheet has no ID column
    if (!obj.id && !obj.ID) obj.id = String(idx + 1);
    return obj;
  }).filter(obj => headers.some(h => obj[h]));
}

// ── Helpers ────────────────────────────────────────────────────
function g(row, keys) {
  for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; }
  return '';
}
function bool(v) {
  const s = String(v || '').toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

// ── Mappers (same field mappings as google-sheet-loader.js) ────
const MAPPERS = {
  Jobs: (r) => ({
    id: g(r,['ID','id']) || r.id, title: g(r,['Title']), type: g(r,['Type']),
    location: g(r,['Location']), salary: g(r,['Salary']),
    organization: g(r,['Organization']), apply_link: g(r,['Apply Link','Link']),
    deadline: g(r,['Deadline']), category: g(r,['Category']),
    province: g(r,['Province']), experience: g(r,['Experience']),
    education: g(r,['Education']), tags: g(r,['Tags']),
    is_featured: bool(g(r,['Is Featured','Featured'])),
    posted_date: g(r,['Posted Date','Date Added']),
    short_description: g(r,['Short Description','Summary']),
    image_url: g(r,['Image Link','Image URL','Image']),
    details: g(r,['Details','Description']),
    pdf_link: g(r,['PDF Link','PDF']),
    source_link: g(r,['Source Link']),
  }),
  Scholarships: (r) => ({
    id: g(r,['ID','id']) || r.id, title: g(r,['Title']), country: g(r,['Country']),
    funding: g(r,['Funding','Amount']), deadline: g(r,['Deadline','Application Deadline']),
    eligibility: g(r,['Eligibility']), apply_link: g(r,['Apply Link','Link']),
    type: g(r,['Type']), level: g(r,['Level']), field: g(r,['Field']),
    university: g(r,['University']), province: g(r,['Province']),
    tags: g(r,['Tags']), is_featured: bool(g(r,['Is Featured','Featured'])),
    posted_date: g(r,['Posted Date','Date Added']),
    short_description: g(r,['Short Description','Summary']),
    image_url: g(r,['Image Link','Image URL','Image']),
    details: g(r,['Details','Description']), pdf_link: g(r,['PDF Link','PDF']),
  }),
  Internships: (r) => ({
    id: g(r,['ID','id']) || r.id, title: g(r,['Title']),
    organization: g(r,['Organization']), location: g(r,['Location']),
    stipend: g(r,['Stipend']), duration: g(r,['Duration']),
    apply_link: g(r,['Apply Link','Link']), deadline: g(r,['Deadline']),
    type: g(r,['Type']), category: g(r,['Category']), tags: g(r,['Tags']),
    is_featured: bool(g(r,['Is Featured','Featured'])),
    posted_date: g(r,['Posted Date','Date Added']),
    short_description: g(r,['Short Description','Summary']),
    education_level: g(r,['Education Level','Education']),
    image_url: g(r,['Image Link','Image URL','Image']),
    details: g(r,['Details','Description']), pdf_link: g(r,['PDF Link','PDF']),
  }),
  Exams: (r) => ({
    id: g(r,['ID','id']) || r.id, title: g(r,['Title','Exam Name']),
    exam_type: g(r,['Exam Type','Type']), test_date: g(r,['Test Date','Date']),
    registration_deadline: g(r,['Registration Deadline']),
    apply_link: g(r,['Apply Link','Link']),
    conducting_body: g(r,['Conducting Body','Authority']),
    fee: g(r,['Fee','Registration Fee']), eligibility: g(r,['Eligibility']),
    syllabus_link: g(r,['Syllabus Link']),
    past_papers_link: g(r,['Past Papers Link','Past Papers']),
    tags: g(r,['Tags']), province: g(r,['Province']),
    short_description: g(r,['Short Description','Summary']),
    is_featured: bool(g(r,['Is Featured','Featured'])),
    posted_date: g(r,['Posted Date','Date Added']),
    category: g(r,['Category']),
    image_url: g(r,['Image Link','Image URL','Image']),
    details: g(r,['Details','Description']), pdf_link: g(r,['PDF Link','PDF']),
    source_link: g(r,['Source Link']),
  }),
  Books: (r) => ({
    id: g(r,['ID','id']) || r.id, title: g(r,['Title','Book Title']),
    author: g(r,['Author']), exam_type: g(r,['Exam Type','For Exam']),
    price: g(r,['Price']), apply_link: g(r,['Apply Link','Link']),
    category: g(r,['Category']), language: g(r,['Language']),
    pages: g(r,['Pages']), edition: g(r,['Edition']),
    is_free: bool(g(r,['Is Free','Free'])),
    tags: g(r,['Tags']), short_description: g(r,['Short Description','Summary']),
    is_featured: bool(g(r,['Is Featured','Featured'])),
    posted_date: g(r,['Posted Date','Date Added']),
    download_link: g(r,['Download Link','PDF Download']),
    image_url: g(r,['Image Link','Image URL','Image']),
    details: g(r,['Details','Description']), pdf_link: g(r,['PDF Link','PDF']),
  }),
  Blogs: (r) => ({
    id: g(r,['ID','id']) || r.id, title: g(r,['Title']),
    category: g(r,['Category']),
    description: g(r,['Description','Content','Details']),
    short_description: g(r,['Short Description','Summary','Excerpt']),
    image_url: g(r,['Image URL','Image Link','Image']),
    author: g(r,['Author']), date: g(r,['Date','Published Date','Posted Date']),
    tags: g(r,['Tags']),
    is_featured: bool(g(r,['Featured?','Featured','Is Featured'])),
    apply_link: g(r,['Apply Link','Link']), pdf_link: g(r,['PDF Link']),
    related_jobs_tags: g(r,['Related Jobs Tags']),
    related_exams_tags: g(r,['Related Exams Tags']),
    read_time: g(r,['Read Time']),
    is_published: bool(g(r,['Is Published','Published'])),
  }),
  Notifications: (r) => ({
    id: g(r,['ID','id']) || r.id,
    message: g(r,['Message','Text','Title']),
    link: g(r,['Link','URL']),
    is_active: bool(g(r,['Is Active','Active','Show'])),
  }),
};

// ── Fetch and map a single tab ─────────────────────────────────
async function fetchTab(name, url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CareerPakistan/2.1)',
      'Accept':     'text/csv, text/plain, */*',
    },
  });

  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);

  const text = await res.text();
  if (text.trim().startsWith('<!') || text.includes('Host not in allowlist')) {
    throw new Error(`${name}: sheet is not publicly accessible.`);
  }

  const rows   = parseCsv(text);
  const mapper = MAPPERS[name] || ((r) => r);
  return rows.map(mapper).filter(item => item && (item.title || item.message));
}

// ── Sort by Posted Date desc ───────────────────────────────────
function sortByDate(items) {
  return [...items].sort((a, b) => {
    const da = new Date(a.posted_date || a.date || 0);
    const db = new Date(b.posted_date || b.date || 0);
    return db - da;
  });
}

// ── Handler ────────────────────────────────────────────────────
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Cache fix — same policy as sheets.js
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const requestedTab  = (req.query.tab || '').trim();
  const featuredOnly  = req.query.featured === 'true';
  const limit         = Math.min(parseInt(req.query.limit || '0', 10), 200) || 0;

  // ── Single-tab mode ─────────────────────────────────────────
  if (requestedTab) {
    if (!VALID_TABS.includes(requestedTab)) {
      return res.status(400).json({
        error: `Unknown tab "${requestedTab}". Valid tabs: ${VALID_TABS.join(', ')}`,
      });
    }

    try {
      let items = await fetchTab(requestedTab, SHEET_URLS[requestedTab]);
      if (featuredOnly) items = items.filter(i => i.is_featured);
      items = sortByDate(items);
      if (limit > 0) items = items.slice(0, limit);

      return res.status(200).json({
        tab:         requestedTab,
        count:       items.length,
        fetchedAt:   new Date().toISOString(),
        data:        items,
      });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  // ── All-tabs mode ───────────────────────────────────────────
  const tabs        = {};
  const errors      = {};
  const lastUpdated = {};

  await Promise.allSettled(
    Object.entries(SHEET_URLS).map(async ([name, url]) => {
      try {
        tabs[name]        = await fetchTab(name, url);
        lastUpdated[name] = new Date().toISOString();
      } catch (err) {
        errors[name]   = err.message;
        tabs[name]     = [];
        console.error(`[CareerPK] cms.js: Failed to fetch ${name}:`, err.message);
      }
    })
  );

  return res.status(200).json({
    tabs,
    lastUpdated,
    fetchedAt:   new Date().toISOString(),
    counts:      Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, v.length])),
    ...(Object.keys(errors).length && { errors }),
  });
}

module.exports = handler;
