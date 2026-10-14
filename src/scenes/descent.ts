import { gsap, ScrollTrigger } from '../core/scroll';
import { lerp } from '../core/math';
import { motionScale, prefersReducedMotion } from '../core/motion';
import { pointer } from '../core/pointer';
import { quality } from '../core/quality';
import { tuning } from '../core/tuning';
import { DepthPhoto } from '../effects/depth-photo';
import { FogLayer } from '../effects/fog-layer';
import { Grain } from '../effects/grain';
import { Overlook } from '../effects/overlook';
import { site } from '../content/site';
import type { SceneHandle } from './types';

/** The trail photo's zoom once landed (around the runner): the trail run opens on exactly this framing. */
export const LANDED_ZOOM = 1.02;

/**
 * Descent: overlook → dive into the valley fog → whiteout → land on the trail.
 *
 *   time  0 ──── 0.16 ──── 0.4 ──── 0.62 ──── 0.78 ──── 0.95 ── 1 ─────────── + hold
 *         hero out   dive & fog thicken  whiteout   trail resolves  caption   the run opens over the trail
 *
 * The hold keeps the trail pinned while the trail run's fog ring opens the film over it (src/scenes/run.ts); the
 * pin ends as the ring finishes, and the film's stage, stuck on top, carries on.
 *
 * Reduced motion: no pin and no timeline. The stage becomes three still bands in the page flow (overlook with the
 * hero, a band of fog with its caption, the trail with its caption; `.scene.still` in sections.css), drawn once.
 */
