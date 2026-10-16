"""JANGE realistic emblem: a German Shepherd head sculpted as a height field and lit as polished gold.

1000-unit design space, y down, mirrored about x = 500.
usage: python sculpt.py 1024 1.0 v13   (master)  ·  python sculpt.py 1024 0.6 small   (calmer fur for small sizes)
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1024
FUR = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
TAG = sys.argv[3] if len(sys.argv) > 3 else "v2"
S = N / 1000.0
rng = np.random.default_rng(11)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
U, V = (xx + 0.5) / S, (yy + 0.5) / S
AX = np.abs(U - 500)


def blur(a, sigma):
    if sigma <= 0.3:
        return a
    pad = int(min(3 * sigma, N))
    ap = np.pad(a, pad)
    h, w = ap.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * sigma ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(ap) * g, s=ap.shape)[pad:pad + N, pad:pad + N].astype(np.float32)


def bez(p0, p1, p2, p3, n=48):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def path(*segs):
    return np.concatenate([bez(*s) for s in segs])


def mirror(p):
    m = p.copy()
    m[:, 0] = 1000 - m[:, 0]
    return m


def sym(*segs):
    r = path(*segs)
    return np.concatenate([r, mirror(r)[::-1]])


def poly(pts, ss=3):
    img = Image.new("L", (N * ss, N * ss), 0)
    ImageDraw.Draw(img).polygon([(float(x) * S * ss, float(y) * S * ss) for x, y in pts], fill=255)
    return np.asarray(img.resize((N, N), Image.LANCZOS), dtype=np.float32) / 255.0


def both(pts):
    return np.maximum(poly(pts), poly(mirror(pts)))


def inflate(mask, scales):
    acc = np.zeros_like(mask)
    for s in scales:
        acc += np.clip(2 * blur(mask, s * N) - 1, 0, 1)
    return np.sqrt(np.clip(acc / len(scales), 0, 1))


def ell(cx, cy, rx, ry, rot=0.0, mir=True):
    def one(cx, rot):
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        dx, dy = U - cx, V - cy
        x, y = (dx * c + dy * s) / rx, (-dx * s + dy * c) / ry
        return np.clip(1 - (x * x + y * y), 0, 1)
    e = one(cx, rot)
    return np.maximum(e, one(1000 - cx, -rot)) if mir else e


def bump(cx, cy, rx, ry, rot=0.0, mir=True):
    e = ell(cx, cy, rx, ry, rot, mir)
    return e * e * (3 - 2 * e)  # smooth, no hard rim


def smax(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return a * (1 - h) + b * h + k * h * (1 - h)


def stroke_mask(pts, width):
    img = Image.new("L", (N * 2, N * 2), 0)
    ImageDraw.Draw(img).line([(float(x) * S * 2, float(y) * S * 2) for x, y in pts], fill=255, width=max(1, int(width * S * 2)), joint="curve")
    return blur(np.asarray(img.resize((N, N), Image.LANCZOS), dtype=np.float32) / 255.0, width * S * 0.5)


# ------------------------------------------------------------------ silhouette
ear = path(((428, 300), (400, 220), (330, 120), (284, 66)),
           ((284, 66), (274, 54), (258, 58), (254, 74)),
           ((254, 74), (224, 170), (196, 300), (202, 436)),
           ((202, 436), (280, 410), (360, 350), (428, 300)))
ear_in = path(((404, 310), (382, 245), (330, 160), (288, 112)),
              ((288, 112), (262, 190), (236, 300), (238, 405)),
              ((238, 405), (300, 382), (355, 345), (404, 310)))
head = sym(((500, 272), (580, 272), (660, 296), (730, 352)),
           ((730, 352), (786, 398), (800, 456), (794, 518)),
           ((794, 518), (788, 604), (744, 706), (672, 792)),
           ((672, 792), (622, 842), (566, 870), (500, 874)))
neck = sym(((500, 640), (630, 640), (745, 690), (790, 770)),
           ((790, 770), (840, 850), (868, 930), (880, 1000)),
           ((850, 1000), (700, 1000), (600, 1000), (500, 1000)))
nose = sym(((500, 648), (558, 644), (588, 662), (586, 694)),
           ((586, 694), (584, 726), (556, 742), (524, 744)),
           ((524, 744), (511, 745), (504, 750), (500, 758)))
eye = path(((552, 452), (566, 422), (630, 418), (656, 442)),
           ((656, 442), (650, 474), (594, 486), (552, 452)))
m_ear, m_in = both(ear), both(ear_in)
m_head, m_neck, m_nose, m_eye = poly(head), poly(neck), poly(nose), both(eye)
sil = np.clip(np.maximum.reduce([m_ear, m_head, m_neck]), 0, 1)

# ------------------------------------------------------------------ height (pixels)
P = N  # height unit
H = inflate(m_head, (0.04, 0.09, 0.16, 0.22)) * 0.11 * P
H = smax(H, inflate(m_neck, (0.04, 0.09, 0.16)) * 0.085 * P, 0.035 * P)
H += bump(500, 385, 240, 170, mir=False) * 0.04 * P                         # skull dome
H -= bump(500, 360, 22, 95, mir=False) * 0.004 * P                          # forehead furrow
H += bump(604, 398, 92, 44, -6) * 0.024 * P                                 # brows
H += bump(690, 520, 105, 90) * 0.018 * P                                     # cheekbones
H += bump(705, 640, 115, 130) * 0.022 * P
H += bump(760, 560, 70, 90) * 0.012 * P                                     # cheek fur mass

# muzzle: a ridge rising from the stop toward the nose, blended into the face
t = np.clip((V - 440) / 290, 0, 1)
w = 88 + 26 * t + 18 * np.clip((V - 720) / 70, 0, 1)                         # half width
across = np.clip(1 - (AX / (w * 1.7)) ** 2, 0, 1) ** 2.2
ra = np.clip((V - 420) / 110, 0, 1)
rb = np.clip((860 - V) / 80, 0, 1)
along = ra * ra * (3 - 2 * ra) * rb * rb * (3 - 2 * rb)
ridge = np.clip(1 - AX / (w * 1.25), 0, 1)
muz = across * along * (0.05 + 0.14 * t ** 1.2) * P
H = smax(H, H + muz, 0.006 * P)
H += bump(500, 838, 76, 36, mir=False) * 0.026 * P                           # chin
H += inflate(m_nose, (0.008, 0.016, 0.03)) * 0.016 * P                      # nose leather
for sx in (1, -1):
    H -= bump(500 + sx * 34, 716, 22, 11, -sx * 28, mir=False) * 0.016 * P    # nostrils
H -= stroke_mask(np.array([(500, 748), (500, 786)]), 5) * 0.009 * P          # philtrum
lip = path(((500, 788), (548, 806), (600, 810), (642, 796)))
H -= (stroke_mask(lip, 6) + stroke_mask(mirror(lip), 6)) * 0.016 * P
side = path(((585, 470), (600, 560), (612, 650), (628, 728)))                # crease along the muzzle side
H += bump(560, 780, 80, 44) * 0.018 * P                                    # upper lips (flews)

# eyes: socket, eyeball, lids
H -= bump(604, 448, 84, 56, -4) * 0.02 * P
H += inflate(m_eye, (0.005, 0.011, 0.018)) * 0.014 * P
lid = np.clip(blur(m_eye, 0.007 * N) * 1.7 - m_eye * 1.2, 0, 1)
H += lid * 0.008 * P

# ears: thin shells with a raised rim and a deep hollow
ear_h = inflate(m_ear, (0.004, 0.01, 0.02)) * 0.05 * P + 0.03 * P * np.clip((V - 260) / 200, 0, 1) * m_ear
H = smax(H, ear_h, 0.008 * P)
H -= inflate(m_in, (0.014, 0.026, 0.04)) * 0.04 * P

# ------------------------------------------------------------------ fur: noise smeared along the hair flow (LIC)
dxf, dyf = U - 500, V - 700
nn = np.sqrt(dxf * dxf + dyf * dyf) + 1e-3
dxf, dyf = dxf / nn, dyf / nn
sidew = np.clip((AX - 100) / 170, 0, 1)
low = np.clip((V - 500) / 260, 0, 1)
dyf = dyf + 1.5 * sidew * low + 0.9 * np.clip((V - 740) / 200, 0, 1)
tipx = np.where(U < 500, 278.0, 722.0)
ex, ey = tipx - U, 70.0 - V
en = np.sqrt(ex * ex + ey * ey) + 1e-3
ear_w = np.clip(blur(m_ear, 0.01 * N) * 1.4, 0, 1) * np.clip((440 - V) / 40, 0, 1)
dxf = dxf * (1 - ear_w) + ex / en * ear_w
dyf = dyf * (1 - ear_w) + ey / en * ear_w
nn = np.sqrt(dxf * dxf + dyf * dyf) + 1e-6
dxf, dyf = (dxf / nn).astype(np.float32), (dyf / nn).astype(np.float32)
# fur length (pixels) by region: short on muzzle and forehead, long on cheeks, ruff and ears
Lmap = (0.016 + 0.026 * sidew * low + 0.028 * np.clip((V - 760) / 160, 0, 1) + 0.014 * ear_w) * N
Lmap = np.where((AX < 105) & (V > 430) & (V < 800), 0.007 * N, Lmap)
Lmap = np.where((AX < 120) & (V < 430), 0.010 * N, Lmap)
Lmap = blur(Lmap.astype(np.float32), 0.03 * N)  # no seams where fur length changes
noise = rng.random((N, N)).astype(np.float32)
clump = blur(rng.random((N, N)).astype(np.float32), 4.5 * S)
noise = blur(noise, 0.6) * (0.6 + 2.2 * (clump - clump.mean()) / (clump.std() + 1e-6) * 0.25)
flat = noise.ravel()


def sample(img, px, py):
    px = np.clip(px, 0, N - 1.001); py = np.clip(py, 0, N - 1.001)
    x0 = px.astype(np.int32); y0 = py.astype(np.int32)
    fx, fy = px - x0, py - y0
    i = y0 * N + x0
    f = img.ravel() if img is not noise else flat
    return (f[i] * (1 - fx) * (1 - fy) + f[i + 1] * fx * (1 - fy) + f[i + N] * (1 - fx) * fy + f[i + N + 1] * fx * fy)


acc = noise.copy(); wsum = np.ones_like(noise)
steps = int(Lmap.max()) + 1
for sign in (1.0, -1.0):
    px, py = xx.copy(), yy.copy()
    for k in range(1, steps):
        ix = np.clip(px, 0, N - 1).astype(np.int32); iy = np.clip(py, 0, N - 1).astype(np.int32)
        px = px + sign * dxf[iy, ix]; py = py + sign * dyf[iy, ix]
        wk = (k < Lmap).astype(np.float32) * (1 - k / (Lmap + 1)).clip(0, 1)
        acc += sample(noise, px, py) * wk; wsum += wk
lic = acc / wsum
fur_h = lic - blur(lic, 3.0 * S)
keep = sil * (1 - np.clip(blur(m_nose, 0.008 * N) * 2.2, 0, 1)) * (1 - np.clip(blur(m_eye, 0.006 * N) * 2.2, 0, 1))
face = blur(np.clip(1 - (AX - 110) / 60, 0, 1) * np.clip((780 - V) / 40, 0, 1) * (1 - ear_w), 0.03 * N)
fur_amp = (0.8 + 1.0 * sidew * low + 0.8 * ear_w + 0.9 * np.clip((V - 760) / 160, 0, 1)) * (1 - 0.5 * face)
H += fur_h / (fur_h.std() + 1e-6) * keep * fur_amp * 0.0026 * P * FUR
edge = np.clip(blur(sil, 0.004 * N) * (1 - blur(sil, 0.004 * N)) * 4, 0, 1)
fz = np.clip(sidew * np.clip((V - 380) / 120, 0, 1) * 2.0 + np.clip((V - 700) / 100, 0, 1) + ear_w * 0.8, 0, 1)
sil = np.clip(sil + (lic - lic.mean()) / (lic.std() + 1e-6) * 0.75 * edge * fz, 0, 1)
sil = np.clip((sil - 0.5) * 2.2 + 0.5, 0, 1)
seeds = (rng.random((N, N)) > 0.972).astype(np.float32)
seeds = blur(seeds, 0.55) * 7
acc2 = seeds.copy(); w2 = np.ones_like(seeds)
L2 = int(0.042 * N)
for k in range(1, L2):
    ix = np.clip(px0 := (xx if k == 1 else px2), 0, N - 1).astype(np.int32) if False else None
    break
px2, py2 = xx.copy(), yy.copy()
for k in range(1, L2):
    ix = np.clip(px2, 0, N - 1).astype(np.int32); iy = np.clip(py2, 0, N - 1).astype(np.int32)
    # strands grow outward-down along the flow, starting inside the outline
    px2 = px2 - dxf[iy, ix]; py2 = py2 - dyf[iy, ix]
    wk = 1 - k / L2
    acc2 += sample(seeds, px2, py2) * wk; w2 += wk
strands = np.clip((acc2 / w2 * 9 - 0.25) * 2.2, 0, 1)
outside = np.clip((blur(sil, 0.016 * N) - sil) * 3, 0, 1) * (sil < 0.5)
tufts = strands * outside * np.clip(fz * 1.3, 0, 1)
strand = np.clip((tufts - 0.3) * 2.6, 0, 1)
sil = np.maximum(sil, strand)
H = np.maximum(H, blur(H, 0.006 * N) * 0.55 * strand) + blur(strand, 0.5) * 0.006 * P
H *= np.clip(sil * 1.02, 0, 1)
np.save(OUT / f"h_{TAG}.npy", H)

# ------------------------------------------------------------------ shading: reflected studio light through a gold ramp
gy, gx = np.gradient(H)
nrm = np.dstack([-gx, -gy, np.ones_like(H)])
nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
rx, ry, rz = 2 * nz * nx, 2 * nz * ny, 2 * nz * nz - 1


def lobe(d, power):
    d = np.array(d, float)
    d /= np.linalg.norm(d)
    return np.clip(rx * d[0] + ry * d[1] + rz * d[2], 0, 1) ** power


I = (0.16
     + 1.05 * lobe((-0.38, -0.52, 0.76), 5)       # key softbox, upper left
     + 0.55 * lobe((0.15, -0.95, 0.3), 9)         # top strip
     + 0.65 * lobe((0.92, -0.2, 0.33), 14)        # warm rim, right
     + 0.30 * lobe((-0.9, 0.1, 0.42), 6)          # fill, left
     + 0.22 * np.clip(nz, 0, 1) ** 2               # frontal sheen
     - 0.10 * np.clip(ry, 0, 1))
ao = np.clip(1 - (blur(H, 0.025 * N) - H) / (0.03 * N), 0.35, 1)
cav = np.clip((blur(H, 0.003 * N) - H) / (0.002 * N), 0, 1)
I = I * ao * (1 - 0.45 * cav)

# breed mask in darker antique gold: muzzle top, eye surround, forehead peak, ear backs
dark = np.clip(across * 1.8, 0, 1) * np.clip((V - 410) / 50, 0, 1) * np.clip((850 - V) / 60, 0, 1)
dark = np.maximum(dark, bump(604, 450, 112, 72, -4))
dark = np.maximum(dark, bump(500, 350, 62, 120, mir=False) * 0.9)
dark = np.maximum(dark, (m_ear - blur(m_in, 0.012 * N)).clip(0, 1) * 0.8)
dark = np.clip(blur(dark, 0.028 * N) - bump(598, 400, 30, 15, -12) * 0.9, 0, 1)   # tan brow spots
I = I * (1 - 0.6 * dark)
I = np.where(strand > 0, np.clip(I, 0, 0.75) * (0.55 + 0.45 * strand), I)

ramp_x = np.array([0.0, 0.12, 0.3, 0.5, 0.7, 0.9, 1.1, 1.5])
ramp_c = np.array([[0.035, 0.02, 0.008], [0.12, 0.07, 0.025], [0.33, 0.20, 0.07], [0.60, 0.40, 0.15],
                   [0.82, 0.60, 0.27], [0.96, 0.80, 0.46], [1.0, 0.93, 0.70], [1.0, 0.99, 0.93]])
Ic = np.clip(I, 0, 1.5)
col = np.dstack([np.interp(Ic, ramp_x, ramp_c[:, k]) for k in range(3)])

# obsidian eyes and nose with crisp catch-lights
glass = np.maximum(m_eye, m_nose)
g = 0.02 + 1.2 * lobe((-0.45, -0.6, 0.66), 70) + 0.6 * lobe((0.92, -0.2, 0.33), 90) + 0.15 * lobe((0.15, -0.95, 0.3), 25)
gcol = np.dstack([g * 0.92, g * 0.95, g])
iris = np.zeros_like(H)
for sx in (1, -1):
    iris = np.maximum(iris, ell(500 + sx * 104, 450, 31, 30, mir=False))
iris_c = np.dstack([0.16 * iris ** 0.6, 0.085 * iris ** 0.6, 0.03 * iris ** 0.6])
catch = np.zeros_like(H)
for sx in (1, -1):
    catch = np.maximum(catch, ell(500 + sx * 104 - 10, 441, 7, 6, mir=False) ** 0.5)
gcol = np.clip(gcol * np.where(m_eye[..., None] > 0, 0.6, 1.0) + iris_c * m_eye[..., None] + catch[..., None] * m_eye[..., None] * 0.95, 0, 1)
col = col * (1 - glass[..., None]) + gcol * glass[..., None]

alpha = sil * np.clip((985 - V) / 170, 0, 1)
rgba = np.dstack([np.clip(col, 0, 1), alpha])
img = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")
img.save(OUT / f"emblem_{TAG}.png")
bg = Image.new("RGBA", img.size, (8, 9, 11, 255))
bg.alpha_composite(img)
bg.convert("RGB").save(OUT / f"emblem_{TAG}_on_dark.jpg", quality=92)
print("ok", TAG, N)
