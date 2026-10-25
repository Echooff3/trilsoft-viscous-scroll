"""Procedural textures for the Trilsoft prototype (no source imagery; all noise + random strokes).
Run: python3 tools/gen_textures.py   (needs numpy + Pillow)"""
import numpy as np, random, math
from PIL import Image, ImageDraw, ImageFilter
rng = np.random.default_rng(7); random.seed(7)
OUT = 'tex/'

def fbm(h, w, octaves=6, base=4, persist=0.55, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        s = base * 2 ** o
        a = r.random((max(2, int(s * h / w)) , s)).astype(np.float32)
        img = Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += np.asarray(img, np.float32) / 255 * amp; tot += amp; amp *= persist
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)

def col(hexs): hexs = hexs.lstrip('#'); return np.array([int(hexs[i:i+2], 16) for i in (0, 2, 4)], np.float32)
def smooth(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def lay(img, c, m): return img * (1 - m[..., None]) + col(c) * m[..., None]
def save(a, name, q=86):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(OUT + name, quality=q)

def speckle(h, w, density, mask, size=(1, 3), seed=1):
    """lichen-like clustered dots, returned as float mask"""
    im = Image.new('L', (w, h), 0); d = ImageDraw.Draw(im); r = random.Random(seed)
    n = int(w * h * density)
    for _ in range(n):
        x, y = r.randrange(w), r.randrange(h)
        if mask[y, x] < r.random(): continue
        s = r.uniform(*size); d.ellipse([x - s, y - s, x + s, y + s], fill=r.randint(120, 255))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255

def strokes(h, w, n, color, alpha, length=(40, 400), width=(1, 1), angle=0.08, seed=2, jag=1.5):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im); r = random.Random(seed)
    for _ in range(n):
        x, y = r.uniform(0, w), r.uniform(0, h); L = r.uniform(*length)
        th = r.gauss(0, angle) + (r.random() < .5) * math.pi
        pts = []; steps = max(2, int(L / 12))
        for i in range(steps):
            pts.append((x, y)); x += math.cos(th) * L / steps; y += math.sin(th) * L / steps + r.gauss(0, jag); th += r.gauss(0, 0.03)
        d.line(pts, fill=color + (int(r.uniform(*alpha)),), width=r.randint(*width))
    return im

def cracks(h, w, n, seed=3):
    im = Image.new('L', (w, h), 0); d = ImageDraw.Draw(im); r = random.Random(seed)
    def walk(x, y, th, L, wd, depth):
        pts = [(x, y)]
        for i in range(int(L)):
            th += r.gauss(0, 0.35); x += math.cos(th) * 5; y += math.sin(th) * 5; pts.append((x, y))
            if depth < 3 and r.random() < 0.03: walk(x, y, th + r.choice([-1, 1]) * r.uniform(.5, 1.2), L * .5, max(1, wd - 1), depth + 1)
        d.line(pts, fill=r.randint(150, 255), width=wd)
    for _ in range(n): walk(r.uniform(0, w), r.uniform(0, h), r.uniform(0, 6.28), r.uniform(30, 90), 2, 0)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(0.5)), np.float32) / 255

def composite(base, rgba_im):
    a = np.asarray(rgba_im, np.float32); m = a[..., 3:4] / 255
    return base * (1 - m) + a[..., :3] * m

# 1. dark scraped wall (hero / contact)
H, W = 1400, 2000
n1, n2, n3 = fbm(H, W, 7, 3), fbm(H, W, 6, 5), fbm(H, W, 5, 2)
img = np.zeros((H, W, 3), np.float32) + col('#15110e')
img = lay(img, '#2a221b', 0.8 * smooth(n1, 0.35, 0.8))                 # umber mottling
img = lay(img, '#5e2a1a', 0.55 * smooth(n2 * n3, 0.30, 0.45))          # rust bloom
plaster = smooth(fbm(H, W, 6, 3, 0.7, seed=11), 0.66, 0.70)            # torn plaster islands (hard edge)
img = lay(img, '#6f675c', 0.30 * plaster * (0.6 + 0.4 * n2))
img = lay(img, '#4a4f33', 0.7 * speckle(H, W, 0.004, smooth(n2, .55, .8), (1, 2.5), 4))  # lichen
img = lay(img, '#9a8b55', 0.5 * speckle(H, W, 0.0015, smooth(n1, .6, .85), (0.8, 2), 5))
img = composite(img, strokes(H, W, 900, (205, 196, 178), (10, 45), (30, 500), (1, 1), 0.06, 6))  # scrapes
img = composite(img, strokes(H, W, 300, (0, 0, 0), (40, 110), (20, 260), (1, 2), 0.1, 7))
img *= (0.88 + 0.24 * fbm(H, W, 3, 2, seed=12))[..., None]
img += (rng.random((H, W, 1)) - 0.5) * 14
save(img, 'dark.jpg')

