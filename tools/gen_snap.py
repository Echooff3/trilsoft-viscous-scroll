"""Procedural craft materials for the 'Snap' demo (cardboard, felt, burlap, denim, wood, cork). Run: python3 tools/gen_snap.py"""
import sys, math, random; sys.path.insert(0, 'tools')
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from proc import fbm, col, smooth, lay, save, blur, to_img
OUT = 'snap/tex/'
rng = np.random.default_rng(3)

def fibers(h, w, n, color, alpha, length=(4, 18), seed=1, width=1):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im); r = random.Random(seed)
    for _ in range(n):
        x, y = r.uniform(0, w), r.uniform(0, h); L = r.uniform(*length); a = r.uniform(0, math.pi)
        d.line([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)], fill=color + (int(r.uniform(*alpha)),), width=width)
    return im
def comp(base, rgba):
    a = np.asarray(rgba, np.float32); m = a[..., 3:4] / 255; return base * (1 - m) + a[..., :3] * m

# corrugated cardboard (kraft) - visible flutes, a few creases and tape-pull marks
H, W = 1200, 1600
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
n = fbm(H, W, 6, 3, seed=1)
img = np.zeros((H, W, 3), np.float32) + col('#c49a64')
img = lay(img, '#b0844f', 0.55 * smooth(n, .3, .9))
flute = 0.5 + 0.5 * np.sin(xx / 7.5 * math.pi)                       # corrugation ridges showing through the liner
img *= (0.94 + 0.06 * flute)[..., None]
img = comp(img, fibers(H, W, 5000, (120, 84, 44), (20, 60), seed=2))
img = lay(img, '#9a6d3c', 0.35 * blur((np.abs(yy - 430 - 30 * np.sin(xx / 300)) < 2).astype(np.float32), 2))   # crease
img *= (0.9 + 0.1 * fbm(H, W, 3, 2, seed=4))[..., None]
save(img, OUT + 'cardboard.jpg')

# exposed flutes strip (torn liner edge) as a band texture
h, w = 120, 1600; yy2, xx2 = np.mgrid[0:h, 0:w].astype(np.float32)
band = np.zeros((h, w, 3), np.float32) + col('#a87a46'); band *= (0.75 + 0.25 * (0.5 + 0.5 * np.sin(xx2 / 9 * math.pi)))[..., None]
save(band, OUT + 'flutes.jpg')

# felt in three colours: soft, fuzzy, matte
def felt(c1, c2, seed, name):
    h, w = 900, 1200; n = fbm(h, w, 7, 6, seed=seed)
    img = np.zeros((h, w, 3), np.float32) + col(c1); img = lay(img, c2, 0.5 * smooth(n, .35, .85))
    f = fibers(h, w, 26000, tuple(int(v) for v in col(c2)), (25, 70), (3, 10), seed + 1)
    f2 = fibers(h, w, 14000, tuple(int(min(255, v * 1.15 + 18)) for v in col(c1)), (20, 55), (3, 9), seed + 2)
    img = comp(comp(img, f), f2)
    img = np.asarray(to_img(img).filter(ImageFilter.GaussianBlur(0.6)), np.float32)
    save(img, OUT + f'felt-{name}.jpg')
felt('#2a9d8f', '#1f7f74', 10, 'teal'); felt('#e9573f', '#c8432d', 20, 'tomato'); felt('#e9b949', '#cf9d2f', 30, 'mustard'); felt('#f3e6c8', '#e0cfa8', 40, 'cream')

# burlap weave
h, w = 900, 1200; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); n = fbm(h, w, 5, 8, seed=50)
P = 12; wx = 0.5 + 0.5 * np.cos((xx + 2 * np.sin(yy / 40)) / P * 2 * math.pi); wy = 0.5 + 0.5 * np.cos((yy + 2 * np.sin(xx / 37)) / P * 2 * math.pi)
over = ((xx // P + yy // P) % 2 == 0)
thread = np.where(over, wx ** 0.6, wy ** 0.6); gap = np.clip((wx + wy) - 1.55, 0, 1) * 2
img = np.zeros((h, w, 3), np.float32) + col('#5c4325'); img = lay(img, '#c9a46a', np.clip(thread * (0.75 + 0.4 * (n - .5)) - gap, 0, 1))
img = comp(img, fibers(h, w, 6000, (220, 190, 140), (20, 70), (5, 16), 51))
save(img, OUT + 'burlap.jpg')

# denim twill
n = fbm(h, w, 6, 4, seed=60); tw = 0.5 + 0.5 * np.sin((xx + yy) / 3.2)
img = np.zeros((h, w, 3), np.float32) + col('#2f4f7f'); img = lay(img, '#5f7fab', 0.45 * tw * (0.6 + 0.6 * n)); img = lay(img, '#1d3357', 0.35 * smooth(n, .55, .9))
img = comp(img, fibers(h, w, 9000, (200, 210, 225), (15, 45), (3, 10), 61))
save(img, OUT + 'denim.jpg')

# wood (for letter blocks)
h, w = 600, 600; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); n = fbm(h, w, 6, 3, seed=70)
ring = 0.5 + 0.5 * np.sin((xx + 60 * n + 12 * np.sin(yy / 90)) / 9)
img = np.zeros((h, w, 3), np.float32) + col('#e3b778'); img = lay(img, '#b98247', 0.5 * ring ** 3); img = lay(img, '#cf9d5c', 0.3 * smooth(n, .4, .9))
save(img, OUT + 'wood.jpg')

# cork board
h, w = 900, 1200; n = fbm(h, w, 6, 10, seed=80)
img = np.zeros((h, w, 3), np.float32) + col('#b98552')
r = random.Random(81); im = to_img(img); d = ImageDraw.Draw(im)
for _ in range(16000):
    x, y = r.uniform(0, w), r.uniform(0, h); s = r.uniform(1, 3.5); c = r.choice([(140, 92, 48), (205, 160, 110), (165, 115, 66)])
    d.ellipse([x - s, y - s, x + s, y + s], fill=c)
img = np.asarray(im.filter(ImageFilter.GaussianBlur(0.5)), np.float32); img = lay(img, '#8d5f33', 0.3 * smooth(n, .6, .9))
save(img, OUT + 'cork.jpg')
print('snap ok')
