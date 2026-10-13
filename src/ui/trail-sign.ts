import type Lenis from 'lenis';
import { clamp } from '../core/math';
import { site } from '../content/site';

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M2.5 7 6 10.5 9.5 7"/></svg>';

/**
 * Trail sign under the tagline: one plank per section, a way past the descent. A click flies to the section (the
 * dive fast-forwards on the way down), then hands focus to its heading so keyboard and screen-reader users land
 * there too. Reduced motion: a plain jump. It lives in the hero, so it fades out with the name (descent.ts).
 */
export function createTrailSign(lenis: Lenis | null): { destroy: () => void } {
  const nav = document.querySelector<HTMLElement>('[data-sign]');
  const list = nav?.querySelector('ul');
  if (!nav || !list) return { destroy() {} };
  nav.setAttribute('aria-label', site.sign.label);

  const land = (section: HTMLElement) => {
    const heading = section.querySelector<HTMLElement>('h2') ?? section;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };

  const go = (section: HTMLElement) => {
    if (!lenis) {
      section.scrollIntoView();
      land(section);
      return;
    }
    // longer trips take a little longer, so the dive still reads as a dive
    const screens = Math.abs(section.getBoundingClientRect().top) / innerHeight;
    lenis.scrollTo(section, {
      duration: clamp(0.8 + screens * 0.25, 0.8, 1.8),
      easing: easeInOut,
      onComplete: () => land(section),
    });
  };

  list.replaceChildren(
    ...site.sign.links.map(({ label, target }) => {
      const section = document.getElementById(target)!;
      const link = Object.assign(document.createElement('a'), { href: `#${target}`, textContent: label });
      link.setAttribute('aria-label', label); // the sign letters it in capitals; read it as a word
      link.insertAdjacentHTML('beforeend', ARROW);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        go(section);
      });
      const li = document.createElement('li');
      li.append(link);
      return li;
    }),
  );

  return { destroy: () => list.replaceChildren() };
}
