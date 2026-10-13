"""
Split a photo into far / mid / near layers for the layered parallax hero (src/effects/photo-layers.ts).

    .venv-tools/bin/pip install torch transformers pillow numpy     # same setup as depth-map.py
    .venv-tools/bin/python tools/hero-layers.py public/images/valley.webp --cuts 0.27 0.5

Peels the photo front to back with three open models (downloaded on the first run, ~800 MB in all):
  1. Depth Anything V2 (see depth-map.py) says roughly what is near: everything nearer than a cut.
  2. ViTMatte (Apache-2.0) turns that rough guess into an exact cutout, down to single needles, and leaves
     out whatever shows between the branches (sky, a distant peak).
  3. LaMa (Apache-2.0) paints in what the cutout was hiding, so a layer can move without showing a hole.
The near trees are cut and painted out first; the mid trees are then cut from that repaired photo and
painted out to give the far layer. Output, next to the photo:
    <photo>-far.webp   opaque
    <photo>-mid.webp   transparent where it is empty
    <photo>-near.webp  transparent where it is empty
At rest the three layers stack back into the original photo. Pick --cuts from the printed depth histogram:
cut where few pixels are (a gap between bands). Re-run whenever the photo changes.

Sharper fills ("plates"): every run writes erase guides to --plates (tools/plates/): erase-near.png and
erase-mid.png show in red what to erase. Repaint those areas in an image editor (e.g. Midjourney's Editor),
keeping the framing, and save the results there as behind-near.png (the photo with the near trees gone)
and behind-mid.png (behind-near with the mid trees gone too). The next run uses them instead of LaMa,
color-matched to the photo; any part of a hole the plate left unchanged still gets LaMa.
"""

import argparse
import gc
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

# The dive in src/scenes/descent.ts and src/effects/photo-layers.ts (DEPTH), mirrored to work out which
# hidden pixels ever come into view. Keep in step with those files (the guides add a margin for small drift).
DIVE = dict(target=(0.51, 0.49), start=(0.5, 0.34), zoom_max=4.5, overscan=1.04, zoom_pow=(1, 1.35, 1.8), shift=(0.4, 1, 2))
VIEWPORTS = [(1440, 900), (1920, 1080), (1280, 720), (1024, 1366), (768, 1024), (390, 844), (375, 667)]

LAMA_URL = "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt"
LAMA_PATH = Path.home() / ".cache" / "hero-layers" / "big-lama.pt"
VITMATTE = "hustvl/vitmatte-base-composition-1k"


def device() -> str:
    import torch

    return "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"


def free():
    """Release a model's memory before loading the next one (they don't all fit at once on 8 GB)."""
    import torch

    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()


def to8(x: np.ndarray) -> np.ndarray:
    return (np.clip(x, 0, 1) * 255).round().astype(np.uint8)


