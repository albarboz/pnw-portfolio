import { cssRgb } from '../core/tokens';

export interface FogOptions {
  /** Number of fog puffs. More = denser texture, slower draw. */
  count?: number;
  /** Color token from tokens.css for the fog tint, e.g. '--fog-high'. Must be a hex color. */
  tint?: string;
  /** Canvas resolution relative to its CSS size. Low values look softer and run faster (≤ 0.35). */
  resolution?: number;
  /** Puffs spawn between this fraction of the height and the bottom (0 = whole canvas). */
  yMin?: number;
}

/**
 * Soft drifting fog drawn as stacked puffs on a low-res canvas.
 * Normal blending, not additive: overlaps thicken toward the tint but never clip to a flat white patch.
 * Every puff stamps one pre-rendered sprite. Canvas gradients are dithered per pixel, and on a canvas this
 * low-res the dither gets stretched into a visible grid; the sprite's alpha is computed exactly, so it has none.
 * Set `density`, `rush` (fly-through spread) and `offsetX/Y` (parallax, -1…1), then call `draw(time)`.
 */
export class Fog {
  density = 0.4;
  rush = 0;
  offsetX = 0;
  offsetY = 0;

  private ctx: CanvasRenderingContext2D;
  private sprite: HTMLCanvasElement;
  private last = ''; // inputs of the frame on the canvas, so a still frame (reduced motion) is drawn once
  private w = 2;
  private h = 2;
  private opts: Required<FogOptions>;
  private rgb: [number, number, number];
  private puffs: {
    x: number;
    y: number;
    r: number;
    depth: number;
    speed: number;
    phase: number;
    alpha: number;
  }[];

  constructor(
    private canvas: HTMLCanvasElement,
    options: FogOptions = {},
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.opts = { count: 28, tint: '--fog', resolution: 0.33, yMin: 0.15, ...options };
    this.rgb = cssRgb(this.opts.tint);
    this.sprite = puffSprite(this.rgb);
    const { count, yMin } = this.opts;
    this.puffs = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: yMin + Math.random() * (1 - yMin),
      r: 0.18 + Math.random() * 0.32,
      depth: 0.2 + Math.random() * 0.8,
      speed: (0.004 + Math.random() * 0.01) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * Math.PI * 2,
      alpha: 0.1 + Math.random() * 0.16,
    }));
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(2, Math.round(rect.width * this.opts.resolution));
    this.h = Math.max(2, Math.round(rect.height * this.opts.resolution));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.last = '';
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.last = '';
  }

  /** @param time seconds; pass 0 for a still frame */
  draw(time: number) {
    const { ctx, w, h } = this;
    const res = this.opts.resolution;
    const key = `${time}|${this.density}|${this.rush}|${this.offsetX}|${this.offsetY}`;
    if (key === this.last) return;
    this.clear();
    this.last = key;
    if (this.density <= 0.005) return;

    const base = Math.max(w, h);
    for (const p of this.puffs) {
      const x = (((p.x + p.speed * time) % 1.4) + 1.4) % 1.4 - 0.2;
      const y = p.y + Math.sin(time * 0.15 + p.phase) * 0.02;
      // rush pushes puffs out from the center, like flying through cloud
      const cx = 0.5 + (x - 0.5) * (1 + this.rush * p.depth);
      const cy = 0.5 + (y - 0.5) * (1 + this.rush * p.depth);
      const px = cx * w + this.offsetX * 40 * p.depth * res;
      const py = cy * h + this.offsetY * 20 * p.depth * res;
      const rad =
        p.r * base * (0.9 + 0.1 * Math.sin(time * 0.2 + p.phase)) * (1 + this.rush * 0.6);

      // Squash the round puff flat; it fades to 0 exactly at the rim (no hard edges).
      ctx.globalAlpha = Math.min(1, p.alpha * this.density);
      ctx.setTransform(1.3, 0, 0, 0.6, px, py);
      ctx.drawImage(this.sprite, -rad, -rad, rad * 2, rad * 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }
}

/** A round puff in the tint: alpha 1 at the center, 0.45 halfway out, 0 at the rim. */
function puffSprite([r, g, b]: [number, number, number], size = 256) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const ctx = sprite.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.min(1, Math.hypot(x - c, y - c) / c);
      const alpha = t < 0.5 ? 1 - 1.1 * t : 0.9 * (1 - t);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return sprite;
}
