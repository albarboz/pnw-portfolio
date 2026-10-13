import { gsap } from '../core/scroll';
import { afterHero } from '../core/after-hero';
import { smoothstep } from '../core/math';
import { prefersReducedMotion } from '../core/motion';
import { tuning } from '../core/tuning';
import { site } from '../content/site';
import { Grain } from '../effects/grain';
import type { SceneHandle } from './types';

/**
 * Trail run: a filmed run down the trail, scrubbed by scroll. The stage scrolls in out of the night (its top
 * melting away as it reaches the top of the screen), pins, and the scroll plays the run frame by frame, forward
 * and back, still when the page is still. At the end the camera rests on a mossy trunk; the frame dims a little and
 * its bottom edge melts into the night, so it scrolls away with Contact rising out of the dark beneath it.
 *
 *   progress  0 ─────────────────────── 0.9 ──── 1
 *             the run, frame by frame      dim, bottom melts
 *
 * The poster loads after the hero, the video (~4 MB, a keyframe on every frame so any frame shows at once) when
 * the scene is within two screens. Reduced motion: no pin and no video; a still of the footbridge, melting into
 * the night at both edges.
 */
export function createRunScene(): SceneHandle | null {
  const root = document.querySelector<HTMLElement>('[data-scene="run"]');
  if (!root) return null;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const stage = $('[data-stage]');
  const video = $<HTMLVideoElement>('[data-layer="run-video"]');
  const still = $<HTMLImageElement>('[data-layer="run-still"]');
  const meltTop = $('[data-layer="melt-top"]');
  const meltBottom = $('[data-layer="melt-bottom"]');
  const night = $('[data-layer="night"]');
  const R = site.run;
  /** How dark the last frame gets as the run ends. */
  const DIM = 0.35;

  if (prefersReducedMotion()) {
    video.hidden = true;
    Object.assign(still, { src: R.still.src, alt: R.still.alt, width: R.still.width, height: R.still.height });
    still.hidden = false;
    meltBottom.style.opacity = '1';
    return { destroy() {} };
  }

  const grain = new Grain($('[data-layer="grain"]'));

  // ---------- state: the timelines tween these, render() reads them ----------
  const state = { enter: 0, t: 0, dark: 0, leave: 0 };

  // ---------- render: the only place that writes to the DOM ----------
  let shown = -1;
  const render = () => {
    // the top edge stays melted until the stage is nearly at the top, then clears for the run
    meltTop.style.opacity = String(1 - smoothstep(0.55, 1, state.enter));
    meltBottom.style.opacity = String(state.leave);
    night.style.opacity = String(state.dark);
    const d = video.duration;
    if (!d || video.readyState < 1) return;
    const time = Math.min(state.t * d, d - 0.05); // the very end can show a blank frame in some browsers
    if (Math.abs(time - shown) < 1 / 48) return; // half a frame: nothing new to show
    shown = time;
    video.currentTime = time;
  };

  // ---------- loading ----------
  afterHero.then(() => (video.poster = R.poster));
  const near = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      video.preload = 'auto';
      video.src = R.video;
      // iOS only paints a muted video's frames once it has played: play a moment, then hold.
      video.addEventListener(
        'loadeddata',
        () => {
          video
            .play()
            .then(() => video.pause())
            .catch(() => {})
            .finally(() => {
              shown = -1;
              render();
            });
        },
        { once: true },
      );
    },
    { rootMargin: '200% 0px' },
  );
  near.observe(root);

  // ---------- timelines: the only places that know about timing ----------
  const update = () => {
    render();
    grain.update(true, performance.now() / 1000);
  };
  // Scrolling in: the top edge melts out of the night as the stage rises to the top of the screen.
  const enter = gsap.to(state, {
    enter: 1,
    ease: 'none',
    scrollTrigger: { trigger: root, start: 'top bottom', end: 'top top', scrub: true },
    onUpdate: update,
  });
  // Pinned: the run, 1:1 with the scroll (Lenis already smooths it), then the frame sinks into the night.
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: root,
      pin: stage,
      start: 'top top',
      end: () => `+=${tuning.run.scroll * 100}%`, // a function, so ScrollTrigger.refresh() picks up a new length
      scrub: true,
    },
    onUpdate: update,
  });
  tl.to(state, { t: 1, duration: 0.9 }, 0)
    .to(state, { dark: DIM, duration: 0.14, ease: 'power1.inOut' }, 0.86)
    .to(state, { leave: 1, duration: 0.12, ease: 'power1.inOut' }, 0.88);

  grain.update(false, 0); // sets its strength
  render();

  return {
    destroy() {
      near.disconnect();
      grain.destroy();
      enter.scrollTrigger?.kill();
      enter.kill();
      tl.scrollTrigger?.kill();
      tl.kill();
    },
  };
}