# 2. plaster wall (shop)
n1, n2, n4 = fbm(H, W, 7, 3, seed=21), fbm(H, W, 6, 6, seed=22), fbm(H, W, 6, 2, seed=23)
img = np.zeros((H, W, 3), np.float32) + col('#b9b1a2')
img = lay(img, '#cfc8b9', 0.7 * smooth(n1, 0.3, 0.75))
tide = np.exp(-((n4 - 0.62) / 0.012) ** 2) + np.exp(-((n4 - 0.70) / 0.010) ** 2)
img = lay(img, '#7a6448', 0.30 * smooth(n4, 0.6, 0.85) + 0.18 * tide)  # water stains with tide lines
img = lay(img, '#6b3a24', 0.35 * smooth(n2 * n4, 0.38, 0.55))           # rust weep
img = lay(img, '#2b241d', 0.75 * cracks(H, W, 26, 24))
img = lay(img, '#5d6340', 0.75 * speckle(H, W, 0.006, smooth(n2, .6, .85), (1, 3), 25))
img = lay(img, '#a59457', 0.55 * speckle(H, W, 0.002, smooth(n1, .65, .9), (1, 2.2), 26))
img = composite(img, strokes(H, W, 500, (60, 50, 40), (10, 40), (20, 300), (1, 1), 0.08, 27))
img += (rng.random((H, W, 1)) - 0.5) * 12
save(img, 'plaster.jpg')

# 3. bone paper with ink wash (works section)
n1, n2, n3 = fbm(H, W, 7, 3, seed=31), fbm(H, W, 6, 4, seed=32), fbm(H, W, 7, 8, seed=33)
img = np.zeros((H, W, 3), np.float32) + col('#c2b59c')
img = lay(img, '#a3937a', 0.65 * smooth(n1, 0.4, 0.9))
img = lay(img, '#3a2d21', 0.32 * smooth(n2, 0.5, 0.95))                # sepia ink wash
img = lay(img, '#2a221b', 0.18 * np.exp(-((n2 - 0.7) / 0.015) ** 2))    # wash edge
img = lay(img, '#5d6340', 0.4 * speckle(H, W, 0.002, smooth(n3, .7, .9), (0.8, 2), 34))
img = composite(img, strokes(H, W, 1200, (120, 100, 80), (8, 26), (10, 120), (1, 1), 0.4, 35, 0.5))  # fibres
img *= (0.93 + 0.12 * n3)[..., None]
img += (rng.random((H, W, 1)) - 0.5) * 10
save(img, 'paper.jpg')

# 4. transparent scratch overlay
H2, W2 = 900, 1600
sc = strokes(H2, W2, 260, (222, 212, 192), (30, 120), (40, 700), (1, 2), 0.05, 41)
sc.alpha_composite(strokes(H2, W2, 160, (12, 10, 8), (60, 160), (20, 400), (1, 2), 0.07, 42))
sc.save(OUT + 'scratches.png')

