import { gsap, ScrollTrigger } from '../core/scroll';
import { afterHero } from '../core/after-hero';
import { haptic } from '../core/haptics';
import { clamp, smoothstep } from '../core/math';
import { prefersReducedMotion } from '../core/motion';
import { buildPace, type Pace } from '../core/pace';
import { quality, saveData } from '../core/quality';
import { tuning } from '../core/tuning';
import { site } from '../content/site';
import { loadFilmDepth } from '../effects/film-depth';
import { Grain } from '../effects/grain';
import { RUN_STILL_UNTIL, RunView } from '../effects/run-view';
import { LANDED_ZOOM } from './descent';
import { type Player, videoPlayer, WebglPlayer } from '../effects/run-players';
import type { SceneHandle } from './types';

/**
 * Trail run: the filmed run behind the sections, to the end of the page. Its stage sticks to the screen for the
 * whole wrapper. It rises (clear) over the end of the descent and, while the descent holds on the trail photo, opens
 * the film over it in a ring of fog from the runner (the film's first frame is that photo). Then the scroll runs the
 * film at full pace through the open trail between the sections, and each section sets its own pace ([data-run],
 * src/core/pace.ts): About reads over it (the film slows, steps aside: the runner moves away from the text and the
 * text's side is shaded), Work rises over it as a sheet (the film stops behind it), and Contact is the arrival (the
 * film runs out and holds its last frame, stepped aside, under the closing screen).
 *
 *   scroll  sticks ── reveal ── gap ── About (slow, aside) ── gap ── Work (sheet: stops) ── gap ── Contact (holds)
 *           (over the descent's hold)
 *
 * The film loads once the dive starts. Reduced motion: no film; a still from it above the sections.
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
  const scrim = $('[data-layer="scrim"]');
  const gaps = [...root.querySelectorAll<HTMLElement>('[data-run-gap]')];
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-run]')];
  const R = site.run;
  /** The film's crop: the trail photo's, so the first frame lands on it. */
  const F = site.descent.landingFocus;

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

  // Phones tap as the scroll carries one of the runner's footfalls past, either way; at most one tap at a time, so a
  // fast flick through a dozen of them is a few taps, not a buzz.
  let lastT = -1;
  let lastTap = 0;
  const footfalls = (t: number) => {
    const [a, b] = [Math.min(lastT, t), Math.max(lastT, t)];
    const crossed = lastT >= 0 && R.footfalls.some((f) => f > a && f <= b);
    lastT = t;
    if (!crossed || !tuning.run.steps || performance.now() - lastTap < 150) return;
    lastTap = performance.now();
    haptic('step');
  };

  // ---------- render: the only place that writes to the DOM ----------
  let player: Player | null = null;
  let pace: Pace | null = null;
  let lastY = -1;
  const render = () => {
    const st = tl.scrollTrigger;
    if (!st || !pace) return;
    const y = st.start + state.p * (st.end - st.start);
    const reveal = clamp((y - st.start) / Math.max(1, reach), 0, 1);
    const aside = pace.aside(y);
    fx.style.opacity = String(smoothstep(0.1, 0.7, reveal));
    scrim.style.opacity = String(aside * tuning.run.dim);
    const t = pace.time(y);
    if (reveal >= 1) footfalls(t);
    player?.show(t, reveal, aside);
    grain.update(y !== lastY, performance.now() / 1000);
    lastY = y;
  };

  // ---------- timeline: scroll through the whole wrapper; the pace map turns it into film time ----------
  // No onUpdate: the timeline moves on every scroll event, and iOS fires several a frame. Drawing in each one sent the
  // film's frame to the GPU two to four times a frame (35–107 ms per event on an iPhone); the ticker draws once.
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: true },
  });
  tl.to(state, { p: 1, duration: 1 });
  // where each section is, in scroll positions: from its top at the top of the screen to its bottom there
  const marks = blocks.map((el) => ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom top' }));
  const measure = () => {
    const st = tl.scrollTrigger!;
    const spans = marks.map((m, i) => {
      const role = blocks[i].dataset.run;
      return { top: m.start, bottom: m.end, speed: role === 'read' ? tuning.run.slow : 0, aside: role !== 'sheet' };
    });
    pace = buildPace(st.start, st.end, window.innerHeight, spans, reach * RUN_STILL_UNTIL);
    render();
  };
  ScrollTrigger.addEventListener('refreshInit', layout);
  ScrollTrigger.addEventListener('refresh', measure);
  measure();

  // ---------- players ----------
  const plain = (): Player => {
    canvas.hidden = true;
    return videoPlayer(video, R, render);
  };

  // A screen held upright shows only a slice of the film around the runner: it gets that slice, made sharper.
  const upright = () => stage.clientWidth / stage.clientHeight < 0.8;
  let dead = false;
  let webgl: WebglPlayer | null = null;
  let filmUpright: boolean | null = null;
  let loading = 0;
  /** Fetch and open the film for the screen's shape; the one showing stays until it's ready. */
  const loadFilm = async () => {
    const ticket = ++loading;
    const up = upright();
    filmUpright = up;
    // saving data: the small fallback file (1.9 MB, not 4.6–8), in the HQ film's framing, for either shape
    const film = saveData() ? { video: R.fallback, align: R.align } : up ? R.phone : R;
    // the decoder (mediabunny) loads only now, so it never weighs on the first paint
    const { VideoFrames } = await import('../effects/video-frames');
    const view = { w: stage.clientWidth, h: stage.clientHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) };
    const frames = await VideoFrames.open(film.video, view);
    if (dead || ticket !== loading || !webgl) return frames?.destroy();
    if (frames) {
      webgl.film(frames, film.align);
      render();
    } else if (!webgl.hasFilm) {
      webgl.destroy(); // can't decode it here: the plain video takes over
      webgl = null;
      player = plain();
    }
  };

  const start = async () => {
    if ((await quality) > 0) {
      const L = site.descent.landing;
      const place = {
        photo: { width: L.width, height: L.height },
        focus: { x: F.x / 100, y: F.y / 100 },
        zoom: LANDED_ZOOM,
        // the HQ film's frame (the still is one of its frames, so it has its shape)
        film: { ...R.align, aspect: R.still.width / R.still.height },
      };
      const view = new RunView(canvas, place, () => {
        webgl?.destroy(); // context lost: the plain video takes over
        webgl = null;
        player = plain();
      });
      if (view.ok && !dead) {
        canvas.hidden = false;
        view.resize(stage.clientWidth, stage.clientHeight);
        player = webgl = new WebglPlayer(view, site.descent.landing.src);
        // the film's depth shapes the ring's edge; without it the ring stays plain
        void loadFilmDepth(R.depth.src).then((img) => img && !dead && view.depth(img, R.depth));
        return loadFilm();
      }
      view.destroy();
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

  // ---------- loop: the one place it draws, once a frame (also picks up frames decoded while the page is still) ----------
  let visible = false;
  const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
  seen.observe(stage);
  const tick = () => {
    if (visible) render();
  };
  gsap.ticker.add(tick);

  const onResize = () => {
    player?.resize(stage.clientWidth, stage.clientHeight);
    // turned between upright and wide: the other film (rare, so it's fetched only then)
    if (webgl && filmUpright !== null && upright() !== filmUpright) void loadFilm();
  };
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
      if (webgl && webgl !== player) webgl.destroy();
      grain.destroy();
      marks.forEach((m) => m.kill());
      tl.scrollTrigger?.kill();
      tl.kill();
      root.style.marginTop = '';
      gaps.forEach((g) => (g.style.height = ''));
    },
  };
}
