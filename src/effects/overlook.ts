import { clamp, lerp, smoothstep } from '../core/math';
import { prefersReducedMotion } from '../core/motion';
import { tuning } from '../core/tuning';
import { site, type PhotoAsset } from '../content/site';
import { dolly, PhotoLayers } from './photo-layers';
import type { DepthLayers, DepthView } from './depth-layers';

/** A little bigger than cover, so even at rest the cutouts have room to shift with the pointer. */
const OVERSCAN = 1.04;
/** The 3D layers draw the same picture as the flat ones at rest; a short fade hides any resampling difference. */
const FADE_MS = 400;

/** The camera: `dive` and `pan` 0–1, the pointer `x`/`y` −1…1; all already scaled by motionScale(). */
export interface OverlookView {
  dive: number;
  pan: number;
  x: number;
  y: number;
}

/**
 * The opening view, in three stages that each take over at rest, where they line up with the one before:
 * 1. the flat photo (first paint);
 * 2. its far / mid / near cutouts, flown through by a CSS dolly (photo-layers.ts);
 * 3. the far and mid cutouts in 3D, pushed back by their depth maps (depth-layers.ts), under the fog;
 *    the near branches stay a flat card above the fog, moved by the same camera.
 * Stages 2 and 3 load after the hero, and not at all with reduced motion (they'd only show the same still).
 * Without WebGL, or if a depth map fails, the flat cutouts stay.
 */
export class Overlook {
  private photo: HTMLImageElement;
  private layers: PhotoLayers;
  private canvas: HTMLCanvasElement;
  private relief: DepthLayers | null = null;
  private reliefReady = false;
  private layered = false;
  private reliefSince = -1; // when the 3D layers began fading in (performance.now), −1 while they're off
  private dead = false;
  private L = { vw: 0, vh: 0, w: 0, h: 0 };

  constructor(stage: HTMLElement, onReady: () => void) {
    const $ = <T extends HTMLElement>(sel: string) => stage.querySelector<T>(sel)!;
    const { layers, layerDepth }: PhotoAsset = site.descent.overlook;
    this.photo = $<HTMLImageElement>('[data-layer="overlook"]');
    this.canvas = $<HTMLCanvasElement>('[data-layer="overlook-3d"]');
    const part = (name: string) => $<HTMLImageElement>(`[data-overlook-part="${name}"]`);
    // The cutouts load after the hero; once they're in, the 3D layers build on the same images.
    this.layers = new PhotoLayers(
      { far: part('far'), mid: part('mid'), near: part('near') },
      prefersReducedMotion() ? undefined : layers,
      () => {
        onReady();
        if (layerDepth) this.loadRelief(layerDepth, onReady);
      },
    );
  }

  /** Size the photo so it always covers the stage. */
  layout(vw: number, vh: number) {
    const aspect = site.descent.overlook.width / site.descent.overlook.height;
    const cover = vw / vh > aspect;
    const w = (cover ? vw : vh * aspect) * OVERSCAN;
    const h = (cover ? vw / aspect : vh) * OVERSCAN;
    const T = site.descent.diveTarget;
    for (const el of [this.photo, ...this.layers.parts.map((p) => p.el)]) {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transformOrigin = `${T.x * w}px ${T.y * h}px`;
    }
    this.L = { vw, vh, w, h };
    this.relief?.resize(vw, vh);
  }

  /** Draw the view; `covered` = the trail fully hides it, so stop drawing (opacity, not visibility: keeps the alt text). */
  render(v: OverlookView, covered: boolean) {
    const atRest = v.dive === 0; // a stage swaps in only here, where it stacks exactly onto the one before
    if (atRest && this.layers.ready && !this.layered) {
      this.layered = true;
      this.layers.show();
      this.photo.style.willChange = 'auto'; // the cutouts move now; the flat photo only waits under them
    }
    const want3d = this.reliefReady && tuning.photo3d.show;
    if (!want3d) this.reliefSince = -1;
    else if (atRest && this.reliefSince < 0) this.reliefSince = performance.now();
    const fade = this.reliefSince < 0 ? 0 : smoothstep(0, FADE_MS, performance.now() - this.reliefSince);
    const parts = this.layers.parts;

    this.canvas.style.opacity = covered ? '0' : String(fade);
    this.photo.style.opacity = covered || this.layered || fade === 1 ? '0' : '';
    if (covered) {
      parts.forEach((p) => (p.el.style.opacity = '0'));
      return;
    }

    const z = 1 + (site.descent.diveZoom - 1) * v.dive;
    if (!this.layered) return this.place(this.photo, z, v.pan, v.x * -12, v.y * -6);
    const cam = fade > 0 ? this.camera(v) : null;
    if (cam) this.relief?.draw(cam);
    for (const p of parts) {
      const near = p.el.dataset.overlookPart === 'near';
      if (cam && near) {
        this.placeNear(p.el, cam, v.pan);
        continue;
      }
      if (fade === 1) {
        p.el.style.opacity = '0'; // drawn in 3D now
        continue;
      }
      const { scale, opacity } = dolly(p.depth, z);
      p.el.style.opacity = String(opacity);
      if (opacity > 0) this.place(p.el, scale, v.pan, v.x * -12 * p.shift, v.y * -6 * p.shift);
    }
  }

