# Roadmap

Work in phases. Each phase should ship a page that works on its own.

## Phase 1 – 2D descent (current)

- [x] Overlook → fog dive → trail scene with GSAP ScrollTrigger + Lenis
- [x] Canvas fog, altimeter, optional wind audio
- [ ] Replace placeholder photos with licensed, high-res images (≥ 2000 px)
- [ ] Real bio, projects and contact in `src/content/site.ts`
- [ ] Project detail pages or modals

## Phase 2 – Depth

- [ ] Split hero photos into layers (sky, peaks, fog, foreground firs) for true parallax
- [ ] Depth-map "2.5D" camera move on the trail photo (e.g. Depth Anything → displacement)
- [ ] A short fog timelapse video loop as an alternative hero
- [ ] Page transitions between sections

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
