import { smoothstep } from '../core/math';

export type LayerName = 'far' | 'mid' | 'near';

/**
 * Where each cutout stands: its distance from the camera's starting point (far = 1), and how much it
 * shifts with the pointer (× `shift`). The camera flies past the near branches early in the dive, and past the
 * mid layer (the tall fir and the slope below the overlook) as the fog closes in, leaving only the valley.
 */
const DEPTH: Record<LayerName, { depth: number; shift: number }> = {
  far: { depth: 1, shift: 0.4 },
  mid: { depth: 0.6, shift: 1 },
  near: { depth: 0.4, shift: 2 },
};

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
 * Loads them and calls `onActive` once every one has decoded; until then (or for good, if one fails or
 * `srcs` is missing) `active` stays false and the flat photo stays in charge.
 * At rest the cutouts stack back into the photo, so swapping one for the other doesn't show.
 */
export class PhotoLayers {
  readonly parts: { el: HTMLImageElement; depth: number; shift: number }[];
  active = false;
  private cancelled = false;

  constructor(
    slots: Record<LayerName, HTMLImageElement>,
    srcs: Record<LayerName, string> | undefined,
    onActive: () => void,
  ) {
    const names = Object.keys(DEPTH) as LayerName[];
    this.parts = names.map((name) => ({ el: slots[name], ...DEPTH[name] }));
    if (!srcs) return;
    names.forEach((name) => {
      slots[name].decoding = 'async';
      slots[name].src = srcs[name];
    });
    Promise.all(names.map((name) => slots[name].decode()))
      .then(() => {
        if (this.cancelled) return;
        this.active = true;
        this.parts.forEach((p) => (p.el.hidden = false));
        onActive();
      })
      .catch(() => {});
  }

  destroy() {
    this.cancelled = true;
  }
}
