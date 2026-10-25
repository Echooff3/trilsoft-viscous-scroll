"""Procedural textures + SVG ornaments for the 'Lowrider' look (custom candy paint). Run: python3 tools/gen_lowrider.py"""
import sys, math, random; sys.path.insert(0, 'tools')
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from proc import fbm, col, smooth, lay, save, blur, to_img
OUT = 'lowrider/tex/'
GOLD = '#d8b25a'

def flake(h, w, seed, density=0.0009, colors=('#ffffff', '#f3d58a', '#ff8a8a')):
    """metalflake: sparse soft sparkles of 1.5-3.5px with a faint cross glint (static, not noise)"""
    r = random.Random(seed); im = Image.new('RGB', (w, h), (0, 0, 0)); d = ImageDraw.Draw(im)
    for _ in range(int(w * h * density)):
        x, y = r.uniform(0, w), r.uniform(0, h); s = r.uniform(0.8, 1.8); c = col(r.choice(colors)) * r.uniform(.35, 1)
        c = tuple(int(v) for v in c); d.ellipse([x - s, y - s, x + s, y + s], fill=c)
        if r.random() < 0.08: L = s * 4; d.line([x - L, y, x + L, y], fill=c); d.line([x, y - L, x, y + L], fill=c)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(0.7)), np.float32)

def candy(h, w, deep, mid, hi, seed, light=(0.3, 0.25), flake_amt=0.55):
    """candy paint: deep base, a mid-tone body, and a broad specular sweep, with soft fbm 'depth' and flake"""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); u, v = xx / w, yy / h
    n = fbm(h, w, 5, 2, seed=seed)
    body = np.exp(-(((u - light[0]) / 0.55) ** 2 + ((v - light[1]) / 0.7) ** 2))
    sweep = np.exp(-((u * 0.8 - v * 0.6 - 0.05 + 0.08 * (n - .5)) / 0.08) ** 2)        # long diagonal highlight
    img = np.zeros((h, w, 3), np.float32) + col(deep)
    img = lay(img, mid, np.clip(body * (0.75 + 0.35 * n), 0, 1))
    img = lay(img, hi, np.clip(sweep * 0.55 * (0.6 + 0.6 * body), 0, 1))
    img = img + flake(h, w, seed + 1) * flake_amt * (0.35 + body[..., None])
    return img

H, W = 1400, 2000
save(candy(H, W, '#090103', '#6e0a14', '#e0324a', 1), OUT + 'candy-red.jpg', 90)
save(candy(H, W, '#05020a', '#3d0f5e', '#a35cd6', 2, (0.7, 0.3)), OUT + 'candy-purple.jpg', 90)
save(candy(H, W, '#050505', '#151318', '#3a3440', 3, (0.5, 0.2), 0.35), OUT + 'black-flake.jpg', 90)

# project paint panels (each a different candy) with a centred gold pinstripe 'spear' motif
panels = [('harbor', '#03070a', '#0d3b4f', '#4fb3d9'), ('kooledit', '#0a0602', '#6b3a07', '#f0a43a'),
          ('wildcard', '#070707', '#2a2a2e', '#b9b9c4'), ('cns', '#090103', '#6e0a14', '#e0324a'),
          ('fart', '#030803', '#1f4d1c', '#7fd36b'), ('bruno', '#05020a', '#3d0f5e', '#a35cd6')]
for i, (name, a, b, c) in enumerate(panels):
    h, w = 450, 600; img = candy(h, w, a, b, c, 30 + i, (0.35 + 0.1 * (i % 3), 0.3), 0.3)
    im = to_img(img).convert('RGBA'); d = ImageDraw.Draw(im, 'RGBA'); g = (216, 178, 90, 230); cx, cy = w / 2, h / 2
    # symmetric pinstripe: two mirrored teardrop curls + spear lines
    for sgn in (-1, 1):
        pts = [(cx + sgn * (40 + 150 * t), cy + 46 * math.sin(t * math.pi * 1.5) * (1 - t)) for t in np.linspace(0, 1, 80)]
        d.line(pts, fill=g, width=2)
        pts = [(cx + sgn * (40 + 120 * t), cy - 30 * math.sin(t * math.pi) ) for t in np.linspace(0, 1, 60)]
        d.line(pts, fill=g, width=1)
        d.line([(cx + sgn * 190, cy), (cx + sgn * 260, cy)], fill=g, width=1)
        d.ellipse([cx + sgn * 190 - 3, cy - 3, cx + sgn * 190 + 3, cy + 3], outline=g)
    d.polygon([(cx, cy - 22), (cx + 12, cy), (cx, cy + 22), (cx - 12, cy)], outline=g)
    im.convert('RGB').save(OUT + f'panel-{name}.jpg', quality=90)

# ---------- SVG ornaments (vector, fine-line gold) ----------
def curl(x0, y0, s, sgn, turns=1.6):
    """a scroll curl: an outward swoop ending in a tightening spiral, as an SVG path"""
    pts = []
    for t in np.linspace(0, 1, 90):
        ang = turns * 2 * math.pi * t; r = s * (1 - 0.82 * t)
        pts.append((x0 + sgn * (s * 2.2 * t + r * math.sin(ang) * t), y0 - r * math.cos(ang) * t + s * 0.3 * t))
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)

