"""
The trail run for phones: a portrait slice of the master around the runner, upscaled with Real-ESRGAN, so a phone
held upright (which shows only that slice) gets the film as crisp as the trail photo before it. Feed the result to
tools/run-interpolate.py, then to tools/run-video.py --phone.

    .venv-tools/bin/python tools/run-upscale.py ~/Downloads/altrail.mp4
    → ~/Downloads/altrail_phone.mp4 (a 9:16 slice, 2× its size: 808×1440 from 1280×720)
    .venv-tools/bin/python tools/run-upscale.py ~/Downloads/altrail.mp4 --aspect 0 --scale 1.5
    → ~/Downloads/altrail_hd.mp4 (the whole frame for wide screens: 1920×1080, ~30 s a frame)

Run it on the master as it came (24 fps), before filling in frames: four times fewer frames to upscale, and RIFE's
in-between frames come out sharp from the sharp ones. ~10 s a frame on an M-series GPU.
Upscaled 4× and reduced to 2×, like tools/detail-patch.py: it looked more natural than the 2× model.
"""

import argparse
import json
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image

from esrgan import device, model, upscale4  # tools/esrgan.py

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("master", help="the clip, at its original frame rate")
ap.add_argument("--focus", type=float, default=0.48, help="the runner's place across the frame (0–1): the slice's center")
ap.add_argument("--aspect", type=float, default=9 / 16,
                help="slice width ÷ height (9:16 covers phones held upright); 0 = the whole frame (the desktop film)")
ap.add_argument("--scale", type=float, default=2, help="size of the result relative to the slice")
ap.add_argument("--out", help="output path (default: <master>_phone.mp4 next to it)")
a = ap.parse_args()

master = Path(a.master).expanduser()
out = Path(a.out).expanduser() if a.out else master.with_name(f"{master.stem}_{'phone' if a.aspect > 0 else 'hd'}.mp4")
probe = json.loads(subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
     "-of", "json", str(master)], capture_output=True, check=True, text=True).stdout)["streams"][0]
w, h = probe["width"], probe["height"]
cw = w if a.aspect <= 0 else min(w, round(h * a.aspect / 2) * 2)
cx = min(w - cw, max(0, round(a.focus * w - cw / 2)))
ow, oh = round(cw * a.scale / 2) * 2, round(h * a.scale / 2) * 2
total = int(probe.get("nb_frames", 0))
print(f"{master.name}: {w}×{h}, slice {cw}×{h} at x {cx} → {ow}×{oh}, {total} frames")

dev = device()
net = model(dev)
reader = subprocess.Popen(
    ["ffmpeg", "-v", "error", "-i", str(master), "-vf", f"crop={cw}:{h}:{cx}:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    stdout=subprocess.PIPE)
writer = subprocess.Popen(
    ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{ow}x{oh}", "-r", probe["r_frame_rate"],
     "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p", "-an", str(out)],
    stdin=subprocess.PIPE)

start, n, size = time.time(), 0, cw * h * 3
while len(buf := reader.stdout.read(size)) == size:
    frame = np.frombuffer(buf, np.uint8).reshape(h, cw, 3).astype(np.float32) / 255
    big = Image.fromarray(upscale4(frame, net, dev)).resize((ow, oh), Image.Resampling.LANCZOS)
    writer.stdin.write(big.tobytes())
    n += 1
    if n % 5 == 0:
        left = (time.time() - start) / n * (total - n) if total else 0
        print(f"  {n}/{total or '?'} frames, ~{left / 60:.0f} min left", flush=True)

writer.stdin.close()
writer.wait()
reader.wait()
print(f"{out}: {out.stat().st_size / 1e6:.1f} MB, {(time.time() - start) / 60:.1f} min")
print(f"slice on the master: x {cx / w:.4f}, width {cw / w:.4f} (tools/run-video.py --phone finds it on the photo)")
