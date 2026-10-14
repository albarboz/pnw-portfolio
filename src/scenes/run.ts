import { gsap, ScrollTrigger } from '../core/scroll';
import { afterHero } from '../core/after-hero';
import { clamp, smoothstep } from '../core/math';
import { prefersReducedMotion } from '../core/motion';
import { buildPace, type Pace } from '../core/pace';
import { quality } from '../core/quality';
import { tuning } from '../core/tuning';
import { site } from '../content/site';
import { Grain } from '../effects/grain';
import { RunView } from '../effects/run-view';
import type { VideoFrames } from '../effects/video-frames';
import type { SceneHandle } from './types';

/** Draws the film: frame by frame through WebCodecs + WebGL, or a plain <video> where those aren't available. */
interface Player {
  show(t: number, reveal: number): void;
  resize(vw: number, vh: number): void;
  destroy(): void;
}

/**
 * Trail run: the filmed run behind About and Work. Its stage sticks to the screen for the whole wrapper. It rises
 * (clear) over the end of the descent and, while the descent holds on the trail photo, opens the film over it in a
 * ring of fog from the runner (the film's first frame is that photo). Then the scroll runs the film: slowly while
 * text fills the screen, dimmed under it, and at full pace through the open trail between the sections (src/core/
 * pace.ts). At the end the last frame dims, melts into the night and scrolls away above Contact.
 *
 *   scroll  sticks ── reveal ── gap ── About (slow, dim) ── gap ── Work (slow, dim) ── gap, melt ── leaves
 *           (over the descent's hold)
 *
 * The film loads once the dive starts. Reduced motion: no film; a still from it above About and Work.
 */
