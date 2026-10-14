import type Lenis from 'lenis';
import { clamp } from '../core/math';
import { tuning } from '../core/tuning';

// sine in-out: eases away from where you are and settles at the section without a hard push in the middle
const easeInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Fly to a section (or, with `null`, back up to the top: the descent plays backward, up through the fog), then hand
 * focus to its heading so keyboard and screen-reader users land there too. Longer trips take longer, so the scenes
 * on the way play at a pace you can watch. Reduced motion (no Lenis): a plain jump.
 */
export function flyTo(section: HTMLElement | null, lenis: Lenis | null) {
  const heading = section ? (section.querySelector<HTMLElement>('h2') ?? section) : document.querySelector('h1');
  const land = () => {
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };
  if (!lenis) {
    if (section) section.scrollIntoView();
    else window.scrollTo(0, 0);
    land();
    return;
  }
  const screens = Math.abs(section ? section.getBoundingClientRect().top : window.scrollY) / innerHeight;
  const { base, perScreen, max } = tuning.sign;
  lenis.scrollTo(section ?? 0, {
    duration: clamp(base + screens * perScreen, base, max),
    easing: easeInOut,
    onComplete: land,
  });
}
