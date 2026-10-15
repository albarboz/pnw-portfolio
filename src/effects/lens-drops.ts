import type RaindropFX from 'raindrop-fx';
import { clamp } from '../core/math';
import { cssRgb } from '../core/tokens';
import { tuning } from '../core/tuning';

/** How the trail photo is framed at rest: its object-position (0–1, also the zoom's origin) and its zoom. */
export interface LensFraming {
  focus: { x: number; y: number };
  zoom: number;
}

/**
 * The parts of raindrop-fx's renderer this patches. Private in its types; the package is pinned (1.0.8, its last
 * release), so they can't move under us.
 */
interface RendererInternals {
  drawBackground(): void;
  dropletTexture: unknown;
  renderer: { gl: WebGL2RenderingContext; setRenderTarget(target: unknown): void };
}

/** Seconds of beads the lens starts with. */
const SEED_SECONDS = 1.5;
/** Sizes are tuned on a laptop screen; on a phone the drops shrink with it (but not below this share). */
const MIN_UNIT = 0.55;

/**
 * Water condensing on the lens as the camera comes out of the cloud (raindrop-fx by SardineFish, MIT, on its own
 * WebGL2 canvas over the trail photo). Beads fog the glass, heavier drops gather and run down, wiping clear trails
 * through them. The canvas is clear between drops: each drop draws the trail photo bent through it, so the real
 * photo (and its 2.5D motion) shows everywhere else.
 *
 * The simulation runs in real time while `draw()` is called (water keeps moving when the scroll stops); `wet`
 * (0–1) sets how fast new water arrives. `dry()` wipes the lens, for the next time it gets wet.
 */
export class LensDrops {
  private fx: RaindropFX | null = null;
  private internals: RendererInternals | null = null;
  private bg = document.createElement('canvas');
  private view = { vw: 0, vh: 0 };
  private total = 0;
  private wet = false;

  private constructor(
    private canvas: HTMLCanvasElement,
    private photo: HTMLImageElement,
    private framing: LensFraming,
  ) {}

  /** Loads raindrop-fx and the photo; null without WebGL2 (the trail then simply stays dry). */
  static async create(canvas: HTMLCanvasElement, photo: HTMLImageElement, framing: LensFraming, vw: number, vh: number) {
    const lens = new LensDrops(canvas, photo, framing);
    try {
      // the photo may get its src late (data-defer in src/ui/content.ts)
      if (!photo.getAttribute('src')) await new Promise((r) => photo.addEventListener('load', r, { once: true }));
      const [{ default: RaindropFX }] = await Promise.all([import('raindrop-fx'), photo.decode()]);
      lens.size(vw, vh);
      const fx = new RaindropFX({ canvas, background: lens.bg, mist: false, ...lens.options() });
      const r = fx.renderer as unknown as RendererInternals;
      // Its pass clears the canvas to black and paints the whole background; keep the glass clear between drops.
      r.drawBackground = () => {
        const gl = r.renderer.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      };
      await fx.renderer.loadAssets();
      lens.fx = fx;
      lens.internals = r;
    } catch {
      return null; // no WebGL2, or the photo failed
    }
    canvas.addEventListener('webglcontextlost', lens.onLost);
    return lens;
  }

  /** Size the canvas to a vw × vh stage (CSS px; drops are soft, so more pixels would only cost). */
  resize(vw: number, vh: number) {
    if (!this.fx || (vw === this.view.vw && vh === this.view.vh)) return;
    this.size(vw, vh);
    this.fx.resize(vw, vh);
    this.fx.simulator.resize(); // its collision grid, which resize() leaves at the first size
    void this.fx.setBackground(this.bg);
  }

  /** One step of the water, `dt` seconds on. */
  draw(wet: number, dt: number) {
    const fx = this.fx;
    if (!fx) return;
    Object.assign(fx.options, this.options(wet));
    const time = { dt: clamp(dt, 0, 0.05), total: (this.total += dt) };
    // A dry lens comes out of the cloud already wet: a scatter of drops, and beads as if it had been misting a while.
    const seed = !this.wet && wet > 0;
    if (seed) this.seed();
    this.wet = true;
    fx.simulator.update(time);
    fx.renderer.render(fx.simulator.raindrops, seed ? { ...time, dt: SEED_SECONDS } : time);
  }

