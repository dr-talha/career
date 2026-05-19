'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

const PAGE_ROUTES = {
  '/': 'index.html',
  '/index': 'index.html',
  '/jobs': 'jobs.html',
  '/jobs-private': 'jobs-private.html',
  '/jobs-government': 'jobs-government.html',
  '/scholarships': 'scholarships.html',
  '/scholarships-national': 'scholarships-national.html',
  '/scholarships-international': 'scholarships-international.html',
  '/internships': 'internships.html',
  '/exams': 'exams.html',
  '/exams-css': 'exams-css.html',
  '/exams-mdcat': 'exams-mdcat.html',
  '/exams-ppsc': 'exams-ppsc.html',
  '/books': 'books.html',
  '/blog': 'blog.html',
  '/blog-post': 'blog-post.html',
  '/search': 'search.html',
  '/favorites': 'favorites.html',
  '/resume-builder': 'resume-builder.html',
  '/opportunity': 'opportunity.html',
  '/contact': 'contact.html',
  '/about': 'about.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
};

function addResponseHelpers(res) {
  if (typeof res.status !== 'function') {
    res.status = function status(code) {
      res.statusCode = code;
      return res;
    };
  }

  if (typeof res.json !== 'function') {
    res.json = function json(payload) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(payload));
      return res;
    };
  }

  if (typeof res.send !== 'function') {
    res.send = function send(payload) {
      if (Buffer.isBuffer(payload) || typeof payload === 'string') {
        res.end(payload);
      } else {
        if (!res.getHeader('Content-Type')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify(payload));
      }
      return res;
    };
  }
}

function safeResolve(rootDir, unsafePath) {
  const resolved = path.resolve(rootDir, unsafePath);
  if (!resolved.startsWith(rootDir)) return null;
  return resolved;
}

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    stream.pipe(res);
  });
  stream.on('error', () => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Internal Server Error');
  });
}

function serveStatic(filePath, res) {
  const safePath = safeResolve(ROOT_DIR, filePath);
  if (!safePath) {
    res.statusCode = 400;
    return res.end('Bad Request');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const notFoundPath = path.join(ROOT_DIR, '404.html');
      if (fs.existsSync(notFoundPath)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(fs.readFileSync(notFoundPath));
      }
      res.statusCode = 404;
      return res.end('Not Found');
    }

    streamFile(safePath, res);
  });
}

function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

async function handleApi(req, res, pathname, parsedUrl) {
  const apiModulePath = safeResolve(ROOT_DIR, `.${pathname}.js`);
  if (!apiModulePath || !fs.existsSync(apiModulePath)) {
    res.statusCode = 404;
    return res.json({ error: 'API endpoint not found' });
  }

  try {
    delete require.cache[require.resolve(apiModulePath)];
    const handler = require(apiModulePath);

    if (typeof handler !== 'function') {
      res.statusCode = 500;
      return res.json({ error: 'Invalid API handler export' });
    }

    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    req.path = pathname;

    await Promise.resolve(handler(req, res));
  } catch (err) {
    console.error(`API handler error for ${pathname}:`, err);
    res.statusCode = 500;
    return res.json({ error: 'Internal API Server Error' });
  }
}

const server = http.createServer(async (req, res) => {
  addResponseHelpers(res);

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = normalizePath(parsedUrl.pathname);

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, parsedUrl);
  }

  const mappedPage = PAGE_ROUTES[pathname];
  if (mappedPage) {
    return serveStatic(mappedPage, res);
  }

  const staticCandidate = pathname.replace(/^\//, '');
  if (!staticCandidate) {
    return serveStatic('index.html', res);
  }

  return serveStatic(staticCandidate, res);
});

server.listen(PORT, () => {
  console.log(`Career Pakistan server running on http://localhost:${PORT}`);
});
