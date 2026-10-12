import { ScrollTrigger } from '../core/scroll';
import { lerp } from '../core/math';
import { site } from '../content/site';

export interface Altimeter {
  /** Called by the descent scene with its 0–1 progress. */
  fromDescent: (p: number) => void;
  attach: () => void;
  destroy: () => void;
}

/** Corner gauge that counts down from the overlook to the trailhead as you scroll. */
export function createAltimeter(): Altimeter {
  const nameEl = document.querySelector<HTMLElement>('[data-alt="name"]')!;
  const valueEl = document.querySelector<HTMLElement>('[data-alt="value"]')!;
  const { top, landing, bottom, labels } = site.altitude;

  const show = (name: string, ft: number) => {
    nameEl.textContent = name;
    valueEl.textContent = `${(Math.round(ft / 10) * 10).toLocaleString('en-US')} ft`;
  };

  let below: ScrollTrigger | null = null;
  show(labels.above, top);

  return {
    fromDescent(p) {
      if (below && below.progress > 0) return;
      const name = p < 0.36 ? labels.above : p < 0.66 ? labels.fog : labels.landing;
      show(name, lerp(top, landing, Math.pow(p, 1.4)));
    },
    // Call AFTER scenes are created: their pins add scroll space this trigger must measure.
    attach() {
      below = ScrollTrigger.create({
        trigger: '#about',
        start: 'top bottom',
        endTrigger: '#contact',
        end: 'top center',
        refreshPriority: -1,
        onUpdate: (self) => {
          show(self.progress < 1 ? labels.below : labels.bottom, lerp(landing, bottom, self.progress));
        },
      });
    },
    destroy: () => below?.kill(),
  };
}