def depth_of(image: np.ndarray) -> np.ndarray:
    """Relative depth, 0 = far, 1 = near (Depth Anything V2, via depth-map.py)."""
    spec = importlib.util.spec_from_file_location("depth_map", Path(__file__).with_name("depth-map.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    d = mod.depth_map(Image.fromarray(to8(image)))
    free()
    return d


def grow(mask: np.ndarray, r: int) -> np.ndarray:
    """True wherever `mask` is within r px (square window)."""
    x = mask
    for axis in (0, 1):
        p = np.pad(x, [(r, r) if i == axis else (0, 0) for i in (0, 1)])
        n = x.shape[axis]
        x = np.any([p.take(range(i, i + n), axis) for i in range(2 * r + 1)], 0)
    return x


def push_pull(color: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Fill where `weight` is 0 with a smooth blend of the known colors around it (weight 1 = known)."""
    h, w = weight.shape
    if min(h, w) <= 2:
        total = max(weight.sum(), 1e-6)
        return np.broadcast_to((color * weight[..., None]).sum((0, 1)) / total, color.shape).copy()
    ph, pw = h + h % 2, w + w % 2
    c = np.pad(color * weight[..., None], ((0, ph - h), (0, pw - w), (0, 0)), mode="edge")
    k = np.pad(weight, ((0, ph - h), (0, pw - w)), mode="edge")
    c2 = c.reshape(ph // 2, 2, pw // 2, 2, -1).mean((1, 3))
    k2 = k.reshape(ph // 2, 2, pw // 2, 2).mean((1, 3))
    coarse = push_pull(c2 / np.maximum(k2, 1e-6)[..., None], np.minimum(k2 * 4, 1))
    up = np.stack(
        [np.array(Image.fromarray(coarse[..., i]).resize((pw, ph), Image.BILINEAR)) for i in range(coarse.shape[2])],
        -1,
    )[:h, :w]
    return color * weight[..., None] + up * (1 - weight[..., None])


def trimap(depth: np.ndarray, cut: float, r: int) -> np.ndarray:
    """
    What the depth map is sure of: 255 = surely nearer than `cut`, 0 = surely not, 128 = let ViTMatte decide.
    The unsure band runs r px inside the depth map's edge and 2r px outside it (branch tips reach past it).
    A band of fixed width, not a depth range: where depth changes slowly, a depth range would cover whole
    slopes, and with no real edge to find there ViTMatte answers with a see-through haze.
    """
    near = depth > cut
    tri = np.full(depth.shape, 128, np.uint8)
    tri[~grow(~near, r)] = 255
    tri[~grow(near, 2 * r)] = 0
    return tri


def matte(image: np.ndarray, tri: np.ndarray, tile: int = 640, overlap: int = 96) -> np.ndarray:
    """Exact coverage (0–1) inside the trimap's unsure band, in overlapping tiles to fit in memory."""
    import torch
    from transformers import VitMatteForImageMatting
    from transformers import VitMatteImageProcessorPil as VitMatteImageProcessor

    dev = device()
    proc = VitMatteImageProcessor.from_pretrained(VITMATTE)
    model = VitMatteForImageMatting.from_pretrained(VITMATTE).to(dev).eval()
    h, w = tri.shape
    total = np.zeros((h, w), np.float32)
    weight = np.zeros((h, w), np.float32)
    ramp = lambda n: np.minimum(1, np.minimum(np.arange(n) + 1, np.arange(n)[::-1] + 1) / overlap)
    for y in range(0, max(1, h - overlap), tile - overlap):
        for x in range(0, max(1, w - overlap), tile - overlap):
            y0, x0 = min(y, max(0, h - tile)), min(x, max(0, w - tile))
            t = tri[y0 : y0 + tile, x0 : x0 + tile]
            if not (t == 128).any():
                continue
            img = Image.fromarray(to8(image[y0 : y0 + tile, x0 : x0 + tile]))
            inputs = proc(images=img, trimaps=Image.fromarray(t), return_tensors="pt").to(dev)
            with torch.inference_mode():
                a = model(**inputs).alphas[0, 0, : t.shape[0], : t.shape[1]].float().cpu().numpy()
            wgt = np.outer(ramp(t.shape[0]), ramp(t.shape[1])).astype(np.float32)
            total[y0 : y0 + tile, x0 : x0 + tile] += a * wgt
            weight[y0 : y0 + tile, x0 : x0 + tile] += wgt
    del model
    free()
    alpha = np.where(weight > 0, total / np.maximum(weight, 1e-6), tri / 255)
    alpha = np.where(tri == 255, 1, np.where(tri == 0, 0, alpha))
    return np.where(alpha < 0.03, 0, np.clip(alpha, 0, 1)).astype(np.float32)


_lama = {}


def lama_model():
    """LaMa, downloaded on first use and loaded once per run."""
    import torch

    if "model" not in _lama:
        if not LAMA_PATH.exists():
            LAMA_PATH.parent.mkdir(parents=True, exist_ok=True)
            torch.hub.download_url_to_file(LAMA_URL, str(LAMA_PATH))
        _lama["model"] = torch.jit.load(str(LAMA_PATH), map_location=device()).eval()
    return _lama["model"]


def inpaint_detail(image: np.ndarray, hole: np.ndarray, region: np.ndarray, tile: int = 512) -> np.ndarray:
    """
    LaMa at full resolution, in overlapping tiles around `region` (a part of `hole`): sharp enough to carry
    a ridge line or a forest edge on across a hole. Returns the image with the tiles around `region` repainted.
    """
    import torch

    model, dev = lama_model(), device()
    h, w = hole.shape
    total = np.zeros_like(image)
    weight = np.zeros((h, w), np.float32)
    step = tile // 2
    ramp = lambda n: np.minimum(1, np.minimum(np.arange(n) + 1, np.arange(n)[::-1] + 1) / (tile / 4))
    for y in range(0, max(1, h - step), step):
        for x in range(0, max(1, w - step), step):
            y0, x0 = min(y, max(0, h - tile)), min(x, max(0, w - tile))
            ys, xs = slice(y0, y0 + tile), slice(x0, x0 + tile)
            if not region[ys, xs].any():
                continue
            img, msk = image[ys, xs], hole[ys, xs]
            th, tw = (msk.shape[0] // 8) * 8, (msk.shape[1] // 8) * 8
            with torch.inference_mode():
                out = model(
                    torch.from_numpy(np.ascontiguousarray(img[:th, :tw])).permute(2, 0, 1)[None].to(dev),
                    torch.from_numpy(msk[:th, :tw].astype(np.float32))[None, None].to(dev),
                )
            fill = out[0].permute(1, 2, 0).float().cpu().numpy()
            wgt = np.outer(ramp(th), ramp(tw)).astype(np.float32)
            total[y0 : y0 + th, x0 : x0 + tw] += fill * wgt[..., None]
            weight[y0 : y0 + th, x0 : x0 + tw] += wgt
    free()
    return np.where(weight[..., None] > 0, total / np.maximum(weight, 1e-6)[..., None], image)


def inpaint(image: np.ndarray, hole: np.ndarray, long_side: int = 1344) -> np.ndarray:
    """Paint in `hole` with LaMa, at up to `long_side` px (plenty for a fill); everything else stays as is."""
    import torch

    model, dev = lama_model(), device()
    h, w = hole.shape
    s = min(1, long_side / max(h, w))
    sh, sw = max(8, round(h * s / 8) * 8), max(8, round(w * s / 8) * 8)
    img = np.asarray(Image.fromarray(to8(image)).resize((sw, sh), Image.LANCZOS), np.float32) / 255
    msk = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255).resize((sw, sh), Image.BILINEAR)) > 0
    with torch.inference_mode():
        out = model(
            torch.from_numpy(img).permute(2, 0, 1)[None].to(dev),
            torch.from_numpy(msk.astype(np.float32))[None, None].to(dev),
        )
    fill = out[0].permute(1, 2, 0).float().cpu().numpy()
    free()
    fill = np.asarray(Image.fromarray(to8(fill)).resize((w, h), Image.BICUBIC), np.float32) / 255
    return np.where(hole[..., None], fill, image)


def fill_behind(
    image: np.ndarray, alpha: np.ndarray, hole: np.ndarray, plate: Path | None, sky_line: float = 0.45
) -> np.ndarray:
    """
    Paint in `hole` (around a cutout with coverage `alpha`) from a repainted plate if there is one (see the
    module docs), else with LaMa. Returns the filled image and the area that was replaced (the hole, and
    where the seam was moved out).
    """
    if plate is None:
        return inpaint(image, hole), hole
    h, w = hole.shape
    size = (w, h)
    blur = lambda x, k=8: np.asarray(Image.fromarray(x.astype(np.float32)).reduce(k).resize(size, Image.BILINEAR))
    p = np.asarray(Image.open(plate).convert("RGB").resize(size, Image.LANCZOS), np.float32) / 255
    # Take the gaps between the branches from the plate too. Otherwise whatever the photo shows through them
    # (bits of a peak the plate redrew elsewhere) stays behind and floats free once the tree moves away. They
    # are only a few px across, so at rest the swap doesn't show.
    gap = round(w * 0.01)
    hole = hole | (~grow(~grow(hole, gap), gap))

    # Where the photo shows solid object and the plate is still practically identical to it, the plate wasn't
    # repainted there: LaMa does those bits. (An editor leaves unerased pixels all but untouched, ~0.01, while
    # even forest repainted as forest differs more. Sky between thin branches rightly comes from the plate.)
    same = blur(np.abs(p - image).mean(-1), 8) < 0.015
    skipped = hole & grow(same & (alpha > 0.6), 2)
    print(f"  {plate.name} covers {1 - skipped.sum() / max(hole.sum(), 1):.0%} of the hole")

    # The faintest branch tips reach past the cutout. Up against the sky they'd stay behind as hairlines once
    # the tree moves away, so dark specks just outside the cutout, darker than the sky around them, join the hole.
    lum = image @ np.float32([0.299, 0.587, 0.114])
    sky_lum = box_mean(lum[..., None], (~hole).astype(np.float32), 12)[..., 0]
    tips = grow(hole, max(8, w // 60)) & ~hole & (lum < sky_lum - 0.04)
    tips[round(h * sky_line) :] = False
    hole = hole | grow(tips, 2)

    # Move the seam to where plate and photo agree. Where the photo shows something at the hole's edge that the
    # plate left out or redrew differently (a ridge running behind a tree), joining them right at the edge
    # would cut it off in a wall. So the plate takes over a little further out, until both show the same thing
    # (sky meets sky, slope meets slope); the patch it replaces is the plate's take on the same scene.
    # Only up among the sky and distant ridges (above `sky_line`, as a fraction of the height): lower down, a
    # moved seam would paste the plate's river or forest over the photo's fog, and the plain seam at the hole's
    # edge already hides in the texture there.
    distant = np.zeros((h, w), bool)
    distant[: round(h * sky_line)] = True
    clash = (np.abs(image - p).mean(-1) > 0.1) & distant
    clash &= blur(clash, 4) > 0.3  # whole stretches that disagree, not single noisy pixels
    reach = max(16, w // 16)
    grown = hole.copy()
    for _ in range(reach // 4):
        more = grow(grown, 4) & clash & ~grown
        if not more.any():
            break
        grown |= more
    grown = grow(grown, 3) & ~grow(~grown, 1) | grown  # include the soft rim
    moved = grown & ~hole
    print(f"  seam moved out over {moved.sum() / hole.size:.1%} of the photo where the plate disagrees")
    hole = grown

    # Seamless tone. All around the hole the plate is pulled to the photo's exact color, and that correction
    # is spread smoothly across the hole (a membrane clone), so the plate's sky meets the photo's sky without
    # a seam. Only small differences count: a big one is new content (a ridge redrawn), not tone.
    diff = image - p
    ring = grow(hole, 32) & ~grow(hole, 4) & (np.abs(diff).mean(-1) < 0.12)
    corr = push_pull(diff, ring.astype(np.float32))
    corr = np.dstack([blur(corr[..., c], 4) for c in range(3)])  # tone, not texture
    p = np.clip(p + corr, 0, 1)
    filled = np.where(hole[..., None], p, image)
    if skipped.sum() > 50:
        filled = inpaint(filled, skipped)
    # Lower down, where the plate is clearly lighter or darker than the photo right at the hole's edge (it
    # turned the photo's fog into forest, or forest into riverbed), LaMa carries the photo on instead. Brightness
    # is compared after blurring, so forest redrawn as different forest doesn't count, only a real contradiction.
    tone = lambda x: x @ np.float32([0.299, 0.587, 0.114])
    contra = blur(np.abs(tone(image) - tone(p)), 8) > 0.12
    # The hand-over from plate to LaMa fades over a wide, round-cornered zone: a narrow or square one shows
    # as stair-steps in soft things like fog.
    edge = grow(hole, 8) & ~hole & ~distant
    reach = max(16, w // 25)
    region = np.clip(feather(grow(edge & contra, reach // 2), reach // 2) * 2, 0, 1) * hole
    print(f"  LaMa follows the photo over {(region > 0.5).sum() / max(hole.sum(), 1):.0%} of the hole")
    if region.max() > 0.02:
        lama = inpaint(image, hole)
        filled = filled * (1 - region[..., None]) + lama * region[..., None]

    # feather the join over a few px (both sides agree there)
    k = np.asarray(Image.fromarray(hole.astype(np.float32)).reduce(2).resize(size, Image.BILINEAR))
    filled = image * (1 - k[..., None]) + filled * k[..., None]

    return filled, hole


def revealed(near_a: np.ndarray, mid_a: np.ndarray, step: int = 4):
    """
    Which photo pixels of the layers behind the near one, and behind both, ever come into view during the
    dive, over a range of screen sizes and pointer positions. Returns (behind_near, behind_both) masks in
    photo pixels: the parts of the plates that are actually seen, so only those need repainting.
    """
    H, W = near_a.shape
    tx, ty = DIVE["target"]
    sx, sy = DIVE["start"]
    seen_near = np.zeros((H, W), bool)
    seen_far = np.zeros((H, W), bool)
    clamp = lambda v, lo, hi: np.minimum(np.maximum(v, lo), hi)
    io = lambda t: np.where(t < 0.5, 2 * t * t, 1 - 2 * (1 - t) ** 2)  # power1.inOut
    for vw, vh in VIEWPORTS:
        cover = vw / vh > W / H
        w = (vw if cover else vh * W / H) * DIVE["overscan"]
        h = (vw * H / W if cover else vh) * DIVE["overscan"]
        k = w / W  # css px per photo px
        ax, ay = tx * w, ty * h
        X, Y = np.meshgrid(np.arange(0, vw, step), np.arange(0, vh, step))
        pointers = [(0, 0)] if vw < 800 else [(0, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)]  # touch: no pointer
        for p in np.linspace(0, 0.64, 65):  # until the whiteout hides the overlook
            pan = io(np.clip((p - 0.04) / 0.46, 0, 1))
            dive = np.clip((p - 0.06) / 0.56, 0, 1) ** 3  # power2.in
            z = 1 + (DIVE["zoom_max"] - 1) * dive
            for px_, py_ in pointers:

                def photo(i):
                    zz = z ** DIVE["zoom_pow"][i]
                    ox, oy = px_ * -12 * DIVE["shift"][i], py_ * -6 * DIVE["shift"][i]
                    start_l = clamp(vw / 2 - sx * w, vw - w, 0)
                    start_t = clamp(vh / 2 - sy * h, vh - h, 0)
                    left = clamp(start_l + (vw / 2 - ax - start_l) * pan + ox, vw - ax - (w - ax) * zz, ax * (zz - 1))
                    top = clamp(start_t + (vh / 2 - ay - start_t) * pan + oy, vh - ay - (h - ay) * zz, ay * (zz - 1))
                    u = np.clip(((X - left - ax) / zz + ax) / k, 0, W - 1).astype(int)
                    v = np.clip(((Y - top - ay) / zz + ay) / k, 0, H - 1).astype(int)
                    return v, u

                fv, fu = photo(0)
                mv, mu = photo(1)
                nv, nu = photo(2)
                open_near = near_a[nv, nu] < 0.98
                seen_near[mv[open_near], mu[open_near]] = True
                seen_near[fv[open_near], fu[open_near]] = True
                open_both = open_near & (mid_a[mv, mu] < 0.98)
                seen_far[fv[open_both], fu[open_both]] = True
    r = step // 2 + 1  # close the sampling gaps
    return grow(seen_near, r), grow(seen_far, r)


def guide(image: np.ndarray, erase: np.ndarray, out: Path):
    """The photo with the area to erase tinted red and outlined."""
    g = image.copy()
    g[erase] = g[erase] * 0.45 + np.float32([0.55, 0, 0])
    g[grow(erase, 2) & ~erase] = (1, 0.15, 0.15)
    Image.fromarray(to8(g)).save(out)


def box_mean(x: np.ndarray, weight: np.ndarray, r: int) -> np.ndarray:
    """Weighted mean of x over a (2r+1)² window; falls back to a smooth fill where the window has no weight."""
    def box(v):
        p = np.pad(v, ((r + 1, r), (r + 1, r)) + ((0, 0),) * (v.ndim - 2), mode="edge").cumsum(0).cumsum(1)
        n = 2 * r + 1
        return p[n:, n:] - p[:-n, n:] - p[n:, :-n] + p[:-n, :-n]
    total = box(x * weight[..., None])
    wsum = box(weight)[..., None]
    return np.where(wsum > 1e-3, total / np.maximum(wsum, 1e-6), push_pull(x, weight))


def feather(mask: np.ndarray, r: int) -> np.ndarray:
    """A soft, round-cornered version of `mask` (two box blurs of radius r): 0–1, fading over ~2r px."""
    x = mask.astype(np.float32)[..., None]
    ones = np.ones(mask.shape, np.float32)
    for _ in range(2):
        x = box_mean(x, ones, r)
    return x[..., 0]


def sky_ramp(h: int, w: int, sky_line: float, soft: float = 0.04) -> np.ndarray:
    """1 well above `sky_line` (a fraction of the height), 0 well below, with a gentle ramp between."""
    y = (np.arange(h, dtype=np.float32) / h)[:, None]
    return np.broadcast_to(np.clip((sky_line - y) / (2 * soft) + 0.5, 0, 1), (h, w))


def clear_gaps(image: np.ndarray, alpha: np.ndarray, behind: np.ndarray) -> np.ndarray:
    """
    Make the gaps between needles see-through. ViTMatte only decides near a cutout's outline, so inside a tree
    the sky or fog between the branches stays solid and travels with the tree as pale specks. With a clean
    picture of what's behind (`behind`), each pixel's coverage follows from its color: how far it sits from
    the background toward the tree's own color nearby. This only ever lowers coverage, and only where tree
    and background colors are clearly apart (a dark fir against sky or fog).
    """
    # The cutout's typical color nearby. Forest in front of a plate that redrew forest comes out about the same
    # as the background there, so it counts as too alike to judge and stays as ViTMatte cut it.
    # Measured on the darker half of the solid pixels: a crown full of uncleared gaps would otherwise average
    # toward the sky and look too much like it to judge.
    solid = (alpha > 0.97).astype(np.float32)
    lum = image @ np.float32([0.299, 0.587, 0.114])
    darker = solid * (lum <= box_mean(lum[..., None], solid, 24)[..., 0])
    fg = box_mean(image, darker, 24)
    # Two pictures of what shows through a gap: the plate, and the photo's own sky or fog just outside the
    # cutout (the plate's sky may be a slightly different shade). A gap matching either one clears.
    around = box_mean(image, (alpha < 0.03).astype(np.float32), 48)
    # Only trees silhouetted against something light (sky, fog) are cleared. Elsewhere (brush in front of a
    # plate that redrew ferns) tree and background are too alike, and a cleared leaf would smear the edge.
    tone = lambda x: x @ np.float32([0.299, 0.587, 0.114])
    backlit = np.clip((np.maximum(tone(behind), tone(around)) - tone(fg) - 0.25) / 0.1, 0, 1)
    refined = alpha
    for b in (behind, around):
        d = fg - b
        d2 = (d * d).sum(-1)
        t = ((image - b) * d).sum(-1) / np.maximum(d2, 1e-4)
        # Decisive: lighter needles still count as tree, only pixels close to the background clear. A literal
        # reading would leave the whole crown half see-through (and much heavier to compress).
        by_color = np.clip((t - 0.15) / 0.3, 0, 1)
        by_color = by_color * by_color * (3 - 2 * by_color)
        # A gap shows the background itself, so only pixels that roughly match it are candidates.
        close = 1 - np.clip((np.abs(image - b).mean(-1) - 0.08) / 0.16, 0, 1)
        w = backlit * close
        refined = np.minimum(refined, alpha * (1 - w) + np.minimum(alpha, by_color) * w)
    # Anything much brighter than a backlit tree is background showing through, whatever its exact shade
    # (a glimpse of white river, a bright cloud edge).
    bright = np.clip((lum - tone(fg) - 0.3) / 0.15, 0, 1)
    refined = refined * (1 - backlit * bright)
    return np.where(refined < 0.03, 0, refined).astype(np.float32)


def keep_open(image: np.ndarray, alpha: np.ndarray, behind: np.ndarray, gap: int, sky_line: float) -> np.ndarray:
    """
    Wherever the cutout leaves the background open (wider than a gap between needles), the opening frame
    shows the background directly, so it must be the photo's own: use the photo there, feathered. Not up in
    the sky, where the plate's version replaces bits of ridge the plate can't continue (see fill_behind).
    """
    open_ = alpha < 0.03
    wide = grow(~grow(~open_, gap), gap) & open_
    h, w = alpha.shape
    k = feather(wide, 4) * open_ * (1 - sky_ramp(h, w, sky_line))
    return behind * (1 - k[..., None]) + image * k[..., None]


def unmix(image: np.ndarray, alpha: np.ndarray, behind: np.ndarray) -> np.ndarray:
    """
    The cutout's own color: what, laid over `behind` at this alpha, gives back the photo (no background halo).
    On faint pixels that amplifies small errors into colored fringes (needles over a warm sky turn red), so
    where the result is far from the solid part's color nearby, that color wins.
    """
    a = np.maximum(alpha, 0.05)[..., None]
    exact = np.clip((image - (1 - a) * behind) / a, 0, 1)
    nearby = push_pull(image, (alpha > 0.9).astype(np.float32))
    # Keep the recovered color (leaf detail) unless it is far from the cutout's colors nearby (a fringe).
    plausible = 1 - np.clip((np.abs(exact - nearby).mean(-1) - 0.12) / 0.12, 0, 1)
    trust = np.maximum(np.clip((alpha - 0.2) / 0.4, 0, 1) * plausible, np.clip((alpha - 0.8) / 0.15, 0, 1))[..., None]
    return trust * exact + (1 - trust) * nearby


def drop_specks(alpha: np.ndarray, r: int = 10, core: int = 200) -> np.ndarray:
    """
    Keep only coverage that is attached to something substantial (a tree's body, a stretch of forest).
    Loose bits would float free of their tree once the layers move apart. Starts from dense cores (at least
    `core` covered pixels within r px) and follows connected coverage outward, so thin branch tips stay whole.
    """
    covered = alpha > 0.05
    c = np.pad(covered, (r + 1, r)).cumsum(0).cumsum(1)
    n = 2 * r + 1
    keep = covered & (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n] >= core)
    for _ in range(100):
        grown = grow(keep, 2) & covered
        if (grown == keep).all():
            break
        keep = grown
    return np.where(keep, alpha, 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--cuts", type=float, nargs=2, default=(0.27, 0.5), metavar=("MID", "NEAR"))
    ap.add_argument("--quality", type=int, default=65)
    ap.add_argument("--plates", type=Path, default=Path(__file__).with_name("plates"))
    ap.add_argument(
        "--sky-line", type=float, default=0.45, help="fraction of the height above which sky and distant ridges lie"
    )
    a = ap.parse_args()
    a.plates.mkdir(exist_ok=True)
    plate = lambda name: next((f for f in sorted(a.plates.glob(f"{name}.*")) if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")), None)

    src = Path(a.photo)
    image = np.asarray(Image.open(src).convert("RGB"), np.float32) / 255
    r = max(4, round(image.shape[1] * 0.006))  # unsure band, px either side of the depth edge
    pad = max(3, r // 2)  # how far a fill reaches past a cutout's edge, to cover its soft rim

    depth = depth_of(image)
    hist, _ = np.histogram(depth, bins=20, range=(0, 1))
    print("depth histogram, % of pixels per 0.05:", (hist / depth.size * 100).round(1).tolist())

    print("near: cut out, paint behind")
    near_a = drop_specks(matte(image, trimap(depth, a.cuts[1], r)))
    no_near, _ = fill_behind(image, near_a, grow(near_a > 0.02, pad), plate("behind-near"), a.sky_line)

    print("mid: cut out of the photo without the near layer, paint behind")
    mid_a = drop_specks(matte(no_near, trimap(depth_of(no_near), a.cuts[0], r)))
    far, _ = fill_behind(no_near, mid_a, grow(mid_a > 0.02, pad), plate("behind-mid"), a.sky_line)

    # Guides: erase only the hidden parts that ever come into view (with a margin; editors blend at the edges).
    seen_near, seen_far = revealed(near_a, mid_a)
    erase_near = grow(seen_near & (near_a > 0.02), 3 * r) & grow(near_a > 0.02, 3 * r)
    erase_mid = grow(seen_far & (mid_a > 0.02), 3 * r) & grow(mid_a > 0.02, 3 * r)
    guide(image, erase_near, a.plates / "erase-near.png")
    guide(no_near, erase_mid, a.plates / "erase-mid.png")
    print(f"erase guides in {a.plates}: near {erase_near.mean():.0%} of the photo, mid {erase_mid.mean():.0%}")

    def save(rgb, alpha, name):
        px = to8(rgb)
        if alpha is not None:
            px = np.dstack([px, to8(alpha)])
        out = src.with_name(f"{src.stem}-{name}.webp")
        Image.fromarray(px).save(out, quality=a.quality, alpha_quality=60, method=6)
        print(f"{out}  {out.stat().st_size / 1024:.0f} KB")

    gap = max(4, round(image.shape[1] * 0.005))
    near_a = clear_gaps(image, near_a, no_near)
    no_near = keep_open(image, near_a, no_near, gap, a.sky_line)
    mid_a = clear_gaps(no_near, mid_a, far)
    far = keep_open(no_near, mid_a, far, gap, a.sky_line)
    save(far, None, "far")
    save(unmix(no_near, mid_a, far), mid_a, "mid")
    save(unmix(image, near_a, no_near), near_a, "near")


if __name__ == "__main__":
    main()
