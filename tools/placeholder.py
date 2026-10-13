"""
Tiny placeholder for a photo: a ~32 px WebP as a data URL, shown (stretched, so it reads as a soft blur) until the
real photo has loaded. Paste the printed line into the photo's `placeholder` in src/content/site.ts.

    .venv-tools/bin/python tools/placeholder.py public/images/valley.webp

Kept tiny on purpose: it ships inside the page's JavaScript, so every byte here is a byte before first paint.
"""

import argparse
import base64
import io

from PIL import Image, ImageFilter

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("photo")
ap.add_argument("--width", type=int, default=32, help="placeholder width in px (height keeps the aspect ratio)")
ap.add_argument("--quality", type=int, default=80)
a = ap.parse_args()

img = Image.open(a.photo).convert("RGB")
w = a.width
h = round(img.height * w / img.width)
# Box-downscale, then a light blur so the browser's stretch has no hard pixel edges to show.
small = img.resize((w, h), Image.Resampling.BOX).filter(ImageFilter.GaussianBlur(0.6))
buf = io.BytesIO()
small.save(buf, "WEBP", quality=a.quality, method=6)
url = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
print(f"{w}x{h}, {len(url)} chars")
print(url)
