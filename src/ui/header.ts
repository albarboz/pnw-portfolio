import type Lenis from 'lenis';
import { ScrollTrigger } from '../core/scroll';
import { site } from '../content/site';
import { flyTo } from './fly';

/**
 * The site header: one link per section. Hidden through the opening, where the trail
 * sign does its job, it fades in as the run reaches About and stays to the end. The section in view is marked
 * (aria-current). Every [data-fly-top] link on the page flies back up to the overlook.
 * Create after the scenes, so their pinned scroll space is already measured.
 */
export function createHeader(lenis: Lenis | null): { destroy: () => void } {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const nav = header?.querySelector<HTMLElement>('[data-header-nav]');
  const list = nav?.querySelector('ul');
  if (!header || !nav || !list) return { destroy() {} };
  nav.setAttribute('aria-label', site.sign.label);

  const triggers: ScrollTrigger[] = [];
  list.replaceChildren(
    ...site.sign.links.map(({ label, target }) => {
      const section = document.getElementById(target)!;
      const link = Object.assign(document.createElement('a'), { href: `#${target}`, textContent: label });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        flyTo(section, lenis);
      });
      triggers.push(
        ScrollTrigger.create({
          trigger: section,
          start: 'top 55%',
          end: 'bottom 55%',
          onToggle: ({ isActive }) => {
            if (isActive) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          },
        }),
      );
      const li = document.createElement('li');
      li.append(link);
      return li;
    }),
  );

  const about = document.getElementById('about');
  if (about) {
    triggers.push(
      ScrollTrigger.create({
        trigger: about,
        start: 'top bottom',
        end: 'max',
        onToggle: ({ isActive }) => header.classList.toggle('is-shown', isActive),
      }),
    );
  }

  const toTop = (e: Event) => {
    if (!(e.target as Element).closest('[data-fly-top]')) return;
    e.preventDefault();
    flyTo(null, lenis);
  };
  document.addEventListener('click', toTop);

  return {
    destroy() {
      triggers.forEach((t) => t.kill());
      document.removeEventListener('click', toTop);
      list.replaceChildren();
      header.classList.remove('is-shown');
    },
  };
}
