// Captures the project card / case-study images (1280×800 PNG).
// Requires Playwright and the local preview server (node tools/serve.mjs).
//   node tools/qa/capture-project-images.mjs <outDir>
import { chromium } from 'playwright';
const [out = 'shots'] = process.argv.slice(2);
const BASE = 'http://localhost:8080/portfolio/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const hideChrome = '.site-header,.notice,.page-head,main .section,.site-footer,.toasts{display:none!important} main{padding-block-start:32px}';

async function demo(path, name) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: hideChrome });
  await page.screenshot({ path: `${out}/${name}.png` });
}
await demo('demo/trade-documents/', 'trade-documents');
await demo('demo/commission-calculator/', 'commission-calculator');

// Numbers to words: an example amount in English and Arabic.
await page.goto(BASE + 'demo/numbers-to-words/', { waitUntil: 'networkidle' });
await page.addStyleTag({ content: hideChrome });
await page.fill('#amount', '1250000.75');
await page.selectOption('#currency', 'SAR');
await page.screenshot({ path: `${out}/numbers-to-words.png` });

// Receivables reporting: fictional sample data, scorecard and AR bridge.
await page.goto(BASE + 'demo/receivables-reporting/', { waitUntil: 'networkidle' });
await page.click('#btnSample');
await page.waitForSelector('#results:not(.hidden)');
await page.addStyleTag({ content: hideChrome + ' #secIngest,#results>section:nth-child(1),#results>section:nth-child(2){display:none!important}' });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/receivables-reporting.png` });
await browser.close();
