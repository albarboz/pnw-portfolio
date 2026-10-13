import { cssRgb } from '../core/tokens';
import { tuning } from '../core/tuning';

/** Noise tile size in texels. Plain random noise never shows where it repeats. */
const TILE = 256;
/** How far the tile may jump, in CSS px. Matches the overhang of `.grain-tile` in sections.css. */
const JUMP = 64;
/** Fresh grain at most this often while the page moves, like film frames. */
const FPS = 24;

/**
 * Film grain over the whole descent: one fine noise tile on a DOM layer above the photos and the fog, below the
 * text. The photos carry their own grain; this gives the smooth shader fog the same, and since it covers every
 * layer alike, nothing changes when one layer takes over from another (flat cutouts → 3D, canvas → shader fog).
 * While the page moves the tile jumps to a fresh offset (transform only); at rest it holds still.
 * `el` is the still wrapper (it carries the bottom fade); the tile inside it is what jumps.
 */
export class Grain {
  private tile: HTMLElement;
  private lastJump = -1;
  private shown = { amount: -1, size: -1 };
  private url = '';

  constructor(private el: HTMLElement) {
    this.tile = el.querySelector<HTMLElement>('.grain-tile')!;
    noiseTile().then((url) => {
      this.url = url;
      if (url) this.tile.style.backgroundImage = `url(${url})`;
    });
  }

  /** Call every frame. `moving`: the scene changed since the last frame, so the grain should too. */
  update(moving: boolean, time: number) {
    const { amount, size } = tuning.grain;
    if (amount !== this.shown.amount) this.el.style.opacity = String(amount);
    if (size !== this.shown.size) this.tile.style.backgroundSize = `${TILE * size}px`;
    this.shown = { amount, size };
    if (!moving || time - this.lastJump < 1 / FPS) return;
    this.lastJump = time;
    const r = () => Math.round((Math.random() * 2 - 1) * JUMP);
    this.tile.style.transform = `translate3d(${r()}px, ${r()}px, 0)`;
  }

  destroy() {
    if (this.url) URL.revokeObjectURL(this.url);
  }
}

/** A tile of light and dark specks, transparent on average: soft, roughly gaussian strength per texel. */
async function noiseTile() {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(TILE, TILE);
  const light = cssRgb('--sky-text');
  const dark = cssRgb('--night');
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() + Math.random() + Math.random()) / 1.5 - 1; // -1…1, most near 0
    const [r, g, b] = n > 0 ? light : dark;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = Math.abs(n) * 255;
  }
  ctx.putImageData(img, 0, 0);
  // toBlob encodes off the main thread; toDataURL would block a frame
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res));
  return blob ? URL.createObjectURL(blob) : '';
}
