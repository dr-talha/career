// ============================================================
// Career Pakistan — app.js  (v4 — always reads window.CMS_DATA)
// ============================================================
// IMPORTANT: Never cache window.CMS_DATA into a local const.
// Always read via window.CMS_DATA so live updates are reflected.
// ============================================================

const TRANSPARENT_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ── Utility: fetch sheet data from live window.CMS_DATA ──────
window.CMS_DATA = window.CMS_DATA || { Scholarships: [], Jobs: [], Internships: [], Exams: [], Books: [], Notifications: [] };

function fetchSheet(sheetName) {
  return Promise.resolve((window.CMS_DATA[sheetName] || []).slice());
}
function whenCMSReady(fn) {
  if (typeof window.onCMSReady === 'function') {
    window.onCMSReady(fn);
    return;
  }
  fn(window.CMS_DATA || {});
}
function text(value) {
  return String(value ?? '');
}

function normalizeText(value) {
  return text(value).trim().toLowerCase();
}

function matchesFilterValue(value, filterValue) {
  if (!filterValue) return true;
  return normalizeText(value) === normalizeText(filterValue);
}

function includesFilterValue(value, filterValue) {
  if (!filterValue) return true;
  return normalizeText(value).includes(normalizeText(filterValue));
}

function isGovernmentType(value) {
  const normalized = normalizeText(value);
  return normalized === 'government' ||
    normalized === 'govt' ||
    normalized.includes('government') ||
    normalized.includes('govt') ||
    normalized.includes('public sector');
}

function isPakistanValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return normalized === 'pakistan' || normalized === 'pk' || /\bpakistan\b/.test(normalized);
}

function scholarshipMatchesCountry(scholarship, selectedCountry) {
  if (!selectedCountry) return true;
  const selected = normalizeText(selectedCountry);
  const country = text(scholarship.country);
  const location = text(scholarship.location);
  const type = text(scholarship.type);
  const fields = [country, location, type];

  if (selected === 'pakistan') {
    return fields.some(isPakistanValue);
  }
  if (selected === 'international') {
    const explicitlyInternational = fields.some(v => includesFilterValue(v, 'international'));
    const hasCountry = normalizeText(country).length > 0;
    return explicitlyInternational || (hasCountry && !isPakistanValue(country));
  }

  return fields.some(v => matchesFilterValue(v, selectedCountry));
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const raw = text(url).trim();
  if (!raw) return '#';
  try {
    const parsed = new URL(raw, window.location.origin);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return '#';
    return parsed.href;
  } catch {
    return '#';
  }
}

function escapeJsSingleQuote(value) {
  return text(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/<\/script/gi, '<\\/script');
}

function extractUrls(value) {
  const raw = text(value);
  const matches = raw.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  return [...new Set(matches.map(safeUrl).filter(u => u !== '#'))];
}

function getUrlFilename(url) {
  const raw = text(url).trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const candidates = [
      parsed.pathname.split('/').pop() || '',
      parsed.searchParams.get('filename') || '',
      parsed.searchParams.get('name') || '',
      parsed.searchParams.get('file') || ''
    ];
    return candidates.find(Boolean) || '';
  } catch {
    return '';
  }
}

