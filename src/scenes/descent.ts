import { gsap, ScrollTrigger } from '../core/scroll';
import { clamp, lerp } from '../core/math';
import { motionScale, prefersReducedMotion } from '../core/motion';
import { pointer } from '../core/pointer';
import { Fog } from '../effects/fog';
import { site } from '../content/site';
import type { SceneHandle } from './types';

/**
 * Descent: overlook → dive into the valley fog → whiteout → land on the trail.
 *
 *   progress  0 ──── 0.16 ──── 0.4 ──── 0.62 ──── 0.78 ──── 0.95 ── 1
 *             hero out   dive & fog thicken  whiteout   trail resolves  caption
 */
export function createDescentScene(opts: { onProgress?: (p: number) => void } = {}): SceneHandle | null {
  const root = document.querySelector<HTMLElement>('[data-scene="descent"]');
  if (!root) return null;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const stage = $('[data-stage]');
  const overlook = $<HTMLImageElement>('[data-layer="overlook"]');
  const landingWrap = $('[data-layer="landing-wrap"]');
  const landing = $<HTMLImageElement>('[data-layer="landing"]');
  const whiteout = $('[data-layer="whiteout"]');
  const heroCopy = $('[data-layer="hero"]');
  const capFog = $('[data-layer="cap-fog"]');
  const capLanding = $('[data-layer="cap-landing"]');

  const fogHigh = new Fog($<HTMLCanvasElement>('[data-fog="high"]'), {
    count: 30,
    tint: '--fog-high',
    yMin: 0.3,
  });
  const fogLow = new Fog($<HTMLCanvasElement>('[data-fog="low"]'), {
    count: 22,
    tint: '--fog-low',
    yMin: 0,
  });

  const { width: OW, height: OH } = site.descent.overlook;
  const T = site.descent.diveTarget;
  const S = site.descent.startFocus;
  const ZMAX = site.descent.diveZoom;
  const F = site.descent.landingFocus;
  landing.style.transformOrigin = `${F.x}% ${F.y}%`;
  landing.style.objectPosition = `${F.x}% ${F.y}%`;

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

  // ---------- layout: size the overlook so it always covers the stage ----------
  const ASPECT = OW / OH;
  let L = { vw: 0, vh: 0, w: 0, h: 0 };

  const layout = () => {
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    const cover = vw / vh > ASPECT;
    const w = cover ? vw : vh * ASPECT;
    const h = cover ? vw / ASPECT : vh;
    overlook.style.width = `${w}px`;
    overlook.style.height = `${h}px`;
    overlook.style.transformOrigin = `${T.x * w}px ${T.y * h}px`;
    L = { vw, vh, w, h };
    fogHigh.resize();
    fogLow.resize();
  };

  /** Position the overlook at zoom z, panning toward the dive target, never revealing an edge. */
  const placeOverlook = (z: number, pan: number, ox: number, oy: number) => {
    const { vw, vh, w, h } = L;
    const ax = T.x * w;
    const ay = T.y * h;
    const startL = clamp(vw / 2 - S.x * w, vw - w, 0);
    const startT = clamp(vh / 2 - S.y * h, vh - h, 0);
    const left = clamp(lerp(startL, vw / 2 - ax, pan) + ox, vw - ax - (w - ax) * z, ax * (z - 1));
    const top = clamp(lerp(startT, vh / 2 - ay, pan) + oy, vh - ay - (h - ay) * z, ay * (z - 1));
    overlook.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${z})`;
  };

  // ---------- render: the only place that writes to the DOM ----------
  const render = () => {
    const m = motionScale();
    const z = 1 + (ZMAX - 1) * state.dive * m;
    placeOverlook(z, state.pan * m, pointer.x * -12 * m, pointer.y * -6 * m);

    heroCopy.style.opacity = String(1 - state.heroOut);
    heroCopy.style.transform = `translate3d(0, ${state.heroY * m}px, 0)`;
    capFog.style.opacity = String(state.capFog);
    whiteout.style.opacity = String(state.whiteout);

    landingWrap.style.opacity = String(state.landing);
    const s = m ? lerp(1.35, 1.02, state.land) : 1;
    landing.style.transform = `scale(${s}) translate3d(${pointer.x * -6 * m}px, ${pointer.y * -4 * m}px, 0)`;
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
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: root,
      pin: stage,
      start: 'top top',
      end: '+=320%',
      scrub: prefersReducedMotion() ? true : 0.6,
      onUpdate: (self) => opts.onProgress?.(self.progress),
    },
  });

  tl.to(state, { heroY: -160, duration: 1 }, 0)
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

  // ---------- loop: render every frame (pointer parallax) and draw fog while visible ----------
  // Visibility comes from an observer so the ticker never forces a layout read.
  let visible = true;
  const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
  observer.observe(stage);

  const tick = (time: number) => {
    if (!visible) return;
    render();
    const t = prefersReducedMotion() ? 0 : time;
    // Timeline progress, not scroll progress: with scrub lag, the scroll runs ahead of the whiteout.
    if (tl.progress() < 0.72) fogHigh.draw(t);
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
  overlook.decode?.().then(() => ScrollTrigger.refresh()).catch(() => {});

  return {
    destroy() {
      gsap.ticker.remove(tick);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      tl.scrollTrigger?.kill();
      tl.kill();
    },
  };
}
