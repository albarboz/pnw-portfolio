import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';
import { site } from './src/content/site';

/**
 * Writes site.meta into the page head (title, description, Open Graph and X/Twitter link previews) and emits
 * robots.txt and sitemap.xml, so crawlers and link previews get them without running any JS.
 */
function siteMeta(): Plugin {
  const { url, title, description, image } = site.meta;
  const imageUrl = new URL(image.src, url).href;
  const meta = (key: 'name' | 'property', value: string, content: string | number): HtmlTagDescriptor => ({
    tag: 'meta',
    attrs: { [key]: value, content: String(content) },
    injectTo: 'head',
  });

  return {
    name: 'site-meta',
    transformIndexHtml: () => [
      { tag: 'title', children: title, injectTo: 'head' },
      meta('name', 'description', description),
      { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
      meta('property', 'og:type', 'website'),
      meta('property', 'og:url', url),
      meta('property', 'og:title', title),
      meta('property', 'og:description', description),
      meta('property', 'og:image', imageUrl),
      meta('property', 'og:image:width', image.width),
      meta('property', 'og:image:height', image.height),
      meta('property', 'og:image:alt', image.alt),
      meta('name', 'twitter:card', 'summary_large_image'),
      // The overlook's src is set by JS, so without this the photo would wait for the script before it starts loading.
      {
        tag: 'link',
        attrs: { rel: 'preload', as: 'image', href: site.descent.overlook.src.replace(/^\//, '') },
        injectTo: 'head',
      },
    ],
    generateBundle() {
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
          `  <url><loc>${url}</loc></url>\n` +
          '</urlset>\n',
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the built site works from any folder or subpath.
  base: './',
  plugins: [siteMeta()],
  build: {
    // three.js (~520 kB, ~130 kB gzipped) is its own chunk, loaded after first paint by src/effects/fog-layer.ts.
    chunkSizeWarningLimit: 600,
  },
});