  destroy() {
    this.dead = true;
    this.layers.destroy();
    this.relief?.destroy();
    this.relief = null;
  }

  private loadRelief(srcs: { far: string; mid: string }, onReady: () => void) {
    const part = (name: string) => this.layers.parts.find((p) => p.el.dataset.overlookPart === name)!.el;
    import('./depth-layers')
      .then(({ DepthLayers }) => {
        if (this.dead) return;
        this.relief = new DepthLayers(
          this.canvas,
          [
            { img: part('far'), depth: srcs.far, grid: 112 },
            { img: part('mid'), depth: srcs.mid, grid: 160 },
          ],
          site.descent.diveTarget,
          () => this.dropRelief(),
        );
        this.relief.resize(this.L.vw, this.L.vh);
        return this.relief.loaded;
      })
      .then(() => {
        if (this.dead || !this.relief) return;
        this.reliefReady = true;
        onReady();
      })
      .catch(() => this.dropRelief()); // no WebGL, or the chunk or a depth map failed: keep the flat cutouts
  }

  /**
   * The 3D camera for this frame. The dive magnifies the dive target as much as the flat cutouts' zoom does,
   * but only part of it is flying (`fly`): the rest is the lens zooming in. Flying all the way would pass every
   * tree in the first moments, since the valley is so much farther away than they are.
   */
  private camera(v: OverlookView): DepthView {
    const s = tuning.photo3d;
    const c = this.crop(v.pan);
    const magnify = 1 + (site.descent.diveZoom - 1) * v.dive;
    const travel = s.fly * v.dive;
    return {
      ...this.L,
      left: -c.left,
      top: -c.top,
      target: site.descent.diveTarget,
      travel,
      zoom: magnify * (1 - travel),
      x: v.x * s.sway,
      y: -v.y * s.sway * 0.5,
      fov: s.fov,
      sky: s.sky,
      smooth: s.smooth,
    };
  }

  /** The near branches: a flat card at depth `photo3d.near`, moved by the 3D camera (a plane facing it only scales). */
  private placeNear(el: HTMLElement, cam: DepthView, pan: number) {
    const d = tuning.photo3d.near;
    if (cam.travel >= d) {
      el.style.opacity = '0';
      return;
    }
    const pass = d / (d - cam.travel); // how much nearer the camera has flown to it
    el.style.opacity = String(1 - smoothstep(3.5, 7, pass));
    // The camera's sideways offset, in screen px for something at this depth
    const focal = ((this.L.h * cam.zoom) / 2) / Math.tan(((cam.fov / 2) * Math.PI) / 180);
    const shift = (focal * pass) / d;
    this.place(el, cam.zoom * pass, pan, -cam.x * shift, cam.y * shift);
  }

  /** The stage's window into the photo at zoom 1: the start frame, panning toward the dive target. */
  private crop(pan: number) {
    const { vw, vh, w, h } = this.L;
    const S = site.descent.startFocus;
    const T = site.descent.diveTarget;
    const startL = clamp(vw / 2 - S.x * w, vw - w, 0);
    const startT = clamp(vh / 2 - S.y * h, vh - h, 0);
    return { left: lerp(startL, vw / 2 - T.x * w, pan), top: lerp(startT, vh / 2 - T.y * h, pan) };
  }

  /** Position the photo, or one of its cutouts, at zoom z: pan toward the dive target, never reveal an edge. */
  private place(el: HTMLElement, z: number, pan: number, ox: number, oy: number) {
    const { vw, vh, w, h } = this.L;
    const T = site.descent.diveTarget;
    const ax = T.x * w;
    const ay = T.y * h;
    const c = this.crop(pan);
    const left = clamp(c.left + ox, vw - ax - (w - ax) * z, ax * (z - 1));
    const top = clamp(c.top + oy, vh - ay - (h - ay) * z, ay * (z - 1));
    el.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${z})`;
  }

  private dropRelief() {
    this.relief?.destroy();
    this.relief = null;
    this.reliefReady = false;
    this.reliefSince = -1;
    this.canvas.style.opacity = '0';
  }
}
