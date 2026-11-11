// Self-hosted passcode gate for this remake.
//
// The engine's middleware.js is Vercel Routing Middleware. This is the same
// gate as a plain Node server, so the site can be served by anything: this
// box, a container, a VPS, or Cloudflare. Set REMAKE_PASSCODE to lock it;
// leave it unset to open the site.
//
//   REMAKE_PASSCODE=secret node server.mjs --port 48703
//
// The gate, the cookie and the robots headers match middleware.js exactly, so
// the engine's own outside-the-host gate check works against it unchanged.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(ROOT, 'site');
const COOKIE = 'remake_pass';
const ROBOTS = { 'x-robots-tag': 'noindex, nofollow' };

const portArg = process.argv.indexOf('--port');
const PORT = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT || 48703);
const PASSCODE = process.env.REMAKE_PASSCODE || '';

function digest(text) {
  return crypto.createHash('sha256').update('remake:' + String(text).trim().toLowerCase()).digest('hex');
}

const EXPECTED = PASSCODE ? digest(PASSCODE) : '';

function gateForm(nextPath, wrong) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Private preview</title>
<style>:root{--ink:#15171b;--muted:#5b626d;--line:#dde0e5;--accent:#ff5a1f}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
form{background:#fff;border:1px solid var(--line);border-radius:14px;padding:28px;width:min(100%,380px);display:grid;gap:14px}h1{font:800 24px/1.1 inherit;letter-spacing:-.03em;margin:0}p{margin:0;color:var(--muted)}
input{font:inherit;padding:11px 12px;border:1px solid var(--line);border-radius:8px}input:focus{outline:2px solid var(--accent);outline-offset:1px}button{font:600 15px/1 inherit;letter-spacing:-.01em;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:12px;cursor:pointer}.err{color:#c4321b}</style></head>
<body><form method="post" action="/_remake/gate" data-remake-gate><h1>Private preview</h1><p>This site is a work in progress. Enter the passcode to see it.</p>${wrong ? '<p class="err">That passcode didn\'t work.</p>' : ''}
<input type="hidden" name="next" value="${nextPath.replace(/"/g, '&quot;')}"><input name="passcode" type="password" autocomplete="current-password" placeholder="Passcode" aria-label="Passcode" required autofocus><button type="submit">Open</button></form></body></html>`;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(SITE, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(SITE)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      // Unknown path: try the directory's index, then 404.
      const alt = path.join(SITE, path.normalize(rel + '/index.html').replace(/^([/\\])+/, ''));
      return fs.stat(alt, (err2, st2) => {
        if (err2 || !st2.isFile()) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...ROBOTS });
          return res.end('Not found');
        }
        return send(alt, st2, res);
      });
    }
    return send(file, stat, res);
  });
}

function send(file, stat, res) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-cache',
    ...ROBOTS,
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain', ...ROBOTS });
    return res.end('User-agent: *\nDisallow: /\n');
  }

  if (!EXPECTED) {
    // No passcode set: the site is open, but still hidden from search engines.
    if (url.pathname === '/_remake/gate' && req.method === 'POST') {
      res.writeHead(303, { location: '/', ...ROBOTS });
      return res.end();
    }
    return serveStatic(req, res, url);
  }

  if (url.pathname === '/_remake/gate' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      const form = new URLSearchParams(body);
      const given = String(form.get('passcode') || '');
      let dest = String(form.get('next') || '/');
      if (!dest.startsWith('/') || dest.startsWith('//')) dest = '/';
      if (digest(given) !== EXPECTED) {
        res.writeHead(303, {
          location: dest + (dest.includes('?') ? '&' : '?') + 'remake_wrong=1',
          ...ROBOTS,
        });
        return res.end();
      }
      res.writeHead(303, {
        location: dest,
        'set-cookie': `${COOKIE}=${EXPECTED}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000`,
        ...ROBOTS,
      });
      res.end();
    });
    return;
  }

  const cookie = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (cookie && cookie.slice(COOKIE.length + 1) === EXPECTED) {
    return serveStatic(req, res, url);
  }

  const nextPath = url.pathname.startsWith('/_remake/gate') ? '/' : url.pathname + url.search;
  res.writeHead(401, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...ROBOTS,
  });
  res.end(gateForm(nextPath, url.searchParams.has('remake_wrong')));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Remake serving ${SITE}`);
  console.log(`  url       http://127.0.0.1:${PORT}`);
  console.log(`  proof     http://127.0.0.1:${PORT}/_remake/`);
  console.log(`  swap      http://127.0.0.1:${PORT}/_remake/swap/`);
  console.log(`  gate      ${EXPECTED ? 'locked (passcode required)' : 'open (no REMAKE_PASSCODE set)'}`);
});
