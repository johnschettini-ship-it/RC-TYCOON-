#!/usr/bin/env python3
"""Design C of the intro screen of "Thrills & Chills": THE PARK ENTRANCE. Mock-up only, not game code.

A front view of the park gate: two towers, a striped fan arch with bulbs and flags, and a sign board with the name
of the game in pixel lettering. Behind the gate the rides peek over: Chill on the left (big wheel, pines, cool sky),
Thrill on the right (wooden coaster, drop tower, warm sky). The two ticket booths at the foot of the towers carry the
menu (HTML buttons, see intro.html); a sandy path leads through the gate.

Writes scene-desktop.png (640 x 400 art pixels, shown at 2x) and scene-phone.png (195 x 422 art pixels, shown at 2x).
One file pixel is one art pixel. Colours: the kit palette only, at most 48 in one picture.
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'kit3'))
from PIL import Image, ImageChops, ImageDraw, ImageFont
from palette import RAMPS, col, fcol, rgb, INK, count_colours, reduce_colours

WHITE = (255, 255, 255)
FONT = '/home/user/RC-TYCOON-/src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2'   # the game's font, read only


def C(key):
    """'o1' -> orange theme tone; 'Fa1' -> the same key in the frost theme (two pale sky tones); 'W' -> white."""
    if key == 'W': return WHITE
    return fcol(key[1:]) if key[0] == 'F' else col(key)


CHILL = ('t0', 't1', 't2', 't3')     # highlight, base, shade, dark
THRILL = ('o0', 'o1', 'o2', 'o3')
PALETTE = [rgb(h) for ramp in RAMPS.values() for h in ramp]
_snap = {}


def snap(c):
    if c not in _snap: _snap[c] = min(PALETTE, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)
    return _snap[c]


def mix(a, b, t): return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


# ---------------------------------------------------------------- canvas
W = H = 0; F = None; SH = None; SD = None


def start(w, h):
    global W, H, F, SH, SD
    W, H = w, h
    F = Image.new('RGB', (W, H), C('c0'))
    SH = Image.new('L', (W, H), 0); SD = ImageDraw.Draw(SH)


def shift(mask, dx, dy):
    out = Image.new('L', mask.size, 0); out.paste(mask, (dx, dy)); return out


class Layer:
    """A transparent sheet. flush() adds the 1-pixel ink outline around everything on it and pastes it into F."""
    def __init__(self):
        self.im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im)

    def flush(self, outline=True, clip=None):
        a = self.im.getchannel('A')
        if clip:
            m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).rectangle(clip, fill=255)
        if outline:
            dil = a
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): dil = ImageChops.lighter(dil, shift(a, dx, dy))
            edge = ImageChops.subtract(dil, a)
            if clip: edge = ImageChops.multiply(edge, m)
            F.paste(INK, (0, 0), edge)
        if clip: a = ImageChops.multiply(a, m)
        F.paste(self.im.convert('RGB'), (0, 0), a)


def P(x, y, c, im=None):
    if 0 <= x < W and 0 <= y < H: (im or F).putpixel((x, y), c)


def stamp(rows, x, y, cmap, d=None):
    """Paints a text sprite with its bottom centre at (x, y). d: an ImageDraw of a Layer, or None for F."""
    h = len(rows); w = max(len(r) for r in rows); x0, y0 = x - w // 2, y - h + 1
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in '. ': continue
            X, Y = x0 + i, y0 + j
            if 0 <= X < W and 0 <= Y < H:
                if d: d.point((X, Y), fill=cmap[ch])
                else: F.putpixel((X, Y), cmap[ch])


# ---------------------------------------------------------------- sky
def sky(seam, bands, bottom):
    """Flat bands, cool on the left of x = seam and warm on the right, with checker rows where two tones meet."""
    px = F.load(); y0 = 0; prev = None
    for limit, cool, warm in bands:
        cc, wc = C(cool), C(warm)
        for y in range(y0, min(limit, bottom)):
            for x in range(W):
                d = x - seam
                if d < -6: side = 0
                elif d < -2: side = 1 if (x % 2 == 0 and y % 2 == 0) else 0       # a quarter of warm dots
                elif d < 2: side = (x + y) % 2                                    # checker
                elif d < 6: side = 0 if (x % 2 == 0 and y % 2 == 0) else 1       # a quarter of cool dots
                else: side = 1
                c = (cc, wc)[side]
                if prev and y - y0 < 2 and (x + y) % 2 == 0: c = (C(prev[0]), C(prev[1]))[side]
                px[x, y] = c
        y0 = limit; prev = (cool, warm)


def cloud(cx, cy, w, light, shade):
    """A flat cloud: three or four bumps on a flat base, a shade band at the bottom. No outline (far away)."""
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    h = max(5, w // 3)
    bumps = [(-w * 0.28, 0.72), (0.02 * w, 1.0), (w * 0.27, 0.62)]
    for dx, k in bumps:
        r = h * k
        d.ellipse([cx + dx - r * 1.25, cy - r * 2 + 1, cx + dx + r * 1.25, cy + r * 0.6], fill=255)
    d.rectangle([0, cy + 1, W, H], fill=0)
    d.rectangle([cx - w // 2, cy - 2, cx + w // 2, cy], fill=255)
    F.paste(C(light), (0, 0), m)
    low = m.copy(); ImageDraw.Draw(low).rectangle([0, 0, W, cy - 3], fill=0)
    F.paste(C(shade), (0, 0), low)


# ---------------------------------------------------------------- ground
def path_hw(g, y):
    """Half width of the path at row y (a trapezoid that narrows towards the plaza)."""
    t = (y - g['far']) / float(H - g['far'])
    return g['hw_far'] + (g['hw_near'] - g['hw_far']) * t


def ground(g):
    px = F.load(); hz, cx = g['hz'], g['cx']
    rnd = random.Random(11)
    # lawn: a darker far band, then the base tone
    for y in range(hz, H):
        for x in range(W):
            far = y < hz + 4 or (y < hz + 6 and (x + y) % 2 == 0)
            px[x, y] = C('g2') if far else C('g1')
    # lighter and darker flat patches with a checker fringe (the soft patches of the drafts)
    for (ex, ey, rx, ry, key) in g['patches']:
        tone = C(key)
        for y in range(max(hz + 6, int(ey - ry)), min(H, int(ey + ry) + 1)):
            for x in range(max(0, int(ex - rx)), min(W, int(ex + rx) + 1)):
                dd = ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2
                if dd < 0.72 or (dd < 1 and (x + y) % 2 == 0): px[x, y] = tone
    # path: paving rows that grow towards the viewer, joints that run to the vanishing point
    rows = [g['far']]
    while rows[-1] < H: rows.append(rows[-1] + max(3, int(round((rows[-1] - hz) * g.get('row_k', 0.16)))))
    def row_of(y):
        r = 0
        while r + 1 < len(rows) and rows[r + 1] <= y: r += 1
        return r
    ncol = g['ncol']
    for y in range(g['far'], H):
        hw = path_hw(g, y); r = row_of(y); gap = rows[r + 1] - rows[r] if r + 1 < len(rows) else 12
        x0, x1 = int(round(cx - hw)), int(round(cx + hw))
        for x in range(max(0, x0), min(W, x1 + 1)):
            u = (x - cx) / hw; u2 = (x + 1 - cx) / hw
            k = math.floor((u + 1) * ncol / 2 + (0.5 if r % 2 else 0)); k2 = math.floor((u2 + 1) * ncol / 2 + (0.5 if r % 2 else 0))
            hh = (r * 928371 + k * 364479) % 97 / 97.0
            c = C('s0') if hh < 0.3 else C('s1')
            if gap >= 4 and (y + 1 == rows[r + 1] if r + 1 < len(rows) else False): c = C('s2')
            if gap >= 5 and k != k2: c = C('s2')
            if x in (x0, x1): c = C('s3')
            px[x, y] = c
        for x in (x0 - 1, x1 + 1):
            if 0 <= x < W: px[x, y] = C('g3')
    # plaza at the end of the path
    if g.get('plaza'):
        ex, ey, rx, ry = g['plaza']
        d2 = ImageDraw.Draw(F)
        d2.ellipse([ex - rx, ey - ry, ex + rx, ey + ry], fill=C('s1'), outline=C('s3'))
        d2.ellipse([ex - rx + 5, ey - ry + 2, ex + rx - 5, ey + ry - 2], fill=C('s0'))
    # tufts and tiny flowers on the lawn: a fixed seed and a minimum distance (no noise)
    marks = []
    for _ in range(4000):
        tx, ty = rnd.randint(2, W - 3), rnd.randint(hz + 8, H - 2)
        if len(marks) >= g['tufts']: break
        if px[tx, ty] not in (C('g1'), C('g0')) or px[tx - 1, ty - 1] not in (C('g1'), C('g0')) or px[tx + 1, ty - 1] not in (C('g1'), C('g0')): continue
        if any(abs(tx - a) + abs(ty - b) < 10 for a, b, _ in marks): continue
        marks.append((tx, ty, rnd.random()))
    for tx, ty, k in marks:
        left = tx < cx
        if k < 0.72:
            for p in ((tx - 1, ty - 1), (tx, ty), (tx + 1, ty - 1)): px[p] = C('g3')
        else:
            px[tx, ty] = C('l2')
            px[tx, ty - 1] = C(('W', 'b1', 'v1')[int(k * 100) % 3]) if left else C(('W', 'o2', 'p1')[int(k * 100) % 3])


SHADE = {'g0': 'g2', 'g1': 'g3', 'g2': 'g3', 's0': 'c2', 's1': 'c3', 's2': 's3', 's3': 's4', 'l2': 'l3', 'W': 'c2'}


def inlay(cx, cy, rx, ry):
    """A two-tone ring set into the paving in front of the gate: teal on the Chill side, orange on the Thrill side."""
    px = F.load()
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            dd = ((x - cx) / float(rx)) ** 2 + ((y - cy) / float(ry)) ** 2
            if dd > 1: continue
            left = x < cx
            if dd > 0.62: c = 't1' if left else 'o1'
            elif dd > 0.5: c = 't2' if left else 'o2'
            elif dd > 0.12: c = 's0'
            else: c = 't1' if left else 'o1'
            px[x, y] = C(c)
    for k in range(-rx + 3, rx - 2):                      # the star's long points
        if abs(k) > rx * 0.3 and abs(k) < rx * 0.68: px[cx + k, cy] = C('s2')


def apply_shadows():
    """Hard shadows on the ground: every ground tone has one fixed darker tone (no new colours)."""
    table = {C(a): C(b) for a, b in SHADE.items()}
    px, sp = F.load(), SH.load()
    for y in range(H):
        for x in range(W):
            if sp[x, y] and px[x, y] in table: px[x, y] = table[px[x, y]]


# ---------------------------------------------------------------- plants
def tree_round(x, y, R=8, ramp=('l0', 'l1', 'l2', 'l3'), seed=0, trunk=8):
    r = random.Random(seed * 31 + 7)
    L = Layer(); d = L.d
    d.rectangle([x - 1, y - trunk - 1, x + 1, y], fill=C('w1')); d.line([x + 1, y - trunk - 1, x + 1, y], fill=C('w2'))
    cy = y - trunk - R + 2; blobs = [(-R + 3, 3, R - 2), (R - 3, 2, R - 2), (0, -3, R)]
    for dx, dy, rr in blobs: d.ellipse([x + dx - rr, cy + dy - rr, x + dx + rr, cy + dy + rr], fill=C(ramp[3]))
    for dx, dy, rr in blobs: d.ellipse([x + dx - rr, cy + dy - rr, x + dx + rr - 2, cy + dy + rr - 3], fill=C(ramp[2]))
    for dx, dy, rr in blobs: d.ellipse([x + dx - rr + 1, cy + dy - rr + 1, x + dx + rr - 6, cy + dy + rr - 7], fill=C(ramp[1]))
    for k in range(max(3, R - 2)):
        dx, dy, rr = blobs[k % 3]; px_, py_ = x + dx - rr + 3 + r.randint(0, max(1, rr - 3)), cy + dy - rr + 2 + r.randint(0, max(1, rr - 5))
        d.point([(px_, py_), (px_ + 1, py_)], fill=C(ramp[0]))
    L.flush()


def tree_pine(x, y, s=1.0, tiers=3):
    L = Layer(); d = L.d
    d.rectangle([x - 1, y - 4, x + 1, y], fill=C('w2'))
    spec = [(9, 3, 12), (7, 10, 11), (5, 17, 10), (4, 23, 9)][:tiers]
    for hw, yo, hh in spec:
        hw, yo, hh = int(round(hw * s)), int(round(yo * s)), int(round(hh * s))
        top = (x, y - yo - hh)
        d.polygon([top, (x - hw, y - yo), (x, y - yo)], fill=C('l2')); d.polygon([top, (x, y - yo), (x + hw, y - yo)], fill=C('l4'))
        d.line([top, (x - hw, y - yo)], fill=C('l1')); d.line([(x - hw + 1, y - yo), (x - 1, y - yo)], fill=C('l3'))
    L.flush()


def hedge(x0, x1, y, h=10, seed=0, flowers=None):
    """A clipped hedge of round bumps from x0 to x1 with its foot at y."""
    r = random.Random(seed)
    L = Layer(); d = L.d
    d.rectangle([x0, y - h + 4, x1, y], fill=C('l3'))
    x = x0
    while x < x1 + 4:
        rr = r.randint(5, 7)
        d.ellipse([x - rr, y - h - rr // 2, x + rr, y - h + rr + 2], fill=C('l3'))
        d.ellipse([x - rr, y - h - rr // 2, x + rr - 2, y - h + rr - 1], fill=C('l2'))
        d.ellipse([x - rr + 1, y - h - rr // 2 + 1, x + rr - 5, y - h + rr - 4], fill=C('l1'))
        x += r.randint(8, 10)
    if flowers:
        for fx in range(x0 + 3, x1 - 2, 7):
            fy = y - 2 - r.randint(0, h - 5)
            d.point([(fx, fy), (fx + 1, fy)], fill=C(flowers[r.randint(0, len(flowers) - 1)]))
    L.flush(clip=(x0, 0, x1, H))


def bush(x, y, rr=6, ramp=('l1', 'l2', 'l3')):
    L = Layer(); d = L.d
    d.ellipse([x - rr, y - rr - 1, x + rr, y], fill=C(ramp[2]))
    d.ellipse([x - rr, y - rr - 1, x + rr - 2, y - 2], fill=C(ramp[1]))
    d.ellipse([x - rr + 1, y - rr, x + rr - 5, y - 5], fill=C(ramp[0]))
    L.flush()


def flowerbed(x0, x1, y, tones, seed=0):
    """A low bed of leaves with flower dots, foot at y."""
    r = random.Random(seed)
    L = Layer(); d = L.d
    d.rectangle([x0, y - 4, x1, y], fill=C('l3')); d.rectangle([x0, y - 4, x1, y - 3], fill=C('l2'))
    for x in range(x0 + 1, x1, 3):
        yy = y - 3 - r.randint(0, 2)
        d.point([(x, yy)], fill=C(tones[r.randint(0, len(tones) - 1)]))
        if r.random() < 0.5: d.point([(x + 1, yy)], fill=C(tones[r.randint(0, len(tones) - 1)]))
    L.flush()


# ---------------------------------------------------------------- small things
LAMP = ['.ooo.', 'oYYYo', 'oYWYo', '.ooo.', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '.ooo.']
LAMP_S = ['.o.', 'oYo', '.o.', '.o.', '.o.', '.o.', '.o.']
GONDOLA = ['...o.o...', '..ooooo..', '.oRRRRRo.', 'oRRRRRRRo', 'oWWWoWWWo', 'oWWWoWWWo', 'oCCCCCCCo', 'oCCCCCCDo', '.ooooooo.']
GONDOLA_S = ['.ooo.', 'oRRRo', 'oWoWo', 'oCCCo', '.ooo.']
CAR = ['.o.o.o..', 'oKoKoKo.', 'oHoHoHoo', 'oRRRRRRo', 'oRYYYYRo', 'oRRRRRRo', '.oooooo.']
G6 = ['HHH.', 'SSSo', 'TTTo', 'TTTo', 'P.P.', 'P.P.']
G5 = ['HHH.', 'SSSo', 'TTTo', 'TTTo', 'P.P.']
G4 = ['HH.', 'SSo', 'TTo', 'PP.']
G3 = ['H', 'T', 'P']
SHIRTS = ['o2', 't2', 'b1', 'c0', 'p1', 'o1', 'l2', 'b2', 'o3', 't1']
HAIRS = ['i2', 'w2', 'o1', 'w1', 'i2', 'w2']
SKINS = ['k0', 'k0', 'k2', 'k0', 'k2']
PANTS = ['b2', 'i1', 'w2', 'i1']


def lamp(x, y, small=False):
    stamp(LAMP_S if small else LAMP, x, y, {'o': INK, 'Y': C('o0'), 'W': C('W')})


def big_lamp(x, y, h=24):
    """A path lamp of the foreground: a post with a lantern, lit from the upper left."""
    L = Layer(); d = L.d
    d.rectangle([x - 2, y - 2, x + 2, y], fill=C('c3'))
    d.rectangle([x - 1, y - h + 7, x, y - 3], fill=C('c2')); d.line([x, y - h + 7, x, y - 3], fill=C('c3'))
    d.rectangle([x - 3, y - h + 5, x + 2, y - h + 6], fill=C('c3'))
    d.rectangle([x - 3, y - h - 1, x + 2, y - h + 4], fill=C('o0'))
    d.rectangle([x - 2, y - h, x - 1, y - h + 1], fill=C('W'))
    d.line([x + 2, y - h - 1, x + 2, y - h + 4], fill=C('o1'))
    d.rectangle([x - 4, y - h - 3, x + 3, y - h - 2], fill=C('c3')); d.rectangle([x - 2, y - h - 5, x + 1, y - h - 4], fill=C('c3'))
    L.flush()
    SD.ellipse([x - 2, y - 1, x + 9, y + 2], fill=255)


def guest(x, y, n, size=6, balloon=None):
    r = random.Random(n * 7919 + 13)
    rows = {6: G6, 5: G5, 4: G4, 3: G3}[size]
    cm = {'o': INK, 'H': C(HAIRS[n % len(HAIRS)]), 'S': C(SKINS[r.randint(0, len(SKINS) - 1)]), 'T': C(SHIRTS[n % len(SHIRTS)]), 'P': C(PANTS[r.randint(0, len(PANTS) - 1)])}
    stamp(rows, x, y, cm)
    if balloon:
        bx, by = x + 2, y - size - 5
        for yy in range(by + 3, y - size + 2): P(bx, yy, INK)
        L = Layer(); L.d.rectangle([bx - 1, by, bx + 1, by + 2], fill=C(balloon)); L.d.point((bx - 1, by), fill=C('W')); L.flush()


def guest_shadow(x, y, size=6):
    if size >= 5: SD.rectangle([x, y, x + 3, y], fill=255)
    else: SD.rectangle([x, y, x + 1, y], fill=255)


def flag(d, x, y, tone, dark, size=6, pole=8):
    """A pennant on a pole whose foot is at (x, y); flies to the right."""
    d.line([x, y - pole, x, y], fill=C('c3'))
    d.polygon([(x + 1, y - pole), (x + size, y - pole + size // 2), (x + 1, y - pole + size - 1)], fill=C(tone))
    d.line([(x + 1, y - pole + size - 1), (x + size - 1, y - pole + size // 2 + 1)], fill=C(dark))


def bunting(x0, y0, x1, y1, sag, tones, step=5):
    """A string of small flags between two points. No outline: the string is ink, the flags are flat."""
    n = max(2, int(abs(x1 - x0) // 1)); pts = []
    for i in range(n + 1):
        t = i / n; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)
        pts.append((int(round(x)), int(round(y))))
    d = ImageDraw.Draw(F)
    d.line(pts, fill=INK)
    k = 0
    for i in range(step // 2 + 1, len(pts) - 2, step):
        x, y = pts[i]; tone = C(tones[k % len(tones)]); k += 1
        d.rectangle([x - 1, y + 1, x + 1, y + 2], fill=tone); d.point((x, y + 3), fill=tone)


# ---------------------------------------------------------------- rides
def wheel(cx, cy, R, n, foot, small=False, legs_to=None):
    """The big wheel, front view: spokes, a blue rim, hanging gondolas, a cream A-frame."""
    L0 = Layer(); d = L0.d
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        d.line([cx, cy, cx + R * math.cos(a), cy + R * math.sin(a)], fill=C('c3'))
    r2 = int(R * 0.56)
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=C('b1'))
    L0.flush(outline=False)
    L = Layer(); d = L.d
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=C('b2'), width=3)
    d.arc([cx - R, cy - R, cx + R, cy + R], 135, 315, fill=C('b1'))
    d.arc([cx - R + 2, cy - R + 2, cx + R - 2, cy + R - 2], 315, 495, fill=C('b1'))
    L.flush()
    # A-frame and hub in front of the rim
    L = Layer(); d = L.d
    spread = int(R * 0.5); hr = 3 if small else 5
    for sx, shade in ((-spread, 'c1'), (spread, 'c2')):
        d.line([cx, cy, cx + sx, foot], fill=C('c0'), width=2 if small else 4)
        d.line([cx + 1, cy, cx + sx + 1, foot], fill=C(shade), width=1 if small else 2)
        d.rectangle([cx + sx - 4, foot - 2, cx + sx + 4, foot], fill=C('c2'))
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=C('c1')); d.ellipse([cx - hr, cy - hr, cx + hr - 1, cy + hr - 1], fill=C('c0'))
    d.rectangle([cx - 1, cy - 1, cx + 1, cy + 1], fill=C('o1')); d.point((cx - 1, cy - 1), fill=C('o0'))
    L.flush(clip=(0, 0, W, legs_to) if legs_to else None)
    # gondolas hang below the rim points
    tones = [('t1', 't2'), ('v0', 'v1'), ('c0', 'c2')]
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        gx, gy = int(round(cx + R * math.cos(a))), int(round(cy + R * math.sin(a)))
        cab, roof = tones[i % 3]
        rows = GONDOLA_S if small else GONDOLA
        stamp(rows, gx, gy + len(rows) - 2, {'o': INK, 'R': C(roof), 'W': C('c0') if cab != 'c0' else C('b0'), 'C': C(cab), 'D': C(roof)})


def track_y(pts):
    """y for every whole x between the first and the last control point (cosine hills)."""
    ys = {}
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        for x in range(int(xa), int(xb) + 1):
            t = (x - xa) / float(xb - xa)
            ys[x] = ya + (yb - ya) * (1 - math.cos(math.pi * t)) / 2
    return ys


def coaster(pts, foot, train_at=None, post=10, level=12, clip=None):
    """A wooden coaster in side view: a brown lattice, an orange track, a train on the lift hill."""
    ys = track_y(pts)
    xs = sorted(ys)
    L0 = Layer(); d = L0.d
    posts = [x for x in xs if x % post == 0]
    for x in posts: d.line([x, int(ys[x]) + 2, x, foot], fill=C('w1'))
    for xa, xb in zip(posts, posts[1:]):
        top = max(ys[xa], ys[xb]) + 3; k = 0; y = foot - level
        while y > top:
            d.line([xa, y, xb, y], fill=C('w1'))
            lo = y + level
            if (k + xa // post) % 2: d.line([xa, lo, xb, y], fill=C('w0'))
            else: d.line([xa, y, xb, lo], fill=C('w0'))
            y -= level; k += 1
    for x in posts: d.line([x, int(ys[x]) + 2, x, foot], fill=C('w1'))
    L0.flush(outline=False, clip=clip)
    L = Layer(); d = L.d
    line = [(x, int(round(ys[x]))) for x in xs]
    d.line(line, fill=C('o2'), width=3)
    d.line([(x, y + 1) for x, y in line], fill=C('o4'))
    d.line([(x, y - 1) for x, y in line], fill=C('o1'))
    L.flush(clip=clip)
    if train_at:
        for k, x in enumerate(train_at):
            if x in ys: stamp(CAR, x, int(round(ys[x])) - 2, {'o': INK, 'K': C(('w2', 'o1', 'i2')[k % 3]), 'H': C(('k0', 'k2', 'k0')[k % 3]), 'R': C('b2'), 'Y': C('o0')})


def drop_tower(x, top, foot, ring_y, w=10, clip=None):
    """A drop tower: a striped shaft, a cap with a flag, a wide ring of seats."""
    L = Layer(); d = L.d
    for y in range(top, foot + 1):
        for i in range(w):
            lit = i < w * 0.6
            stripe = (y + i) % 12 < 3
            c = ('o1' if lit else 'o2') if stripe else ('c0' if lit else 'c1')
            if i == w - 1: c = 'o3' if stripe else 'c2'
            d.point((x + i, y), fill=C(c))
    # cap
    d.rectangle([x - 3, top - 8, x + w + 2, top - 1], fill=C('o1')); d.rectangle([x + w - 2, top - 8, x + w + 2, top - 1], fill=C('o2'))
    d.line([x - 3, top - 8, x + w + 2, top - 8], fill=C('o0')); d.line([x - 3, top - 1, x + w + 2, top - 1], fill=C('o3'))
    flag(d, x + w // 2, top - 9, 'o2', 'o3', size=7, pole=9)
    # ring of seats: riders on top, a band, a dark underside
    rw = w * 3 + 6; rx = x + w // 2 - rw // 2; rh = 9 if w >= 10 else 7
    d.rectangle([rx + 2, ring_y + rh, rx + rw - 3, ring_y + rh + 2], fill=C('o3'))
    d.rectangle([rx, ring_y, rx + rw - 1, ring_y + rh - 1], fill=C('o1'))
    d.rectangle([rx, ring_y, rx + rw - 1, ring_y + 1], fill=C('o0'))
    d.rectangle([rx, ring_y + rh - 2, rx + rw - 1, ring_y + rh - 1], fill=C('o2'))
    d.rectangle([rx + rw - 5, ring_y + 2, rx + rw - 1, ring_y + rh - 1], fill=C('o2'))
    for k, sx in enumerate(range(rx + 2, rx + rw - 4, 5)):
        d.rectangle([sx, ring_y - 3, sx + 2, ring_y - 3], fill=C(('w2', 'i2', 'o1', 'w2')[k % 4]))
        d.rectangle([sx, ring_y - 2, sx + 2, ring_y - 1], fill=C(('k0', 'k2', 'k0', 'k0')[k % 4]))
        d.rectangle([sx, ring_y + 2, sx + 2, ring_y + rh - 4], fill=C(('t1', 'c0', 'b1', 'c0', 'p1')[k % 5]))
    L.flush(clip=clip)


def carousel(x, y, w=38):
    """A small far carousel, front view: a striped canopy, poles, a platform."""
    L = Layer(); d = L.d; hw = w // 2
    top = y - 30
    d.rectangle([x - hw + 3, y - 4, x + hw - 3, y], fill=C('c1')); d.rectangle([x - hw + 3, y - 4, x + hw - 3, y - 3], fill=C('c0'))
    d.rectangle([x - 3, y - 18, x + 3, y - 5], fill=C('c0')); d.rectangle([x + 1, y - 18, x + 3, y - 5], fill=C('c2'))
    for px_ in (-hw + 6, -hw + 13, hw - 13, hw - 6):
        d.line([x + px_, y - 18, x + px_, y - 5], fill=C('o1'))
    for px_, tone in ((-hw + 9, 'c0'), (hw - 10, 'p1'), (-7, 'o0'), (8, 'c0')):
        d.rectangle([x + px_, y - 11, x + px_ + 2, y - 9], fill=C(tone))
    n = 9; sw = w / float(n)
    for i in range(n):
        xa = x - hw + i * sw; xb = x - hw + (i + 1) * sw
        teal = i % 2 == 0
        d.polygon([(x, top), (xa, y - 21), (xb, y - 21)], fill=C('t1' if teal else 'c0') if i < n * 0.62 else C('t2' if teal else 'c1'))
        d.rectangle([int(xa), y - 21, int(xb), y - 18], fill=C('t2' if teal else 'c1'))
    d.rectangle([x - 1, top - 3, x, top], fill=C('c3'))
    d.polygon([(x + 1, top - 5), (x + 5, top - 3), (x + 1, top - 2)], fill=C('o2'))
    L.flush()


def balloon(x, y, tones=('o1', 'c0', 'o2', 'c1', 'o3')):
    """A hot-air balloon with coloured and cream gores; (x, y) is the centre of the envelope."""
    L = Layer(); d = L.d
    m = Image.new('L', (W, H), 0); md = ImageDraw.Draw(m)
    md.ellipse([x - 9, y - 10, x + 9, y + 9], fill=255); md.polygon([(x - 7, y + 4), (x + 7, y + 4), (x + 2, y + 13), (x - 2, y + 13)], fill=255)
    mp = m.load()
    for yy in range(y - 11, y + 14):
        for xx in range(x - 10, x + 11):
            if 0 <= xx < W and 0 <= yy < H and mp[xx, yy]:
                k = (xx - x + 10) * 5 // 21
                tone = tones[k] if k < 5 else tones[4]
                d.point((xx, yy), fill=C(tone))
    d.line([x - 2, y + 14, x - 2, y + 16], fill=INK); d.line([x + 2, y + 14, x + 2, y + 16], fill=INK)
    d.rectangle([x - 2, y + 17, x + 2, y + 20], fill=C('w1')); d.line([x - 2, y + 17, x + 2, y + 17], fill=C('w0'))
    L.flush()


def fountain(x, y, w=22):
    L = Layer(); d = L.d; hw = w // 2
    d.rectangle([x - hw, y - 4, x + hw, y], fill=C('c1')); d.rectangle([x - hw, y - 4, x + hw, y - 4], fill=C('c0'))
    d.rectangle([x + hw - 3, y - 3, x + hw, y], fill=C('c2'))
    d.rectangle([x - hw + 2, y - 6, x + hw - 2, y - 5], fill=C('a1')); d.point([(x - 5, y - 6), (x + 4, y - 6)], fill=C('a0'))
    d.rectangle([x - 1, y - 12, x + 1, y - 6], fill=C('c0')); d.line([x + 1, y - 12, x + 1, y - 6], fill=C('c2'))
    d.rectangle([x - 3, y - 13, x + 3, y - 12], fill=C('c1'))
    L.flush()
    for dx, dy in ((0, -15), (0, -16), (0, -17), (-1, -15), (1, -15), (-2, -14), (2, -14), (-3, -12), (3, -12)):
        P(x + dx, y + dy, C('W') if dx == 0 else C('a0'))


# ---------------------------------------------------------------- the gate
def tower(x0, x1, top, base, tones, cone_h, badge=None, bands=(), window=None):
    """A gate tower: a cream shaft with coloured bands, a cornice, a cone roof with a pennant."""
    w = x1 - x0; cxm = (x0 + x1) // 2
    L = Layer(); d = L.d
    d.rectangle([x0, top, x1 - 1, base], fill=C('c0'))
    d.rectangle([x0 + int(w * 0.68), top, x1 - 1, base], fill=C('c1'))
    d.rectangle([x1 - (3 if w >= 30 else 2), top, x1 - 1, base], fill=C('c2'))
    for by, bh in bands:
        d.rectangle([x0, by, x1 - 1, by + bh - 1], fill=C(tones[1]))
        d.rectangle([x0 + int(w * 0.68), by, x1 - 1, by + bh - 1], fill=C(tones[2]))
        d.rectangle([x1 - (3 if w >= 30 else 2), by, x1 - 1, by + bh - 1], fill=C(tones[3]))
        d.line([x0, by, x0 + int(w * 0.68) - 1, by], fill=C(tones[0]))
    if window:
        wx, wy, ww, wh, glass = window
        d.rectangle([wx, wy + ww // 2, wx + ww - 1, wy + wh], fill=C(glass[1]))
        d.ellipse([wx, wy, wx + ww - 1, wy + ww], fill=C(glass[1]))
        d.rectangle([wx, wy + ww // 2, wx + ww // 2 - 1, wy + wh - 1], fill=C(glass[0]))
        d.rectangle([wx - 1, wy + wh + 1, wx + ww, wy + wh + 2], fill=C('c2'))
        d.line([wx - 1, wy + wh + 1, wx + ww, wy + wh + 1], fill=C('c0'))
        d.ellipse([wx, wy, wx + ww - 1, wy + ww], outline=INK); d.rectangle([wx, wy + ww // 2, wx + ww - 1, wy + wh], outline=INK)
        d.rectangle([wx + 1, wy + ww // 2, wx + ww - 2, wy + wh - 1], fill=C(glass[1]))
        d.rectangle([wx + 1, wy + ww // 2 - 1, wx + ww // 2 - 1, wy + wh - 1], fill=C(glass[0]))
        d.line([wx + ww // 2, wy + 1, wx + ww // 2, wy + wh - 1], fill=INK)
        d.line([wx + 1, wy + wh // 2 + 2, wx + ww - 2, wy + wh // 2 + 2], fill=INK)
    if badge:
        bx, by, br, kind = badge
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=C(tones[2]))
        d.ellipse([bx - br, by - br, bx + br - 1, by + br - 1], fill=C(tones[1]))
        d.ellipse([bx - br, by - br, bx + br, by + br], outline=INK)
        if kind == 'snow':
            s = br - 3
            d.line([bx - s, by, bx + s, by], fill=C('W')); d.line([bx, by - s, bx, by + s], fill=C('W'))
            k = int(s * 0.7)
            d.line([bx - k, by - k, bx + k, by + k], fill=C('W')); d.line([bx - k, by + k, bx + k, by - k], fill=C('W'))
            d.point((bx, by), fill=C(tones[3]))
        else:
            s = br - 3
            d.polygon([(bx + 1, by - s), (bx - s + 1, by + 1), (bx, by + 1), (bx - 1, by + s), (bx + s - 1, by - 1), (bx, by - 1)], fill=C('c0'))
    # cornice
    d.rectangle([x0 - 2, top - 4, x1 + 1, top - 1], fill=C('c0'))
    d.rectangle([x0 + int(w * 0.68), top - 4, x1 + 1, top - 1], fill=C('c1'))
    d.line([x0 - 2, top - 1, x1 + 1, top - 1], fill=C('c2'))
    # cone roof
    by = top - 5; apex = (cxm, by - cone_h); split = cxm + int(w * 0.12)
    d.polygon([apex, (x0 - 3, by), (split, by)], fill=C(tones[1]))
    d.polygon([apex, (split, by), (x1 + 2, by)], fill=C(tones[2]))
    d.line([apex, (x0 - 3, by)], fill=C(tones[0]))
    d.line([(x0 - 3, by), (x1 + 2, by)], fill=C(tones[3]))
    # finial and pennant
    d.rectangle([cxm - 1, apex[1] - 2, cxm + 1, apex[1]], fill=C('o0'))
    flag(d, cxm, apex[1] - 3, tones[1], tones[2], size=7 if w >= 30 else 5, pole=9 if w >= 30 else 7)
    L.flush()


def arch(xa, xb, ys, apex_y, flags=True):
    """The fan arch between the towers: radial stripes (teal and cream on the left, orange and cream on the right),
    a wooden band with bulbs along the arc, small flags on top and a two-tone medallion with a star at the apex."""
    cx = (xa + xb) / 2.0; half = (xb - xa) / 2.0; rise = ys - apex_y
    R = (half * half + rise * rise) / (2.0 * rise); cyc = apex_y + R
    fy = ys + half * 0.55
    L = Layer(); d = L.d
    nst = max(8, int(round(half / 9.0)))
    amax = math.atan2(half, fy - ys); da = amax / nst
    for y in range(int(apex_y) - 1, ys):
        for x in range(int(xa), int(xb) + 1):
            dist = math.hypot(x + 0.5 - cx, y + 0.5 - cyc)
            if dist > R: continue
            if dist > R - 5:
                c = 'w1'
                if dist > R - 1.2: c = 'w0'
                elif dist < R - 4: c = 'w2'
            else:
                ang = math.atan2(x + 0.5 - cx, fy - (y + 0.5)); k = int(abs(ang) // da)
                tone = (CHILL if ang < 0 else THRILL)
                c = tone[1] if k % 2 == 0 else 'c0'
                if dist > R - 7.5: c = tone[2] if k % 2 == 0 else 'c1'      # the band's shadow on the fan
            d.point((x, y), fill=C(c))
    # bulbs along the arc
    a0 = math.atan2(half, R - rise); arc_len = 2 * a0 * (R - 2.5); nb = int(arc_len // 9)
    for i in range(nb + 1):
        a = -a0 + 2 * a0 * (i + 0.5) / (nb + 1)
        bx, by = int(round(cx + (R - 2.5) * math.sin(a) - 0.5)), int(round(cyc - (R - 2.5) * math.cos(a) - 0.5))
        d.rectangle([bx, by, bx + 1, by + 1], fill=C('o0')); d.point((bx, by), fill=C('W'))
    L.flush()
    # flags on the arc
    if flags:
        L = Layer(); d = L.d
        nfl = max(2, int(half // 26))
        for side in (-1, 1):
            for i in range(1, nfl + 1):
                a = side * a0 * i / (nfl + 0.6)
                fx, fy2 = int(round(cx + R * math.sin(a))), int(round(cyc - R * math.cos(a)))
                tone = CHILL if side < 0 else THRILL
                flag(d, fx, fy2 - 1, tone[1] if i % 2 else tone[2], tone[2] if i % 2 else tone[3], size=5, pole=7)
        L.flush()
    # medallion at the apex
    mx, my, mr = int(round(cx)), int(apex_y) - 1, 9 if half > 100 else 6
    L = Layer(); d = L.d
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=C('o1'))
    d.pieslice([mx - mr, my - mr, mx + mr, my + mr], 90, 270, fill=C('t1'))
    d.arc([mx - mr + 1, my - mr + 1, mx + mr - 1, my + mr - 1], 0, 90, fill=C('o2')); d.arc([mx - mr + 1, my - mr + 1, mx + mr - 1, my + mr - 1], 135, 225, fill=C('t0'))
    s = mr - 2; star = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5; rr = s if i % 2 == 0 else s * 0.45
        star.append((mx + rr * math.cos(a), my + rr * math.sin(a)))
    d.polygon(star, fill=C('c0'))
    L.flush()


def text_masks(words, size, track=1):
    """1-bit glyph masks of Fredoka 700 (no anti-aliasing), one mask for each colour group, drawn letter by letter."""
    f = ImageFont.truetype(FONT, size); f.set_variation_by_axes([700])
    asc, desc = f.getmetrics()
    total = 0
    for txt, grp in words:
        for ch in txt: total += f.getlength(ch) + (track if ch != ' ' else 0)
    w = int(math.ceil(total)) + 4; h = asc + desc + 4
    masks = {}; x = 2.0
    for txt, grp in words:
        for ch in txt:
            if ch != ' ':
                m = masks.setdefault(grp, Image.new('1', (w, h), 0))
                ImageDraw.Draw(m).text((int(round(x)), asc + 1), ch, font=f, fill=1, anchor='ls')
            x += f.getlength(ch) + (track if ch != ' ' else 0)
    return masks, w, h


LOGO_TONES = {'T': ('o2', 'o0', 'o4'), 'A': ('i1', 'i0', 'i2'), 'C': ('b1', 'b0', 'b2')}    # body, highlight, shade


def logo_line(words, size, track=1):
    """One line of the logo as an RGBA picture: bevelled letters (light from the upper left), an ink outline and a
    hard ink shadow of 2 pixels below, like the hard shadows of the game's interface."""
    masks, w, h = text_masks(words, size, track)
    out = Image.new('RGBA', (w + 2, h + 4), (0, 0, 0, 0))
    union = Image.new('L', out.size, 0)
    for grp, m in masks.items(): union.paste(255, (1, 1), m)
    dil = union
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1): dil = ImageChops.lighter(dil, shift(union, dx, dy))
    ink = dil
    for dy in (1, 2): ink = ImageChops.lighter(ink, shift(dil, 0, dy))
    out.paste(INK + (255,), (0, 0), ink)
    for grp, m in masks.items():
        body, hi, shade = LOGO_TONES[grp]
        mm = Image.new('L', out.size, 0); mm.paste(255, (1, 1), m); p = mm.load(); o = out.load()
        for y in range(out.size[1]):
            for x in range(out.size[0]):
                if not p[x, y]: continue
                up = y == 0 or not p[x, y - 1]; left = x == 0 or not p[x - 1, y]
                down = y + 1 >= out.size[1] or not p[x, y + 1]; right = x + 1 >= out.size[0] or not p[x + 1, y]
                c = body
                if (up or left) and not (down or right): c = hi
                elif (down or right) and not (up or left): c = shade
                o[x, y] = C(c) + (255,)
    return out.crop(out.getbbox())


