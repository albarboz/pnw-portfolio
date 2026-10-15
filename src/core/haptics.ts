import type { Vibration, WebHaptics } from 'web-haptics';
import { afterHero } from './after-hero';

/**
 * What the visitor feels, by moment. Short and firm: phone motors don't start for much under 10 ms, and web-haptics
 * pulses anything below full intensity on and off, which a short tap doesn't survive.
 */
const PATTERNS = {
  /** a section heading's blaze paints in */
  blaze: [{ duration: 10, intensity: 1 }],
  /** the camera breaks out of the cloud onto the trail: a soft double beat */
  land: [
    { duration: 16, intensity: 1 },
    { delay: 110, duration: 28, intensity: 1 },
  ],
  /** a flight from the trail sign or the header reaches its section */
  arrive: [{ duration: 18, intensity: 1 }],
  /** a case study's fog at its thickest, as the page changes under it */
  fog: [{ duration: 24, intensity: 1 }],
  /** the email is on the clipboard: two quick taps */
  copied: [
    { duration: 14, intensity: 1 },
    { delay: 70, duration: 22, intensity: 1 },
  ],
} satisfies Record<string, Vibration[]>;

export type Haptic = keyof typeof PATTERNS;

const touch = window.matchMedia('(pointer: coarse)');
let engine: WebHaptics | null = null;

// Fetched after the hero, on touch screens only, so it's ready before the first tap: a tap's permission to vibrate
// lasts only a moment, too short to wait for a download.
if (touch.matches) {
  afterHero
    .then(() => import('web-haptics'))
    .then(({ WebHaptics }) => (engine = new WebHaptics()))
    .catch(() => {}); // no haptics, nothing else changes
}

/**
 * A small tap on phones (web-haptics, pinned): Android vibrates; iPhones on iOS 18+ tick through a hidden switch,
 * the only haptic Safari offers. A mouse gets nothing. Browsers let a page vibrate only once the visitor has tapped
 * it, so the moments tied to scrolling (a blaze, the landing) are felt from the first tap on, and the ones that
 * answer a tap always are.
 */
export function haptic(kind: Haptic) {
  if (!touch.matches || !engine) return;
  engine.trigger(PATTERNS[kind]).catch(() => {});
}
