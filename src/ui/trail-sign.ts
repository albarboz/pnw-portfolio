import type Lenis from 'lenis';
import { site } from '../content/site';
import { flyTo } from './fly';

const ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M2.5 7 6 10.5 9.5 7"/></svg>';

/**
 * Trail sign under the tagline: one link per section, a way past the descent. A click flies to the section (the
 * dive fast-forwards on the way down; src/ui/fly.ts). It lives in the hero, so it fades out with the name
 * (descent.ts); the site header (src/ui/header.ts) takes over once the run reaches About.
 */
export function createTrailSign(lenis: Lenis | null): { destroy: () => void } {
  const nav = document.querySelector<HTMLElement>('[data-sign]');
  const list = nav?.querySelector('ul');
  if (!nav || !list) return { destroy() {} };
  nav.setAttribute('aria-label', site.sign.label);

  list.replaceChildren(
    ...site.sign.links.map(({ label, target }) => {
      const section = document.getElementById(target)!;
      const link = Object.assign(document.createElement('a'), { href: `#${target}`, textContent: label });
      link.insertAdjacentHTML('beforeend', ARROW);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        flyTo(section, lenis);
      });
      const li = document.createElement('li');
      li.append(link);
      return li;
    }),
  );

  return { destroy: () => list.replaceChildren() };
}