def sign(x0, y0, x1, y1, lines, size, gap=4, track=1):
    """The sign board: a wooden frame with bulbs, a cream face, the logo in pixel lettering."""
    L = Layer(); d = L.d
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=C('w1'))
    d.line([x0, y0, x1 - 1, y0], fill=C('w0')); d.line([x0, y0, x0, y1 - 1], fill=C('w0'))
    d.line([x0, y1 - 1, x1 - 1, y1 - 1], fill=C('w2')); d.line([x1 - 1, y0, x1 - 1, y1 - 1], fill=C('w2'))
    d.rectangle([x0 + 5, y0 + 5, x1 - 6, y1 - 6], fill=C('c0'))
    d.line([x0 + 5, y0 + 5, x1 - 6, y0 + 5], fill=C('c2')); d.line([x0 + 5, y0 + 5, x0 + 5, y1 - 6], fill=C('c2'))
    d.line([x0 + 6, y0 + 6, x1 - 6, y0 + 6], fill=C('c1'))
    d.rectangle([x0 + 4, y0 + 4, x1 - 5, y1 - 5], outline=C('w2'))
    def bulbs(xa, ya, xb, yb):
        ln = max(abs(xb - xa), abs(yb - ya)); n = max(1, int(round(ln / 8.0)))
        for i in range(n + 1):
            bx = int(round(xa + (xb - xa) * i / float(n))); by = int(round(ya + (yb - ya) * i / float(n)))
            d.rectangle([bx, by, bx + 1, by + 1], fill=C('o0' if i % 2 == 0 else 'o1')); d.point((bx, by), fill=C('W' if i % 2 == 0 else 'o0'))
    bulbs(x0 + 1, y0 + 1, x1 - 3, y0 + 1); bulbs(x0 + 1, y1 - 3, x1 - 3, y1 - 3)
    bulbs(x0 + 1, y0 + 1, x0 + 1, y1 - 3); bulbs(x1 - 3, y0 + 1, x1 - 3, y1 - 3)
    L.flush()
    pics = [logo_line(words, size, track) for words in lines]
    total = sum(p.size[1] for p in pics) + gap * (len(pics) - 1)
    y = (y0 + y1) // 2 - total // 2
    for p in pics:
        F.paste(p, ((x0 + x1) // 2 - p.size[0] // 2, y), p)
        y += p.size[1] + gap


def booth(x0, x1, awn, wall, plinth, foot, tones, board=None, straps=()):
    """A ticket booth at the foot of a tower: a cream wall, a striped awning with a scalloped edge, a stone plinth.
    The HTML buttons of the menu sit on the board of the wall."""
    L = Layer(); d = L.d
    d.rectangle([x0, wall, x1 - 1, plinth - 1], fill=C('c0'))
    d.rectangle([x1 - 4, wall, x1 - 1, plinth - 1], fill=C('c1'))
    d.rectangle([x0, wall, x1 - 1, wall + 3], fill=C('c2'))                      # the awning's shadow on the wall
    for x in range(x0, x1):
        if (x + wall) % 2 == 0: d.point((x, wall + 4), fill=C('c2'))
    if board:
        bx0, by0, bx1, by1 = board
        d.rectangle([bx0, by0, bx1, by1], fill=C('c1'))
        d.rectangle([bx0, by0, bx1, by1], outline=C('c2'))
    d.rectangle([x0 - 2, plinth, x1 + 1, foot - 1], fill=C('c2'))
    d.line([x0 - 2, plinth, x1 + 1, plinth], fill=C('c1')); d.rectangle([x1 - 4, plinth + 1, x1 + 1, foot - 1], fill=C('c3'))
    # awning
    ax0, ax1 = x0 - 4, x1 + 4; aw = ax1 - ax0; n = max(5, int(round(aw / 9.0)));
    if n % 2 == 0: n += 1
    body1 = wall - 6
    for i in range(n):
        sa = ax0 + int(round(i * aw / float(n))); sb = ax0 + int(round((i + 1) * aw / float(n))) - 1
        colour = i % 2 == 0
        d.ellipse([sa, wall - 9, sb, wall - 1], fill=C(tones[2] if colour else 'c1'))
        d.rectangle([sa, awn, sb, body1], fill=C(tones[1] if colour else 'c0'))
        d.line([sa, awn, sb, awn], fill=C(tones[0] if colour else 'W'))
        d.line([sa, body1, sb, body1], fill=C(tones[2] if colour else 'c1'))
    L.flush()
    for sx in straps:
        for (ya, yb) in sx[1]:
            x = sx[0]
            ImageDraw.Draw(F).rectangle([x, ya, x + 1, yb], fill=C('c3'))
            ImageDraw.Draw(F).line([x - 1, ya, x - 1, yb], fill=INK); ImageDraw.Draw(F).line([x + 2, ya, x + 2, yb], fill=INK)



BENCH = ['.oooooooooo.', 'oWWWWWWWWWWo', 'oooooooooooo', 'owwwwwwwwwwo', '.oooooooooo.', '..o......o..', '..o......o..']


def bench(x, y):
    stamp(BENCH, x, y, {'o': INK, 'W': C('w0'), 'w': C('w1')})
    SD.rectangle([x - 4, y, x + 8, y + 1], fill=255)


def pond(cx, cy, rx, ry, seed=0):
    """A round garden pond of the Chill side: a stone rim, flat water, a few glints and lily pads."""
    r = random.Random(seed)
    L = Layer(); d = L.d
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=C('c2'))
    d.ellipse([cx - rx, cy - ry, cx + rx - 2, cy + ry - 1], fill=C('c0'))
    d.ellipse([cx - rx + 3, cy - ry + 2, cx + rx - 3, cy + ry - 2], fill=C('a2'))
    d.ellipse([cx - rx + 3, cy - ry + 4, cx + rx - 3, cy + ry - 2], fill=C('a1'))
    def inside(x, y, k=0.7): return ((x - cx) / float(rx - 3)) ** 2 + ((y - (cy + 1)) / float(ry - 3)) ** 2 < k
    n = 0
    while n < rx // 5:
        x, y = r.randint(cx - rx, cx + rx), r.randint(cy - ry + 4, cy + ry - 3)
        if inside(x, y) and inside(x + 4, y): d.line([x, y, x + 3, y], fill=C('a0')); n += 1
    n = 0
    while n < rx // 9:
        x, y = r.randint(cx - rx, cx + rx), r.randint(cy - ry + 5, cy + ry - 3)
        if inside(x - 1, y, 0.6) and inside(x + 3, y, 0.6):
            d.rectangle([x, y, x + 2, y + 1], fill=C('l1')); d.point((x + 2, y + 1), fill=C('l2'))
            if n % 2 == 0: d.point((x + 1, y), fill=C('p1'))
            n += 1
    L.flush()


def parterre(cx, cy, rx, ry, seed=0):
    """A round flower bed of the Thrill side: a band of warm flowers inside a clipped rim, a small tree in the middle."""
    L = Layer(); d = L.d
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=C('l3'))
    d.ellipse([cx - rx, cy - ry, cx + rx - 1, cy + ry - 2], fill=C('l2'))
    m = Image.new('L', (W, H), 0); md = ImageDraw.Draw(m)
    md.ellipse([cx - rx + 4, cy - ry + 2, cx + rx - 4, cy + ry - 3], fill=255)
    md.ellipse([cx - rx * 0.42, cy - ry * 0.42 - 1, cx + rx * 0.42, cy + ry * 0.42 - 1], fill=0)
    mp = m.load()
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if not mp[x, y]: continue
            mark = (y % 2 == 0) and ((x + (y // 2) * 2) % 4 == 0)
            low = not mp[x + 1, y + 1] or not mp[x, y + 1]
            d.point((x, y), fill=C('o0' if mark else 'o2' if low else 'o1'))
    L.flush()
    tree_round(cx, cy + 1, 7, ('o0', 'o1', 'o2', 'o3'), seed=seed, trunk=5)


def strap(x, y0, y1):
    """A short strap from which a sign board hangs (the board itself is an HTML button)."""
    d = ImageDraw.Draw(F)
    d.rectangle([x - 1, y0, x + 2, y1], fill=INK); d.rectangle([x, y0, x + 1, y1], fill=C('c3')); d.line([x, y0, x, y1], fill=C('c2'))


def chain(x, y0, y1):
    for y in range(y0, y1 + 1):
        P(x, y, INK if (y - y0) % 2 == 0 else C('c3')); P(x + 1, y, C('c3') if (y - y0) % 2 == 0 else INK)


def crowd(g, groups, seed=3, y_min=None, y_max=None):
    """Tiny guests in small groups on the path. groups: [(t, y, members)], t from -1 (left edge) to 1 (right edge).
    Returns [(x, y, n, size, balloon)]; near guests are 6 pixels high, far ones 3."""
    r = random.Random(seed); out = []; n = 0
    for t, y, members in groups:
        hw = path_hw(g, y) - 4
        bx = int(round(g['cx'] + t * hw))
        size = 6 if y >= g['ground'] - 6 else 5 if y >= g['ground'] - 36 else 4 if y >= g['ground'] - 58 else 3
        step = 5 if size >= 5 else 4 if size == 4 else 2
        for k in range(members):
            x = bx + (k - (members - 1) / 2.0) * step; yy = y + (k % 2)
            b = None
            if size >= 5 and r.random() < 0.16: b = r.choice(['o2', 't1', 'p1'])
            s = size - 1 if (members >= 3 and k == 1 and size >= 5) else size      # a child in the middle
            out.append((int(round(x)), yy, n, s, b)); n += 1
    return out


# ---------------------------------------------------------------- the two scenes
def scene_desktop():
    start(640, 400)
    g = dict(cx=320, hz=248, far=256, hw_far=14, hw_near=166, ncol=18, row_k=0.1, ground=330, tufts=150,
             plaza=(320, 259, 46, 6),
             patches=[(560, 356, 60, 6, 'g0'), (150, 347, 34, 4, 'g0'), (505, 392, 50, 6, 'g0'),
                      (240, 292, 26, 4, 'g0'), (398, 300, 26, 4, 'g0'), (30, 290, 30, 6, 'g0'), (612, 286, 30, 6, 'g0'),
                      (40, 396, 44, 5, 'g2'), (606, 398, 40, 5, 'g2')])
    sky(320, [(66, 'b0', 's1'), (168, 'Fa1', 's0'), (400, 'Fa0', 'c0')], g['hz'])
    cloud(214, 28, 40, 'W', 'Fa1'); cloud(96, 56, 30, 'W', 'Fa1'); cloud(26, 24, 26, 'W', 'Fa1')
    cloud(432, 30, 36, 'c0', 's0'); cloud(556, 20, 28, 'c0', 's0')
    cloud(236, 196, 30, 'W', 'Fa1'); cloud(420, 214, 26, 'W', 's0')
    ground(g)
    inlay(320, 352, 44, 9)
    # shadows on the ground (the light comes from the upper left)
    for bx0, bx1 in ((62, 192), (448, 578)):
        SD.polygon([(bx0, 330), (bx1, 330), (bx1 + 26, 343), (bx0 + 26, 343)], fill=255)
    for tx, ty, rr in ((16, 396, 12), (628, 398, 12), (212, 306, 8), (228, 288, 6), (428, 306, 8), (410, 288, 6)):
        SD.ellipse([tx - 3, ty - 2, tx + rr + 6, ty + 2], fill=255)
    people = crowd(g, [(-0.55, 392, 2), (0.1, 396, 3), (0.62, 388, 2), (-0.2, 378, 1), (0.35, 372, 3), (-0.7, 368, 2),
                       (-0.05, 360, 2), (0.72, 356, 1), (-0.45, 350, 3), (0.3, 346, 2), (-0.1, 338, 2), (0.6, 336, 2), (-0.72, 334, 1),
                       (0.05, 322, 3), (-0.5, 318, 2), (0.5, 314, 2), (-0.1, 304, 2), (0.3, 298, 2), (-0.4, 292, 2),
                       (0.1, 284, 2), (-0.3, 276, 2), (0.4, 272, 1), (0.0, 268, 2), (-0.5, 264, 1), (0.6, 263, 2)])
    people += [(286, 262, 90, 3, None), (289, 262, 91, 3, None), (352, 261, 92, 3, None), (296, 258, 93, 3, None), (345, 257, 94, 3, None)]
    for x, y, n, s, b in people: guest_shadow(x, y, s)
    apply_shadows()
    # far things at the horizon, seen through the gate
    balloon(398, 186); balloon(262, 204, ('t1', 'c0', 't2', 'c1', 't3'))
    for i, x in enumerate(range(168, 300, 17)): tree_round(x, 250, 8, seed=i + 60, trunk=6)
    for i, x in enumerate(range(350, 484, 17)): tree_round(x, 250, 8, ('o0', 'o1', 'o2', 'o3') if i % 2 == 0 else ('l0', 'l1', 'l2', 'l3'), seed=i + 80, trunk=6)
    for i, x in enumerate(range(176, 296, 13)):
        if i % 3 == 1: tree_pine(x, 254, 0.75)
        else: tree_round(x, 254, 6, seed=i, trunk=5)
    for i, x in enumerate(range(346, 480, 13)):
        if i % 3 == 2: tree_pine(x, 254, 0.75)
        elif i % 2: tree_round(x, 254, 6, ('o0', 'o1', 'o2', 'o3'), seed=i + 20, trunk=5)
        else: tree_round(x, 254, 6, seed=i + 40, trunk=5)
    carousel(244, 259, 42)
    fountain(320, 262, 22)
    # rides behind the gate
    coaster([(502, 176), (526, 152), (548, 182), (578, 84), (676, 182)], 310, train_at=(587, 596, 605))
    drop_tower(611, 34, 310, 58, 12)
    wheel(57, 128, 55, 12, 306)
    # trees and hedges on the two sides
    tree_pine(14, 318, 1.5, 4); tree_pine(40, 322, 1.2); tree_round(34, 300, 8, seed=3)
    tree_round(598, 318, 9, ('o0', 'o1', 'o2', 'o3'), seed=5); tree_round(626, 322, 8, seed=6); tree_pine(586, 300, 1.0)
    hedge(0, 60, 330, 10, seed=1, flowers=('W', 'b1')); hedge(580, 640, 330, 10, seed=2, flowers=('o1', 'p1'))
    # life beyond the gate
    tree_pine(226, 288, 0.9); tree_round(210, 306, 8, seed=11); bush(238, 308, 5)
    tree_round(412, 288, 6, ('o0', 'o1', 'o2', 'o3'), seed=12, trunk=6); tree_round(430, 306, 8, ('o0', 'o1', 'o2', 'o3'), seed=13); bush(402, 308, 5)
    lamp(262, 304); lamp(378, 304); lamp(288, 278, True); lamp(352, 278, True)
    for x, y, n, s, b in sorted(people, key=lambda p: p[1]):
        if y < 330: guest(x, y, n, s, b)
    bunting(150, 150, 320, 176, 6, ('t1', 'c0', 't2', 'b1')); bunting(320, 176, 490, 150, 6, ('o1', 'c0', 'o2', 'p1'))
    # the gate
    tower(110, 150, 62, 330, CHILL, 26, badge=(130, 160, 10, 'snow'), bands=((70, 6), (184, 6)), window=(124, 92, 11, 26, ('b0', 'b1')))
    tower(490, 530, 62, 330, THRILL, 26, badge=(510, 160, 10, 'bolt'), bands=((70, 6), (184, 6)), window=(504, 92, 11, 26, ('o0', 'o1')))
    arch(150, 490, 72, 38)
    sign(147, 68, 493, 134, [[('Thrills', 'T'), (' ', None), ('&', 'A'), (' ', None), ('Chills', 'C')]], 46)
    chain(232, 134, 139); chain(406, 134, 139)
    booth(64, 190, 196, 212, 322, 330, CHILL, board=(67, 218, 187, 317))
    booth(450, 576, 196, 212, 322, 330, THRILL, board=(453, 218, 573, 317))
    for bx in (82, 170, 468, 556):
        for ya, yb in ((216, 222), (253, 258), (283, 288)): strap(bx, ya, yb)
    # foreground
    flowerbed(68, 186, 335, ('W', 'b1', 'v1'), 1); flowerbed(454, 572, 335, ('o1', 'p1', 'W'), 2)
    pond(86, 372, 58, 14, seed=4)
    parterre(556, 374, 46, 12, seed=5)
    big_lamp(196, 352); big_lamp(444, 352)
    bench(176, 392); bench(470, 394)
    for x, y, n, s, b in sorted(people, key=lambda p: p[1]):
        if y >= 330: guest(x, y, n, s, b)
    tree_pine(14, 399, 1.6, 4); tree_round(630, 400, 11, ('o0', 'o1', 'o2', 'o3'), seed=9, trunk=10)
    bush(150, 399, 6); bush(600, 399, 6)
    return F


def scene_phone():
    start(195, 422)
    g = dict(cx=97, hz=238, far=246, hw_far=6, hw_near=44, ncol=8, ground=410, tufts=26, row_k=0.1,
             plaza=(97, 249, 24, 4),
             patches=[(46, 262, 18, 3, 'g0'), (150, 266, 18, 3, 'g0')])
    sky(97, [(46, 'b0', 's1'), (200, 'Fa1', 's0'), (422, 'Fa0', 'c0')], g['hz'])
    cloud(86, 14, 20, 'W', 'Fa1'); cloud(16, 30, 18, 'W', 'Fa1'); cloud(112, 34, 20, 'c0', 's0'); cloud(182, 22, 18, 'c0', 's0')
    cloud(98, 216, 22, 'W', 's0')
    ground(g)
    people = crowd(g, [(0.0, 420, 2), (0.1, 398, 1), (-0.1, 376, 2), (0.15, 352, 1), (-0.1, 330, 2), (0.1, 312, 2),
                       (-0.2, 292, 2), (0.3, 286, 2), (-0.1, 278, 2), (0.2, 270, 1), (-0.3, 264, 2), (0.0, 258, 2)], seed=5)
    people += [(78, 251, 90, 3, None), (116, 250, 91, 3, None), (119, 251, 92, 3, None)]
    for x, y, n, s, b in people: guest_shadow(x, y, s)
    for tx, ty, rr in ((42, 292, 10), (60, 280, 8), (152, 292, 10), (134, 280, 8)): SD.ellipse([tx - 3, ty - 2, tx + rr + 4, ty + 2], fill=255)
    apply_shadows()
    balloon(134, 204); balloon(58, 207, ('t1', 'c0', 't2', 'c1', 't3'))
    for i, x in enumerate(range(32, 84, 12)):
        if i % 3 == 1: tree_pine(x, 242, 0.75)
        else: tree_round(x, 242, 6, seed=i, trunk=5)
    for i, x in enumerate(range(112, 166, 12)):
        if i % 3 == 2: tree_pine(x, 242, 0.75)
        elif i % 2: tree_round(x, 242, 6, ('o0', 'o1', 'o2', 'o3'), seed=i + 20, trunk=5)
        else: tree_round(x, 242, 6, seed=i + 40, trunk=5)
    fountain(97, 252, 18)
    # rides peek over the gate; their feet are hidden by the sign and by the trees behind the gate
    top = (0, 0, 190, 150)
    coaster([(76, 84), (114, 22), (176, 104)], 150, train_at=(119, 128), clip=top)
    drop_tower(148, 16, 150, 30, 8, clip=top)
    wheel(46, 48, 37, 10, 150, small=True, legs_to=150)
    tree_pine(38, 292, 1.5, 4); tree_pine(52, 272, 1.0); tree_round(60, 286, 8, seed=3)
    tree_round(156, 292, 10, ('o0', 'o1', 'o2', 'o3'), seed=5); tree_round(142, 272, 6, ('o0', 'o1', 'o2', 'o3'), seed=7, trunk=6); tree_round(136, 288, 8, seed=6)
    lamp(78, 284); lamp(116, 284); lamp(86, 266, True); lamp(108, 266, True)
    for x, y, n, s, b in sorted(people, key=lambda p: p[1]):
        if y < 296: guest(x, y, n, s, b)
    tower(4, 28, 70, 410, CHILL, 20, badge=(16, 196, 7, 'snow'), bands=((178, 5), (212, 5)))
    tower(167, 191, 70, 410, THRILL, 20, badge=(179, 196, 7, 'bolt'), bands=((178, 5), (212, 5)))
    arch(28, 167, 80, 56, flags=False)
    sign(12, 78, 183, 170, [[('Thrills', 'T')], [('&', 'A'), (' ', None), ('Chills', 'C')]], 40, gap=2)
    chain(40, 170, 175); chain(153, 170, 175)
    booth(4, 87, 296, 310, 404, 410, CHILL)
    booth(108, 191, 296, 310, 404, 410, THRILL)
    for bx in (18, 72, 122, 176):
        for ya, yb in ((312, 314), (343, 348), (373, 378)): strap(bx, ya, yb)
    for x, y, n, s, b in sorted(people, key=lambda p: p[1]):
        if y >= 296: guest(x, y, n, s, b)
    return F


if __name__ == '__main__':
    for name, fn in (('scene-desktop.png', scene_desktop), ('scene-phone.png', scene_phone)):
        im = fn()
        n = count_colours(im)
        if '-v' in sys.argv:
            from palette import hexs
            names = {col(k + str(i)): k + str(i) for k, ramp in RAMPS.items() for i in range(len(ramp))}
            names.update({fcol(k + str(i)): 'F' + k + str(i) for k in 'gsla' for i in range(4)}); names[WHITE] = 'W'
            cs = sorted(im.getcolors(1 << 20))
            print(name, n, 'colours; rarest:', ', '.join('%s %d' % (names.get(c, hexs(c)), k) for k, c in cs[:14]))
        if n > 48:
            im = reduce_colours(im, 48); print(name, 'reduced from', n, 'colours')
        im.save(os.path.join(HERE, name))
        print(name, '%d x %d' % im.size, count_colours(im), 'colours')
