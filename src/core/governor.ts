import { gsap } from './scroll';

/**
 * Length of a window, in ms of frames. By time, not by count: a phone drawing 6 frames a second took 10 s to fill
 * a 60-frame window, so it struggled for 24 s before the first step down.
 */
const WINDOW_MS = 1000;
/** Fewest frames a window needs to say anything (its 10th percentile and middle). */
const MIN_FRAMES = 5;
/** A window is slow if its middle frame took longer than this (ms, under ~45 fps) … */
const SLOW_MS = 22;
/**
 * … and longer than this many times the screen's own pace (its fastest steady frames). An iPhone in Low Power Mode
 * runs every page at 30 fps: that's its pace, not a struggling GPU, and fewer pixels wouldn't make it faster.
 */
const OVER_PACE = 1.4;
/** Slow windows in a row before stepping down; one stutter (a photo decoding, three compiling) isn't enough. */
const PATIENCE = 2;
/** Share of the device pixel ratio at each step. */
const SCALES = [1, 0.75, 0.5];

const listeners = new Set<() => void>();

/**
 * The detect-gpu level (src/core/quality.ts) is a guess from the GPU's name; this watches how the frames actually
 * run. If they keep coming late (a phone hot, in battery saver, or slower than its name says), the WebGL layers
 * step down to fewer pixels: `shed.scale` of their usual pixel ratio, and from step 2 the lens drops stay dry.
 * It only ever steps down, so it never flips back and forth. Off when `?quality=` forces a level.
 */
export const shed = { step: 0, scale: 1 };

/** Calls `fit` whenever `shed.scale` drops, so the layer re-sizes its canvas. Returns the unsubscribe. */
export function onShed(fit: () => void): () => void {
  listeners.add(fit);
  return () => listeners.delete(fit);
}

export function startGovernor() {
  if (new URLSearchParams(location.search).has('quality')) return;
  const frames: number[] = [];
  let spent = 0; // ms of frames in this window
  let slow = 0;
  let pace = Infinity; // ms per frame when nothing holds the screen back: the 10th percentile, lowest seen
  const sample = (_: number, delta: number) => {
    if (document.hidden || delta > 250) return; // a hidden tab, or the first frame back
    frames.push(delta);
    spent += delta;
    if (spent < WINDOW_MS || frames.length < MIN_FRAMES) return;
    frames.sort((a, b) => a - b);
    pace = Math.min(pace, frames[Math.floor(frames.length * 0.1)]);
    const middle = frames[frames.length >> 1];
    frames.length = 0;
    spent = 0;
    slow = middle > SLOW_MS && middle > pace * OVER_PACE ? slow + 1 : 0;
    if (slow < PATIENCE) return;
    slow = 0;
    shed.step++;
    shed.scale = SCALES[shed.step];
    if (import.meta.env.DEV) console.info('[governor] frames run late: step', shed.step);
    listeners.forEach((fit) => fit());
    if (shed.step === SCALES.length - 1) gsap.ticker.remove(sample);
  };
  gsap.ticker.add(sample);
}