function isPdfUrl(url) {
  const raw = text(url);
  const fileName = getUrlFilename(raw);
  return /\.pdf($|[?#])/i.test(raw) || /[?&]format=pdf\b/i.test(raw) || /\.pdf($|[?#])/i.test(fileName);
}

function isImageUrl(url) {
  const raw = text(url);
  const fileName = getUrlFilename(raw);
  return /\.(png|jpe?g|gif|webp|svg)($|[?#])/i.test(raw) || /\.(png|jpe?g|gif|webp|svg)($|[?#])/i.test(fileName);
}

function isTeraBoxUrl(url) {
  return /(terabox|1024tera|terashare)/i.test(text(url));
}

function collectResourceLinks(item) {
  const fields = [
    'pdf_link', 'pdf_links', 'image_links', 'media_links', 'source_link', 'details',
    'description', 'download_link', 'apply_link', 'registration_link', 'syllabus_link', 'past_papers_link'
  ];
  const urls = [];
  fields.forEach((field) => {
    extractUrls(item?.[field]).forEach((u) => urls.push(u));
  });
  return [...new Set(urls)];
}

function classifyResourceUrl(url) {
  const safe = safeUrl(url);
  if (safe === '#') return { kind: 'link', icon: 'fa-link', label: 'Open Link', url: '#' };
  if (isTeraBoxUrl(safe)) return { kind: 'cloud', icon: 'fa-cloud', label: 'TeraBox File', url: safe };
  if (isPdfUrl(safe)) return { kind: 'pdf', icon: 'fa-file-pdf', label: 'PDF', url: safe };
  if (isImageUrl(safe)) return { kind: 'image', icon: 'fa-image', label: 'Image', url: safe };
  if (/books\.google\./i.test(safe)) return { kind: 'book', icon: 'fa-book-open', label: 'Book Preview', url: safe };
  return { kind: 'link', icon: 'fa-link', label: 'Open Link', url: safe };
}

function renderInlineResourcePreview(url) {
  const meta = classifyResourceUrl(url);
  if (meta.url === '#') return '';
  const host = (() => {
    try { return new URL(meta.url).hostname.replace(/^www\./, ''); } catch { return 'External source'; }
  })();
  if (meta.kind === 'image') {
    return `
      <a class="resource-inline resource-inline-image" href="${meta.url}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtml(meta.url)}" alt="Resource image preview" loading="lazy">
        <span><i class="fa fa-up-right-from-square"></i> Open full image • ${escapeHtml(host)}</span>
      </a>
    `;
  }
  if (meta.kind === 'pdf' || meta.kind === 'book') {
    const previewSrc = meta.kind === 'pdf'
      ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(meta.url)}`
      : meta.url;
    const previewTitle = meta.kind === 'pdf' ? 'PDF preview' : 'Book preview';
    return `
      <a class="resource-inline resource-inline-embed" href="${meta.url}" target="_blank" rel="noopener noreferrer">
        <div class="resource-inline-embed-frame-wrap">
          <iframe
            class="resource-inline-embed-frame"
            src="${previewSrc}"
            loading="lazy"
            referrerpolicy="no-referrer"
            title="${previewTitle}">
          </iframe>
        </div>
        <span><i class="fa fa-up-right-from-square"></i> Open full ${escapeHtml(meta.label.toLowerCase())} • ${escapeHtml(host)}</span>
      </a>
    `;
  }
    if (meta.kind === 'cloud') {
    return `
      <a class="resource-inline resource-inline-card" href="${meta.url}" target="_blank" rel="noopener noreferrer">
        <div class="resource-mini-icon"><i class="fa ${meta.icon}"></i></div>
        <div class="resource-mini-meta">
          <strong>${escapeHtml(meta.label)}</strong>
          <span>${escapeHtml(host)}</span>
        </div>
        <i class="fa fa-up-right-from-square"></i>
      </a>
    `;
  }
  if (meta.kind === 'link') {
    return `<a href="${meta.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(meta.url)}</a>`;
  }
  return `
    <a class="resource-inline resource-inline-card" href="${meta.url}" target="_blank" rel="noopener noreferrer">
      <div class="resource-mini-icon"><i class="fa ${meta.icon}"></i></div>
      <div class="resource-mini-meta">
        <strong>${escapeHtml(meta.label)}</strong>
        <span>${escapeHtml(host)}</span>
      </div>
      <i class="fa fa-up-right-from-square"></i>
    </a>
  `;
}

function renderRichTextWithPreviews(value) {
  const raw = text(value).trim();
  if (!raw) return '';

  // Split on double newlines (paragraphs) OR single newlines
  const lines = raw.split(/\n/).map((line) => line.trim()).filter(Boolean);

  const output = [];

  lines.forEach((line) => {
    // Split the line by URLs
    const parts = line.split(/(https?:\/\/[^\s<>"'\)\]]+)/gi);
    const blocks = [];
    let inlineText = '';

    const flushInlineText = () => {
      const trimmed = inlineText.trim();
      if (trimmed) blocks.push(`<p class="rich-text-paragraph">${trimmed}</p>`);
      inlineText = '';
    };

    parts.forEach((part) => {
      if (!/^https?:\/\//i.test(part)) {
        inlineText += escapeHtml(part);
        return;
      }
      const safe = safeUrl(part);
      if (safe === '#') {
        inlineText += escapeHtml(part);
        return;
      }
      const meta = classifyResourceUrl(safe);
      if (meta.kind === 'image' || meta.kind === 'pdf' || meta.kind === 'book') {
        // Media: flush text first, then render as block figure
        flushInlineText();
        blocks.push(`<figure class="rich-text-media">${renderInlineResourcePreview(safe)}</figure>`);
      } else {
        // Regular link: render inline within text
        inlineText += renderInlineResourcePreview(safe);
      }
    });

    flushInlineText();

    if (blocks.length) {
      output.push(`<div class="rich-text-block">${blocks.join('')}</div>`);
    }
  });

  return output.join('');
}

function renderResourceActions(item, title) {
  const links = collectResourceLinks(item);
  if (!links.length) return '';
  const pdf = links.find(isPdfUrl);
  const image = links.find(isImageUrl);
  const teraPdf = links.find((link) => isTeraBoxUrl(link) && isPdfUrl(link));
  const teraImage = links.find((link) => isTeraBoxUrl(link) && isImageUrl(link));
  const tera = links.find(isTeraBoxUrl);
  return `
    <div class="resource-actions">
      ${pdf ? `<button class="btn btn-ghost" onclick="openResourcePreview('${escapeJsSingleQuote(pdf)}','${escapeJsSingleQuote(title)}')"><i class="fa fa-file-pdf"></i> Preview PDF</button>` : ''}
      ${image ? `<a href="${safeUrl(image)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost"><i class="fa fa-image"></i> View Image</a>` : ''}
      ${(!pdf && teraPdf) ? `<a href="${safeUrl(teraPdf)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost"><i class="fa fa-file-pdf"></i> Open TeraBox PDF</a>` : ''}
      ${(!image && teraImage) ? `<a href="${safeUrl(teraImage)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost"><i class="fa fa-image"></i> Open TeraBox Image</a>` : ''}
      ${tera ? `<a href="${safeUrl(tera)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost"><i class="fa fa-cloud"></i> Open TeraBox</a>` : ''}
    </div>
  `;
}

// ── Days until deadline ──────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / 86400000);
}

function urgencyBadge(deadline) {
  const d = daysUntil(deadline);
  if (d === null) return '';
  if (d < 0)  return '<span class="badge badge-expired">Expired</span>';
  if (d <= 7)  return `<span class="badge badge-urgent">⚡ ${d}d left</span>`;
  if (d <= 30) return `<span class="badge badge-soon">🔔 ${d}d left</span>`;
  return '';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Favourites (localStorage) ────────────────────────────────
function getFavs() {
  try { return JSON.parse(localStorage.getItem('ch_favs') || '[]'); } catch { return []; }
}
function toggleFav(id, title, type) {
  let favs = getFavs();
  const idx = favs.findIndex(f => f.id === id && f.type === type);
  if (idx >= 0) { favs.splice(idx, 1); } else { favs.push({ id, title, type }); }
  localStorage.setItem('ch_favs', JSON.stringify(favs));
  updateFavCount();
  return idx < 0; // true = added
}
function isFav(id, type) {
  return getFavs().some(f => f.id === id && f.type === type);
}
function updateFavCount() {
  const el = document.getElementById('favCount');
  if (!el) return;
  const count = getFavs().length;
  if (count === 0) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'flex';
  el.textContent = String(count);
}

// ── Tag chips ────────────────────────────────────────────────
function renderTags(tags) {
  if (!tags) return '';
  return tags.split(',').slice(0, 3).map(t =>
    `<span class="tag">${t.trim()}</span>`
  ).join('');
}

function renderMetaTags(values = []) {
  const tags = values
    .map((value) => text(value).trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!tags.length) return '';
  return tags.map((tag) => `<span class="card-tag">${escapeHtml(tag)}</span>`).join('');
}

// ── Fallback image ───────────────────────────────────────────
function imgSrc(url, type) {
  const clean = text(url).trim();
  if (!clean || clean.includes('REPLACE_WITH')) {
    const icons = {
      scholarship: '🎓', job: '💼', internship: '🚀', exam: '📋', book: '📚'
    };
    return null; // use emoji placeholder
  }
  if (isImageUrl(clean)) return clean;
  if (isTeraBoxUrl(clean)) return null;
  return clean;
}

// FIX: getCardDetailsUrl now uses slug fallback if id is missing/zero
function normalizeItemId(id) {
  const value = text(id).trim();
  return value || '0';
}

function makeSlug(title) {
  return text(title).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
}

function getCardDetailsUrl(id, type, title) {
  const normId = text(id).trim();
  if (normId && normId !== '0') {
    return `opportunity.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(normId)}`;
  }
  // fallback to slug if id missing
  const slug = makeSlug(title || '');
  if (slug) return `opportunity.html?type=${encodeURIComponent(type)}&slug=${encodeURIComponent(slug)}`;
  return `opportunity.html?type=${encodeURIComponent(type)}&id=0`;
}

function getFavButtonStateAttrs(isActive) {
  const label = isActive ? 'Saved to bookmarks' : 'Save to bookmarks';
  return `aria-label="${label}" title="${label}" aria-pressed="${isActive ? 'true' : 'false'}"`;
}

function shareButtonAttrs(title) {
  const label = `Share ${text(title || 'this opportunity')}`;
  return `aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-expanded="false"`;
}

function getShareUrl(id, type, title) {
  return `${window.location.origin}/${getCardDetailsUrl(id, type, title)}`;
}

function closeAllShareMenus() {
  document.querySelectorAll('.card-footer .share-actions').forEach((menu) => menu.remove());
  document.querySelectorAll('.card-footer .btn-share.active').forEach((button) => {
    button.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
  });
}

function shareOpportunity(id, type, title, triggerEl = null) {
  const shareUrl = getShareUrl(id, type, title);
  const cardFooter = triggerEl?.closest?.('.card-footer');
  copyOpportunityLink(encodeURIComponent(shareUrl), normalizeItemId(id), type, title, cardFooter);
}

function copyOpportunityLink(encodedUrl, id = '', type = '', title = '', cardFooter = null) {
  const shareUrl = decodeURIComponent(encodedUrl);
  const resetShareUi = () => {
    const card = cardFooter || document.querySelector(`.card[data-id="${normalizeItemId(id)}"][data-type="${type}"] .card-footer`);
    if (!card) return;
    const shareButton = card.querySelector('.btn-share');
    shareButton?.classList.remove('active');
    shareButton?.setAttribute('aria-expanded', 'false');
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert('Share link copied to clipboard.');
      resetShareUi();
    }).catch(() => {
      window.prompt('Copy and share this link:', shareUrl);
      resetShareUi();
    });
    return;
  }

  window.prompt('Copy and share this link:', shareUrl);
  resetShareUi();
}

function openCardPost(id, type) {
  const nextUrl = getCardDetailsUrl(id, type);
  window.location.href = nextUrl;
}

// ── Card renderers ───────────────────────────────────────────
function cardScholarship(s) {
  const fav = isFav(s.id, 'scholarship');
  const src = imgSrc(s.image_url, 'scholarship');
  const imgHTML = src
    ? `<img src="${TRANSPARENT_PLACEHOLDER}" data-src="${escapeHtml(src)}" alt="${escapeHtml(s.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  return `
  <div class="card" data-id="${s.id}" data-type="scholarship" role="button" tabindex="0" aria-label="View details for ${escapeHtml(s.title)}">
    <div class="card-img">
      ${imgHTML}
      <div class="card-img-placeholder" style="${src ? 'display:none' : ''}">🎓</div>
      ${s.is_featured ? '<span class="featured-badge">⭐ Featured</span>' : ''}
      ${urgencyBadge(s.deadline)}
    </div>
    <div class="card-body">
      <div class="card-meta">${renderMetaTags([s.type])}${s.funding ? `<span class="card-tag fund-${escapeHtml((s.funding || '').toLowerCase().replace(/\s+/g, '-'))}">${escapeHtml(s.funding || '')}</span>` : ''}</div>
      <h3 class="card-title">${escapeHtml(s.title)}</h3>
      <div class="card-details">
        ${s.location ? `<span><i class="fa fa-map-marker-alt"></i> ${escapeHtml(s.location)}</span>` : ''}
        ${s.deadline ? `<span><i class="fa fa-calendar"></i> <span class="deadline-date">${formatDate(s.deadline)}</span></span>` : ''}
      </div>
    </div>
    <div class="card-footer">
      <a class="btn btn-primary" href="${getCardDetailsUrl(s.id, 'scholarship', s.title)}">View Details <i class="fa fa-arrow-right"></i></a>
      <button class="btn-share" onclick="shareOpportunity('${escapeJsSingleQuote(normalizeItemId(s.id))}','scholarship','${escapeJsSingleQuote(s.title)}', this)" ${shareButtonAttrs(s.title)}>
      <i class="fa fa-share-nodes"></i>
      </button>
      <button class="btn-fav ${fav ? 'active' : ''}" onclick="handleFav(${Number(s.id) || 0},'${escapeJsSingleQuote(s.title)}','scholarship',this)" ${getFavButtonStateAttrs(fav)}>
        <i class="fa${fav ? 's' : 'r'} fa-bookmark"></i>
        <span class="visually-hidden">${fav ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  </div>`;
}

function cardJob(j) {
  const fav = isFav(j.id, 'job');
  const src = imgSrc(j.image_url, 'job');
  const imgHTML = src ? `<img src="${TRANSPARENT_PLACEHOLDER}" data-src="${escapeHtml(src)}" alt="${escapeHtml(j.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
  return `
  <div class="card" data-id="${j.id}" data-type="job" role="button" tabindex="0" aria-label="View details for ${escapeHtml(j.title)}">
    <div class="card-img">
      ${imgHTML}
      <div class="card-img-placeholder" style="${src ? 'display:none' : ''}">💼</div>
      ${j.is_featured ? '<span class="featured-badge">⭐ Featured</span>' : ''}
      ${urgencyBadge(j.deadline)}
    </div>
    <div class="card-body">
      <div class="card-meta">${renderMetaTags([j.type, j.category])}</div>
      <h3 class="card-title">${escapeHtml(j.title)}</h3>
      <div class="card-details">
        ${j.location ? `<span><i class="fa fa-map-marker-alt"></i> ${escapeHtml(j.location)}</span>` : ''}
        ${j.deadline ? `<span><i class="fa fa-calendar"></i> <span class="deadline-date">${formatDate(j.deadline)}</span></span>` : ''}
      </div>
    </div>
    <div class="card-footer">
      <a class="btn btn-primary" href="${getCardDetailsUrl(j.id, 'job', j.title)}">View Details <i class="fa fa-arrow-right"></i></a>
      <button class="btn-share" onclick="shareOpportunity('${escapeJsSingleQuote(normalizeItemId(j.id))}','job','${escapeJsSingleQuote(j.title)}', this)" ${shareButtonAttrs(j.title)}>
        <i class="fa fa-share-nodes"></i>
      </button>
      <button class="btn-fav ${fav ? 'active' : ''}" onclick="handleFav(${Number(j.id) || 0},'${escapeJsSingleQuote(j.title)}','job',this)" ${getFavButtonStateAttrs(fav)}>
        <i class="fa${fav ? 's' : 'r'} fa-bookmark"></i>
        <span class="visually-hidden">${fav ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  </div>`;
}

function cardInternship(i) {
  const fav = isFav(i.id, 'internship');
  const src = imgSrc(i.image_url, 'internship');
  const imgHTML = src ? `<img src="${TRANSPARENT_PLACEHOLDER}" data-src="${escapeHtml(src)}" alt="${escapeHtml(i.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
  const paidClass = (i.type || '').toLowerCase() === 'paid' ? 'paid' : 'unpaid';
  return `
  <div class="card" data-id="${i.id}" data-type="internship" role="button" tabindex="0" aria-label="View details for ${escapeHtml(i.title)}">
    <div class="card-img">
      ${imgHTML}
      <div class="card-img-placeholder" style="${src ? 'display:none' : ''}">🚀</div>
      ${i.is_featured ? '<span class="featured-badge">⭐ Featured</span>' : ''}
      ${urgencyBadge(i.deadline)}
    </div>
    <div class="card-body">
      <div class="card-meta">
        ${i.type ? `<span class="card-tag ${paidClass}">${escapeHtml(i.type)}</span>` : ''}
        ${i.duration ? `<span class="card-tag">${escapeHtml(i.duration)}</span>` : ''}
      </div>
      <h3 class="card-title">${escapeHtml(i.title)}</h3>
      <div class="card-details">
        ${i.location ? `<span><i class="fa fa-map-marker-alt"></i> ${escapeHtml(i.location)}</span>` : ''}
        ${i.deadline ? `<span><i class="fa fa-calendar"></i> <span class="deadline-date">${formatDate(i.deadline)}</span></span>` : ''}
      </div>
    </div>
    <div class="card-footer">
      <a class="btn btn-primary" href="${getCardDetailsUrl(i.id, 'internship', i.title)}">View Details <i class="fa fa-arrow-right"></i></a>
      <button class="btn-share" onclick="shareOpportunity('${escapeJsSingleQuote(normalizeItemId(i.id))}','internship','${escapeJsSingleQuote(i.title)}', this)" ${shareButtonAttrs(i.title)}>
        <i class="fa fa-share-nodes"></i>
      </button>
      <button class="btn-fav ${fav ? 'active' : ''}" onclick="handleFav(${Number(i.id) || 0},'${escapeJsSingleQuote(i.title)}','internship',this)" ${getFavButtonStateAttrs(fav)}>
        <i class="fa${fav ? 's' : 'r'} fa-bookmark"></i>
        <span class="visually-hidden">${fav ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  </div>`;
}

function cardExam(e) {
  const fav = isFav(e.id, 'exam');
  const src = imgSrc(e.image_url, 'exam');
  const imgHTML = src ? `<img src="${TRANSPARENT_PLACEHOLDER}" data-src="${escapeHtml(src)}" alt="${escapeHtml(e.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
  return `
  <div class="card" data-id="${e.id}" data-type="exam" role="button" tabindex="0" aria-label="View details for ${escapeHtml(e.title)}">
    <div class="card-img">
      ${imgHTML}
      <div class="card-img-placeholder" style="${src ? 'display:none' : ''}">📋</div>
      ${urgencyBadge(e.test_date)}
    </div>
    <div class="card-body">
      <div class="card-meta">${renderMetaTags([e.exam_type, e.fee])}</div>
      <h3 class="card-title">${escapeHtml(e.title)}</h3>
      <div class="card-details">
        ${e.test_date ? `<span><i class="fa fa-calendar"></i> Test: <span class="deadline-date">${formatDate(e.test_date)}</span></span>` : ''}
        ${e.conducting_body ? `<span><i class="fa fa-building"></i> ${escapeHtml(e.conducting_body)}</span>` : ''}
      </div>
    </div>
    <div class="card-footer exam-links">
      <a class="btn btn-primary" href="${getCardDetailsUrl(e.id, 'exam', e.title)}">View Details <i class="fa fa-arrow-right"></i></a>
      <button class="btn-share" onclick="shareOpportunity('${escapeJsSingleQuote(normalizeItemId(e.id))}','exam','${escapeJsSingleQuote(e.title)}', this)" ${shareButtonAttrs(e.title)}>
        <i class="fa fa-share-nodes"></i>
      </button>
      <button class="btn-fav ${fav ? 'active' : ''}" onclick="handleFav(${Number(e.id) || 0},'${escapeJsSingleQuote(e.title)}','exam',this)" ${getFavButtonStateAttrs(fav)}>
        <i class="fa${fav ? 's' : 'r'} fa-bookmark"></i>
        <span class="visually-hidden">${fav ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  </div>`;
}

function cardBook(b) {
  const fav = isFav(b.id, 'book');
  const src = imgSrc(b.image_url, 'book');
  const imgHTML = src ? `<img src="${TRANSPARENT_PLACEHOLDER}" data-src="${escapeHtml(src)}" alt="${escapeHtml(b.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
  return `
  <div class="card" data-id="${b.id}" data-type="book" role="button" tabindex="0" aria-label="View details for ${escapeHtml(b.title)}">
    <div class="card-img">
      ${imgHTML}
      <div class="card-img-placeholder" style="${src ? 'display:none' : ''}">📚</div>
      ${b.is_free ? '<span class="featured-badge free-badge">📥 Free PDF</span>' : ''}
    </div>
    <div class="card-body">
      <div class="card-meta">${renderMetaTags([b.exam_type, b.language])}</div>
      <h3 class="card-title">${escapeHtml(b.title)}</h3>
      <div class="card-details">
        ${b.author ? `<span><i class="fa fa-user"></i> ${escapeHtml(b.author)}</span>` : ''}
        ${b.category ? `<span><i class="fa fa-tag"></i> ${escapeHtml(b.category)}</span>` : ''}
      </div>
    </div>
    <div class="card-footer">
      <a class="btn btn-primary" href="${getCardDetailsUrl(b.id, 'book', b.title)}">View Details <i class="fa fa-arrow-right"></i></a>
      <button class="btn-share" onclick="shareOpportunity('${escapeJsSingleQuote(normalizeItemId(b.id))}','book','${escapeJsSingleQuote(b.title)}', this)" ${shareButtonAttrs(b.title)}>
        <i class="fa fa-share-nodes"></i>
      </button>
      <button class="btn-fav ${fav ? 'active' : ''}" onclick="handleFav(${Number(b.id) || 0},'${escapeJsSingleQuote(b.title)}','book',this)" ${getFavButtonStateAttrs(fav)}>
        <i class="fa${fav ? 's' : 'r'} fa-bookmark"></i>
        <span class="visually-hidden">${fav ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  </div>`;
}

function detailField(label, value, icon) {
  if (!value) return '';
  const valueClass = /deadline|test date/i.test(label) ? 'detail-value deadline-date' : 'detail-value';
  return `<div class="detail-row"><span class="detail-label"><i class="fa ${icon}"></i> ${escapeHtml(label)}</span><span class="${valueClass}">${escapeHtml(String(value))}</span></div>`;
}

function detailAction(label, url, primary = false) {
  if (!url) return '';
  const cls = primary ? 'btn btn-primary' : 'btn btn-secondary';
  return `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer" class="${cls}">${escapeHtml(label)}</a>`;
}

function ensureCardDetailsModal() {
  if (document.getElementById('cardDetailOverlay')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="cardDetailOverlay" class="card-detail-overlay" onclick="closeCardDetails()"></div>
    <div id="cardDetailModal" class="card-detail-modal" role="dialog" aria-modal="true" aria-label="Opportunity details">
      <div class="card-detail-head">
        <div>
          <p id="cardDetailType" class="card-detail-type"></p>
          <h3 id="cardDetailTitle"></h3>
        </div>
        <button class="card-detail-close" onclick="closeCardDetails()" aria-label="Close details"><i class="fa fa-times"></i></button>
      </div>
      <div class="card-detail-content">
        <div class="card-detail-media"><img id="cardDetailImage" alt="" loading="lazy"><div id="cardDetailImageFallback" class="card-detail-image-fallback">📌</div></div>
        <div>
          <p id="cardDetailSummary" class="card-detail-summary"></p>
          <div id="cardDetailFields" class="detail-grid"></div>
          <p id="cardDetailLong" class="card-detail-long"></p>
          <div id="cardDetailTags" class="card-detail-tags"></div>
          <div id="cardDetailActions" class="card-detail-actions"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper);
}

function getCardItemById(id, type) {
  const map = {
    scholarship: 'Scholarships',
    job: 'Jobs',
    internship: 'Internships',
    exam: 'Exams',
    book: 'Books'
  };
  return (window.CMS_DATA[map[type]] || []).find(item => String(item.id) === String(id));
}

function openCardDetailsById(id, type) {
  const item = getCardItemById(id, type);
  if (!item) return;
  openCardDetails(item, type);
}

function openCardDetails(item, type) {
  ensureCardDetailsModal();
  const image = document.getElementById('cardDetailImage');
  const fallback = document.getElementById('cardDetailImageFallback');
  const title = text(item.title);
  const src = imgSrc(item.image_url, type);
  document.getElementById('cardDetailType').textContent = (type || '').toUpperCase();
  document.getElementById('cardDetailTitle').textContent = title;
  document.getElementById('cardDetailSummary').textContent = text(item.description || item.details || 'Verified opportunity details are listed below.');
  document.getElementById('cardDetailLong').innerHTML = renderRichTextWithPreviews(item.details || item.description || '');
  document.getElementById('cardDetailTags').innerHTML = renderTags(item.tags || '');
  if (src) {
    image.src = src;
    image.alt = title;
    image.style.display = 'block';
    fallback.style.display = 'none';
  } else {
    image.src = '';
    image.style.display = 'none';
    fallback.style.display = 'flex';
  }

  const fields = [];
  if (type === 'scholarship') {
    fields.push(detailField('Type', item.type, 'fa-layer-group'));
    fields.push(detailField('Funding', item.funding, 'fa-wallet'));
    fields.push(detailField('Level', item.level, 'fa-graduation-cap'));
    fields.push(detailField('Location', item.location, 'fa-map-marker-alt'));
    fields.push(detailField('Deadline', formatDate(item.deadline), 'fa-calendar'));
  } else if (type === 'job') {
    fields.push(detailField('Type', item.type, 'fa-briefcase'));
    fields.push(detailField('Category', item.category, 'fa-folder-open'));
    fields.push(detailField('Location', item.location, 'fa-map-marker-alt'));
    fields.push(detailField('Salary', item.salary, 'fa-money-bill'));
    fields.push(detailField('Deadline', formatDate(item.deadline), 'fa-calendar'));
  } else if (type === 'internship') {
    fields.push(detailField('Type', item.type, 'fa-briefcase'));
    fields.push(detailField('Duration', item.duration, 'fa-hourglass-half'));
    fields.push(detailField('Location', item.location, 'fa-map-marker-alt'));
    fields.push(detailField('Stipend', item.stipend, 'fa-money-bill'));
    fields.push(detailField('Deadline', formatDate(item.deadline), 'fa-calendar'));
  } else if (type === 'exam') {
    fields.push(detailField('Exam Type', item.exam_type, 'fa-book'));
    fields.push(detailField('Fee', item.fee, 'fa-money-bill'));
    fields.push(detailField('Test Date', formatDate(item.test_date), 'fa-calendar'));
    fields.push(detailField('Eligibility', item.eligibility, 'fa-user-check'));
    fields.push(detailField('Conducting Body', item.conducting_body, 'fa-building'));
  } else if (type === 'book') {
    fields.push(detailField('Exam', item.exam_type, 'fa-book'));
    fields.push(detailField('Author', item.author, 'fa-user'));
    fields.push(detailField('Edition', item.edition, 'fa-book-open'));
    fields.push(detailField('Language', item.language, 'fa-language'));
    fields.push(detailField('Category', item.category, 'fa-tag'));
  }
  document.getElementById('cardDetailFields').innerHTML = fields.filter(Boolean).join('');

  const actions = [
    detailAction('Apply Now', item.apply_link, true),
    detailAction('Register', item.registration_link, true),
    detailAction('Download', item.download_link, true),
    detailAction('Buy Book', item.buy_link),
    detailAction('Syllabus', item.syllabus_link),
    detailAction('Past Papers', item.past_papers_link),
    detailAction('Official Link', item.source_link)
  ];
  document.getElementById('cardDetailActions').innerHTML = actions.filter(Boolean).join('') + renderResourceActions(item, title);

  document.getElementById('cardDetailOverlay').style.display = 'block';
  document.getElementById('cardDetailModal').style.display = 'block';
}

function closeCardDetails() {
  const overlay = document.getElementById('cardDetailOverlay');
  const modal = document.getElementById('cardDetailModal');
  if (overlay) overlay.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

function ensureResourcePreviewModal() {
  if (document.getElementById('resourcePreviewOverlay')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="resourcePreviewOverlay" class="resource-preview-overlay" onclick="closeResourcePreview()"></div>
    <div id="resourcePreviewModal" class="resource-preview-modal" role="dialog" aria-modal="true" aria-label="Document preview">
      <div class="resource-preview-head">
        <h3 id="resourcePreviewTitle">Document Preview</h3>
        <button class="resource-preview-close" onclick="closeResourcePreview()" aria-label="Close preview"><i class="fa fa-times"></i></button>
      </div>
      <p id="resourcePreviewHint" class="resource-preview-hint"></p>
      <iframe id="resourcePreviewFrame" class="resource-preview-frame" loading="lazy" referrerpolicy="no-referrer"></iframe>
      <a id="resourcePreviewOpen" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Open in new tab</a>
    </div>`;
  document.body.appendChild(wrapper);
}

function openResourcePreview(url, title) {
  ensureResourcePreviewModal();
  const frame = document.getElementById('resourcePreviewFrame');
  const link = document.getElementById('resourcePreviewOpen');
  const hint = document.getElementById('resourcePreviewHint');
  const safe = safeUrl(url);
  const hostHint = isTeraBoxUrl(safe)
    ? 'TeraBox links may block embedded preview in some browsers. Use "Open in new tab" if needed.'
    : 'If this file does not render, open it in a new tab.';
  document.getElementById('resourcePreviewTitle').textContent = text(title || 'Document Preview');
  hint.textContent = hostHint;
  frame.src = safe;
  link.href = safe;
  document.getElementById('resourcePreviewOverlay').style.display = 'block';
  document.getElementById('resourcePreviewModal').style.display = 'block';
}

function closeResourcePreview() {
  const frame = document.getElementById('resourcePreviewFrame');
  if (frame) frame.src = 'about:blank';
  const overlay = document.getElementById('resourcePreviewOverlay');
  const modal = document.getElementById('resourcePreviewModal');
  if (overlay) overlay.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

function detectPageTopic(type) {
  const path = (window.location.pathname || '').toLowerCase();
  const topicByPath = [
    { match: '/scholarships', key: 'scholarship', label: 'Scholarship' },
    { match: '/jobs', key: 'job', label: 'Job' },
    { match: '/internships', key: 'internship', label: 'Internship' },
    { match: '/exams', key: 'exam', label: 'Exam' },
    { match: '/books', key: 'book', label: 'Book' }
  ];
  const found = topicByPath.find((entry) => path.includes(entry.match));
  if (found) return found;
  const byType = {
    scholarship: { key: 'scholarship', label: 'Scholarship' },
    job: { key: 'job', label: 'Job' },
    internship: { key: 'internship', label: 'Internship' },
    exam: { key: 'exam', label: 'Exam' },
    book: { key: 'book', label: 'Book' }
  };
  return byType[type] || { key: 'opportunity', label: 'Opportunity' };
}

function getTimelineValue(item) {
  return item?.deadline || item?.test_date || item?.posted_date || '';
}

function shortTitle(value, max = 44) {
  const clean = text(value).trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function isBookTopic(topic) {
  return normalizeText(topic?.key) === 'book';
}

function getExamGroupName(exam) {
  const category = text(exam?.category).trim();
  if (category) return category;
  const type = text(exam?.exam_type).trim();
  if (type) return type;
  return 'Other';
}

function getBookGroupName(book) {
  const category = text(book?.category).trim();
  if (category) return category;
  const examType = text(book?.exam_type).trim();
  if (examType) return examType;
  return 'General';
}

function renderInsightItems(items, topic) {
  if (!items.length) return '<li>Live updates will appear here as soon as content is loaded.</li>';
  const deduped = [];
  const seen = new Set();
  (items || []).forEach((item) => {
    const timeline = text(getTimelineValue(item));
    const titleKey = text(item?.title).toLowerCase().trim();
    const dedupeKey = `${titleKey}|${timeline}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    deduped.push(item);
  });
  const sorted = [...deduped];
  if (isBookTopic(topic)) {
    sorted.sort((a, b) => new Date(b.posted_date || b.created_at || 0) - new Date(a.posted_date || a.created_at || 0));
  } else {
    sorted.sort((a, b) => new Date(getTimelineValue(a) || 0) - new Date(getTimelineValue(b) || 0));
  }
  const top = sorted.slice(0, 4);
  return top.map((item) => {
    const name = escapeHtml(shortTitle(item.title || `${topic.label} update`));
    const dateText = formatDate(getTimelineValue(item));
    return `<li><strong>${name}</strong><span>${escapeHtml(dateText)}</span></li>`;
  }).join('');
}

function renderSEOLinks(items) {
  if (!items.length) return '';
  const links = items
    .slice(0, 6)
    .map((item) => {
      const title = escapeHtml(item.title || 'Opportunity');
      const url = safeUrl(item.apply_link || item.source_link || item.registration_link || item.download_link || '#');
      if (url === '#') return `<li>${title}</li>`;
      return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></li>`;
    })
    .join('');
  return `<ul class="seo-rich-list">${links}</ul>`;
}

function enhanceCardsSection(grid, items, type) {
  if (!grid) return;
  const topic = detectPageTopic(type);
  let layout = grid.closest('.cards-layout');
  if (!layout) {
    const parent = grid.parentElement;
    if (!parent) return;
    layout = document.createElement('div');
    layout.className = 'cards-layout';
    const main = document.createElement('div');
    main.className = 'cards-layout-main';
    parent.insertBefore(layout, grid);
    layout.appendChild(main);
    main.appendChild(grid);
  }
  let aside = layout.querySelector('.cards-insights');
  if (!aside) {
    aside = document.createElement('aside');
    aside.className = 'cards-insights';
    layout.appendChild(aside);
  }
  aside.innerHTML = `
    <h3>${isBookTopic(topic) ? 'Latest books' : 'Upcoming deadlines'}</h3>
    <p>${isBookTopic(topic) ? 'Newest titles from this category.' : 'Short deadline timeline for this category.'}</p>
    <ul>${renderInsightItems(items, topic)}</ul>
    <div class="compact-sidebar-ad" role="complementary" aria-label="Sponsored placement"> 
      <span class="compact-sidebar-ad-label">Sponsored</span>
      <div class="compact-sidebar-ad-copy">Promote your course, coaching, or study tool here.</div>
    </div>
  `;

  let seoBlock = layout.querySelector('.seo-rich-block');
  if (!seoBlock) {
    seoBlock = document.createElement('section');
    seoBlock.className = 'seo-rich-block';
    layout.insertAdjacentElement('afterend', seoBlock);
  }
  seoBlock.innerHTML = `
    <h2>${topic.label} Updates, Guidance & Useful Links</h2>
    <p>Explore verified ${topic.label.toLowerCase()} opportunities, compare deadlines, and shortlist options that match your profile, location, and goals.</p>
    ${renderSEOLinks(items)}
  `;
}

function updateListSchema(items, type) {
  const topic = detectPageTopic(type);
  const id = 'dynamic-item-list-schema';
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const top = (items || []).slice(0, 8);
  if (!top.length) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = id;
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${topic.label} listings`,
    itemListElement: top.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.title || `${topic.label} listing`,
      url: safeUrl(item.apply_link || item.source_link || item.registration_link || item.download_link || window.location.href)
    }))
  });
  document.head.appendChild(script);
}

function renderGridFallback(grid, message) {
  if (!grid) return;
  grid.innerHTML = `<div class="card card-empty-state"><div class="card-body"><h3 class="card-title">${escapeHtml(message || "No data available right now")}</h3><p class="card-details">Please retry in a moment.</p></div></div>`;
}

// ── Generic renderCards dispatcher ───────────────────────────
function renderCards(items, gridId, type) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (!items || items.length === 0) {
    renderGridFallback(grid, 'No items found for this section');
    return;
  }
  const renderers = {
    scholarship: cardScholarship,
    job: cardJob,
    internship: cardInternship,
    exam: cardExam,
    book: cardBook
  };
  const fn = renderers[type] || cardScholarship;
  grid.innerHTML = items.map(fn).join('');
  
  // Ensure cards are always visible — force opacity & visibility
  // This is the primary visibility fix for all sub-pages
  const cards = grid.querySelectorAll('.card, .exam-card');
  cards.forEach((card) => {
    card.classList.add('visible');
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    card.style.visibility = 'visible';
  });
  // Also trigger IntersectionObserver re-scan for smooth animation
  setTimeout(() => {
    if (typeof observeCards === 'function') observeCards();
  }, 60);
  
  const isHomeGrid = document.body.classList.contains('home-page');
  if (!isHomeGrid) {
    enhanceCardsSection(grid, items, type);
    updateListSchema(items, type);
  }
}

// ── Favourite handler ─────────────────────────────────────────
function handleFav(id, title, type, btn) {
  const added = toggleFav(id, title, type);
  if (added) {
    const item = getCardItemById(id, type);
    if (item) storeFavoriteDeadline(item, type);
  }
  if (btn) {
    btn.classList.toggle('active', added);
    btn.querySelector('i').className = `fa${added ? 's' : 'r'} fa-bookmark`;
    btn.setAttribute('aria-pressed', added ? 'true' : 'false');
    btn.setAttribute('aria-label', added ? 'Saved to bookmarks' : 'Save to bookmarks');
    btn.setAttribute('title', added ? 'Saved to bookmarks' : 'Save to bookmarks');
    const srText = btn.querySelector('.visually-hidden');
    if (srText) srText.textContent = added ? 'Saved' : 'Save';
  }
}

// ── Sort helper ───────────────────────────────────────────────
function sortItems(items, sort) {
  const arr = [...items];
  if (sort === 'deadline') {
    arr.sort((a, b) => {
      const da = a.deadline || a.test_date || '9999';
      const db = b.deadline || b.test_date || '9999';
      return new Date(da) - new Date(db);
    });
  } else if (sort === 'oldest') {
    arr.sort((a, b) => new Date(a.posted_date || 0) - new Date(b.posted_date || 0));
  } else {
    arr.sort((a, b) => new Date(b.posted_date || 0) - new Date(a.posted_date || 0));
  }
  return arr;
}

// ── Homepage data loader ──────────────────────────────────────
function loadHomePageData() {

  const scholarships = window.CMS_DATA.Scholarships || [];
  const jobs         = window.CMS_DATA.Jobs || [];
  const internships  = window.CMS_DATA.Internships || [];
  const exams        = window.CMS_DATA.Exams || [];
  const books        = window.CMS_DATA.Books || [];

  renderCards(sortItems(scholarships, 'newest'), 'scholarshipsGrid', 'scholarship');
  renderCards(sortItems(jobs, 'newest'), 'jobsGrid', 'job');
  renderCards(sortItems(internships, 'newest'), 'internshipsGrid', 'internship');
  renderHomeLatestList('homeLatestScholarshipsList', scholarships, 'scholarship', {
    initialCount: 3,
    toggleButtonId: 'homeLatestScholarshipsToggle'
  });
  renderHomeCategoryBlocks('homeExamBlocks', exams, getExamGroupName, 'exams.html', 'exam_group');
  renderHomeLatestList('homeLatestExamList', sortItems(exams, 'deadline'), 'exam');
  renderHomeCategoryBlocks('homeBookBlocks', books, getBookGroupName, 'books.html', 'book_group');
  renderHomeLatestList('homeLatestBooksList', books, 'book');
  renderHomeLatestList('homeLatestJobsList', jobs, 'job', {
    initialCount: 3,
    toggleButtonId: 'homeLatestJobsToggle'
  });
  renderHomeLatestList('homeLatestInternshipsList', internships, 'internship', {
    initialCount: 3,
    toggleButtonId: 'homeLatestInternshipsToggle'
  });
  initHomeCardSliders();
}

function initHomeCardSliders() {
  if (!document.body.classList.contains('home-page')) return;
  const sliderIds = ['scholarshipsGrid', 'jobsGrid', 'internshipsGrid'];

  sliderIds.forEach((id) => {
    const grid = document.getElementById(id);
    if (!grid || grid.children.length < 2) return;

    grid.classList.add('home-card-slider');

    let nav = grid.previousElementSibling;
    if (!nav || !nav.classList.contains('home-slider-nav')) {
      nav = document.createElement('div');
      nav.className = 'home-slider-nav';
      nav.innerHTML = `
        <button type="button" class="home-slider-btn home-slider-prev" aria-label="Previous cards"><i class="fa fa-chevron-left"></i></button>
        <button type="button" class="home-slider-btn home-slider-next" aria-label="Next cards"><i class="fa fa-chevron-right"></i></button>
      `;
      grid.parentNode.insertBefore(nav, grid);
    }

    const prevBtn = nav.querySelector('.home-slider-prev');
    const nextBtn = nav.querySelector('.home-slider-next');
    const scrollStep = () => {
      const firstCard = grid.querySelector('.card, .job-card, .scholarship-card, .internship-card, .exam-card, .skeleton-card');
      if (!firstCard) return Math.max(180, Math.round(grid.clientWidth * 0.5));
      const styles = window.getComputedStyle(grid);
      const gap = parseFloat(styles.columnGap || styles.gap || '14') || 14;
      return Math.round(firstCard.getBoundingClientRect().width + gap);
    };
    
    function updateButtons() {
      const maxScroll = grid.scrollWidth - grid.clientWidth;
      prevBtn.disabled = grid.scrollLeft <= 4;
      nextBtn.disabled = grid.scrollLeft >= (maxScroll - 4);
    }

    if (!grid.dataset.sliderBound) {
      prevBtn.addEventListener('click', () => {
        grid.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
      });
      nextBtn.addEventListener('click', () => {
        grid.scrollBy({ left: scrollStep(), behavior: 'smooth' });
      });
      grid.addEventListener('scroll', updateButtons, { passive: true });
      window.addEventListener('resize', updateButtons);
      grid.dataset.sliderBound = 'true';
    }

    updateButtons();

    if (!grid.dataset.autoSlideBound) {
      let autoSlide = setInterval(() => {
        const maxScroll = grid.scrollWidth - grid.clientWidth;
        const nearEnd = grid.scrollLeft >= (maxScroll - 6);
        grid.scrollTo({ left: nearEnd ? 0 : Math.min(maxScroll, grid.scrollLeft + scrollStep()), behavior: 'smooth' });
      }, 4200);

      const pause = () => {
        clearInterval(autoSlide);
        autoSlide = null;
      };
      const resume = () => {
        if (autoSlide) return;
        autoSlide = setInterval(() => {
          const maxScroll = grid.scrollWidth - grid.clientWidth;
          const nearEnd = grid.scrollLeft >= (maxScroll - 6);
          grid.scrollTo({ left: nearEnd ? 0 : Math.min(maxScroll, grid.scrollLeft + scrollStep()), behavior: 'smooth' });
        }, 4200);
      };

      grid.addEventListener('mouseenter', pause);
      grid.addEventListener('mouseleave', resume);
      grid.addEventListener('touchstart', pause, { passive: true });
      grid.addEventListener('touchend', resume, { passive: true });
      grid.dataset.autoSlideBound = 'true';
    }
  });
}

function renderHomeCategoryBlocks(containerId, rows, getGroupName, pageUrl, queryKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const grouped = {};
  rows.forEach((item) => {
    const groupName = getGroupName(item);
    if (!grouped[groupName]) grouped[groupName] = { name: groupName, count: 0 };
    grouped[groupName].count += 1;
  });
  const groups = Object.values(grouped).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  container.innerHTML = groups.length
    ? groups.slice(0, 10).map((group) => (
      `<a class="cat-pill" href="${pageUrl}?${queryKey}=${encodeURIComponent(group.name)}#resultsGrid">${escapeHtml(group.name)} <span>(${group.count})</span></a>`
    )).join('')
    : '<span class="cat-pill active">No categories yet</span>';
}

function renderHomeLatestList(containerId, rows, type, options = {}) {
const container = document.getElementById(containerId);
  if (!container) return;
  const {
    initialCount = 5,
    toggleButtonId = '',
    urgentThresholdDays = 10
  } = options;
  const pageByType = {
    scholarship: 'scholarships.html',
    exam: 'exams.html',
    book: 'books.html',
    job: 'jobs.html',
    internship: 'internships.html'
  };
  const sortMode = type === 'book' ? 'newest' : 'deadline';
  const deduped = [];
  const seen = new Set();
  (sortItems(rows || [], sortMode)).forEach((item) => {
    const key = `${text(item.title).toLowerCase()}|${text(item.test_date || item.deadline || item.posted_date)}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });
  const toggleButton = toggleButtonId ? document.getElementById(toggleButtonId) : null;
  const isExpanded = container.dataset.expanded === 'true';
  const visibleCount = toggleButton && !isExpanded ? initialCount : deduped.length;
  const latestRows = deduped.slice(0, visibleCount);
  if (!deduped.length) {
    container.innerHTML = `<a class="home-latest-item" href="${pageByType[type] || 'index.html'}">No updates yet.</a>`;
  if (toggleButton) toggleButton.hidden = true;
    return;
  }
  
  container.innerHTML = latestRows.map((item) => {
    let groupName = 'Update';
    if (type === 'book') groupName = getBookGroupName(item);
    else if (type === 'exam') groupName = getExamGroupName(item);
    else if (type === 'job') groupName = text(item.category || item.type || 'Jobs');
    else if (type === 'scholarship') groupName = text(item.type || item.category || 'Scholarship');
    else if (type === 'internship') groupName = text(item.type || item.duration || 'Internship');
    const dateLabel = type === 'book' ? 'Updated' : 'Deadline';
    const dateValue = type === 'book'
      ? (item.posted_date || item.deadline || item.test_date)
      : (item.deadline || item.test_date || item.posted_date);
    const d = daysUntil(dateValue);
    const urgencyBadgeHTML = (type !== 'book' && d >= 0 && d <= urgentThresholdDays)
      ? '<span class="badge badge-urgent">Closing Soon</span>'
      : '';
    return `<a class="home-latest-item" href="${getCardDetailsUrl(item.id, type, item.title)}"><strong>${escapeHtml(item.title || 'Untitled')}</strong><span>${escapeHtml(groupName)} • ${dateLabel}: <span class="deadline-date">${formatDate(dateValue)}</span></span>${urgencyBadgeHTML}</a>`;
  }).join('');

  if (!toggleButton) return;
  const canExpand = deduped.length > initialCount;
  toggleButton.hidden = !canExpand;
  if (!canExpand) return;
  toggleButton.textContent = isExpanded ? 'View Less' : 'View More';
  toggleButton.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  toggleButton.onclick = () => {
    container.dataset.expanded = isExpanded ? 'false' : 'true';
    renderHomeLatestList(containerId, rows, type, options);
  };
}

// ── Notification bar loader ───────────────────────────────────
function loadNotifications() {
  const track = document.getElementById('notifTrack');
  if (!track) return;
  const notifs = (window.CMS_DATA.Notifications || []).filter(n => n.is_active);
  if (notifs.length === 0) return;
  const html = notifs.map(n =>
    `<a href="${safeUrl(n.link)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;">${escapeHtml(n.message)}</a>`
).join('&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;');
  track.innerHTML = `<span>${html}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;${html}</span>`;
}

// ── AI chatbot fallback loader (ensures toggle on every page) ─
function ensureChatbotLoaded() {
  if (document.querySelector('script[src*="gemini-chatbot.js"]')) return;
  const script = document.createElement('script');
  script.src = 'js/gemini-chatbot.js';
  script.defer = true;
  (document.body || document.head || document.documentElement).appendChild(script);
}

// ── Menu System ─────────────────────────────────────────────────
// Strategy:
//   Mobile (<768px) : hamburger opens #navLinks as left-side drawer
//   Desktop (>=768px): hamburger opens #navDrawer as right-side panel
//
let menuOpen = false;

function isMobile() { return window.innerWidth < 768; }

// ── Overlay ──────────────────────────────────────────────────────
function getOverlay() {
  let el = document.getElementById('navOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'navOverlay';
    el.className = 'nav-overlay-menu';
    el.setAttribute('aria-hidden', 'true');
    el.addEventListener('click', closeMenu);
    document.body.appendChild(el);
  }
  return el;
}

function showOverlay() {
  const o = getOverlay();
  o.style.display = 'block';
  requestAnimationFrame(() => o.classList.add('active'));
}

function hideOverlay() {
  const o = document.getElementById('navOverlay');
  if (!o) return;
  o.classList.remove('active');
  setTimeout(() => { o.style.display = ''; }, 350);
}

// ── Desktop Drawer (#navDrawer) ──────────────────────────────────
function buildDesktopDrawer() {
  let drawer = document.getElementById('navDrawer');
  if (drawer) return drawer;

  const currentPage = location.pathname.split('/').pop() || 'index.html';

  function isActive(href) {
    return href === currentPage || (currentPage === '' && href === 'index.html');
  }

  const items = [
    { label: 'Home', href: 'index.html' },
    { label: 'Scholarships', href: 'scholarships.html', children: [
      { label: 'National Scholarships', href: 'scholarships-national.html' },
      { label: 'International Scholarships', href: 'scholarships-international.html' },
    ]},
    { label: 'Jobs', href: 'jobs.html', children: [
      { label: 'Government Jobs', href: 'jobs-government.html' },
      { label: 'Private / NGO Jobs', href: 'jobs-private.html' },
    ]},
    { label: 'Internships', href: 'internships.html' },
    { label: 'Exams', href: 'exams.html', children: [
      { label: 'MDCAT', href: 'exams-mdcat.html' },
      { label: 'CSS', href: 'exams-css.html' },
      { label: 'PPSC', href: 'exams-ppsc.html' },
    ]},
    { label: 'Blog', href: 'blog.html' },
    { label: 'Books', href: 'books.html' },
    { label: 'About Us', href: 'about.html', section: 'More' },
    { label: 'Contact', href: 'contact.html' },
    { label: 'Favorites', href: 'favorites.html' },
    { label: 'Privacy Policy', href: 'privacy.html' },
    { label: 'Terms of Use', href: 'terms.html' },
  ];

  drawer = document.createElement('div');
  drawer.id = 'navDrawer';
  drawer.setAttribute('role', 'navigation');
  drawer.setAttribute('aria-label', 'Site navigation drawer');

  let html = '<div class="drawer-header"></div>';
  html += '<div class="drawer-close"><span>Navigation</span><button aria-label="Close menu" onclick="closeMenu()"><i class="fa fa-times"></i></button></div>';
  html += '<ul>';

  let inMoreSection = false;
  items.forEach((item) => {
    if (item.section && !inMoreSection) {
      html += `<li class="drawer-section">${item.section}</li>`;
      inMoreSection = true;
    }
    if (item.children) {
      const active = item.children.some(c => isActive(c.href)) || isActive(item.href);
      html += `<li class="has-sub${active ? ' open' : ''}">
        <a href="${item.href}"${isActive(item.href) ? ' class="active"' : ''}>
          ${item.label}<i class="fa fa-chevron-down drawer-chevron"></i>
        </a>
        <ul class="drawer-sub${active ? ' open' : ''}">`;
      item.children.forEach(c => {
        html += `<li><a href="${c.href}"${isActive(c.href) ? ' class="active"' : ''}>${c.label}</a></li>`;
      });
      html += '</ul></li>';
    } else {
      html += `<li><a href="${item.href}"${isActive(item.href) ? ' class="active"' : ''}>${item.label}</a></li>`;
    }
  });

  html += '</ul>';
  drawer.innerHTML = html;
  document.body.appendChild(drawer);

  // Accordion for sub-menus
  drawer.querySelectorAll('.has-sub > a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const li = link.parentElement;
      const sub = li.querySelector('.drawer-sub');
      const isOpen = li.classList.contains('open');
      drawer.querySelectorAll('.has-sub.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.drawer-sub').classList.remove('open');
      });
      if (!isOpen) {
        li.classList.add('open');
        sub.classList.add('open');
      }
    });
  });

  return drawer;
}

// ── Open / Close ─────────────────────────────────────────────────
function openMenu() {
  const hamburger = document.getElementById('hamburger');
  if (!hamburger) return;

  menuOpen = true;
  hamburger.classList.add('active');
  hamburger.setAttribute('aria-expanded', 'true');
  showOverlay();
  document.body.style.overflow = 'hidden';

  if (isMobile()) {
    // Mobile: slide in #navLinks from left
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.classList.add('active');
  } else {
    // Desktop: slide in #navDrawer from right
    const drawer = buildDesktopDrawer();
    requestAnimationFrame(() => drawer.classList.add('active'));
  }
}

function closeMenu() {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  const drawer = document.getElementById('navDrawer');

  menuOpen = false;

  if (hamburger) {
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  // Mobile: close navLinks drawer
  if (navLinks) {
    navLinks.classList.remove('active');
    navLinks.querySelectorAll('.has-dropdown.accordion-open').forEach(el => el.classList.remove('accordion-open'));
  }

  // Desktop: close navDrawer
  if (drawer) drawer.classList.remove('active');

  hideOverlay();
  document.body.style.overflow = '';
}

function toggleMenu() {
  menuOpen ? closeMenu() : openMenu();
}

// ── Init ─────────────────────────────────────────────────────────
function initMenu() {
  const hamburger = document.getElementById('hamburger');
  const navbar = document.getElementById('navbar');
  const navLinks = document.getElementById('navLinks');
  if (!hamburger || !navbar) return;

  hamburger.setAttribute('aria-label', 'Toggle navigation menu');
  hamburger.setAttribute('aria-expanded', 'false');

  // Toggle on hamburger click
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Mobile: accordion for dropdown parent links
  if (navLinks) {
    navLinks.querySelectorAll('.has-dropdown').forEach((item) => {
      const link = item.querySelector(':scope > a');
      if (!link) return;
      link.addEventListener('click', (e) => {
        if (!isMobile()) return; // desktop uses hover
        e.preventDefault();
        const isOpen = item.classList.contains('accordion-open');
        navLinks.querySelectorAll('.has-dropdown.accordion-open').forEach(el => el.classList.remove('accordion-open'));
        if (!isOpen) item.classList.add('accordion-open');
      });
    });

    // Close mobile drawer when a leaf link is tapped
    navLinks.addEventListener('click', (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;
      // If it's a top-level dropdown trigger, accordion handled above
      if (anchor.parentElement.classList.contains('has-dropdown') && !anchor.closest('.dropdown')) return;
      if (menuOpen) closeMenu();
    });
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!menuOpen) return;
    const drawer = document.getElementById('navDrawer');
    const inNavbar = navbar.contains(e.target);
    const inDrawer = drawer && drawer.contains(e.target);
    if (!inNavbar && !inDrawer) closeMenu();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });

  // On resize: rebuild correctly (close if switching breakpoints)
  window.addEventListener('resize', () => {
    if (menuOpen) closeMenu();
  });
  
  // Navbar scroll shadow
  const navEl = document.getElementById('navbar');
  if (navEl) {
    window.addEventListener('scroll', () => {
      navEl.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // Mobile bottom nav active state
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.mob-nav-item').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href === currentFile || (currentFile === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
}

function toggleSearch() {
  document.getElementById('navSearch')?.classList.toggle('open');
  document.getElementById('navSearchInput')?.focus();
}

// ── Dark mode ─────────────────────────────────────────────────
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('ch_dark', isDark);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.innerHTML = isDark ? '<i class="fa fa-sun"></i>' : '<i class="fa fa-moon"></i>';
}
function initDarkMode() {
  if (localStorage.getItem('ch_dark') === 'true') {
    document.body.classList.add('dark');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.innerHTML = '<i class="fa fa-sun"></i>';
  }
}

// ── Popup modal ───────────────────────────────────────────────
function showPopup() {
  const urgent = (window.CMS_DATA.Scholarships || []).find(s => {
    const d = daysUntil(s.deadline);
    return d !== null && d > 0 && d <= 30;
  });
  if (!urgent) return;
  document.getElementById('popupTitle').textContent = text(urgent.title);
  document.getElementById('popupDesc').textContent = text(urgent.description);
  document.getElementById('popupDeadline').textContent = formatDate(urgent.deadline);
  document.getElementById('popupLink').href = safeUrl(urgent.apply_link);
  document.getElementById('popupOverlay').style.display = 'block';
  document.getElementById('popupModal').style.display = 'block';
}
function closePopup() {
  document.getElementById('popupOverlay').style.display = 'none';
  document.getElementById('popupModal').style.display = 'none';
}

// ── Search page ───────────────────────────────────────────────
function runSearch(query) {
  if (!query) return;
  const q = query.toLowerCase();
  const results = [];

  (window.CMS_DATA.Scholarships || []).forEach(s => {
    if ((text(s.title) + text(s.description) + text(s.tags)).toLowerCase().includes(q))
      results.push({...s, _type:'scholarship'});
  });
  (window.CMS_DATA.Jobs || []).forEach(j => {
    if ((text(j.title) + text(j.description) + text(j.tags)).toLowerCase().includes(q))
      results.push({...j, _type:'job'});
  });
  (window.CMS_DATA.Internships || []).forEach(i => {
    if ((text(i.title) + text(i.description) + text(i.tags)).toLowerCase().includes(q))
      results.push({...i, _type:'internship'});
  });
  (window.CMS_DATA.Exams || []).forEach(e => {
    if ((text(e.title) + text(e.tags)).toLowerCase().includes(q))
      results.push({...e, _type:'exam'});
  });
  (window.CMS_DATA.Books || []).forEach(b => {
    if ((text(b.title) + text(b.tags) + text(b.author)).toLowerCase().includes(q))
      results.push({...b, _type:'book'});
  });

  const grid = document.getElementById('searchResultsGrid');
  const count = document.getElementById('searchResultsCount');
  if (count) count.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`;
  if (grid) {
    if (results.length === 0) {
      grid.innerHTML = '<div class="empty-state"><i class="fa fa-search"></i><h3>No results found</h3><p>Try different keywords.</p></div>';
    } else {
      grid.innerHTML = results.map(item => {
        if (item._type === 'scholarship') return cardScholarship(item);
        if (item._type === 'job') return cardJob(item);
        if (item._type === 'internship') return cardInternship(item);
        if (item._type === 'exam') return cardExam(item);
        if (item._type === 'book') return cardBook(item);
        return '';
      }).join('');
    }
  }
}

// ── Favorites page ────────────────────────────────────────────
function loadFavoritesPage() {
  const favs = getFavs();
  const grid = document.getElementById('favoritesGrid');
  const count = document.getElementById('favCount');
  if (count) count.textContent = favs.length;
  if (!grid) return;
  if (favs.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa fa-bookmark"></i><h3>No saved items</h3><p>Browse scholarships, jobs and more to save items.</p></div>';
    return;
  }
  const allData = {
    scholarship: window.CMS_DATA.Scholarships || [],
    job: window.CMS_DATA.Jobs || [],
    internship: window.CMS_DATA.Internships || [],
    exam: window.CMS_DATA.Exams || [],
    book: window.CMS_DATA.Books || []
  };
  const cards = [];
  favs.forEach(fav => {
    const item = (allData[fav.type] || []).find(x => x.id === fav.id);
    if (!item) return;
    if (fav.type === 'scholarship') cards.push(cardScholarship(item));
    else if (fav.type === 'job') cards.push(cardJob(item));
    else if (fav.type === 'internship') cards.push(cardInternship(item));
    else if (fav.type === 'exam') cards.push(cardExam(item));
    else if (fav.type === 'book') cards.push(cardBook(item));
  });
  grid.innerHTML = cards.join('');
}

function storeFavoriteDeadline(item, type) {
  const deadline = item?.deadline || item?.test_date;
  if (!deadline) return;
  const key = `${type}:${item.id}`;
  const current = JSON.parse(localStorage.getItem('ch_fav_deadlines') || '{}');
  current[key] = { title: item.title, type, deadline };
  localStorage.setItem('ch_fav_deadlines', JSON.stringify(current));
}

function checkDeadlineAlerts() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('ch_deadline_check_date') === today) return;
  localStorage.setItem('ch_deadline_check_date', today);
  const saved = JSON.parse(localStorage.getItem('ch_fav_deadlines') || '{}');
  const alerts = Object.values(saved).filter((item) => {
    const days = daysUntil(item.deadline);
    return typeof days === 'number' && days >= 0 && days <= 7;
  });
  if (!alerts.length) return;
  alert(`Deadline alert: ${alerts.length} saved item(s) are closing within 7 days.`);
}

// ── Init on DOM ready ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ensureResourcePreviewModal();
  initMenu();
  ensureCardDetailsModal();
  initDarkMode();
  updateFavCount();
  ensureChatbotLoaded();
  initGlobalSitePolish();
  checkDeadlineAlerts();
  document.addEventListener('cmsLoadFailed', () => {
    document.querySelectorAll('.cards-grid').forEach((grid) => {
      if (!grid.querySelector('.skeleton-card')) return;
      grid.innerHTML = '<div class="empty-state"><i class="fa fa-triangle-exclamation"></i><h3>Failed to load data. Please refresh.</h3></div>';
    });
  });
  // Run CMS-dependent things only after data is ready
   whenCMSReady(() => {
    loadNotifications();
    updateFavCount();
    // Popup on homepage after 4s
    if (document.getElementById('popupModal')) {
      setTimeout(showPopup, 4000);
    }
    // Search page (fallback if search.html didn't handle it)
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get('q');
    if (q && document.getElementById('searchResultsGrid')) {
      const input = document.getElementById('searchQueryInput');
      if (input) input.value = q;
      runSearch(q);
    }
  });
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!target) return;
  const selectedText = window.getSelection ? String(window.getSelection()) : '';
  if (selectedText && selectedText.trim()) return;
  const interactive = target.closest('a, button, .btn-fav, .resource-actions');
  if (interactive) return;
  const card = target.closest('.card[data-id][data-type]');
  if (!card) return;
  openCardPost(card.dataset.id, card.dataset.type);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCardDetails();
    closeResourcePreview();
  }
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target?.closest?.('.card[data-id][data-type]');
  if (!card) return;
  event.preventDefault();
  openCardPost(card.dataset.id, card.dataset.type);
});

