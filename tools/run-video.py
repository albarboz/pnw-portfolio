"""
Web copies of the trail run (src/scenes/run.ts) from one master clip:

    public/video/trail-run-hq.mp4      decoded frame by frame in the browser (WebCodecs, src/effects/video-frames.ts)
    public/video/trail-run.mp4         fallback for browsers without WebCodecs: a keyframe on every frame, 768 px
    public/images/trail-run-poster.webp  first frame
    public/images/trail-run-still.webp   a frame partway through, for reduced motion

and prints where the first frame sits on the trail photo (`align` in src/content/site.ts), so the film can open
exactly on it even when it's framed tighter or in another aspect ratio.

    .venv-tools/bin/python tools/run-video.py ~/Downloads/trail-run.mp4

The master can be the Midjourney download as is, or a sharper, smoother copy of it made first (slow, and best on a
rented GPU; nothing here needs them):

  1. Upscale with SeedVR2 (Apache-2.0): https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler, `inference_cli.py`,
     3B or 7B model, to ~1440 px on the short side's double (a 720p Midjourney HD clip → 1440p). Batch size 4n+1
     (21 or more) keeps frames consistent with each other.
  2. More frames with tools/run-interpolate.py (RIFE), so a slow scroll still gets a fresh frame often.

The HQ file keeps a keyframe every half second (at most every 24 frames) and no B-frames: small, and any frame
decodes from at most 24 frames back, which keeps scrubbing backward quick. The fallback keeps 24 fps: a keyframe on
every frame costs too much at more. Re-run after any change to the master, then update the
sizes in src/content/site.ts (`run`) if the resolution changed, and docs/ASSET-CREDITS.md.
"""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# A light grade that sits the footage in the site's palette: a little less saturated, a touch more contrast.
GRADE = "eq=saturation=0.86:contrast=1.03:gamma=0.97"

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("master", help="the clip: Midjourney download, or its upscaled / interpolated copy")
ap.add_argument("--max-width", type=int, default=2160, help="HQ copy is scaled down to this width if wider")
ap.add_argument("--crf", type=int, default=24, help="HQ quality (lower = sharper and bigger)")
ap.add_argument("--still-at", type=float, help="seconds into the clip for the reduced-motion still (default: 60%%)")
ap.add_argument("--photo", default=str(ROOT / "public/images/trail.webp"), help="the photo the film opens from")
a = ap.parse_args()


def run(*args: str):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def ncc(img: np.ndarray, tpl: np.ndarray) -> np.ndarray:
    """Normalized cross-correlation of `tpl` at every position where it fits inside `img` (FFT + integral images)."""
    th, tw = tpl.shape
    t = tpl - tpl.mean()
    corr = np.fft.irfft2(np.fft.rfft2(img) * np.fft.rfft2(t[::-1, ::-1], img.shape), img.shape)[th - 1:, tw - 1:]

    def window(c):
        return c[th:, tw:] - c[:-th, tw:] - c[th:, :-tw] + c[:-th, :-tw]

    s1 = window(np.pad(img, ((1, 0), (1, 0))).cumsum(0).cumsum(1))
    s2 = window(np.pad(img * img, ((1, 0), (1, 0))).cumsum(0).cumsum(1))
    var = np.maximum(s2 - s1 * s1 / (th * tw), 1e-9)
    return corr / (np.sqrt((t * t).sum()) * np.sqrt(var))


def locate(frame: Image.Image, photo: Image.Image) -> tuple[float, float, float, float]:
    """Where `frame` sits on `photo`: left, top and width as fractions of the photo, and the match score (0–1).
    Searches scale and position: coarse, then finer around the best."""
    def gray(img: Image.Image, w: int) -> np.ndarray:
        return np.asarray(img.convert("L").resize((w, round(img.height * w / img.width)), Image.Resampling.BOX), float)

    best = (-2.0, 1.0, 0, 0)
    for width, scales in ((320, np.arange(0.4, 1.0001, 0.01)), (960, None)):
        img = gray(photo, width)
        if scales is None:
            scales = np.arange(best[1] - 0.012, best[1] + 0.0121, 0.002)
            best = (-2.0, 1.0, 0, 0)
        for sc in scales:
            tw = round(width * sc)
            tpl = gray(frame, tw)
            if tpl.shape[0] > img.shape[0] or tw > img.shape[1]:
                continue
            m = ncc(img, tpl)
            y, x = np.unravel_index(np.argmax(m), m.shape)
            if m[y, x] > best[0]:
                best = (float(m[y, x]), tw / width, int(x), int(y))
        score, sc, x, y = best
        best = (score, sc, x, y)
    img_h = round(photo.height * 960 / photo.width)
    return best[2] / 960, best[3] / img_h, best[1], best[0]


probe = json.loads(
    subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration",
         "-of", "json", a.master],
        capture_output=True, check=True, text=True,
    ).stdout
)
duration = float(probe["format"]["duration"])
probe = probe["streams"][0]
num, den = map(int, probe["r_frame_rate"].split("/"))
fps = num / den
gop = max(1, min(24, round(fps / 2)))
width = min(probe["width"], a.max_width)
print(f"master {probe['width']}×{probe['height']} @ {fps:g} fps → HQ {width} px wide, keyframe every {gop} frames")

video = ROOT / "public/video"
images = ROOT / "public/images"
x264 = ["-c:v", "libx264", "-preset", "slow", "-tune", "film", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"]

hq = video / "trail-run-hq.mp4"
run("-i", a.master, "-vf", f"scale={width}:-2:flags=lanczos,{GRADE}", *x264,
    "-crf", str(a.crf), "-g", str(gop), "-keyint_min", str(gop), "-sc_threshold", "0", "-bf", "0", str(hq))

fallback = video / "trail-run.mp4"
run("-i", a.master, "-vf", f"fps=24,scale=768:-2:flags=lanczos,{GRADE}", *x264, "-crf", "27", "-g", "1", str(fallback))

# Stills from the graded HQ copy, so they match the frames the page shows.
with tempfile.TemporaryDirectory() as tmp:
    still_at = a.still_at if a.still_at is not None else duration * 0.6
    for name, at, w in (("trail-run-poster.webp", 0, 1536), ("trail-run-still.webp", still_at, 1152)):
        png = Path(tmp) / "f.png"
        run("-ss", str(at), "-i", str(hq), "-frames:v", "1", str(png))
        img = Image.open(png).convert("RGB")
        if img.width > w:
            img = img.resize((w, round(img.height * w / img.width)), Image.Resampling.LANCZOS)
        img.save(images / name, "WEBP", quality=78, method=6)
        print(f"{name}: {img.width}×{img.height}, {(images / name).stat().st_size // 1024} KB")

for f in (hq, fallback):
    print(f"{f.name}: {f.stat().st_size / 1e6:.1f} MB")

# Where the first frame sits on the trail photo, from the master (ungraded, like the photo).
with tempfile.TemporaryDirectory() as tmp:
    png = Path(tmp) / "f0.png"
    run("-i", a.master, "-frames:v", "1", str(png))
    x, y, w, score = locate(Image.open(png), Image.open(a.photo))
print(f"first frame on the photo (match {score:.2f}; under ~0.8, check by eye):")
print(f"    align: {{ x: {x:.4f}, y: {y:.4f}, w: {w:.4f} }},")
