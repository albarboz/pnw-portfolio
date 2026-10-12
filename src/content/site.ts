// All editable content for the site. Scenes and UI read from here; nothing else should hard-code copy.

export interface Project {
  title: string;
  year: string;
  kind: string;
  description: string;
  href: string;
  /** Marks placeholder content. Remove once the project is real. */
  example?: boolean;
}

export interface PhotoAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/** Path to a file in public/, relative to the site root (works in dev, build and sub-folder hosting). */
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const site = {
  name: { first: 'Alan', last: 'Barboza' },
  eyebrow: 'Portfolio · Cascades · 47° N',
  tagline: 'Design and development from the wet side of the mountains.',
  scrollCue: 'Scroll to descend',

  descent: {
    /** Opening photo: the view the visitor starts in. */
    overlook: {
      src: asset('images/valley.webp'),
      alt: 'Fir trees frame a deep mountain valley, with a river of fog winding below jagged blue peaks.',
      width: 1792,
      height: 2688,
    } satisfies PhotoAsset,
    /** Where the camera dives, as a fraction of the opening photo (0–1). Currently: the fog pool in the valley. */
    diveTarget: { x: 0.51, y: 0.49 },
    /** Center of the opening frame, as a fraction of the photo. Used when the photo is cropped. */
    startFocus: { x: 0.5, y: 0.34 },
    /** How far the camera zooms into the dive target (1 = no zoom). */
    diveZoom: 4.5,

    /** Landing photo: what the fog clears to. */
    landing: {
      src: asset('images/trail.webp'),
      alt: 'A runner in a light jacket jogs down a dirt trail through mossy old-growth trees and ferns.',
      width: 2250,
      height: 1500,
    } satisfies PhotoAsset,
    /** Point the landing photo pushes in toward, in CSS percentages. Currently: the runner. */
    landingFocus: { x: 48, y: 58 },

    fogCaption: { label: 'Cloud line', text: 'Below the fog, the trail is already wet.' },
    landingCaption: { label: 'On the trail', text: 'Keep pace. The work is just ahead.' },
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
    projects: [
      {
        title: 'Hoh Rain Forest field guide',
        year: '2026',
        kind: 'Web app',
        description:
          'An offline-first trail companion that identifies mosses and ferns from a photo and logs sightings to a shared map.',
        href: '#work',
        example: true,
      },
      {
        title: 'Ridgeline weather dashboard',
        year: '2025',
        kind: 'Data viz',
        description:
          'Live snow level, freezing line and pass conditions for the Cascades, drawn as a single elevation profile.',
        href: '#work',
        example: true,
      },
      {
        title: 'Trail run tracker',
        year: '2025',
        kind: 'Mobile UI',
        description:
          'Pace, elevation and segment splits for forest trails, designed to read at a glance mid-stride and in the rain.',
        href: '#work',
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
    'Photos: provided by the site owner. Confirm source and license before launch.',
  ],
};

export type Site = typeof site;
