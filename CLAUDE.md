# PNW Portfolio

An immersive, scroll-driven portfolio. The visitor starts at a Cascade valley overlook, dives into the river of fog below, and lands on a forest trail behind a runner; the portfolio sections live below. Atmosphere first, but it must stay fast, accessible and easy to change.

## Stack

- **Vite + TypeScript** (vanilla, no framework). Keep it that way unless the owner asks.
- **GSAP + ScrollTrigger** for every scroll-linked animation. GSAP is free for commercial use, including all plugins.
- **Lenis** for smooth scrolling, wired to ScrollTrigger in `src/core/scroll.ts`.
- **Three.js** for the shader fog (`src/effects/fog3d.ts`), loaded lazily by `src/effects/fog-layer.ts` so it never delays first paint; the Canvas 2D fog (`src/effects/fog.ts`) draws until it's in, and stays as the fallback without WebGL. Import three only from lazily loaded modules. The overlook dolly needs no 3D engine: flat cutouts facing the camera are drawn exactly by CSS transforms (`dolly()` in `src/effects/photo-layers.ts`). A small hand-written WebGL shader draws the 2.5D trail photo (`src/effects/depth-photo.ts`), with sun shafts baked once into a small texture (`src/effects/light-shafts.ts`).
- The overlook dive flies through the photo in 3D: the far and mid cutouts become relief meshes pushed back by their depth maps (`tools/layer-depth.py` → `src/effects/depth-layers.ts`, on three, loaded after the cutouts). At rest they draw exactly the flat cutouts; the near branches stay a CSS card above the fog, moved by the same camera (`src/effects/overlook.ts`). Without WebGL, or with reduced motion, the flat cutouts / photo stay.
- **Mediabunny** (pinned, MPL-2.0) decodes the trail run frame by frame with WebCodecs (`src/effects/video-frames.ts`), drawn by a small WebGL shader that also opens it from the trail photo in a ring of fog (`src/effects/run-view.ts`). Loaded lazily once the dive starts; without WebCodecs or WebGL a plain `<video>` scrubs the all-keyframe fallback. The fog ring's edge follows the film's depth (`tools/film-depth.py`, Video Depth Anything Small → `src/effects/film-depth.ts`; `tuning.run.depth`). The run's stage sticks behind About and Work (`src/scenes/run.ts`); its pace slows under text (`src/core/pace.ts`). Videos come from one master via `tools/run-video.py`, optionally filled in to a higher frame rate first by `tools/run-interpolate.py` (RIFE). Both films are upscaled by `tools/run-upscale.py` (Real-ESRGAN, shared code in `tools/esrgan.py`): wide screens get the whole frame at 1920×1080 (`trail-run-hq.mp4`), screens held upright a portrait slice (`trail-run-phone.mp4`).
- **raindrop-fx** (pinned 1.0.8, MIT, SardineFish) puts water on the lens as the camera lands on the trail (`src/effects/lens-drops.ts`, its own WebGL2 canvas under the low fog; `tuning.drops`): it condenses in the white-out, runs while the trail settles and dries before the film opens. Patched to keep the glass clear between drops (it would paint the photo itself); each drop bends the trail photo as framed at rest. Loaded lazily during the dive, quality 2 only; none with reduced motion.
- **@pmndrs/detect-gpu** (pinned) for quality levels (`src/core/quality.ts`): known-weak GPUs keep the flat cutouts and a lower-resolution shader fog (level 1), or get no WebGL at all (level 0); unknown GPUs keep everything. Its benchmark data is served from this site (`benchmarks()` in `vite.config.ts`). `?quality=0|1|2` forces a level. Headless Chrome's software WebGL counts as level 0, so force `?quality=2` when testing the 3D there.

Ask before adding any other dependency.

## Commands

