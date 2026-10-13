// All editable content for the site. Scenes and UI read from here; nothing else should hard-code copy.

export interface Project {
  title: string;
  year: string;
  kind: string;
  /** One or two lines for the list. */
  description: string;
  /** Longer write-up for the detail view, one string per paragraph. Falls back to `description`. */
  details?: string[];
  role?: string;
  tools?: string[];
  /** Live site, repo, case study … shown as buttons in the detail view. */
  links?: { label: string; href: string }[];
  /** Optional cover image for the detail view. Credit it in docs/ASSET-CREDITS.md. */
  image?: PhotoAsset;
  /** Marks placeholder content. Remove once the project is real. */
  example?: boolean;
}

export interface PhotoAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Optional depth map (tools/depth-map.py) for the 2.5D camera move. Credit it with the photo. */
  depth?: string;
  /** Optional far / mid / near cutouts (tools/hero-layers.py) for layered parallax. Credit them with the photo. */
  layers?: { far: string; mid: string; near: string };
}

/** Path to a file in public/, relative to the site root (works in dev, build and sub-folder hosting). */
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const site = {
  name: { first: 'Alan', last: 'Barboza' },
  tagline: 'Design and development from the wet side of the mountains.',
  scrollCue: 'Scroll to descend',

  descent: {
    /** Opening photo: the view the visitor starts in. */
    overlook: {
      src: asset('images/valley.webp'),
      layers: {
        far: asset('images/valley-far.webp'),
        mid: asset('images/valley-mid.webp'),
        near: asset('images/valley-near.webp'),
      },
      alt: 'Fir trees frame a deep mountain valley, with a river of fog winding below jagged blue peaks.',
      width: 1792,
      height: 2688,
    } satisfies PhotoAsset,
    /** Where the camera dives, as a fraction of the opening photo (0–1). Currently: the fog pool in the valley. */
    diveTarget: { x: 0.51, y: 0.49 },
    /** Center of the opening frame, as a fraction of the photo. Used when the photo is cropped. */
    startFocus: { x: 0.5, y: 0.34 },
    /** How far the camera zooms into the dive target (1 = no zoom). The 1792 px overlook gets soft above ~3. */
    diveZoom: 3,

    /** Landing photo: what the fog clears to. */
    landing: {
      src: asset('images/trail.webp'),
      depth: asset('images/trail-depth.webp'),
      alt: 'A runner in a light jacket jogs down a dirt trail through mossy old-growth trees and ferns.',
      width: 2250,
      height: 1500,
    } satisfies PhotoAsset,
    /** Point the landing photo pushes in toward, in CSS percentages. Currently: the runner. */
    landingFocus: { x: 48, y: 58 },

    fogCaption: { text: 'Below the fog, the trail is already wet.' },
    landingCaption: { text: 'Keep pace. The work is just ahead.' },
  },

  about: {
    label: 'About',
    heading: 'I make things that feel like weather.',
    paragraphs: [
      'Interfaces with atmosphere: quiet, layered, and paced like a run through old growth on a grey morning.',
      'I care about craft, calm motion, and pages that reward the second look. Replace this with your own story.',
    ],
  },

  work: {
    heading: 'Selected work',
    label: 'Old growth',
    /** Interface labels in the project detail view. */
    detail: { close: 'Close', role: 'Role', tools: 'Tools', example: 'Example' },
    projects: [
      {
        title: 'Hoh Rain Forest field guide',
        year: '2026',
        kind: 'Web app',
        description:
          'An offline-first trail companion that identifies mosses and ferns from a photo and logs sightings to a shared map.',
        details: [
          'Placeholder write-up. Describe the problem, what you built, and what changed because of it.',
          'A second paragraph for process, constraints or results. Delete any field you do not need.',
        ],
        role: 'Design and front end',
        tools: ['TypeScript', 'IndexedDB', 'Mapbox'],
        links: [{ label: 'Live site', href: 'https://example.com' }],
        example: true,
      },
      {
        title: 'Ridgeline weather dashboard',
        year: '2025',
        kind: 'Data viz',
        description:
          'Live snow level, freezing line and pass conditions for the Cascades, drawn as a single elevation profile.',
        example: true,
      },
      {
        title: 'Trail run tracker',
        year: '2025',
        kind: 'Mobile UI',
        description:
          'Pace, elevation and segment splits for forest trails, designed to read at a glance mid-stride and in the rain.',
        example: true,
      },
    ] as Project[],
  },

  contact: {
    heading: 'Contact',
    label: 'Trailhead · 600 ft',
    leadBefore: 'Have a project in the',
    leadEmphasis: 'clouds?',
    leadAfter: 'Let’s talk.',
    email: 'hello@yourdomain.com',
  },

  /** Small interface labels. */
  ui: {
    copyEmail: { label: 'Copy email', copied: 'Copied', selected: 'Selected — press Ctrl/⌘ C' },
  },

  /** Altimeter readings in feet. The descent scene interpolates between these. */
  altitude: {
    top: 6200,
    landing: 1400,
    bottom: 600,
    labels: {
      above: 'Overlook',
      fog: 'Cloud line',
      landing: 'Trail',
      below: 'Old growth',
      bottom: 'Trailhead',
    },
  },

  credits: [
    'Images generated with Midjourney.',
  ],
};

export type Site = typeof site;