export function createRunScene(): SceneHandle | null {
  const root = document.querySelector<HTMLElement>('[data-scene="run"]');
  if (!root) return null;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const stage = $('[data-stage]');
  const canvas = $<HTMLCanvasElement>('[data-layer="run-gl"]');
  const video = $<HTMLVideoElement>('[data-layer="run-video"]');
  const still = $<HTMLImageElement>('[data-layer="run-still"]');
  const fx = $('[data-layer="fx"]');
  const night = $('[data-layer="night"]');
  const melt = $('[data-layer="melt"]');
  const gaps = [...root.querySelectorAll<HTMLElement>('[data-run-gap]')];
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-run-read]')];
  const R = site.run;
  /** The film's crop: the trail photo's, so the first frame lands on it. */
  const F = site.descent.landingFocus;
  /** How dark the last frame gets as the run ends. */
  const END_DIM = 0.35;

  if (prefersReducedMotion()) {
    root.classList.add('still');
    Object.assign(still, { src: R.still.src, alt: R.still.alt, width: R.still.width, height: R.still.height });
    still.hidden = false;
    return { destroy: () => root.classList.remove('still') };
  }

  const grain = new Grain($('[data-layer="grain"]'));
  video.style.objectPosition = `${F.x}% ${F.y}%`;

  // ---------- layout: the overlap with the descent and the gaps, in px, before anything measures ----------
  let reach = 0; // scroll length of the reveal
  const layout = () => {
    const vh = window.innerHeight;
    reach = tuning.run.reveal * vh;
    // stuck on top of the descent's stage from the start of its hold, which is as long as the reveal
    root.style.marginTop = `${-(stage.offsetHeight + reach)}px`;
    gaps.forEach((g, i) => (g.style.height = `${(i === 0 ? reach : 0) + tuning.run.gap * vh}px`));
  };
  layout();

  // ---------- state: the timeline tweens this, render() reads it ----------
  const state = { p: 0 };

  // ---------- render: the only place that writes to the DOM ----------
  let player: Player | null = null;
  let pace: Pace | null = null;
  let lastY = -1;
  const render = () => {
    const st = tl.scrollTrigger;
    if (!st || !pace) return;
    const y = st.start + state.p * (st.end - st.start);
    const reveal = clamp((y - st.start) / Math.max(1, reach), 0, 1);
    const leave = smoothstep(st.end - 0.6 * window.innerHeight, st.end, y);
    fx.style.opacity = String(smoothstep(0.1, 0.7, reveal));
    night.style.opacity = String(Math.max(pace.read(y) * tuning.run.dim, leave * END_DIM));
    melt.style.opacity = String(leave);
    player?.show(pace.time(y), reveal);
    grain.update(y !== lastY, performance.now() / 1000);
    lastY = y;
  };

  // ---------- timeline: scroll through the whole wrapper; the pace map turns it into film time ----------
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: true },
    onUpdate: render,
  });
  tl.to(state, { p: 1, duration: 1 });
  // where each text block is, in scroll positions: from its top at the top of the screen to its bottom there
  const marks = blocks.map((el) => ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom top' }));
  const measure = () => {
    const st = tl.scrollTrigger!;
    const spans = marks.map((m) => ({ top: m.start, bottom: m.end }));
    pace = buildPace(st.start, st.end, window.innerHeight, spans, tuning.run.slow);
    render();
  };
  ScrollTrigger.addEventListener('refreshInit', layout);
  ScrollTrigger.addEventListener('refresh', measure);
  measure();

  // ---------- players ----------
  const plain = (): Player => {
    canvas.hidden = true;
    video.hidden = false;
    video.poster = R.poster;
    video.preload = 'auto';
    video.src = R.fallback;
    let shown = -1;
    // iOS only paints a muted video's frames once it has played: play a moment, then hold.
    video.addEventListener(
      'loadeddata',
      () => void video.play().then(() => video.pause()).catch(() => {}).finally(() => ((shown = -1), render())),
      { once: true },
    );
    return {
      show(t, reveal) {
        video.style.opacity = String(reveal);
        const d = video.duration;
        if (!d || video.readyState < 1) return;
        const time = Math.min(t * d, d - 0.05); // the very end can show a blank frame in some browsers
        if (Math.abs(time - shown) < 1 / 48) return; // half a frame: nothing new to show
        shown = time;
        video.currentTime = time;
      },
      resize() {},
      destroy() {
        video.removeAttribute('src');
        video.load();
      },
    };
  };

  const rich = (view: RunView, frames: VideoFrames): Player => ({
    show(t, reveal) {
      frames.want(t * (frames.count - 1));
      const frame = frames.take();
      if (frame) view.upload(frame);
      view.draw(reveal);
    },
    resize: (vw, vh) => view.resize(vw, vh),
    destroy() {
      frames.destroy();
      view.destroy();
    },
  });

  let dead = false;
  const start = async () => {
    if ((await quality) > 0) {
      const L = site.descent.landing;
      const place = { photo: { width: L.width, height: L.height }, focus: { x: F.x / 100, y: F.y / 100 }, align: R.align };
      const view = new RunView(canvas, place, () => {
        player?.destroy(); // context lost: the plain video takes over
        player = plain();
      });
      if (view.ok) {
        canvas.hidden = false;
        view.resize(stage.clientWidth, stage.clientHeight);
        // the poster (the first frame) holds the place until frames are decoded
        let framesIn = false;
        const poster = new Image();
        poster.src = R.poster;
        poster.decode().then(() => !framesIn && !dead && view.upload(poster), () => {});
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.ceil(Math.max(stage.clientWidth, stage.clientHeight * 16 / 9) * dpr);
        // the decoder (mediabunny) loads only now, so it never weighs on the first paint
        const { VideoFrames } = await import('../effects/video-frames');
        const frames = await VideoFrames.open(R.video, width);
        if (dead) return frames?.destroy(), view.destroy();
        if (frames) {
          framesIn = true;
          player = rich(view, frames);
          return render();
        }
        view.destroy();
      }
    }
    if (!dead) player = plain();
  };
  const near = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      void start();
    },
    { rootMargin: '200% 0px' },
  );
  afterHero.then(() => !dead && near.observe(root));

  // ---------- loop: pick up frames the decoder finishes while the page is still ----------
  let visible = false;
  const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
  seen.observe(stage);
  const tick = () => {
    if (visible) render();
  };
  gsap.ticker.add(tick);

  const onResize = () => player?.resize(stage.clientWidth, stage.clientHeight);
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      dead = true;
      gsap.ticker.remove(tick);
      window.removeEventListener('resize', onResize);
      ScrollTrigger.removeEventListener('refreshInit', layout);
      ScrollTrigger.removeEventListener('refresh', measure);
      near.disconnect();
      seen.disconnect();
      player?.destroy();
      grain.destroy();
      marks.forEach((m) => m.kill());
      tl.scrollTrigger?.kill();
      tl.kill();
      root.style.marginTop = '';
      gaps.forEach((g) => (g.style.height = ''));
    },
  };
}