// ── Scroll-triggered card animations ────────────────────────
(function () {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });

  // Expose globally so renderCards can trigger re-scan
  window.observeCards = function observeCards() {
    document.querySelectorAll('.card:not(.visible), .exam-card:not(.visible)').forEach(c => io.observe(c));
  };
  window.observeCards();

  // Re-run after CMS renders cards
  const cardGrids = ['scholarshipsGrid','jobsGrid','booksGrid','internshipsGrid','examsGrid','cardsGrid','resultsGrid','searchResultsGrid','favoritesGrid'];
  function hookGrids() {
    cardGrids.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._observed) {
        el._observed = true;
        new MutationObserver(() => setTimeout(window.observeCards, 50)).observe(el, { childList: true });
      }
    });
  }
  document.addEventListener('DOMContentLoaded', hookGrids);
  setTimeout(hookGrids, 500);
})();

// ── Animated counter for hero stats ─────────────────────────
function animateCounter(el, target, suffix) {
  let start = 0;
  const duration = 1200;
  const step = timestamp => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.floor(eased * target).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCounters() {
  const counters = [
    { id: 'statScholarships', target: 500, suffix: '+' },
    { id: 'statJobs',         target: 1200, suffix: '+' },
    { id: 'statExams',        target: 50,  suffix: '+' },
    { id: 'statBooks',        target: 300, suffix: '+' },
  ];
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const counter = counters.find(c => c.id === el.id);
      if (counter) animateCounter(el, counter.target, counter.suffix);
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => {
    const el = document.getElementById(c.id);
    if (el) io.observe(el);
  });
}
document.addEventListener('DOMContentLoaded', initCounters);

