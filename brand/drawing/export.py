"""Export the JANGE emblem (owner's drawing, gold) as in-app WebP images and PNG app icons.
usage: python -I export.py <out-dir-with-master.png> <export-dir>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(sys.argv[1])
EXP = Path(sys.argv[2])
EXP.mkdir(parents=True, exist_ok=True)
master = Image.open(OUT / "master.png").convert("RGBA")       # 1024 square, whole drawing
OFF, SCALE = (140, 20), 1.0031                                   # drawing placement inside master (from convert.py)
CROP = (OFF[0], OFF[1], OFF[0] + 743, OFF[1] + 743)              # ears to just below the mouth (square)


def head(size, sharpen=True):
    c = master.crop(CROP).resize((size, size), Image.LANCZOS)
    # The crop cuts through the ruff: fade its last 12 % so no hard edge shows.
    fade = Image.linear_gradient("L").resize((size, max(1, int(size * 0.12))))
    mask = Image.new("L", (size, size), 255)
    mask.paste(fade.transpose(Image.FLIP_TOP_BOTTOM), (0, size - fade.height))
    c.putalpha(Image.composite(c.getchannel("A"), Image.new("L", (size, size), 0), mask))
    return c.filter(ImageFilter.UnsharpMask(radius=0.7, percent=50, threshold=1)) if sharpen else c


def icon(size, frac=0.84, ring=True):
    ss = 4
    S = size * ss
    tile = Image.new("RGBA", (S, S), (7, 8, 10, 255))
    glow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(glow).ellipse((S * 0.14, S * 0.12, S * 0.86, S * 0.84), fill=55)
    tile.paste((64, 47, 20, 255), (0, 0), glow.filter(ImageFilter.GaussianBlur(S * 0.12)))
    if ring:
        m = S * 0.045
        ImageDraw.Draw(tile).ellipse((m, m, S - m, S - m), outline=(217, 192, 142, 150), width=max(1, int(S * 0.006)))
    h = head(int(S * frac), sharpen=False)
    tile.alpha_composite(h, ((S - h.width) // 2, (S - h.height) // 2 + int(S * 0.015)))
    out = tile.resize((size, size), Image.LANCZOS).convert("RGB")
    return out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=1)) if size <= 64 else out


def palette(img):
    return img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)


master.resize((512, 512), Image.LANCZOS).save(EXP / "jange-emblem-512.webp", quality=86, method=6)
head(160).save(EXP / "jange-head-160.webp", quality=90, method=6)
master.save(EXP / "jange-emblem-1024.png", optimize=True)
palette(icon(512)).save(EXP / "icon-512.png", optimize=True)
icon(192).save(EXP / "icon-192.png", optimize=True)
icon(180, frac=0.88, ring=False).save(EXP / "icon-180.png", optimize=True)        # iOS rounds the corners
palette(icon(512, frac=0.62, ring=False)).save(EXP / "icon-maskable-512.png", optimize=True)  # inside the safe zone
icon(32, frac=0.98, ring=False).save(EXP / "favicon-32.png", optimize=True)

# Eye glint positions (live-state overlay), in the 0–1000 viewBox of each image.
src_eyes = [(266, 398), (462, 398)]                                  # catch-light spots in the source drawing
full = [((OFF[0] + x * SCALE) / 1024 * 1000, (OFF[1] + y * SCALE) / 1024 * 1000) for x, y in src_eyes]
crop = [((x * SCALE) / 743 * 1000, (y * SCALE) / 743 * 1000) for x, y in src_eyes]
print("welcome glints:", [(round(a), round(b)) for a, b in full], " head glints:", [(round(a), round(b)) for a, b in crop])
for f in sorted(EXP.iterdir()):
    print(f"{f.name:26} {f.stat().st_size:>9,} bytes  {Image.open(f).size}")

# real-size sheet on the JANGE background (2x device pixels)
sheet = Image.new("RGB", (1240, 360), (11, 12, 14))
x = 20
for name, px in [("jange-head-160.webp", 60), ("jange-head-160.webp", 80), ("jange-head-160.webp", 92), ("jange-emblem-512.webp", 300)]:
    im = Image.open(EXP / name).convert("RGBA").resize((px, px), Image.LANCZOS)
    sheet.paste(im, (x, 340 - px), im); x += px + 30
for name, px in [("icon-512.png", 180), ("icon-180.png", 120), ("favicon-32.png", 32)]:
    im = Image.open(EXP / name).convert("RGB").resize((px, px), Image.LANCZOS)
    sheet.paste(im, (x, 340 - px)); x += px + 30
sheet.save(OUT / "sheet.png")
