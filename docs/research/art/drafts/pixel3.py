#!/usr/bin/env python3
"""Themed pixel-art concepts, drawn pixel by pixel with a fixed palette per theme. Mock-up only, not game code.
Usage: pixel3.py <theme> <raw.png> <scaled.png>   themes: orange, frost, jungle, spooky, starport"""
import math, os, random, sys
from PIL import Image, ImageDraw, ImageChops

W, H = int(os.environ.get('PIX_W', 400)), int(os.environ.get('PIX_H', 300))
OX, OY = W // 2, H // 2 - 197 + int(os.environ.get('PIX_DY', 0))
AREA = W * H / 120000.0; DX, DY = OX - 200, OY + 47
TZ = 20

RAMPS = {
    'g': ['#f0e07a', '#d6c85a', '#bdb24b', '#98993f', '#6f7f3a', '#4d6238'],
    's': ['#ffe9bf', '#fbd08e', '#f0ae62', '#cf8444', '#9c5a36', '#6e3d2e'],
    'o': ['#ffd76a', '#ffab33', '#f47a1c', '#d9501a', '#a8301f', '#6e2330'],
    't': ['#b4f0e0', '#62d1c0', '#2fa89c', '#207a80', '#1a5266'],
    'b': ['#a9d8ff', '#5aa2ee', '#356cc4', '#27468c'],
    'v': ['#c9a4f0', '#9a6bd6', '#6b45a8', '#472d78'],
    'c': ['#fff8e6', '#f3e0be', '#d3b894', '#a48a78', '#75606a'],
    'l': ['#c2de62', '#8fc04a', '#5a9a44', '#3a7748', '#28554a'],
    'w': ['#d99a5a', '#b06a34', '#7a4426', '#4f2c22'],
    'k': ['#f8d2a6', '#d99a66', '#9a5e38', '#5e3a26'],
    'a': ['#8fe3d6', '#52c4bd', '#35a0aa', '#27788c'],
    'p': ['#ffb0c0', '#ff7a9a', '#d94a78'],
    'i': ['#6e4470', '#4a2c52', '#2a1a36'],
}
THEMES = {
    'orange': dict(ramps={}, trees=[('round', 0.45), ('autumn', 0.2), ('pine', 0.35)], details=[('tuft', 0.6), ('flower', 0.25), ('rock', 0.15)], sky='balloon', shadow=('i2', 0.3)),
    'frost': dict(
        ramps={'g': ['#ffffff', '#eef6ff', '#dbe9f7', '#bcd2ea', '#93b0d2', '#6f8fb8'], 's': ['#f4f1ea', '#dcd6cc', '#bdb5ab', '#958d8a', '#6d6670', '#4d4856'],
               'l': ['#bfe6cf', '#74b596', '#3f8a72', '#2a6660', '#1d4a52'], 'a': ['#f2fbff', '#c9ecf7', '#9fd6ea', '#6fb4d6']},
        trees=[('pine', 0.6), ('snowround', 0.25), ('bare', 0.15)], details=[('sparkle', 0.6), ('drift', 0.3), ('rock', 0.1)], sky='balloon', shadow=('b3', 0.26),
        water='ice', snowcap=True, snowfall=True, skaters=True, props=[('snowman', 9), ('crystal', 5)], bare=('w3', 'w4')),
    'jungle': dict(
        ramps={'g': ['#d9f07a', '#aede5c', '#7cc24a', '#4f9f45', '#2f7a45', '#1f5a40'], 's': ['#fff3c9', '#f7dfa0', '#e6c078', '#c79a58', '#9a7040', '#6e4c30'],
               'l': ['#d6f06a', '#9ad84c', '#58b040', '#2f8a48', '#1f6048'], 'a': ['#aef5e6', '#5fe0d0', '#2fc0c0', '#1f95a8']},
        trees=[('palm', 0.5), ('round', 0.35), ('pine', 0.0), ('fern', 0.15)], details=[('tuft', 0.4), ('flower', 0.45), ('leaf', 0.15)], sky='parrots', shadow=('l5', 0.34),
        path='planks', water='lagoon', props=[('torch', 12), ('fern', 14)]),
    'spooky': dict(
        ramps={'g': ['#587a5e', '#3f5e50', '#2e4846', '#22383e', '#192834', '#121b28'], 's': ['#b7a8c2', '#8f7fa0', '#6a5c80', '#4c4264', '#352e4c', '#231f36'],
               'l': ['#8a6fb0', '#6a4f96', '#4a3878', '#33285c', '#221c40'], 'a': ['#9fe870', '#5fc060', '#3a9458', '#256850'],
               'o': ['#ffd76a', '#ff9a2e', '#d8641c', '#a84418', '#6e2c1c', '#431c22'], 'c': ['#f0eaff', '#cfc4e6', '#a79bc6', '#7c7098', '#564c70'],
               't': ['#c8ff9a', '#8fe070', '#58b85a', '#3a8a50', '#28603f'], 'b': ['#b7b0ff', '#7a70e0', '#4c44a8', '#2f2a70'], 'w': ['#a8845a', '#7a5a40', '#54382e', '#33222a'],
               'k': ['#d8b8a0', '#b08868', '#7c5540', '#4c3430']},
        trees=[('bare', 0.4), ('round', 0.35), ('pine', 0.25)], details=[('tuft', 0.5), ('mushroom', 0.3), ('rock', 0.2)], sky='bats', night=True,
        path='cobble', water='swamp', fog=True, props=[('pumpkin', 26), ('ghost', 4)], bare=('c4', 'c5'), mascots='boo'),
    'stoneage': dict(
        ramps={'g': ['#e9dc8f', '#d2c56f', '#b9aa58', '#96894a', '#6f6a3e', '#4f4c33'], 's': ['#e8d6b8', '#cdb693', '#b0946f', '#8c7254', '#69543f', '#4a3b2e'],
               'l': ['#b9d46a', '#84b04c', '#55883f', '#3a683c', '#274a34'], 'a': ['#b8f0e0', '#6fd6c8', '#3fb0aa', '#2a8590'],
               'o': ['#ffd27a', '#f2a23a', '#d9702a', '#b04a22', '#7d2f1f', '#4f1f1c'], 'c': ['#f3eadb', '#d9cdb8', '#b3a48e', '#8a7c6c', '#5f5550'],
               't': ['#c9e6a8', '#93c47a', '#5f9a5a', '#3f7448', '#2a5038'], 'b': ['#c9d3da', '#8f9fad', '#62717f', '#434e5a'],
               'v': ['#d9b08c', '#b0845c', '#7d5a3c', '#523a28'], 'p': ['#f0b89a', '#d98a66', '#a85a3f']},
        trees=[('palm', 0.3), ('fern', 0.2), ('round', 0.3), ('bare', 0.2)], details=[('tuft', 0.5), ('rock', 0.35), ('flower', 0.15)], sky='ptero', shadow=('i2', 0.3),
        path='cobble', water='lagoon', torchlamps=True, props=[('boulder', 16), ('bone', 12), ('campfire', 5), ('mammoth', 3), ('dino', 3)]),
    'starport': dict(
        ramps={'g': ['#5a6b9a', '#3f4d7a', '#2f3a62', '#232b4c', '#1a2038', '#12162a'], 's': ['#e6f7ff', '#a9c4e6', '#7a92c2', '#56689a', '#3c4972', '#2a3352'],
               'l': ['#9affea', '#4fe6d0', '#2ab8b0', '#1f8690', '#1a5a70'], 'a': ['#e0c8ff', '#b088ff', '#8455e6', '#5a30b0'],
               'o': ['#fff3a8', '#ff9ae6', '#ff52cc', '#d232ac', '#8e2484', '#571a5c'], 'c': ['#ffffff', '#dfe8f5', '#b4c2d8', '#8794b0', '#5f6a88'],
               'p': ['#ffb0f0', '#ff6ad8', '#c83ab0'], 'w': ['#9aa8c8', '#6f7da4', '#4a5680', '#30385a'], 'k': ['#e8c8b0', '#c09070', '#885c40', '#543830']},
        trees=[('crystal', 0.4), ('bulb', 0.3), ('antenna', 0.15), ('dome', 0.15)], details=[('dot', 0.6), ('crater', 0.3), ('rock', 0.1)], sky='ufo', night=True,
        path='panels', water='plasma', props=[('robot', 7)]),
}
TH = THEMES[sys.argv[1]]
RAMPS.update(TH['ramps'])
NIGHT = TH.get('night', False)

def rgb(h): return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))
C = {}
for name, ramp in RAMPS.items():
    for n, h in enumerate(ramp): C[f'{name}{n + 1}'] = rgb(h)
INK = C['i3']
PALETTE = list(dict.fromkeys(C.values()))
_snap = {}
def snap(c):
    if c not in _snap: _snap[c] = min(PALETTE, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)
    return _snap[c]
def mix(a, b, t): return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))
def scr(x, y, z=0): return (int(round(OX + (x - y) * 16)), int(round(OY + (x + y) * 8 - z)))
def h3(a, b, c=0):
    n = (a * 374761393 + b * 668265263 + c * 2147483647) & 0xffffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535.0
