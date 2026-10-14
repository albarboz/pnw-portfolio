# Asset credits

Every image, video, sound and font in `public/` needs a row here before launch.

| File | Source | Author | License | Status |
| --- | --- | --- | --- | --- |
| `public/images/valley.webp` | AI-generated with Midjourney (original `aerielmid.png`); now the far / mid / near cutouts below stacked back together, so the first paint matches the layers that replace it | Site owner | Midjourney Terms of Service, paid plan (owner owns the output) | OK |
| `public/images/trail.webp` | AI-generated with Midjourney (original `alanrunningmid.png`) | Site owner | Midjourney Terms of Service, paid plan (owner owns the output) | OK |
| `public/video/trail-run-hq.mp4`, `trail-run.mp4`, `public/images/trail-run-poster.webp`, `trail-run-still.webp` | AI-generated with Midjourney video in HD (animated from a 16:9 version of `trail.webp`'s original, `alan-running-16x9.png`); original `altrail.mp4` (1280×720, 24 fps, 5.2 s) kept outside the repo, filled in to 96 fps with RIFE v4.25 ([Practical-RIFE](https://github.com/hzwer/Practical-RIFE), MIT, code and weights) by `tools/run-interpolate.py --multi 4` → `altrail_4x.mp4`. All four made from that by `tools/run-video.py` (graded with `eq=saturation=0.86:contrast=1.03:gamma=0.97`): the HQ copy H.264 CRF 24 with a keyframe every 24 frames for the WebCodecs player, the fallback 768 px at 24 fps CRF 27 with a keyframe on every frame for a plain `<video>`; poster = first frame, still = 60% through | Site owner | Midjourney Terms of Service, paid plan (owner owns the output) | OK |
| `public/video/trail-run-phone.mp4` | The same Midjourney HD clip (`altrail.mp4`): a 9:16 slice around the runner (404×720 at x 412), upscaled 4× and reduced to 2× (808×1440) with Real-ESRGAN x4plus ([xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN), BSD-3) by `tools/run-upscale.py` → `altrail_phone.mp4`, filled in to 48 fps with RIFE v4.25 (`tools/run-interpolate.py --multi 2`), encoded by `tools/run-video.py --phone` | Site owner | Midjourney Terms of Service, paid plan (owner owns the output) | OK |
| `public/images/trail-depth.webp` | Depth map of `trail.webp`, made with `tools/depth-map.py` (Depth Anything V2 Base) | Site owner (derived) | Same as `trail.webp`; the model's output carries no extra terms | OK |
| `public/images/valley-far.webp`, `valley-mid.webp`, `valley-near.webp` | Far / mid / near cutouts of `valley.webp` for the layered hero, made with `tools/hero-layers.py` (Depth Anything V2 Base for depth, ViTMatte for the cutouts). What the trees hid is repainted by the owner in Midjourney's Editor (plates in `tools/plates/`, not committed), blended with LaMa | Site owner (derived) | Same as `valley.webp` (Midjourney paid plan); ViTMatte and LaMa are Apache-2.0 and their output carries no extra terms | OK |
| `public/images/share.jpg` | Link-preview image (1200×630, Open Graph): a crop of `valley.webp` | Site owner (derived) | Same as `valley.webp` (Midjourney paid plan) | OK |
| `public/images/valley-far-depth.webp`, `valley-mid-depth.webp` | Depth maps of the far and mid cutouts for the 3D overlook, made with `tools/layer-depth.py` (Depth Anything 3, `DA3MONO-LARGE`) | Site owner (derived) | Same as `valley.webp`; DA3MONO-LARGE is Apache-2.0 and its output carries no extra terms | OK |
| `public/images/valley-far-detail.webp` | The middle of `valley-far.webp` at twice the size (2330×2044), for the end of the dive, made with `tools/detail-patch.py`: Real-ESRGAN x4plus on the original `aerielmid.png` where the far layer still shows it, tones matched to the far layer | Site owner (derived) | Same as `valley.webp`; Real-ESRGAN is BSD-3-Clause and its output carries no extra terms | OK |
| `public/favicon.svg` | Drawn for this site (fir on `--night`) | Site owner | Original | OK |
| `public/fonts/barlow-*.woff2`, `barlow-condensed-*.woff2` | Barlow and Barlow Condensed, static weights (Barlow 400/500/600, Condensed 400/500/600/700), Latin and Latin Extended subsets as served by Google Fonts | The Barlow Project Authors | SIL Open Font License 1.1 (`public/fonts/OFL-barlow.txt`) | OK |

Both images were generated on a paid Midjourney plan, which allows commercial use. Per Midjourney's terms, a company with more than $1M a year in gross revenue needs the Pro or Mega plan; re-check the current terms if that changes. The originals carry the IPTC `trainedAlgorithmicMedia` tag, which marks them as AI-generated.

Originals live outside the repo; the files here are WebP exports under the 400 KB budget (valley 1792×2688 at q80, the full original size, flattened from its cutouts; trail 2250×1500 at q54, downscaled from a 2688×1792 original to fit the budget). 1792 px is the largest Midjourney's 2× upscale gives. The whole overlook at 2× would be ~1 MB, so only the valley the dive zooms into gets a 2× copy (`valley-far-detail.webp`, 75 KB, loaded after the hero), which lets `diveZoom` be 4.5.

## Good free sources

- Unsplash / Pexels: free for commercial use, no attribution required (credit anyway)
- National Park Service and other US government photos: usually public domain; check the caption
- Wikimedia Commons: check each file's license
