#!/usr/bin/env node
// Local preview that behaves like GitHub Pages for this project site:
// served under /portfolio/, case-sensitive paths, directory → index.html,
// and 404.html (with a 404 status) for anything missing.
//   node tools/serve.mjs [port]   → http://localhost:8080/portfolio/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/portfolio/';
const PORT = Number(process.argv[2] || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.xml': 'application/xml'
};

async function file(p) {
  try { const s = await stat(p); return s.isFile() ? p : s.isDirectory() ? file(join(p, 'index.html')) : null; } catch { return null; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let found = null;
  if (url.pathname === '/portfolio') { res.writeHead(301, { Location: BASE }); return res.end(); }
  if (url.pathname.startsWith(BASE)) {
    const rel = normalize(decodeURIComponent(url.pathname.slice(BASE.length)));
    if (!rel.startsWith('..')) {
      const p = await file(join(ROOT, rel));
      // Directory URLs without a trailing slash redirect, as on GitHub Pages.
      if (p && p.endsWith('index.html') && !url.pathname.endsWith('/') && !url.pathname.endsWith('.html')) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search }); return res.end();
      }
      found = p;
    }
  }
  const status = found ? 200 : 404;
  const path = found || join(ROOT, '404.html');
  res.writeHead(status, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
  res.end(await readFile(path));
}).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}`));
