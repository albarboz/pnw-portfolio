import { smoothstep } from '../core/math';
import { tuning } from '../core/tuning';
import type { RunAlign, RunView } from './run-view';
import type { VideoFrames } from './video-frames';

/**
 * Draws the trail run at film progress `t` (0–1), opened `reveal` (0–1) over the trail photo, stepped `aside` (0–1)
 * for a section reading over it.
 */
export interface Player {
  show(t: number, reveal: number, aside: number): void;
  resize(vw: number, vh: number): void;
  destroy(): void;
}

/**
 * The film in WebGL (src/effects/run-view.ts): the trail photo from the start (already loaded, and the film's first
 * frame), so the ring never opens on nothing however slow the network; then the film, once `film()` hands over its
 * frames. Calling `film()` again swaps films (a phone turned between upright and wide).
 */
export class WebglPlayer implements Player {
  private frames: VideoFrames | null = null;
  private align: RunAlign = { x: 0, y: 0, w: 1 }; // the photo, laid on itself
  // how fast the film is being flicked through, in film frames per screen refresh (at 60 Hz), smoothed
  private speed = 0;
  private lastT = 0;
  private lastAt = 0;

  constructor(
    private view: RunView,
    photoSrc: string,
  ) {
    const photo = new Image();
    photo.src = photoSrc;
    photo.decode().then(
      () => {
        view.photo(photo);
        if (!this.frames) view.upload(photo, this.align);
      },
      () => {},
    );
  }

  get hasFilm() {
    return this.frames !== null;
  }

  film(frames: VideoFrames, align: RunAlign) {
    this.frames?.destroy();
    this.frames = frames;
    this.align = align;
  }

  show(t: number, reveal: number, aside: number) {
    const f = this.frames;
    let blur = 0;
    if (f) {
      f.want(t * (f.count - 1));
      const frame = f.take();
      if (frame) this.view.upload(frame, this.align);
      // eases toward the latest pace over ~0.1 s, so one long frame doesn't flash a blur
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastAt) / 1000);
      if (this.lastAt && dt > 0) {
        const rate = (Math.abs(t - this.lastT) * (f.count - 1)) / (dt * 60);
        this.speed += (rate - this.speed) * (1 - Math.exp(-dt / 0.1));
      }
      [this.lastT, this.lastAt] = [t, now];
      blur = smoothstep(tuning.run.blurFrom, tuning.run.blurFull, this.speed);
    }
    this.view.draw(reveal, aside, t, blur);
  }

  resize(vw: number, vh: number) {
    this.view.resize(vw, vh);
  }

  destroy() {
    this.frames?.destroy();
    this.view.destroy();
  }
}

/**
 * A plain <video> scrubbed by currentTime, for browsers without WebCodecs or WebGL: the all-keyframe fallback
 * file, which can show any frame at once. It fades in with the reveal. `onReady` asks for a redraw.
 */
export function videoPlayer(video: HTMLVideoElement, src: { fallback: string; poster: string }, onReady: () => void): Player {
  video.hidden = false;
  video.poster = src.poster;
  video.preload = 'auto';
  video.src = src.fallback;
  let shown = -1;
  // iOS only paints a muted video's frames once it has played: play a moment, then hold.
  video.addEventListener(
    'loadeddata',
    () => void video.play().then(() => video.pause()).catch(() => {}).finally(() => ((shown = -1), onReady())),
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
}
