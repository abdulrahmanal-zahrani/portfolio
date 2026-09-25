#!/usr/bin/env node
// Scans every file that GitHub Pages would publish for data that must not be
// public: IBAN / account patterns, Saudi bank BIC codes, phone numbers and
// e-mail addresses that are not the owner's, API keys, and every term in the
// local, git-ignored deny-list `.sensitive-terms` (one "term<TAB>category"
// per line; build it from the private sources, never commit it).
// Images are checked for embedded metadata. Matches are reported by file and
// line with the value masked.
//   node tools/check-public.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => existsSync(join(ROOT, f)));

// Owner's own published contact details are allowed.
const OWN = { emails: ['abdulrahmanfin@outlook.com', 'noreply@anthropic.com'], phones: ['966508498788'] };
// Professional facts in the CV may name employers (see README › Privacy rules).
const CV_FILES = new Set(['cv.html', 'src/pages/cv.html']);
// Owner-supplied documents published before the redesign; reviewed by hand.
const OWNER_DOCS = new Set(['Resources/References.pdf', 'Resources/Certificates/FMVA.pdf']);
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md', '.txt', '.svg', '.xml', '']);
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const FONTS = new Set(['.woff2']);

// Lists metadata blocks by walking each format's chunk structure.
function imageMetadata(b) {
  const found = [];
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    for (let i = 8; i + 8 <= b.length;) {
      const len = b.readUInt32BE(i), type = b.toString('latin1', i + 4, i + 8);
      if (['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(type)) found.push('png:' + type);
      i += 12 + len;
    }
  } else if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    for (let i = 12; i + 8 <= b.length;) {
      const type = b.toString('latin1', i, i + 4), len = b.readUInt32LE(i + 4);
      if (type === 'EXIF' || type === 'XMP ') found.push('webp:' + type.trim());
      i += 8 + len + (len % 2);
    }
  } else if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 4 <= b.length && b[i] === 0xff;) {
      const marker = b[i + 1], len = b.readUInt16BE(i + 2);
      if (marker === 0xda) break; // start of scan: no more headers
      if (marker === 0xe1) found.push('jpeg:APP1 (EXIF/XMP)');
      if (marker === 0xfe) found.push('jpeg:COM');
      i += 2 + len;
    }
  } else found.push('unknown image format');
  return found;
}

const deny = existsSync(join(ROOT, '.sensitive-terms'))
  ? readFileSync(join(ROOT, '.sensitive-terms'), 'utf8').split('\n')
    .filter((l) => l.trim() && !l.startsWith('#')).map((l) => { const [term, cat = 'term'] = l.split('\t'); return { term, cat }; })
  : null;

const PATTERNS = [
  ['iban', /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g],
  ['bic', /\b[A-Z]{4}SA[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g],
  ['phone', /(?:\+|00)966[\s-]?\d[\d\s-]{7,11}\d|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['secret', /\b(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,})\b/g]
];
const mask = (s) => s.length <= 4 ? '****' : s.slice(0, 2) + '…' + s.slice(-2) + ` (${s.length} chars)`;

const findings = [];
const add = (file, line, kind, value) => findings.push({ file, line, kind, value: mask(value) });

for (const file of files) {
  const ext = extname(file).toLowerCase();
  const buf = readFileSync(join(ROOT, file));
  if (IMAGES.has(ext)) {
    for (const kind of imageMetadata(buf)) add(file, 0, 'image-metadata', kind);
    continue;
  }
  if (FONTS.has(ext)) continue; // third-party font binaries (see assets/fonts/LICENSE-IBM-Plex.txt)
  if (OWNER_DOCS.has(file)) continue;
  if (!TEXT.has(ext)) { add(file, 0, 'unscanned-binary', file); continue; }
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    for (const [kind, re] of PATTERNS) {
      for (const m of ln.matchAll(re)) {
        const v = m[0];
        if (kind === 'email' && OWN.emails.includes(v.toLowerCase())) continue;
        if (kind === 'phone' && OWN.phones.includes(v.replace(/\D/g, '').replace(/^0/, '966'))) continue;
        if (kind === 'iban' && !/\d{6,}/.test(v.replace(/\s/g, ''))) continue; // words like "UTF8" are not IBANs
        add(file, i + 1, kind, v);
      }
    }
    if (deny) {
      const low = ln.toLowerCase();
      for (const { term, cat } of deny) {
        if (!low.includes(term.toLowerCase())) continue;
        if (cat === 'employer' && CV_FILES.has(file)) continue;
        add(file, i + 1, 'deny-list:' + cat, term);
      }
    }
  });
}

console.log(`scanned ${files.length} files${deny ? `, deny-list ${deny.length} terms` : ' (no .sensitive-terms deny-list found — pattern checks only)'}`);
console.log(`owner documents not text-scanned here: ${[...OWNER_DOCS].join(', ')}`);
for (const f of findings) console.log(`FOUND ${f.kind} in ${f.file}${f.line ? ':' + f.line : ''} → ${f.value}`);
console.log(findings.length ? `${findings.length} finding(s)` : 'no findings');
process.exit(findings.length ? 1 : 0);
