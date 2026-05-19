// ============================================================
// Career Pakistan — google-sheet-loader.js  (v2)
// Loads CMS data from Google Sheets via Vercel API proxy.
//
// BUG FIX #7 (master prompt):
//   - Removed '&_t=' + Date.now() cache-buster from fetch URL.
//     This was defeating Vercel's edge cache on every request.
//   - Changed cache: 'no-store' → cache: 'default' so the browser
//     and Vercel CDN can cache responses properly.
//
// NEW COLUMNS MAPPED (master prompt Session 2):
//   Jobs: Deadline, Category, Province, Experience, Education,
//         Tags, Is Featured, Posted Date, Short Description
//   Scholarships: Type, Level, Field, University, Tags,
//                 Is Featured, Posted Date, Short Description, Province
//   Internships: Deadline, Type, Category, Tags, Is Featured,
//                Posted Date, Short Description, Education Level
//   Exams: Conducting Body, Fee, Eligibility, Syllabus Link,
//          Past Papers Link, Tags, Province, Short Description,
//          Is Featured, Posted Date
//   Books: Category, Language, Pages, Edition, Is Free, Tags,
//          Short Description, Is Featured, Posted Date, Download Link
//   Blogs: Related Jobs Tags, Related Exams Tags, Read Time, Is Published
// ============================================================

const SHEETS_BASE_URL = '/api/sheets';

const SHEETS_CONFIG = [
  { name: 'Scholarships', csvUrl: `${SHEETS_BASE_URL}?sheet=Scholarships`, mapper: mapScholarship },
  { name: 'Jobs',         csvUrl: `${SHEETS_BASE_URL}?sheet=Jobs`,         mapper: mapJob         },
  { name: 'Internships',  csvUrl: `${SHEETS_BASE_URL}?sheet=Internships`,  mapper: mapInternship  },
  { name: 'Exams',        csvUrl: `${SHEETS_BASE_URL}?sheet=Exams`,        mapper: mapExam        },
  { name: 'Books',        csvUrl: `${SHEETS_BASE_URL}?sheet=Books`,        mapper: mapBook        },
  { name: 'Blogs',        csvUrl: `${SHEETS_BASE_URL}?sheet=Blogs`,        mapper: mapBlog        },
  { name: 'Notifications',csvUrl: `${SHEETS_BASE_URL}?sheet=Notifications`,mapper: mapNotification},
];

window.CMS_DATA    = window.CMS_DATA    || {};
window._CMS_SHEETS_LOADER_ACTIVE = true;
window.CMS_LOADING = window.CMS_LOADING || {};
window.CMS_LOADING.global = window.CMS_LOADING.global || false;

