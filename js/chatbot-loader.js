const BLOG_PROXY_URL = '/api/sheets?sheet=Blogs';
const BLOG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRciVbiyyI9Kk7LS99tAB3fAYMmMebHCAAi4WdpzKwPLKh0xb57GHRr99sN1audsiOqP2Ix_kx3Ocmo/pub?output=csv';
const FALLBACK_IMAGE = 'banner.png';
const TRANSPARENT_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const BLOG_CACHE_KEY = 'careerpk_blog_cache';
const BLOG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function loadBlogCache() {
  if (typeof window.localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BLOG_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.posts) || typeof cached.ts !== 'number') return null;
    if (Date.now() - cached.ts > BLOG_CACHE_TTL) return null;
    return cached.posts;
  } catch (_) {
    return null;
  }
}

function saveBlogCache(posts) {
  if (typeof window.localStorage === 'undefined') return;
  try {
    localStorage.setItem(BLOG_CACHE_KEY, JSON.stringify({ ts: Date.now(), posts }));
  } catch (_) {}
}

// Store global blog posts for navigation context
window.GLOBAL_BLOG_POSTS = null;

function safeText(v = '') {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(v = '') {
  try {
    const parsed = new URL(String(v || '').trim(), window.location.origin);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return parsed.toString();
  } catch (_) {}
  return '';
}

function isEmailLike(v = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}

function normalizeActionLink(v = '') {
  const raw = String(v || '').trim();
  if (!raw) return '';
  if (isEmailLike(raw)) return `mailto:${raw}`;
  return safeUrl(raw);
}

function isTeraboxUrl(v = '') {
  return /(?:^|\.)terabox\.com|1024terabox\.com|terashare/i.test(String(v || ''));
}

function normalizeImageUrl(v = '') {
  const raw = String(v || '').trim();
  if (!raw) return '';

  // Google Drive share links -> direct render link
  const driveMatch = raw.match(/drive\.google\.com\/file\/d\/([^/]+)\//i);
  if (driveMatch?.[1]) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;

  // Google Drive open?id= links -> direct render link
  const openIdMatch = raw.match(/[?&]id=([^&]+)/i);
  if (/drive\.google\.com/i.test(raw) && openIdMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${openIdMatch[1]}`;
  }

  // Dropbox shared links -> raw file link
  if (/dropbox\.com/i.test(raw)) {
    return raw.replace(/[?&]dl=\d/i, '').replace(/\?$/, '') + (raw.includes('?') ? '&raw=1' : '?raw=1');
  }

  return safeUrl(raw);
}

function optimizeImageUrl(url = '', width = 900) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    // Google Drive supports resize hints via `sz`.
    if (/drive\.google\.com/i.test(parsed.hostname)) {
      parsed.searchParams.set('sz', `w${width}`);
      return parsed.toString();
    }
    return parsed.toString();
  } catch (_) {
    return normalized;
  }
}

function imageWithFallback(src = '', alt = 'Image') {
  const safeSrc = optimizeImageUrl(src, 720);
  const fallbackSrc = FALLBACK_IMAGE;
  // Use proper lazy loading with direct src instead of data-src pattern
  return `<img loading="lazy" decoding="async" fetchpriority="low" width="720" height="420" src="${TRANSPARENT_PLACEHOLDER}" data-src="${safeSrc || fallbackSrc}" alt="${safeText(alt)}" class="lazy-load-blog-img" onerror="this.onerror=null;this.src='${fallbackSrc}';">`;
}

function sanitizeRichText(raw = '') {
  const plain = String(raw).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();
  if (!plain) return '';
  return plain
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p>${safeText(chunk.replace(/\n+/g, ' '))}</p>`)
    .join('');
}



function setSafeHtml(el, html) {
  if (!el) return;
  const sanitized = String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
    .replace(/javascript:/gi, '');
  el.innerHTML = sanitized;
}

async function fetchTextSafe(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) throw new Error('Unexpected HTML response');
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
function dedupePosts(posts = []) {
  const seen = new Set();
  return posts.filter((post, index) => {
    const key = String(post.id || `${post.title}-${post.date || index}`).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBlogPost(post = {}, index = 0) {
  const cleanId = String(post.id || `blog-${index + 1}`).trim().replace(/[^\w-]/g, '').slice(0, 80);
  const cleanTitle = String(post.title || '').trim().slice(0, 200);
  return {
    id: cleanId || `blog-${index + 1}`,
    title: cleanTitle,
    category: String(post.category || '').trim(),
    description: String(post.description || post.details || '').trim(),
    short_description: String(post.short_description || '').trim(),
    image_url: String(post.image_url || '').trim(),
    author: String(post.author || '').trim(),
    date: String(post.date || post.posted_date || '').trim(),
    tags: String(post.tags || '').trim(),
    pdf_link: String(post.pdf_link || '').trim(),
    external_link: String(post.external_link || post.apply_link || post.source_link || '').trim(),
    featured: Boolean(post.featured || post.is_featured),
    tagsArray: String(post.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

async function fetchPosts() {
  if (typeof window.onCMSReady === 'function' && !(window.CMS_DATA?.Blogs || []).length) {
    await new Promise((resolve) => window.onCMSReady(resolve));
  }

  // 1) Prefer already-loaded CMS data so Blogs behave exactly like other tabs.
  const liveRows = (window.CMS_DATA && Array.isArray(window.CMS_DATA.Blogs)) ? window.CMS_DATA.Blogs : [];
  if (liveRows.length) {
    const posts = dedupePosts(liveRows.map(normalizeBlogPost).filter((p) => p.title));
    const sorted = posts.sort((a, b) => {
      const dateA = new Date(b.date || 0).getTime();
      const dateB = new Date(a.date || 0).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return b.id.localeCompare(a.id);
    });
    saveBlogCache(sorted);
    return sorted;
  }

  const cachedPosts = loadBlogCache();
  if (cachedPosts && cachedPosts.length) {
    return cachedPosts;
  }

  // 2) If CMS data isn't ready yet, use same proxy/fallback pattern as loader.
  const tryUrls = [BLOG_PROXY_URL, BLOG_CSV_URL];
  for (const url of tryUrls) {
    try {
      const csv = await fetchTextSafe(url);
      if (!csv || csv.trim().startsWith('{') || csv.trim().startsWith('<!')) continue;
      const rows = csv.trim().split(/\r?\n/);
      if (rows.length < 2) continue;
      const headers = rows[0].split(',').map((h) => h.trim().toLowerCase());
      const titleIdx = headers.findIndex((h) => h.includes('title'));
      if (titleIdx < 0) continue;
      const posts = rows.slice(1).map((row, i) => {
        const cols = row.split(',');
        const r = {};
        headers.forEach((h, idx) => { r[h] = (cols[idx] || '').trim(); });
        return {
          id: r['id'] || String(i + 1),
          title: r['title'] || '',
          category: r['category'] || '',
          short_description: r['short description'] || r['summary'] || r['excerpt'] || '',
          description: r['description'] || r['content'] || r['details'] || '',
          image_url: r['image url'] || r['image'] || '',
          date: r['date'] || r['published date'] || r['posted date'] || '',
          tags: r['tags'] || '',
          apply_link: r['apply link'] || r['link'] || r['url'] || '',
          pdf_link: r['pdf link'] || r['document link'] || '',
        };
      });
      const filtered = dedupePosts(posts.map(normalizeBlogPost).filter((p) => p.title));
      const sorted = filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      saveBlogCache(sorted);
      return sorted;
    } catch (err) {
      console.warn('[Blog] fetch failed for', url, err.message);
    }
  }

  throw new Error('Could not load blog posts');
}

const adSlot = () => '<div class="ad-slot" aria-label="Advertisement">Ad Space</div>';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');

function initBlogListPage() {
  const list = document.getElementById('blogList');
  if (!list) return;

  const state = { page: 1, perPage: 6, q: '', cat: '', tag: '', posts: [], filtered: [] };
  const loadBtn = document.getElementById('loadMoreBtn');
  const tagsEl = document.getElementById('tagFilter');

  const applyFilters = () => {
    state.filtered = state.posts.filter((p) =>
      (!state.q || p.title.toLowerCase().includes(state.q) || (p.short_description || '').toLowerCase().includes(state.q)) &&
      (!state.cat || p.category === state.cat) &&
      (!state.tag || p.tagsArray.includes(state.tag))
    );
    state.page = 1;
    render();
  };

  // Setup lazy loading observer for blog images
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.target.dataset.src) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.add('img-loading');
        
        const onLoad = () => {
          img.classList.remove('img-loading');
          img.classList.add('img-loaded');
        };
        
        if (img.complete && img.naturalWidth > 0) {
          onLoad();
        } else {
          img.addEventListener('load', onLoad, { once: true });
        }
        
        imageObserver.unobserve(img);
      }
    });
  }, { rootMargin: '200px' });

  const render = () => {
    const show = state.filtered.slice(0, state.page * state.perPage);
    list.innerHTML = show.length ? '' : '<p style="text-align:center;">No blog posts found.</p>';

    show.forEach((p, idx) => {
      const imageSrc = normalizeImageUrl(p.image_url);
      const imageHtml = imageWithFallback(imageSrc, p.title);
      list.insertAdjacentHTML('beforeend', `<article class="blog-card" role="link" tabindex="0" data-href="blog-post.html?id=${encodeURIComponent(p.id)}">${imageHtml}<div class="blog-card-body"><span class="chip">${safeText(p.category || 'General')}</span><h3>${safeText(p.title)}</h3><p>${safeText(p.short_description || '')}</p><div class="meta">${fmtDate(p.date)}</div><a class="btn btn-primary" href="blog-post.html?id=${encodeURIComponent(p.id)}">Read More</a></div></article>`);
      if ((idx + 1) % 4 === 0) list.insertAdjacentHTML('beforeend', adSlot());

      // TeraBox image fallback link (preview method when direct render is blocked).
      if (isTeraboxUrl(p.image_url)) {
        list.insertAdjacentHTML('beforeend', `<p class="meta" style="margin-top:-8px;"><a href="${safeUrl(p.image_url)}" target="_blank" rel="noopener noreferrer">Open image source</a></p>`);
      }
    });

    // Observe all lazy images
    list.querySelectorAll('.lazy-load-blog-img').forEach(img => imageObserver.observe(img));

    loadBtn.style.display = show.length < state.filtered.length ? 'inline-flex' : 'none';
  };

  document.getElementById('blogSearch').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); applyFilters(); });
  document.getElementById('categoryFilter').addEventListener('change', (e) => { state.cat = e.target.value; applyFilters(); });
  tagsEl.addEventListener('change', (e) => { state.tag = e.target.value; applyFilters(); });
  loadBtn.addEventListener('click', () => { state.page += 1; render(); });
    list.addEventListener('click', (event) => {
    const card = event.target.closest('.blog-card[data-href]');
    if (!card) return;
    if (event.target.closest('a, button, input, select, textarea')) return;
    window.location.href = card.dataset.href;
  });
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.blog-card[data-href]');
    if (!card) return;
    event.preventDefault();
    window.location.href = card.dataset.href;
  });

  list.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';

  fetchPosts()
    .then((posts) => {
      state.posts = posts;
      // Store globally for navigation context
      window.GLOBAL_BLOG_POSTS = posts;
      
      const categoryEl = document.getElementById('categoryFilter');
      const categories = [...new Set(posts.map((p) => (p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      categoryEl.innerHTML = '<option value="">All Categories</option>';
      categories.forEach((category) => categoryEl.insertAdjacentHTML('beforeend', `<option value="${safeText(category)}">${safeText(category)}</option>`));
      [...new Set(posts.flatMap((p) => p.tagsArray))]
        .forEach((tag) => tagsEl.insertAdjacentHTML('beforeend', `<option value="${safeText(tag)}">${safeText(tag)}</option>`));
      applyFilters();
    })
    .catch(() => {
      list.innerHTML = '<p style="text-align:center;">Could not load blog posts. Please try again later.<br><button type="button" onclick="location.reload()">Retry</button></p>';
    });
}


function renderSidebarPosts(listId, toggleId, items) {
  const container = document.getElementById(listId);
  const toggle = document.getElementById(toggleId);
  if (!container) return;

  const initialCount = 3;
  let expanded = false;

  const render = () => {
    const visible = expanded ? items : items.slice(0, initialCount);
    container.innerHTML = visible.map((p) => `<a href="blog-post.html?id=${encodeURIComponent(p.id)}"><strong>${safeText(p.title)}</strong><br><small>${safeText(p.category || 'General')} • ${fmtDate(p.date)}</small></a>`).join('') || '<a href="blog.html"><strong>No posts available.</strong></a>';

    if (toggle) {
      const hasMore = items.length > initialCount;
      toggle.style.display = hasMore ? 'inline-flex' : 'none';
      toggle.textContent = expanded ? 'Show Less' : 'View More';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  };

  if (toggle) {
    toggle.onclick = () => {
      expanded = !expanded;
      render();
    };
  }

  render();
}

function initBlogPostPage() {
  const postTitle = document.getElementById('postTitle');
  if (!postTitle) return;

  const id = new URLSearchParams(location.search).get('id');
  fetchPosts()
    .then((posts) => {
      const post = posts.find((p) => p.id === id) || posts[0];
      if (!post) return;

      postTitle.textContent = post.title;
      document.getElementById('postMeta').textContent = `${post.category || 'General'} • ${fmtDate(post.date)}`;

      const postImageEl = document.getElementById('postImage');
      const postImageSrc = optimizeImageUrl(post.image_url, 1200) || FALLBACK_IMAGE;
      postImageEl.src = postImageSrc;
      postImageEl.loading = 'eager';
      postImageEl.fetchPriority = 'high';
      postImageEl.decoding = 'async';
      const pictureSource = postImageEl.closest('picture')?.querySelector('source');
      if (pictureSource) pictureSource.srcset = postImageSrc;
      
      const contentHtml = sanitizeRichText(post.description || post.short_description || 'No content available.') || '<p>No content available.</p>';
      setSafeHtml(document.getElementById('postContent'), contentHtml);
      
      const actions = document.getElementById('postActions');
      actions.innerHTML = '';
      const pdfUrl = normalizeActionLink(post.pdf_link);
      const externalUrl = normalizeActionLink(post.external_link);

      if (pdfUrl) {
        actions.insertAdjacentHTML('beforeend', `<a class="btn btn-secondary" href="${pdfUrl}" target="_blank" rel="noopener noreferrer">View PDF</a>`);
        actions.insertAdjacentHTML('beforeend', `<a class="btn btn-ghost" href="${pdfUrl}" download rel="noopener noreferrer">Download PDF</a>`);
      }
      if (externalUrl) {
        actions.insertAdjacentHTML('beforeend', `<a class="btn btn-primary" href="${externalUrl}" target="_blank" rel="noopener noreferrer">Reference Link</a>`);
      }
      if (isTeraboxUrl(post.image_url)) {
        actions.insertAdjacentHTML('beforeend', `<a class="btn btn-ghost" href="${safeUrl(post.image_url)}" target="_blank" rel="noopener noreferrer">Open Image Source</a>`);
      }

      // Add navigation controls
      const currentIndex = posts.findIndex(p => p.id === id);
      const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
      const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

      const navHtml = `
        <div class="blog-post-nav">
          ${prevPost ? `
            <a href="blog-post.html?id=${encodeURIComponent(prevPost.id)}" class="nav-post-card nav-prev">
              <div class="nav-direction"><i class="fa fa-arrow-left"></i> Previous</div>
              <div class="nav-title">${safeText(prevPost.title)}</div>
            </a>
          ` : `<div style="flex: 1;"></div>`}
          ${nextPost ? `
            <a href="blog-post.html?id=${encodeURIComponent(nextPost.id)}" class="nav-post-card nav-next">
              <div class="nav-direction">Next <i class="fa fa-arrow-right"></i></div>
              <div class="nav-title">${safeText(nextPost.title)}</div>
            </a>
          ` : `<div style="flex: 1;"></div>`}
        </div>
      `;
      document.getElementById('postContent').insertAdjacentHTML('afterend', navHtml);
      
      const related = posts.filter((p) => p.id !== post.id && (p.category === post.category || p.tagsArray.some((tag) => post.tagsArray.includes(tag))));
      renderSidebarPosts('relatedPosts', 'relatedPostsToggle', related);
      renderSidebarPosts('latestPosts', 'latestPostsToggle', posts);
    })
    .catch(() => {
      setSafeHtml(document.getElementById('postContent'), '<p style="text-align:center;">Could not load blog posts. Please try again later.<br><button type="button" onclick="location.reload()">Retry</button></p>');
    });
}

function initHomeBlogHighlights() {
  const wrap = document.getElementById('homeBlogHighlights');
  if (!wrap) return;

  fetchPosts()
    .then((posts) => {
      const picks = posts.filter((p) => p.featured).slice(0, 5);
      const data = picks.length ? picks : posts.slice(0, 5);
      wrap.innerHTML = data.map((p) => `<article class="mini-blog-card">${imageWithFallback(p.image_url, p.title)}<h3>${safeText(p.title)}</h3><a href="blog-post.html?id=${encodeURIComponent(p.id)}">Read</a></article>`).join('');
    })
    .catch(() => {
      wrap.innerHTML = '<p style="text-align:center;">Could not load blog posts. Please try again later.<br><button type="button" onclick="location.reload()">Retry</button></p>';
    });
}
