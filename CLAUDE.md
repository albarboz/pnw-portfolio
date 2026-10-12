# PNW Portfolio

An immersive, scroll-driven portfolio. The visitor starts at a Cascade valley overlook, dives into the river of fog below, and lands on a forest trail behind a runner; the portfolio sections live below. Atmosphere first, but it must stay fast, accessible and easy to change.

## Stack

- **Vite + TypeScript** (vanilla, no framework). Keep it that way unless the owner asks.
- **GSAP + ScrollTrigger** for every scroll-linked animation. GSAP is free for commercial use, including all plugins.
- **Lenis** for smooth scrolling, wired to ScrollTrigger in `src/core/scroll.ts`.
- **Canvas 2D** for fog (`src/effects/fog.ts`). Three.js is planned for later (see `docs/ROADMAP.md`); do not add it until a scene actually needs it.

Ask before adding any other dependency.

## Commands

- `npm run dev` – dev server at http://localhost:5173
- `npm run build` – type-check, then production build to `dist/`
- `npm run typecheck` – types only

Run `npm run build` after changes and fix all errors before calling a task done.

## Layout

```
src/
  main.ts            boot: content → scroll → scenes → ui
  content/site.ts    ALL editable copy, projects, links, image paths
  core/              shared plumbing (scroll, pointer, motion prefs, math)
  effects/           reusable visual effects (fog, wind audio)
  scenes/            one file per pinned scroll scene
  ui/                small DOM widgets (altimeter, copy button, project list)
  styles/            tokens.css → base.css → sections.css
public/images/       photos (credit every one in docs/ASSET-CREDITS.md)
public/audio/        ambient audio (optional)
docs/                roadmap, asset credits, scene recipe
```

## How scenes work

Each scene in `src/scenes/` exports `create<Name>Scene(): SceneHandle` and follows the same pattern:

1. Find its DOM in `index.html` by `data-scene="<name>"`.
2. Keep a plain `state` object (numbers only: `dive`, `fog`, `land` …).
3. Build ONE `gsap.timeline` with a ScrollTrigger (`pin`, `scrub`) that tweens `state`, never the DOM directly.
4. A single `render()` reads `state` and writes transforms/opacity. Canvas effects draw from `gsap.ticker`.
5. Return `{ destroy }` that kills the timeline, ticker callbacks and listeners.

This keeps the timing (timeline) separate from the drawing (render), so timing can be retuned without touching the math.

**ScrollTrigger order matters:** pinned scenes add scroll space, so create triggers in page order. Anything that measures positions below a pinned scene (like the altimeter) must be created after the scenes in `main.ts`. Copy `docs/SCENE-RECIPE.md` to start a new scene, and register it in `src/scenes/index.ts`.

## Rules

- **Content lives in `src/content/site.ts`.** Never hard-code names, project copy or image paths in scenes or HTML.
- **Reduced motion:** check `prefersReducedMotion()` from `src/core/motion.ts`. Scenes must still show every piece of content as a still, readable layout.
- **Performance:** animate only `transform` and `opacity`. Fog canvases render at ≤ 0.35× resolution. Hero images ≤ 400 KB as JPEG/WebP, ≥ 2000 px on the long side; the overlook at 1792 px wide keeps `diveZoom` ≤ 3 so it stays reasonably sharp.
- **No horizontal scroll at 375 px wide.** Test phone width for every scene.
- **Styles:** colors and fonts only from tokens in `src/styles/tokens.css`. No inline colors in TS.
- **Assets:** every image or sound gets a row in `docs/ASSET-CREDITS.md` with source and license. The current images are AI-generated with Midjourney on a paid plan (see the credits file).
- Keep files small. If a scene file passes ~250 lines, split helpers into `core/` or `effects/`.

## Done checklist

- `npm run build` passes
- Scroll the whole page at desktop and 375 px widths
- Reduced motion on (OS setting) still reads correctly
- No console errors
