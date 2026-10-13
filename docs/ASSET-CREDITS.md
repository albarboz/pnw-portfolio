# Asset credits

Every image, video and sound in `public/` needs a row here before launch.

| File | Source | Author | License | Status |
| --- | --- | --- | --- | --- |
| `public/images/valley.webp` | AI-generated with Midjourney (original `aerielmid.png`) | Site owner | Midjourney Terms of Service, paid plan (owner owns the output) | OK |
| `public/images/trail.webp` | AI-generated with Midjourney (original `alanrunningmid.png`) | Site owner | Midjourney Terms of Service, paid plan (owner owns the output) | OK |
| `public/images/trail-depth.webp` | Depth map of `trail.webp`, made with `tools/depth-map.py` (Depth Anything V2 Base) | Site owner (derived) | Same as `trail.webp`; the model's output carries no extra terms | OK |
| `public/images/valley-far.webp`, `valley-mid.webp`, `valley-near.webp` | Far / mid / near cutouts of `valley.webp` for the layered hero, made with `tools/hero-layers.py` (Depth Anything V2 Base for depth, ViTMatte for the cutouts). What the trees hid is repainted by the owner in Midjourney's Editor (plates in `tools/plates/`, not committed), blended with LaMa | Site owner (derived) | Same as `valley.webp` (Midjourney paid plan); ViTMatte and LaMa are Apache-2.0 and their output carries no extra terms | OK |
| `public/favicon.svg` | Drawn for this site (fir on `--night`) | Site owner | Original | OK |

Both images were generated on a paid Midjourney plan, which allows commercial use. Per Midjourney's terms, a company with more than $1M a year in gross revenue needs the Pro or Mega plan; re-check the current terms if that changes. The originals carry the IPTC `trainedAlgorithmicMedia` tag, which marks them as AI-generated.

Originals live outside the repo; the files here are WebP exports under the 400 KB budget (valley 1792×2688 at q62, the full original size; trail 2250×1500 at q54, downscaled from a 2688×1792 original to fit the budget). 1792 px is the largest Midjourney's 2× upscale gives, so `diveZoom` is set to 3 rather than 4.5 to limit how far the overlook gets magnified; a sharper overlook ≥ 3000 px wide would allow a deeper dive.

## Good free sources

- Unsplash / Pexels: free for commercial use, no attribution required (credit anyway)
- National Park Service and other US government photos: usually public domain; check the caption
- Wikimedia Commons: check each file's license
