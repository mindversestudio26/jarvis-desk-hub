"""Turn the owner's German Shepherd line drawing into the JANGE gold emblem.

The white face becomes polished gold, the black ink stays as dark engraving, and
everything outside the dog becomes transparent.
usage: python -I convert.py <source.jpg> <out-dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
SS = 3  # work at 3x for clean edges

g = Image.open(src).convert("L")
W, H = g.size
g = g.resize((W * SS, H * SS), Image.LANCZOS)
L = np.asarray(g, dtype=np.float32) / 255.0
ink = np.clip((0.80 - L) / 0.55, 0, 1)          # 0 = paper, 1 = full ink (soft, keeps anti-aliasing)

# Silhouette: paper connected to the outside is background. Close small gaps in the
# outline first so the flood fill cannot leak into the face, then grow back.
binary = Image.fromarray(((ink > 0.5) * 255).astype(np.uint8))
closed = binary.filter(ImageFilter.MaxFilter(7))
pad = 6
canvas = Image.new("L", (closed.width + 2 * pad, closed.height + 2 * pad), 0)
canvas.paste(closed, (pad, pad))
ImageDraw.floodfill(canvas, (0, 0), 128)          # outside paper -> 128
bg = np.asarray(canvas, dtype=np.uint8)[pad:-pad, pad:-pad] == 128
bg_img = Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))  # give back what the closing took, so the edge sits on the outline
inside = 1 - np.asarray(bg_img.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0

# Polished gold for the face: warm champagne at the top, deeper gold below, a soft sheen
# across the brow and a gentle falloff toward the edges.
yy, xx = np.mgrid[0:L.shape[0], 0:L.shape[1]].astype(np.float32)
v = yy / L.shape[0]
u = (xx - L.shape[1] / 2) / (L.shape[1] / 2)
top, mid, low = np.array([0.98, 0.89, 0.66]), np.array([0.87, 0.70, 0.40]), np.array([0.62, 0.45, 0.20])
t = np.clip(v / 0.55, 0, 1)[..., None]
t2 = np.clip((v - 0.55) / 0.45, 0, 1)[..., None]
gold = top * (1 - t) + mid * t
gold = gold * (1 - t2) + low * t2
sheen = np.exp(-((v - 0.36) / 0.10) ** 2) * np.exp(-(u / 0.55) ** 2) * 0.10
gold = np.clip(gold + sheen[..., None] * np.array([1.0, 0.95, 0.8]), 0, 1)
gold = gold * (1 - 0.18 * np.clip(np.abs(u) - 0.35, 0, 1)[..., None])

engrave = np.array([0.055, 0.050, 0.045])        # obsidian ink with a hint of warmth
rgb = gold * (1 - ink[..., None]) + engrave * ink[..., None]
alpha = inside
rgba = np.dstack([rgb, alpha])
art = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").resize((W, H), Image.LANCZOS)
art.save(out / "dog-gold.png")

# Square master: whole drawing centred in a 1024 square (height-limited).
S = 1024
scale = S * 0.96 / H
fit = art.resize((round(W * scale), round(H * scale)), Image.LANCZOS)
master = Image.new("RGBA", (S, S), (0, 0, 0, 0))
master.alpha_composite(fit, ((S - fit.width) // 2, (S - fit.height) // 2))
master.save(out / "master.png")
print("art", art.size, "-> master", master.size, "fit", fit.size, "offset", ((S - fit.width) // 2, (S - fit.height) // 2), "scale", round(scale, 4))

bg_check = Image.new("RGBA", master.size, (8, 9, 11, 255))
bg_check.alpha_composite(master)
bg_check.convert("RGB").save(out / "master_on_dark.jpg", quality=92)
