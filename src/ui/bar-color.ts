import { ScrollTrigger } from '../core/scroll';
import { prefersReducedMotion } from '../core/motion';
import { tuning } from '../core/tuning';
import { site } from '../content/site';

/**
 * The browser's toolbar on phones (theme-color) takes the color of whatever is at the top of the screen, so it
 * reads as part of the picture: the overlook's sky, the white-out, the forest canopy over the trail and the run,
 * the night of Work's sheet and of a case study. Colors are tokens (tokens.css, --bar-*), changed only when the
 * scene changes, never per frame. Chrome on Android follows it; Safari picks its own.
 * The tab's icon follows the same scenes (site.ui.tabIcons): the valley, the fog, the trail, and the blaze at Contact.
 * Create after the scenes, so the sections' positions are measured.
 */
export function createBarColor(): { destroy: () => void } {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const descent = document.querySelector<HTMLElement>('[data-scene="descent"]');
  const work = document.getElementById('work');
  const dialog = document.querySelector<HTMLDialogElement>('[data-case-study]');
  const contact = document.getElementById('contact');
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!meta || !descent) return { destroy() {} };
  const icons: Record<string, string> = {
    '--bar-sky': site.ui.tabIcons.overlook,
    '--fog-high': site.ui.tabIcons.fog,
    '--bar-canopy': site.ui.tabIcons.trail,
  };

  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let scene = '--bar-sky';
  let onSheet = false;
  let atContact = false;
  let shown = '';
  let shownIcon = '';
  const update = () => {
    const tab = atContact ? site.ui.tabIcons.contact : icons[scene];
    if (icon && tab !== shownIcon) icon.href = shownIcon = tab;
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
  if (contact) {
    // as the header marks it (src/ui/header.ts)
    triggers.push(
      ScrollTrigger.create({
        trigger: contact,
        start: 'top 55%',
        onToggle: ({ isActive }) => ((atContact = isActive), update()),
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