// ── Utilities ─────────────────────────────────────────────────
function _getField(r, keys) {
  for (const key of keys) {
    const val = r[key];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return '';
}

function _bool(val) {
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function _num(val, fallback = null) {
  const n = Number(String(val ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function _date(val) {
  const raw = String(val ?? '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

function _mapRichContentFields(r) {
  const pdfRaw = _getField(r, ['PDF Links', 'PDF Link', 'PDF']);
  const imgRaw = _getField(r, ['Image Links', 'Image Link', 'Image URL', 'Image']);
  return {
    details:     _getField(r, ['Details', 'Description']),
    pdfLinks:   pdfRaw  ? [pdfRaw]  : [],
    imageLinks: imgRaw  ? [imgRaw]  : [],
    mediaLinks: _getField(r, ['Media Links', 'Media Link']) ? [_getField(r, ['Media Links', 'Media Link'])] : [],
    sourceLink: _getField(r, ['Source Link', 'External Link']),
  };
}

// ── Mapper functions ──────────────────────────────────────────

function mapScholarship(r) {
  return {
    id:                _getField(r, ['ID']) || String(r.__rowIndex || ''),
    title:             _getField(r, ['Title']),
    country:           _getField(r, ['Country']),
    funding:           _getField(r, ['Funding', 'Amount']),
    deadline:          _date(_getField(r, ['Deadline', 'Application Deadline'])),
    eligibility:       _getField(r, ['Eligibility']),
    applyLink:        _getField(r, ['Apply Link', 'Link', 'URL']),
    // New columns
    type:              _getField(r, ['Type']),
    level:             _getField(r, ['Level']),
    field:             _getField(r, ['Field']),
    university:        _getField(r, ['University']),
    province:          _getField(r, ['Province']),
    tags:              _getField(r, ['Tags']),
    isFeatured:       _bool(_getField(r, ['Is Featured', 'Featured'])),
    postedDate:       _date(_getField(r, ['Posted Date', 'Date Added'])),
    shortDescription: _getField(r, ['Short Description', 'Summary', 'Excerpt']),
    imageUrl:         _getField(r, ['Image Link', 'Image URL', 'Image']),
    ..._mapRichContentFields(r),
  };
}

function mapJob(r) {
  return {
    id:                _getField(r, ['ID']) || String(r.__rowIndex || ''),
    title:             _getField(r, ['Title', 'Position']),
    type:              _getField(r, ['Type', 'Job Type']),
    location:          _getField(r, ['Location', 'City']),
    salary:            _getField(r, ['Salary', 'Compensation']),
    organization:      _getField(r, ['Organization', 'Company']),
    applyLink:        _getField(r, ['Apply Link', 'Link', 'URL']),
    // New columns
    deadline:          _date(_getField(r, ['Deadline'])),
    category:          _getField(r, ['Category']),
    province:          _getField(r, ['Province']),
    experience:        _getField(r, ['Experience']),
    education:         _getField(r, ['Education']),
    tags:              _getField(r, ['Tags']),
    isFeatured:       _bool(_getField(r, ['Is Featured', 'Featured'])),
    postedDate:       _date(_getField(r, ['Posted Date', 'Date Added'])),
    shortDescription: _getField(r, ['Short Description', 'Summary']),
    imageUrl:         _getField(r, ['Image Link', 'Image URL', 'Image']),
    ..._mapRichContentFields(r),
  };
}

function mapInternship(r) {
  return {
    id:                _getField(r, ['ID']) || String(r.__rowIndex || ''),
    title:             _getField(r, ['Title', 'Position']),
    organization:      _getField(r, ['Organization', 'Company']),
    location:          _getField(r, ['Location', 'City']),
    stipend:           _getField(r, ['Stipend', 'Compensation']),
    duration:          _getField(r, ['Duration']),
    applyLink:        _getField(r, ['Apply Link', 'Link', 'URL']),
    // New columns
    deadline:          _date(_getField(r, ['Deadline'])),
    type:              _getField(r, ['Type']),
    category:          _getField(r, ['Category']),
    tags:              _getField(r, ['Tags']),
    isFeatured:       _bool(_getField(r, ['Is Featured', 'Featured'])),
    postedDate:       _date(_getField(r, ['Posted Date', 'Date Added'])),
    shortDescription: _getField(r, ['Short Description', 'Summary']),
    education_level:   _getField(r, ['Education Level', 'Education']),
    imageUrl:         _getField(r, ['Image Link', 'Image URL', 'Image']),
    ..._mapRichContentFields(r),
  };
}

function mapExam(r) {
  return {
    id:                    _getField(r, ['ID']) || String(r.__rowIndex || ''),
    title:                 _getField(r, ['Title', 'Exam Name']),
    examType:             _getField(r, ['Exam Type', 'Type']),
    test_date:             _getField(r, ['Test Date', 'Date']),
    registrationDeadline: _getField(r, ['Registration Deadline']),
    applyLink:            _getField(r, ['Apply Link', 'Link', 'URL']),
    // New columns
    conductingBody:  _getField(r, ['Conducting Body', 'Authority']),
    fee:              _num(_getField(r, ['Fee', 'Registration Fee']), _getField(r, ['Fee', 'Registration Fee'])),
    eligibility:      _getField(r, ['Eligibility']),
    syllabusLink:    _getField(r, ['Syllabus Link']),
    pastPapersLink: _getField(r, ['Past Papers Link', 'Past Papers']),
    tags:             _getField(r, ['Tags']),
    province:         _getField(r, ['Province']),
    shortDescription:_getField(r, ['Short Description', 'Summary']),
    isFeatured:      _bool(_getField(r, ['Is Featured', 'Featured'])),
    postedDate:      _getField(r, ['Posted Date', 'Date Added']),
    category:         _getField(r, ['Category']),
    imageUrl:        _getField(r, ['Image Link', 'Image URL', 'Image']),
    ..._mapRichContentFields(r),
  };
}

function mapBook(r) {
  return {
    id:                _getField(r, ['ID']) || String(r.__rowIndex || ''),
    title:             _getField(r, ['Title', 'Book Title']),
    author:            _getField(r, ['Author']),
    examType:         _getField(r, ['Exam Type', 'For Exam']),
    price:             _num(_getField(r, ['Price']), _getField(r, ['Price'])),
    applyLink:        _getField(r, ['Apply Link', 'Link', 'URL']),
    // New columns
    category:          _getField(r, ['Category']),
    language:          _getField(r, ['Language']),
    pages:             _num(_getField(r, ['Pages']), null),
    edition:           _getField(r, ['Edition']),
    isFree:           _bool(_getField(r, ['Is Free', 'Free'])),
    tags:              _getField(r, ['Tags']),
    shortDescription: _getField(r, ['Short Description', 'Summary']),
    isFeatured:       _bool(_getField(r, ['Is Featured', 'Featured'])),
    postedDate:       _date(_getField(r, ['Posted Date', 'Date Added'])),
    downloadLink:     _getField(r, ['Download Link', 'PDF Download']),
    imageUrl:         _getField(r, ['Image Link', 'Image URL', 'Image']),
    ..._mapRichContentFields(r),
  };
}

function mapBlog(r) {
  return {
    id:                  _getField(r, ['ID']) || String(r.__rowIndex || ''),
    title:               _getField(r, ['Title']),
    category:            _getField(r, ['Category']),
    description:         _getField(r, ['Description', 'Content', 'Details']),
    shortDescription:   _getField(r, ['Short Description', 'Summary', 'Excerpt']),
    imageUrl:           _getField(r, ['Image URL', 'Image Link', 'Image']),
    author:              _getField(r, ['Author']),
    date:                _date(_getField(r, ['Date', 'Published Date', 'Posted Date'])),
    tags:                _getField(r, ['Tags']),
    isFeatured:         _bool(_getField(r, ['Featured?', 'Featured', 'Is Featured'])),
    applyLink:          _getField(r, ['Apply Link', 'Link', 'URL']),
    pdfLink:            _getField(r, ['PDF Link', 'Document Link']),
    // New columns
    relatedJobsTags:   _getField(r, ['Related Jobs Tags']),
    relatedExamsTags:  _getField(r, ['Related Exams Tags']),
    readTime:           _getField(r, ['Read Time']),
    isPublished:        _bool(_getField(r, ['Is Published', 'Published'])),
    ..._mapRichContentFields(r),
  };
}

function mapNotification(r) {
  return {
    id:        _getField(r, ['ID']) || String(r.__rowIndex || ''),
    message:   _getField(r, ['Message', 'Text', 'Title']),
    link:      _getField(r, ['Link', 'URL']),
    startDate: _date(_getField(r, ['Start Date'])),
    endDate:   _date(_getField(r, ['End Date'])),
    priority:  _num(_getField(r, ['Priority']), _getField(r, ['Priority'])),
    isActive: _bool(_getField(r, ['Is Active', 'Active', 'Show'])),
  };
}

// ── CSV parser ────────────────────────────────────────────────
function _parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { field += ch; }
    } else {
      if      (ch === '"')  { inQ = true; }
      else if (ch === ',')  { row.push(field.trim()); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') {
        row.push(field.trim()); field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(c => c !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1).map((r, idx) => {
    const obj = { __rowIndex: idx + 2 };
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
}

// ── Normalizers / safety ──────────────────────────────────────
function _normalizeItem(item) {
  const out = { ...item };

  if (!out.id) out.id = String(Math.random()).slice(2);
  out.title = out.title || out.message || '';
  out.details = out.details || out.description || '';
  out.tags = out.tags || '';

  if (!Array.isArray(out.pdfLinks)) out.pdfLinks = out.pdfLinks ? [out.pdfLinks] : [];
  if (!Array.isArray(out.imageLinks)) out.imageLinks = out.imageLinks ? [out.imageLinks] : [];
  if (!Array.isArray(out.mediaLinks)) out.mediaLinks = out.mediaLinks ? [out.mediaLinks] : [];

  return out;
}

function _dedupeByIdTitle(arr) {
  const seen = new Set();
  return arr.filter((it) => {
    const key = `${it.id}::${(it.title || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Loader ────────────────────────────────────────────────────
async function loadOneSheet(cfg) {
  const res = await fetch(cfg.csvUrl, { cache: 'default' });
  if (!res.ok) throw new Error(`${cfg.name}: HTTP ${res.status}`);
  const text = await res.text();
  const rows = _parseCSV(text);
  const mapped = rows.map(cfg.mapper).map(_normalizeItem);
  return _dedupeByIdTitle(mapped);
}

async function loadAllSheets() {
  if (window.CMS_LOADING.global) return window.CMS_DATA;
  window.CMS_LOADING.global = true;

  const results = await Promise.allSettled(SHEETS_CONFIG.map(loadOneSheet));
  results.forEach((r, i) => {
    const key = SHEETS_CONFIG[i].name;
    if (r.status === 'fulfilled') {
      window.CMS_DATA[key] = r.value;
      window.CMS_DATA[key.toLowerCase()] = r.value;
    } else {
      console.error(`[CMS] Failed loading ${key}:`, r.reason);
      window.CMS_DATA[key] = [];
      window.CMS_DATA[key.toLowerCase()] = [];
    }
  });

  window.CMS_LOADING.global = false;
  return window.CMS_DATA;
}

window.loadAllSheets = loadAllSheets;
window.onCMSReady = function onCMSReady(fn) {
  if (typeof fn !== 'function') return;
  loadAllSheets().then(() => fn(window.CMS_DATA)).catch(() => fn(window.CMS_DATA));
};
