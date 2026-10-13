export type LayerName = 'far' | 'mid' | 'near';

/** How much faster each cutout zooms (zoom ** `zoom`) and shifts with the pointer (× `shift`) than the photo. */
const DEPTH: Record<LayerName, { zoom: number; shift: number }> = {
  far: { zoom: 1, shift: 0.4 },
  mid: { zoom: 1.35, shift: 1 },
  near: { zoom: 1.8, shift: 2 },
};

/**
 * The far / mid / near cutouts of a photo (tools/hero-layers.py), in their own <img> slots.
 * Loads them and calls `onActive` once every one has decoded; until then (or for good, if one fails or
 * `srcs` is missing) `active` stays false and the flat photo stays in charge.
 * At rest the cutouts stack back into the photo, so swapping one for the other doesn't show.
 */
export class PhotoLayers {
  readonly parts: { el: HTMLImageElement; zoom: number; shift: number }[];
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
