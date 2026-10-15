import { ScrollTrigger } from '../core/scroll';
import { prefersReducedMotion } from '../core/motion';
import { tuning } from '../core/tuning';

/**
 * The browser's toolbar on phones (theme-color) takes the color of whatever is at the top of the screen, so it
 * reads as part of the picture: the overlook's sky, the white-out, the forest canopy over the trail and the run,
 * the night of Work's sheet and of a case study. Colors are tokens (tokens.css, --bar-*), changed only when the
 * scene changes, never per frame. Chrome on Android follows it; Safari picks its own.
 * Create after the scenes, so the sections' positions are measured.
 */
export function createBarColor(): { destroy: () => void } {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const descent = document.querySelector<HTMLElement>('[data-scene="descent"]');
  const work = document.getElementById('work');
  const dialog = document.querySelector<HTMLDialogElement>('[data-case-study]');
  if (!meta || !descent) return { destroy() {} };

  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let scene = '--bar-sky';
  let onSheet = false;
  let shown = '';
  const update = () => {
    const name = dialog?.open || onSheet ? '--night' : scene;
    if (name === shown) return;
    shown = name;
    meta.content = token(name);
  };

  const triggers: ScrollTrigger[] = [];
  if (prefersReducedMotion()) {
    // still bands: the overlook, then the trail and the run
    triggers.push(
      ScrollTrigger.create({
        trigger: descent,
        start: 'bottom top',
        onToggle: ({ isActive }) => ((scene = isActive ? '--bar-canopy' : '--bar-sky'), update()),
      }),
    );
  } else {
    // The descent's pin (src/scenes/descent.ts): its timeline runs 0–1, then holds for the run's reveal.
    const length = () => tuning.scroll + tuning.run.reveal;
    triggers.push(
      ScrollTrigger.create({
        trigger: descent,
        start: 'top top',
        end: () => `+=${length() * 100}%`,
        onUpdate: ({ progress }) => {
          const t = progress * (length() / tuning.scroll); // the descent's timeline time
          scene = t < 0.55 ? '--bar-sky' : t < 0.7 ? '--fog-high' : '--bar-canopy';
          update();
        },
        onLeave: () => ((scene = '--bar-canopy'), update()),
        onLeaveBack: () => ((scene = '--bar-sky'), update()),
      }),
    );
  }
  if (work) {
    // as the header's ground does (src/ui/header.ts): over the solid middle of the night sheet
    const edge = () => parseFloat(getComputedStyle(work).paddingBottom) || 0;
    triggers.push(
      ScrollTrigger.create({
        trigger: work,
        start: () => `top+=${edge()} top`,
        end: () => `bottom-=${edge()} top`,
        onToggle: ({ isActive }) => ((onSheet = isActive), update()),
      }),
    );
  }
  const opened = dialog ? new MutationObserver(update) : null;
  if (dialog) opened!.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  update();

  return {
    destroy() {
      triggers.forEach((t) => t.kill());
      opened?.disconnect();
    },
  };
}
