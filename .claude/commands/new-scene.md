---
description: Create a new pinned scroll scene from the project recipe
argument-hint: <scene-name> <what happens in the scene>
---

Create a new scroll scene named from the first word of: $ARGUMENTS

1. Read `CLAUDE.md` and `docs/SCENE-RECIPE.md`.
2. Add the markup to `index.html` in the right place in the page flow, with `data-scene="<name>"`.
3. Create `src/scenes/<name>.ts` following the recipe: `state` object, one scrubbed timeline, one `render()`, a `destroy()`.
4. Put any copy and image paths in `src/content/site.ts`, and add placeholder rows to `docs/ASSET-CREDITS.md` for new assets.
5. Register the scene in `src/scenes/index.ts`.
6. Handle reduced motion and phone width.
7. Run `npm run build` and fix every error. Summarize what you made and how the timing is laid out.
