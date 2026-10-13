import { gsap } from './scroll';

/**
 * Smoothed mouse position in the range -1…1 on each axis (0 = center).
 * Touch input is ignored so phones don't jitter. Read `pointer.x` / `pointer.y` in render loops.
 */
export const pointer = { x: 0, y: 0 };

const target = { x: 0, y: 0 };

window.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse') return;
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  },
  { passive: true },
);

/** Share of the gap closed per frame at TUNED_FPS; scaled by elapsed time so every refresh rate feels the same. */
const EASE = 0.05;
/** Refresh rate of the screen EASE was tuned on. */
const TUNED_FPS = 60;

gsap.ticker.add(() => {
  const k = 1 - Math.pow(1 - EASE, gsap.ticker.deltaRatio(TUNED_FPS));
  pointer.x += (target.x - pointer.x) * k;
  pointer.y += (target.y - pointer.y) * k;
});
