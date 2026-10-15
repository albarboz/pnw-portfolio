import { site, type Project } from '../content/site';

/**
 * Dev only: stress-test data for the work list and the case studies (the break-ui skill). `?data=` swaps
 * site.work.projects before anything reads it, so the real code renders it as it would the real copy:
 *   ?data=worst  long, short, missing, non-Latin and duplicate values, spread over the projects
 *   ?data=empty  no projects
 *   ?data=one    a single project (no "Next project")
 * A small switch at the bottom of the screen flips between them. The address keeps the choice through a reload,
 * and through a case study's own address too.
 */

const img = (src: string, alt: string, width: number, height: number) => ({ src, alt, width, height });
const trail = (alt: string) => img('images/trail.webp', alt, 2250, 1500);

const worst: Project[] = [
  {
    // every field long, every list full
    title: 'Washington Trails Association volunteer work-party scheduler and crew-leader dashboard',
    year: '2024–2026',
    kind: 'Web app, design system and accessibility audit',
    description:
      'Crew leaders plan work parties, check volunteers in at the trailhead with no signal, and file hours, tool counts and tread-work reports that sync once someone reaches the parking lot, replacing a shared spreadsheet, three Google Forms and a clipboard that lived in a truck.',
    details: [
      'Most trailheads in the Cascades have no signal, so every screen had to work offline first: check-in, the crew roster, the tool list and the end-of-day report are all written to IndexedDB and synced when a phone comes back into range, with conflicts resolved per field rather than per record.',
      'The sync design and its failure cases are written up in full at https://example.com/albarboz/wta-work-party-scheduler/blob/main/docs/offline-first-sync-and-conflict-resolution.md for anyone building the same thing; the research notes are at https://docs.google.com/document/d/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ4/edit',
      'Pasted from the release notes:\nCheck-in now works with gloves on.\nTool counts carry over between days.',
      'We tested with twelve crew leaders over a season of work parties, from the Snoqualmie Pass trails to the Olympic coast, and cut check-in from about four minutes per volunteer to under thirty seconds.',
    ],
    role: 'Product design, front end and offline sync, with a team of three volunteers',
    tools: [
      'TypeScript',
      'SvelteKit',
      'IndexedDB',
      'Cloudflare Workers + Durable Objects',
      '@tanstack/query',
      'Mapbox GL JS',
      'Figma',
      'Playwright',
      'axe-core',
      'Workbox',
      'PostgreSQL',
      'Twilio',
    ],
    links: [
      { label: 'Live site', href: 'https://example.com' },
      { label: 'Source on GitHub', href: 'https://example.com' },
      { label: 'Read the write-up on the Cloudflare blog', href: 'https://example.com' },
      { label: 'Figma file', href: 'https://example.com' },
      { label: 'Accessibility conformance report (VPAT)', href: 'https://example.com' },
    ],
    // a portrait screenshot in a landscape frame, no focus given
    image: img('images/valley.webp', 'The crew-leader dashboard on a phone: the day’s roster, tool counts and a map of the work site.', 1792, 2688),
    example: true,
  },
  {
    // Lushootseed name, a cover that 404s (typo in the path), nothing optional filled in
    title: 'dxʷləšucid flashcards',
    year: '2023',
    kind: 'PWA',
    description: 'Lushootseed vocabulary cards with recorded speakers.',
    image: { ...trail('Flashcard showing a Lushootseed word, its English meaning and a play button for the recording.'), src: 'images/projects/dxwlesucid-cards.webp' },
  },
  {
    // one short word, no cover, a link labelled with its own address
    title: 'Moss',
    year: 'Ongoing',
    kind: 'CLI',
    description: 'A tiny CLI.',
    links: [{ label: 'github.com/albarboz/moss-static-site-generator', href: 'https://example.com' }],
  },
  {
    // apostrophe, accent and ampersand in the title; empty arrays and an empty string instead of missing fields
    title: 'Café Vita’s espresso & pastry kiosk',
    year: '2022',
    kind: 'Kiosk UI',
    description: 'A self-serve ordering kiosk for a Seattle coffee roaster’s Capitol Hill café.',
    details: [],
    role: '',
    tools: [],
    links: [],
    image: { ...trail('The kiosk’s menu screen.'), focus: { x: 1, y: 1 }, zoom: 1 },
  },
  {
    // two projects with the same title and no slug
    title: 'Trail run tracker',
    year: '2025',
    kind: 'Mobile UI',
    description: 'Pace, elevation and segment splits for forest trails.',
    image: trail('A runner on a dirt trail through old-growth forest.'),
  },
  {
    title: 'Trail run tracker',
    year: '2026',
    kind: 'watchOS app',
    description: 'The same tracker, rebuilt for the wrist.',
  },
  {
    // a title with no Latin letters at all, for a client in Japan
    title: '雨の森',
    year: '2024',
    kind: 'Brand site',
    description: 'A bilingual site for a rain-forest lodge on Yakushima.',
    image: trail('Moss-covered cedar trunks in rain.'),
  },
];

const sets: Record<string, Project[]> = {
  worst,
  empty: [],
  one: [worst[0]],
};

export function useDataset() {
  const params = new URLSearchParams(location.search);
  const name = params.get('data') ?? 'demo';
  if (sets[name]) site.work.projects.splice(0, Infinity, ...sets[name]);
  mountSwitch(name);
}

/** Plain chrome, not part of the design under test: system font, gray track, white pill on the active state. */
function mountSwitch(active: string) {
  const bar = document.createElement('nav');
  bar.setAttribute('aria-label', 'Test data');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:2px;' +
    'padding:3px;border-radius:999px;background:#d4d4d4;font:12px/1 system-ui,sans-serif;white-space:nowrap;';
  for (const [name, label] of [
    ['demo', 'Demo'],
    ['worst', 'Worst case'],
    ['empty', 'Empty'],
    ['one', 'One'],
  ]) {
    const a = document.createElement('a');
    const url = new URL(location.href);
    url.pathname = import.meta.env.BASE_URL; // back to the trail: a case study's address may not exist in the other set
    if (name === 'demo') url.searchParams.delete('data');
    else url.searchParams.set('data', name);
    a.href = url.href;
    a.textContent = label;
    a.style.cssText = `padding:6px 10px;border-radius:999px;color:#171717;text-decoration:none;${name === active ? 'background:#fff;' : ''}`;
    if (name === active) a.setAttribute('aria-current', 'true');
    bar.append(a);
  }
  // above an open case study too: a modal <dialog> sits in the top layer, so the switch moves into it while one is open
  const place = () => (document.querySelector('dialog[open]') ?? document.body).append(bar);
  place();
  new MutationObserver(place).observe(document.body, { subtree: true, attributeFilter: ['open'] });
}
