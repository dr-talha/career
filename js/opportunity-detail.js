// ============================================================
// Career Pakistan — opportunity-detail.js  (v2)
// Full single-post detail page for opportunity.html
//
// BUG FIX #5 (master prompt):
//   opportunity.html was a debug menu test page.
//   This script replaces it with the proper post detail view.
//
// Usage: include this on opportunity.html with defer.
// Reads URL params: ?type=job&id=123  OR  ?type=job&slug=some-title
//
// Renders:
//   - Breadcrumb
//   - Hero image + badges
//   - Detail grid (6 info boxes)
//   - Full description with rich text + PDF embeds
//   - Apply / Download CTA buttons
//   - Social share buttons
//   - Sidebar: related exams, books, scholarships by tag
//   - Deadline countdown
//   - Dynamic SEO meta tags
// ============================================================

(function () {
  'use strict';

  // ── Helpers (safe fallbacks if app.js hasn't loaded yet) ────
  const _text = (v) => String(v || '');
  const _esc  = (v) => _text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const _safe = (url) => {
    const raw = _text(url).trim();
    if (!raw || raw === '#') return '#';
    try {
      const p = new URL(raw, location.origin);
      return ['http:','https:','mailto:','tel:'].includes(p.protocol) ? p.href : '#';
    } catch { return '#'; }
  };
  const _fmt = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' });
  };
  const _daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / 86400000);
  };

  // Delegate to app.js functions when available
  const esc  = () => typeof escapeHtml  === 'function' ? escapeHtml  : _esc;
  const safe = () => typeof safeUrl     === 'function' ? safeUrl     : _safe;
  const fmt  = () => typeof formatDate  === 'function' ? formatDate  : _fmt;
  const days = () => typeof daysUntil   === 'function' ? daysUntil   : _daysUntil;
  const rich = () => typeof renderRichTextWithPreviews === 'function' ? renderRichTextWithPreviews : (v) => `<p>${_esc(v)}</p>`;

  // ── Read URL params ──────────────────────────────────────────
  function getParams() {
    const p = new URLSearchParams(location.search);
    return {
      type: (p.get('type') || '').toLowerCase(),
      id:   p.get('id') || '',
      slug: p.get('slug') || '',
    };
  }

  // ── Find item in CMS_DATA ────────────────────────────────────
  function findItem(type, id, slug) {
    const map = {
      scholarship: 'Scholarships',
      job:         'Jobs',
      internship:  'Internships',
      exam:        'Exams',
      book:        'Books',
    };
    const list = (window.CMS_DATA || {})[map[type]] || [];
    if (id) return list.find(x => String(x.id) === String(id)) || null;
    if (slug) {
      const normalize = (s) => _text(s).toLowerCase().trim().replace(/\s+/g,'-').replace(/[^\w-]+/g,'');
      return list.find(x => normalize(x.title) === normalize(slug)) || null;
    }
    return null;
  }

  // ── Get related items by tag overlap ─────────────────────────
  function getRelated(currentItem, allItems, limit) {
    limit = limit || 3;
    const currentTags = _text(currentItem.tags).toLowerCase().split(',').map(t=>t.trim()).filter(Boolean);
    if (!currentTags.length) return allItems.slice(0, limit);
    return allItems
      .filter(x => x.id !== currentItem.id)
      .map(x => {
        const xTags = _text(x.tags).toLowerCase().split(',').map(t=>t.trim());
        const overlap = currentTags.filter(t => xTags.includes(t)).length;
        return { ...x, _score: overlap };
      })
      .filter(x => x._score > 0)
      .sort((a,b) => b._score - a._score)
      .slice(0, limit);
  }

  // ── Build detail field box ────────────────────────────────────
  function detailBox(label, value, icon) {
    if (!value) return '';
    return `
      <div class="detail-row">
        <span class="detail-label"><i class="fa ${icon}"></i> ${_esc(label)}</span>
        <span class="detail-value">${_esc(_text(value))}</span>
      </div>`;
  }

  // ── Build CTA button ──────────────────────────────────────────
  function ctaBtn(label, url, primary) {
    const u = safe()(url);
    if (!u || u === '#') return '';
    const cls = primary ? 'btn btn-primary' : 'btn btn-secondary';
    return `<a href="${u}" target="_blank" rel="noopener noreferrer" class="${cls}">${_esc(label)}</a>`;
  }

  // ── Sidebar related card (mini) ───────────────────────────────
  function miniCard(item, type) {
    const icons = { scholarship:'🎓', job:'💼', internship:'🚀', exam:'📋', book:'📚' };
    const url = `opportunity.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`;
    const deadline = item.deadline || item.test_date || '';
    const d = days()(deadline);
    const urgency = (d !== null && d >= 0 && d <= 7)
      ? `<span class="badge badge-urgent" style="position:static;margin-left:4px;">⚡ ${d}d</span>` : '';
    return `
      <a href="${url}" class="home-latest-item" style="text-decoration:none;display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);margin-bottom:8px;transition:all .2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
        <strong style="font-size:.88rem;line-height:1.35;">${icons[type] || ''} ${_esc(item.title || '')}</strong>
        ${deadline ? `<span style="font-size:.75rem;color:var(--text-muted);">📅 ${fmt()(deadline)}${urgency}</span>` : ''}
      </a>`;
  }

  // ── Deadline countdown badge ──────────────────────────────────
  function countdownBadge(dateStr) {
    const d = days()(dateStr);
    if (d === null) return '';
    if (d < 0) return '<span class="badge badge-expired" style="position:static;display:inline-block;margin-left:8px;">Expired</span>';
    if (d === 0) return '<span class="badge badge-urgent" style="position:static;display:inline-block;margin-left:8px;">⚡ Closes Today!</span>';
    if (d <= 7)  return `<span class="badge badge-urgent" style="position:static;display:inline-block;margin-left:8px;">⚡ ${d} day${d===1?'':'s'} left</span>`;
    if (d <= 30) return `<span class="badge badge-soon" style="position:static;display:inline-block;margin-left:8px;">🔔 ${d} days left</span>`;
    return '';
  }

  // ── Type labels ───────────────────────────────────────────────
  const TYPE_LABELS = {
    scholarship: 'Scholarship',
    job:         'Job',
    internship:  'Internship',
    exam:        'Exam',
    book:        'Book',
  };
  const TYPE_PAGES = {
    scholarship: 'scholarships.html',
    job:         'jobs.html',
    internship:  'internships.html',
    exam:        'exams.html',
    book:        'books.html',
  };

  // ── Dynamic SEO meta update ───────────────────────────────────
  function updateMeta(item, type) {
    const label = TYPE_LABELS[type] || 'Opportunity';
    const title  = _text(item.title) || label;
    const desc   = _text(item.short_description || item.description || item.details).slice(0, 160) ||
                   `${label} opportunity on Career Pakistan.`;
    const image  = item.image_url || item.image_links?.[0] || '';
    const url    = location.href;

    document.title = `${title} | Career Pakistan`;
    _setMeta('name',      'description',     desc);
    _setMeta('property',  'og:title',        title);
    _setMeta('property',  'og:description',  desc);
    _setMeta('property',  'og:url',          url);
    if (image) _setMeta('property', 'og:image', image);
    _setMeta('name',      'twitter:title',   title);
    _setMeta('name',      'twitter:description', desc);
    if (image) _setMeta('name', 'twitter:image', image);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = url;
  }

  function _setMeta(attr, name, content) {
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
    el.setAttribute('content', content);
  }

  function sanitizeHtmlFragment(html) {
    return _text(html)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
      .replace(/javascript:/gi, '');
  }

  // ── Main render ───────────────────────────────────────────────
  function render(item, type) {
    const label    = TYPE_LABELS[type] || 'Opportunity';
    const listPage = TYPE_PAGES[type]  || 'index.html';
    const title    = _text(item.title);
    const imgSrc   = item.image_url || (item.image_links && item.image_links[0]) || '';
    const deadline = item.deadline || item.test_date || '';

    updateMeta(item, type);

    // Breadcrumb
    const breadEl = document.getElementById('opportunityBreadcrumb');
    if (breadEl) {
      breadEl.innerHTML = `
        <a href="index.html">Home</a>
        <i class="fa fa-chevron-right" style="font-size:.65rem;margin:0 6px;color:var(--text-muted)"></i>
        <a href="${listPage}">${_esc(label)}s</a>
        <i class="fa fa-chevron-right" style="font-size:.65rem;margin:0 6px;color:var(--text-muted)"></i>
        <span>${_esc(title)}</span>`;
    }

    // Hero image
    const heroImg = document.getElementById('opportunityHeroImg');
    const heroPh  = document.getElementById('opportunityHeroPlaceholder');
    if (heroImg && heroPh) {
      if (imgSrc) {
        heroImg.src = imgSrc;
        heroImg.alt = title;
        heroImg.style.display = 'block';
        heroPh.style.display  = 'none';
        heroImg.onerror = () => { heroImg.style.display='none'; heroPh.style.display='flex'; };
      } else {
        heroImg.style.display = 'none';
        heroPh.style.display  = 'flex';
      }
    }

    // Badges
    const badgeEl = document.getElementById('opportunityBadges');
    if (badgeEl) {
      const featured = item.is_featured ? '<span class="featured-badge" style="position:static;display:inline-block;">⭐ Featured</span>' : '';
      const urgency  = countdownBadge(deadline);
      badgeEl.innerHTML = featured + urgency;
    }

    // Title
    const titleEl = document.getElementById('opportunityTitle');
    if (titleEl) titleEl.textContent = title;

    // Meta row
    const metaEl = document.getElementById('opportunityMeta');
    if (metaEl) {
      const org = item.organization || item.university || item.author || '';
      const posted = item.posted_date || item.date || '';
      metaEl.innerHTML = `
        ${org ? `<span><i class="fa fa-building"></i> ${_esc(org)}</span>` : ''}
        ${item.location ? `<span><i class="fa fa-map-marker-alt"></i> ${_esc(item.location)}</span>` : ''}
        ${posted ? `<span><i class="fa fa-calendar-plus"></i> Posted: ${fmt()(posted)}</span>` : ''}
        ${deadline ? `<span><i class="fa fa-calendar"></i> Deadline: <strong class="deadline-date">${fmt()(deadline)}</strong></span>` : ''}`;
    }

    // Detail grid (6 boxes)
    const gridEl = document.getElementById('opportunityDetailGrid');
    if (gridEl) {
      let boxes = '';
      if (type === 'job') {
        boxes += detailBox('Organization', item.organization,  'fa-building');
        boxes += detailBox('Salary',       item.salary,        'fa-money-bill');
        boxes += detailBox('Type',         item.type,          'fa-briefcase');
        boxes += detailBox('Education',    item.education,     'fa-graduation-cap');
        boxes += detailBox('Experience',   item.experience,    'fa-user-clock');
        boxes += detailBox('Deadline',     fmt()(item.deadline),'fa-calendar');
        boxes += detailBox('Location',     item.location,      'fa-map-marker-alt');
        boxes += detailBox('Province',     item.province,      'fa-map');
        boxes += detailBox('Category',     item.category,      'fa-folder-open');
      } else if (type === 'scholarship') {
        boxes += detailBox('Funding',      item.funding,       'fa-wallet');
        boxes += detailBox('Type',         item.type,          'fa-layer-group');
        boxes += detailBox('Level',        item.level,         'fa-graduation-cap');
        boxes += detailBox('Country',      item.country,       'fa-globe');
        boxes += detailBox('Eligibility',  item.eligibility,   'fa-user-check');
        boxes += detailBox('Deadline',     fmt()(item.deadline),'fa-calendar');
        boxes += detailBox('University',   item.university,    'fa-school');
        boxes += detailBox('Field',        item.field,         'fa-book');
      } else if (type === 'internship') {
        boxes += detailBox('Organization', item.organization,  'fa-building');
        boxes += detailBox('Type',         item.type,          'fa-briefcase');
        boxes += detailBox('Stipend',      item.stipend,       'fa-money-bill');
        boxes += detailBox('Duration',     item.duration,      'fa-hourglass-half');
        boxes += detailBox('Location',     item.location,      'fa-map-marker-alt');
        boxes += detailBox('Deadline',     fmt()(item.deadline),'fa-calendar');
        boxes += detailBox('Education',    item.education_level,'fa-graduation-cap');
        boxes += detailBox('Category',     item.category,      'fa-folder-open');
      } else if (type === 'exam') {
        boxes += detailBox('Conducting Body', item.conducting_body, 'fa-building');
        boxes += detailBox('Exam Type',    item.exam_type,     'fa-book');
        boxes += detailBox('Test Date',    fmt()(item.test_date),'fa-calendar');
        boxes += detailBox('Reg. Deadline',fmt()(item.registration_deadline),'fa-calendar-check');
        boxes += detailBox('Fee',          item.fee,           'fa-money-bill');
        boxes += detailBox('Eligibility',  item.eligibility,   'fa-user-check');
        boxes += detailBox('Province',     item.province,      'fa-map');
      } else if (type === 'book') {
        boxes += detailBox('Author',       item.author,        'fa-user');
        boxes += detailBox('Exam',         item.exam_type,     'fa-book');
        boxes += detailBox('Category',     item.category,      'fa-tag');
        boxes += detailBox('Language',     item.language,      'fa-language');
        boxes += detailBox('Edition',      item.edition,       'fa-book-open');
        boxes += detailBox('Pages',        item.pages,         'fa-file-alt');
      }
      gridEl.innerHTML = boxes || '<p style="color:var(--text-muted)">Details listed below.</p>';
    }

    // Description / rich text body
    const bodyEl = document.getElementById('opportunityBody');
    if (bodyEl) {
      const rawText = item.details || item.description || item.short_description || '';
      const richHtml = rawText ? rich()(rawText) : '<p>Full details are available via the apply link below.</p>';
      bodyEl.innerHTML = sanitizeHtmlFragment(richHtml);
    }

    // CTA buttons
    const ctaEl = document.getElementById('opportunityCTA');
    if (ctaEl) {
      let btns = '';
      if (type === 'book') {
        btns += ctaBtn('📥 Download PDF', item.download_link || item.pdf_links?.[0], true);
        btns += ctaBtn('🛒 Buy Book',     item.apply_link,   false);
      } else if (type === 'exam') {
        btns += ctaBtn('📝 Apply / Register', item.apply_link,     true);
        btns += ctaBtn('📄 Syllabus',         item.syllabus_link,  false);
        btns += ctaBtn('📁 Past Papers',      item.past_papers_link, false);
      } else {
        btns += ctaBtn('🚀 Apply Now', item.apply_link, true);
        btns += ctaBtn('📄 View PDF',  item.pdf_links?.[0] || item.source_link, false);
      }
      ctaEl.innerHTML = btns || '';
    }

    // Tags
    const tagsEl = document.getElementById('opportunityTags');
    if (tagsEl && item.tags) {
      tagsEl.innerHTML = item.tags.split(',').map(t =>
        `<span class="tag">${_esc(t.trim())}</span>`
      ).join('');
    }

    // Social share
    const shareEl = document.getElementById('opportunityShare');
    if (shareEl) {
      const shareUrl = encodeURIComponent(location.href);
      const shareTitle = encodeURIComponent(title);
      shareEl.innerHTML = `
        <a href="https://wa.me/?text=${shareTitle}%20${shareUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><i class="fa-brands fa-facebook"></i> Facebook</a>
        <a href="https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><i class="fa-brands fa-twitter"></i> Twitter</a>
        <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.href).then(()=>alert('Link copied!'))"><i class="fa fa-link"></i> Copy Link</button>`;
    }

    // ── Sidebar: related content ─────────────────────────────────
    const data = window.CMS_DATA || {};

    // Related exams
    const relExamsEl = document.getElementById('sidebarRelatedExams');
    if (relExamsEl) {
      const related = getRelated(item, data.Exams || [], 4);
      relExamsEl.innerHTML = related.length
        ? related.map(x => miniCard(x, 'exam')).join('')
        : '<p style="font-size:.82rem;color:var(--text-muted)">No related exams found.</p>';
    }

    // Related books
    const relBooksEl = document.getElementById('sidebarRelatedBooks');
    if (relBooksEl) {
      const related = getRelated(item, data.Books || [], 4);
      relBooksEl.innerHTML = related.length
        ? related.map(x => miniCard(x, 'book')).join('')
        : '<p style="font-size:.82rem;color:var(--text-muted)">No related books found.</p>';
    }

    // Related scholarships
    const relScholarsEl = document.getElementById('sidebarRelatedScholarships');
    if (relScholarsEl && type !== 'scholarship') {
      const related = getRelated(item, data.Scholarships || [], 3);
      relScholarsEl.innerHTML = related.length
        ? related.map(x => miniCard(x, 'scholarship')).join('')
        : '<p style="font-size:.82rem;color:var(--text-muted)">No related scholarships found.</p>';
    }

    // Related internships
    const relInternsEl = document.getElementById('sidebarRelatedInternships');
    if (relInternsEl && type !== 'internship') {
      const related = getRelated(item, data.Internships || [], 3);
      relInternsEl.innerHTML = related.length
        ? related.map(x => miniCard(x, 'internship')).join('')
        : '<p style="font-size:.82rem;color:var(--text-muted)">No related internships found.</p>';
    }

    // Deadline countdown sidebar
    const countdownEl = document.getElementById('sidebarDeadlineCountdown');
    if (countdownEl && deadline) {
      const d = days()(deadline);
      if (d !== null && d >= 0 && d <= 30) {
        countdownEl.innerHTML = `
          <div class="sidebar-box" style="border-color:var(--primary)">
            <h3 style="color:var(--primary);font-size:.95rem;">⏳ Deadline</h3>
            <p style="font-size:1.6rem;font-weight:800;color:var(--primary);margin:4px 0;">${d === 0 ? 'Today!' : d + ' days'}</p>
            <p style="font-size:.8rem;color:var(--text-secondary);margin:0">${fmt()(deadline)}</p>
          </div>`;
      }
    }
  }

  // ── Not found state ───────────────────────────────────────────
  function renderNotFound(type) {
    const root = document.getElementById('opportunityRoot') || document.querySelector('main');
    if (!root) return;
    root.innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <i class="fa fa-triangle-exclamation" style="font-size:3rem;opacity:.4;margin-bottom:12px;"></i>
        <h3>Opportunity Not Found</h3>
        <p>This listing may have been removed or the link is incorrect.</p>
        <a href="${TYPE_PAGES[type] || 'index.html'}" class="btn btn-primary" style="margin-top:16px;">Browse ${TYPE_LABELS[type] || 'Opportunities'}s</a>
      </div>`;
  }

  // ── Loading skeleton ──────────────────────────────────────────
  function renderLoading() {
    const titleEl = document.getElementById('opportunityTitle');
    if (titleEl) titleEl.textContent = 'Loading…';
  }

  // ── Boot ──────────────────────────────────────────────────────
  function init() {
    const { type, id, slug } = getParams();
    if (!type) return;

    renderLoading();

    if (typeof window.onCMSReady === 'function') {
      window.onCMSReady(function () {
        const item = findItem(type, id, slug);
        if (item) render(item, type);
        else renderNotFound(type);
      });
    } else {
      // Fallback: wait for cmsReady event
      document.addEventListener('cmsReady', function () {
        const item = findItem(type, id, slug);
        if (item) render(item, type);
        else renderNotFound(type);
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
