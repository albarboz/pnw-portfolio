import { afterHero } from '../core/after-hero';
import { smoothstep } from '../core/math';
import { tuning } from '../core/tuning';

export type LayerName = 'far' | 'mid' | 'near';

/**
 * How much each cutout shifts with the pointer. Where each one stands (its distance from the camera, far = 1)
 * is in src/core/tuning.ts: the camera flies past the near branches early in the dive, and past the mid layer
 * (the tall fir and the slope below the overlook) as the fog closes in, leaving only the valley.
 */
const SHIFT: Record<LayerName, number> = { far: 0.4, mid: 1, near: 2 };

/**
 * A camera dolly through flat cutouts. A plane facing the camera only ever scales and moves under
 * perspective, so a CSS transform draws it exactly; no 3D engine needed.
 * `zoom` is how much bigger the far layer looks; returns a cutout's scale at that point, and how visible it
 * is: a cutout fades out as the camera reaches it (scale 3.5 → 7) instead of filling the frame with blur.
 */
export function dolly(depth: number, zoom: number) {
  const travel = 1 - 1 / zoom; // how far the camera has moved toward the far layer
  if (travel >= depth) return { scale: Infinity, opacity: 0 };
  const scale = depth / (depth - travel);
  return { scale, opacity: 1 - smoothstep(3.5, 7, scale) };
}

/**
 * The far / mid / near cutouts of a photo (tools/hero-layers.py), in their own <img> slots.
 * Loads them once the hero is in and calls `onReady` once every one has decoded; until then (or for good, if one
 * fails or `srcs` is missing) `ready` stays false. The caller swaps them in for the flat photo by calling `show()`,
 * at rest, where the cutouts stack back into the photo so the swap doesn't show.
 */
export class PhotoLayers {
  readonly parts: { el: HTMLImageElement; depth: number; shift: number }[];
  ready = false;
  private cancelled = false;

  constructor(
    slots: Record<LayerName, HTMLImageElement>,
    srcs: Record<LayerName, string> | undefined,
    onReady: () => void,
  ) {
    const names = Object.keys(SHIFT) as LayerName[];
    this.parts = names.map((name) => ({
      el: slots[name],
      shift: SHIFT[name],
      get depth() {
        return name === 'far' ? 1 : tuning.dolly[name]; // read live, so the dev panel can move it
      },
    }));
    if (!srcs) return;
    afterHero
      .then(() => {
        if (this.cancelled) return Promise.reject();
        names.forEach((name) => {
          slots[name].decoding = 'async';
          slots[name].src = srcs[name];
        });
        return Promise.all(names.map((name) => slots[name].decode()));
      })
      .then(() => {
        if (this.cancelled) return;
        this.ready = true;
        onReady();
      })
      .catch(() => {});
  }

  show() {
    this.parts.forEach((p) => (p.el.hidden = false));
  }

  destroy() {
    this.cancelled = true;
  }
}
