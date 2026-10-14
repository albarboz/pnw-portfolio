"""
A smoother trail run: new frames between the master clip's frames, made with RIFE (Practical-RIFE v4.25, MIT,
https://github.com/hzwer/Practical-RIFE), so a slow scroll gets a fresh frame more often. Feed the result to
tools/run-video.py.

    .venv-tools/bin/python tools/run-interpolate.py ~/Downloads/altrail.mp4 --multi 2
    → ~/Downloads/altrail_2x.mp4 (48 fps from 24, near-lossless)

Frames stream through ffmpeg in and out, so nothing piles up on disk. Runs on the Mac's GPU (MPS) when it can.

Setup, once (code + weights, ~25 MB, outside the repo):
    git clone https://github.com/hzwer/Practical-RIFE ~/.cache/rife/Practical-RIFE
    v4.25 from the README's Google Drive link → unzip train_log/*.py and train_log/flownet.pkl into it
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("master", help="the clip to fill in")
ap.add_argument("--multi", type=int, default=2, help="frames out per frame in: 2 = double the frame rate")
ap.add_argument("--rife", default="~/.cache/rife/Practical-RIFE", help="Practical-RIFE checkout with train_log/")
ap.add_argument("--out", help="output path (default: <master>_<multi>x.mp4 next to it)")
a = ap.parse_args()

rife = Path(a.rife).expanduser()
sys.path.insert(0, str(rife))
from train_log.IFNet_HDv3 import IFNet  # noqa: E402  (needs the path above)

device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
net = IFNet()
state = torch.load(rife / "train_log/flownet.pkl", map_location="cpu", weights_only=True)
missing, _ = net.load_state_dict({k.replace("module.", ""): v for k, v in state.items()}, strict=False)
if missing:
    sys.exit(f"weights don't match the model: {missing[:3]} …")
net.eval().to(device)

master = Path(a.master).expanduser()
out = Path(a.out).expanduser() if a.out else master.with_name(f"{master.stem}_{a.multi}x.mp4")
probe = json.loads(subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
     "-of", "json", str(master)], capture_output=True, check=True, text=True).stdout)["streams"][0]
w, h = probe["width"], probe["height"]
num, den = map(int, probe["r_frame_rate"].split("/"))
total = int(probe.get("nb_frames", 0))
print(f"{master.name}: {w}×{h} @ {num / den:g} fps, {total} frames → {a.multi}× on {device.type}")

reader = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(master), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                          stdout=subprocess.PIPE)
writer = subprocess.Popen(
    ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
     "-r", f"{num * a.multi}/{den}", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "12",
     "-pix_fmt", "yuv420p", "-an", str(out)],
    stdin=subprocess.PIPE)

size = w * h * 3
# RIFE wants sides that divide by 128 (its coarsest flow level is 1/16 scale, then /8 inside)
ph, pw = -(-h // 128) * 128, -(-w // 128) * 128


def read():
    buf = reader.stdout.read(size)
    return np.frombuffer(buf, np.uint8).reshape(h, w, 3) if len(buf) == size else None


def to_tensor(frame):
    t = torch.from_numpy(frame.copy()).to(device).permute(2, 0, 1)[None].float() / 255
    return F.pad(t, (0, pw - w, 0, ph - h))


def to_frame(t):
    return (t[0, :, :h, :w].clamp(0, 1) * 255).round().byte().permute(1, 2, 0).cpu().numpy()


start = time.time()
prev = read()
writer.stdin.write(prev.tobytes())
a_t = to_tensor(prev)
done = 1
with torch.no_grad():
    while (cur := read()) is not None:
        b_t = to_tensor(cur)
        pair = torch.cat((a_t, b_t), 1)
        for k in range(1, a.multi):
            _, _, merged = net(pair, k / a.multi, [16, 8, 4, 2, 1])
            writer.stdin.write(to_frame(merged[-1]).tobytes())
        writer.stdin.write(cur.tobytes())
        a_t = b_t
        done += 1
        if done % 10 == 0:
            print(f"  {done}/{total or '?'} frames, {time.time() - start:.0f} s", flush=True)

writer.stdin.close()
writer.wait()
reader.wait()
print(f"{out}: {out.stat().st_size / 1e6:.1f} MB, {time.time() - start:.0f} s")
