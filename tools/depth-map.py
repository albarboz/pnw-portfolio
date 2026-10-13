"""
Make the depth map for the 2.5D camera move on a photo (src/effects/depth-photo.ts), and the depth models
the other tools share (layer-depth.py, hero-layers.py).

    .venv-tools/bin/pip install torch transformers pillow numpy
    .venv-tools/bin/python tools/depth-map.py public/images/trail.webp

Runs Depth Anything V2 (Base) on the photo and writes <photo>-depth.webp next to it at half size,
grayscale, 0 = far (black), 1 = near (white). Re-run it whenever the photo changes.

`--model da3` runs Depth Anything 3 (DA3MONO-LARGE, Apache-2.0) instead, as layer-depth.py does for the
overlook. On the trail its layout differs from V2's (the ground against the side ferns), so the trail keeps V2.
Use the Mono checkpoint only: DA3's Large and Giant (multi-view) checkpoints are CC BY-NC. Setup (Python
≤ 3.13 and numpy < 2; only what single-image depth needs, the package's 3D-export extras are skipped and
stubbed out below; weights download on the first run, ~1.4 GB):
    git clone https://github.com/ByteDance-Seed/Depth-Anything-3 ~/.cache/hero-layers/depth-anything-3
    python3.11 -m venv ~/.cache/hero-layers/venv-da3
    ~/.cache/hero-layers/venv-da3/bin/pip install torch torchvision einops addict omegaconf "numpy<2" \
        opencv-python-headless pillow huggingface_hub safetensors tqdm imageio scipy
    ~/.cache/hero-layers/venv-da3/bin/pip install --no-deps -e ~/.cache/hero-layers/depth-anything-3
"""

import argparse
import sys
import types
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# DA3 says how far each pixel is (up to a scale); V2 gives a relative nearness with its own spacing, and the
# 3D and 2.5D moves were tuned on V2. So DA3's distance z is turned into nearness spaced the way V2 spaces it
# (fitted on these photos: within 0.02 for the overlook layers, 0.1 for the trail, on a 0–1 range):
#   "sqrt": √(1/z)   the overlook: open air from the trees to the peaks
#   "log":  −log z   the trail: ferns at arm's length, trunks a few meters back
SPACING = {"sqrt": lambda z: np.sqrt(1 / z), "log": lambda z: -np.log(z)}


def depth_map(img: Image.Image, model: str = "v2", spacing: str = "sqrt") -> np.ndarray:
    """Relative depth of `img` at its own size, 0 = far, 1 = near."""
    small = img.copy()
    small.thumbnail((1400, 1400))
    if model == "v2":
        d = v2_nearness(small)
    else:
        z, sky = da3_distance(small)
        z = np.maximum(z, np.percentile(z[~sky], 0.1))  # a few near pixels can come out at 0 or below
        d = SPACING[spacing](z)
        d[sky] = d[~sky].min()  # the sky is as far as the farthest ground (V2 does the same)
    d = (d - d.min()) / (d.max() - d.min())
    return np.array(Image.fromarray(d.astype(np.float32)).resize(img.size, Image.BICUBIC))


def v2_nearness(img: Image.Image) -> np.ndarray:
    from transformers import pipeline
    import torch

    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Base-hf", device=device)
    return np.array(pipe(img)["predicted_depth"].squeeze().float().cpu())


def da3_distance(img: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    """Distance (relative) and a sky mask, both at the model's working size (long side 1400)."""
    for name in ("depth_anything_3.utils.export", "depth_anything_3.utils.pose_align"):  # 3D export only
        sys.modules.setdefault(name, types.SimpleNamespace(export=None, align_poses_umeyama=None))
    import torch
    from scipy import ndimage
    from depth_anything_3.api import DepthAnything3
    from depth_anything_3.model import da3

    # DA3 pushes everything its sky head scores ≥ 0.3 out to the farthest depth, which also throws flat fog
    # banks deep in a valley out to the sky. Keep its own depth there, and only call sky what reaches the
    # top of the frame. (Its depth *in* the real sky is meaningless, so that still needs the mask.)
    scores = {}

    def keep_depth(self, output):
        scores["sky"] = output.sky.float().squeeze().cpu().numpy()
        return output

    da3.DepthAnything3Net._process_mono_sky_estimation = keep_depth
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    net = DepthAnything3.from_pretrained("depth-anything/DA3MONO-LARGE").to(device=torch.device(device))
    z = net.inference([img], process_res=1400).depth[0]
    labels, _ = ndimage.label(scores["sky"] >= 0.3)
    sky = np.isin(labels, np.setdiff1d(labels[0], [0]))
    return z, sky


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
    ap.add_argument("--model", choices=("v2", "da3"), default="v2")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--out", help="where to write (default: <photo>-depth.webp next to the photo)")
    a = ap.parse_args()

    src = Path(a.photo)
    img = Image.open(src).convert("RGB")
    half = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    out = Path(a.out) if a.out else src.with_name(f"{src.stem}-depth.webp")
    displacement_map(depth_map(half, a.model, "log")).save(out, quality=a.quality, method=6)
    print(f"{out}  {half.width}×{half.height}  {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