# 5. torn collage strips (alpha), rust & plaster
def torn(w, h, c1, c2, seed):
    n = fbm(h, w, 6, 4, seed=seed); base = lay(np.zeros((h, w, 3), np.float32) + col(c1), c2, 0.6 * smooth(n, .4, .9))
    base = composite(base, strokes(h, w, int(w * h / 900), (20, 16, 12), (10, 50), (10, 200), (1, 1), 0.1, seed + 1))
    base += (np.random.default_rng(seed).random((h, w, 1)) - .5) * 14
    edge = fbm(h, w, 5, 12, seed=seed + 2)
    yy = np.linspace(-1, 1, h)[:, None]; xx = np.linspace(-1, 1, w)[None, :]
    m = (np.abs(yy) < 0.80 + 0.18 * (edge - .5) * 2) & (np.abs(xx) < 0.97 + 0.03 * (edge - .5) * 2)
    a = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGBA'); out.putalpha(a); return out
torn(1400, 180, '#6a2e1c', '#2a1610', 51).save(OUT + 'strip-rust.png')
torn(900, 260, '#b8b0a0', '#7d6a50', 52).save(OUT + 'strip-plaster.png')
torn(700, 140, '#d8cdb6', '#8a7458', 53).save(OUT + 'strip-bone.png')

# 6. specimen plates for the project cards (abstract stains + one etched line motif each)
plates = [('harbor', '#55603f', '#1d2016'), ('kooledit', '#8a6b33', '#231a10'), ('wildcard', '#9a9284', '#24201b'),
          ('cns', '#6b3020', '#1b0f0b'), ('fart', '#7d7154', '#1f1b13'), ('bruno', '#3f4636', '#121410')]
for i, (name, c1, c2) in enumerate(plates):
    h, w = 420, 560
    n1, n2 = fbm(h, w, 6, 3, seed=60 + i), fbm(h, w, 6, 6, seed=70 + i)
    img = np.zeros((h, w, 3), np.float32) + col(c2)
    img = lay(img, c1, 0.85 * smooth(n1, 0.25, 0.75))
    img = lay(img, '#d6ccb8', 0.18 * np.exp(-((n2 - 0.6) / 0.02) ** 2))
    img = lay(img, '#0e0b09', 0.4 * smooth(n2, 0.7, 0.95))
    img = composite(img, strokes(h, w, 120, (215, 205, 185), (10, 50), (20, 300), (1, 1), 0.08, 80 + i))
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im, 'RGBA')
    L = (226, 216, 196, 200); cx, cy = w / 2, h / 2
    if name == 'harbor':
        for r_ in (40, 80, 120, 160): d.arc([cx - r_, cy + 60 - r_, cx + r_, cy + 60 + r_], 200, 340, fill=L, width=1)
        d.line([(cx, cy - 120), (cx, cy + 120)], fill=L, width=1)
    elif name == 'kooledit':
        pts = [(x, cy + math.sin(x / 9) * 60 * math.exp(-((x - cx) / 140) ** 2) * (0.5 + random.random())) for x in range(40, w - 40, 3)]
        d.line(pts, fill=L, width=1)
    elif name == 'wildcard':
        d.rectangle([cx - 70, cy - 105, cx + 70, cy + 105], outline=L, width=1); d.polygon([(cx, cy - 40), (cx + 26, cy), (cx, cy + 40), (cx - 26, cy)], outline=L)
    elif name == 'cns':
        for r_ in (20, 55, 95): d.ellipse([cx - r_, cy - r_, cx + r_, cy + r_], outline=L, width=1)
        d.line([(cx - 140, cy), (cx + 140, cy)], fill=L); d.line([(cx, cy - 140), (cx, cy + 140)], fill=L)
    elif name == 'fart':
        for k in range(7): d.arc([cx - 30 - k * 22, cy - 30 - k * 22, cx + 30 + k * 22, cy + 30 + k * 22], 300, 60, fill=(226, 216, 196, 200 - k * 25), width=1)
    elif name == 'bruno':
        for k in range(16): x = 60 + k * 28; d.line([(x, cy + 40), (x, cy + 40 - (90 if k % 4 == 0 else 45 if k % 2 == 0 else 20))], fill=L, width=1)
        d.line([(50, cy + 40), (w - 50, cy + 40)], fill=L)
    d.text((14, h - 24), f'PL. {i + 1:02d}', fill=(226, 216, 196, 150))
    a = np.asarray(im, np.float32); a += (rng.random((h, w, 1)) - .5) * 12
    save(a, f'plate-{name}.jpg')
print('ok')
