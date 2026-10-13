# Roadmap

Work in phases. Each phase should ship a page that works on its own.

## Phase 1 – 2D descent (current)

- [x] Overlook → fog dive → trail scene with GSAP ScrollTrigger + Lenis
- [x] Canvas fog, altimeter
- [x] Replace placeholder photos with licensed, high-res images (≥ 2000 px)
- [ ] Real bio, projects and contact in `src/content/site.ts`
- [x] Project detail pages or modals

## Phase 2 – Depth

- [x] Split the overlook into layers for true parallax: `tools/hero-layers.py` (far / mid / near cutouts) → `src/effects/photo-layers.ts`; the scroll fog sits between mid and near
- [x] Depth-map "2.5D" camera move on the trail photo: `tools/depth-map.py` (Depth Anything V2) → WebGL displacement in `src/effects/depth-photo.ts`
- ~~A short fog timelapse video loop as an alternative hero~~ (skipped by the owner, 2026-10-12)
- [x] Soft transitions between sections: gradient hand-offs (`--blend` in `sections.css`) and headings that drift slightly slower than the page (`[data-drift]`, `src/ui/reveal.ts`)

## Phase 3 – 3D fly-through (optional)

- [x] Add `three` and build `src/effects/fog3d.ts`: a full-screen shader fog (fbm noise) that replaces the canvas fog. Three is loaded lazily (`src/effects/fog-layer.ts`); the canvas fog draws until it's in and stays as the no-WebGL fallback
- [x] Camera dolly through layered planes, driven by the same ScrollTrigger timeline: each overlook cutout has a depth (`dolly()` in `src/effects/photo-layers.ts`) and the camera flies past the near branches and the fir into the valley. Flat planes facing the camera only scale and move under perspective, so CSS transforms draw this exactly; no Three.js needed
- [x] Fly through the photo in 3D: depth maps for the far and mid cutouts (`tools/layer-depth.py`), drawn as relief meshes (`src/effects/depth-layers.ts`) that take over from the flat cutouts at rest. The dive is part flying, part lens zoom (`photo3d.fly`), so the trees still pass when they did with the flat layers. (A World Labs Marble splat was tried first: its world didn't contain the photo's viewpoint, so it couldn't line up at rest.)
- [ ] Only if needed: volumetric clouds (takram `three-geospatial`) or React Three Fiber + drei. Researched 2026-10-13: `@takram/three-clouds` (MIT) is built for globe-scale scenes, needs `postprocessing` + the atmosphere package, and runs at 36–53 fps on an iPhone 13 at its Low preset. Too heavy for a fog bank the shader fog already draws; keep parked

## Phase 4 – Polish and launch

Researched 2026-10-13. Ordered by how much a visitor would notice. Each new dependency still needs the owner's OK; most of these are build-time tools or ideas that need no new dependency.

**Launch**

- [x] Deploy it: private GitHub repo `albarboz/pnw-portfolio`, built and served by Cloudflare (static assets, `wrangler.jsonc`) at https://pnw-portfolio.alansoftwareengineer.workers.dev/. Every push to `main` redeploys. Caching rules in `public/_headers`
- [x] Share preview: Open Graph / Twitter tags, `robots.txt` and `sitemap.xml`, all built from `site.meta` by the `siteMeta()` plugin in `vite.config.ts`; share image `public/images/share.jpg` (1200×630 crop of the overlook)
- [ ] Optional: [Umami](https://github.com/umami-software/umami) (MIT, no cookies, free cloud plan up to 100k events a month) to see how far people scroll and which projects they open

**Loading on phones** (the hero photo arrives about 4.5 s after load on a throttled phone)

- [x] Instant placeholder for the overlook: a 32 px WebP data URL (`tools/placeholder.py` → `placeholder` in `site.ts`, ~590 chars), stretched behind the photo until it loads. Plus a `<link rel=preload>` for the overlook (written by `siteMeta()`), since its src is set by JS: on a throttled phone the photo now starts at 0.6 s instead of 2.1 s and arrives 0.8 s sooner (Speed Index 5.8 → 4.1 s), for ~0.14 s later first text. `fetchpriority=high` on the preload measured no better
- ~~AVIF versions of the photos~~ measured 2026-10-13 and dropped: at the same fidelity AVIF is no smaller than WebP for these grainy photos (overlook: AVIF q60 343 KB vs WebP q75 327 KB at matched error), and the smaller settings make the photo → cutouts swap visible
- [x] Quality tiers with [`@pmndrs/detect-gpu`](https://github.com/pmndrs/detect-gpu) (MIT, pinned 6.0.24): `src/core/quality.ts`, after the hero. Known 15–30 fps GPUs (e.g. Adreno 506, Intel HD 4000) keep the flat cutouts and get the shader fog at 0.20 resolution; under 15 fps, blocklisted or no WebGL get the canvas fog and the plain trail photo. GPUs it doesn't know (its data stopped in Dec 2025) keep everything, so new phones aren't downgraded. Benchmark data served from the site by `benchmarks()` in `vite.config.ts` (one file per visitor, ≤ 14 KB gzipped). `?quality=0|1|2` forces a level
- [ ] Optional: [fontaine](https://github.com/unjs/fontaine) (MIT, dev only) for metric-matched fallback fonts, only if layout shift shows up once the site is deployed

**Atmosphere**

- [ ] Fog that parts around the cursor: a small low-resolution velocity field (advect + splat, 64×64) that `fog3d.ts` samples, after [WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT; study and port the few passes, don't vendor it). Mouse only, like `src/core/pointer.ts`; off with reduced motion
- [x] Light shafts in the trail photo: a radial blur toward a light above the top right, fed only by pixels that are bright and far (`trail-depth.webp`), baked once into a quarter-size texture (`src/effects/light-shafts.ts`) and screened in by `depth-photo.ts`, faint on the near ferns. No per-frame cost; knobs in `tuning.shafts`. Written in house: [three-good-godrays](https://github.com/ameobea/three-good-godrays) needs shadow-casting 3D geometry, which a photo doesn't have
- [x] Shared film grain: one noise tile on a DOM layer over the whole descent, below the text (`src/effects/grain.ts`), so the smooth shader fog gets the photos' grain. Not inside the shaders: the flat `<img>` layers shown first would lack it, so the look would shift when 3D takes over on refresh, and the fog draws at ⅓ resolution. It jumps to a new offset only while scrolling (transform only), holds still at rest and with reduced motion, and fades out before the hand-off to About. Knobs in `tuning.grain`. No color grade: the palette already matches
- [ ] Optional: [SunCalc](https://github.com/mourner/suncalc) (BSD-2) for the visitor's time of day. Only as a subtle shift in fog tint, never a darker hero

**Sharper depth and photos** (tools only; nothing ships to the browser)

- [x] Overlook depth maps from [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3) `DA3MONO-LARGE` (Apache 2.0; the Large and Giant checkpoints are CC BY-NC, so don't use those), via `tools/layer-depth.py`. Its depth is turned into nearness spaced like V2's (√(1/z)), so the tuned dive holds; the tall fir passes a little later. Its sky head also flagged the valley fog as sky, so only sky that reaches the top of the frame counts. Sharper edges don't show: the depth is smoothed on purpose against streaks. The trail keeps V2: DA3 lays out its ground and ferns differently and no remap matched. [MoGe-2](https://github.com/microsoft/MoGe) (MIT code; check the weights' license) stays the second option
- [x] Sharper dive with [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) `x4plus` (BSD-3), so `diveZoom` is back at 4.5. The whole overlook at 2× measured ~1 MB as WebP (cutouts ~1.5 MB more), far past the budget, so only the valley the zoom looks into is upscaled: `tools/detail-patch.py` → `valley-far-detail.webp` (2330×2044, 75 KB, after the hero), from the lossless original where the far layer still shows it (an upscaled repaint grows speckled needles), tones matched to the far layer. The far layer blends it in from 1.1× to 1.8× zoom, in 3D (`setDetail()` in `depth-layers.ts`) and in the flat fallback (an `<img>` over the far cutout)

**Smaller polish**

- [ ] Project dialog: per-project URL hash, so a project can be linked and Back closes it
- [ ] Type pass on what's left in mono caps: project meta, the EXAMPLE tag, the copy-email button, the dialog meta and close
- [ ] Optional, code health: [vite-plugin-glsl](https://github.com/UstymUkhman/vite-plugin-glsl) (MIT, dev only) to move the three shaders into `.glsl` files with one shared noise chunk

**Researched and passed** (so they aren't looked at again)

- Apple [SHARP](https://github.com/apple/ml-sharp) (one photo → Gaussian splat from the photo's own viewpoint, which would avoid the Marble mismatch): its weights are licensed for non-commercial research only
- Apple Depth Pro: unclear license for this use; Depth Anything 3 Mono covers it under Apache 2.0
- [LYGIA](https://github.com/patriciogonzalezvivo/lygia) shader library: non-commercial license (Prosperity) unless you sponsor or contribute
- Theatre.js: the GSAP timeline + Tweakpane panel already cover keyframing and tuning

## Useful references

- GSAP docs: https://gsap.com/docs/v3/
- ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Lenis: https://github.com/darkroomengineering/lenis
- Codrops demos (study, then adapt): https://github.com/orgs/codrops/repositories
- Three.js: https://threejs.org/docs/
