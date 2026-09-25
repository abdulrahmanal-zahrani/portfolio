#!/usr/bin/env node
// Checks every internal link, image and script in the generated pages:
// the target file must exist with exactly the same letter case (GitHub Pages
// is case-sensitive) and any #fragment must match an id on the target page.
//   node tools/check-links.mjs
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/portfolio/';
const SKIP_DIRS = new Set(['.git', 'node_modules', 'src', 'tools', 'data']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

// Exact-case existence check, one path segment at a time.
function existsExact(rel) {
  let dir = ROOT;
  for (const part of rel.split('/').filter(Boolean)) {
    if (!existsSync(dir) || !statSync(dir).isDirectory() || !readdirSync(dir).includes(part)) return false;
    dir = join(dir, part);
  }
  return true;
}

const pages = walk(ROOT);
const idsCache = new Map();
const ids = (rel) => {
  if (!idsCache.has(rel)) idsCache.set(rel, new Set([...readFileSync(join(ROOT, rel), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(rel);
};

let checked = 0;
const problems = [];
for (const file of pages) {
  const from = relative(ROOT, file).split('\\').join('/');
  const html = readFileSync(file, 'utf8');
  const refs = [];
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) refs.push(part.trim().split(/\s+/)[0]);
  for (const raw of refs) {
    if (!raw || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
    const ref = raw.replaceAll('&amp;', '&');
    const [pathAndQuery, frag] = ref.split('#');
    const path = pathAndQuery.split('?')[0];
    let target;
    if (path === '') target = from;
    else if (path.startsWith(BASE)) target = path.slice(BASE.length);
    else if (path.startsWith('/')) { problems.push(`${from}: absolute path outside the site: ${raw}`); continue; }
    else target = posix.normalize(posix.join(posix.dirname(from), path));
    if (target === '' || target.endsWith('/')) target += 'index.html';
    checked++;
    if (target.startsWith('..') || !existsExact(target)) { problems.push(`${from}: missing (case-sensitive) ${raw}`); continue; }
    if (frag && target.endsWith('.html') && !ids(target).has(frag)) problems.push(`${from}: no id="${frag}" in ${target}`);
  }
}
for (const p of problems) console.log('BROKEN ' + p);
console.log(`${pages.length} pages, ${checked} internal references, ${problems.length} broken`);
process.exit(problems.length ? 1 : 0);
