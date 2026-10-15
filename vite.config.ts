import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { projectPath, projectSlug, projectTitleText } from './src/content/paths';
import { site } from './src/content/site';
import { humansTxt, noscriptHtml, securityTxt } from './src/content/site-files';

const built = new Date();
/** The commit being built, for the console note (src/ui/colophon.ts); 'dev' outside git. */
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
})();

/**
 * Writes site.meta into the page head (title, description, Open Graph and X/Twitter link previews) and emits
 * robots.txt and sitemap.xml, so crawlers and link previews get them without running any JS.
 * Each project also gets its own page at work/<slug>/ (src/content/paths.ts): a copy of the site with that project's
 * title and description in its head, so a shared case-study link previews as the project. The app opens the case
 * study from the address (src/ui/case-study.ts). A <base> points the copy's relative paths back at the site root.
 * A project's preview image is its own card from tools/share-cards.mjs (public/images/share/<slug>.jpg) when there
 * is one, else the site's.
 * Also from site.ts (src/content/site-files.ts): the page without JavaScript (<noscript>), humans.txt and
 * .well-known/security.txt.
 */
function siteMeta(): Plugin {
  checkContent();
  const { url, title, description, image } = site.meta;
  const card = (p: (typeof site.work.projects)[number]) => {
    const src = `images/share/${projectSlug(p)}.jpg`;
    if (!existsSync(fileURLToPath(new URL(`./public/${src}`, import.meta.url)))) return image;
    return { src, alt: `${p.title}: ${p.description}`, width: 1200, height: 630 };
  };
  const pages = [
    { path: '', title, description, image },
    ...site.work.projects.map((p) => ({
      path: projectPath(p),
      title: projectTitleText(p),
      description: p.description,
      image: card(p),
    })),
  ];
  const esc = (text: string | number) =>
    String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const meta = (key: 'name' | 'property', value: string, content: string | number) =>
    `<meta ${key}="${value}" content="${esc(content)}" />`;
  const START = '<!-- site-meta -->';
  const END = '<!-- /site-meta -->';
  const head = (page: (typeof pages)[number]) => {
    const pageUrl = new URL(page.path, url).href;
    const { image } = page;
    return [
      START,
      `<title>${esc(page.title)}</title>`,
      meta('name', 'description', page.description),
      `<link rel="canonical" href="${esc(pageUrl)}" />`,
      meta('property', 'og:type', 'website'),
      meta('property', 'og:url', pageUrl),
      meta('property', 'og:title', page.title),
      meta('property', 'og:description', page.description),
      meta('property', 'og:image', new URL(image.src, url).href),
      meta('property', 'og:image:width', image.width),
      meta('property', 'og:image:height', image.height),
      meta('property', 'og:image:alt', image.alt),
      meta('name', 'twitter:card', 'summary_large_image'),
      END,
    ].join('\n    ');
  };

  let outDir = '';

  return {
    name: 'site-meta',
    configResolved: (config) => void (outDir = config.command === 'build' ? config.build.outDir : ''),
    transformIndexHtml: (html) =>
      html
        .replace(
          /[ ]*<\/head>/,
          `    ${head(pages[0])}\n` +
            '    <link rel="author" href="humans.txt" />\n' +
            // The overlook's src is set by JS, so without this the photo would wait for the script before it starts loading.
            `    <link rel="preload" as="image" href="${site.descent.overlook.src.replace(/^\//, '')}" />\n  </head>`,
        )
        .replace(/<body>/, `<body>\n    ${noscriptHtml()}`),
    generateBundle: {
      order: 'post', // after Vite has written index.html into the bundle
      handler(_, bundle) {
        const index = bundle['index.html'];
        if (index?.type !== 'asset') return;
        const html = String(index.source);
        const block = html.slice(html.indexOf(START), html.indexOf(END) + END.length);
        for (const page of pages.slice(1)) {
          const up = '../'.repeat(page.path.split('/').filter(Boolean).length);
          this.emitFile({
            type: 'asset',
            fileName: `${page.path}index.html`,
            source: html
              .replace(block, head(page))
              .replace(/<meta charset="UTF-8" \/>/i, `$&\n    <base href="${up}" />`),
          });
        }
        this.emitFile({ type: 'asset', fileName: '.well-known/security.txt', source: securityTxt(built) });
        const deps = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies);
        this.emitFile({ type: 'asset', fileName: 'humans.txt', source: humansTxt(built, deps) });
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', url).href}\n`,
        });
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source:
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            pages.map((page) => `  <url><loc>${esc(new URL(page.path, url).href)}</loc></url>\n`).join('') +
            '</urlset>\n',
        });
      },
    },
    // The overlook's preload again as a header on every page (public/_headers is copied in first). Browsers start
    // the photo before the HTML has arrived, and on a custom domain with Early Hints switched on, Cloudflare sends
    // it in a 103 while the page is still being fetched. It does nothing on workers.dev.
    closeBundle() {
      if (!outDir) return;
      const link = `  Link: <${site.descent.overlook.src}>; rel=preload; as=image\n`;
      appendFileSync(`${outDir}/_headers`, `\n# The overlook, as early as possible (siteMeta() in vite.config.ts)\n/\n${link}/work/*\n${link}`);
    },
  };
}

