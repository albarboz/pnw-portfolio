import { gsap, ScrollTrigger } from '../core/scroll';

/**
 * Fades and lifts every [data-reveal] element into place as it scrolls into view.
 * Elements that arrive together (a heading and its text, the project rows) stagger in order.
 *
 * Uses opacity, not autoAlpha: hidden items stay focusable and readable by screen readers,
 * and focusing one shows it at once. Reduced motion: nothing is hidden or animated.
 * Create after the scenes, so pinned scroll space is already measured.
 */
export function createReveal(): { destroy: () => void } {
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const items = gsap.utils.toArray<HTMLElement>('[data-reveal]');
    gsap.set(items, { opacity: 0, y: 28 });

    const show = (els: Element[]) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', stagger: 0.09, overwrite: true });

    // onLeave too: covers loading the page already scrolled past an item.
    ScrollTrigger.batch(items, { start: 'top 88%', once: true, onEnter: show, onLeave: show });

    const onFocus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest('[data-reveal]');
      if (el) gsap.set(el, { opacity: 1, y: 0, overwrite: true });
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  });

  return { destroy: () => mm.revert() };
}
