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
- [ ] Only if needed: volumetric clouds (takram `three-geospatial`) or React Three Fiber + drei

## Useful references

- GSAP docs: https://gsap.com/docs/v3/
- ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Lenis: https://github.com/darkroomengineering/lenis
- Codrops demos (study, then adapt): https://github.com/orgs/codrops/repositories
- Three.js: https://threejs.org/docs/
