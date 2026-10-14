"""
Real-ESRGAN x4plus (BSD-3, https://github.com/xinntao/Real-ESRGAN), shared by tools/detail-patch.py and
tools/run-upscale.py. The network is written out here so the tools need no extra package; the weights (64 MB)
download on first use.
"""

import urllib.request
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

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
