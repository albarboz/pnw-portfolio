# PNW Portfolio

An immersive, scroll-driven portfolio. You start at a Cascade valley overlook, dive through the river of fog below, and land on a forest trail behind a runner. The sections (About, Work, Contact) unfold along the run.

**Live:** https://pnw-portfolio.alansoftwareengineer.workers.dev/

## How it's built

- **Vite + TypeScript**, no framework. Every scroll-linked animation is a **GSAP ScrollTrigger** timeline, smoothed by **Lenis**.
- **The dive** flies through the photo in 3D. The overlook is cut into far, mid and near layers. The far and mid layers become relief meshes pushed back by their depth maps (**Three.js**, loaded lazily), and the near branches stay a CSS layer moved by the same camera.
- **The fog** is a full-screen shader. A Canvas 2D version draws until it loads, and stays as the fallback when WebGL isn't available.
- **The trail run** is decoded frame by frame with WebCodecs (**Mediabunny**) and drawn by a small WebGL shader, so scrolling scrubs it smoothly in both directions. It opens from the still trail photo through a ring of fog. Browsers without WebCodecs scrub a plain `<video>`.
- **Quality levels** come from **detect-gpu**: weak GPUs keep flat layers and lighter fog, and devices without WebGL get the 2D version. Add `?quality=0|1|2` to the URL to force a level.
- **Accessible by default.** With reduced motion turned on, every section shows as a still, readable layout. Text contrast is at least 4.5:1 everywhere.
- **Fast first paint.** The page shows a tiny inline placeholder of the overlook right away, and everything heavier (Three.js, the video decoder, the films) loads after it.

The photos and films are Midjourney generations. Their depth maps, layers and upscales come from the Python scripts in `tools/` (Depth Anything V2, ViTMatte, LaMa, Real-ESRGAN, RIFE). See [`docs/ASSET-CREDITS.md`](docs/ASSET-CREDITS.md).

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173, with a Tune panel (top right) for the feel numbers
npm run build      # type-check, then production build to dist/
npm run preview    # serve dist/
```

## Where things live

| To change… | Edit |
| --- | --- |
| Name, copy, projects, links, email, image paths, link-preview tags | `src/content/site.ts` |
| Colors and fonts | `src/styles/tokens.css` |
| Fog look, dive length, dolly depths, pacing | `src/core/tuning.ts`: drag the **Tune** sliders in `npm run dev`, press *Copy values*, paste here |
| Timing of a scene | the timeline block in `src/scenes/<scene>.ts` |
| The fog shader | `src/effects/fog3d.ts` (fallback: `src/effects/fog.ts`) |
| Photos and films | `public/images/`, `public/video/`, plus a row in `docs/ASSET-CREDITS.md` |

```
src/
  main.ts          boot: content → scroll → scenes → ui
  content/site.ts  all copy, projects, links and image paths
  core/            shared plumbing (scroll, quality, motion prefs, tuning)
  effects/         visual effects (fog, depth photo, layered overlook, film player)
  scenes/          one file per pinned scroll scene
  ui/              small widgets (header, reveals, project dialog, copy button)
  dev/             dev-only tuning panel, not in the build
tools/             optional Python asset scripts, not part of the build
docs/              roadmap, asset credits, scene recipe
```

`CLAUDE.md` has the full conventions (scene pattern, performance rules, done checklist). `docs/ROADMAP.md` tracks what's next.

## Deploy

Cloudflare builds and serves `dist/` as static assets (`wrangler.jsonc`), and every push to `main` redeploys. Caching rules are in `public/_headers`.
