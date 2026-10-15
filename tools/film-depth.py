"""
Depth for the opening of the trail run, so the fog ring (src/effects/run-view.ts) clears the near ferns first and
lingers down the trail: one atlas of depth frames, grayscale, 0 = far (black), 1 = near (white), like depth-map.py.

    PYTORCH_ENABLE_MPS_FALLBACK=1 ~/.cache/hero-layers/venv-da3/bin/python tools/film-depth.py

Runs Video Depth Anything (Small) on the first `--seconds` of the HQ film, which covers the hand-off at any
screen size (the ring is done about 0.6 s into the film). Its depth stays steady from frame to frame, so the ring's
edge doesn't flicker as the runner sets off. Frames are streamed from ffmpeg; nothing is written but the atlas.
The atlas is in the HQ film's frame (the whole master), so `run.align` places it on the photo; the phone film is a
slice of the same frames. Prints the `depth` entry for `run` in src/content/site.ts. Re-run after any change to
the film.

Use the Small checkpoint only: it is Apache-2.0, Base and Large are CC BY-NC. Setup (the DA3 venv from
depth-map.py, plus easydict; ~116 MB of weights):
    git clone --depth 1 https://github.com/DepthAnything/Video-Depth-Anything ~/.cache/vda/repo
    curl -L -o ~/.cache/vda/video_depth_anything_vits.pth \
        https://huggingface.co/depth-anything/Video-Depth-Anything-Small/resolve/main/video_depth_anything_vits.pth
    ~/.cache/hero-layers/venv-da3/bin/pip install easydict
"""

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
VDA = Path.home() / ".cache/vda"

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--film", default=str(ROOT / "public/video/trail-run-hq.mp4"))
ap.add_argument("--out", default=str(ROOT / "public/images/trail-run-depth.webp"))
ap.add_argument("--seconds", type=float, default=1.3, help="how much of the film's start to cover")
ap.add_argument("--fps", type=float, default=24, help="depth frames per second of film (the shader blends between them)")
ap.add_argument("--tile", type=int, default=256, help="width of one depth frame in the atlas, px")
ap.add_argument("--input-size", type=int, default=336,
                help="the model's working size (multiple of 14): 518 is its default but needs ~7 GB; 336 fits an 8 GB Mac")
ap.add_argument("--quality", type=int, default=82, help="WebP quality of the atlas")
a = ap.parse_args()


def probe(path: str) -> tuple[int, int, float]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
         "-of", "json", path], check=True, capture_output=True, text=True).stdout
    info = json.loads(out)
    s = info["streams"][0]
    return s["width"], s["height"], float(info["format"]["duration"])


def frames(path: str, width: int, height: int) -> np.ndarray:
    """The first `--seconds` at `--fps`, as RGB, scaled to `width` × `height`."""
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-t", str(a.seconds),
         "-vf", f"fps={a.fps},scale={width}:{height}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, height, width, 3)


def nearness(video: np.ndarray) -> np.ndarray:
    """Video Depth Anything's relative nearness for every frame, one scale for the whole clip."""
    import torch

    sys.path.insert(0, str(VDA / "repo"))
    from video_depth_anything.video_depth import VideoDepthAnything

    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    model = VideoDepthAnything(encoder="vits", features=64, out_channels=[48, 96, 192, 384])
    model.load_state_dict(torch.load(VDA / "video_depth_anything_vits.pth", map_location="cpu"), strict=True)
    model = model.to(device).eval()
    depth, _ = model.infer_video_depth(video, a.fps, input_size=a.input_size, device=device, fp32=True)
    return np.asarray(depth, np.float32)


fw, fh, duration = probe(a.film)
th = round(a.tile * fh / fw)
video = frames(a.film, 960, round(960 * fh / fw))
d = nearness(video)
# one range for every frame (robust to a few stray pixels), so a tree keeps its shade as the camera moves
lo, hi = np.percentile(d, [0.5, 99.5])
d = np.clip((d - lo) / (hi - lo), 0, 1)

count = len(d)
cols = math.ceil(math.sqrt(count * th / a.tile))  # about square, so it stays inside every phone's texture limit
rows = math.ceil(count / cols)
atlas = Image.new("L", (cols * a.tile, rows * th))
for i, frame in enumerate(d):
    tile = Image.fromarray((frame * 255).round().astype(np.uint8)).resize((a.tile, th), Image.Resampling.BOX)
    # a touch of blur: the ring's edge is torn by noise anyway, and it keeps the WebP small
    atlas.paste(tile.filter(ImageFilter.GaussianBlur(0.6)), ((i % cols) * a.tile, (i // cols) * th))
atlas.save(a.out, "WEBP", quality=a.quality, method=6)

print(f"{count} frames of {a.tile}×{th}, atlas {atlas.width}×{atlas.height}, {Path(a.out).stat().st_size // 1024} KB")
# film progress (0–1) at the last depth frame: the shader holds it after that
until = (count - 1) / a.fps / duration
print("site.ts run.depth:", json.dumps({"cols": cols, "rows": rows, "count": count, "until": round(until, 4)}))
