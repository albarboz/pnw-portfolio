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

- [ ] Deploy it (Cloudflare Pages or Netlify, both free for static sites) and push the repo to GitHub. Nothing else on this list matters until there's a URL
- [ ] Share preview: Open Graph / Twitter meta tags and a 1200×630 share image cropped from the overlook, plus a real `robots.txt` and `sitemap.xml` (Lighthouse SEO 92 came from the missing robots file)
- [ ] Optional: [Umami](https://github.com/umami-software/umami) (MIT, no cookies, free cloud plan up to 100k events a month) to see how far people scroll and which projects they open

**Loading on phones** (the hero photo arrives about 4.5 s after load on a throttled phone)

- [ ] Instant placeholder for the overlook: a [ThumbHash](https://github.com/evanw/thumbhash) (MIT), or simply a 24 px WebP, made at build time as a data URL in `site.ts`, so the valley shows at first paint instead of an empty frame. No runtime dependency
- [ ] AVIF versions of the photos, made by the existing Python tools (Pillow ≥ 11.2 writes AVIF) with WebP fallback via `<picture>`. Measure before switching: aim for about 30 % fewer bytes at the same look
- [ ] Quality tiers with [`@pmndrs/detect-gpu`](https://github.com/pmndrs/detect-gpu) (MIT): weak GPUs keep the flat cutouts and get a lower-resolution shader fog; tier 0 keeps the canvas fog. Self-host its benchmark data (it loads it from unpkg by default). Its data source stopped updating in Dec 2025, so new GPUs fall back to its estimate
- [ ] Optional: [fontaine](https://github.com/unjs/fontaine) (MIT, dev only) for metric-matched fallback fonts, only if layout shift shows up once the site is deployed

**Atmosphere**

- [ ] Fog that parts around the cursor: a small low-resolution velocity field (advect + splat, 64×64) that `fog3d.ts` samples, after [WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT; study and port the few passes, don't vendor it). Mouse only, like `src/core/pointer.ts`; off with reduced motion
- [ ] Light shafts in the trail photo: a radial blur from the bright gap in the canopy, masked by `trail-depth.webp`, inside `depth-photo.ts`. Written in house: [three-good-godrays](https://github.com/ameobea/three-good-godrays) needs shadow-casting 3D geometry, which a photo doesn't have
- [ ] Fine film grain and one color grade shared by the fog shader, trail shader and relief meshes, so the three WebGL layers read as one camera. Written in house (about 20 lines); `postprocessing` would need everything in one three.js scene
- [ ] Optional: [SunCalc](https://github.com/mourner/suncalc) (BSD-2) for the visitor's time of day. Only as a subtle shift in fog tint, never a darker hero

**Sharper depth and photos** (tools only; nothing ships to the browser)

- [ ] Regenerate the depth maps with [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3), `DA3MONO-LARGE` (Apache 2.0; the Large and Giant checkpoints are CC BY-NC, so don't use those). Compare edges around the tall fir and the trail against the V2 maps. [MoGe-2](https://github.com/microsoft/MoGe) (MIT code; check the weights' license) is the second option
- [ ] Upscale the overlook from 1792 px to 3584 px with [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) `x4plus` (BSD-3), or Midjourney's own upscaler, so `diveZoom` can go back above 3 and stay sharp. This re-runs the whole cutout pipeline (`hero-layers.py` → `layer-depth.py`), so do it together with the depth refresh. Stay within the 400 KB image budget (AVIF helps)

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
