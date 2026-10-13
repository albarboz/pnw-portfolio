import { afterHero } from '../core/after-hero';
import { smoothstep } from '../core/math';
import { Fog, type FogOptions } from './fog';
import type { Fog3D } from './fog3d';

/** The two fogs look different, so they cross-fade (both are see-through: one fades out as the other fades in). */
const HANDOVER_MS = 1500;

/**
 * One fog layer for a scene: the canvas `Fog` draws at once, and the shader fog (three.js, fetched only after
 * the hero has loaded so the first paint stays light) takes over when it's ready. It draws on a copy of the
 * canvas, since a canvas that has a 2D context can't get a WebGL one, and the two cross-fade (HANDOVER_MS).
No WebGL or a lost GPU context leave the canvas fog showing.
 * Set the same knobs as on `Fog`.
 */
export class FogLayer {
  density = 0.4;
  rush = 0;
  offsetX = 0;
  offsetY = 0;

  private flat: Fog;
  private shader: { fog: Fog3D; canvas: HTMLCanvasElement; since: number } | null = null;
  private handover = 0; // 0 = canvas fog only, 1 = shader fog only
  private dead = false;

  constructor(
    private canvas: HTMLCanvasElement,
    options: FogOptions = {},
  ) {
    this.flat = new Fog(canvas, options);
    afterHero
      .then(() => import('./fog3d'))
      .then(({ Fog3D }) => {
        if (this.dead) return;
        const copy = canvas.cloneNode(false) as HTMLCanvasElement; // keeps data-fog, so its CSS mask still applies
        canvas.after(copy);
        copy.style.opacity = '0';
        try {
          this.shader = { fog: new Fog3D(copy, options, () => this.fallBack()), canvas: copy, since: performance.now() };
        } catch {
          copy.remove(); // no WebGL
        }
      })
      .catch(() => {}); // chunk failed to load: keep the canvas fog
  }

  /** The fogs drawing right now: the canvas fog until the shader fog has fully faded in, then only the shader. */
  private get active(): (Fog | Fog3D)[] {
    if (!this.shader) return [this.flat];
    if (this.handover < 1) {
      this.handover = smoothstep(0, HANDOVER_MS, performance.now() - this.shader.since);
      this.shader.canvas.style.opacity = String(this.handover);
      this.canvas.style.opacity = String(1 - this.handover);
      if (this.handover === 1) {
        this.canvas.hidden = true;
        this.canvas.style.opacity = '';
        this.flat.clear();
      }
    }
    return this.handover < 1 ? [this.flat, this.shader.fog] : [this.shader.fog];
  }

  resize() {
    this.active.forEach((f) => f.resize());
  }

  clear() {
    this.active.forEach((f) => f.clear());
  }

  /** @param time seconds; pass 0 for a still frame */
  draw(time: number) {
    for (const fog of this.active) {
      fog.density = this.density;
      fog.rush = this.rush;
      fog.offsetX = this.offsetX;
      fog.offsetY = this.offsetY;
      fog.draw(time);
    }
  }

  destroy() {
    this.dead = true;
    this.shader?.fog.destroy();
    this.shader?.canvas.remove();
    this.shader = null;
  }

  private fallBack() {
    if (!this.shader) return;
    this.shader.canvas.remove();
    this.shader = null;
    this.handover = 0;
    this.canvas.style.opacity = '';
    this.canvas.hidden = false;
    this.flat.resize(); // it was measured while hidden
  }
}
