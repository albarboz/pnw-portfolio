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
  /** Optional cover image: the list's thumbnail and the detail view's picture. Credit it in docs/ASSET-CREDITS.md. */
  image?: ProjectImage;
  /** Marks placeholder content. Remove once the project is real. */
  example?: boolean;
}

/**
 * A project's cover. The list shows it as a 3:2 thumbnail (16:9 on phones), enlarged `zoom` times (default 1:
 * the whole width) around `focus`, the spot that stays put (fractions of the image; default the middle).
 * So focus x 0 keeps the left edge, 0.5 the middle, 1 the right edge. The detail view centers the crop there too.
 */
export interface ProjectImage extends PhotoAsset {
  focus?: { x: number; y: number };
  zoom?: number;
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
  /** Optional depth maps of the far and mid cutouts (tools/layer-depth.py), to fly through them in 3D. Credit them with the photo. */
  layerDepth?: { far: string; mid: string };
  /**
   * Optional sharper copy of the middle of the far cutout (tools/detail-patch.py), at twice the size, that the
   * dive blends in as it zooms; `x`, `y`, `w`, `h` say where it sits, as fractions of the photo. Credit it with the photo.
   */
  detail?: { src: string; x: number; y: number; w: number; h: number };
  /** Optional tiny blurred copy (tools/placeholder.py), shown until the photo has loaded. Re-make it when the photo changes. */
  placeholder?: string;
}

/**
 * Path to a file in public/, relative to the site root (works in dev, build and sub-folder hosting).
 * vite.config.ts also reads this file (for `meta`), where import.meta.env doesn't exist yet.
 */
const asset = (path: string) => `${import.meta.env?.BASE_URL ?? '/'}${path}`;

