# Scene recipe

Copy this into `src/scenes/<name>.ts`, rename, then register it in `src/scenes/index.ts`.

## 1. Markup in `index.html`

```html
<section class="scene" data-scene="harbor" aria-label="Harbor">
  <div class="stage" data-stage>
    <img data-layer="photo" src="" alt="" />
    <canvas data-fog></canvas>
  </div>
</section>
```

## 2. Scene module

```ts
import { gsap, ScrollTrigger } from '../core/scroll';
import { prefersReducedMotion } from '../core/motion';
import type { SceneHandle } from './types';

export function createHarborScene(): SceneHandle | null {
  const root = document.querySelector<HTMLElement>('[data-scene="harbor"]');
  if (!root) return null;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const photo = root.querySelector<HTMLImageElement>('[data-layer="photo"]')!;

  // 1. state: plain numbers the timeline tweens
  const state = { push: 0, fade: 0 };

  // 2. render: the only place that touches the DOM
  const render = () => {
    photo.style.transform = `scale(${1 + state.push * 0.3})`;
    photo.style.opacity = String(1 - state.fade);
  };

  // 3. timeline: the only place that knows about timing
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: root, pin: stage, start: 'top top', end: '+=200%', scrub: true },
    onUpdate: render,
  });
  tl.to(state, { push: 1, duration: 1 }).to(state, { fade: 1, duration: 0.3 }, 0.7);

  if (prefersReducedMotion()) tl.progress(0.5).scrollTrigger?.disable(false);
  render();

  return {
    destroy() {
      tl.scrollTrigger?.kill();
      tl.kill();
    },
  };
}
```

## Timeline tips

- Use `duration` as "share of the scroll distance". A timeline with total duration 1 maps 0 → 1 across `end`.
- Place tweens with the position parameter (`tl.to(..., 0.4)`) instead of chaining delays.
- Keep `ease: 'none'` on scrubbed tweens and shape motion inside `render()` if needed.
- Call `ScrollTrigger.refresh()` after images load if layout depends on their size.