/**
 * Mistakes in src/content/site.ts that would only show on the live site stop the dev server and the build, with
 * what to change:
 *   - two projects at one address (the same title and no `slug`): the second could never be opened by its link
 *   - a project whose title has no letters an address can use (雨の森): set its `slug`
 *   - an image or video path with no file in public/: it would show as a broken image
 */
function checkContent() {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const p of site.work.projects) {
    const slug = projectSlug(p);
    if (!slug) problems.push(`"${p.title}" makes no address: give it a slug, e.g. slug: 'rain-forest'.`);
    else if (seen.has(slug)) problems.push(`"${p.title}" has the same address as "${seen.get(slug)}" (work/${slug}/): give one of them its own slug.`);
    else seen.set(slug, p.title);
  }
  const files = (value: unknown, where: string): void => {
    if (typeof value === 'string') {
      if (!/^\/?(images|video|fonts)\//.test(value)) return;
      const file = fileURLToPath(new URL(`./public/${value.replace(/^\//, '')}`, import.meta.url));
      if (!existsSync(file)) problems.push(`${where}: no file at public/${value.replace(/^\//, '')}.`);
    } else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) files(v, `${where}.${key}`);
    }
  };
  files(site, 'site');
  if (problems.length) throw new Error(`src/content/site.ts:\n  ${problems.join('\n  ')}`);
}

/**
 * Serves @pmndrs/detect-gpu's benchmark data from this site at /benchmarks (src/core/quality.ts), instead of the
 * library's default CDN. Copied from the installed package at build time, so it always matches its version.
 * Each visitor fetches only the one file for their GPU family.
 */
function benchmarks(): Plugin {
  const dir = fileURLToPath(new URL('./node_modules/@pmndrs/detect-gpu/dist/benchmarks/', import.meta.url));
  const files = () => readdirSync(dir).filter((f) => f.endsWith('.json'));
  return {
    name: 'gpu-benchmarks',
    configureServer(server) {
      server.middlewares.use('/benchmarks', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        if (!files().includes(name)) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(dir + name));
      });
    },
    generateBundle() {
      for (const f of files()) this.emitFile({ type: 'asset', fileName: `benchmarks/${f}`, source: readFileSync(dir + f) });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the built site works from any folder or subpath.
  base: './',
  plugins: [siteMeta(), benchmarks()],
  define: { __BUILD__: JSON.stringify({ commit, date: built.toISOString().slice(0, 10) }) },
  build: {
    // three.js (~520 kB, ~130 kB gzipped) is its own chunk, loaded after first paint by src/effects/fog-layer.ts.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      onwarn(warning, warn) {
        // web-haptics marks itself "use client" for React servers; meaningless here
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.id?.includes('web-haptics')) return;
        warn(warning);
      },
    },
  },
});