export function createDescentScene(opts: { onProgress?: (p: number) => void } = {}): SceneHandle | null {
  const root = document.querySelector<HTMLElement>('[data-scene="descent"]');
  if (!root) return null;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const stage = $('[data-stage]');
  const landingWrap = $('[data-layer="landing-wrap"]');
  const landing = $<HTMLImageElement>('[data-layer="landing"]');
  const whiteout = $('[data-layer="whiteout"]');
  const heroCopy = $('[data-layer="hero"]');
  const cue = $('[data-layer="cue"]');
  const capFog = $('[data-layer="cap-fog"]');
  const capLanding = $('[data-layer="cap-landing"]');

  const still = prefersReducedMotion();
  root.classList.toggle('still', still);

  const fogHigh = new FogLayer($<HTMLCanvasElement>('[data-fog="high"]'), {
    count: 30,
    tint: '--fog-high',
    yMin: 0.3,
  });
  const fogLow = new FogLayer($<HTMLCanvasElement>('[data-fog="low"]'), {
    count: 22,
    tint: '--fog-low',
    yMin: 0,
  });

  const F = site.descent.landingFocus;
  landing.style.transformOrigin = `${F.x}% ${F.y}%`;
  landing.style.objectPosition = `${F.x}% ${F.y}%`;

  // 2.5D trail: once the depth map is in, a WebGL canvas replaces the flat landing <img>.
  const depthCanvas = $<HTMLCanvasElement>('[data-layer="landing-depth"]');
  const depth = new DepthPhoto(depthCanvas, landing, site.descent.landing.depth, (on) => {
    depthCanvas.hidden = !on;
    landing.style.opacity = on ? '0' : ''; // not visibility: that would drop its alt text from screen readers
    landing.style.willChange = on ? 'auto' : ''; // the canvas moves now; don't keep a GPU layer for a still <img>
    render();
  });
  quality.then((level) => level === 0 && depth.destroy()); // the slowest GPUs keep the plain photo

  const grain = new Grain($('[data-layer="grain"]'));

  // The opening view: flat photo → cutouts flown through by a CSS dolly → the valley in 3D (src/effects/overlook.ts).
  const overlook = new Overlook(stage, () => render());

  // ---------- state: the timeline tweens these numbers, render() reads them ----------
  const state = {
    heroOut: 0, // hero text fade
    heroY: 0, // hero text lift (px)
    pan: 0, // 0 = opening frame, 1 = dive target centered
    dive: 0, // zoom amount, 0–1
    fogHigh: 0.3, // fog density over the overlook
    rush: 0, // fog spreading outward as we fly through it
    capFog: 0,
    whiteout: 0,
    landing: 0, // landing photo opacity
    land: 0, // landing photo settles from 1.35× to 1×
    fogLow: 0, // fog density over the landing
    capLanding: 0,
  };

  // ---------- layout ----------
  let L = { vw: 0, vh: 0, dpr: 0 };

  const layout = () => {
    const vw = stage.clientWidth;
    // still: the stage is three bands tall; the photos fill one screen-high band each
    const vh = still ? landingWrap.clientHeight : stage.clientHeight;
    const dpr = window.devicePixelRatio;
    // Phones fire resize whenever the toolbar slides in or out, but the svh stage keeps its size:
    // skip, or every scroll flick would reallocate (and blank) the fog and depth canvases.
    if (vw === L.vw && vh === L.vh && dpr === L.dpr) return;
    L = { vw, vh, dpr };
    overlook.layout(vw, vh);
    fogHigh.resize();
    fogLow.resize();
    depth.resize(vw, vh);
  };

  // ---------- render: the only place that writes to the DOM ----------
  const render = () => {
    const m = motionScale();
    // hidden under a fully landed trail, except in the still layout, where both photos show
    overlook.render({ dive: state.dive * m, pan: state.pan * m, x: pointer.x * m, y: pointer.y * m }, !still && state.landing >= 1);

    heroCopy.style.opacity = String(1 - state.heroOut);
    heroCopy.style.visibility = state.heroOut >= 1 ? 'hidden' : ''; // faded out: the trail sign can't be clicked or tabbed to
    heroCopy.style.transform = `translate3d(0, ${state.heroY * m}px, 0)`;
    cue.style.opacity = String(1 - state.heroOut);
    capFog.style.opacity = String(state.capFog);
    whiteout.style.opacity = String(state.whiteout);

    landingWrap.style.opacity = String(state.landing);
    const s = m ? lerp(1.35, LANDED_ZOOM, state.land) : 1;
    if (depth.active) {
      // Settling onto the trail: the camera sinks and eases back, so the near ferns move more than the far trees.
      const rise = (1 - state.land) * m;
      if (state.landing > 0)
        depth.draw({
          zoom: s,
          dolly: 0.18 * rise,
          x: pointer.x * -14 * m,
          y: rise * 0.08 * L.vh + pointer.y * -8 * m,
        });
    } else {
      landing.style.transform = `scale(${s}) translate3d(${pointer.x * -6 * m}px, ${pointer.y * -4 * m}px, 0)`;
    }
    capLanding.style.opacity = String(state.capLanding);

    fogHigh.density = state.fogHigh;
    fogHigh.rush = state.rush * 1.6 * m;
    fogLow.density = state.fogLow;
    for (const f of [fogHigh, fogLow]) {
      f.offsetX = pointer.x * m;
      f.offsetY = pointer.y * m;
    }
  };

  // ---------- timeline: the only place that knows about timing (total duration = 1) ----------
  // Still: every layer at its readable state at once, in its own band.
  if (still) Object.assign(state, { capFog: 1, whiteout: 1, landing: 1, land: 1, fogLow: 0.12, capLanding: 1 });
  const tl = still
    ? null
    : gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          pin: stage,
          start: 'top top',
          // a function, so ScrollTrigger.refresh() picks up a new length
          end: () => `+=${(tuning.scroll + tuning.run.reveal) * 100}%`,
          scrub: 0.6,
          onUpdate: (self) => opts.onProgress?.(self.progress),
        },
      });

  tl?.to(state, { heroY: -160, duration: 1 }, 0)
    .to(state, { heroOut: 1, duration: 0.13, ease: 'power1.in' }, 0.03)
    .to(state, { pan: 1, duration: 0.46, ease: 'power1.inOut' }, 0.04)
    .to(state, { dive: 1, duration: 0.56, ease: 'power2.in' }, 0.06)
    .to(state, { fogHigh: 1.9, duration: 0.32, ease: 'power1.inOut' }, 0.28)
    .to(state, { rush: 1, duration: 0.36, ease: 'power1.inOut' }, 0.3)
    .to(state, { capFog: 1, duration: 0.1 }, 0.3)
    .to(state, { capFog: 0, duration: 0.08 }, 0.5)
    .to(state, { whiteout: 1, duration: 0.14, ease: 'power1.inOut' }, 0.5)
    .to(state, { fogLow: 1.82, duration: 0.06, ease: 'power1.in' }, 0.56)
    .to(state, { landing: 1, duration: 0.16, ease: 'power1.inOut' }, 0.62)
    .to(state, { land: 1, duration: 0.38, ease: 'power2.out' }, 0.62)
    .to(state, { fogLow: 0.12, duration: 0.3, ease: 'power1.inOut' }, 0.66)
    .to(state, { capLanding: 1, duration: 0.09 }, 0.86);
  // the hand-off hold, as long (in the timeline's units, 1 = the descent) as the run's reveal is in scroll
  const holdLength = () => tuning.run.reveal / tuning.scroll;
  const hold = tl?.to({}, { duration: holdLength() }, 1);
  // the caption steps aside as the ring starts, before its fog reaches the words
  tl?.to(state, { capLanding: 0, duration: 0.05, ease: 'power1.in' }, 1);
  const onRefreshInit = () => hold?.duration(holdLength());
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit);

  // ---------- loop: render every frame (pointer parallax) and draw fog while visible ----------
  // Visibility comes from an observer so the ticker never forces a layout read.
  let visible = true;
  const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
  observer.observe(stage);

  let lastProgress = -1;
  const tick = (time: number) => {
    if (!visible) return;
    render();
    const p = tl?.time() ?? 0; // 0–1 through the descent, then on through the hold
    grain.update(p !== lastProgress && !still, time); // fresh grain only while scrolling
    lastProgress = p;
    const t = still ? 0 : time;
    // Timeline time, not scroll progress: with scrub lag, the scroll runs ahead of the whiteout.
    if (p < 0.72) fogHigh.draw(t);
    else fogHigh.clear();
    fogLow.draw(t * 0.8);
  };

  const onResize = () => {
    layout();
    render();
  };

  layout();
  render();
  gsap.ticker.add(tick);
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      gsap.ticker.remove(tick);
      observer.disconnect();
      depth.destroy();
      fogHigh.destroy();
      fogLow.destroy();
      overlook.destroy();
      grain.destroy();
      window.removeEventListener('resize', onResize);
      ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
      tl?.scrollTrigger?.kill();
      tl?.kill();
      root.classList.remove('still');
    },
  };
}
