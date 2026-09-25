// Renders the social-share image (1200×630) and the touch icon (180×180).
//   node tools/qa/capture-og.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const site = JSON.parse(readFileSync(new URL('../../data/site.json', import.meta.url)));
const name = site.person.name.en, descriptor = site.person.descriptor.en;
// Inline the self-hosted fonts as data URLs (a setContent page cannot load file:// fonts).
const css = readFileSync(new URL('../../assets/css/fonts.css', import.meta.url), 'utf8').replace(/url\('\.\.\/fonts\/([^']+)'\)/g,
  (_, f) => `url(data:font/woff2;base64,${readFileSync(new URL('../../assets/fonts/' + f, import.meta.url)).toString('base64')})`);
const font = `<style>${css}</style>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}) });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`${font}<body style="margin:0;background:#161616;color:#fff;font-family:'IBM Plex Sans',sans-serif">
<div style="position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;background-image:linear-gradient(#262626 1px,transparent 1px),linear-gradient(90deg,#262626 1px,transparent 1px);background-size:80px 80px">
<div style="display:inline-grid;place-items:center;width:64px;height:64px;border:2px solid #fff;font:600 22px 'IBM Plex Mono',monospace">AA</div>
<div><div style="font:400 24px 'IBM Plex Mono',monospace;letter-spacing:.04em;text-transform:uppercase;color:#c6c6c6;margin-bottom:24px">${descriptor}</div>
<div style="font-weight:300;font-size:88px;line-height:1.05;letter-spacing:-.01em">${name}</div></div></div></body>`, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'assets/img/og.png' });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`${font}<body style="margin:0;background:#161616;display:grid;place-items:center;height:180px"><div style="display:grid;place-items:center;width:132px;height:132px;border:4px solid #fff;color:#fff;font:600 52px 'IBM Plex Mono',monospace">AA</div></body>`, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'assets/img/apple-touch-icon.png' });
await browser.close();
