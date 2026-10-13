"""
A sharper copy of the middle of the overlook's far layer, for the end of the dive (src/effects/overlook.ts).

    .venv-tools/bin/python tools/detail-patch.py public/images/valley.webp --source ~/Downloads/aerielmid.png

The dive zooms into the valley around the dive target, where the 1792 px photo turns soft. The whole photo at
twice the size would be ~1 MB, so only the part the zoom ever looks at closely is made sharper: --rect of the far
cutout (<photo>-far.webp, from hero-layers.py), at twice the size, written to <photo>-far-detail.webp.
Its fine detail comes from the lossless original photo (--source), upscaled with Real-ESRGAN x4plus (BSD-3;
weights downloaded on the first run, 64 MB; run 4× then reduced, which looked more natural than its 2× model).
Only where the far layer is still that photo, though: behind the trees it was repainted, and an upscaled repaint
grows speckled needles, so there the patch is the far layer, simply enlarged. Broad tones always come from the far
layer, so the page can blend the patch in as the zoom builds without the colors shifting.
Prints the rect to paste into `detail` in src/content/site.ts. Re-run whenever the far layer changes.
"""

import argparse
import time
import urllib.request
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

WEIGHTS_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
WEIGHTS = Path.home() / ".cache" / "hero-layers" / "RealESRGAN_x4plus.pth"


