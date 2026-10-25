"""Small procedural-texture helpers shared by the look generators (numpy + Pillow only)."""
import numpy as np, random, math
from PIL import Image, ImageDraw, ImageFilter

def fbm(h, w, octaves=6, base=4, persist=0.55, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        s = base * 2 ** o
        a = r.random((max(2, int(s * h / w)), s)).astype(np.float32)
        out += np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255 * amp
        tot += amp; amp *= persist
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)

def col(hexs): hexs = hexs.lstrip('#'); return np.array([int(hexs[i:i+2], 16) for i in (0, 2, 4)], np.float32)
def smooth(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def lay(img, c, m): return img * (1 - m[..., None]) + col(c) * m[..., None]
def to_img(a): return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
def save(a, path, q=88): to_img(a).save(path, quality=q)
def blur(m, r): return np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255

def halftone(gray, cell=8, angle=45, ink=(17, 17, 17), paper=(236, 232, 222), gain=1.0):
    """gray: float HxW in 0..1 (1 = white). Returns RGB uint8 halftone (supersampled 3x for clean dots)."""
    h, w = gray.shape; S = 3
    im = Image.new('L', (w * S, h * S), 0); d = ImageDraw.Draw(im)
    th = math.radians(angle); ct, st = math.cos(th), math.sin(th)
    rng_ = int(max(w, h) * 1.5 / cell) + 2
    for i in range(-rng_, rng_):
        for j in range(-rng_, rng_):
            cx = (i * ct - j * st) * cell + w / 2; cy = (i * st + j * ct) * cell + h / 2
            if not (-cell <= cx < w + cell and -cell <= cy < h + cell): continue
            v = gray[int(min(max(cy, 0), h - 1)), int(min(max(cx, 0), w - 1))]
            r = cell * 0.72 * math.sqrt(max(0.0, (1 - v) * gain))
            if r > 0.3: d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=255)
    m = np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255
    out = np.array(paper, np.float32) * (1 - m[..., None]) + np.array(ink, np.float32) * m[..., None]
    return out