// ── Navbar scroll shadow ─────────────────────────────────────
(function initNavbarScrollState() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  let ticking = false;
  const updateState = () => {
    nav.classList.toggle('scrolled', window.scrollY > 10);
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateState);
  };

  updateState();
  window.addEventListener('scroll', onScroll, { passive: true });
})();


function initGlobalSitePolish() {
  enhanceImageLoadingAndAlt();
  improveInteractiveAccessibility();
  ensureExternalLinkSafety();
  injectAdPlaceholders();
  injectCompactSidebarAds();
  initMobileSmartFilterBar();
    initPWA();
}

function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));
      if (window.caches && typeof window.caches.keys === 'function') {
        const keys = await window.caches.keys().catch(() => []);
        await Promise.all(keys.map((key) => window.caches.delete(key).catch(() => false)));
      }
    });
  }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    const installBtn = document.getElementById('installAppBtn');
    if (!installBtn) return;
    installBtn.style.display = 'inline-flex';
    installBtn.onclick = async () => {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.style.display = 'none';
    };
  });
}


function initMobileSmartFilterBar() {
  if (window.innerWidth > 768 || document.body.classList.contains('home-page')) return;
  const bar = document.querySelector('.filter-bar');
  if (!bar) return;

  let lastY = window.scrollY;
  bar.classList.add('filter-visible');

  const onScroll = () => {
    const currentY = window.scrollY;
    const delta = currentY - lastY;

    if (currentY <= 8) {
      bar.classList.add('filter-visible');
      bar.classList.remove('filter-hidden');
      lastY = currentY;
      return;
    }

    if (delta > 4) {
      bar.classList.add('filter-hidden');
      bar.classList.remove('filter-visible');
    } else if (delta < -4) {
      bar.classList.add('filter-visible');
      bar.classList.remove('filter-hidden');
    }

    lastY = currentY;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
}

function enhanceImageLoadingAndAlt() {
  const imgs = document.querySelectorAll('img');
  const viewportHeight = window.innerHeight || 900;

  imgs.forEach((img, index) => {
    const rect = img.getBoundingClientRect();
    const closeToViewport = rect.top < viewportHeight * 1.25;
    const shouldEagerLoad = index === 0 || closeToViewport;

    if (!img.getAttribute('loading')) img.setAttribute('loading', shouldEagerLoad ? 'eager' : 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    if (!img.getAttribute('fetchpriority')) img.setAttribute('fetchpriority', shouldEagerLoad ? 'high' : 'low');

    if (!img.hasAttribute('width') && rect.width > 0) img.setAttribute('width', String(Math.round(rect.width)));
    if (!img.hasAttribute('height') && rect.height > 0) img.setAttribute('height', String(Math.round(rect.height)));

    if (!img.dataset.imageFallbackBound) {
      img.dataset.imageFallbackBound = 'true';
      img.addEventListener('error', () => {
        img.style.visibility = 'hidden';
      }, { once: true });
    }

    const rawAlt = (img.getAttribute('alt') || '').trim();
    if (!rawAlt) {
      const fallback = img.closest('a')?.textContent?.trim() || img.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || 'Career Pakistan image';
      img.setAttribute('alt', fallback.replace(/\s+/g, ' ').slice(0, 120));
    }
  });
}

function improveInteractiveAccessibility() {
  document.querySelectorAll('button').forEach((btn) => {
    if (!btn.getAttribute('type')) btn.setAttribute('type', 'button');
    const textLabel = (btn.textContent || '').replace(/\s+/g, ' ').trim();
    if (!btn.getAttribute('aria-label') && !textLabel) {
      const iconClass = btn.querySelector('i')?.className || '';
      if (iconClass.includes('fa-search')) btn.setAttribute('aria-label', 'Open search');
      else if (iconClass.includes('fa-moon')) btn.setAttribute('aria-label', 'Toggle dark mode');
      else if (iconClass.includes('fa-bars')) btn.setAttribute('aria-label', 'Open navigation menu');
      else if (iconClass.includes('fa-times')) btn.setAttribute('aria-label', 'Close');
      else btn.setAttribute('aria-label', 'Action button');
    }
  });

  document.querySelectorAll('a[target="_blank"]').forEach((a) => {
    const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    a.setAttribute('rel', Array.from(rel).join(' '));
  });
}

function ensureExternalLinkSafety() {
  document.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const parsed = new URL(href, window.location.origin);
      const isExternal = parsed.origin !== window.location.origin;
      if (isExternal) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    } catch (_) { /* ignore malformed links */ }
  });
}

