"""Export the IMANE emblem: the approved assistant portrait (brand/assistant/idle.webp)
rendered as a gold medallion, as in-app WebP images and PNG app icons. File names keep
their historical jange-* identifiers so markup and the service worker stay unchanged.
usage: python -I brand/portrait/export.py <repo-root> <preview-dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(sys.argv[1])
PREVIEW = Path(sys.argv[2])
PREVIEW.mkdir(parents=True, exist_ok=True)
SRC = Image.open(ROOT / "brand/assistant/idle.webp").convert("RGBA")   # 600x800 canonical portrait
# Gold ramp shared with the interface palette (obsidian -> champagne highlights).
RAMP = [(0, (10, 8, 6)), (.18, (42, 30, 14)), (.42, (120, 88, 44)), (.66, (196, 160, 98)), (.85, (236, 210, 156)), (1, (252, 240, 212))]


def gold(v):
    v = np.clip(v, 0, 1); out = np.zeros(v.shape + (3,))
    for (p0, c0), (p1, c1) in zip(RAMP[:-1], RAMP[1:]):
        m = (v >= p0) & (v <= p1); t = ((v - p0) / (p1 - p0))[m][:, None]
        out[m] = np.array(c0) * (1 - t) + np.array(c1) * t
    return out


def medal(box, size, fade_from=.8):
    """Gold duotone of a square crop with local contrast; the bottom fades softly."""
    crop = SRC.crop(box).resize((size, size), Image.LANCZOS)
    a = np.asarray(crop).astype(float) / 255
    lum = Image.fromarray((a[..., :3] @ [.299, .587, .114] * 255).astype(np.uint8))
    lum = lum.filter(ImageFilter.UnsharpMask(radius=max(2, size // 42), percent=90, threshold=0))
    tone = np.asarray(lum).astype(float) / 255
    y = np.linspace(0, 1, size)[:, None]
    alpha = a[..., 3] * np.clip((1 - y) / (1 - fade_from), 0, 1) ** 1.2
    rgba = np.dstack([gold(tone ** 1.05), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


FULL = (120, 95, 480, 455)    # hair, face and neck: welcome emblem and app icons
FACE = (150, 118, 450, 418)   # tighter: legible at 30-46 px in the header and core


def icon(size, frac=.86, ring=True, box=FULL):
    ss = 4; S = size * ss
    tile = Image.new("RGBA", (S, S), (7, 8, 10, 255))
    glow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(glow).ellipse((S * .14, S * .12, S * .86, S * .84), fill=55)
    tile.paste((64, 47, 20, 255), (0, 0), glow.filter(ImageFilter.GaussianBlur(S * .12)))
    if ring:
        m = S * .045
        ImageDraw.Draw(tile).ellipse((m, m, S - m, S - m), outline=(217, 192, 142, 150), width=max(1, int(S * .006)))
    h = medal(box, int(S * frac))
    tile.alpha_composite(h, ((S - h.width) // 2, (S - h.height) // 2 + int(S * .02)))
    out = tile.resize((size, size), Image.LANCZOS).convert("RGB")
    return out.filter(ImageFilter.UnsharpMask(radius=.6, percent=60, threshold=1)) if size <= 64 else out


def palette(img):
    return img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)


medal(FULL, 1024).resize((512, 512), Image.LANCZOS).save(ROOT / "brand/jange-emblem-512.webp", quality=86, method=6)
medal(FACE, 640, fade_from=.78).resize((160, 160), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=.7, percent=50, threshold=1)).save(ROOT / "brand/jange-head-160.webp", quality=90, method=6)
palette(icon(512)).save(ROOT / "icon-512.png", optimize=True)
icon(192).save(ROOT / "icon-192.png", optimize=True)
icon(180, frac=.9, ring=False).save(ROOT / "icon-180.png", optimize=True)           # iOS rounds the corners
palette(icon(512, frac=.64, ring=False)).save(ROOT / "icon-maskable-512.png", optimize=True)  # inside the safe zone
icon(32, frac=1.0, ring=False, box=FACE).save(ROOT / "favicon-32.png", optimize=True)

# Real-size preview on the app background (2x device pixels).
sheet = Image.new("RGB", (1240, 360), (11, 12, 14)); x = 20
for name, px in [("brand/jange-head-160.webp", 60), ("brand/jange-head-160.webp", 80), ("brand/jange-head-160.webp", 92), ("brand/jange-emblem-512.webp", 300)]:
    im = Image.open(ROOT / name).convert("RGBA").resize((px, px), Image.LANCZOS); sheet.paste(im, (x, 340 - px), im); x += px + 30
for name, px in [("icon-512.png", 180), ("icon-180.png", 120), ("favicon-32.png", 32)]:
    im = Image.open(ROOT / name).convert("RGB").resize((px, px), Image.LANCZOS); sheet.paste(im, (x, 340 - px)); x += px + 30
sheet.save(PREVIEW / "sheet.png")
for name in ["brand/jange-emblem-512.webp", "brand/jange-head-160.webp", "icon-512.png", "icon-192.png", "icon-180.png", "icon-maskable-512.png", "favicon-32.png"]:
    print(f"{name:30} {(ROOT / name).stat().st_size:>8,} bytes {Image.open(ROOT / name).size}")