- `npm run dev` – dev server at http://localhost:5173, with a **Tune** slider panel (top right) for the feel numbers
- `npm run build` – type-check, then production build to `dist/`
- `npm run typecheck` – types only
- `npm test` – build, then the Done checklist as Playwright tests in the installed Chrome (`tests/`): the whole page scrolled at 1440 px and 375 px, quality 0 and 2, reduced motion, console errors, sideways overflow, keyboard and axe (WCAG 2.2 AA). `npx playwright test` skips the build; `npx playwright show-report` shows the screenshots

Run `npm run build` after changes and fix all errors before calling a task done; run `npm test` before calling a visual or scroll change done.

## Layout

```
src/
  main.ts            boot: content → scroll → scenes → ui
  content/site.ts    ALL editable copy, projects, links, image paths
  core/              shared plumbing (scroll, pointer, motion prefs, math, tuning)
  effects/           reusable visual effects (fog layer: shader + canvas fallback, depth photo, photo layers)
  scenes/            one file per pinned scroll scene
  ui/                small DOM widgets (trail sign, reveals, copy button, project list)
  dev/               dev-only tools (Tweakpane tuning panel); stripped from the build
  styles/            tokens.css → base.css → sections.css
public/images/       photos (credit every one in docs/ASSET-CREDITS.md)
docs/                roadmap, asset credits, scene recipe
tools/               optional Python asset scripts (depth maps, hero layers); not part of the build
```

## How scenes work

Each scene in `src/scenes/` exports `create<Name>Scene(): SceneHandle` and follows the same pattern:

1. Find its DOM in `index.html` by `data-scene="<name>"`.
2. Keep a plain `state` object (numbers only: `dive`, `fog`, `land` …).
3. Build ONE `gsap.timeline` with a ScrollTrigger (`pin`, `scrub`) that tweens `state`, never the DOM directly.
4. A single `render()` reads `state` and writes transforms/opacity. Canvas effects draw from `gsap.ticker`.
5. Return `{ destroy }` that kills the timeline, ticker callbacks and listeners.

This keeps the timing (timeline) separate from the drawing (render), so timing can be retuned without touching the math.

**ScrollTrigger order matters:** pinned scenes add scroll space, so create triggers in page order. Anything that measures positions below a pinned scene (like the reveals) must be created after the scenes in `main.ts`. Copy `docs/SCENE-RECIPE.md` to start a new scene, and register it in `src/scenes/index.ts`.

## Rules

- **Content lives in `src/content/site.ts`.** Never hard-code names, project copy or image paths in scenes or HTML.
- **Reduced motion:** check `prefersReducedMotion()` from `src/core/motion.ts`. Scenes must still show every piece of content as a still, readable layout.
- **Performance:** animate only `transform` and `opacity`. Fog canvases render at ≤ 0.35× resolution. Hero images ≤ 400 KB as JPEG/WebP, ≥ 2000 px on the long side. The overlook is 1792 px wide; the deep zoom (`diveZoom` 4.5) stays sharp only inside the 2× `detail` patch of the valley (`tools/detail-patch.py`), so re-run that tool if the dive target moves or the far layer changes.
- **No horizontal scroll at 375 px wide.** Test phone width for every scene.
- **Styles:** colors and fonts only from tokens in `src/styles/tokens.css`. No inline colors in TS.
- **Assets:** every image gets a row in `docs/ASSET-CREDITS.md` with source and license. The current images are AI-generated with Midjourney on a paid plan (see the credits file).
- **Feel numbers** (fog look, dive length, dolly depths) live in `src/core/tuning.ts` and are read live, so the dev panel can move them. Add new knobs there and to `src/dev/tune.ts`; never import `src/dev/` outside the `import.meta.env.DEV` check in `main.ts`.
- Keep files small. If a scene file passes ~250 lines, split helpers into `core/` or `effects/`.

## Done checklist

- `npm run build` passes
- `npm test` passes (covers scrolling at both widths, reduced motion, console errors and axe, but not how it looks: still check the screenshots)
- Scroll the whole page at desktop and 375 px widths
- Reduced motion on (OS setting) still reads correctly
- No console errors