def scroll_svg(path, w=900, h=120, s=38):
    cx, cy = w / 2, h / 2; p = []
    for sgn in (-1, 1):
        p.append(curl(cx + sgn * 20, cy, s, sgn)); p.append(curl(cx + sgn * 120, cy + 6, s * 0.7, sgn, 1.3))
        p.append(f'M{cx + sgn * 24},{cy} Q{cx + sgn * 200},{cy - 34} {cx + sgn * 420},{cy}')
        p.append(f'M{cx + sgn * 60},{cy + 10} Q{cx + sgn * 230},{cy + 34} {cx + sgn * 400},{cy + 6}')
        p.append(f'M{cx + sgn * 404},{cy - 4} L{cx + sgn * 444},{cy} L{cx + sgn * 404},{cy + 4}')
    p.append(f'M{cx},{cy - 16} L{cx + 9},{cy} L{cx},{cy + 16} L{cx - 9},{cy} Z')
    body = ''.join(f'<path d="{d}"/>' for d in p)
    open(path, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
                          f'<g fill="none" stroke="{GOLD}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>\n')
scroll_svg(OUT + 'pinstripe.svg')

def roman(n, cx, cy, hgt=26):
    """roman numerals drawn as strokes (no fonts inside SVG images)"""
    glyphs = {1: 'I', 2: 'II', 3: 'III', 4: 'IV'}[n]; wI, wV = 8, 18; total = sum(wI if ch == 'I' else wV for ch in glyphs) + 4 * (len(glyphs) - 1)
    x = cx - total / 2; top, bot = cy - hgt / 2, cy + hgt / 2; out = []
    for ch in glyphs:
        if ch == 'I': out.append(f'<rect x="{x + 2.5:.1f}" y="{top}" width="3" height="{hgt}"/><rect x="{x}" y="{top}" width="{wI}" height="2"/><rect x="{x}" y="{bot - 2}" width="{wI}" height="2"/>'); x += wI + 4
        else: out.append(f'<path d="M{x},{top} L{x + wV / 2},{bot} L{x + wV},{top}" fill="none" stroke="#f4e3b0" stroke-width="3"/>'); x += wV + 4
    return ''.join(out)

def gauge(n, path, size=160, maxv=4):
    c = size / 2; R = c - 6; ticks = []
    a0, a1 = math.radians(135), math.radians(405)
    for k in range(0, 41):
        a = a0 + (a1 - a0) * k / 40; big = k % 10 == 0; r1 = R - 14; r2 = R - (26 if big else 20)
        ticks.append(f'<line x1="{c + r1 * math.cos(a):.1f}" y1="{c + r1 * math.sin(a):.1f}" x2="{c + r2 * math.cos(a):.1f}" y2="{c + r2 * math.sin(a):.1f}" stroke="{"#f4e3b0" if big else "#9c8a5c"}" stroke-width="{2 if big else 1}"/>')
    red = ''.join(f'<line x1="{c + (R - 14) * math.cos(a):.1f}" y1="{c + (R - 14) * math.sin(a):.1f}" x2="{c + (R - 20) * math.cos(a):.1f}" y2="{c + (R - 20) * math.sin(a):.1f}" stroke="#e0324a" stroke-width="2"/>' for a in np.linspace(a0 + (a1 - a0) * .85, a1, 6))
    an = a0 + (a1 - a0) * (n / maxv); nx, ny = c + (R - 22) * math.cos(an), c + (R - 22) * math.sin(an)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
<defs><linearGradient id="chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f7f7"/><stop offset=".35" stop-color="#8d8d93"/><stop offset=".5" stop-color="#ffffff"/><stop offset=".7" stop-color="#55555b"/><stop offset="1" stop-color="#d9d9de"/></linearGradient>
<radialGradient id="face" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#1c1a20"/><stop offset="1" stop-color="#050506"/></radialGradient></defs>
<circle cx="{c}" cy="{c}" r="{R + 4}" fill="url(#chrome)"/><circle cx="{c}" cy="{c}" r="{R - 2}" fill="#0b0b0c"/><circle cx="{c}" cy="{c}" r="{R - 4}" fill="url(#face)"/>
{''.join(ticks)}{red}
<g fill="#f4e3b0">{roman(n, c, c + R * 0.42, 20)}</g>
<line x1="{c}" y1="{c}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="#e0324a" stroke-width="3" stroke-linecap="round"/>
<circle cx="{c}" cy="{c}" r="9" fill="url(#chrome)"/><circle cx="{c}" cy="{c}" r="3" fill="#111"/>
<path d="M{c - R + 14},{c - 10} A{R - 14},{R - 14} 0 0 1 {c + R - 14},{c - 10}" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="10"/>
</svg>\n'''
    open(path, 'w').write(svg)
for n in (1, 2, 3, 4): gauge(n, OUT + f'gauge-{n}.svg')
print('lowrider ok')
