import { gsap } from '../core/scroll';
import { tuning } from '../core/tuning';
import { FogLayer } from './fog-layer';

/**
 * A pass through a cloud, over the whole screen, like the descent's white-out: the fog streams toward the camera and
 * thickens, a veil of the same mist closes behind it, `swap` runs while nothing shows through, and the camera flies
 * on out the other side. Timing in `tuning.wipe`.
 * The fog is a FogLayer, so the shader fog draws it where it can and the canvas fog everywhere else (quality 0, no
 * WebGL, or before three has loaded). `warm()` makes it ahead of time, so the shader is in by the first pass.
 */
export class FogWipe {
  private fog: FogLayer | null = null;
  private tl: gsap.core.Timeline | null = null;
  private state = { density: 0, rush: 0, veil: 0 };
  private start = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private veil: HTMLElement,
  ) {}

  warm() {
    this.fog ??= new FogLayer(this.canvas, { tint: '--fog-dusk', yMin: 0 });
  }

  get running() {
    return !!this.tl;
  }

  /** Resolves once the fog has cleared. The canvas must be on screen (its size is measured here). */
  run(swap: () => void): Promise<void> {
    this.warm();
    this.tl?.progress(1); // a pass already under way finishes at once, its own swap included
    const fog = this.fog!;
    fog.resize();
    const s = Object.assign(this.state, { density: 0, rush: 0, veil: 0 });
    const { in: tIn, out: tOut } = tuning.wipe;
    this.start = performance.now();

    return new Promise((resolve) => {
      this.tl = gsap
        .timeline({
          onUpdate: this.draw,
          onComplete: () => {
            this.tl = null;
            fog.clear();
            this.veil.style.opacity = '0';
            resolve();
          },
        })
        .to(s, { density: 1, duration: tIn, ease: 'power2.in' }, 0)
        .to(s, { rush: 0.45, duration: tIn, ease: 'power1.in' }, 0)
        // the veil closes in the second half: wisps first, then nothing shows through
        .to(s, { veil: 1, duration: tIn * 0.55, ease: 'power2.in' }, tIn * 0.45)
        .call(swap, [], tIn)
        .to(s, { veil: 0, duration: tOut * 0.55, ease: 'power2.out' }, tIn + 0.06)
        .to(s, { density: 0, duration: tOut, ease: 'power2.inOut' }, tIn)
        .to(s, { rush: 1, duration: tOut, ease: 'power2.out' }, tIn);
    });
  }

  destroy() {
    this.tl?.kill();
    this.tl = null;
    this.fog?.destroy();
    this.fog = null;
  }

  private draw = () => {
    const fog = this.fog!;
    fog.density = this.state.density;
    fog.rush = this.state.rush;
    fog.draw((performance.now() - this.start) / 1000);
    this.veil.style.opacity = String(this.state.veil);
  };
}