  /** Drops of every size, scattered over the glass. */
  private seed() {
    const sim = this.fx!.simulator;
    const [min, max] = this.fx!.options.spawnSize;
    const { vw, vh } = this.view;
    const count = Math.round((tuning.drops.seed * vw * vh) / (1920 * 1080));
    for (let i = 0; i < count; i++) {
      const pos = sim.options.viewport.min.clone();
      pos.x += Math.random() * vw;
      pos.y += Math.random() * vh;
      sim.add(sim.spawner.spawn(pos, min + (max - min) * Math.random() ** 2));
    }
  }

  /** Wipe the lens: no drops, no beads. */
  dry() {
    const fx = this.fx;
    const r = this.internals;
    if (!fx || !r || !this.wet) return;
    this.wet = false;
    for (const drop of fx.simulator.raindrops) drop.grid?.delete(drop);
    fx.simulator.raindrops.length = 0;
    // the beads build up in a texture and only running drops erase them
    r.renderer.setRenderTarget(r.dropletTexture);
    r.renderer.gl.clearColor(0, 0, 0, 0);
    r.renderer.gl.clear(r.renderer.gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.internals?.renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.fx = this.internals = null;
  }

  /** The canvas size, and the photo framed on the stage exactly as at rest, for the drops to bend. */
  private size(vw: number, vh: number) {
    this.view = { vw, vh };
    Object.assign(this.canvas, { width: vw, height: vh });
    Object.assign(this.bg, { width: vw, height: vh });
    const ctx = this.bg.getContext('2d');
    const { naturalWidth: w, naturalHeight: h } = this.photo;
    if (!ctx || !w) return;
    const { focus: F, zoom } = this.framing;
    const cover = Math.max(vw / w, vh / h);
    // object-fit: cover at object-position F, then the zoom around the same point (the <img>'s transform-origin)
    ctx.translate(F.x * vw, F.y * vh);
    ctx.scale(zoom, zoom);
    ctx.translate(-F.x * vw, -F.y * vh);
    ctx.drawImage(this.photo, (vw - w * cover) * F.x, (vh - h * cover) * F.y, w * cover, h * cover);
    // and the shade the trail ends on (.landing-shade in sections.css), so drops near the bottom bend the same dark
    const [r, g, b] = cssRgb('--night');
    const shade = ctx.createLinearGradient(0, 0, 0, vh);
    shade.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0)`);
    shade.addColorStop(0.88, getComputedStyle(document.documentElement).getPropertyValue('--shade'));
    shade.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, vw, vh);
  }

  /** raindrop-fx's settings from `tuning.drops`, in its canvas px. */
  private options(wet = 0) {
    const t = tuning.drops;
    const { vw, vh } = this.view;
    const u = clamp(Math.min(vw, vh) / 900, MIN_UNIT, 1);
    const rate = t.rate * wet;
    return {
      // no new drops while drying (a limit below the count stops the spawner)
      spawnLimit: rate > 0.01 ? 400 : -1,
      spawnInterval: [0.5 / Math.max(rate, 0.01), 1.5 / Math.max(rate, 0.01)] as [number, number],
      spawnSize: [t.size * 0.4 * u, t.size * u] as [number, number],
      dropletsPerSeconds: (t.beads * wet * vw * vh) / (1920 * 1080),
      dropletSize: [8 * u, 20 * u] as [number, number],
      backgroundBlurSteps: 2, // a little sharper inside the drops than raindrop-fx's 3: the trail reads through them
      gravity: 2400 * u,
      trailDistance: [20 * u, 30 * u] as [number, number],
      refractBase: 0.4 * t.refract,
      refractScale: 0.6 * t.refract,
      raindropLightPos: [1, 1, 2, 0] as [number, number, number, number],
      raindropSpecularLight: [t.glint, t.glint, t.glint] as [number, number, number],
      raindropSpecularShininess: 24,
      // raindrop-fx's shading darkens most of each drop (made for bright scenes); in a dark forest it reads as
      // dirt, so only a faint shadow on the side away from the light
      raindropDiffuseLight: [0.12, 0.12, 0.12] as [number, number, number],
      raindropShadowOffset: 0.45,
    };
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.fx = this.internals = null; // the lens stays dry for the rest of the visit
    this.canvas.hidden = true;
  };
}
