/**
 * Link-preview cards, one per project: public/images/share/<slug>.jpg (1200×630), so a shared work/<slug>/ link
 * shows that project instead of the site's one card. siteMeta() in vite.config.ts uses a project's card when the
 * file is there, and the site's `meta.image` when it isn't.
 *
 *     node tools/share-cards.mjs
 *
 * Laid out in HTML with the site's own tokens (src/styles/tokens.css), Barlow files and blaze, and photographed by
 * the installed Chrome through Playwright, so no image library is needed. The copy is the project's own from
 * src/content/site.ts (year, kind, title, description, cover) and the owner's name. Re-run it when those change.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const file = (path) => pathToFileURL(root + path).href;
const out = `${root}public/images/share/`;

// site.ts through Vite, as the site sees it
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { site } = await vite.ssrLoadModule('/src/content/site.ts');
const { projectSlug } = await vite.ssrLoadModule('/src/content/paths.ts');
await vite.close();

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const face = (family, weight, name) =>
  `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url('${file(`public/fonts/${name}-latin.woff2`)}') format('woff2'); }`;

const card = (p) => {
  const img = p.image;
  const { x, y } = img?.focus ?? { x: 0.5, y: 0.5 };
  const focus = `${x * 100}% ${y * 100}%`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${file('src/styles/tokens.css')}">
<style>
${face('Barlow', 400, 'barlow-400')}
${face('Barlow', 500, 'barlow-500')}
${face('Barlow Condensed', 500, 'barlow-condensed-500')}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; background: var(--night); }
body { display: grid; grid-template-columns: ${img ? '600px 600px' : '1fr'}; color: var(--text); font-family: var(--body); }
.text { display: flex; flex-direction: column; padding: 64px 56px 56px 72px; }
.meta { font-size: 17px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
.blaze { width: 12px; height: 29px; margin: 40px 0 22px; background: var(--blaze);
  -webkit-mask: var(--blaze-shape) center / 100% 100% no-repeat; mask: var(--blaze-shape) center / 100% 100% no-repeat; }
h1 { font-family: var(--display); font-weight: 500; font-size: 66px; line-height: 1.02; letter-spacing: -0.005em; text-wrap: balance; }
p { margin-top: 22px; font-size: 24px; line-height: 1.4; color: var(--text-soft); text-wrap: pretty; }
.by { margin-top: auto; font-size: 17px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text); }
.photo { position: relative; overflow: hidden; }
.photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus};
  transform-origin: ${focus}; transform: scale(${Math.max(1, (img?.zoom ?? 1) * 0.6)}); }
</style></head><body>
<div class="text">
  <div class="meta">${esc(p.year)} · ${esc(p.kind)}</div>
  <div class="blaze"></div>
  <h1>${esc(p.title)}</h1>
  <p>${esc(p.description)}</p>
  <div class="by">${esc(site.name.first)} ${esc(site.name.last)}</div>
</div>
${img ? `<div class="photo"><img src="${file(`public/${img.src.replace(/^\//, '')}`)}" alt=""></div>` : ''}
</body></html>`;
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const p of site.work.projects) {
  const html = `${out}.card.html`; // a file, so the page may load the fonts and photos from disk
  writeFileSync(html, card(p));
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(() => document.fonts.ready);
  const name = `${projectSlug(p)}.jpg`;
  writeFileSync(out + name, await page.screenshot({ type: 'jpeg', quality: 86 }));
  console.log(`public/images/share/${name}`);
}
await browser.close();
(await import('node:fs')).rmSync(`${out}.card.html`);
