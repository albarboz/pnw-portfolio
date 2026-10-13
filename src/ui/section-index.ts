import type Lenis from 'lenis';
import { ScrollTrigger } from '../core/scroll';
import { clamp } from '../core/math';
import { site } from '../content/site';

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Section index in the top right corner: a way past the descent. A click flies to the section (the dive
 * fast-forwards on the way down), then hands focus to its heading so keyboard and screen-reader users land
 * there too. The link of the section on screen is marked current.
 * Reduced motion: a plain jump. Create after the scenes, so pinned scroll space is already measured.
 */
export function createSectionIndex(lenis: Lenis | null): { destroy: () => void } {
  const nav = document.querySelector<HTMLElement>('[data-index]');
  if (!nav) return { destroy() {} };
  nav.setAttribute('aria-label', site.index.label);

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

  const triggers: ScrollTrigger[] = [];
  nav.replaceChildren(
    ...site.index.links.map(({ label, target }) => {
      const section = document.getElementById(target)!;
      const link = Object.assign(document.createElement('a'), { href: `#${target}`, textContent: label });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        go(section);
      });
      triggers.push(
        ScrollTrigger.create({
          trigger: section,
          // a line high on the screen: a short section (About) still counts once you've flown to it
          start: 'top 30%',
          end: 'bottom 30%',
          onToggle: (self) =>
            self.isActive ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'),
        }),
      );
      return link;
    }),
  );

  return {
    destroy() {
      triggers.forEach((t) => t.kill());
      nav.replaceChildren();
    },
  };
}
