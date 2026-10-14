import { clamp, smoothstep } from './math';

const SAMPLES = 512;

export interface Pace {
  /** Video progress (0–1) at scroll position `y`. */
  time(y: number): number;
  /** How much text is on screen at `y`: 0 = open trail, 1 = reading. */
  read(y: number): number;
}

/**
 * Pace of a scroll-scrubbed film with text passing over it: the film slows to `slow` (0–1) of its open-trail speed
 * while a text block fills the screen, and makes up the time in the gaps between, so it still ends at `end`.
 * It holds its first frame for the first `hold` px of scroll, then sets off, easing up to speed over half as far again.
 * Positions are scroll offsets: a block spans [top, bottom] in the scroll positions where its top / bottom edge
 * is at the top of the screen. `vh` is the screen height.
 */
export function buildPace(
  start: number,
  end: number,
  vh: number,
  blocks: { top: number; bottom: number }[],
  slow: number,
  hold = 0,
): Pace {
  const span = Math.max(1, end - start);
  const reading = new Float32Array(SAMPLES + 1);
  const time = new Float32Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i++) {
    const y = start + (span * i) / SAMPLES;
    let r = 0;
    for (const b of blocks) {
      // share of the screen (or of the block, if it's shorter) the block covers
      const overlap = Math.min(b.bottom, y + vh) - Math.max(b.top, y);
      r = Math.max(r, smoothstep(0.3, 0.8, overlap / Math.min(vh, b.bottom - b.top)));
    }
    reading[i] = r;
    const moving = hold > 0 ? smoothstep(start + hold, start + hold * 1.5, y) : 1;
    if (i > 0) time[i] = time[i - 1] + (1 - (1 - slow) * (r + reading[i - 1]) * 0.5) * moving;
  }
  const total = time[SAMPLES] || 1;
  for (let i = 0; i <= SAMPLES; i++) time[i] /= total;

  const at = (table: Float32Array, y: number) => {
    const f = clamp((y - start) / span, 0, 1) * SAMPLES;
    const i = Math.min(SAMPLES - 1, Math.floor(f));
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  };
  return { time: (y) => at(time, y), read: (y) => at(reading, y) };
}
