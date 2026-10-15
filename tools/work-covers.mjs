/**
 * Covers for the projects that are live sites: a screenshot of each, public/images/work/<file>.webp (2160×1440, the
 * 3:2 the work list shows), for every project in src/content/site.ts whose cover is under images/work/.
 *
 *     node tools/work-covers.mjs
 *
 * Each site opens at the size that shows it best (VIEW: a narrow app looks lost in a wide window), its visible
 * content is found (text, pictures, form fields), and a 3:2 frame is centred on it with some air around, so the
 * cover is the site rather than its margins. Photographed by the installed Chrome through Playwright at the density
 * that comes out at 2160 px wide, and written as WebP by Chrome's own encoder: no image library needed.
 * Re-run when a site changes. Credit rows: docs/ASSET-CREDITS.md.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

/** The window each site is shown in (CSS px, 3:2), by project slug. Others: 1440 × 960. */
const VIEW = { blog: [1080, 720], wagecheck: [900, 600] };
const OUT = [2160, 1440];
/** Air around the content, as a share of the window. */
const PAD = 0.06;

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { site } = await vite.ssrLoadModule('/src/content/site.ts');
const { projectSlug } = await vite.ssrLoadModule('/src/content/paths.ts');
await vite.close();

const browser = await chromium.launch({ channel: 'chrome' });
for (const p of site.work.projects) {
  const src = p.image?.src.replace(/^\.?\//, '');
  const url = p.links?.[0]?.href;
  if (!src?.startsWith('images/work/') || !url) continue;
  const [vw, vh] = VIEW[projectSlug(p)] ?? [1440, 960];

  // where the content is, in the first screen
  const look = await browser.newPage({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce' });
  await look.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await look.waitForTimeout(1500);
  const box = await look.evaluate(() => {
    let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.opacity === '0') continue;
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!ownText && !/^(img|svg|input|button|select|textarea|canvas|video)$/i.test(el.tagName)) continue;
      const q = el.getBoundingClientRect();
      if (!q.width || !q.height || q.bottom <= 0 || q.top >= innerHeight || q.right <= 0 || q.left >= innerWidth) continue;
      [l, t, r, b] = [Math.min(l, q.left), Math.min(t, q.top), Math.max(r, q.right), Math.max(b, q.bottom)];
    }
    return { l: Math.max(0, l), t: Math.max(0, t), r: Math.min(innerWidth, r), b: Math.min(innerHeight, b) };
  });
  await look.close();

  // the smallest 3:2 frame around it (and the air), centred on it, never past the window
  const [cx, cy] = [(box.l + box.r) / 2, (box.t + box.b) / 2];
  let w = Math.max(box.r - box.l + 2 * PAD * vw, (box.b - box.t + 2 * PAD * vh) * 1.5, 0.55 * vw);
  w = Math.min(vw, w);
  const h = w / 1.5;
  const x = Math.min(Math.max(0, cx - w / 2), vw - w);
  const y = Math.min(Math.max(0, cy - h / 2), vh - h);

  const shot = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: OUT[0] / w, reducedMotion: 'reduce' });
  await shot.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await shot.waitForTimeout(1500);
  const png = await shot.screenshot({ clip: { x, y, width: w, height: h } });
  // PNG → WebP, in the browser
  const webp = await shot.evaluate(
    async ([b64, ow, oh]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = Object.assign(document.createElement('canvas'), { width: ow, height: oh });
      c.getContext('2d').drawImage(img, 0, 0, ow, oh);
      return c.toDataURL('image/webp', 0.82).split(',')[1];
    },
    [png.toString('base64'), ...OUT],
  );
  await shot.close();
  writeFileSync(`${root}public/${src}`, Buffer.from(webp, 'base64'));
  console.log(`public/${src}: ${vw}×${vh} window, frame ${Math.round(w)}×${Math.round(h)} at ${Math.round(x)},${Math.round(y)}`);
}
await browser.close();
