import { gsap } from './scroll';

/** Frames per window: about a second. */
const WINDOW = 60;
/** A window whose middle frame took longer than this (ms) is slow: under ~45 fps. */
const SLOW_MS = 22;
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
  let slow = 0;
  const sample = (_: number, delta: number) => {
    if (document.hidden || delta > 250) return; // a hidden tab, or the first frame back
    frames.push(delta);
    if (frames.length < WINDOW) return;
    const middle = frames.sort((a, b) => a - b)[WINDOW >> 1];
    frames.length = 0;
    slow = middle > SLOW_MS ? slow + 1 : 0;
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
