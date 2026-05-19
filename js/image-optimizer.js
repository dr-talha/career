(function () {
  if (window._CMS_SHEETS_LOADER_ACTIVE || window.loadCMSData || window._CMS_BOOTSTRAP_DONE) {
    console.info('[CMS] Legacy image-optimizer CMS loader disabled to prevent duplicate rendering/race conditions.');
    return;
  }
  window._CMS_LEGACY_LOADER_ACTIVE = true;
// ============================================================
// Career Pakistan — google-sheet-loader.js  (v7 — Vercel proxy)
// ============================================================
// Fetches data via /api/sheets (Vercel serverless proxy).
// This bypasses Google's "Host not in allowlist" browser block.
// Falls back to direct Google Sheets URL as secondary attempt.
// ============================================================

// Our own Vercel API proxy endpoint
const PROXY_ENDPOINT = '/api/sheets';

// Direct Google Sheets published CSV links (fallback)
const TAB_DEFINITIONS = [
  { name: 'Scholarships',  csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRdaG_r04rwKR63qkpha0v-REFHkI2M7aXIGNQZf7zmduv8tvV1k4TRBlafEIKKgI8QbXuL6r3rTuMo/pub?output=csv', mapper: mapScholarship },
  { name: 'Jobs',          csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfOHaqq2H2iBXWn90i11S0bfbPUa--m4Hrkvh34TC11KDTyZymdcTCryAnckRZ8MjeAUb7Bh1-6i4s/pub?output=csv', mapper: mapJob },
  { name: 'Internships',   csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRrDPiwb4Ow0LwD2RJWpATk0b3Blrd_PR21vBn3IPes1EC6Uf9YqDucsF5jWwFrlVB_kA7oaca8uMCS/pub?output=csv', mapper: mapInternship },
  { name: 'Exams',         csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1ISsMtV-TMyTQleaS7sxDXAkrGHgk-MobAwOgHry2PLpKaZDQSJbu3JtiaYEYMDQW3M7cFAJO6IPp/pub?output=csv', mapper: mapExam },
  { name: 'Books',         csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUvgf_xYBH5igPoaGKEWTvk9MxA_VJ7a8104rnB1GJz0ef-zpjy05CjF5_XSlOEDAXh_2CzQOqn9ww/pub?output=csv', mapper: mapBook },
  { name: 'Notifications', csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQlGJdIw3YLBDWCXA7xnDyruQXlsDzm8KJ1cEqrjjwy-0G4leIFOp2yQF6FMhbw9hBnbajs0qb-dsrB/pub?output=csv', mapper: mapNotification },
  // Blogs tab is now loaded here too for shared cache/debug visibility.
  { name: 'Blogs',         csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRciVbiyyI9Kk7LS99tAB3fAYMmMebHCAAi4WdpzKwPLKh0xb57GHRr99sN1audsiOqP2Ix_kx3Ocmo/pub?output=csv', mapper: mapBlog },
];

// ── Global data object ────────────────────────────────────────
window.CMS_DATA = { Scholarships: [], Jobs: [], Internships: [], Exams: [], Books: [], Notifications: [], Blogs: [] };
window._CMS_READY             = false;
window._CMS_CALLBACKS         = [];
window._CMS_REFRESH_LISTENERS = [];
window._CMS_REFRESH_CONFIG    = { interval: 2 * 60 * 1000, enabled: true };

window.onCMSReady = function(fn) {
  if (window._CMS_READY) { fn(window.CMS_DATA); return; }
  window._CMS_CALLBACKS.push(fn);
};
window.onCMSRefresh = function(fn) {
  window._CMS_REFRESH_LISTENERS.push(fn);
};
function _fireReady() {
  window._CMS_READY = true;
  window._CMS_CALLBACKS.forEach(fn => { try { fn(window.CMS_DATA); } catch(e) { console.error('[CMS]', e); } });
  window._CMS_CALLBACKS = [];
  document.dispatchEvent(new CustomEvent('cmsReady', { detail: window.CMS_DATA }));
}
function _fireRefresh(changedTabs) {
  window._CMS_REFRESH_LISTENERS.forEach(fn => {
    try { fn(window.CMS_DATA, changedTabs); } catch(e) { console.error('[CMS]', e); }
  });
  document.dispatchEvent(new CustomEvent('cmsRefresh', { detail: { data: window.CMS_DATA, changed: changedTabs } }));
}

// ── Loading banner ────────────────────────────────────────────
function _showBanner(msg, color) {
  let b = document.getElementById('ch-loading-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'ch-loading-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;color:#fff;text-align:center;padding:9px 16px;font-family:"DM Sans",sans-serif;font-size:14px;transition:opacity .5s;';
    document.body.prepend(b);
  }
  b.style.background = color || 'linear-gradient(90deg,#0f766e,#0d9488)';
  b.style.opacity = '1';
  b.innerHTML = msg;
}
function _hideBanner() {
  const b = document.getElementById('ch-loading-banner');
  if (b) { b.style.opacity = '0'; setTimeout(() => b.remove(), 600); }
}

// ── Fetch CSV text from a URL ─────────────────────────────────
async function _getText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('error')) {
    try {
      const parsed = JSON.parse(trimmed);
      throw new Error(parsed.error || 'proxy error');
    } catch {
      throw new Error('proxy error');
    }
  }
  if (trimmed.startsWith('<!')) throw new Error('HTML response');
  if (text.includes('Host not in allowlist')) throw new Error('Host not in allowlist');
  return text;
}

// ── Fetch one tab: try proxy first, then direct ───────────────
async function _fetchCSV(tab) {
  // Strategy 1: Our Vercel proxy (server-side, bypasses browser blocks)
  try {
    const url = PROXY_ENDPOINT + '?sheet=' + tab.name + '&_t=' + Date.now();
    return await _getText(url);
  } catch (e1) {
    console.warn('[CMS] Proxy failed for', tab.name, '—', e1.message, '— trying direct…');
  }

  // Strategy 2: Direct published CSV URL
  try {
    const url = tab.csvUrl + '&_t=' + Date.now();
    return await _getText(url);
  } catch (e2) {
    console.warn('[CMS] Direct also failed for', tab.name, '—', e2.message);
    return '';
  }
}

// ── CSV parser ────────────────────────────────────────────────
function _parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { field += ch; }
    } else {
      if      (ch === '"')  { inQ = true; }
      else if (ch === ',')  { row.push(field.trim()); field = ''; }
      else if (ch === '\r') {}
      else if (ch === '\n') {
        row.push(field.trim()); field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

function _csvToObjects(text) {
  if (!text || !text.trim()) return [];
  const rows = _parseCSV(text);
  if (rows.length < 2) return [];
  let hIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const normalizedHeaders = rows[r].map(c => _normalizeHeaderKey(c));
    const hasKnownHeader =
      normalizedHeaders.includes('id') ||
      normalizedHeaders.includes('title') ||
      normalizedHeaders.includes('message') ||
      normalizedHeaders.includes('description') ||
      normalizedHeaders.includes('applylink');
    if (hasKnownHeader) { hIdx = r; break; }
  }
  if (hIdx === -1) hIdx = 0;
  const headers = rows[hIdx].map(h => h.trim());
  const out = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(cell => String(cell || '').trim() === '')) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
    obj.__rowIndex = r - hIdx;
    obj.__norm = _normalizeRowHeaders(obj);
    out.push(obj);
  }
  return out;
}

function _normalizeHeaderKey(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function _normalizeRowHeaders(row) {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    normalized[_normalizeHeaderKey(key)] = row[key];
  });
  return normalized;
}

function _getField(row, aliases, fallback = '') {
  for (const alias of aliases) {
    if (row[alias] != null && row[alias] !== '') return row[alias];
    const normalized = row.__norm?.[_normalizeHeaderKey(alias)];
    if (normalized != null && normalized !== '') return normalized;
  }
  return fallback;
}

function _bool(v) {
  return /^(yes|true|1|y|active|on|✅)$/i.test(String(v || '').trim());
}

function _mapRichContentFields(r) {
  return {
    details: _getField(r, ['Details', 'Long Description', 'Full Details']),
    pdf_link: _getField(r, ['PDF Link', 'Brochure PDF', 'Document PDF']),
    pdf_links: _getField(r, ['PDF Links', 'Documents']),
    image_links: _getField(r, ['Image Links', 'Gallery']),
    media_links: _getField(r, ['Media Links', 'Resources', 'Attachments']),
    source_link: _getField(r, ['Source Link', 'Official Link']),
  };
}

// ── Mappers ───────────────────────────────────────────────────
function mapScholarship(r) {
  return {
    id: Number(_getField(r, ['ID'])) || Number(r.__rowIndex) || 0,
    title: _getField(r, ['Title']),
    description: _getField(r, ['Description']),
    country: _getField(r, ['Country']),
    type: _getField(r, ['Type']),
    funding: _getField(r, ['Funding']),
    deadline: _getField(r, ['Deadline']),
    posted_date: _getField(r, ['Posted', 'Posted Date']),
    apply_link: _getField(r, ['Apply Link', 'Apply URL']),
    tags: _getField(r, ['Tags']),
    is_featured: _bool(_getField(r, ['Featured?', 'Featured'])),
    image_url: _getField(r, ['Image URL', 'Image']),
    location: _getField(r, ['Location']),
    level: _getField(r, ['Level']),
    host_organization: _getField(r, ['Host Organization', 'Host Organisation']),
    ..._mapRichContentFields(r),
  };
}
function mapJob(r) {
  return {
    id: Number(_getField(r, ['ID'])) || Number(r.__rowIndex) || 0,
    title: _getField(r, ['Title']),
    description: _getField(r, ['Description']),
    category: _getField(r, ['Category']),
    country: _getField(r, ['Country']),
    type: _getField(r, ['Type']),
    deadline: _getField(r, ['Deadline']),
    posted_date: _getField(r, ['Posted', 'Posted Date']),
    apply_link: _getField(r, ['Apply Link', 'Apply URL']),
    tags: _getField(r, ['Tags']),
    is_featured: _bool(_getField(r, ['Featured?', 'Featured'])),
    image_url: _getField(r, ['Image URL', 'Image']),
    location: _getField(r, ['Location']),
    salary: _getField(r, ['Salary']),
    experience: _getField(r, ['Experience']),
    ..._mapRichContentFields(r),
  };
}
function mapInternship(r) {
  return {
    id: Number(_getField(r, ['ID'])) || Number(r.__rowIndex) || 0,
    title: _getField(r, ['Title']),
    description: _getField(r, ['Description']),
    organization: _getField(r, ['Organization', 'Organisation']),
    country: _getField(r, ['Country']),
    stipend: _getField(r, ['Stipend']),
    deadline: _getField(r, ['Deadline']),
    posted_date: _getField(r, ['Posted', 'Posted Date']),
    apply_link: _getField(r, ['Apply Link', 'Apply URL']),
    tags: _getField(r, ['Tags']),
    is_featured: _bool(_getField(r, ['Featured?', 'Featured'])),
    image_url: _getField(r, ['Image URL', 'Image']),
    location: _getField(r, ['Location']),
    duration: _getField(r, ['Duration']),
    type: _getField(r, ['Type']),
    ..._mapRichContentFields(r),
  };
}
function mapExam(r) {
  return {
    id: Number(_getField(r, ['ID'])) || Number(r.__rowIndex) || 0,
    title: _getField(r, ['Title']),
    category: _getField(r, ['Category', 'Exam Category']),
    exam_type: _getField(r, ['Exam Type']),
    syllabus_link: _getField(r, ['Syllabus Link']),
    test_date: _getField(r, ['Test Date']),
    results_link: _getField(r, ['Results Link']),
    past_papers_link: _getField(r, ['Past Papers Link']),
    fee: _getField(r, ['Fee']),
    tags: _getField(r, ['Tags']),
    image_url: _getField(r, ['Image URL', 'Image']),
    registration_link: _getField(r, ['Registration Link']),
    eligibility: _getField(r, ['Eligibility']),
    conducting_body: _getField(r, ['Conducting Body']),
    details: _getField(r, ['Details', 'Description', 'Long Description']),
    ..._mapRichContentFields(r),
  };
}
function mapBook(r) {
  return {
    id: Number(_getField(r, ['ID'])) || Number(r.__rowIndex) || 0,
    title: _getField(r, ['Title']),
    category: _getField(r, ['Category']),
    exam_type: _getField(r, ['Exam Type']),
    author: _getField(r, ['Author']),
    download_link: _getField(r, ['Download Link']),
    buy_link: _getField(r, ['Buy Link']),
    is_free: _bool(_getField(r, ['Free?', 'Free'])),
    tags: _getField(r, ['Tags']),
    image_url: _getField(r, ['Image URL', 'Image']),
    edition: _getField(r, ['Edition']),
    language: _getField(r, ['Language']),
    details: _getField(r, ['Details', 'Description', 'Long Description']),
    ..._mapRichContentFields(r),
  };
}
function mapBlog(r) {
  return {
    id: _getField(r, ['ID']) || String(r.__rowIndex || ''),
    title: _getField(r, ['Title']),
    category: _getField(r, ['Category']),
    description: _getField(r, ['Description', 'Content', 'Details']),
    short_description: _getField(r, ['Short Description', 'Summary', 'Excerpt']),
    image_url: _getField(r, ['Image URL', 'Image']),
    author: _getField(r, ['Author']),
    date: _getField(r, ['Date', 'Published Date', 'Posted Date']),
    tags: _getField(r, ['Tags']),
    is_featured: _bool(_getField(r, ['Featured?', 'Featured'])),
    apply_link: _getField(r, ['Apply Link', 'Link', 'URL']),
    pdf_link: _getField(r, ['PDF Link', 'Document Link']),
    ..._mapRichContentFields(r),
  };
}

function _isValidMappedItem(item) {
  const primaryText = (item.title || item.message || '').trim();
  const hasPrimaryText = primaryText.length > 0;
  const hasNumericId = Number(item.id) > 0;
  const hasStringId = String(item.id || '').trim().length > 0;
  return hasPrimaryText && (hasNumericId || hasStringId);
}

function mapNotification(r) {
  const expiry = _getField(r, ['Expiry Date', 'Expiry']);
  const expired = expiry ? new Date(expiry) < new Date() : false;
  return {
    id: Number(_getField(r, ['ID'])) || Number(r.__rowIndex) || 0,
    message: _getField(r, ['Message']),
    type: _getField(r, ['Type']),
    expiry_date: expiry,
    is_active: _bool(_getField(r, ['Active?', 'Active'])) && !expired,
    link: _getField(r, ['Link']),
  };
}

// ── Load all sheets ───────────────────────────────────────────
async function _loadAllSheets(silent) {
  if (!silent) _showBanner('⏳ Loading live data…');
  const timeoutMs = 12000;
  const withTimeout = (promise, name) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(name + ' timeout')), timeoutMs)),
  ]);
  const results = await Promise.allSettled(
    TAB_DEFINITIONS.map((tab) => withTimeout(_fetchCSV(tab), tab.name))
  );
  const changedTabs = [];
  let loaded = 0;
  TAB_DEFINITIONS.forEach((tab, i) => {
    const result = results[i];
    const text = result.status === 'fulfilled' ? result.value : '';
    if (!text) {
      if (result.status === 'rejected') {
        console.warn('[CMS] Load failed:', tab.name, result.reason?.message || result.reason);
      }
      window.CMS_DATA[tab.name] = [];
      return;
    }
    try {
      const mapped = _csvToObjects(text).map(tab.mapper).filter(_isValidMappedItem);
      const prev = JSON.stringify(window.CMS_DATA[tab.name]);
      window.CMS_DATA[tab.name] = mapped;
      if (prev !== JSON.stringify(mapped)) changedTabs.push(tab.name);
      loaded++;
      console.info('[CMS] ✅ ' + tab.name + ': ' + mapped.length + ' items');
    } catch (err) {
      console.error('[CMS] Parse error:', tab.name, err);
    }
  });
  if (loaded > 0) {
    _hideBanner();
  } else {
    document.dispatchEvent(new CustomEvent('cmsLoadFailed'));
    _showBanner('⚠️ Data load failed. Check your Google Sheet is published publicly.', '#b45309');
    setTimeout(_hideBanner, 6000);
  }
  return changedTabs;
}

window.refreshCMSData = async function() {
  _showBanner('🔄 Refreshing…');
  const changed = await _loadAllSheets(true);
  _hideBanner();
  if (changed.length) _fireRefresh(changed);
};
window.startAutoRefresh = function() {
  clearInterval(window._CMS_AUTO_REFRESH_TIMER);
  window._CMS_AUTO_REFRESH_TIMER = setInterval(() => {
    if (window._CMS_REFRESH_CONFIG.enabled) window.refreshCMSData();
  }, window._CMS_REFRESH_CONFIG.interval);
};
window.stopAutoRefresh = function() { clearInterval(window._CMS_AUTO_REFRESH_TIMER); };

(async function() {
  await _loadAllSheets(false);
  _fireReady();
  window.startAutoRefresh();
})();

})();
