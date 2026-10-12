"""
Make the depth map for the 2.5D camera move on a photo (src/effects/depth-photo.ts).

    python3 -m venv .venv-tools
    .venv-tools/bin/pip install torch transformers pillow numpy
    .venv-tools/bin/python tools/depth-map.py public/images/trail.webp

Runs Depth Anything V2 (Base) on the photo and writes <photo>-depth.webp next to it at half size,
grayscale, 0 = far (black), 1 = near (white). Re-run it whenever the photo changes.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def depth_map(img: Image.Image) -> np.ndarray:
    """Relative depth of `img` at its own size, 0 = far, 1 = near."""
    from transformers import pipeline
    import torch

    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Base-hf", device=device)
    small = img.copy()
    small.thumbnail((1400, 1400))
    d = np.array(pipe(small)["predicted_depth"].squeeze().float().cpu())
    d = (d - d.min()) / (d.max() - d.min())
    return np.array(Image.fromarray(d.astype(np.float32)).resize(img.size, Image.BICUBIC))


def displacement_map(d: np.ndarray, grow: float = 0.008, blur: float = 0.004) -> Image.Image:
    """
    8-bit grayscale, ready for the shader. Near shapes grow by `grow` × width before blurring, so their edges
    stay solid and the background behind them stretches instead (a torn silhouette shows far more than a smear).
    """
    im = Image.fromarray((np.clip(d, 0, 1) * 255).round().astype(np.uint8), "L")
    size = max(3, round(im.width * grow) // 2 * 2 + 1)
    return im.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.GaussianBlur(im.width * blur))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--quality", type=int, default=80)
    a = ap.parse_args()

    src = Path(a.photo)
    img = Image.open(src).convert("RGB")
    half = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    out = src.with_name(f"{src.stem}-depth.webp")
    displacement_map(depth_map(half)).save(out, quality=a.quality, method=6)
    print(f"{out}  {half.width}×{half.height}  {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
