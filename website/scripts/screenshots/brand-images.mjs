// Generates public/og-default.png (1200×630, link previews) and public/logo.png (512×512) from HTML,
// with the site's own colours and font. Run again only if the brand changes.
import { chromium } from 'playwright';
import { join, resolve } from 'node:path';

const PUBLIC = resolve(import.meta.dirname, '../../public');
const mark = `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect width="32" height="32" rx="7" fill="#1c1917"/><path d="M8 11h16v3H8zm1 5h14v8H9z" fill="#f59e0b"/><path d="M13 19h6" stroke="#1c1917" stroke-width="2" stroke-linecap="round"/></svg>`;
const og = `<html><body style="margin:0;width:1200px;height:630px;background:#1c1917;color:#fff;font-family:'Noto Sans',system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box">
<div style="display:flex;align-items:center;gap:22px"><div style="width:84px;height:84px">${mark}</div><div style="font-size:34px;font-weight:600">Inventaire rapide des archives</div></div>
<div style="margin-top:46px;font-size:60px;font-weight:700;line-height:1.15">Vos archives papier inventoriées en arabe et en français,<br><span style="color:#f59e0b">sans que vos données quittent vos locaux</span></div>
<div style="margin-top:40px;font-size:28px;color:#d6d3d1">Téléphones Android · câble USB · OCR · recherche · inventaire Excel</div></body></html>`;
const logo = `<html><body style="margin:0;width:512px;height:512px">${mark}</body></html>`;

const browser = await chromium.launch();
for (const [html, w, h, file] of [[og, 1200, 630, 'og-default.png'], [logo, 512, 512, 'logo.png']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html);
    await page.screenshot({ path: join(PUBLIC, file) });
    console.log(file);
}
await browser.close();
