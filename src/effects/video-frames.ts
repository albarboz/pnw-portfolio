import { Input, MP4, VideoSampleSink, type VideoSample } from 'mediabunny';
import { StreamedFile } from './stream-source';

/** Memory for decoded frames: as many as fit (10–20), enough to scrub back a little without decoding again. */
const POOL_BYTES = 64e6;
/** Frames decoded ahead of the wanted one while scrolling forward. */
const AHEAD = 8;
/**
 * A wanted frame at most this far past the decoder keeps it running; further, it seeks, which decodes from the
 * keyframe before it: at most 24 frames (tools/run-video.py), so past that a seek is no dearer.
 */
const JUMP = 24;
/**
 * No frame from the decoder for this long while it holds frames for us: it has run out of memory for new ones
 * (some decoders only have a few), so the frames get copied out (`useCopies()`) and it carries on.
 */
const STALL_MS = 1000;

interface Slot {
  index: number;
  /** The decoder's own frame, uploaded as is: on an iPhone 1 ms, against 28 ms for the same frame from a canvas. */
  frame: VideoFrame | null;
  /** The frame drawn into a canvas, which hands the decoder its memory back (see `useCopies()`). */
  canvas: HTMLCanvasElement | null;
}

/** A decoded frame to upload, and its size in pixels. */
export interface Frame {
  source: TexImageSource;
  width: number;
  height: number;
}

/**
 * A video's frames, any one on request, for scrubbing by scroll. WebCodecs (through mediabunny) decodes into a
 * small ring of frames around the wanted one (the decoder's own, or copies in canvases: `useCopies()`): forward
 * it keeps decoding a few frames ahead; backward it decodes from a little before the frame (from the keyframe
 * before that: at most 24 frames, see tools/run-video.py), so the next steps back are already there. A normally
 * compressed file then scrubs like one with a keyframe on every frame, at a fraction of the size.
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
  private direct = 'VideoFrame' in window;

  private constructor(
    private file: StreamedFile,
    private input: Input,
    private sink: VideoSampleSink,
    private first: number,
    readonly fps: number,
    readonly count: number,
    readonly width: number,
    readonly height: number,
  ) {
    this.pool = Math.round(Math.min(20, Math.max(10, POOL_BYTES / (width * height * 4))));
    for (let i = 0; i < this.pool; i++) this.ring.push({ index: -1, frame: null, canvas: null });
    void this.pump();
  }

  /**
   * Downloads the whole file (src/effects/stream-source.ts), then decodes on request. Not before: frames could
   * decode as their bytes arrive, but a scroll that ran ahead of the download would freeze the film on a frame
   * until it caught up, and until then the trail photo, which is the film's first frame, shows anyway. Copies in
   * canvases (`useCopies()`) are kept no bigger than a `view` (CSS px) filled by cover at `dpr` device pixels per
   * CSS px needs.
   */
  static async open(url: string, view: { w: number; h: number; dpr: number }): Promise<VideoFrames | null> {
    if (!('VideoDecoder' in window)) return null;
    let file: StreamedFile | null = null;
    let input: Input | null = null;
    try {
      file = await StreamedFile.open(url);
      if (!file) return null;
      await file.complete;
      input = new Input({ formats: [MP4], source: file.source() });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error('cannot decode');
      const [stats, first] = await Promise.all([track.computePacketStats(), track.getFirstTimestamp()]);
      const cover = Math.max(view.w / track.displayWidth, view.h / track.displayHeight);
      const scale = Math.min(1, cover * view.dpr);
      const w = Math.round(track.displayWidth * scale);
      const h = Math.round(track.displayHeight * scale);
      return new VideoFrames(file, input, new VideoSampleSink(track), first, stats.averagePacketRate, stats.packetCount, w, h);
    } catch {
      input?.dispose();
      file?.dispose();
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
  take(): Frame | null {
    let best: Slot | null = null;
    for (const s of this.ring) {
      if (s.index < 0) continue;
      if (!best || Math.abs(s.index - this.target) < Math.abs(best.index - this.target)) best = s;
    }
    if (!best || best.index === this.shown) return null;
    this.shown = best.index;
    if (best.frame) return { source: best.frame, width: best.frame.displayWidth, height: best.frame.displayHeight };
    return { source: best.canvas!, width: this.width, height: this.height };
  }

  /**
   * Keep copies in canvases from now on, not the decoder's frames: for a browser that can't upload a VideoFrame,
   * or a decoder that stalls while frames are held. The frames held now are copied too, and `take()` hands the one
   * showing over again.
   */
  useCopies() {
    if (!this.direct) return;
    this.direct = false;
    for (const s of this.ring) {
      if (!s.frame) continue;
      this.ctx(s).drawImage(s.frame, 0, 0, this.width, this.height);
      s.frame.close();
      s.frame = null;
    }
    this.shown = -1;
  }

  destroy() {
    this.dead = true;
    this.wake?.();
    this.input.dispose();
    this.file.dispose();
    for (const s of this.ring) {
      s.frame?.close();
      if (s.canvas) s.canvas.width = s.canvas.height = 0; // let the browser drop the pixels now
    }
  }

  /** The slot's canvas, made on first use. */
  private ctx(slot: Slot) {
    slot.canvas ??= Object.assign(document.createElement('canvas'), { width: this.width, height: this.height });
    return slot.canvas.getContext('2d', { alpha: false })!;
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
    slot.frame?.close();
    slot.frame = null;
    if (this.direct) slot.frame = sample.toVideoFrame();
    else sample.draw(this.ctx(slot), 0, 0, this.width, this.height);
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
        const r = await this.decoded(it);
        if (r.done) {
          it = null; // past the last frame: wait for the next request rather than retry
          await new Promise<void>((res) => (this.wake = res));
          this.wake = null;
          continue;
        }
        if (!this.dead) at = this.store(r.value);
        r.value.close();
      } catch {
        it = null; // a decoder or download error: start over at the next request, not at once (it'd spin)
        at = -1;
        await new Promise<void>((res) => (this.wake = res));
        this.wake = null;
      }
    }
    await it?.return();
  }

  /** The decoder's next frame; if it stalls while we hold its frames, they're copied out to let it go on. */
  private async decoded(it: AsyncGenerator<VideoSample, void, unknown>) {
    const next = it.next();
    if (!this.direct) return next;
    let timer = 0;
    const stalled = new Promise<null>((r) => (timer = window.setTimeout(() => r(null), STALL_MS)));
    const r = await Promise.race([next, stalled]);
    clearTimeout(timer);
    if (r) return r;
    if (!document.hidden && this.ring.some((s) => s.frame)) this.useCopies(); // a hidden page's decoder may just pause
    return next;
  }
}