# Real-ESRGAN's network (RRDBNet, as in xinntao/Real-ESRGAN), written out so the tool needs no extra package.
class DenseBlock(nn.Module):
    def __init__(self, f=64, g=32):
        super().__init__()
        self.conv1 = nn.Conv2d(f, g, 3, 1, 1)
        self.conv2 = nn.Conv2d(f + g, g, 3, 1, 1)
        self.conv3 = nn.Conv2d(f + 2 * g, g, 3, 1, 1)
        self.conv4 = nn.Conv2d(f + 3 * g, g, 3, 1, 1)
        self.conv5 = nn.Conv2d(f + 4 * g, f, 3, 1, 1)

    def forward(self, x):
        feats = [x]
        for conv in (self.conv1, self.conv2, self.conv3, self.conv4):
            feats.append(F.leaky_relu(conv(torch.cat(feats, 1)), 0.2))
        return self.conv5(torch.cat(feats, 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(self):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = DenseBlock(), DenseBlock(), DenseBlock()

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv_first = nn.Conv2d(3, 64, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB() for _ in range(23)])
        self.conv_body = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_hr = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_last = nn.Conv2d(64, 3, 3, 1, 1)

    def forward(self, x):
        lrelu = lambda t: F.leaky_relu(t, 0.2)
        f = self.conv_first(x)
        f = f + self.conv_body(self.body(f))
        f = lrelu(self.conv_up1(F.interpolate(f, scale_factor=2, mode="nearest")))
        f = lrelu(self.conv_up2(F.interpolate(f, scale_factor=2, mode="nearest")))
        return self.conv_last(lrelu(self.conv_hr(f)))


def device() -> str:
    return "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"


def model(dev: str) -> RRDBNet:
    if not WEIGHTS.exists():
        WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {WEIGHTS_URL}")
        urllib.request.urlretrieve(WEIGHTS_URL, WEIGHTS)
    net = RRDBNet()
    net.load_state_dict(torch.load(WEIGHTS, map_location="cpu", weights_only=True)["params_ema"])
    return net.eval().to(dev)


@torch.no_grad()
def upscale4(image: np.ndarray, net: RRDBNet, dev: str, tile: int = 192, pad: int = 16) -> np.ndarray:
    """4× in overlapping tiles (the whole image doesn't fit in memory at once); returns uint8."""
    h, w, _ = image.shape
    out = np.zeros((h * 4, w * 4, 3), np.uint8)
    x = torch.from_numpy(image).permute(2, 0, 1)[None]
    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
            ya, xa, yb, xb = max(y0 - pad, 0), max(x0 - pad, 0), min(y1 + pad, h), min(x1 + pad, w)
            o = net(x[..., ya:yb, xa:xb].to(dev)).clamp(0, 1).cpu()[0].permute(1, 2, 0).numpy()
            o = o[(y0 - ya) * 4 : (y1 - ya) * 4, (x0 - xa) * 4 : (x1 - xa) * 4]
            out[y0 * 4 : y1 * 4, x0 * 4 : x1 * 4] = (o * 255).round().astype(np.uint8)
    return out


def blur(x: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur over the first two axes, in float (edges held)."""
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    x = x.astype(np.float32)
    for axis in (0, 1):
        pad = [(r, r) if i == axis else (0, 0) for i in range(x.ndim)]
        xp = np.pad(x, pad, mode="edge")
        n = x.shape[axis]
        x = sum(np.float32(w) * np.take(xp, np.arange(i, i + n), axis=axis) for i, w in enumerate(k))
    return x


def original_where_seen(far: np.ndarray, orig: np.ndarray, src: Path, box) -> np.ndarray:
    """0–1: where the far layer still shows the original photo (no cutout in front, nothing repainted)."""
    cover = np.zeros(far.shape[:2], np.float32)
    for name in ("mid", "near"):
        alpha = np.asarray(Image.open(src.with_name(f"{src.stem}-{name}.webp")).convert("RGBA").crop(box))[..., 3]
        cover = np.maximum(cover, alpha / 255)
    diff = np.abs(far - orig).mean(2)
    same = (blur(diff, 2) < 0.025) & (blur(cover, 3) < 0.005)  # compression differs by ~0.01; a repaint far more
    return blur(same, 2) * same  # feathered inward, so no seam shows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo", help="the flat photo; its far cutout sits next to it")
    ap.add_argument("--source", type=Path, required=True, help="the lossless original the cutouts were made from")
    ap.add_argument(
        "--rect",
        type=float,
        nargs=4,
        default=(0.2, 0.3, 0.85, 0.68),
        metavar=("X0", "Y0", "X1", "Y1"),
        help="the part to sharpen, as fractions of the photo: what the dive shows from about 1.5× zoom on",
    )
    ap.add_argument("--tone", type=float, default=3, help="broad tones come from the far layer above this blur (px)")
    ap.add_argument("--quality", type=int, default=65)
    a = ap.parse_args()

    src = Path(a.photo)
    far = Image.open(src.with_name(f"{src.stem}-far.webp")).convert("RGB")
    W, H = far.size
    x0, y0, x1, y1 = round(a.rect[0] * W), round(a.rect[1] * H), round(a.rect[2] * W), round(a.rect[3] * H)
    pad = 16  # context for the network at the crop's edges
    box = (max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))
    inner = ((x0 - box[0]) * 2, (y0 - box[1]) * 2, (x1 - box[0]) * 2, (y1 - box[1]) * 2)  # the rect, at 2×
    orig = np.asarray(Image.open(a.source).convert("RGB").resize((W, H), Image.LANCZOS).crop(box), np.float32) / 255
    seen = original_where_seen(np.asarray(far.crop(box), np.float32) / 255, orig, src, box)
    print(f"upscaled from the original over {seen[pad:-pad, pad:-pad].mean():.0%} of the patch")

    dev = device()
    t = time.time()
    up4 = upscale4(orig, model(dev), dev)
    print(f"upscaled {orig.shape[1]}×{orig.shape[0]} px 4× in {time.time() - t:.0f} s on {dev}")
    size2 = (orig.shape[1] * 2, orig.shape[0] * 2)
    up = np.asarray(Image.fromarray(up4).resize(size2, Image.LANCZOS).crop(inner), np.float32)
    seen = np.asarray(Image.fromarray(seen.astype(np.float32)).resize(size2, Image.BILINEAR).crop(inner))[..., None]

    # Fine detail from the upscale where it's the photo, broad tones from the far layer everywhere.
    plain = np.asarray(far.crop(box).resize(size2, Image.BICUBIC).crop(inner), np.float32)
    s = a.tone * 2
    sharp = up + blur(plain, s) - blur(up, s)
    out = np.clip(plain + seen * (sharp - plain), 0, 255).round().astype(np.uint8)

    dst = src.with_name(f"{src.stem}-far-detail.webp")
    Image.fromarray(out).save(dst, quality=a.quality, method=6)
    print(f"{dst}  {out.shape[1]}×{out.shape[0]}  {dst.stat().st_size / 1024:.0f} KB")
    r = lambda v: f"{v:.4f}".rstrip("0")
    print(f"detail rect for site.ts: {{ x: {r(x0 / W)}, y: {r(y0 / H)}, w: {r((x1 - x0) / W)}, h: {r((y1 - y0) / H)} }}")


if __name__ == "__main__":
    main()
