import { clamp, lerp, smoothstep } from './math';

const SAMPLES = 512;

/** A section over the film. Positions are scroll offsets: where its top / bottom edge is at the top of the screen. */
export interface PaceBlock {
  top: number;
  bottom: number;
  /** The film's speed while the block fills the screen, as a share of its speed in the open (0 = it stops). */
  speed: number;
  /** Whether the film steps aside for it: shaded on the text's side, the runner moved out of the way. */
  aside: boolean;
}

export interface Pace {
  /** Film progress (0–1) at scroll position `y`. */
  time(y: number): number;
  /** How much a block the film steps aside for fills the screen at `y` (0–1). */
  aside(y: number): number;
}

/**
 * Pace of a scroll-scrubbed film with sections passing over it: through the open gaps it runs at full speed, under
 * each section at that section's speed, eased in and out as the section comes and goes, so it still ends at `end`
 * (or earlier, if the last section stops it: then it holds the last frame there).
 * It holds its first frame for the first `hold` px of scroll, then sets off, easing up to speed over half as far again.
 * `vh` is the screen height.
 */
export function buildPace(start: number, end: number, vh: number, blocks: PaceBlock[], hold = 0): Pace {
  const span = Math.max(1, end - start);
  const aside = new Float32Array(SAMPLES + 1);
  const time = new Float32Array(SAMPLES + 1);
  let lastSpeed = 1;
  for (let i = 0; i <= SAMPLES; i++) {
    const y = start + (span * i) / SAMPLES;
    let speed = 1;
    let a = 0;
    for (const b of blocks) {
      // share of the screen (or of the block, if it's shorter) the block covers
      const overlap = Math.min(b.bottom, y + vh) - Math.max(b.top, y);
      const cover = smoothstep(0.3, 0.8, overlap / Math.min(vh, b.bottom - b.top));
      speed = Math.min(speed, lerp(1, b.speed, cover));
      if (b.aside) a = Math.max(a, cover);
    }
    aside[i] = a;
    const moving = hold > 0 ? smoothstep(start + hold, start + hold * 1.5, y) : 1;
    if (i > 0) time[i] = time[i - 1] + (speed + lastSpeed) * 0.5 * moving;
    lastSpeed = speed;
  }
  const total = time[SAMPLES] || 1;
  for (let i = 0; i <= SAMPLES; i++) time[i] /= total;

  const at = (table: Float32Array, y: number) => {
    const f = clamp((y - start) / span, 0, 1) * SAMPLES;
    const i = Math.min(SAMPLES - 1, Math.floor(f));
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  };
  return { time: (y) => at(time, y), aside: (y) => at(aside, y) };
}
