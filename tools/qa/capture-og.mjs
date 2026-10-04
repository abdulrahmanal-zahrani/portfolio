// Renders the social-share / LinkedIn preview image (1200×627) and the touch icon (180×180).
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
// Share image: 1200×627, LinkedIn's recommended link-preview size (also used by other sites).
const portrait = 'data:image/webp;base64,' + readFileSync(new URL('../../assets/img/portrait-800.webp', import.meta.url)).toString('base64');
const page = await browser.newPage({ viewport: { width: 1200, height: 627 } });
await page.setContent(`${font}<body style="margin:0;background:#161616;color:#fff;font-family:'IBM Plex Sans',sans-serif">
<div style="position:absolute;inset:0;display:grid;grid-template-columns:627px 1fr">
  <div style="background:url(${portrait}) center/cover no-repeat"></div>
  <div style="position:relative;padding:64px 64px 56px;display:flex;flex-direction:column;justify-content:space-between;
    background-image:linear-gradient(#262626 1px,transparent 1px),linear-gradient(90deg,#262626 1px,transparent 1px);background-size:64px 64px">
    <div style="display:inline-grid;place-items:center;width:56px;height:56px;border:2px solid #fff;font:400 20px 'IBM Plex Mono',monospace">AA</div>
    <div>
      <div style="font:400 18px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#c6c6c6;margin-bottom:20px">${descriptor}</div>
      <div style="font-weight:300;font-size:58px;line-height:1.05;letter-spacing:-.01em">${name.replace(' ', '<br>')}</div>
      <div style="font-weight:400;font-size:22px;line-height:1.4;color:#c6c6c6;margin-top:24px">Portfolio · finance tools and case studies</div>
    </div>
    <div style="font:400 16px 'IBM Plex Mono',monospace;color:#c6c6c6;border-top:1px solid #525252;padding-top:16px">abdulrahmanal-zahrani.github.io/portfolio</div>
  </div>
</div></body>`, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'assets/img/og.png' });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`${font}<body style="margin:0;background:#161616;display:grid;place-items:center;height:180px"><div style="display:grid;place-items:center;width:132px;height:132px;border:4px solid #fff;color:#fff;font:600 52px 'IBM Plex Mono',monospace">AA</div></body>`, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'assets/img/apple-touch-icon.png' });
await browser.close();
