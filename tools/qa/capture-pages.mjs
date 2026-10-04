// Full-page screenshots of every page at desktop (1440) and phone (390) widths.
//   node tools/qa/capture-pages.mjs <outDir>   (needs node tools/serve.mjs running)
import { chromium } from 'playwright';
const out = process.argv[2] || 'shots';
const BASE = 'http://localhost:8080/portfolio/';
const pages = { home: '', projects: 'projects/', 'case-trade-documents': 'projects/trade-documents-generator/', 'case-reporting': 'projects/receivables-reporting/',
  'demo-numbers': 'demo/numbers-to-words/', 'demo-reporting': 'demo/receivables-reporting/', 'demo-documents': 'demo/trade-documents/', 'demo-commission': 'demo/commission-calculator/',
  cv: 'cv.html', certificates: 'certificates.html', viewer: 'viewer.html?doc=fmva', '404': 'no-such-page' };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}) });
for (const [device, opts] of Object.entries({
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
})) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  for (const [name, path] of Object.entries(pages)) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    // The reporting demo is shown with its fictional sample loaded.
    if (name === 'demo-reporting') { await page.click('#btnSample'); await page.waitForSelector('#results:not(.hidden)'); await page.waitForTimeout(4600); }
    // Scroll through the page so lazy-loaded images load before the full-page capture.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
      await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    });
    const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.currentSrc || i.src));
    if (broken.length) console.log(`${device} ${name}: images not loaded: ${broken.join(', ')}`);
    await page.screenshot({ path: `${out}/${device}-${name}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
