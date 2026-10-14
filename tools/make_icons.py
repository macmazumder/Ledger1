#!/usr/bin/env python3
"""Rasterises the PNG fallbacks (iOS home-screen icon, older Android installers) from the same geometry as icons/*.svg.
Run:  python3 tools/make_icons.py     (needs: pip install pillow)"""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
SS = 4  # supersampling for smooth edges

def gradient(size):
    # diagonal #4F46E5 -> #0F172A (same as the SVG)
    a, b = (0x4F, 0x46, 0xE5), (0x0F, 0x17, 0x2A)
    img = Image.new('RGB', (size, size)); px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img

def render(maskable, px):
    S = 512 * SS
    img = gradient(512 * SS // 4).resize((S, S), Image.BILINEAR).convert('RGBA')
    if not maskable:  # rounded-square tile with transparent corners
        mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=112 * SS, fill=255)
        img.putalpha(mask)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    k = .74 if maskable else 1.0
    P = lambda x, y: ((256 + (x - 256) * k) * SS, (256 + (y - 256) * k) * SS)
    def stroke(pts, w, fill):
        pts = [P(*p) for p in pts]; r = w * k * SS / 2
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]): d.line([x1, y1, x2, y2], fill=fill, width=round(r * 2))
        for x, y in pts: d.ellipse([x - r, y - r, x + r, y + r], fill=fill)
    stroke([(92, 410), (420, 410)], 10, (255, 255, 255, 41)); stroke([(92, 450), (340, 450)], 10, (255, 255, 255, 41))
    W = (255, 255, 255, 255)
    stroke([(168, 146), (350, 146)], 34, W); stroke([(168, 210), (350, 210)], 34, W)
    arc = [(262 + 62 * math.cos(math.radians(a)), 208 + 62 * math.sin(math.radians(a))) for a in range(-90, 91, 3)]
    stroke([(196, 146), (262, 146)] + arc + [(196, 270), (324, 366)], 34, W)
    if not maskable:
        for cx, cy, r, col in ((400, 92, 16, (16, 185, 129, 255)), (440, 132, 11, (239, 68, 68, 255))):
            x, y = P(cx, cy); rr = r * SS; d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=col)
    img = Image.alpha_composite(img, layer)
    return img.resize((px, px), Image.LANCZOS)

for name, maskable, px in (('icon-192.png', False, 192), ('icon-512.png', False, 512), ('apple-touch-icon.png', False, 180), ('icon-maskable-512.png', True, 512)):
    render(maskable, px).save(os.path.join(OUT, name), optimize=True); print('wrote', name)