export const site = {
  /**
   * Link previews (Open Graph, X/Twitter), search results, robots.txt and sitemap.xml. vite.config.ts writes
   * these into the built HTML, so they work without JavaScript. Change `url` when the site gets its own domain.
   */
  meta: {
    url: 'https://pnw-portfolio.alansoftwareengineer.workers.dev/',
    title: 'Into the Fog',
    description: 'An immersive portfolio that descends through Cascade valley fog.',
    /** 1200×630, relative to `url`. A crop of the overlook. */
    image: {
      src: 'images/share.jpg',
      alt: 'Fir trees frame blue mountain peaks above a valley filled with fog.',
      width: 1200,
      height: 630,
    },
  },

  name: { first: 'Alan', last: 'Barboza' },
  tagline: 'Design and development from the west side of the mountains.',
  /** Trail sign under the tagline: one plank per section, in page order. `target` is the section's id in index.html. */
  sign: {
    label: 'Sections',
    links: [
      { label: 'About', target: 'about' },
      { label: 'Work', target: 'work' },
      { label: 'Contact', target: 'contact' },
    ],
  },

  descent: {
    /** Opening photo: the view the visitor starts in. */
    overlook: {
      src: asset('images/valley.webp'),
      layers: {
        far: asset('images/valley-far.webp'),
        mid: asset('images/valley-mid.webp'),
        near: asset('images/valley-near.webp'),
      },
      layerDepth: {
        far: asset('images/valley-far-depth.webp'),
        mid: asset('images/valley-mid-depth.webp'),
      },
      detail: { src: asset('images/valley-far-detail.webp'), x: 0.1998, y: 0.2999, w: 0.6501, h: 0.3802 },
      alt: 'Fir trees frame a deep mountain valley, with a river of fog winding below jagged blue peaks.',
      width: 1792,
      height: 2688,
      placeholder:
        'data:image/webp;base64,UklGRp4BAABXRUJQVlA4IJIBAACQCACdASogADAAPmksj0WkIqEYBVRABoSxgE6ZjZYQ7nbqsbPngVS++cOmJly+uc7m1/vDQXpyM0qy1zasevTgMTJ7Wt+qLKNSTBjsAAD99pQJOkCy8pSSl1Ahbcf47uS73vZxx2j+H3whihGYcH1pGWzsPcoFdIDWhrDZH6WqNkLgmHI48Uj+fIfdtcHAAOOjPsa6b4W+dkLH3/xZn2+FH0to5mczMoDCMxJ1APaw0H7Hc+fbEqAivjZNIZTW/pV/SCtShxtk18fk+kbI1zcKdUhjefRVtxcMVxdTQGUnUzUj6hho6CTTK691bTlT8p9vIMvKzCQWlubiNWLsP9EjF21eqgejZZGZjqj5bamyVCOIAg11KVfiW6Q8l6X9C70Qpo7Z6UhadM0nuWu7cKEYH2ziAqI7VI+vn8s8AVKGTThlSkLqYnaXHm+Sf1SBDQCumRzbINvKjCJQ7R9ovMsd5GpAh0mhvMYt2QNjEi/KgTUrVtZG9UbnchKI3sJOpM0lmSL5pEW7WC9Y38s3FwAAAAA=',
    } satisfies PhotoAsset,
    /** Where the camera dives, as a fraction of the opening photo (0–1). Currently: the fog pool in the valley. */
    diveTarget: { x: 0.51, y: 0.49 },
    /** Center of the opening frame, as a fraction of the photo. Used when the photo is cropped. */
    startFocus: { x: 0.5, y: 0.34 },
    /**
     * How far the camera zooms into the dive target (1 = no zoom). The 1792 px overlook alone gets soft above ~3;
     * past that, the sharper `detail` of the valley carries it.
     */
    diveZoom: 4.5,

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

    fogCaption: { text: 'swoosh' },
    landingCaption: { text: 'keep your pace' },
  },

  about: {
    label: '',
    heading: 'I like making things.',
    paragraphs: [
      'Interfaces with atmosphere: quiet, layered, and paced like a run through old growth on a grey morning.',
      'I care about craft, calm motion, and pages that reward the second look. Replace this with your own story.',
    ],
  },

  work: {
    heading: 'Selected work',
    label: '',
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
        // Placeholder covers below are crops of the page's own photos. Swap in a screenshot of each project.
        image: {
          src: asset('images/trail.webp'),
          alt: 'Sword ferns and moss-covered trunks in an old-growth forest.',
          width: 2250,
          height: 1500,
          focus: { x: 0, y: 0.7 },
          zoom: 2.6,
        },
        example: true,
      },
      {
        title: 'Ridgeline weather dashboard',
        year: '2025',
        kind: 'Data viz',
        description:
          'Live snow level, freezing line and pass conditions for the Cascades, drawn as a single elevation profile.',
        image: {
          src: asset('images/valley.webp'),
          alt: 'Blue mountain ridges above a valley full of fog.',
          width: 1792,
          height: 2688,
          focus: { x: 0.6, y: 0.3 },
          zoom: 1.5,
        },
        example: true,
      },
      {
        title: 'Trail run tracker',
        year: '2025',
        kind: 'Mobile UI',
        description:
          'Pace, elevation and segment splits for forest trails, designed to read at a glance mid-stride and in the rain.',
        image: {
          src: asset('images/trail.webp'),
          alt: 'A runner on a dirt trail through old-growth forest.',
          width: 2250,
          height: 1500,
          focus: { x: 0.49, y: 0.6 },
          zoom: 2,
        },
        example: true,
      },
    ] as Project[],
  },

  /**
   * The trail run (src/scenes/run.ts): a filmed run down the trail, the backdrop behind About and Work, scrubbed by
   * scroll. It opens from the trail photo (its first frame is that photo), so keep `landing` and this film the same
   * shot. Both videos are made from one master by tools/run-video.py.
   */
  run: {
    label: 'Trail run',
    /** For screen readers, in place of the video. */
    description:
      'A runner, seen from behind, runs down a winding dirt trail through a misty old-growth forest of ' +
      'moss-covered trees and sword ferns.',
    /** Decoded frame by frame in the browser (WebCodecs): a keyframe every half second. */
    video: asset('video/trail-run-hq.mp4'),
    /** For browsers without WebCodecs: a keyframe on every frame, so a plain <video> can show any frame at once. */
    fallback: asset('video/trail-run.mp4'),
    /**
     * Where the film's first frame sits on the trail photo (`landing`): left, top and width as fractions of the
     * photo. tools/run-video.py prints it. The film opens there, then eases to its own framing.
     */
    align: { x: 0, y: 0.1, w: 1 },
    /**
     * For screens held upright, which show only a slice of the film: that slice around the runner, upscaled
     * (tools/run-upscale.py), with its own place on the photo.
     */
    phone: {
      video: asset('video/trail-run-phone.mp4'),
      align: { x: 0.3219, y: 0.0984, w: 0.3167 },
    },
    /** First frame, shown until the video has loaded. */
    poster: asset('images/trail-run-poster.webp'),
    /** Shown instead of the video with reduced motion. */
    still: {
      src: asset('images/trail-run-still.webp'),
      alt: 'A runner, seen from behind, runs down a dirt trail between sword ferns in a misty old-growth forest.',
      width: 1152,
      height: 648,
    },
  },

  contact: {
    heading: 'Contact',
    label: '',
    leadBefore: "Let's connect.",
    leadEmphasis: '',
    leadAfter: 'and chat.',
    email: 'alansoftwareengineer@gmail.com',
    /** Profiles under the email, in this order. Add LinkedIn, a résumé … as { label, href }. */
    links: [{ label: 'GitHub', href: 'https://github.com/albarboz' }],
  },

  /** Small interface labels. */
  ui: {
    /** Hint at the bottom of the opening screen; fades out as the dive starts. */
    scrollCue: 'Scroll',
    /** Footer link that flies back up the page, through the fog, to the overlook. */
    toTop: 'Back to the overlook',
    copyEmail: { label: 'Copy email', copied: 'Copied', selected: 'Selected — press Ctrl/⌘ C' },
  },

  credits: [
    'Images generated with Midjourney.',
  ],
};

export type Site = typeof site;
