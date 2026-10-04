// End-to-end checks in Chromium against the local preview server.
// Requires: playwright and axe-core (npm i playwright axe-core in a scratch
// folder, linked as node_modules), and `node tools/serve.mjs` on :8080.
//   node tools/qa/browser-check.mjs [pdfOutDir]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = 'http://localhost:8080/portfolio/';
const OUT = process.argv[2];
const PAGES = ['', 'projects/', 'projects/receivables-reporting/', 'projects/trade-documents-generator/', 'projects/numbers-to-words/',
  'projects/lc-lg-commission-calculator/', 'demo/receivables-reporting/', 'demo/trade-documents/', 'demo/numbers-to-words/',
  'demo/commission-calculator/', 'cv.html', 'certificates.html', 'references.html', 'viewer.html?doc=fmva'];

let pass = 0, fail = 0;
const results = [];
function check(group, name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${!ok && detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let dialogs = 0;
page.on('dialog', async (d) => { dialogs++; await d.dismiss(); });

// ---------- Pages: status, metadata, structure, axe ----------
for (const p of PAGES) {
  errors.length = 0;
  const res = await page.goto(BASE + p, { waitUntil: 'networkidle' });
  const name = '/portfolio/' + p;
  check('pages', `${name} returns 200`, res.status() === 200, String(res.status()));
  const meta = await page.evaluate(() => ({
    lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
    desc: document.querySelector('meta[name=description]')?.content || '', h1: document.querySelectorAll('h1').length,
    og: !!document.querySelector('meta[property="og:image"]'), fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
  }));
  check('pages', `${name} has lang, dir, title, description, og:image, one h1`,
    meta.lang === 'en' && meta.dir === 'ltr' && meta.title && meta.desc && meta.og && meta.h1 === 1, JSON.stringify(meta));
  check('pages', `${name} loads the self-hosted fonts`, meta.fonts.includes('IBM Plex Sans'), meta.fonts.join());
  check('pages', `${name} has no console errors`, errors.length === 0, errors.join(' | '));
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] });
    return r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`);
  });
  check('a11y', `${name} axe-core WCAG 2.1 AA + best practice`, axe.length === 0, axe.join(', '));
}

// ---------- Paths, case and legacy links under /portfolio/ ----------
// Each case records how the browser gets to the canonical URL:
//   200      served directly by the host
//   301      host-side redirect (GitHub Pages does this for directories)
//   404+JS   the host answers 404 with 404.html, whose script redirects
const redirects = [
  ['cv', 'cv', '200'], ['projects', 'projects/', '301'], ['projects/trade-documents-generator', 'projects/trade-documents-generator/', '301'],
  ['CV.html', 'cv.html', '404+JS'], ['Index.html', '', '404+JS'], ['Projects/Trade-Documents-Generator/', 'projects/trade-documents-generator/', '404+JS'],
  ['Certificates.HTML', 'certificates.html', '404+JS'], ['Resources/Referances.pdf', 'Resources/References.pdf', '404+JS'],
  ['Resources/References/Recommendation1.pdf', 'references.html', '404+JS'],
  ['Resources/Recommendations/Recommendation5.pdf', 'references.html', '404+JS'],
  ['Certificates/FMVA.pdf', 'Resources/Certificates/FMVA.pdf', '404+JS'], ['Resources/FMVA.pdf', 'Resources/Certificates/FMVA.pdf', '404+JS'],
  ['Resources/cv.html', 'cv.html', '404+JS']
];
const pathTable = [];
for (const [from, to, expected] of redirects) {
  const raw = await page.request.get(BASE + from, { maxRedirects: 0 });
  const status = raw.status();
  const mechanism = status === 200 ? '200' : status === 301 ? '301' : status === 404 ? '404+JS' : String(status);
  await page.goto(BASE + from, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(300);
  const ok = page.url() === BASE + to && mechanism === expected;
  pathTable.push(`${from.padEnd(46)} ${mechanism.padEnd(7)} → /portfolio/${to}`);
  check('paths', `/portfolio/${from} → /portfolio/${to} via ${expected}`, ok, `${mechanism} → ${page.url()}`);
}
// Every canonical page must be served directly with 200 (no redirect of any kind).
for (const p of PAGES.map((x) => x.split('?')[0])) {
  const raw = await page.request.get(BASE + p, { maxRedirects: 0 });
  check('paths', `/portfolio/${p} served directly (200, no redirect)`, raw.status() === 200, String(raw.status()));
}
const nf = await page.goto(BASE + 'does-not-exist', { waitUntil: 'load' });
check('paths', 'unknown path shows the 404 page', nf.status() === 404 && (await page.textContent('h1')) === 'Page not found');
for (const f of ['Resources/References.pdf', 'Resources/Certificates/FMVA.pdf', 'Resources/1778667655102.png']) {
  const r = await page.request.get(BASE + f);
  check('paths', `legacy file still served: ${f}`, r.status() === 200, String(r.status()));
}

// ---------- Viewer allowlist ----------
async function viewer(q) {
  dialogs = 0;
  await page.goto(BASE + 'viewer.html' + q, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return page.evaluate(() => ({
    found: !document.getElementById('viewer-found').hidden, missing: !document.getElementById('viewer-missing').hidden,
    src: document.getElementById('viewer-frame').getAttribute('src'), title: document.getElementById('viewer-title').textContent,
    download: document.getElementById('viewer-download').getAttribute('download')
  }));
}
let v = await viewer('?doc=fmva');
check('viewer', '?doc=fmva shows the certificate', v.found && v.src === 'Resources/Certificates/FMVA.pdf' && v.title === 'FMVA® certificate');
check('viewer', 'download link names the file', v.download === 'FMVA.pdf');
v = await viewer('?doc=references');
check('viewer', '?doc=references shows the letters', v.found && v.src === 'Resources/References.pdf');
v = await viewer('?file=Resources/References.pdf&name=References');
check('viewer', 'legacy ?file= link from the old home page still works', v.found && v.src === 'Resources/References.pdf');
v = await viewer('?file=Resources/Certificates/FMVA.pdf&name=<img src=x onerror=alert(1)>');
check('viewer', 'legacy link ignores the name parameter', v.found && v.title === 'FMVA® certificate' && dialogs === 0);
for (const bad of ['?file=javascript:alert(document.domain)', '?file=https://example.com/x.pdf', '?file=//example.com/x.pdf',
  '?file=Resources/../index.html', '?doc=__proto__', '?doc=constructor', '?doc=FMVA', '?file=resources/references.pdf', '']) {
  v = await viewer(bad);
  check('viewer', `refuses ${bad || '(no parameter)'}`, !v.found && v.missing && !v.src && dialogs === 0, JSON.stringify(v));
}
for (const f of ['Resources/Certificates/FMVA.pdf', 'Resources/References.pdf']) {
  const r = await page.request.get(BASE + f);
  check('download', `${f} downloads as application/pdf`, r.status() === 200 && r.headers()['content-type'] === 'application/pdf');
}

// ---------- Keyboard ----------
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.keyboard.press('Tab');
check('keyboard', 'first Tab reaches the skip link', await page.evaluate(() => document.activeElement.classList.contains('skip-link')));
await page.keyboard.press('Enter');
check('keyboard', 'skip link moves focus to main', await page.evaluate(() => document.activeElement.id === 'main'));
for (const p of PAGES) {
  await page.goto(BASE + p, { waitUntil: 'networkidle' });
  const bad = [];
  let last = null;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    // The viewer marks the PDF frame asynchronously (see assets/js/viewer.js).
    if (await page.evaluate(() => document.activeElement?.tagName === 'IFRAME')) await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      let ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1;
      // Radios in the content switcher draw their focus ring on the adjacent span.
      if (!ring && el.matches('.switcher input')) { const s = getComputedStyle(el.nextElementSibling); ring = s.outlineStyle !== 'none'; }
      // Card links draw the ring on the card.
      if (!ring && el.closest('.card')) ring = getComputedStyle(el.closest('.card')).outlineStyle !== 'none';
      return { ring, desc: el.tagName + (el.id ? '#' + el.id : '') + ' ' + (el.textContent || el.value || '').trim().slice(0, 30), visible: el.getClientRects().length > 0 };
    });
    if (!info) break;
    // Focus that stays on the same element (e.g. inside the browser's PDF viewer) ends the walk.
    if (info.desc === last) break;
    last = info.desc;
    if (!info.ring || !info.visible) bad.push(info.desc);
  }
  check('keyboard', `/portfolio/${p}: every focused element shows a visible focus ring`, bad.length === 0, bad.join(' | '));
}

// ---------- Commission demo ----------
await page.goto(BASE + 'demo/commission-calculator/', { waitUntil: 'networkidle' });
const total = () => page.textContent('#total');
check('calc', 'default L/C example shows SAR 5,067.19', (await total()) === 'SAR 5,067.19', await total());
await page.fill('#charged', '5067.19');
check('calc', 'bank amount within SAR 0.01 reported as a match', (await page.textContent('#variance')).startsWith('The amount charged matches'));
await page.fill('#charged', '5100');
check('calc', 'difference reported with amount', (await page.textContent('#variance')).includes('SAR 32.81'), await page.textContent('#variance'));
await page.focus('input[name=product][value=lc]');
await page.keyboard.press('ArrowRight');
check('calc', 'arrow key switches to letter of guarantee', (await total()) === 'SAR 5,750.00' && await page.isVisible('#lg-amount'), await total());
await page.selectOption('#lg-unit', 'months'); await page.fill('#lg-period', '6.5'); await page.fill('#lg-amount', '12000000');
check('calc', 'guarantee 12,000,000 for 6.5 months → 7 months incl. VAT', (await total()) === 'SAR 18,447.92', await total());
await page.click('#reset');
await page.waitForTimeout(50);
check('calc', 'reset restores the example', (await total()) === 'SAR 5,067.19' && await page.isVisible('#lc-amount'), await total());
await page.selectOption('#lc-type', 'extension');
check('calc', 'extension shows only relevant fields', await page.isVisible('#lc-ext') && !(await page.isVisible('#lc-months')) && !(await page.isVisible('#lc-min')));
check('calc', 'extension default (1,250,000 × 2 months) incl. VAT', (await total()) === 'SAR 1,796.88', await total());

// ---------- Documents demo ----------
dialogs = 0;
await page.goto(BASE + 'demo/trade-documents/', { waitUntil: 'networkidle' });
check('docs', 'amount in words generated from invoice total',
  (await page.inputValue('#f-words')) === 'Sixty Thousand, Nine Hundred Eighty and 50/100 US Dollars');
await page.fill('#f-customer', '<img src=x onerror=alert(1)>');
check('docs', 'typed markup is shown as text, not executed',
  dialogs === 0 && (await page.textContent('#preview')).includes('<img src=x onerror=alert(1)>') && !(await page.$('#preview img')));
await page.focus('#add-invoice'); await page.keyboard.press('Enter');
check('docs', 'Add invoice by keyboard focuses the new row', await page.evaluate(() => document.activeElement.id === 'inv-no-2'));
await page.keyboard.type('INV-DEMO-1003'); await page.fill('#inv-amt-2', '1000');
check('docs', 'new invoice updates total and words', (await page.inputValue('#f-words')).startsWith('Sixty-One Thousand, Nine Hundred Eighty and 50/100'));
await page.click('#doc-rows .icon-btn >> nth=0');
check('docs', 'removing a document row keeps focus in the list', await page.evaluate(() => !!document.activeElement.closest('#doc-rows') || document.activeElement.id === 'add-doc'));
await page.check('input[name=view][value=boe2]', { force: true });
check('docs', 'second bill of exchange preview', (await page.textContent('#preview')).includes('Second of exchange — first unpaid'));
await page.click('#f-words-auto');
await page.fill('#f-words', 'Manual wording');
check('docs', 'manual amount-in-words override', (await page.textContent('#preview')).includes('Manual wording'));
await page.click('#reset-all');
check('docs', 'reset restores the example', (await page.inputValue('#f-customer')) === 'Sample Trading LLC');

// ---------- Numbers to words ----------
await page.goto(BASE + 'demo/numbers-to-words/', { waitUntil: 'networkidle' });
check('n2w', 'page does not steal focus on load', await page.evaluate(() => document.activeElement === document.body));
await page.selectOption('#currency', 'SAR');
await page.fill('#amount', '1250000.75');
check('n2w', 'English wording', (await page.textContent('#outEnglish')) === 'One Million Two Hundred Fifty Thousand Saudi Riyals and 75/100 Only', await page.textContent('#outEnglish'));
check('n2w', 'Arabic wording', (await page.textContent('#outArabic')) === 'مليون ومئتان وخمسون ألف ريال سعودي و75/100 فقط لا غير', await page.textContent('#outArabic'));
await page.fill('#amount', '12.345');
check('n2w', 'extra decimals rejected with a message, nothing rounded',
  (await page.isVisible('#error')) && (await page.textContent('#outEnglish')) === '');
await page.click('#langAr');
check('n2w', 'Arabic switch flips only the tool, not the page',
  await page.evaluate(() => document.getElementById('ntw').dir === 'rtl' && document.documentElement.dir === 'ltr' && document.documentElement.lang === 'en'));
check('n2w', 'Arabic interface text uses IBM Plex Sans Arabic', await page.evaluate(async () => {
  await document.fonts.ready; return [...document.fonts].some((f) => f.family.includes('Arabic') && f.status === 'loaded'); }));
await page.click('#langEn');
check('n2w', 'built-in suite passes in the page', await page.evaluate(() => { const r = window.__ntwSelfTest(); return r.failed === 0 && r.passed === 154; }));

// ---------- Receivables reporting ----------
await page.goto(BASE + 'demo/receivables-reporting/', { waitUntil: 'networkidle' });
await page.click('#btnSample');
await page.waitForSelector('#results:not(.hidden)', { timeout: 15000 });
check('reporting', 'sample data loads: 4 KPI cards, 32 customers, 4 cluster charts',
  (await page.locator('#kpiCards .kpi').count()) === 4 && (await page.locator('#dataTable tbody tr').count()) === 32 &&
  (await page.locator('#clusterCharts .chart-card').count()) === 4);
check('reporting', 'AR bridge reconciles on the sample', (await page.textContent('#valList')).includes('AR bridge reconciles across all 32 customers'));
check('reporting', 'no logo or company image anywhere on the page', (await page.locator('#rpt img').count()) === 0);
for (const [btn, re] of [['#btnXlsx', /^Master Sheet - Jul - 2026\.xlsx$/], ['#btnPptx', /^Receivables Report - Jul - 2026\.pptx$/],
  ['#btnEmail', /^Receivables Report - Jul - 2026\.eml$/]]) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(btn)]);
  check('reporting', `${btn} produces ${d.suggestedFilename()}`, re.test(d.suggestedFilename()));
  if (OUT) await d.saveAs(`${OUT}/${d.suggestedFilename()}`);
  await page.waitForTimeout(400);
}
await page.click('#btnPreview');
check('reporting', 'deck preview opens with 12 slides', (await page.textContent('#pvCount')) === '1 / 12');
await page.keyboard.press('Escape');
check('reporting', 'Escape closes the preview', !(await page.isVisible('#pvBack')));

// ---------- Printing ----------
if (OUT) {
  await page.goto(BASE + 'demo/trade-documents/', { waitUntil: 'networkidle' });
  // Simulate "Print all three": keep the all-documents render in place.
  await page.evaluate(() => {
    const orig = window.print; let captured = null;
    window.print = () => { captured = document.getElementById('preview').innerHTML; };
    document.getElementById('print-all').click();
    document.getElementById('preview').innerHTML = captured; window.print = orig;
  });
  await page.pdf({ path: `${OUT}/print-documents-all.pdf`, format: 'A4', printBackground: true });
  await page.goto(BASE + 'demo/commission-calculator/', { waitUntil: 'networkidle' });
  await page.pdf({ path: `${OUT}/print-commission.pdf`, format: 'A4', printBackground: true });
  await page.goto(BASE + 'cv.html', { waitUntil: 'networkidle' });
  await page.pdf({ path: `${OUT}/print-cv.pdf`, format: 'A4', printBackground: true });
  check('print', 'print PDFs rendered (text checked separately)', true);
}

// ---------- Phone: layout, menu ----------
const phone = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const m = await phone.newPage();
for (const p of PAGES) {
  await m.goto(BASE + p, { waitUntil: 'networkidle' });
  const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('responsive', `/portfolio/${p} has no horizontal scroll at 320px`, ov <= 0, `${ov}px overflow`);
}
await m.goto(BASE, { waitUntil: 'networkidle' });
check('responsive', 'menu collapsed on phones', !(await m.isVisible('#site-nav')) && await m.isVisible('.menu-toggle'));
await m.focus('.menu-toggle'); await m.keyboard.press('Enter');
check('keyboard', 'menu opens from the keyboard', (await m.getAttribute('.menu-toggle', 'aria-expanded')) === 'true' && await m.isVisible('#site-nav a >> nth=0'));
await m.keyboard.press('Escape');
check('keyboard', 'Escape closes the menu and returns focus', (await m.getAttribute('.menu-toggle', 'aria-expanded')) === 'false' &&
  await m.evaluate(() => document.activeElement.classList.contains('menu-toggle')));

// ---------- Reduced motion ----------
const rm = await browser.newContext({ reducedMotion: 'reduce' });
const r = await rm.newPage();
await r.goto(BASE + 'projects/', { waitUntil: 'networkidle' });
const dur = await r.evaluate(() => getComputedStyle(document.querySelector('.card')).transitionDuration);
check('motion', 'prefers-reduced-motion removes transitions', parseFloat(dur) < 0.001, dur);

// ---------- RTL readiness (structure only; no Arabic content yet) ----------
const rtlPages = ['', 'projects/', 'demo/commission-calculator/', 'cv.html'];
for (const p of rtlPages) {
  for (const w of [1440, 390]) {
    await m.setViewportSize({ width: w, height: 800 });
    await m.goto(BASE + p, { waitUntil: 'networkidle' });
    await m.evaluate(() => { document.documentElement.dir = 'rtl'; });
    const res = await m.evaluate(() => {
      const ov = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const brand = document.querySelector('.brand').getBoundingClientRect();
      return { ov, brandRight: brand.right > window.innerWidth / 2 };
    });
    check('rtl', `/portfolio/${p} at ${w}px with dir=rtl: mirrored header, no overflow`, res.ov <= 0 && res.brandRight, JSON.stringify(res));
    if (OUT && (p === '' || p === 'projects/trade-documents-generator/')) await m.screenshot({ path: `${OUT}/rtl-${w}-${p.replace(/\W+/g, '-') || 'home'}.png`, fullPage: false });
  }
}

await browser.close();
console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (OUT) writeFileSync(`${OUT}/browser-check.txt`, results.join('\n') + `\n\n${pass} passed, ${fail} failed\n\nPath mechanisms (initial HTTP status → final URL):\n${pathTable.join('\n')}\n`);
process.exit(fail ? 1 : 0);
