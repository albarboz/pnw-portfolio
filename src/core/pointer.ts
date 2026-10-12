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

gsap.ticker.add(() => {
  pointer.x += (target.x - pointer.x) * 0.05;
  pointer.y += (target.y - pointer.y) * 0.05;
});
