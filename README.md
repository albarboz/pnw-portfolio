# PNW Portfolio

An immersive scroll portfolio: start at a Cascade valley overlook, dive into the fog, land on a forest trail.

## Get started

1. Install [Node.js](https://nodejs.org) 20 or newer.
2. Open this folder in VS Code and accept the recommended extensions (Claude Code, Prettier).
3. In the terminal:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:5173.

## Working with Claude in VS Code

Claude reads `CLAUDE.md` automatically, so it already knows the stack, the folder layout and the rules. Good first prompts:

- "Update `src/content/site.ts` with my real bio and these three projects: …"
- `/new-scene river The trail opens onto a glacial river crossing`
- `/polish descent`
- "Make the dive feel slower at the start and faster through the fog."

## Where things live

| You want to change… | Edit |
| --- | --- |
| Name, copy, projects, email, image paths | `src/content/site.ts` |
| Colors and fonts | `src/styles/tokens.css` |
| The fog dive animation timing | `src/scenes/descent.ts` (the timeline block) |
| The fog look | `src/effects/fog.ts` |
| Photos | `public/images/` + `docs/ASSET-CREDITS.md` |
| Where the camera dives / what the landing pushes toward | `diveTarget`, `startFocus`, `landingFocus` in `src/content/site.ts` |

See `docs/ROADMAP.md` for what's next, including the optional Three.js phase.

## Deploy

`npm run build` creates `dist/`. Drag that folder into Netlify, or connect the repo to Vercel or Cloudflare Pages.