function buildAdSlot(position, label) {
  const slot = document.createElement('section');
  slot.className = `ad-slot ad-slot-${position}`;
  slot.setAttribute('aria-label', `${label} advertisement`);
  slot.innerHTML = `<div class="ad-slot-inner"><span class="ad-chip">Ad Space</span><strong>${label}</strong><small>Reserved for responsive ad unit</small></div>`;
  return slot;
}

function buildCompactSidebarAd() {
  const ad = document.createElement('div');
  ad.className = 'compact-sidebar-ad compact-sidebar-ad-inline';
  ad.setAttribute('role', 'complementary');
  ad.setAttribute('aria-label', 'Sponsored placement');
  ad.innerHTML = `
    <span class="compact-sidebar-ad-label">Sponsored</span>
    <div class="compact-sidebar-ad-copy">Promote your course, coaching, or study tool here.</div>
  `;
  return ad;
}

function injectCompactSidebarAds() {
  const sidebarBlocks = document.querySelectorAll(
    '.compact-deadline-sidebar, .home-latest-sidebar[aria-label="Latest books"], .quick-access-sidebar[aria-label="Book category updates"]'
  );
  sidebarBlocks.forEach((block) => {
    const prev = block.previousElementSibling;
    if (prev && prev.classList.contains('compact-sidebar-ad-inline')) return;
    block.insertAdjacentElement('beforebegin', buildCompactSidebarAd());
  });
}

