import { Fog, type FogOptions } from './fog';
import type { Fog3D } from './fog3d';

/**
 * One fog layer for a scene: the canvas `Fog` draws at once, and the shader fog (three.js, loaded lazily so
 * the first paint stays light) takes over when it's ready. It draws on a copy of the canvas, since a canvas
 * that has a 2D context can't get a WebGL one. No WebGL or a lost GPU context leave the canvas fog showing.
 * Set the same knobs as on `Fog`.
 */
export class FogLayer {
  density = 0.4;
  rush = 0;
  offsetX = 0;
  offsetY = 0;

  private flat: Fog;
  private shader: { fog: Fog3D; canvas: HTMLCanvasElement } | null = null;
  private dead = false;

  constructor(
    private canvas: HTMLCanvasElement,
    options: FogOptions = {},
  ) {
    this.flat = new Fog(canvas, options);
    import('./fog3d')
      .then(({ Fog3D }) => {
        if (this.dead) return;
        const copy = canvas.cloneNode(false) as HTMLCanvasElement; // keeps data-fog, so its CSS mask still applies
        canvas.after(copy);
        try {
          this.shader = { fog: new Fog3D(copy, options, () => this.fallBack()), canvas: copy };
        } catch {
          copy.remove(); // no WebGL
          return;
        }
        canvas.hidden = true;
        this.flat.clear();
      })
      .catch(() => {}); // chunk failed to load: keep the canvas fog
  }

  private get active(): Fog | Fog3D {
    return this.shader?.fog ?? this.flat;
  }

  resize() {
    this.active.resize();
  }

  clear() {
    this.active.clear();
  }

  /** @param time seconds; pass 0 for a still frame */
  draw(time: number) {
    const fog = this.active;
    fog.density = this.density;
    fog.rush = this.rush;
    fog.offsetX = this.offsetX;
    fog.offsetY = this.offsetY;
    fog.draw(time);
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
    this.canvas.hidden = false;
    this.flat.resize(); // it was measured while hidden
  }
}
