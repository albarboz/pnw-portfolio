import { gsap } from '../core/scroll';

/** What the opening adds to the descent's own state while it plays; all 0 once it's over. */
export interface OpeningState {
  /** The white-out over everything, 0–1. */
  veil: number;
  /** Extra density on the valley fog. */
  fog: number;
  /** The fog streaming past the camera (rush), backward: from this down to 0. */
  rush: number;
  /** The camera's dive, settling from a little way in back to the overlook. */
  dive: number;
  /** The cloud banks in the white-out, receding as the camera pulls out of them. */
  drift: number;
}

/**
 * The opening: the page starts inside the cloud (the bookend to the dive into it), and pulls back out onto the
 * overlook. The white veil clears first, then the thick fog streams away and thins over the valley while the
 * camera settles, and the name rises as the air clears (index.html's head starts it all before the first paint
 * with the `opening` class: see `.opening` in sections.css). It waits for the overlook photo (at most 2.5 s), so it
 * never clears onto a blur. Scrolling, a key or a touch hurries it along. Only set up when the head script has
 * set the class (not with reduced motion).
 */
export function createOpening(photo: HTMLImageElement): { state: OpeningState; destroy: () => void } {
  const root = document.documentElement;
  const state: OpeningState = { veil: 0, fog: 0, rush: 0, dive: 0, drift: 0 };
  if (!root.classList.contains('opening')) return { state, destroy() {} };

  Object.assign(state, { veil: 1, fog: 1, rush: 0.9, dive: 0.07, drift: 0.6 });
  // While the photo loads, the banks inside the cloud drift slowly past, so the wait is already the cloud.
  const idle = gsap.to(state, { drift: 1.2, duration: 3, ease: 'sine.inOut' });
  const done = () => root.classList.remove('opening');
  // a paused timeline takes its start values when it plays, so it picks up wherever the drift has got to
  const tl = gsap
    .timeline({ paused: true, onStart: () => void idle.kill(), onComplete: done })
    .to(state, { veil: 0, duration: 1.6, ease: 'power2.inOut' }, 0)
    .to(state, { drift: 0, duration: 1.8, ease: 'power2.out' }, 0)
    .to(state, { rush: 0, duration: 3, ease: 'power3.out' }, 0)
    .to(state, { fog: 0, duration: 2.8, ease: 'power2.out' }, 0.3)
    .to(state, { dive: 0, duration: 3.6, ease: 'power2.out' }, 0) // exactly 0 at the end: the overlook's layers swap in at rest
    .call(done, [], 1.3); // the name rises (its CSS arrival, held until now) as the air clears

  const loaded = photo.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        photo.addEventListener('load', () => resolve(), { once: true });
        photo.addEventListener('error', () => resolve(), { once: true });
      });
  const ready = loaded.then(() => photo.decode()).catch(() => {});
  void Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]).then(() => tl.play());

  const hurry = () => {
    tl.timeScale(4);
    off();
  };
  const events = ['wheel', 'touchstart', 'keydown', 'scroll'] as const;
  const off = () => events.forEach((e) => removeEventListener(e, hurry));
  events.forEach((e) => addEventListener(e, hurry, { passive: true, once: true }));

  return {
    state,
    destroy() {
      off();
      idle.kill();
      tl.kill();
      done();
    },
  };
}
