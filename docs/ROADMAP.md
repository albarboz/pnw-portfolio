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


**Atmosphere**


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

## Phase 5 – One continuous run (2026-10-13)

The page as one take: overlook → fog dive → white-out → the runner on the trail → the film opens from that photo in a ring of fog and runs behind About and Work → its last frame melts into the night and Contact rises out of the dark.

- [x] Trail sign in page order; scroll cue on the opening screen
- [x] Film behind About and Work: sticky stage over the descent's hold, fog-ring hand-off (`run-view.ts`), WebCodecs scrubbing via Mediabunny (`video-frames.ts`), pace slows and dims under text (`pace.ts`); knobs in `tuning.run`
- [x] HD master: Midjourney HD (1280×720, 5.2 s, `altrail.mp4`), a 16:9 crop of the trail photo; its place on the photo (`run.align`) is measured by `tools/run-video.py` and the film opens there
- [x] Smoother film: RIFE v4.25 fills it in to 96 fps (`tools/run-interpolate.py`, on the Mac's GPU in ~1 min); the web copy stays ~7.7 MB, as the in-between frames compress well
- [x] Phones: the film drawn at the screen's density (it was 1×), no canvas blink when the toolbar slides, decoder skips frames it only passes through, and a portrait slice upscaled 2× with Real-ESRGAN at 48 fps (`trail-run-phone.mp4`), as crisp as the trail photo
- [ ] Optional: upscale the desktop film too (SeedVR2 on a rented GPU, or Real-ESRGAN); extend the clip in Midjourney HD for a longer run
- [ ] Side trail marker: progress + navigation after the hero
- [ ] Owner's captions as signposts, real About and projects

## Phase 6 – Editorial polish (2026-10-13)

From a design critique (19/32): the opening was authored, the sections were a template laid over a video. Direction chosen by the owner: quiet editorial (the interface recedes; the film and photos carry the character).

- [x] Sections as spreads: each section sets the film's behavior ([data-run] read / sheet / end, src/core/pace.ts). About reads over it with the runner stepped aside to the right (a slight push in, `ASIDE_*` in run-view.ts) and the text's side shaded (.run-scrim); Work rises over it as a sheet of night and the film stops behind it; Contact is the arrival over the held last frame
- [x] A fixed, boxless site header that fades in at About and marks the section in view (src/ui/header.ts); fly-to logic shared with the trail sign and the footer's "back to the overlook" (src/ui/fly.ts)
- [x] Quiet type: Barlow Condensed 400/500 added; headings in 500, a fuller scale (tokens.css); hero sign and scroll cue as plain ink with the tagline's halo instead of glass and pills; project rows with the meta under the text (no eyebrow), arrow after the title, no circle buttons
- [x] Contact as a full screen with the email large, profile links, a real footer; selection, scrollbar and caret themed
- [x] Desktop film upscaled to 1920×1080 (Real-ESRGAN, then RIFE to 96 fps): 8.1 MB at CRF 28, the same size as the old 1280 copy and clearly crisper on Retina
- [x] The fog ring's edge rebuilt like the dive's fog: warped noise, a dense core in a wide haze, billows that drift while it's open
- [x] Soft cloud banks inside the white-out that swell past as the camera flies through (`drift` in descent.ts)
- [x] Project dialog in the quiet language: night sheet with a hairline, "Close ×", medium title, tracked fact labels, plain links with an outward arrow

## Phase 7 – Checks and depth (2026-10-14)

- [x] The Done checklist as tests: [Playwright](https://github.com/microsoft/playwright) (Apache-2.0) + [axe-core](https://github.com/dequelabs/axe-core-npm) (MPL-2.0), dev only, in the installed Chrome (`npm test`, `tests/`). The whole page at 1440 and 375 px, quality 0 and 2, reduced motion, console errors, sideways overflow, WCAG 2.2 AA, project dialog by keyboard, trail sign. First run caught a real bug: a trail sign clicked in the first moments after load flew to Lenis's stale (pre-pin) limit and stopped halfway; Lenis now re-measures on every ScrollTrigger refresh (`scroll.ts`)
- [x] Fog ring by depth: [Video Depth Anything](https://github.com/DepthAnything/Video-Depth-Anything) Small (Apache-2.0; Base/Large are CC BY-NC) on the film's first 1.3 s (`tools/film-depth.py` → `trail-run-depth.webp`, 47 KB atlas). The ring's edge runs ahead over what is nearer than the runner and behind over what is farther, so it leaves the ferns first and follows the trunks; not right around the runner. `tuning.run.depth` (0 = the plain ring)
- [x] Edge streaks in the hand-off: the photo's framing shows more than the film's first frame (about 5% top and bottom), and the clamped frame smeared its last row across. Past the frame the ring now draws the trail photo itself (a second texture), blended from a little inside the edge while the film is still framed as the photo; the depth eases out there too instead of smearing its edge row (that smear had made a hard-edged hole in the fog)

## Useful references

- GSAP docs: https://gsap.com/docs/v3/
- ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Lenis: https://github.com/darkroomengineering/lenis
- Codrops demos (study, then adapt): https://github.com/orgs/codrops/repositories
- Three.js: https://threejs.org/docs/
