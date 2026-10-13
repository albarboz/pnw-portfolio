# Roadmap

Work in phases. Each phase should ship a page that works on its own.

## Phase 1 – 2D descent (current)

- [x] Overlook → fog dive → trail scene with GSAP ScrollTrigger + Lenis
- [x] Canvas fog, altimeter, optional wind audio
- [x] Replace placeholder photos with licensed, high-res images (≥ 2000 px)
- [ ] Real bio, projects and contact in `src/content/site.ts`
- [x] Project detail pages or modals

## Phase 2 – Depth

- [x] Split the overlook into layers for true parallax: `tools/hero-layers.py` (far / mid / near cutouts) → `src/effects/photo-layers.ts`; the scroll fog sits between mid and near
- [x] Depth-map "2.5D" camera move on the trail photo: `tools/depth-map.py` (Depth Anything V2) → WebGL displacement in `src/effects/depth-photo.ts`
- ~~A short fog timelapse video loop as an alternative hero~~ (skipped by the owner, 2026-10-12)
- [x] Soft transitions between sections: gradient hand-offs (`--blend` in `sections.css`) and headings that drift slightly slower than the page (`[data-drift]`, `src/ui/reveal.ts`)

## Phase 3 – 3D fly-through (optional)

- [ ] Add `three` and build `src/effects/fog3d.ts`: a full-screen shader fog (fbm noise) that replaces the canvas fog
- [ ] Camera dolly through layered planes, driven by the same ScrollTrigger timeline
- [ ] Only if needed: volumetric clouds (takram `three-geospatial`) or React Three Fiber + drei

## Useful references

- GSAP docs: https://gsap.com/docs/v3/
- ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Lenis: https://github.com/darkroomengineering/lenis
- Codrops demos (study, then adapt): https://github.com/orgs/codrops/repositories
- Three.js: https://threejs.org/docs/
