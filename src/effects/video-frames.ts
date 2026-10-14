import { BlobSource, Input, MP4, VideoSampleSink, type VideoSample } from 'mediabunny';

/** Memory for decoded frames: as many as fit (10–20), enough to scrub back a little without decoding again. */
const POOL_BYTES = 64e6;
/** Frames decoded ahead of the wanted one while scrolling forward. */
const AHEAD = 8;
/**
 * A wanted frame at most this far past the decoder keeps it running; further, it seeks, which decodes from the
 * keyframe before it: at most 24 frames (tools/run-video.py), so past that a seek is no dearer.
 */
const JUMP = 24;

interface Slot {
  index: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/**
 * A video's frames, any one on request, for scrubbing by scroll. WebCodecs (through mediabunny) decodes into a
 * small ring of canvases around the wanted frame: forward it keeps decoding a few frames ahead; backward it
 * decodes from a little before the frame (from the keyframe before that: at most 24 frames, see
 * tools/run-video.py), so the next steps back are already there. A normally compressed file then scrubs like one
 * with a keyframe on every frame, at a fraction of the size.
 * `open()` gives null when the browser can't decode the file; the caller falls back to a <video>.
 */
export class VideoFrames {
  private ring: Slot[] = [];
  private pool: number;
  private next = 0;
  private target = 0;
  private dir = 1;
  private shown = -1;
  private wake: (() => void) | null = null;
  private dead = false;

  private constructor(
    private input: Input,
    private sink: VideoSampleSink,
    private first: number,
    readonly fps: number,
    readonly count: number,
    readonly width: number,
    readonly height: number,
  ) {
    this.pool = Math.round(Math.min(20, Math.max(10, POOL_BYTES / (width * height * 4))));
    for (let i = 0; i < this.pool; i++) {
      const canvas = Object.assign(document.createElement('canvas'), { width, height });
      this.ring.push({ index: -1, canvas, ctx: canvas.getContext('2d', { alpha: false })! });
    }
    void this.pump();
  }

  /**
   * Fetches the whole file, then decodes on request. Frames are kept no bigger than a `view` (CSS px) filled by
   * cover at `dpr` device pixels per CSS px needs.
   */
  static async open(url: string, view: { w: number; h: number; dpr: number }): Promise<VideoFrames | null> {
    if (!('VideoDecoder' in window)) return null;
    let input: Input | null = null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      input = new Input({ formats: [MP4], source: new BlobSource(await res.blob()) });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error('cannot decode');
      const [stats, first] = await Promise.all([track.computePacketStats(), track.getFirstTimestamp()]);
      const cover = Math.max(view.w / track.displayWidth, view.h / track.displayHeight);
      const scale = Math.min(1, cover * view.dpr);
      const w = Math.round(track.displayWidth * scale);
      const h = Math.round(track.displayHeight * scale);
      return new VideoFrames(input, new VideoSampleSink(track), first, stats.averagePacketRate, stats.packetCount, w, h);
    } catch {
      input?.dispose();
      return null;
    }
  }

  /** Ask for frame `index` (0 … count − 1). Decoding catches up in the background. */
  want(index: number) {
    const i = Math.min(this.count - 1, Math.max(0, Math.round(index)));
    if (i === this.target) return;
    this.dir = i > this.target ? 1 : -1;
    this.target = i;
    this.wake?.();
  }

  /** The decoded frame nearest the wanted one, if it isn't the one this returned last time; otherwise null. */
  take(): HTMLCanvasElement | null {
    let best: Slot | null = null;
    for (const s of this.ring) {
      if (s.index < 0) continue;
      if (!best || Math.abs(s.index - this.target) < Math.abs(best.index - this.target)) best = s;
    }
    if (!best || best.index === this.shown) return null;
    this.shown = best.index;
    return best.canvas;
  }

  destroy() {
    this.dead = true;
    this.wake?.();
    this.input.dispose();
    for (const s of this.ring) s.canvas.width = s.canvas.height = 0; // let the browser drop the pixels now
  }

  private has(i: number) {
    return this.ring.some((s) => s.index === i);
  }

  /** The first frame still missing around the wanted one, in decode order, or -1 if all are in. */
  private missing() {
    const t = this.target;
    const [lo, hi] = this.dir < 0 ? [t - (this.pool - 4), t] : [t, t + AHEAD];
    for (let i = Math.max(0, lo); i <= Math.min(this.count - 1, hi); i++) if (!this.has(i)) return i;
    return -1;
  }

  private store(sample: VideoSample) {
    const index = Math.round((sample.timestamp - this.first) * this.fps);
    // Frames the decoder only passes through on its way to a frame further on are never shown: don't copy them
    // (on phones the copy costs more than the decode).
    if (index < this.target - (this.pool - 4) || this.has(index)) return index;
    const slot = this.ring[this.next];
    this.next = (this.next + 1) % this.pool;
    slot.index = index;
    sample.draw(slot.ctx, 0, 0, this.width, this.height);
    return index;
  }

  /** One frame per turn, re-reading what's wanted each time, so a jump redirects the decoder at once. */
  private async pump() {
    let it: AsyncGenerator<VideoSample, void, unknown> | null = null;
    let at = -1; // the last frame the running decoder gave
    while (!this.dead) {
      const need = this.missing();
      if (need < 0) {
        await new Promise<void>((r) => (this.wake = r));
        this.wake = null;
        continue;
      }
      if (!it || need <= at || need > at + JUMP) {
        await it?.return();
        // a hair past the frame's start, so rounding never lands on the frame before
        it = this.sink.samples(this.first + (need + 0.25) / this.fps);
        at = need - 1;
      }
      try {
        const r = await it.next();
        if (r.done) {
          it = null; // past the last frame: wait for the next request rather than retry
          await new Promise<void>((res) => (this.wake = res));
          this.wake = null;
          continue;
        }
        if (!this.dead) at = this.store(r.value);
        r.value.close();
      } catch {
        it = null; // a decoder error: start over from the next request
        at = -1;
      }
    }
    await it?.return();
  }
}