def vnoise(x, y):
    xi, yi = math.floor(x), math.floor(y); fx, fy = x - xi, y - yi
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = h3(xi, yi), h3(xi + 1, yi), h3(xi, yi + 1), h3(xi + 1, yi + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
def inside(x, y): return 0 <= x < W and 0 <= y < H

POND = {(x, y) for x in range(19, 24) for y in range(13, 18) if not ((x in (19, 23)) and (y in (13, 17)))}
def tile_type(x, y):
    if (x, y) in POND: return 'water'
    if 11 <= x <= 13 and 11 <= y <= 13: return 'plaza'
    if y == 12: return 'path'
    if x == 12 and y >= 3: return 'path'
    if x == 8 and y == 11: return 'path'
    if x == 9 and y in (13, 14): return 'path'
    if y == 16 and x in (13, 14, 15): return 'path'
    if x == 15 and y in (10, 11): return 'path'
    return 'grass'

frame = Image.new('RGB', (W, H), C['g2'])
PATH, WATER = TH.get('path', 'paving'), TH.get('water', 'water')

def ground():
    px = frame.load()
    for sy in range(H):
        for sx in range(W):
            a = (sx + 0.5 - OX) / 16.0; b = (sy + 0.5 - OY) / 8.0
            x, y = (a + b) / 2, (b - a) / 2
            tx, ty = math.floor(x), math.floor(y); fx, fy = x - tx, y - ty
            t = tile_type(tx, ty)
            near = [(fy, tile_type(tx, ty - 1)), (1 - fy, tile_type(tx, ty + 1)), (fx, tile_type(tx - 1, ty)), (1 - fx, tile_type(tx + 1, ty))]
            if t == 'grass':
                n = vnoise(x * 0.42, y * 0.42) * 0.75 + vnoise(x * 1.9 + 7, y * 1.9 + 3) * 0.25
                thr = (BAYER[sy % 4][sx % 4] + 0.5) / 16 - 0.5
                v = n + thr * 0.16
                col = C['g1'] if v < 0.3 else C['g2'] if v < 0.56 else C['g3']
                if sys.argv[1] == 'starport' and (fx < 0.045 or fy < 0.045): col = C['g2'] if (sx + sy) % 2 else C['g3']
                for dist, nt in near:
                    if nt == 'water':
                        if WATER == 'lagoon' and dist < 0.42: col = C['s2'] if dist > 0.2 or (sx + sy) % 2 else C['s1']
                        elif dist < 0.2: col = C['g4'] if dist > 0.09 else (C['t2'] if WATER == 'plasma' else C['g1'] if WATER == 'ice' else C['s4'])
            elif t == 'water':
                col = C['a2']
                if WATER == 'ice':
                    if h3((sx + sy) // 7, sx - sy, 11) < 0.07: col = C['a1']
                    elif h3(sx // 9, sy, 23) < 0.035: col = C['a3']
                elif WATER == 'swamp':
                    col = C['a4'] if vnoise(x * 2.1, y * 2.1) > 0.5 else C['a3']
                    if h3(sx // 3, sy, 5) < 0.05: col = C['a2']
                    mx, my = scr(21.3, 15.2); dd = math.hypot((sx - mx) / 13.0, (sy - my) / 5.0)
                    if dd < 1 and (dd < 0.6 or (sx + sy) % 2): col = C['c1'] if dd < 0.45 else C['c2']
                elif WATER == 'plasma':
                    if h3(sx // 5, sy, 11) < 0.1: col = C['a1']
                    elif h3((sx + 3) // 7, sy, 23) < 0.09: col = C['a3']
                else:
                    if h3(sx // 4, sy, 11) < 0.075: col = C['a1']
                    elif h3((sx + 2) // 6, sy, 23) < 0.06: col = C['a3']
                for k, (dist, nt) in enumerate(near):
                    if nt != 'water' and dist < 0.2: col = C['a4'] if k in (0, 2) else C['a1'] if dist < 0.09 else col
            else:
                if PATH == 'planks' and t == 'path':
                    along = fx if tile_type(tx - 1, ty) != 'grass' or tile_type(tx + 1, ty) != 'grass' else fy
                    k = int(along * 4); col = C['w3'] if (along * 4) % 1 < 0.16 else C['w1'] if h3(tx * 4 + k, ty, 3) < 0.4 else C['w2']
                elif PATH == 'cobble':
                    cxn, cyn = int(fx * 4), int(fy * 4); r = h3(tx * 4 + cxn, ty * 4 + cyn, 9)
                    col = C['s2'] if r < 0.3 else C['s3'] if r < 0.75 else C['s4']
                    if (fx * 4) % 1 < 0.2 or (fy * 4) % 1 < 0.2: col = C['s5']
                    if t == 'plaza' and (int(x * 2) + int(y * 2)) % 2 == 0 and col != C['s5']: col = C['s1'] if r < 0.5 else C['s2']
                elif PATH == 'panels':
                    col = C['s3'] if t == 'path' else (C['s2'] if (int(x) + int(y)) % 2 == 0 else C['s3'])
                    if fx < 0.07 or fy < 0.07: col = C['s5']
                    if abs(fx - 0.5) < 0.07 and abs(fy - 0.5) < 0.07: col = C['t2']
                    if t == 'plaza':
                        rr = math.hypot(x - 12.5, y - 12.5)
                        if abs(rr - 1.25) < 0.07: col = C['t2']
                else:
                    sub = (int(fx * 2), int(fy * 2)); joint = (fx * 2) % 1 < 0.13 or (fy * 2) % 1 < 0.13
                    if t == 'plaza':
                        col = C['c1'] if (int(x * 2) + int(y * 2)) % 2 == 0 else C['s1']
                        if joint: col = C['s2']
                    else:
                        r = h3(tx * 2 + sub[0], ty * 2 + sub[1], 5)
                        col = C['s1'] if r < 0.22 else C['s2']
                        if joint: col = C['s3']
                for dist, nt in near:
                    if nt == 'grass' and dist < 0.11: col = C['t2'] if PATH == 'panels' and (sx // 2) % 3 else C['w4'] if PATH == 'planks' else C['s5'] if PATH in ('cobble', 'panels') else C['s4']
            px[sx, sy] = col

shadow = Image.new('L', (W, H), 0); SD = ImageDraw.Draw(shadow)
def sh_ell(x, y, r, k=1.0):
    cx, cy = scr(x + r * 0.55 * k, y - r * 0.55 * k); rx, ry = int(r * 22.6 * (1 + 0.35 * k)), max(1, int(r * 11.3))
    SD.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
def sh_box(x, y, w, d, hpx):
    s = hpx / TZ * 0.75
    SD.polygon([scr(x, y + d), scr(x, y), scr(x + s, y - s), scr(x + w + s, y - s), scr(x + w + s, y + d - s), scr(x + w, y + d)], fill=255)
def apply_shadows():
    if NIGHT: return
    px, sp = frame.load(), shadow.load(); key, amt = TH['shadow']
    for sy in range(H):
        for sx in range(W):
            if sp[sx, sy]: px[sx, sy] = snap(mix(px[sx, sy], C[key], amt))
lights = []
def glow(x, y, r, tint='o1', z=0):
    if NIGHT: lights.append((scr(x, y, z), r, C[tint]))
def apply_lights():
    px = frame.load()
    for (cx, cy), r, tint in lights:
        for yy in range(max(0, cy - r // 2 - 1), min(H, cy + r // 2 + 2)):
            for xx in range(max(0, cx - r), min(W, cx + r + 1)):
                dd = math.hypot(xx - cx, (yy - cy) * 2) / r
                if dd >= 1: continue
                f = 1 - dd; thr = (BAYER[yy % 4][xx % 4] + 0.5) / 16
                lvl = 2 if f > 0.62 + thr * 0.14 else 1 if f > 0.3 + thr * 0.16 else 0.45 if f > thr * 0.3 else 0
                if lvl: px[xx, yy] = snap(mix(px[xx, yy], tint, 0.2 * lvl + 0.1))

class Layer:
    def __init__(self, outline=True, snow=True):
        self.im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im); self.outline = outline; self.snow = snow
    def flush(self):
        a = self.im.getchannel('A')
        if TH.get('snowcap') and self.outline and self.snow:
            up = ImageChops.offset(a, 0, 1); ImageDraw.Draw(up).line([(0, 0), (W, 0)], fill=0)
            top = ImageChops.subtract(a, up); self.im.paste(C['g1'] + (255,), (0, 0), top)
            row2 = ImageChops.multiply(ImageChops.offset(top, 0, 1), a)
            m2 = Image.new('L', (W, H), 0); mp, rp = m2.load(), row2.load()
            for yy in range(H):
                for xx in range(yy % 2, W, 2):
                    if rp[xx, yy]: mp[xx, yy] = 255
            self.im.paste(C['g2'] + (255,), (0, 0), m2)
        if self.outline:
            dil = a
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): dil = ImageChops.lighter(dil, ImageChops.offset(a, dx, dy))
            edge = ImageChops.subtract(dil, a); ImageDraw.Draw(edge).rectangle([0, 0, W - 1, H - 1], outline=0)
            frame.paste(INK, (0, 0), edge)
        frame.paste(self.im, (0, 0), self.im)

def ibox(L, x, y, w, dp, z0, h, top, left, right, hl=None):
    d = L.d
    A, B, Cc, Dd = scr(x, y, z0 + h), scr(x + w, y, z0 + h), scr(x + w, y + dp, z0 + h), scr(x, y + dp, z0 + h)
    C0, D0, B0 = scr(x + w, y + dp, z0), scr(x, y + dp, z0), scr(x + w, y, z0)
    d.polygon([Dd, Cc, C0, D0], fill=left); d.polygon([Cc, B, B0, C0], fill=right); d.polygon([A, B, Cc, Dd], fill=top)
    if hl: d.line([Dd, Cc], fill=hl); d.line([Cc, B], fill=hl)
def icyl(L, x, y, r, z0, h, top, lit, dark, split=0.2):
    cx, cy0 = scr(x, y, z0); cy1 = scr(x, y, z0 + h)[1]; rx, ry = int(round(r * 22.63)), int(round(r * 11.31))
    m = Image.new('L', (W, H), 0); md = ImageDraw.Draw(m)
    md.ellipse([cx - rx, cy0 - ry, cx + rx, cy0 + ry], fill=255); md.rectangle([cx - rx, cy1, cx + rx, cy0], fill=255)
    L.im.paste(lit + (255,), (0, 0), m)
    m2 = m.copy(); ImageDraw.Draw(m2).rectangle([0, 0, cx + int(rx * split), H], fill=0)
    L.im.paste(dark + (255,), (0, 0), m2)
    L.d.ellipse([cx - rx, cy1 - ry, cx + rx, cy1 + ry], fill=top)
def icone(L, x, y, r, z0, h, stripes, n=16, rot=0.0):
    apex = scr(x, y, z0 + h); segs = []
    for i in range(n):
        t0, t1 = rot + 2 * math.pi * i / n, rot + 2 * math.pi * (i + 1) / n; tm = (t0 + t1) / 2
        segs.append((math.cos(tm) + math.sin(tm), math.cos(tm) - math.sin(tm), i, scr(x + r * math.cos(t0), y + r * math.sin(t0), z0), scr(x + r * math.cos(t1), y + r * math.sin(t1), z0)))
    for depth, side, i, p0, p1 in sorted(segs):
        lit, dark = stripes[i % len(stripes)]
        L.d.polygon([apex, p0, p1], fill=lit if side < 0.25 else dark)
def stamp(rows, x, y, cmap, im=None):
    h, w = len(rows), max(len(r) for r in rows); x0, y0 = x - w // 2, y - h + 1
    px = (im or frame).load(); full = im is not None
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in '. ': continue
            X, Y = x0 + i, y0 + j
            if inside(X, Y): px[X, Y] = (cmap[ch] + (255,)) if full else cmap[ch]
def P(x, y, col):
    if inside(x, y): frame.load()[x, y] = col

items = []
def add(key, fn): items.append((key, fn))

GUEST = ['..ooo..', '.oHHHo.', 'oHHHHHo', 'oHSSSHo', '.oSSSo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.']
GUEST_BACK = ['..ooo..', '.oHHHo.', 'oHHHHHo', 'oHHHHHo', '.oHHHo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.']
GUEST_CAP = ['..ooo..', '.oCCCo.', 'oCCCCCoo', 'oHSSSHo', '.oSSSo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.']
KID = ['.ooo.', 'oHHHo', 'oSSSo', 'oTTTo', 'oTTTo', '.oPo.', '.o.o.']
BALLOON = ['.ooo.', 'oBBBo', 'oBWBo', 'oBBBo', '.ooo.', '..o..', '..o..', '..o..', '..o..']
LAMP = ['.ooo.', 'oYYYo', 'oYWYo', '.ooo.', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '.ooo.']
BENCH = ['.oooooooooo.', 'oWWWWWWWWWWo', 'oooooooooooo', 'owwwwwwwwwwo', '.oooooooooo.', '..o......o..', '..o......o..']
FROST = ['...oo.oo...', '..oWWoWWo..', '.oWWWWWWWo.', '.oWeWWWeWo.', '.oWWWnWWWo.', '..oWWWWWo..', '.oBBBBBBBo.', 'oWWbBBWWWWo', 'oWWWbWWWWWo', 'oWWWWWWWWWo', '.oWWWWWWWo.', '.oWWoooWWo.', '.oWWo.oWWo.', '..oo...oo..']
SPARK = ['.o...o.......', 'oOo.oOo......', 'oOOoOOo...oo.', 'oOOOOOo..oYYo', 'oOeOeOo.oYOOo', '.oCnCo..oOOOo', '..oCo..oOOOo.', '.oOOOooOOOo..', 'oOOCOOOOOo...', 'oOOCOOOoo....', '.oOOOOo......', '.oOooOo......', '.oo..oo......']
BOO = ['...ooooo...', '..oWWWWWo..', '.oWWWWWWWo.', '.oWeeWeeWo.', '.oWeeWeeWo.', '.oWWWWWWWo.', 'ooWWWnWWWoo', 'oWWWWWWWWWo', 'oWWWWWWWWWo', '.oWWWWWWWo.', '.oWWWWWWWo.', '.oWoWWWoWo.', '..o.ooo.o..']
SWAN = ['.....oo.....', '....oWWo....', '....oWoNo...', '.ooooWo.....', 'oWWWWWWoooo.', 'oWWWWWWWWWWo', 'oCCCCCCCCCCo', '.oooooooooo.']
HORSE = ['.....oo..', '....oWWo.', '.oooWWWo.', 'oWWWWWo..', 'oWSSWWo..', 'oWWWWWo..', '.oWoWo...', '.oo.oo...']
GONDOLA = ['..o.o..', '.ooooo.', 'oRRRRRo', 'oWWoWWo', 'oCCCCCo', 'oCCCCCo', '.ooooo.']
CAR = ['.oooooo.', 'oKoKoKoo', 'oRRRRRRo', 'oRYYYYRo', '.oooooo.']
ICE = ['.ooo.', 'oPPPo', 'oPWPo', 'oPPPo', 'oCCCo', '.oCo.', '..o..']
BURGER = ['.ooooo.', 'oBBBBBo', 'oGGGGGo', 'oRRRRRo', 'oBBBBBo', '.ooooo.']
CUP = ['...o..', '..oo..', 'oooooo', 'oTTTTo', 'oTWTTo', '.oTTo.', '.oooo.']
SNOWMAN = ['...ooo...', '..oWWWo..', '..oeWeo..', '..oWnno..', '...ooo...', '.ooWWWoo.', 'sWWWbWWWs', '.oWWWWWo.', 'oWWWbWWWo', 'oWWWWWWWo', 'oWWWbWWWo', '.ooooooo.']
PUMPKIN = ['...g...', '..ooo..', '.oOOOo.', 'oOYOYOo', 'oOOYOOo', '.ooooo.']
GHOST = ['..ooo..', '.oWWWo.', 'oWWWWWo', 'oWeWeWo', 'oWWWWWo', 'oWWWWWo', 'oWoWoWo', '.o.o.o.']
TORCH = ['.Y.', 'YOY', 'oOo', '.w.', '.w.', '.w.', '.w.', '.w.', '.w.', 'ooo']
ROBOT = ['...o...', '..ooo..', '.oCCCo.', '.oTCTo.', '.oCCCo.', 'ooooooo', 'oCcTcCo', 'oCCCCCo', '.ooooo.', '.oC.Co.', '.oo.oo.']
MAMMOTH = ['......oooooooo......', '....ooMMMMMMMMoo....', '..ooMMMmMMMMMMMMo...', '.oMMMMMMMMMMmMMMMo..', 'oMMeMMMMMMMMMMMMMMo.', 'oMMMMMMmMMMMMMMMMMo.', 'oMoWoMMMMMMMMMMmMMo.', 'oMoWWoMMMMMMMMMMMMo.', 'oMo.oWoMMMooooMMMMo.', 'oMo..ooMMMo..oMMMo..', 'oMo...oMMMo..oMMMo..', '.o....oMMMo..oMMMo..', '......ooooo..ooooo..']
DINO = ['.............ooo..', '............oGGGo.', '............oGeGGo', '............oGGoo.', '...........oGGo...', '..........oGgo....', '...oooooooGGGo....', '.ooGGGgGGGGGGo....', 'oGGGGGGGGgGGGo....', '.oooGGGGGGGGo.....', '...oGGooooGGo.....', '...oGGo..oGGo.....', '...oooo..oooo.....']
BONE = ['oo.....oo', 'oWoooooWo', '.oWWWWWo.', 'oWoooooWo', 'oo.....oo']
CAMPFIRE = ['...Y...', '..YOY..', '.YOOOY.', '.OORRO.', 'oOOOOOo', 'owwowwo', '.ooooo.']
PTERO = ['oo.......oo', 'oPo.....oPo', '.oPPo.oPPo.', '..oPPPPPo..', '...ooPoo...', '.....oPoo..', '......ooo..']
SHIRTS = ['o3', 'o2', 'o1', 't3', 'b2', 'v2', 'c1', 'l2', 'o4', 'p2', 't2', 'b3']
HAIR = ['i3', 'w3', 'w2', 'o1', 'c5', 'w4']

def guest(x, y, n, kid=False, balloon=None, shadow=True):
    r = random.Random(n * 7919 + 13); cx, cy = scr(x, y)
    if shadow: SD.ellipse([cx - 3, cy - 1, cx + 4, cy + 1], fill=255)
    cm = {'o': INK, 'H': C[r.choice(HAIR)], 'S': C[r.choice(['k1', 'k1', 'k2', 'k3', 'k4'])], 'T': C[SHIRTS[n % len(SHIRTS)]], 'P': C[r.choice(['i2', 'b4', 'c5', 'w3'])], 'C': C[r.choice(['o4', 't3', 'b3', 'o1'])]}
    rows = KID if kid else r.choice([GUEST, GUEST, GUEST_BACK, GUEST_CAP])
    def draw():
        stamp(rows, cx, cy, cm)
        if balloon: stamp(BALLOON, cx + 4, cy - len(rows) + 3, {'o': INK, 'B': C[balloon], 'W': C['c1']})
    add(x + y + 0.02, draw)
def sprite(rows, x, y, cmap, key=0.03, sh=5):
    cx, cy = scr(x, y)
    if sh: SD.ellipse([cx - sh, cy - 2, cx + sh + 2, cy + 2], fill=255)
    add(x + y + key, lambda: stamp(rows, cx, cy, cmap))
def lamp(x, y):
    cx, cy = scr(x, y); glow(x, y, 30, 'o1')
    def draw():
        if TH.get('torchlamps'): stamp(TORCH, cx, cy, {'o': INK, 'Y': C['o1'], 'O': C['o3'], 'w': C['w3']}); return
        stamp(LAMP, cx, cy, {'o': INK, 'Y': C['o1'], 'W': C['c1']})
        if NIGHT:
            for dx, dy in [(-3, -10), (3, -10), (-2, -13), (2, -13), (0, -14), (-4, -8), (4, -8)]:
                if (dx + dy) % 2 == 0: P(cx + dx, cy + dy, C['o1'])
    add(x + y, draw)
def bench(x, y):
    cx, cy = scr(x, y); SD.rectangle([cx - 5, cy - 1, cx + 8, cy + 1], fill=255)
    add(x + y, lambda: stamp(BENCH, cx, cy, {'o': INK, 'W': C['w1'], 'w': C['w2']}))

def tree_round(x, y, seed, ramp=('l1', 'l2', 'l3', 'l4')):
    r = random.Random(seed); R = r.randint(7, 9); sh_ell(x, y, 0.42, 1.3)
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        d.rectangle([bx - 1, by - 9, bx + 1, by], fill=C['w2']); d.line([bx + 1, by - 9, bx + 1, by], fill=C['w3'])
        cy = by - 8 - R + 2; blobs = [(-R + 3, 3, R - 2), (R - 3, 2, R - 2), (0, -3, R)]
        for dx, dy, rr in blobs: d.ellipse([bx + dx - rr, cy + dy - rr, bx + dx + rr, cy + dy + rr], fill=C[ramp[3]])
        for dx, dy, rr in blobs: d.ellipse([bx + dx - rr, cy + dy - rr, bx + dx + rr - 2, cy + dy + rr - 3], fill=C[ramp[2]])
        for dx, dy, rr in blobs: d.ellipse([bx + dx - rr + 1, cy + dy - rr + 1, bx + dx + rr - 6, cy + dy + rr - 7], fill=C[ramp[1]])
        for k in range(7):
            dx, dy, rr = blobs[k % 3]; px_, py_ = bx + dx - rr + 3 + r.randint(0, rr - 2), cy + dy - rr + 2 + r.randint(0, rr - 4)
            d.point([(px_, py_), (px_ + 1, py_)], fill=C[ramp[0]])
        for k in range(5):
            dx, dy, rr = blobs[k % 3]; d.point([(bx + dx + r.randint(-rr + 3, rr - 3), cy + dy + r.randint(1, rr - 3))], fill=C[ramp[3]])
        L.flush()
    add(x + y, draw)
def tree_pine(x, y, seed):
    r = random.Random(seed); s = r.choice([0, 0, 1]); sh_ell(x, y, 0.36, 1.5)
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        d.rectangle([bx - 1, by - 4, bx + 1, by], fill=C['w3'])
        for hw, yo, hh in [(9 + s, 3, 12), (7 + s, 10, 11), (5, 17, 10 + s)]:
            top = (bx, by - yo - hh)
            d.polygon([top, (bx - hw, by - yo), (bx, by - yo)], fill=C['l3']); d.polygon([top, (bx, by - yo), (bx + hw, by - yo)], fill=C['l5'])
            d.line([top, (bx - hw, by - yo)], fill=C['l2']); d.line([(bx - hw + 1, by - yo), (bx - 1, by - yo)], fill=C['l4'])
        L.flush()
    add(x + y, draw)
def tree_palm(x, y, seed):
    r = random.Random(seed); lean = r.choice([-1, 1]); hgt = r.randint(20, 27); sh_ell(x, y, 0.4, 1.6)
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y); tx = bx
        for i in range(hgt):
            tx = bx + int(round(lean * 4 * math.sin(i / hgt * 1.4)))
            d.point([(tx, by - i), (tx + 1, by - i)], fill=C['w3'] if i % 3 == 0 else C['w2'])
        top = (tx, by - hgt)
        for ang in (-155, -120, -90, -60, -25, 15, 165):
            a = math.radians(ang + r.randint(-8, 8)); ln = r.randint(10, 13)
            mid = (top[0] + int(math.cos(a) * ln * 0.6), top[1] + int(math.sin(a) * ln * 0.5) - 2); end = (top[0] + int(math.cos(a) * ln), top[1] + int(math.sin(a) * ln * 0.5) + 4)
            d.line([top, mid, end], fill=C['l4'], width=2); d.line([top, mid], fill=C['l2']); d.line([mid, end], fill=C['l3'])
        d.point([(top[0] - 1, top[1] + 2), (top[0] + 2, top[1] + 2)], fill=C['w4'])
        L.flush()
    add(x + y, draw)
def tree_bare(x, y, seed):
    r = random.Random(seed); c0, c1 = TH.get('bare', ('w3', 'w4')); sh_ell(x, y, 0.3, 1.2)
    def draw():
        L = Layer(); d = L.d; base = scr(x, y)
        def branch(p, ang, ln, depth):
            q = (p[0] + int(round(math.cos(ang) * ln)), p[1] + int(round(math.sin(ang) * ln)))
            d.line([p, q], fill=C[c0] if depth < 2 else C[c1], width=2 if depth == 0 else 1)
            if depth < 3:
                for da in (-0.62, 0.55): branch(q, ang + da + r.uniform(-0.2, 0.2), ln * 0.66, depth + 1)
        branch(base, -math.pi / 2 + r.uniform(-0.12, 0.12), 11, 0)
        L.flush()
    add(x + y, draw)
def crystal(x, y, seed, ramp=None):
    r = random.Random(seed); ramp = ramp or r.choice([('t1', 't2', 't4'), ('p1', 'p2', 'p3'), ('a1', 'a2', 'a4')]); glow(x, y, 16, ramp[1])
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        for dx, hh, w in [(-4, r.randint(8, 12), 2), (3, r.randint(7, 11), 2), (0, r.randint(14, 19), 3)]:
            d.polygon([(bx + dx - w, by), (bx + dx, by - hh), (bx + dx, by)], fill=C[ramp[0]]); d.polygon([(bx + dx, by), (bx + dx, by - hh), (bx + dx + w, by)], fill=C[ramp[2]])
            d.line([(bx + dx, by - hh), (bx + dx, by)], fill=C[ramp[1]])
        L.flush()
    add(x + y, draw)
def bulb_tree(x, y, seed):
    r = random.Random(seed); hgt = r.randint(13, 20); col = r.choice([('t1', 't2', 't3'), ('p1', 'p2', 'p3'), ('o1', 'o2', 'o3')]); glow(x, y, 22, col[1])
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        d.line([(bx, by), (bx, by - hgt)], fill=C['c3']); d.ellipse([bx - 4, by - hgt - 7, bx + 4, by - hgt + 1], fill=C[col[1]]); d.ellipse([bx - 3, by - hgt - 6, bx + 1, by - hgt - 2], fill=C[col[0]]); d.point([(bx - 2, by - hgt - 5)], fill=C['c1'])
        d.arc([bx - 4, by - hgt - 7, bx + 4, by - hgt + 1], 20, 110, fill=C[col[2]])
        L.flush()
    add(x + y, draw)
def antenna(x, y, seed):
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        d.line([(bx, by), (bx, by - 27)], fill=C['c2']); d.line([(bx - 4, by), (bx, by - 9)], fill=C['c4']); d.line([(bx + 4, by), (bx, by - 9)], fill=C['c4'])
        d.ellipse([bx - 5, by - 21, bx + 1, by - 16], fill=C['c1']); d.point([(bx - 2, by - 18)], fill=C['c4']); d.rectangle([bx - 1, by - 29, bx + 1, by - 27], fill=C['o3'])
        L.flush(); P(bx, by - 31, C['o2']); P(bx - 2, by - 29, C['o2']); P(bx + 2, by - 29, C['o2'])
    add(x + y, draw)
def dome(x, y, seed):
    glow(x, y, 20, 't2')
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        d.ellipse([bx - 10, by - 5, bx + 10, by + 4], fill=C['c4']); d.chord([bx - 9, by - 14, bx + 9, by + 6], 180, 360, fill=C['t3'])
        d.chord([bx - 9, by - 14, bx + 3, by + 6], 180, 360, fill=C['t2']); d.arc([bx - 7, by - 12, bx + 1, by + 2], 190, 260, fill=C['c1']); d.line([(bx - 9, by - 4), (bx + 9, by - 4)], fill=C['c2'])
        d.rectangle([bx - 1, by - 3, bx + 1, by + 1], fill=C['o1'])
        L.flush()
    add(x + y, draw)
def fern(x, y, seed):
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        for ang in (-160, -130, -100, -75, -45, -20):
            a = math.radians(ang); e = (bx + int(math.cos(a) * 8), by + int(math.sin(a) * 7))
            d.line([(bx, by), e], fill=C['l3']); d.point([e], fill=C['l1'])
        d.point([(bx - 1, by - 3), (bx + 2, by - 4)], fill=C['p2'])
        L.flush()
    add(x + y, draw)
def bush(x, y, seed):
    def draw():
        L = Layer(); bx, by = scr(x, y)
        L.d.ellipse([bx - 5, by - 6, bx + 5, by], fill=C['l4']); L.d.ellipse([bx - 5, by - 6, bx + 3, by - 2], fill=C['l3']); L.d.point([(bx - 3, by - 5), (bx - 2, by - 5), (bx, by - 4)], fill=C['l1'])
        L.flush()
    add(x + y, draw)
def flowerbed(x, y):
    def draw():
        L = Layer(snow=False); pts = [scr(x, y), scr(x + 0.8, y), scr(x + 0.8, y + 0.8), scr(x, y + 0.8)]
        L.d.polygon(pts, fill=C['w3']); r = random.Random(int(x * 97 + y * 31))
        for k in range(16):
            px_, py_ = scr(x + 0.12 + r.random() * 0.56, y + 0.12 + r.random() * 0.56)
            L.d.point([(px_, py_)], fill=C[r.choice(['p2', 'o1', 'c1', 'p1', 'v1'])]); L.d.point([(px_, py_ + 1)], fill=C['l3'])
        L.flush()
    add(x + y + 0.5, draw)

def stall(x, y, awn, icon, icmap):
    sh_box(x, y, 1, 1, 22); glow(x + 0.5, y + 1.5, 26, 'o1')
    def draw():
        L = Layer(); ibox(L, x + 0.1, y + 0.1, 0.8, 0.8, 0, 13, C['c1'], C['c1'], C['c3']); d = L.d
        d.polygon([scr(x + 0.22, y + 0.9, 11), scr(x + 0.78, y + 0.9, 11), scr(x + 0.78, y + 0.9, 5), scr(x + 0.22, y + 0.9, 5)], fill=C['o1'] if NIGHT else C['i2'])
        vx, vy = scr(x + 0.5, y + 0.9, 6); d.rectangle([vx - 1, vy - 5, vx + 1, vy - 3], fill=C['k1']); d.rectangle([vx - 2, vy - 2, vx + 2, vy], fill=C[awn]); d.point([(vx - 1, vy - 6), (vx, vy - 6), (vx + 1, vy - 6)], fill=C['w3'])
        d.line([scr(x + 0.18, y + 0.9, 4), scr(x + 0.82, y + 0.9, 4)], fill=C['w1']); d.line([scr(x + 0.18, y + 0.9, 3), scr(x + 0.82, y + 0.9, 3)], fill=C['w2'])
        d.polygon([scr(x + 0.9, y + 0.62, 9), scr(x + 0.9, y + 0.38, 9), scr(x + 0.9, y + 0.38, 0), scr(x + 0.9, y + 0.62, 0)], fill=C['w2'])
        ibox(L, x - 0.06, y - 0.06, 1.12, 1.12, 13, 3, C['c1'], C['c1'], C['c2'])
        dk = {'o4': 'o5', 't3': 't4', 'o2': 'o3', 'b2': 'b3'}[awn]
        for k in range(5):
            u0, u1 = x - 0.06 + 1.12 * (k * 2) / 9, x - 0.06 + 1.12 * (k * 2 + 1) / 9
            d.polygon([scr(u0, y - 0.06, 16), scr(u1, y - 0.06, 16), scr(u1, y + 1.06, 16), scr(u0, y + 1.06, 16)], fill=C[awn])
            d.polygon([scr(u0, y + 1.06, 16), scr(u1, y + 1.06, 16), scr(u1, y + 1.06, 12), scr(u0, y + 1.06, 12)], fill=C[awn])
            v0, v1 = y - 0.06 + 1.12 * (k * 2) / 9, y - 0.06 + 1.12 * (k * 2 + 1) / 9
            d.polygon([scr(x + 1.06, v0, 16), scr(x + 1.06, v1, 16), scr(x + 1.06, v1, 12), scr(x + 1.06, v0, 12)], fill=C[dk])
        px_, py_ = scr(x + 0.5, y + 0.5, 16); d.line([(px_, py_), (px_, py_ - 4)], fill=C['w3'])
        L.flush(); stamp(icon, px_, py_ - 4, icmap)
    add(x + y + 1.2, draw)
def fountain(x, y):
    glow(x, y, 26, 'a1')
    def draw():
        L = Layer(snow=False); icyl(L, x, y, 0.62, 0, 4, C['a1'], C['c2'], C['c4']); d = L.d
        cx, cy = scr(x, y, 4); rx, ry = 11, 5
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=C['a2']); d.arc([cx - rx, cy - ry, cx + rx, cy + ry], 180, 360, fill=C['a4'])
        d.rectangle([cx - 1, cy - 9, cx + 1, cy], fill=C['c2']); d.line([(cx + 1, cy - 9), (cx + 1, cy)], fill=C['c4']); d.ellipse([cx - 4, cy - 11, cx + 4, cy - 8], fill=C['c1'])
        L.flush()
        for dx, dy in [(0, -15), (0, -14), (-1, -13), (1, -13), (-2, -12), (2, -12), (-3, -10), (3, -10), (-4, -8), (4, -8), (-5, -5), (5, -5), (-6, -2), (6, -2), (0, -17), (-7, 1), (7, 1)]:
            P(cx + dx, cy + dy, C['c1'] if (dx + dy) % 2 == 0 else C['a1'])
    add(x + y + 0.3, draw)
def carousel(x, y):
    sh_ell(x, y, 1.75, 1.0); glow(x, y, 58, 'o1')
    def draw():
        L = Layer(snow=False); d = L.d
        icyl(L, x, y, 1.62, 0, 3, C['c1'], C['c2'], C['c4']); icyl(L, x, y, 1.46, 3, 2, C['t1'], C['t2'], C['t4'])
        cx, cy = scr(x, y, 5); d.arc([cx - 27, cy - 13, cx + 27, cy + 13], 0, 360, fill=C['t2'])
        horses = sorted([(x + 1.06 * math.cos(t), y + 1.06 * math.sin(t), k) for k, t in enumerate([0.3 + k * math.pi / 4 for k in range(8)])], key=lambda h: h[0] + h[1])
        def horse(hx, hy, k):
            d.line([scr(hx, hy, 5), scr(hx, hy, 35)], fill=C['o1']); hx_, hy_ = scr(hx, hy, 8 + (k % 2) * 4)
            stamp(HORSE, hx_, hy_ + 2, {'o': INK, 'W': C['c1'] if k % 2 else C['o1'], 'S': C[['o4', 'b2', 'v2', 'p2'][k % 4]]}, L.im)
        for hx, hy, k in horses:
            if hx + hy < x + y: horse(hx, hy, k)
        icyl(L, x, y, 0.28, 5, 30, C['c1'], C['c1'], C['c3'])
        for z in (11, 19, 27, 33):
            bx_, by_ = scr(x, y, z); d.arc([bx_ - 6, by_ - 3, bx_ + 6, by_ + 3], 0, 180, fill=C['o3'])
        for hx, hy, k in horses:
            if hx + hy >= x + y: horse(hx, hy, k)
        L.flush()
        L = Layer(); d = L.d; icyl(L, x, y, 1.7, 35, 4, C['c1'], C['c1'], C['c2'])
        for k in range(24):
            t0, t1 = -math.pi / 4 + k * math.pi / 24, -math.pi / 4 + (k + 1) * math.pi / 24
            if k % 2 == 0: d.polygon([scr(x + 1.7 * math.cos(t0), y + 1.7 * math.sin(t0), 39), scr(x + 1.7 * math.cos(t1), y + 1.7 * math.sin(t1), 39), scr(x + 1.7 * math.cos(t1), y + 1.7 * math.sin(t1), 35), scr(x + 1.7 * math.cos(t0), y + 1.7 * math.sin(t0), 35)], fill=C['t3'] if k < 14 else C['t4'])
        icone(L, x, y, 1.74, 39, 17, [(C['t2'], C['t4']), (C['c1'], C['c3'])], 16, 0.2)
        ax, ay = scr(x, y, 56); d.rectangle([ax - 1, ay - 3, ax + 1, ay - 1], fill=C['o1']); d.line([(ax, ay - 9), (ax, ay - 4)], fill=C['w3']); d.polygon([(ax + 1, ay - 9), (ax + 6, ay - 7), (ax + 1, ay - 6)], fill=C['o4'])
        L.flush()
        for k in range(13):
            t = -math.pi / 4 + k * math.pi / 12; bx, by = scr(x + 1.72 * math.cos(t), y + 1.72 * math.sin(t), 36); P(bx, by, C['o1'])
            if NIGHT: P(bx, by + 1, C['o2'])
    add(x + y + 1.2, draw)
def tower(x, y):
    sh_box(x - 0.7, y - 0.7, 1.4, 1.4, 8); SD.polygon([scr(x - 0.2, y + 0.25), scr(x + 0.25, y - 0.2), scr(x + 4.2, y - 4.15), scr(x + 3.75, y - 3.7)], fill=255); glow(x, y, 36, 'o2')
    def draw():
        L = Layer(); d = L.d; ibox(L, x - 0.7, y - 0.7, 1.4, 1.4, 0, 4, C['c1'], C['c2'], C['c4'], C['c1'])
        def shaft(z0, z1):
            ibox(L, x - 0.24, y - 0.24, 0.48, 0.48, z0, z1 - z0, C['c1'], C['c1'], C['c3']); z = z0 + 2
            while z + 8 <= z1:
                d.line([scr(x - 0.24, y + 0.24, z), scr(x + 0.24, y + 0.24, z + 7)], fill=C['o3']); d.line([scr(x + 0.24, y + 0.24, z), scr(x + 0.24, y - 0.24, z + 7)], fill=C['o5']); z += 9
        shaft(4, 64); icyl(L, x, y, 0.98, 62, 7, C['o2'], C['o3'], C['o5'])
        cx, cy = scr(x, y, 69); d.arc([cx - 22, cy - 11, cx + 22, cy + 11], 0, 180, fill=C['o1'])
        for k in range(8):
            t = math.pi * (-0.22 + k * 0.94 / 7); hx, hy = scr(x + 0.98 * math.cos(t), y + 0.98 * math.sin(t), 70)
            d.rectangle([hx - 1, hy - 3, hx + 1, hy - 1], fill=C[['k1', 'k2', 'k3', 'k1'][k % 4]]); d.point([(hx - 1, hy - 4), (hx, hy - 4), (hx + 1, hy - 4)], fill=C[['w3', 'i3', 'o1', 'w4'][k % 4]]); d.rectangle([hx - 1, hy, hx + 1, hy + 1], fill=C[SHIRTS[k % 8]])
        shaft(69, 110); ibox(L, x - 0.42, y - 0.42, 0.84, 0.84, 110, 5, C['o2'], C['o3'], C['o5'], C['o1'])
        tx, ty = scr(x, y, 115); d.line([(tx, ty), (tx, ty - 10)], fill=C['w3']); d.polygon([(tx + 1, ty - 10), (tx + 8, ty - 8), (tx + 1, ty - 5)], fill=C['o1']); d.rectangle([tx - 1, ty - 1, tx + 1, ty], fill=C['o1'])
        L.flush()
        if NIGHT:
            for dx, dy in [(-3, -1), (3, -1), (0, -4), (-2, 2), (2, 2), (-5, 0), (5, 0)]: P(tx + dx, ty + dy - 2, C['o1'] if (dx + dy) % 2 == 0 else C['o2'])
    add(x + y + 0.9, draw)
def wheel(x, y):
    Rt, Rz, hz = 2.35, 47, 58
    sh_box(x - 1.6, y - 0.7, 3.2, 1.4, 6); sh_ell(x + 1.0, y - 1.0, 1.1, 1.2); glow(x, y, 54, 'b1')
    def pt(t, f=1.0): return scr(x + Rt * f * math.cos(t), y, hz + Rz * f * math.sin(t))
    def draw():
        L = Layer(); ibox(L, x - 1.6, y - 0.7, 3.2, 1.4, 0, 3, C['c1'], C['c2'], C['c4'], C['c1'])
        ibox(L, x + 0.7, y + 0.1, 0.6, 0.5, 3, 9, C['o2'], C['c1'], C['c3']); ibox(L, x + 0.64, y + 0.04, 0.72, 0.62, 12, 2, C['o3'], C['o3'], C['o5'])
        L.d.line([scr(x - 1.15, y - 0.5, 3), scr(x, y - 0.2, hz)], fill=C['c3'], width=2); L.d.line([scr(x + 1.15, y - 0.5, 3), scr(x, y - 0.2, hz)], fill=C['c3'], width=2)
        L.flush()
        L = Layer(outline=False); hub = scr(x, y, hz)
        for k in range(12): L.d.line([hub, pt(k * math.pi / 6)], fill=C['c4'])
        L.d.line([pt(k * math.pi / 36, 0.8) for k in range(73)], fill=C['b3']); L.flush()
        L = Layer(snow=False); L.d.line([pt(k * math.pi / 48) for k in range(97)], fill=C['b2'], width=2)
        for k in range(24):
            if k % 2 == 0 or NIGHT: L.d.point([pt(k * math.pi / 12)], fill=C[['o1', 'p2', 't1'][k % 3]] if NIGHT else C['o1'])
        L.flush()
        for k in range(10):
            gx, gy = pt(0.16 + k * math.pi / 5); cols = [('o3', 'o4'), ('o1', 'o2'), ('t2', 't3'), ('v1', 'v2'), ('b1', 'b2')][k % 5]
            stamp(GONDOLA, gx, gy + 8, {'o': INK, 'R': C[cols[1]], 'W': C['o1'] if NIGHT else C['c1'], 'C': C[cols[0]]})
        L = Layer(); L.d.line([scr(x - 1.15, y + 0.5, 3), scr(x, y + 0.2, hz)], fill=C['c1'], width=2); L.d.line([scr(x + 1.15, y + 0.5, 3), scr(x, y + 0.2, hz)], fill=C['c1'], width=2)
        hx, hy = hub; L.d.ellipse([hx - 3, hy - 3, hx + 3, hy + 3], fill=C['o1']); L.d.point([(hx - 1, hy - 1)], fill=C['c1']); L.flush()
    add(x + y + 0.75, draw)
def coaster():
    cp = [(6.5, 10.5, 7), (8, 10.5, 7), (9.5, 10.5, 7), (10.35, 10.3, 8), (10.5, 9.5, 15), (10.5, 8, 38), (10.5, 6.8, 60), (10.3, 5.8, 68), (9.6, 5.5, 63), (8.8, 5.5, 30), (8.2, 5.5, 14), (7.4, 5.5, 38), (6.6, 5.5, 20), (5.9, 5.6, 12), (5.5, 6.3, 14), (5.5, 7.5, 27), (5.5, 8.7, 12), (5.5, 9.8, 8), (5.8, 10.4, 7)]
    N = len(cp); pts = []
    def cr(a, b, c, d, t): return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
    for i in range(N):
        for k in range(12):
            t = k / 12; a, b, c, d = cp[(i - 1) % N], cp[i], cp[(i + 1) % N], cp[(i + 2) % N]
            pts.append(tuple(cr(a[j], b[j], c[j], d[j], t) for j in range(3)))
    M = len(pts); sh_box(6, 10.05, 4, 0.9, 26); glow(8, 11.3, 50, 'o1')
    for i in range(0, M, 4):
        p = pts[i]
        if p[2] > 10: q = scr(p[0] + p[2] / TZ * 0.7, p[1] - p[2] / TZ * 0.7); SD.ellipse([q[0] - 5, q[1] - 2, q[0] + 5, q[1] + 2], fill=255)
    def part(near):
        sel = [i for i in range(M) if ((pts[i][0] + pts[i][1]) >= 16.2) == near]
        L = Layer(outline=False); d = L.d; cols = []
        for i in sel:
            if i % 6 == 0 and pts[i][2] > 9:
                p = pts[i]; top, base = scr(p[0], p[1], p[2] - 2), scr(p[0], p[1], 0); cols.append((top, base))
                d.line([top, base], fill=C['c1']); d.line([(top[0] + 1, top[1]), (base[0] + 1, base[1])], fill=C['c4'])
        for (t0, b0), (t1, b1) in zip(cols, cols[1:]):
            if abs(t0[0] - t1[0]) > 14: continue
            hgt = 9
            while b0[1] - hgt > max(t0[1], t1[1]) + 3:
                d.line([(b0[0], b0[1] - hgt), (b1[0], b1[1] - hgt)], fill=C['c3']); d.line([(b0[0], b0[1] - hgt), (b1[0], b1[1] - hgt - 9)], fill=C['c4']); hgt += 11
        L.flush()
        if near:
            L = Layer(snow=False); ibox(L, 6, 10.05, 4, 0.9, 0, 4, C['c1'], C['c2'], C['c4'], C['c1']); L.flush()
        L = Layer(); d = L.d; run = []
        for i in sel + [None]:
            if i is not None and (not run or i == run[-1] + 1): run.append(i); continue
            if len(run) > 1:
                line = [scr(*pts[j % M]) for j in run + [run[-1] + 1]]
                d.line([(p[0], p[1] + 1) for p in line], fill=C['o5']); d.line(line, fill=C['o4']); d.line([(p[0], p[1] - 1) for p in line], fill=C['o2'])
            run = [i] if i is not None else []
        L.flush()
        for i in sel:
            if i % 3 == 0: sx_, sy_ = scr(*pts[i]); P(sx_, sy_, C['o1'] if NIGHT and i % 6 == 0 else C['o6'])
    def train(start, n, body):
        def draw():
            for c in range(n):
                p = pts[(start + c * 5) % M]; sx_, sy_ = scr(p[0], p[1], p[2])
                stamp(CAR, sx_, sy_ - 1, {'o': INK, 'K': C[['k1', 'k2', 'k3'][c % 3]], 'R': C[body], 'Y': C['o1']})
        return draw
    add(13.0, lambda: part(False)); add(15.5, train(8 * 12 + 2, 3, 'b2'))
    def near():
        part(True); train(5 * 12 + 2, 3, 't3')(); train(1 * 12, 3, 'v2')()
        L = Layer(); d = L.d
        for px_, py_ in [(6.12, 10.1), (9.88, 10.1), (6.12, 10.92), (9.88, 10.92)]: d.line([scr(px_, py_, 4), scr(px_, py_, 24)], fill=C['c1'], width=2)
        ibox(L, 5.95, 9.95, 4.1, 1.1, 24, 3, C['o2'], C['o3'], C['o5'], C['o1'])
        for k in range(8):
            u0, u1 = 5.95 + 4.1 * (k * 2) / 16, 5.95 + 4.1 * (k * 2 + 1) / 16
            d.polygon([scr(u0, 9.95, 27), scr(u1, 9.95, 27), scr(u1, 11.05, 27), scr(u0, 11.05, 27)], fill=C['c1'])
        ibox(L, 7.3, 10.75, 1.4, 0.1, 27, 8, C['o4'], C['o4'], C['o5'], C['o2'])
        for k in range(5): sx_, sy_ = scr(7.45 + k * 0.27, 10.86, 31); d.rectangle([sx_ - 1, sy_ - 1, sx_, sy_ + 1], fill=C['o1'] if NIGHT else C['c1'])
        L.flush()
    add(18.9, near)
def swan(x, y, col):
    cx, cy = scr(x, y); add(x + y, lambda: stamp(SWAN, cx, cy, {'o': INK, 'W': C['c1'], 'N': C['o3'], 'C': C[col]}))
def lily(x, y, flower):
    cx, cy = scr(x, y)
    def draw():
        for dx, dy in [(0, 0), (1, 0), (2, 0), (-1, 0), (0, -1), (1, -1), (0, 1), (1, 1)]: P(cx + dx, cy + dy, C['l2'] if dy < 1 else C['l3'])
        if flower: P(cx, cy - 1, C['p2']); P(cx + 1, cy - 1, C['c1'])
    add(x + y - 0.4, draw)
def pole(x, y):
    def draw():
        L = Layer(); p0, p1 = scr(x, y), scr(x, y, 26)
        for yy in range(p1[1], p0[1] + 1): L.d.point([(p0[0], yy), (p0[0] + 1, yy)], fill=C['o4'] if ((yy - p1[1]) // 3) % 2 else C['c1'])
        L.d.rectangle([p1[0] - 1, p1[1] - 3, p1[0] + 2, p1[1] - 1], fill=C['o1']); L.flush()
    add(x + y + 0.01, draw)
def bunting(a, b, key):
    def draw():
        p0, p1 = scr(a[0], a[1], 25), scr(b[0], b[1], 25); n = max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))
        for k in range(n + 1):
            t = k / n; X = int(round(p0[0] + (p1[0] - p0[0]) * t)); Y = int(round(p0[1] + (p1[1] - p0[1]) * t + 5 * math.sin(math.pi * t)))
            P(X, Y, C['i1'] if NIGHT else C['i2'])
            if k % 5 == 2:
                col = C[['o4', 'o1', 't3', 'c1', 'b2'][(k // 5) % 5]]
                for dx, dy in [(-1, 1), (0, 1), (1, 1), (0, 2)]: P(X + dx, Y + dy, col)
                P(X, Y + 3, INK)
    add(key, draw)

# ---------------------------------------------------------------- the scene
coaster(); tower(15.5, 8.5); wheel(8.8, 15.6); carousel(17.3, 17.3); fountain(12.5, 12.5)
stall(17, 10.9, 'o4', ICE, {'o': INK, 'P': C['p2'], 'W': C['c1'], 'C': C['w1']})
stall(19.4, 10.9, 't3', CUP, {'o': INK, 'T': C['t2'], 'W': C['c1']})
stall(10.9, 18, 'o2', BURGER, {'o': INK, 'B': C['w1'], 'G': C['l2'], 'R': C['o5']})
if WATER in ('water', 'lagoon'):
    swan(20.6, 14.5, 't3'); swan(22.1, 16.2, 'o3')
if WATER in ('water', 'lagoon', 'swamp'):
    for lx, ly, fl in [(21.6, 13.6, True), (20.2, 16.4, False), (22.6, 15.0, True), (19.6, 15.6, False), (20.9, 15.4, True), (22.0, 14.2, False)][: 6 if WATER == 'swamp' else 4]: lily(lx, ly, fl)
if WATER == 'plasma': glow(21.5, 15.5, 70, 'a2')
for fx_, fy_ in [(10.1, 10.1), (14.1, 10.1), (10.1, 14.1), (14.1, 14.05)]: flowerbed(fx_, fy_)
for lx in (2, 5, 9.6, 17.6, 21, 24, 27): lamp(lx, 11.92)
for ly in (4.5, 7.5, 16.5, 20, 23.5, 27): lamp(11.92, ly)
for bx_, by_ in [(5.6, 13.2), (16.3, 13.2), (22.5, 13.2), (2.4, 13.2)]: bench(bx_, by_)
for cxy in [(11, 11), (14, 11), (14, 14), (11, 14)]: pole(*cxy)
bunting((11, 11), (14, 11), 22.05); bunting((11, 11), (11, 14), 22.06); bunting((14, 11), (14, 14), 28.05); bunting((11, 14), (14, 14), 28.06)
FM = {'o': INK, 'W': C['c1'], 'e': INK, 'n': C['b3'], 'B': C['b2'], 'b': C['b3']}
if TH.get('mascots') == 'boo': sprite(BOO, 11.35, 13.7, {'o': INK, 'W': C['c1'], 'e': INK, 'n': C['p2']})
else: sprite(FROST, 11.35, 13.7, FM)
sprite(SPARK, 13.2, 11.6, {'o': INK, 'O': C['o3'], 'C': C['c1'], 'Y': C['o1'], 'e': INK, 'n': INK}, sh=6)

def blocked(x, y):
    for dx in (-0.6, 0, 0.6):
        for dy in (-0.6, 0, 0.6):
            if tile_type(math.floor(x + dx), math.floor(y + dy)) != 'grass': return True
    if 4.4 < x < 11.6 and 4.4 < y < 11.6: return True
    if 14 < x < 17.2 and 7 < y < 10.3: return True
    if 6.6 < x < 11 and 14.2 < y < 17: return True
    if math.hypot(x - 17.3, y - 17.3) < 2.7: return True
    if 16.5 < x < 20.9 and 10.3 < y < 12: return True
    if 10.3 < x < 12 and 17.4 < y < 19.5: return True
    return False
T = random.Random(41); placed = []
kinds, weights = [k for k, w in TH['trees']], [w for k, w in TH['trees']]
for k in range(int(1400 * AREA)):
    if len(placed) >= int(64 * AREA): break
    x, y = -16 + T.random() * 60, -16 + T.random() * 60; sx_, sy_ = scr(x, y)
    if blocked(x, y) or not (-12 < sx_ < W + 12 and 4 < sy_ < H + 26): continue
    if T.random() < 0.62 and math.hypot(x - 13, y - 13.5) < 10.5: continue
    if any(math.hypot(x - a, y - b) < 0.75 for a, b in placed): continue
    placed.append((x, y)); kind = T.choices(kinds, weights)[0]
    {'round': tree_round, 'pine': tree_pine, 'palm': tree_palm, 'bare': tree_bare, 'crystal': crystal, 'bulb': bulb_tree, 'antenna': antenna, 'dome': dome, 'fern': fern,
     'autumn': lambda a, b, s: tree_round(a, b, s, ('o1', 'o2', 'o3', 'o5')), 'snowround': lambda a, b, s: tree_round(a, b, s, ('g1', 'g2', 'g3', 'g4'))}[kind](x, y, k)
if sys.argv[1] in ('orange', 'jungle', 'spooky', 'stoneage'):
    for k in range(int(26 * AREA)):
        x, y = -14 + T.random() * 56, -14 + T.random() * 56
        if not blocked(x, y): bush(x, y, k)
PR = random.Random(63)
for kind, count in TH.get('props', []):
    n = 0
    for k in range(600):
        if n >= count: break
        x, y = -4 + PR.random() * 36, -4 + PR.random() * 36; sx_, sy_ = scr(x, y)
        if blocked(x, y) or not (4 < sx_ < W - 4 and 14 < sy_ < H - 2) or any(math.hypot(x - a, y - b) < 0.6 for a, b in placed): continue
        placed.append((x, y)); n += 1
        if kind == 'snowman': sprite(SNOWMAN, x, y, {'o': INK, 'W': C['g1'], 'e': INK, 'n': C['o3'], 'b': C['i2'], 's': C['w3']})
        elif kind == 'crystal': crystal(x, y, k, ('a1', 'a2', 'a4'))
        elif kind == 'torch': sprite(TORCH, x, y, {'o': INK, 'Y': C['o1'], 'O': C['o3'], 'w': C['w3']}, sh=2)
        elif kind == 'fern': fern(x, y, k)
        elif kind == 'pumpkin': sprite(PUMPKIN, x, y, {'o': INK, 'g': C['t3'], 'O': C['o3'], 'Y': C['o1']}, sh=3); glow(x, y, 11, 'o2')
        elif kind == 'ghost': sprite(GHOST, x, y - 0.0, {'o': C['c4'], 'W': C['c1'], 'e': INK}, sh=0); glow(x, y, 14, 'c2')
        elif kind == 'bone': sprite(BONE, x, y, {'o': INK, 'W': C['c1']}, sh=4)
        elif kind == 'campfire': sprite(CAMPFIRE, x, y, {'o': INK, 'Y': C['o1'], 'O': C['o2'], 'R': C['o4'], 'w': C['w3']}, sh=4)
        elif kind == 'mammoth': sprite(MAMMOTH, x, y, {'o': INK, 'M': C['w2'], 'm': C['w3'], 'W': C['c1'], 'e': INK}, sh=10)
        elif kind == 'dino': sprite(DINO, x, y, {'o': INK, 'G': C['t3'], 'g': C['t4'], 'e': INK}, sh=9)
        elif kind == 'boulder':
            rr = PR.randint(4, 7); sh_ell(x, y, rr / 22.0, 1.0)
            def bdraw(x=x, y=y, rr=rr):
                L = Layer(); bx, by = scr(x, y)
                L.d.ellipse([bx - rr, by - rr - 2, bx + rr, by + 1], fill=C['c4']); L.d.ellipse([bx - rr, by - rr - 2, bx + rr - 2, by - 2], fill=C['c3']); L.d.ellipse([bx - rr + 1, by - rr - 1, bx + 1, by - rr + 3], fill=C['c2'])
                L.flush()
            add(x + y, bdraw)
        elif kind == 'robot': sprite(ROBOT, x, y, {'o': INK, 'C': C['c2'], 'c': C['c4'], 'T': C['t1']}); glow(x, y, 10, 't2')

G = random.Random(77); gi = [0]
def walk(n, fn, kids=0.12, balloons=0.1):
    for _ in range(n):
        x, y = fn(G.random(), G.random())
        if math.hypot(x - 12.5, y - 12.5) < 1.2 or math.hypot(x - 11.35, y - 13.7) < 0.55 or math.hypot(x - 13.2, y - 11.6) < 0.6: continue
        gi[0] += 1; guest(x, y, gi[0], kid=G.random() < kids, balloon=G.choice(['o4', 'o1', 't2', 'p2', 'b2']) if G.random() < balloons else None)
walk(36, lambda a, b: (-2 + a * 30, 12.15 + b * 0.7))
walk(22, lambda a, b: (12.15 + b * 0.7, 3.5 + a * 24))
walk(10, lambda a, b: (11.15 + a * 2.7, 11.15 + b * 2.7), balloons=0.35)
for q in range(6): gi[0] += 1; guest(8.3 + (q % 2) * 0.32, 11.06 + q * 0.15, gi[0])
walk(4, lambda a, b: (9.2 + b * 0.6, 13.1 + a * 1.7))
walk(3, lambda a, b: (15.2 + b * 0.6, 10.1 + a * 1.8))
walk(5, lambda a, b: (13.1 + a * 2.4, 16.2 + b * 0.6))
if TH.get('skaters'):
    for k, (sx_, sy_) in enumerate([(20.4, 14.4), (21.7, 15.3), (22.4, 14.2), (20.9, 16.3), (21.9, 16.6), (20.2, 15.5)]): gi[0] += 1; guest(sx_, sy_, gi[0], kid=k % 3 == 0)

def sky():
    kind = TH.get('sky')
    if kind == 'balloon':
        cx, cy = 40 + DX // 3, 138 + DY; SD.ellipse([cx + 46, cy + 104, cx + 74, cy + 116], fill=255)
        def draw():
            L = Layer(snow=False); d = L.d; m = Image.new('L', (W, H), 0); md = ImageDraw.Draw(m)
            md.ellipse([cx - 15, cy - 18, cx + 15, cy + 12], fill=255); md.polygon([(cx - 11, cy + 6), (cx + 11, cy + 6), (cx + 4, cy + 20), (cx - 4, cy + 20)], fill=255)
            for k in range(6):
                band = Image.new('L', (W, H), 0); ImageDraw.Draw(band).rectangle([cx - 15 + k * 5, 0, cx - 11 + k * 5, H], fill=255)
                L.im.paste([C['o3'], C['c1'], C['o2'], C['c1'], C['o4'], C['c2']][k] + (255,), (0, 0), ImageChops.multiply(m, band))
            d.arc([cx - 15, cy - 18, cx + 15, cy + 12], 200, 250, fill=C['c1'])
            d.line([(cx - 4, cy + 21), (cx - 3, cy + 26)], fill=C['w3']); d.line([(cx + 4, cy + 21), (cx + 3, cy + 26)], fill=C['w3'])
            d.rectangle([cx - 3, cy + 26, cx + 3, cy + 30], fill=C['w2']); d.line([(cx - 3, cy + 26), (cx + 3, cy + 26)], fill=C['w1']); d.rectangle([cx - 1, cy + 23, cx, cy + 25], fill=C['k1'])
            L.flush()
        add(999, draw)
    if kind in ('balloon', 'parrots'):
        def birds():
            spots = [(318 + DX, 196 + DY), (330 + DX, 190 + DY), (341 + DX, 199 + DY)] if kind == 'balloon' else [(52, 60), (66, 52), (300, 60), (318, 70), (150, 250), (240, 40), (350, 150)]
            for n, (bx, by) in enumerate(spots):
                body = 'c1' if kind == 'balloon' else ['o4', 'b2', 'o1', 'p2'][n % 4]
                for dx, dy, col in [(-2, -1, body), (-1, 0, body), (0, 1, body), (1, 0, body), (2, -1, body), (0, 2, 'i2')]: P(bx + dx, by + dy, C[col])
                if kind == 'parrots': P(bx, by, C['o1']); P(bx + 1, by + 1, C['t2'])
        add(1000, birds)
    if kind == 'ptero':
        def ptero():
            for n, (bx, by) in enumerate([(70 + DX // 2, 46), (W - 90, 70), (W // 2 + 60, 30)]):
                stamp(PTERO, bx, by, {'o': INK, 'P': C[['v3', 'w3', 'v2'][n]]})
        add(1000, ptero)
    if kind == 'bats':
        def bats():
            for bx, by in [(60, 40), (90, 62), (300, 36), (332, 58), (360, 120), (40, 190), (210, 26), (150, 48)]:
                for dx, dy in [(-3, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, -1), (-2, 1), (2, 1), (0, 1), (-1, -1), (1, -1)]: P(bx + dx, by + dy, C['i1'] if dy <= 0 else C['i2'])
                P(bx - 1, by, C['o2']); P(bx + 1, by, C['o2'])
        add(1000, bats)
    if kind == 'ufo':
        ux, uy = 34, 160; lights.append(((ux + 6, uy + 92), 34, C['t1']))
        def ufo():
            for yy in range(uy + 6, uy + 92):
                hw = 5 + (yy - uy - 6) * 15 // 86
                for xx in range(ux - hw + 6 * (yy - uy) // 92, ux + hw + 6 * (yy - uy) // 92 + 1):
                    if (xx + yy) % 2 == 0 and (yy % 3 or xx % 3): P(xx, yy, C['t1'] if abs(xx - ux - 6 * (yy - uy) // 92) < hw - 2 else C['t2'])
            L = Layer(); d = L.d
            d.ellipse([ux - 18, uy - 4, ux + 18, uy + 6], fill=C['c3']); d.ellipse([ux - 18, uy - 5, ux + 18, uy + 3], fill=C['c1']); d.chord([ux - 8, uy - 12, ux + 8, uy + 2], 180, 360, fill=C['t2']); d.arc([ux - 6, uy - 10, ux + 2, uy], 190, 250, fill=C['c1'])
            for k in range(6): d.point([(ux - 14 + k * 6, uy + 2), (ux - 13 + k * 6, uy + 2)], fill=C[['o1', 'o3', 't1'][k % 3]])
            L.flush()
        add(999, ufo)
sky()

# ---------------------------------------------------------------- paint
ground()
R2 = random.Random(9); dk, dw = [k for k, w in TH['details']], [w for k, w in TH['details']]
for _ in range(int(520 * AREA * 1.6)):
    x, y = -18 + R2.random() * 64, -18 + R2.random() * 64
    if tile_type(math.floor(x), math.floor(y)) != 'grass': continue
    sx_, sy_ = scr(x, y)
    if not (2 < sx_ < W - 3 and 4 < sy_ < H - 2): continue
    kind = R2.choices(dk, dw)[0]
    if kind == 'tuft':
        for dx, dy, c in [(-1, -1, 'g4'), (0, -2, 'g4'), (1, -1, 'g4'), (0, 0, 'g3')]: P(sx_ + dx, sy_ + dy, C[c])
    elif kind == 'flower':
        col = C[R2.choice(['c1', 'o1', 'p2', 'c1', 'p1'])]; P(sx_, sy_ - 1, col); P(sx_, sy_, C['l3'])
        if R2.random() < 0.5: P(sx_ + 2, sy_, col); P(sx_ + 2, sy_ + 1, C['l3'])
    elif kind == 'rock': P(sx_, sy_, C['c3']); P(sx_ + 1, sy_, C['c4']); P(sx_, sy_ - 1, C['c2'])
    elif kind == 'sparkle': P(sx_, sy_, C['g1']); P(sx_ + 1, sy_ + 1, C['g4'])
    elif kind == 'drift':
        for dx in range(-3, 4): P(sx_ + dx, sy_ + (1 if abs(dx) > 1 else 0), C['g4'])
        for dx in range(-2, 3): P(sx_ + dx, sy_ - 1, C['g1'])
    elif kind == 'leaf': P(sx_, sy_, C['l2']); P(sx_ + 1, sy_, C['l1']); P(sx_ + 1, sy_ - 1, C['l2']); P(sx_ - 1, sy_ + 1, C['l4'])
    elif kind == 'mushroom': P(sx_, sy_ - 1, C['o3']); P(sx_ + 1, sy_ - 1, C['o3']); P(sx_, sy_ - 2, C['o2']); P(sx_, sy_, C['c1'])
    elif kind == 'dot': P(sx_, sy_, C[R2.choice(['t2', 'p2', 'l1', 'o1'])])
    elif kind == 'crater':
        for dx in range(-3, 4): P(sx_ + dx, sy_ - 2 + (abs(dx) > 2), C['g5']); P(sx_ + dx, sy_ + 1 - (abs(dx) > 2), C['g1'])
apply_shadows()
apply_lights()
for key, fn in sorted(items, key=lambda it: it[0]): fn()
if TH.get('fog'):
    px = frame.load(); F = random.Random(3)
    for _ in range(9):
        cx, cy, rx, ry = F.randint(20, W - 20), F.randint(60, H - 10), F.randint(36, 70), F.randint(4, 8)
        for yy in range(max(0, cy - ry), min(H, cy + ry + 1)):
            for xx in range(max(0, cx - rx), min(W, cx + rx + 1)):
                dd = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
                if dd < 1 and BAYER[yy % 4][xx % 4] < (1 - dd) * 7: px[xx, yy] = snap(mix(px[xx, yy], C['c2'], 0.5))
if TH.get('snowfall'):
    S = random.Random(12)
    for _ in range(360):
        xx, yy = S.randint(0, W - 2), S.randint(0, H - 2); P(xx, yy, C['g1'])
        if S.random() < 0.3: P(xx + 1, yy, C['g1']); P(xx, yy + 1, C['g2'])
frame.save(sys.argv[2])
frame.resize((W * 4, H * 4), Image.NEAREST).save(sys.argv[3], optimize=True)
print(sys.argv[1], 'colours used:', len(set(frame.getdata())))
