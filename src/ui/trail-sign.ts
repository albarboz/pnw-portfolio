import type Lenis from 'lenis';
import { clamp } from '../core/math';
import { tuning } from '../core/tuning';
import { site } from '../content/site';

// sine in-out: eases away from the hero and settles at the section without a hard push in the middle
const easeInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
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
    // longer trips take longer, so the dive plays at a pace you can watch
    const screens = Math.abs(section.getBoundingClientRect().top) / innerHeight;
    const { base, perScreen, max } = tuning.sign;
    lenis.scrollTo(section, {
      duration: clamp(base + screens * perScreen, base, max),
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
