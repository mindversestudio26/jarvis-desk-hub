"""Export JANGE realistic emblem assets: in-app WebP images and PNG app icons."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
OUT = HERE / "export"
OUT.mkdir(exist_ok=True)
master = Image.open(HERE / "out" / "emblem_v13.png").convert("RGBA")    # 1024, full bust
small = Image.open(HERE / "out" / "emblem_small.png").convert("RGBA")   # calmer fur for small sizes
from PIL import ImageEnhance
_a = small.getchannel("A")
small = ImageEnhance.Contrast(ImageEnhance.Brightness(small.convert("RGB")).enhance(1.22)).enhance(1.12).convert("RGBA")
small.putalpha(_a)
U = master.width / 1000


def head(img, size, sharpen=True):
    """Head only: ear tips to chin, square, for the 30–46 px placements and icons."""
    c = img.crop((int(80 * U), int(50 * U), int(920 * U), int(890 * U)))  # ear tips to chin, square
    c = c.resize((size, size), Image.LANCZOS)
    return c.filter(ImageFilter.UnsharpMask(radius=0.8, percent=60, threshold=1)) if sharpen else c


def icon(size, emblem_frac=0.86, ring=True, bleed=True):
    """Obsidian tile with a faint warm glow, optional champagne ring, head centred."""
    ss = 4
    S = size * ss
    tile = Image.new("RGBA", (S, S), (7, 8, 10, 255))
    glow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(glow).ellipse((S * 0.12, S * 0.10, S * 0.88, S * 0.86), fill=60)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.12))
    tile.paste((60, 44, 20, 255), (0, 0), glow)
    if ring:
        d = ImageDraw.Draw(tile)
        m = S * (1 - emblem_frac) / 2 * 0.55
        d.ellipse((m, m, S - m, S - m), outline=(217, 192, 142, 150), width=max(1, int(S * 0.006)))
    h = head(small if size < 100 else master, int(S * emblem_frac), sharpen=False)
    tile.alpha_composite(h, (int((S - h.width) / 2), int(-S * 0.01 + (S - h.height) / 2)))
    out = tile.resize((size, size), Image.LANCZOS).convert("RGB")
    if size <= 64:
        out = out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=70, threshold=1))
    return out


# in-app images (WebP with alpha; Safari 14+ incl. iPadOS 18)
master.resize((512, 512), Image.LANCZOS).save(OUT / "jange-emblem-512.webp", quality=84, method=6)
head(small, 160).save(OUT / "jange-head-160.webp", quality=88, method=6)
head(master, 512, sharpen=False).save(OUT / "jange-head-512.webp", quality=84, method=6)
master.save(OUT / "jange-emblem-1024.png", optimize=True)  # brand master

# app icons
def palette(img):
    return img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)


palette(icon(512)).save(OUT / "icon-512.png", optimize=True)
icon(192).save(OUT / "icon-192.png", optimize=True)
icon(180, ring=False, emblem_frac=0.9).save(OUT / "icon-180.png", optimize=True)            # iOS rounds the corners
palette(icon(512, ring=False, emblem_frac=0.70)).save(OUT / "icon-maskable-512.png", optimize=True)  # inside the 80 % safe zone
icon(32, ring=False, emblem_frac=1.0).save(OUT / "favicon-32.png", optimize=True)
for f in sorted(OUT.iterdir()):
    print(f"{f.name:28} {f.stat().st_size:>8,} bytes  {Image.open(f).size}")
