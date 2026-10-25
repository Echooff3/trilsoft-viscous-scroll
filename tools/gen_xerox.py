"""Procedural textures for the 'Xerox' look (photocopy zine). Run from repo root: python3 tools/gen_xerox.py"""
import sys, math, random; sys.path.insert(0, 'tools')
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from proc import fbm, col, smooth, lay, save, blur, halftone, to_img
OUT = 'xerox/tex/'; PAPER = '#ebe7dc'; INK = '#141414'

def copier_streaks(h, w, seed, strength=1.0):
    """static photocopier artefacts: soft dark bands down the edges + a few faint vertical drum streaks"""
    r = np.random.default_rng(seed); x = np.arange(w)[None, :] / w
    m = 0.55 * np.exp(-x / 0.025) + 0.45 * np.exp(-(1 - x) / 0.03)
    for _ in range(4):
        cx = r.uniform(0.05, 0.95); m = m + r.uniform(0.04, 0.10) * np.exp(-((x - cx) / r.uniform(0.0008, 0.003)) ** 2)
    m = m * (0.75 + 0.5 * fbm(h, 1, 5, 3, seed=seed + 1)[:, :1])  # density varies down the page
    return np.clip(m * strength, 0, 1) * np.ones((h, 1))

def smudges(h, w, seed, n=6, alpha=0.18):
    r = random.Random(seed); im = Image.new('L', (w, h), 0); d = ImageDraw.Draw(im)
    for _ in range(n):
        x, y = r.uniform(0, w), r.uniform(0, h); rx, ry = r.uniform(60, 260), r.uniform(20, 90)
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=int(255 * r.uniform(.4, 1)))
    m = np.asarray(im.filter(ImageFilter.GaussianBlur(40)), np.float32) / 255
    return m * alpha * (0.6 + 0.8 * fbm(h, w, 4, 3, seed=seed + 5))

# 1. off-white copy paper: mottle, toner smudges, edge streaks (no per-pixel noise)
H, W = 1400, 2000
img = np.zeros((H, W, 3), np.float32) + col(PAPER)
img = lay(img, '#dcd7ca', 0.5 * smooth(fbm(H, W, 5, 3, seed=1), .45, .95))
img = lay(img, '#3a3a38', smudges(H, W, 2, 7, 0.16))
img = lay(img, '#2b2b2b', copier_streaks(H, W, 3, 0.55))
save(img, OUT + 'paper.jpg')

# 2. solid toner black with worn dropout and edge halftone fade
img = np.zeros((H, W, 3), np.float32) + col(INK)
drop = smooth(fbm(H, W, 6, 4, seed=11), .78, .84)                       # crisp toner dropout islands
img = lay(img, '#3b3a37', 0.55 * drop)
img = lay(img, '#000000', 0.5 * copier_streaks(H, W, 12, 1.0))
save(img, OUT + 'black.jpg')

# 3. halftone fade band (transparent PNG): dots shrinking from bottom edge, for hero
h, w = 520, 1600
g = np.clip(np.linspace(1.15, -0.1, h)[:, None] + 0.25 * (fbm(h, w, 4, 3, seed=21) - .5), 0, 1)
ht = halftone(g, cell=14, angle=45, ink=(20, 20, 20), paper=(0, 0, 0))
alpha = (np.abs(ht - 0).sum(2) > 30).astype(np.float32)
a = to_img(np.dstack([np.full((h, w), 20), np.full((h, w), 20), np.full((h, w), 20), alpha * 255]).astype(np.float32)); a.save(OUT + 'halftone-band.png')

# 4. halftone 'photos' for the six projects (abstract shapes + noise, rendered as coarse halftone)
def photo(name, seed):
    h, w = 450, 600; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); cx, cy = w / 2, h / 2
    n = fbm(h, w, 6, 3, seed=seed)
    if name == 'harbor':  base = 0.5 + 0.5 * np.sin(yy / 18 + 6 * n) * (yy > h * .45) + 0.35 * (yy <= h * .45) * (1 - n)
    elif name == 'kooledit':
        bars = np.abs(np.sin(xx / 9)) * np.exp(-((xx - cx) / 160) ** 2) * (0.4 + n)
        base = 1 - (np.abs(yy - cy) < bars * 160) * 0.9
    elif name == 'wildcard':
        dmd = (np.abs(xx - cx) / 120 + np.abs(yy - cy) / 170); base = np.where(dmd < 1, 0.15 + 0.3 * n, 0.85 - 0.4 * n)
    elif name == 'cns':
        r = np.hypot(xx - cx, yy - cy); base = 0.5 + 0.5 * np.cos(r / 14) * np.exp(-r / 260) - 0.25 * n
    elif name == 'fart':
        a = np.arctan2(yy - h, xx - cx); r = np.hypot(xx - cx, yy - h); base = 0.55 + 0.45 * np.sin(r / 20 - 4 * n) * (np.abs(a + 1.57) < 0.9)
    else:  # bruno: step-sequencer grid of hits
        gx, gy = (xx // 37).astype(int), (yy // 37).astype(int); hit = ((gx * 7 + gy * 3) % 5 == 0) | ((gx % 4) == 0) & (gy == 6)
        base = np.where(hit, 0.1, 0.9) - 0.2 * n
    g = np.clip(base * 0.85 + 0.25 * (n - 0.5) + 0.05, 0, 1)
    out = halftone(g, cell=7, angle=45 if seed % 2 else 15)
    out = lay(out, '#2b2b2b', copier_streaks(h, w, seed + 40, 0.4))
    save(out, OUT + f'photo-{name}.jpg')
for i, n in enumerate(['harbor', 'kooledit', 'wildcard', 'cns', 'fart', 'bruno']): photo(n, 50 + i)

# 5. translucent masking-tape strip with torn ends
def tape(seed, w=260, h=58):
    r = np.random.default_rng(seed); n = fbm(h, w, 5, 4, seed=seed)
    rgb = np.zeros((h, w, 3), np.float32) + col('#d8cfb2'); rgb = lay(rgb, '#bfb393', 0.6 * n)
    xx = np.arange(w)[None, :]; jag = lambda: np.cumsum(r.normal(0, 1.2, h))
    left, right = 6 + np.clip(jag(), -5, 5)[:, None], w - 6 + np.clip(jag(), -5, 5)[:, None]
    a = ((xx > left) & (xx < right)).astype(np.float32) * (0.72 + 0.12 * n)
    Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)).save(OUT + f'tape-{seed}.png')
for s in (1, 2, 3): tape(s)

# 6. staple (tiny metal staple with crisp shadow)
im = Image.new('RGBA', (90, 24), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rectangle([8, 12, 84, 17], fill=(0, 0, 0, 70))                     # shadow
d.rectangle([5, 8, 80, 13], fill=(120, 120, 118, 255)); d.line([5, 9, 80, 9], fill=(215, 215, 210, 255), width=1)
d.rectangle([5, 8, 8, 16], fill=(100, 100, 98, 255)); d.rectangle([77, 8, 80, 16], fill=(100, 100, 98, 255))
im.save(OUT + 'staple.png')
print('xerox ok')
