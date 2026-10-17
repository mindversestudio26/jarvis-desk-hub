"""Derive rigged arm layers for the expressive assistant (development tool, not loaded by the app).

The canonical character is brand/assistant/idle.webp; its face is never replaced. The pose
generations (wipe/umbrella/wrap.webp) contribute only their arms and hands: each piece is cut
with a hand-traced polygon intersected with the image alpha (and, where a hand overlaps dark
hair, a closed luminance mask), then registered onto the canonical body with a similarity
transform. Output: brand/assistant/arms.webp (atlas) and a JSON block for assistant-rig-data.js.
usage: python -I brand/assistant/arms/derive.py <repo-root> [preview-dir]
"""
import json, math, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(sys.argv[1]); PREVIEW = Path(sys.argv[2]) if len(sys.argv) > 2 else None
ART = ROOT / "brand/assistant"


def load(name):
    return Image.open(ART / f"{name}.webp").convert("RGBA")


def similarity(src, dst):
    (ax, ay), (bx, by) = src; (cx, cy), (dx, dy) = dst
    s = math.hypot(dx - cx, dy - cy) / math.hypot(bx - ax, by - ay)
    r = math.atan2(dy - cy, dx - cx) - math.atan2(by - ay, bx - ax)
    c, sn = s * math.cos(r), s * math.sin(r)
    return [c, -sn, cx - (c * ax - sn * ay), sn, c, cy - (sn * ax + c * ay)]


def scale_about(src_origin, dst_origin, s):
    return [s, 0, dst_origin[0] - s * src_origin[0], 0, s, dst_origin[1] - s * src_origin[1]]


def apply(m, p):
    return [round(m[0] * p[0] + m[1] * p[1] + m[2], 2), round(m[3] * p[0] + m[4] * p[1] + m[5], 2)]


def cut(img, poly, feather=1.1, hand_below=None, hand_lum=105):
    """Polygon x alpha; optional luminance refinement for skin over dark hair above y=hand_below."""
    w, h = img.size
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
    mask = np.asarray(m.filter(ImageFilter.GaussianBlur(feather))).astype(float) / 255
    a = np.asarray(img).astype(float)
    if hand_below is not None:
        lum = a[..., :3] @ [.299, .587, .114]
        keep = Image.fromarray(((lum > hand_lum) * 255).astype(np.uint8))
        keep = keep.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(.8))
        keep = np.asarray(keep).astype(float) / 255
        rows = np.arange(h)[:, None] < hand_below
        mask = mask * np.where(rows, keep, 1.0)
    a[..., 3] *= mask
    out = Image.fromarray(a.astype(np.uint8), "RGBA")
    box = out.getchannel("A").point(lambda v: 255 if v > 2 else 0).getbbox()
    return out, box


# Wipe: the whole raised arm (hand on the forehead, forearm, elbow, upper arm to the shoulder).
WIPE_HAND = [[164, 372], [166, 340], [170, 305], [176, 276], [184, 258], [194, 246], [206, 234], [220, 222], [234, 210], [244, 203],
             [256, 200], [262, 203], [266, 198], [276, 197], [281, 204], [279, 213], [287, 219], [292, 226], [291, 236], [287, 242],
             [291, 249], [291, 257], [284, 264], [270, 273], [259, 283], [251, 295], [246, 310], [243, 328], [240, 346], [238, 362]]
WIPE_POLY = [[20, 560], [150, 330]] + WIPE_HAND + [[245, 380], [250, 420], [240, 452], [205, 470], [188, 500], [184, 560], [186, 640], [140, 668], [60, 668], [10, 640]]
# Umbrella: the fist around the shaft (with the shaft's lower end) and the forearm to the elbow.
UMB_POLY = [[178, 486], [196, 478], [214, 476], [234, 481], [247, 492], [254, 508], [253, 530], [251, 556], [245, 572], [240, 592], [232, 612],
            [218, 626], [210, 640], [206, 665], [202, 700], [196, 720], [160, 720], [158, 690], [160, 650], [162, 612], [168, 590], [172, 540], [173, 505]]

pieces = {}
wipe_img, wipe_box = cut(load("wipe"), WIPE_POLY, hand_below=356)
M_wipe = similarity([(262, 232), (75, 615)], [(275, 234), (68, 688)])   # fingertips -> forehead, elbow -> canonical arm
pieces["wipe"] = dict(img=wipe_img, box=wipe_box, matrix=M_wipe, bones=dict(
    shoulder=apply(M_wipe, (205, 470)), elbow=apply(M_wipe, (88, 612)), wrist=apply(M_wipe, (200, 362)), hand=apply(M_wipe, (262, 232))))
umb_img, umb_box = cut(load("umbrella"), UMB_POLY, feather=1.6)
M_umb = scale_about((350, 400), (300, 425), 1.08)                     # zipper/collar registration of the body
pieces["umbrella"] = dict(img=umb_img, box=umb_box, matrix=M_umb, bones=dict(
    elbow=apply(M_umb, (183, 706)), gripLow=apply(M_umb, (219, 604)), gripHigh=apply(M_umb, (212, 478))))

# Pack crops side by side (2 px gutter).
crops = {k: v["img"].crop(v["box"]) for k, v in pieces.items()}
W = sum(c.width for c in crops.values()) + 2 * (len(crops) + 1); H = max(c.height for c in crops.values()) + 4
atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0)); x = 2; meta = {}
for k, c in crops.items():
    atlas.alpha_composite(c, (x, 2)); p = pieces[k]
    meta[k] = dict(atlas=[x, 2, c.width, c.height], source=[p["box"][0], p["box"][1]], matrix=[round(v, 6) for v in p["matrix"]], bones=p["bones"])
    x += c.width + 2
atlas.save(ART / "arms.webp", quality=90, method=6)
print(json.dumps(dict(atlas=dict(file="brand/assistant/arms.webp", width=W, height=H), pieces=meta), separators=(",", ":")))

if PREVIEW:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    idle = load("idle")
    for k, p in pieces.items():
        a, b, c, d, e, f = p["matrix"]; det = a * e - b * d
        inv = (e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det)
        warped = p["img"].transform((600, 800), Image.AFFINE, inv, resample=Image.BICUBIC)
        comp = Image.new("RGBA", (600, 800), (16, 24, 32, 255)); comp.alpha_composite(idle); comp.alpha_composite(warped)
        dr = ImageDraw.Draw(comp)
        for name, (px, py) in p["bones"].items(): dr.ellipse((px - 4, py - 4, px + 4, py + 4), outline=(0, 255, 0, 255)); dr.text((px + 6, py - 6), name, fill=(0, 255, 0, 255))
        comp.convert("RGB").save(PREVIEW / f"arm-{k}.png")
