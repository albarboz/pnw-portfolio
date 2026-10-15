import { projectMeta, projectPath } from './paths';
import { site } from './site';

/**
 * Text the build writes from site.ts (siteMeta() in vite.config.ts), so none of it is typed twice:
 * the page without JavaScript, /.well-known/security.txt and /humans.txt.
 */

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const name = `${site.name.first} ${site.name.last}`;

/**
 * The whole site as one plain page, for browsers with JavaScript off and for anyone reading the source: the same
 * name, About, projects (each linking to its own page) and Contact, in the page's own fonts and colors.
 */
export function noscriptHtml(): string {
  const { about, work, contact } = site;
  const projects = work.projects
    .map(
      (p) =>
        `<li><a href="${esc(projectPath(p))}">${esc(p.title)}</a> <span class="meta">${esc(projectMeta(p))}</span>` +
        `<p>${esc(p.description)}</p></li>`,
    )
    .join('');
  const links = contact.links.map((l) => `<li><a href="${esc(l.href)}" rel="me">${esc(l.label)}</a></li>`).join('');
  return [
    '<noscript>',
    '<div class="nojs wrap">',
    `<h1>${esc(name)}</h1>`,
    `<p class="lead">${esc(site.tagline)}</p>`,
    `<h2>${esc(about.heading)}</h2>`,
    ...about.paragraphs.map((t) => `<p>${esc(t)}</p>`),
    `<h2>${esc(work.heading)}</h2>`,
    `<ul class="nojs-work">${projects}</ul>`,
    `<h2>${esc(contact.heading)}</h2>`,
    `<p><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></p>`,
    links && `<ul>${links}</ul>`,
    '</div>',
    // the immersive page's empty frame, which only JavaScript fills, stays out of the way
    '<style>main, .site-header, .case-study { display: none; }</style>',
    '</noscript>',
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** RFC 9116: where to report a security problem. Valid for a year from the build. */
export function securityTxt(built: Date): string {
  const expires = new Date(built.getTime() + 365 * 24 * 3600e3);
  return [
    `Contact: mailto:${site.contact.email}`,
    `Expires: ${expires.toISOString().replace(/\.\d+Z$/, 'Z')}`,
    'Preferred-Languages: en',
    `Canonical: ${new URL('.well-known/security.txt', site.meta.url).href}`,
    '',
  ].join('\n');
}

/** humanstxt.org: who made the site and with what. `components` are the site's npm dependencies. */
export function humansTxt(built: Date, components: string[]): string {
  return [
    '/* TEAM */',
    `  Design and development: ${name}`,
    `  Contact: ${site.contact.email}`,
    ...site.contact.links.map((l) => `  ${l.label}: ${l.href}`),
    '',
    '/* SITE */',
    `  Last update: ${built.toISOString().slice(0, 10).replace(/-/g, '/')}`,
    '  Language: English',
    '  Standards: HTML, CSS, TypeScript, WebGL, WebCodecs',
    `  Components: ${components.join(', ')}`,
    '  Fonts: Barlow, Barlow Condensed (SIL Open Font License)',
    '  Software: Vite',
    ...site.credits.map((c) => `  ${c}`),
    '',
  ].join('\n');
}
