import { ScrollTrigger } from './scroll';

/**
 * In-app browsers (Snapchat, Instagram …) hide their own toolbar as you scroll, and the page grows taller than the
 * 100lvh the stages are sized to (lvh only counts the browser's own toolbar tucked away, as Safari's is). The film's
 * stage grows with it, but the overlook's is pinned at the height ScrollTrigger measured, which it doesn't measure
 * again when only a phone's height changes: the dark page showed below it as a bar.
 * So the stages are as tall as the tallest screen seen (--screen-tallest, sections.css), and the triggers are
 * measured again when that grows: once, the first time such a toolbar hides. In Safari it never does.
 * Touch screens only (a desktop window made taller and then shorter again would keep the tall stage), and it starts
 * over when the width changes: a phone turned sideways is a different screen.
 */
export function trackTallestScreen(): { destroy: () => void } {
  if (!matchMedia('(pointer: coarse)').matches) return { destroy() {} };
  // 100lvh in px, as the stages see it
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  const root = document.documentElement.style;
  let tallest = probe.offsetHeight;
  let width = window.innerWidth;

  let timer = 0;
  const grow = () => {
    if (window.innerWidth !== width) {
      // turned: ScrollTrigger measures everything again by itself on a width change
      width = window.innerWidth;
      root.removeProperty('--screen-tallest');
      tallest = probe.offsetHeight;
      return;
    }
    const h = Math.max(probe.offsetHeight, window.innerHeight);
    if (h <= tallest + 1) return;
    tallest = h;
    root.setProperty('--screen-tallest', `${h}px`);
    ScrollTrigger.refresh();
  };
  // the toolbar slides over a few frames: measure once it has settled
  const onResize = () => {
    clearTimeout(timer);
    timer = window.setTimeout(grow, 200);
  };
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
      probe.remove();
      root.removeProperty('--screen-tallest');
    },
  };
}
