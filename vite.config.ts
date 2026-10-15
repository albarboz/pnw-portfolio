import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { projectPath, projectTitleText } from './src/content/paths';
import { site } from './src/content/site';

/**
 * Writes site.meta into the page head (title, description, Open Graph and X/Twitter link previews) and emits
 * robots.txt and sitemap.xml, so crawlers and link previews get them without running any JS.
 * Each project also gets its own page at work/<slug>/ (src/content/paths.ts): a copy of the site with that project's
 * title and description in its head, so a shared case-study link previews as the project. The app opens the case
 * study from the address (src/ui/case-study.ts). A <base> points the copy's relative paths back at the site root.
 */
function siteMeta(): Plugin {
  const { url, title, description, image } = site.meta;
  const imageUrl = new URL(image.src, url).href;
  const pages = [
    { path: '', title, description },
    ...site.work.projects.map((p) => ({ path: projectPath(p), title: projectTitleText(p), description: p.description })),
  ];
  const esc = (text: string | number) =>
    String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const meta = (key: 'name' | 'property', value: string, content: string | number) =>
    `<meta ${key}="${value}" content="${esc(content)}" />`;
  const START = '<!-- site-meta -->';
  const END = '<!-- /site-meta -->';
  const head = (page: (typeof pages)[number]) => {
    const pageUrl = new URL(page.path, url).href;
    return [
      START,
      `<title>${esc(page.title)}</title>`,
      meta('name', 'description', page.description),
      `<link rel="canonical" href="${esc(pageUrl)}" />`,
      meta('property', 'og:type', 'website'),
      meta('property', 'og:url', pageUrl),
      meta('property', 'og:title', page.title),
      meta('property', 'og:description', page.description),
      meta('property', 'og:image', imageUrl),
      meta('property', 'og:image:width', image.width),
      meta('property', 'og:image:height', image.height),
      meta('property', 'og:image:alt', image.alt),
      meta('name', 'twitter:card', 'summary_large_image'),
      END,
    ].join('\n    ');
  };

  return {
    name: 'site-meta',
    transformIndexHtml: (html) =>
      html.replace(
        /[ ]*<\/head>/,
        `    ${head(pages[0])}\n` +
          // The overlook's src is set by JS, so without this the photo would wait for the script before it starts loading.
          `    <link rel="preload" as="image" href="${site.descent.overlook.src.replace(/^\//, '')}" />\n  </head>`,
      ),
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
  };
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
