"""
Depth maps for the overlook cutouts, so the dive can fly through them in 3D (src/effects/depth-layers.ts).

    .venv-tools/bin/python tools/layer-depth.py public/images/valley.webp     # same setup as depth-map.py

Reads the far and mid cutouts made by hero-layers.py (<photo>-far.webp, <photo>-mid.webp) and writes
<photo>-far-depth.webp and <photo>-mid-depth.webp next to them: grayscale at a quarter size, 0 = farthest
(the sky), 1 = nearest, stored as the square root (the shader squares it back): relative depth crowds the whole
distant valley into a few percent of the range, and 8 bits there would show as terraces. Both share one scale, so the mid trees stand at the right distance in front of the valley:
  1. Depth Anything V2 on the far layer alone (it is opaque: the whole valley, with what the trees hid repainted).
  2. Depth Anything V2 on mid over far; its values where only the far layer shows are matched to step 1
     (its depth is relative: right up to a scale and an offset), and that fit carries the mid trees over.
  3. The mid depth is kept only well inside the cutout and spread outward from there, so the cutout's soft
     edge stands with the tree instead of peeling back to the valley behind it.
  4. Behind the mid trees, the far layer is kept a little farther away than they are.
Re-run whenever the cutouts change.
"""

import argparse
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def tool(name: str):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), Path(__file__).with_name(f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo", help="the flat photo; its cutouts sit next to it")
    ap.add_argument("--quality", type=int, default=85)
    a = ap.parse_args()

    hl = tool("hero-layers")
    src = Path(a.photo)
    far = np.asarray(Image.open(src.with_name(f"{src.stem}-far.webp")).convert("RGB"), np.float32) / 255
    mid_rgba = np.asarray(Image.open(src.with_name(f"{src.stem}-mid.webp")).convert("RGBA"), np.float32) / 255
    mid, alpha = mid_rgba[..., :3], mid_rgba[..., 3]
    r = max(4, round(far.shape[1] * 0.006))

    d_far = hl.depth_of(far)
    d_comp = hl.depth_of(mid * alpha[..., None] + far * (1 - alpha[..., None]))

    # Where only the far layer shows, both runs saw the same pixels: fit d_comp = s * d_far + t there.
    bare = ~hl.grow(alpha > 0.02, 2 * r)
    s, t = np.linalg.lstsq(np.stack([d_far[bare], np.ones(bare.sum())], 1), d_comp[bare], rcond=None)[0]
    d_mid = (d_comp - t) / s
    print(f"fit: comp = {s:.3f} × far + {t:.3f} over {bare.mean() * 100:.0f}% of the frame")

    inside = ~hl.grow(alpha < 0.9, r)
    d_mid = hl.push_pull(d_mid[..., None], inside.astype(np.float32))[..., 0]

    # Behind the trees the far layer holds repainted ground, and Depth Anything may judge it nearer than the trees
    # in front of it; then it would slide the wrong way as the camera moves. Keep it just behind them.
    behind = hl.feather(hl.grow(alpha > 0.5, r).astype(np.float32), 2 * r)
    d_far = d_far - behind * np.maximum(0, d_far - (d_mid - 0.01))

    lo = np.percentile(d_far, 0.5)
    hi = max(np.percentile(d_far, 99.9), np.percentile(d_mid[inside], 99.9))
    h, w = alpha.shape
    for name, d in (("far", d_far), ("mid", d_mid)):
        x = np.sqrt(np.clip((d - lo) / (hi - lo), 0, 1))
        im = Image.fromarray((x * 255).round().astype(np.uint8), "L").resize((w // 4, h // 4), Image.LANCZOS)
        out = src.with_name(f"{src.stem}-{name}-depth.webp")
        im.filter(ImageFilter.GaussianBlur(1)).save(out, quality=a.quality, method=6)
        print(f"{out}  {im.width}×{im.height}  {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
