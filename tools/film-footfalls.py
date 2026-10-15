"""
The runner's footfalls in the trail run, for a tap on phones as each one passes (src/scenes/run.ts, core/haptics.ts).

    ~/.cache/hero-layers/venv-da3/bin/python tools/film-footfalls.py

Follows the light band across the runner's jacket through the HQ film (streamed from ffmpeg, nothing written): its
height bobs once a stride, lowest as a foot lands. The slow drift (the camera, the trail's slope) is taken out, and
each low point of what's left is a footfall. Prints the `footfalls` entry for `run` in src/content/site.ts, as
fractions of the film (0–1), and the strides between them, to check they're even. Re-run after any change to the
film. Needs OpenCV and NumPy (the DA3 venv from depth-map.py has both).
"""
import argparse
import subprocess

import cv2
import numpy as np

p = argparse.ArgumentParser()
p.add_argument('--film', default='public/video/trail-run-hq.mp4')
p.add_argument('--width', type=int, default=768, help='frames are read at this width')
p.add_argument('--min-stride', type=float, default=0.2, help='seconds: footfalls closer than this are one')
a = p.parse_args()

info = subprocess.run(
    ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
     '-of', 'csv=p=0', a.film], capture_output=True, text=True, check=True).stdout.strip().split(',')
fw, fh = int(info[0]), int(info[1])
num, den = map(int, info[2].split('/'))
fps = num / den
w = a.width
h = round(fh * w / fw / 2) * 2
proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', a.film, '-vf', f'scale={w}:{h}', '-f', 'rawvideo',
                         '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)

# The band: bright, nearly colorless pixels near where it was last frame (it starts near the middle of the frame).
cx, cy = w * 0.48, h * 0.5
box = (w * 0.09, h * 0.12)  # half-size of the search window
ys = []
while True:
    raw = proc.stdout.read(w * h * 3)
    if len(raw) < w * h * 3:
        break
    im = np.frombuffer(raw, np.uint8).reshape(h, w, 3)
    x0, x1 = int(max(0, cx - box[0])), int(min(w, cx + box[0]))
    y0, y1 = int(max(0, cy - box[1])), int(min(h, cy + box[1]))
    hsv = cv2.cvtColor(im[y0:y1, x0:x1], cv2.COLOR_BGR2HSV)
    mask = ((hsv[..., 2] > 165) & (hsv[..., 1] < 70)).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(mask)
    if n > 1:
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))  # the band is the biggest light patch
        cx, cy = x0 + cen[k][0], y0 + cen[k][1]
    ys.append(cy)
proc.wait()

y = np.array(ys)
t = np.arange(len(y)) / fps
# take out the slow drift: a running mean over about two strides
win = max(3, int(round(fps * 0.6)) | 1)
drift = np.convolve(np.pad(y, win // 2, mode='edge'), np.ones(win) / win, mode='valid')
bob = y - drift
bob = np.convolve(np.pad(bob, 2, mode='edge'), np.ones(5) / 5, mode='valid')  # a little smoothing

# footfalls: the lowest points of the bob (largest y), at least min-stride apart, above the noise
gap = int(a.min_stride * fps)
floor = np.std(bob) * 0.3
falls = []
for i in range(1, len(bob) - 1):
    if bob[i] >= bob[i - 1] and bob[i] > bob[i + 1] and bob[i] > floor:
        if falls and i - falls[-1] < gap:
            if bob[i] > bob[falls[-1]]:
                falls[-1] = i
            continue
        falls.append(i)

dur = len(y) / fps
print(f'{len(y)} frames at {fps:g} fps ({dur:.2f} s); bob ±{np.std(bob):.1f} px at {w} px wide')
print('strides (s):', ' '.join(f'{(b - c) / fps:.2f}' for c, b in zip(falls, falls[1:])))
print('footfalls: [' + ', '.join(f'{i / (len(y) - 1):.4f}' for i in falls) + '],')
