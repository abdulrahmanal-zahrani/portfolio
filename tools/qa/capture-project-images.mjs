// Captures the project card / case-study images (1280×800 PNG).
// Requires Playwright and the local preview server (node tools/serve.mjs).
//   node tools/qa/capture-project-images.mjs <outDir> [mihsabUrl]
import { chromium } from 'playwright';
const [out = 'shots', mihsab] = process.argv.slice(2);
const BASE = 'http://localhost:8080/portfolio/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const hideChrome = '.site-header,.notice,.page-head,main .section,.site-footer{display:none!important} main{padding-block-start:32px}';

async function demo(path, name) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: hideChrome });
  await page.screenshot({ path: `${out}/${name}.png` });
}
await demo('demo/trade-documents/', 'trade-documents');
await demo('demo/commission-calculator/', 'commission-calculator');

if (mihsab) {
  await page.goto(mihsab, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/mihsab.png` });
}
await browser.close();