function injectAdPlaceholders() {
  if (document.querySelector('.ad-slot')) return;

  const navbar = document.querySelector('.navbar');
  if (navbar && navbar.parentNode) {
    navbar.insertAdjacentElement('afterend', buildAdSlot('header', 'Header Banner'));
  }

  const firstSection = document.querySelector('main .section, .section');
  if (firstSection && firstSection.parentNode) {
    firstSection.insertAdjacentElement('beforebegin', buildAdSlot('incontent', 'In-content Banner'));
  }

  const opportunitySidebar = document.querySelector('.opportunity-sidebar');
  if (opportunitySidebar) {
    opportunitySidebar.insertAdjacentElement('afterbegin', buildAdSlot('sidebar', 'Sidebar Rectangle'));
  } else {
    const sidebar = document.querySelector('.home-latest-sidebar, .footer-col');
    if (sidebar && sidebar.parentNode) {
      sidebar.insertAdjacentElement('beforebegin', buildAdSlot('sidebar', 'Sidebar Rectangle'));
    }
  }

  const footer = document.querySelector('footer.footer');
  if (footer && footer.parentNode) {
    footer.insertAdjacentElement('beforebegin', buildAdSlot('footer', 'Footer Banner'));
  }
}


// CMS loading UI state bindings
document.addEventListener('cmsLoading', function (event) {
  var loading = !!(event && event.detail && event.detail.loading);
  document.querySelectorAll('.cards-grid, .cards-container').forEach(function (el) {
    el.classList.toggle('is-loading', loading);
  });
});

document.addEventListener('cmsLoadFailed', function () {
  document.querySelectorAll('.cards-grid').forEach(function (grid) {
    if (!grid.children.length) renderGridFallback(grid, 'Data failed to load. Please refresh.');
  });
});
