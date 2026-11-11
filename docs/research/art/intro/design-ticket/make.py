#!/usr/bin/env python3
"""Design D, THE TICKET: the pixel pictures of the intro mock-up. Mock-up only, not game code.

Writes, at 1 file pixel for 1 art pixel (every picture is shown at 2x):
  scene-desktop.png   640 x 400   orange evening sky, the low skyline of the park (Thrill left, Chill right)
  scene-phone.png     195 x 422   the same sky, a smaller skyline for the strip under the upright ticket
  ticket-desktop.png  528 x 212   the paper ticket, lying: main part and menu stub (transparent around it)
  ticket-phone.png    175 x 324   the paper ticket, upright: name part above, menu stub below
  logo-desktop.png    326 x 42    "Thrills & Chills" as pixel lettering in one line
  logo-phone.png      135 x 113   the same lettering in three lines
The lettering is drawn from the Fredoka font file of the repository (read only).
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'kit3'))
from PIL import Image, ImageChops, ImageDraw, ImageFont
from palette import INK, col, count_colours

FONT = '/home/user/RC-TYCOON-/src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2'
WHITE = (255, 255, 255)


def K(key): return col(key)


# ------------------------------------------------------------------ small tools
def h3(a, b, c=0):
    n = (a * 374761393 + b * 668265263 + c * 2147483647) & 0xffffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535.0


def vnoise(x, y):
    xi, yi = math.floor(x), math.floor(y); fx, fy = x - xi, y - yi
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = h3(xi, yi), h3(xi + 1, yi), h3(xi, yi + 1), h3(xi + 1, yi + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy


def shift(mask, dx, dy):
    """A copy of an 'L' mask moved by (dx, dy), without wrap-around."""
    out = Image.new('L', mask.size, 0); out.paste(mask, (dx, dy)); return out


def grow(mask, diagonal=False):
    out = mask
    steps = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (-1, 1), (1, -1), (-1, -1)] if diagonal else [])
    for dx, dy in steps: out = ImageChops.lighter(out, shift(mask, dx, dy))
    return out


class Layer:
    """A transparent sheet. flush() adds a 1-pixel ink outline around everything on it and pastes it into the scene."""
    def __init__(self, base, outline=True):
        self.base = base; self.outline = outline
        self.im = Image.new('RGBA', base.size, (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im)

    def flush(self):
        a = self.im.getchannel('A')
        if self.outline:
            edge = ImageChops.subtract(grow(a), a)
            self.base.paste(INK, (0, 0), edge)
        self.base.paste(self.im, (0, 0), self.im)


def stamp(im, rows, x, y, cmap):
    """Paints a text sprite; (x, y) is the middle of its bottom row."""
    h, w = len(rows), max(len(r) for r in rows); x0, y0 = x - w // 2, y - h + 1
    px = im.load(); rgba = im.mode == 'RGBA'
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in '. ': continue
            X, Y = x0 + i, y0 + j
            if 0 <= X < im.size[0] and 0 <= Y < im.size[1]: px[X, Y] = (cmap[ch] + (255,)) if rgba else cmap[ch]


LAMP = ['.ooo.', 'oYYYo', 'oYWYo', '.ooo.', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '.ooo.']
LAMP_S = ['.ooo.', 'oYWYo', '.ooo.', '..o..', '..o..', '..o..', '..o..', '.ooo.']
BENCH = ['.oooooooooo.', 'oWWWWWWWWWWo', 'oooooooooooo', 'owwwwwwwwwwo', '.oooooooooo.', '..o......o..', '..o......o..']
HORSE = ['.....oo..', '....oWWo.', '.oooWWWo.', 'oWWWWWo..', 'oWSSWWo..', 'oWWWWWo..', '.oWoWo...', '.oo.oo...']
HORSE_S = ['...oo.', '.ooWWo', 'oWWWo.', 'oWSWo.', '.oWo..', '.o.o..']
GONDOLA = ['..o.o..', '.ooooo.', 'oRRRRRo', 'oWWoWWo', 'oCCCCCo', 'oCCCCCo', '.ooooo.']
GONDOLA_S = ['.ooo.', 'oRRRo', 'oWWWo', 'oCCCo', '.ooo.']
CAR = ['.oooooo.', 'oKoKoKoo', 'oRRRRRRo', 'oRYYYYRo', '.oooooo.']
CAR_S = ['.oooo.', 'oKoKoo', 'oRRRRo', '.oooo.']
ICE = ['.ooo.', 'oPPPo', 'oPWPo', 'oPPPo', 'oCCCo', '.oCo.', '..o..']
CUP = ['...o..', '..oo..', 'oooooo', 'oTTTTo', 'oTWTTo', '.oTTo.', '.oooo.']
BOAT = ['....o....', '...oWo...', '..oWWo...', '.oWWWo...', '.ooooo...', 'oBBBBBBBo', '.oBBBBBo.', '..ooooo..']
BOAT_S = ['..o...', '.oWo..', 'oWWo..', 'oooooo', '.oBBo.']
SHIRTS = ['o3', 'o1', 't2', 'b1', 'v1', 'c0', 'p1', 't1', 'o2', 'b2']
HAIRS = ['i2', 'w2', 'w1', 'o0', 'w3']


# ------------------------------------------------------------------ the scene
class Scene:
    def __init__(self, w, h, hz):
        self.w, self.h, self.hz = w, h, hz
        self.im = Image.new('RGB', (w, h), K('o1'))
        self.shadow = Image.new('L', (w, h), 0); self.sd = ImageDraw.Draw(self.shadow)
        self.items = []

    def layer(self, outline=True): return Layer(self.im, outline)
    def add(self, key, fn): self.items.append((key, len(self.items), fn))

    def P(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h: self.im.putpixel((x, y), c)

    def shade(self, x, y, rx, ry=2):
        """A flat shadow on the ground, falling to the lower right."""
        self.sd.ellipse([x - rx + (rx * 2) // 3, y - ry + 1, x + rx + (rx * 2) // 3, y + ry + 1], fill=255)

    def apply_shadows(self):
        pairs = [('g0', 'g2'), ('g1', 'g3'), ('g2', 'g3'), ('g3', 'g4'), ('s0', 's2'), ('s1', 's2'), ('s2', 's3'), ('c0', 's1'), ('a0', 'a2'), ('a1', 'a2')]
        darker = {K(a): K(b) for a, b in pairs}
        px, sp = self.im.load(), self.shadow.load()
        for y in range(self.hz, self.h):
            for x in range(self.w):
                if sp[x, y] and px[x, y] in darker: px[x, y] = darker[px[x, y]]

    def render(self):
        self.apply_shadows()
        for key, n, fn in sorted(self.items, key=lambda it: (it[0], it[1])): fn()


def sky(sc, edges, sun=None):
    """Flat bands from the top: edges = [(y of the lower edge, colour key), ...]. Two checker rows join two bands."""
    px = sc.im.load(); y0 = 0; prev = None
    for y1, key in edges:
        c = K(key)
        for y in range(y0, min(sc.h, y1)):
            for x in range(sc.w):
                px[x, y] = prev if (prev is not None and y - y0 < 2 and (x + y) % 2 == 0) else c
        y0 = y1; prev = c
    if sun:
        cx, cy, r = sun; d = ImageDraw.Draw(sc.im)
        d.ellipse([cx - r - 9, cy - r - 9, cx + r + 9, cy + r + 9], fill=K('s0'))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=K('c0'))


def cloud(sc, x, y, w, body='s0', lit='c0'):
    """A long flat evening cloud: no outline (it is far away), a lit upper left edge, a flat base in sunset pink."""
    d = ImageDraw.Draw(sc.im); h = max(5, w // 6)
    lumps = [(0.0, 0.55, 0.5), (0.22, 1.0, 0.42), (0.5, 0.75, 0.4), (0.74, 0.5, 0.26)]
    for colour, dx, dy in ((K(body), 0, 0), (K(lit), -1, -1)):
        for fx, fh, fw in lumps:
            x0 = x + int(fx * w); ww = int(fw * w); hh = max(2, int(h * fh))
            if colour == K(lit): d.chord([x0 + 1, y - hh, x0 + ww - 2, y + hh - 2], 180, 300, fill=colour)
            else: d.chord([x0, y - hh, x0 + ww, y + hh], 180, 360, fill=colour)
    d.rectangle([x + 2, y, x + w - 3, y + 1], fill=K('p0'))
    d.line([(x + 6, y + 3), (x + w - 12, y + 3)], fill=K('p0'))


def stars(sc, spots):
    """The first evening stars in the deep bands at the top: single pale pixels, a few small crosses."""
    for n, (x, y) in enumerate(spots):
        sc.P(x, y, K('c0'))
        if n % 3 == 0:
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]: sc.P(x + dx, y + dy, K('o0'))


def birds(sc, spots, colour):
    for bx, by in spots:
        for dx, dy in [(-2, -1), (-1, 0), (0, 1), (1, 0), (2, -1)]: sc.P(bx + dx, by + dy, colour)


def far_hills(sc, x0, x1, base, amp, colour, seed, slope=0.0):
    """A flat far hill line without outline. slope tilts it (so that both sides sink towards the middle)."""
    d = ImageDraw.Draw(sc.im)
    for x in range(max(0, x0), min(sc.w, x1)):
        t = (x - x0) / max(1, x1 - x0)
        hgt = amp * (0.55 + 0.45 * math.sin(x * 0.021 + seed) * 0.8 + 0.2 * math.sin(x * 0.057 + seed * 2.3)) + slope * t
        d.line([(x, base - int(round(hgt))), (x, base)], fill=K(colour))


def far_trees(sc, x0, x1, base, colour, seed, pines=0.3, size=7):
    """A row of flat far tree shapes (round crowns and pines) in one colour: a silhouette, no outline."""
    d = ImageDraw.Draw(sc.im); r = random.Random(seed); x = x0
    while x < x1:
        s = size + r.randint(-1, 2)
        if r.random() < pines:
            d.polygon([(x, base - s * 2 - 2), (x - s // 2 - 1, base), (x + s // 2 + 1, base)], fill=K(colour))
        else:
            d.ellipse([x - s, base - s * 2 + 2, x + s, base + 2], fill=K(colour))
        x += r.randint(s, s * 2)
    d.rectangle([x0, base, x1, base + 3], fill=K(colour))


def ground(sc, path, pond=None, plaza=None, small=False):
    """Grass in flat patches, a paved path across, an optional pond in the front (cx, cy, rx, ry)."""
    px = sc.im.load(); hz = sc.hz; p0, p1 = path
    g0, g1, g2, g3 = K('g0'), K('g1'), K('g2'), K('g3')
    def water(x, y):
        if not pond: return False
        cx, cy, rx, ry = pond
        return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 or ((x - cx - rx * 0.55) / (rx * 0.6)) ** 2 + ((y - cy + ry * 0.25) / (ry * 0.8)) ** 2 < 1
    for y in range(hz, sc.h):
        for x in range(sc.w):
            if p0 <= y <= p1:
                row = (y - p0 - 1) // 5; slab = (x + row * 5) // 10
                c = K('s0') if h3(slab, row, 5) < 0.3 else K('s1')
                if plaza and plaza[0] <= x <= plaza[1]: c = K('c0') if (x // 5 + row) % 2 == 0 else K('s0')
                if (y - p0 - 1) % 5 == 4 or (x + row * 5) % 10 == 0: c = K('s2')
                if y in (p0, p1): c = K('s3')
            elif water(x, y):
                c = K('a1')
                if not water(x, y - 1) or not water(x, y - 2): c = K('a3')
                elif h3(x // 5, y, 11) < 0.10: c = K('a0')
                elif h3((x + 2) // 6, y, 23) < 0.07: c = K('a2')
            else:
                n = vnoise(x * 0.05, y * 0.16 + 7) * 0.7 + vnoise(x * 0.16 + 3, y * 0.4) * 0.3
                if y < p0: c = g2 if (n > 0.52 or y < hz + 3) else g1
                else: c = g0 if n < 0.4 else g1 if n < 0.63 else g2
                if pond and (water(x - 1, y) or water(x + 1, y) or water(x, y + 1) or water(x, y - 1)): c = K('s3')
            px[x, y] = c
        if y == hz:
            for x in range(sc.w): px[x, y] = g3
    # Grass tufts and a few flowers: a fixed seed, a minimum distance, never on the path or the water.
    r = random.Random(11); marks = []
    for _ in range(900):
        x, y = r.randint(3, sc.w - 4), r.randint(hz + 4, sc.h - 2)
        if p0 - 2 <= y <= p1 + 3 or water(x, y) or water(x, y - 3) or water(x - 3, y) or water(x + 3, y): continue
        if any(abs(x - a) + abs(y - b) * 2 < (9 if small else 12) for a, b in marks): continue
        marks.append((x, y))
        if r.random() < 0.7:
            for dx, dy in [(-1, -1), (0, -2), (1, -1)]: px[x + dx, y + dy] = g3
        else:
            px[x, y - 1] = K(r.choice(['c0', 'p1', 'o0', 'c0'])); px[x, y] = K('l2')


# ------------------------------------------------------------------ objects (side view; x = middle, by = the ground line)
def tree_round(sc, x, by, R=8, ramp=('l0', 'l1', 'l2', 'l3'), seed=0):
    r = random.Random(seed * 31 + x); sc.shade(x, by, R + 1, 2)
    def draw():
        L = sc.layer(); d = L.d; th = R + 1
        d.rectangle([x - 1, by - th, x + 1, by], fill=K('w1')); d.line([x + 1, by - th, x + 1, by], fill=K('w2'))
        cy = by - th - R + 3; blobs = [(-R + 3, 3, R - 2), (R - 3, 2, R - 2), (0, -3, R)]
        for dx, dy, rr in blobs: d.ellipse([x + dx - rr, cy + dy - rr, x + dx + rr, cy + dy + rr], fill=K(ramp[3]))
        for dx, dy, rr in blobs: d.ellipse([x + dx - rr, cy + dy - rr, x + dx + rr - 2, cy + dy + rr - 3], fill=K(ramp[2]))
        for dx, dy, rr in blobs:
            if rr >= 5: d.ellipse([x + dx - rr + 1, cy + dy - rr + 1, x + dx + rr - 6, cy + dy + rr - 7], fill=K(ramp[1]))
            else: d.ellipse([x + dx - rr + 1, cy + dy - rr + 1, x + dx, cy + dy - 1], fill=K(ramp[1]))
        for k in range(5 if R >= 7 else 2):
            dx, dy, rr = blobs[k % 3]; px_, py_ = x + dx - rr + 3 + r.randint(0, max(0, rr - 3)), cy + dy - rr + 2 + r.randint(0, max(0, rr - 4))
            d.point([(px_, py_), (px_ + 1, py_)], fill=K(ramp[0]))
        L.flush()
    sc.add(by, draw)


def tree_pine(sc, x, by, k=1.0, seed=0):
    sc.shade(x, by, int(8 * k) + 1, 2)
    def draw():
        L = sc.layer(); d = L.d
        d.rectangle([x - 1, by - max(2, int(4 * k)), x + 1, by], fill=K('w2'))
        for hw, yo, hh in [(9, 3, 12), (7, 10, 11), (5, 17, 11)]:
            hw, yo, hh = max(2, int(round(hw * k))), int(round(yo * k)), max(3, int(round(hh * k)))
            top = (x, by - yo - hh)
            d.polygon([top, (x - hw, by - yo), (x, by - yo)], fill=K('l2')); d.polygon([top, (x, by - yo), (x + hw, by - yo)], fill=K('l4'))
            d.line([top, (x - hw, by - yo)], fill=K('l1')); d.line([(x - hw + 1, by - yo), (x - 1, by - yo)], fill=K('l3'))
        L.flush()
    sc.add(by, draw)


def bush(sc, x, by, ramp=('l0', 'l2', 'l3')):
    def draw():
        L = sc.layer()
        L.d.ellipse([x - 5, by - 6, x + 5, by], fill=K(ramp[2])); L.d.ellipse([x - 5, by - 6, x + 3, by - 2], fill=K(ramp[1]))
        L.d.point([(x - 3, by - 5), (x - 2, by - 5), (x, by - 4)], fill=K(ramp[0])); L.flush()
    sc.add(by, draw)


def lamp(sc, x, by, small=False):
    sc.add(by, lambda: stamp(sc.im, LAMP_S if small else LAMP, x, by, {'o': INK, 'Y': K('o0'), 'W': K('c0')}))


def bench(sc, x, by):
    sc.add(by, lambda: stamp(sc.im, BENCH, x, by, {'o': INK, 'W': K('w0'), 'w': K('w1')}))


def guest(sc, x, by, n, kid=False, balloon=None):
    """A tiny park guest, 5 art pixels high (a child: 4)."""
    r = random.Random(n * 7919 + 13)
    hair, skin, shirt = K(r.choice(HAIRS)), K(r.choice(['k0', 'k0', 'k1', 'k2'])), K(SHIRTS[n % len(SHIRTS)])
    def draw():
        P = sc.P
        if kid:
            P(x, by - 3, hair); P(x, by - 2, skin); P(x - 1, by - 1, shirt); P(x, by - 1, shirt); P(x + 1, by - 1, shirt); P(x, by, INK)
        else:
            P(x, by - 4, hair); P(x + 1, by - 4, hair); P(x, by - 3, skin); P(x + 1, by - 3, skin)
            for dx in (-1, 0, 1, 2): P(x + dx, by - 2, shirt)
            P(x, by - 1, shirt); P(x + 1, by - 1, shirt); P(x, by, INK); P(x + 1, by, INK)
        if balloon:
            bx, bb = x + 3, by - 9
            for dy in range(4): P(bx, bb + 3 + dy, INK)
            for dx, dy in [(-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1), (0, -1), (0, 2)]: P(bx + dx, bb + dy, K(balloon))
            P(bx - 1, bb, K('c0'))
    sc.add(by + 0.5, draw)


def stall(sc, x, by, awn, icon, icmap, k=1.0):
    dk = {'o3': 'o4', 't2': 't3', 'o1': 'o2', 'b1': 'b2'}[awn]
    hw = int(12 * k); hh = int(13 * k); sc.shade(x + 2, by, hw + 3, 2)
    def draw():
        L = sc.layer(); d = L.d
        d.rectangle([x - hw, by - hh, x + hw, by], fill=K('c0')); d.rectangle([x + hw - int(5 * k), by - hh, x + hw, by], fill=K('c2'))
        d.rectangle([x - hw + 3, by - hh + 3, x + hw - int(5 * k) - 3, by - int(5 * k)], fill=K('i1'))
        vx = x - 2; d.rectangle([vx - 1, by - int(5 * k) - 4, vx, by - int(5 * k) - 3], fill=K('k0')); d.line([(vx - 1, by - int(5 * k) - 5), (vx, by - int(5 * k) - 5)], fill=K('w2'))
        d.rectangle([vx - 2, by - int(5 * k) - 2, vx + 1, by - int(5 * k) - 1], fill=K(awn))
        d.line([(x - hw + 1, by - int(5 * k) + 1), (x + hw - int(5 * k) - 1, by - int(5 * k) + 1)], fill=K('w0'))
        d.line([(x - hw + 1, by - int(5 * k) + 2), (x + hw - int(5 * k) - 1, by - int(5 * k) + 2)], fill=K('w1'))
        # the awning: a striped roof with a valance
        top, low = by - hh - int(6 * k), by - hh + 2
        n = 7 if k >= 1 else 5; w2 = hw + 3
        for i in range(n):
            a0, a1 = -w2 + (2 * w2 + 1) * i // n, -w2 + (2 * w2 + 1) * (i + 1) // n - 1
            t0, t1 = int(a0 * 0.78), int(a1 * 0.78)
            lit = i < n * 0.6
            c = K(awn if lit else dk) if i % 2 == 0 else K('c0' if lit else 'c1')
            d.polygon([(x + t0, top), (x + t1, top), (x + a1, by - hh), (x + a0, by - hh)], fill=c)
            d.rectangle([x + a0, by - hh, x + a1, low - (1 if i % 2 else 0)], fill=c)
        px_, py_ = x, top - 1; d.line([(px_, py_), (px_, py_ - 3)], fill=K('w2'))
        L.flush(); stamp(sc.im, icon, px_, py_ - 3, icmap)
    sc.add(by, draw)


def fountain(sc, x, by, k=1.0):
    w = int(12 * k); sc.shade(x + 2, by, w + 2, 2)
    def draw():
        L = sc.layer(); d = L.d
        d.rectangle([x - w, by - int(5 * k), x + w, by], fill=K('c1')); d.rectangle([x + w // 2, by - int(5 * k), x + w, by], fill=K('c3'))
        d.line([(x - w, by - int(5 * k)), (x + w, by - int(5 * k))], fill=K('c0'))
        d.line([(x - w + 2, by - int(5 * k) - 1), (x + w - 2, by - int(5 * k) - 1)], fill=K('a1'))
        d.rectangle([x - 1, by - int(13 * k), x + 1, by - int(5 * k) - 2], fill=K('c1')); d.line([(x + 1, by - int(13 * k)), (x + 1, by - int(5 * k) - 2)], fill=K('c3'))
        d.rectangle([x - int(4 * k), by - int(13 * k) - 2, x + int(4 * k), by - int(13 * k)], fill=K('c0'))
        L.flush()
        top = by - int(13 * k) - 3
        for i in range(int(11 * k)):
            t = i / max(1, int(11 * k) - 1); dx = int(round(t * (w - 3))); dy = int(round(-7 * k * math.sin(t * math.pi) * (1 - t * 0.5) + t * (int(13 * k) - int(5 * k))))
            for sx in (-1, 1): sc.P(x + sx * dx, top + dy - 2, K('c0') if i % 2 == 0 else K('a0'))
    sc.add(by, draw)


def flowerbed(sc, x, by, w=14):
    def draw():
        L = sc.layer(); L.d.rectangle([x - w // 2, by - 2, x + w // 2, by], fill=K('w2')); L.flush()
        r = random.Random(x)
        for i in range(x - w // 2 + 1, x + w // 2, 2):
            sc.P(i, by - 3, K(r.choice(['p1', 'o0', 'c0', 'p1']))); sc.P(i, by - 2, K('l2'))
    sc.add(by, draw)


def pole(sc, x, by, hgt=26):
    def draw():
        L = sc.layer()
        for yy in range(by - hgt, by + 1): L.d.point([(x, yy), (x + 1, yy)], fill=K('o3') if ((yy - by + hgt) // 3) % 2 else K('c0'))
        L.d.rectangle([x - 1, by - hgt - 3, x + 2, by - hgt - 1], fill=K('o0')); L.flush()
    sc.add(by, draw)


def bunting(sc, x0, x1, y, sag=5, key=0):
    def draw():
        n = x1 - x0
        for k in range(n + 1):
            X = x0 + k; Y = y + int(round(sag * math.sin(math.pi * k / n)))
            sc.P(X, Y, INK)
            if k % 5 == 2:
                c = K(['o3', 'o0', 't2', 'c0', 'b1'][(k // 5) % 5])
                for dx, dy in [(-1, 1), (0, 1), (1, 1), (0, 2)]: sc.P(X + dx, Y + dy, c)
                sc.P(X, Y + 3, INK)
    sc.add(key, draw)


def carousel(sc, x, by, k=1.0):
    R = int(30 * k); H = int(54 * k); sc.shade(x + 3, by, R + 4, 3)
    small = k < 0.8
    def draw():
        L = sc.layer(); d = L.d
        deck = by - int(7 * k); roof = by - int(38 * k)
        # the platform: a cream step and a teal deck
        d.rectangle([x - R + 1, by - int(3 * k), x + R - 1, by], fill=K('c1')); d.rectangle([x + R // 2, by - int(3 * k), x + R - 1, by], fill=K('c3'))
        d.line([(x - R + 1, by - int(3 * k)), (x + R - 1, by - int(3 * k))], fill=K('c0'))
        d.rectangle([x - R + 4, deck, x + R - 4, by - int(3 * k) - 1], fill=K('t1')); d.rectangle([x + R // 2, deck, x + R - 4, by - int(3 * k) - 1], fill=K('t3'))
        d.line([(x - R + 4, deck), (x + R - 4, deck)], fill=K('t0'))
        # the middle column
        cw = max(2, int(4 * k))
        d.rectangle([x - cw, roof, x + cw, deck - 1], fill=K('c0')); d.rectangle([x + cw // 2, roof, x + cw, deck - 1], fill=K('c2'))
        for z in range(deck - int(6 * k), roof, -max(4, int(7 * k))): d.line([(x - cw, z), (x + cw, z)], fill=K('o2'))
        # poles and horses
        offs = [-0.74, -0.38, 0.38, 0.74] if not small else [-0.7, 0.7]
        for n, f in enumerate(offs):
            hx = x + int(R * f); d.line([(hx, roof), (hx, deck - 1)], fill=K('o0'))
            hy = deck - 2 - (n % 2) * int(4 * k)
            stamp(L.im, HORSE_S if small else HORSE, hx, hy, {'o': INK, 'W': K('c0') if n % 2 else K('o0'), 'S': K(['o3', 'b1', 'v1', 'p1'][n % 4])})
        L.flush()
        # the roof: a striped cone with a valance
        L = sc.layer(); d = L.d; apex = (x, by - H); n = 10; RR = R + 2
        val = roof + max(3, int(4 * k))
        for i in range(n):
            xa = x + int(round(RR * math.cos(math.pi * (1 - i / n)))); xb = x + int(round(RR * math.cos(math.pi * (1 - (i + 1) / n))))
            lit = i < 6
            c = K('t1' if lit else 't3') if i % 2 == 0 else K('c0' if lit else 'c2')
            d.polygon([apex, (xa, roof), (xb, roof)], fill=c)
            c2 = K('t2' if lit else 't3') if i % 2 == 0 else K('c0' if lit else 'c1')
            d.rectangle([xa, roof, xb, val - (1 if i % 2 else 0)], fill=c2)
        ax, ay = apex; d.rectangle([ax - 1, ay - 3, ax + 1, ay - 1], fill=K('o0')); d.line([(ax, ay - 9), (ax, ay - 4)], fill=K('w2'))
        d.polygon([(ax + 1, ay - 9), (ax + 6, ay - 7), (ax + 1, ay - 6)], fill=K('o3'))
        L.flush()
        for i in range(0, 2 * RR + 1, 5): sc.P(x - RR + i, roof, K('o0'))
    sc.add(by, draw)


def wheel(sc, x, by, R=42, small=False):
    hub = (x, by - R - (10 if small else 14)); sc.shade(x + 4, by, int(R * 0.8), 3)
    def pt(t, f=1.0): return (int(round(hub[0] + R * f * math.cos(t))), int(round(hub[1] + R * f * math.sin(t))))
    def draw():
        pw = int(R * 0.72)
        L = sc.layer(); d = L.d
        d.rectangle([x - pw, by - 3, x + pw, by], fill=K('c1')); d.rectangle([x + pw // 2, by - 3, x + pw, by], fill=K('c3')); d.line([(x - pw, by - 3), (x + pw, by - 3)], fill=K('c0'))
        if not small: d.line([(x - pw + 6, by - 4), hub], fill=K('c2'), width=2); d.line([(x + pw - 7, by - 4), hub], fill=K('c2'), width=2)
        L.flush()
        L = sc.layer(outline=False); d = L.d
        ns = 8 if small else 12
        for i in range(ns): d.line([hub, pt(i * 2 * math.pi / ns + 0.13)], fill=K('c3'))
        rr = int(R * 0.8); d.ellipse([hub[0] - rr, hub[1] - rr, hub[0] + rr, hub[1] + rr], outline=K('b2'))
        L.flush()
        L = sc.layer(); d = L.d
        d.ellipse([hub[0] - R, hub[1] - R, hub[0] + R, hub[1] + R], outline=K('b1'), width=2)
        L.flush()
        for i in range(24):
            if i % 2 == 0: sc.P(*pt(i * math.pi / 12 + 0.13, 1.0 - 0.5 / R), K('o0'))
        n = 8 if small else 10
        cols = [('t1', 't2'), ('v0', 'v1'), ('b0', 'b1'), ('c0', 'c2'), ('t0', 't1')]
        for i in range(n):
            gx, gy = pt(0.13 + i * 2 * math.pi / n); cc = cols[i % 5]
            stamp(sc.im, GONDOLA_S if small else GONDOLA, gx, gy + (5 if small else 8), {'o': INK, 'R': K(cc[1]), 'W': K('c0'), 'C': K(cc[0])})
        L = sc.layer(); d = L.d
        d.line([(x - pw + 2, by - 4), hub], fill=K('c0'), width=2); d.line([(x + pw - 3, by - 4), hub], fill=K('c0'), width=2)
        hr = 2 if small else 3
        d.ellipse([hub[0] - hr, hub[1] - hr, hub[0] + hr, hub[1] + hr], fill=K('o0')); d.point([(hub[0] - 1, hub[1] - 1)], fill=K('c0'))
        L.flush()
    sc.add(by, draw)


def tower(sc, x, by, hgt=104, k=1.0):
    bw = int(12 * k); sw = max(2, int(4 * k)); sc.shade(x + 3, by, bw + 3, 2)
    def draw():
        L = sc.layer(); d = L.d
        d.rectangle([x - bw, by - int(5 * k), x + bw, by], fill=K('c1')); d.rectangle([x + bw // 2, by - int(5 * k), x + bw, by], fill=K('c3')); d.line([(x - bw, by - int(5 * k)), (x + bw, by - int(5 * k))], fill=K('c0'))
        top = by - hgt
        d.rectangle([x - sw, top, x + sw, by - int(5 * k) - 1], fill=K('c0')); d.rectangle([x + sw // 2 + 1, top, x + sw, by - int(5 * k) - 1], fill=K('c2'))
        z = by - int(5 * k) - 3
        while z - 2 * sw > top:
            d.line([(x - sw, z), (x + sw // 2, z - sw - sw // 2)], fill=K('o2')); d.line([(x + sw // 2 + 1, z - sw - sw // 2), (x + sw, z - 2 * sw)], fill=K('o4')); z -= max(6, int(9 * k))
        # the ring of seats
        ry = by - int(hgt * 0.6); rw = int(15 * k); rh = max(2, int(3 * k))
        d.rectangle([x - rw, ry - rh, x + rw, ry + rh], fill=K('o2')); d.rectangle([x + rw // 2, ry - rh, x + rw, ry + rh], fill=K('o4'))
        d.line([(x - rw, ry - rh), (x + rw, ry - rh)], fill=K('o0')); d.rectangle([x - rw + 2, ry + rh + 1, x + rw - 2, ry + rh + 1], fill=K('o4'))
        step = 4 if k >= 1 else 3
        for n, hx in enumerate(range(x - rw + 2, x + rw - 1, step)):
            d.point([(hx, ry - rh - 3)], fill=K(['w2', 'i2', 'o0', 'w3'][n % 4])); d.point([(hx, ry - rh - 2)], fill=K(['k0', 'k1', 'k2', 'k0'][n % 4])); d.point([(hx, ry - rh - 1)], fill=K(SHIRTS[n % 8]))
        cw = int(7 * k)
        d.rectangle([x - cw, top - int(5 * k), x + cw, top], fill=K('o2')); d.rectangle([x + cw // 2, top - int(5 * k), x + cw, top], fill=K('o4')); d.line([(x - cw, top - int(5 * k)), (x + cw, top - int(5 * k))], fill=K('o0'))
        ty = top - int(5 * k) - 1; fl = max(5, int(9 * k))
        d.line([(x, ty), (x, ty - fl)], fill=K('w2')); d.polygon([(x + 1, ty - fl), (x + 1 + fl * 3 // 4, ty - fl + 2), (x + 1, ty - fl + 4)], fill=K('o3'))
        L.flush()
    sc.add(by, draw)


def spline(cp, steps=14):
    def cr(a, b, c, d, t): return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
    pts = []
    for i in range(len(cp) - 1):
        a, b, c, d = cp[max(0, i - 1)], cp[i], cp[i + 1], cp[min(len(cp) - 1, i + 2)]
        for s in range(steps):
            t = s / steps; pts.append((cr(a[0], b[0], c[0], d[0], t), cr(a[1], b[1], c[1], d[1], t)))
    pts.append(cp[-1]); return pts


def coaster(sc, x0, by, cp, post=7, small=False, trains=((0.33, 't2'),), station=None):
    """A wooden coaster in side view. cp: control points (dx, height above the ground). station: (dx0, dx1) of the roofed platform."""
    pts = [(x0 + px_, by - h) for px_, h in spline(cp)]
    line = [(int(round(a)), int(round(b))) for a, b in pts]
    ys = {}
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        for xx in range(int(math.floor(min(xa, xb))), int(math.ceil(max(xa, xb))) + 1):
            if xb != xa:
                t = min(1.0, max(0.0, (xx - xa) / (xb - xa))); yy = ya + (yb - ya) * t
                ys[xx] = min(ys.get(xx, 1e9), yy)
    xmin, xmax = min(ys), max(ys)
    sc.sd.rectangle([xmin + 4, by - 1, xmax + 10, by + 2], fill=255)
    def draw():
        L = sc.layer(outline=False); d = L.d; posts = []
        for xx in range(xmin + 3, xmax, post):
            top = int(round(ys[xx])) + 2
            if by - top < 6: continue
            posts.append((xx, top)); d.line([(xx, top), (xx, by)], fill=K('c1')); d.line([(xx + 1, top), (xx + 1, by)], fill=K('c3'))
        lev = 9 if small else 11
        for (xa, ta), (xb, tb) in zip(posts, posts[1:]):
            if xb - xa > post: continue
            z = by - lev; n = 0
            while z > max(ta, tb) + 2:
                d.line([(xa + 2, z), (xb - 1, z)], fill=K('c2'))
                up = max(max(ta, tb) + 1, z - lev)
                if (n + (xa - xmin) // post) % 2 == 0: d.line([(xa + 2, z - 1), (xb - 1, up + 1)], fill=K('c3'))
                else: d.line([(xa + 2, up + 1), (xb - 1, z - 1)], fill=K('c3'))
                z -= lev; n += 1
        L.flush()
        if station:
            L = sc.layer(); d = L.d; sx0, sx1 = x0 + station[0], x0 + station[1]; ph = int(cp[0][1]) - 2
            d.rectangle([sx0, by - ph, sx1, by], fill=K('c1')); d.rectangle([sx0 + (sx1 - sx0) * 2 // 3, by - ph, sx1, by], fill=K('c3')); d.line([(sx0, by - ph), (sx1, by - ph)], fill=K('c0'))
            L.flush()
        L = sc.layer(); d = L.d
        d.line(line, fill=K('o3'), width=3, joint='curve')
        d.line([(a, b - 1) for a, b in line], fill=K('o1')); d.line([(a, b + 1) for a, b in line], fill=K('o4'))
        L.flush()
        for i in range(0, len(line), 3): sc.P(line[i][0], line[i][1], K('o5'))
        for at, body in trains:
            i0 = int(at * len(line)); gap = 5 if small else 7; prev = None
            for c in range(3):
                # walk along the track until the next car is one car length away
                i = i0 if prev is None else next((j for j in range(prev + 1, len(line)) if math.hypot(line[j][0] - line[prev][0], line[j][1] - line[prev][1]) >= gap + 1), len(line) - 1)
                prev = i; sx_, sy_ = line[i]
                stamp(sc.im, CAR_S if small else CAR, sx_, sy_ - 2, {'o': INK, 'K': K(['k0', 'k1', 'k2'][c % 3]), 'R': K(body), 'Y': K('o0')})
        if station:
            L = sc.layer(); d = L.d; sx0, sx1 = x0 + station[0], x0 + station[1]; ph = int(cp[0][1]); rf = by - ph - (11 if small else 16)
            for px_ in (sx0 + 2, (sx0 + sx1) // 2, sx1 - 3): d.line([(px_, rf), (px_, by - ph + 1)], fill=K('c0'), width=2)
            n = 6 if small else 9; a = sx0 - 3; b = sx1 + 3
            for i in range(n):
                a0, a1 = a + (b - a + 1) * i // n, a + (b - a + 1) * (i + 1) // n - 1
                lit = i < n * 0.6
                c = K('o1' if lit else 'o2') if i % 2 == 0 else K('c0' if lit else 'c1')
                d.rectangle([a0, rf - 5, a1, rf - (1 if i % 2 else 0)], fill=c)
            d.line([(a, rf - 5), (b, rf - 5)], fill=K('o0'))
            if not small:
                mx = (sx0 + sx1) // 2; d.rectangle([mx - 9, rf - 12, mx + 9, rf - 6], fill=K('o3')); d.line([(mx - 9, rf - 12), (mx + 9, rf - 12)], fill=K('o1'))
                for i in range(4): d.rectangle([mx - 7 + i * 4, rf - 10, mx - 6 + i * 4, rf - 8], fill=K('c0'))
            L.flush()
    sc.add(by - 1, draw)


def balloon(sc, cx, cy, ramp=('t2', 'c0', 't1', 'c0', 't3', 'c1'), k=1.0):
    """A hot-air balloon in the evening sky."""
    L = sc.layer(); d = L.d; rw = int(15 * k)
    m = Image.new('L', sc.im.size, 0); md = ImageDraw.Draw(m)
    md.ellipse([cx - rw, cy - int(18 * k), cx + rw, cy + int(12 * k)], fill=255)
    md.polygon([(cx - int(11 * k), cy + int(6 * k)), (cx + int(11 * k), cy + int(6 * k)), (cx + int(4 * k), cy + int(20 * k)), (cx - int(4 * k), cy + int(20 * k))], fill=255)
    bw = (2 * rw + 1) / 6.0
    for n in range(6):
        band = Image.new('L', sc.im.size, 0); ImageDraw.Draw(band).rectangle([cx - rw + int(n * bw), 0, cx - rw + int((n + 1) * bw) - 1, sc.h], fill=255)
        L.im.paste(K(ramp[n]) + (255,), (0, 0), ImageChops.multiply(m, band))
    by = cy + int(20 * k)
    d.line([(cx - int(4 * k), by + 1), (cx - int(3 * k), by + int(6 * k))], fill=K('w2')); d.line([(cx + int(4 * k), by + 1), (cx + int(3 * k), by + int(6 * k))], fill=K('w2'))
    d.rectangle([cx - int(3 * k), by + int(6 * k), cx + int(3 * k), by + int(10 * k)], fill=K('w1')); d.line([(cx - int(3 * k), by + int(6 * k)), (cx + int(3 * k), by + int(6 * k))], fill=K('w0'))
    L.flush()


def boat(sc, x, y, hull='o2', small=False):
    sc.add(y, lambda: stamp(sc.im, BOAT_S if small else BOAT, x, y, {'o': INK, 'W': K('c0'), 'B': K(hull)}))


AUTUMN = ('o0', 'o1', 'o2', 'o4')


# ------------------------------------------------------------------ the two scenes
def scene_desktop():
    W, H, GY = 640, 400, 354          # GY: the line on which the rides stand
    HZ = GY - 12; g = GY
    sc = Scene(W, H, HZ)
    sky(sc, [(16, 'o3'), (84, 'o2'), (196, 'o1'), (H, 'o0')], sun=(320, g - 24, 38))
    cloud(sc, -22, 130, 74); cloud(sc, 572, 92, 92); cloud(sc, 6, 256, 50); cloud(sc, 574, 250, 58)
    birds(sc, [(22, 206), (34, 199), (45, 209)], K('c0'))
    stars(sc, [(18, 9), (64, 20), (118, 6), (170, 15), (236, 8), (300, 18), (352, 5), (420, 13), (486, 7), (540, 19), (598, 10), (628, 34), (12, 46), (40, 70), (606, 58), (30, 28)])
    balloon(sc, 613, 168)
    far_hills(sc, 0, 300, HZ, 30, 's1', 1.0, slope=-24); far_hills(sc, 340, W, HZ, 22, 'l0', 2.2, slope=18)
    far_trees(sc, 0, 262, HZ - 2, 's2', 4, pines=0.15); far_trees(sc, 378, W, HZ - 2, 'l1', 7, pines=0.55)
    ground(sc, (g + 4, g + 15), pond=(588, g + 36, 50, 11), plaza=(298, 342))

    # Thrill side (left): drop tower, wooden coaster with its station, a snack stall, autumn trees.
    tower(sc, 24, g, 104)
    cp = [(0, 10), (16, 10), (30, 10), (40, 15), (82, 88), (92, 98), (102, 89), (120, 26), (129, 14), (138, 22), (154, 56), (163, 61), (172, 56), (186, 24), (194, 14), (204, 10), (214, 10)]
    coaster(sc, 46, g, cp, trains=((0.318, 'o4'), (0.012, 'v1'), (0.70, 'p1')), station=(-4, 30))
    stall(sc, 276, g + 1, 'o3', ICE, {'o': INK, 'P': K('p1'), 'W': K('c0'), 'C': K('w0')})
    for x, y, R, s in [(6, g + 1, 8, 1), (252, g - 1, 7, 2), (40, g + 2, 5, 3)]: tree_round(sc, x, y, R, AUTUMN, s)
    for x, y, R, s in [(20, g + 41, 9, 4), (118, g + 36, 7, 5), (222, g + 42, 9, 6)]: tree_round(sc, x, y, R, AUTUMN, s)
    tree_round(sc, 66, g + 38, 8, seed=7)
    for x, y in [(156, g + 31), (176, g + 43), (270, g + 36)]: bush(sc, x, y)

    # The plaza in the middle, in front of the low sun: fountain, striped poles, bunting, flower beds.
    pole(sc, 302, g + 2); pole(sc, 337, g + 2); bunting(sc, 303, 337, g - 25, 5, g + 2.2)
    fountain(sc, 320, g + 2)
    flowerbed(sc, 292, g + 3, 12); flowerbed(sc, 348, g + 3, 12)

    # Chill side (right): carousel, big wheel, a tea stall, green trees and pines, a pond with a boat.
    carousel(sc, 388, g)
    wheel(sc, 482, g, 42)
    stall(sc, 552, g + 1, 't2', CUP, {'o': INK, 'T': K('t1'), 'W': K('c0')})
    for x, y, k, s in [(580, g, 1.0, 1), (606, g + 2, 1.1, 2), (630, g - 1, 0.9, 3), (430, g, 0.9, 4)]: tree_pine(sc, x, y, k, s)
    tree_round(sc, 354, g, 7, seed=8); tree_round(sc, 593, g + 3, 6, seed=9)
    for x, y, R, s in [(392, g + 41, 9, 10), (504, g + 38, 7, 11)]: tree_round(sc, x, y, R, seed=s)
    tree_pine(sc, 448, g + 43, 1.0, 12)
    for x, y in [(530, g + 27), (340, g + 38), (426, g + 30)]: bush(sc, x, y)
    boat(sc, 584, g + 37, 'o2'); bench(sc, 528, g + 3)

    for x in (88, 166, 236, 412, 448, 520, 618): lamp(sc, x, g + 3)
    r = random.Random(5); n = 0; used = []
    while len(used) < 46:
        x = r.randint(4, W - 5); y = r.randint(g + 7, g + 14)
        if any(abs(x - a) < 4 and abs(y - b) < 6 for a, b in used): continue
        if r.random() < 0.45 and not (290 < x < 350): continue
        used.append((x, y)); n += 1
        guest(sc, x, y, n, kid=r.random() < 0.15, balloon=r.choice(['o3', 't2', 'p1', 'b1']) if r.random() < 0.12 else None)
    for q in range(6): n += 1; guest(sc, 52 + q * 4, g + 2 + q % 2, n)
    sc.render()
    return sc.im


def scene_phone():
    W, H, HZ, GY = 195, 422, 390, 399
    sc = Scene(W, H, HZ)
    sky(sc, [(16, 'o3'), (84, 'o2'), (196, 'o1'), (H, 'o0')], sun=(98, 378, 27))
    stars(sc, [(4, 7), (30, 3), (64, 4), (100, 2), (134, 4), (168, 3), (190, 8), (5, 34), (190, 44), (4, 66), (191, 76)])
    far_hills(sc, 0, 80, HZ, 14, 's1', 1.0, slope=-10); far_hills(sc, 116, W, HZ, 14, 'l0', 2.2, slope=10)
    far_trees(sc, 0, 66, HZ - 2, 's2', 4, pines=0.15, size=5); far_trees(sc, 128, W, HZ - 2, 'l1', 7, pines=0.55, size=5)
    ground(sc, (403, 410), pond=(166, 419, 24, 6), small=True)

    # Thrill side (left): drop tower and the first hill of the coaster.
    tower(sc, 12, GY, 56, 0.62)
    cp = [(0, 7), (6, 7), (12, 10), (32, 46), (38, 52), (44, 46), (53, 14), (58, 8), (64, 7), (68, 7)]
    coaster(sc, 24, GY, cp, post=5, small=True, trains=((0.47, 'o4'),))
    tree_round(sc, 100, 400, 5, AUTUMN, 1)
    # Chill side (right): carousel and big wheel.
    carousel(sc, 124, GY, 0.58)
    wheel(sc, 169, GY, 23, small=True)
    tree_pine(sc, 146, 400, 0.5, 3)
    for x, y in [(10, 419), (112, 420)]: bush(sc, x, y)
    bush(sc, 62, 420)
    boat(sc, 170, 420, 'o2', small=True)
    for x in (28, 90, 108, 144): lamp(sc, x, 402, small=True)
    r = random.Random(8); n = 0; used = []
    while len(used) < 18:
        x = r.randint(3, W - 4); y = r.randint(405, 409)
        if any(abs(x - a) < 4 and abs(y - b) < 6 for a, b in used): continue
        used.append((x, y)); n += 1
        guest(sc, x, y, n, kid=r.random() < 0.3, balloon=r.choice(['o3', 't2', 'p1']) if r.random() < 0.12 else None)
    sc.render()
    return sc.im


# ------------------------------------------------------------------ the ticket
def ticket(w, h, perf, upright):
    """The paper of the ticket. perf: where the tear line runs (x when the ticket lies, y when it stands upright)."""
    SH = 2; ph = h - SH
    m = Image.new('L', (w, h), 0); d = ImageDraw.Draw(m)
    d.rectangle([0, 0, w - 1, ph - 1], fill=255)
    def bite(cx, cy, r): d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)
    for cx in (0, w - 1):
        for cy in (0, ph - 1): bite(cx, cy, 9)
    if upright:
        n = (w - 34) // 10
        for i in range(n):
            cx = (w - 1 - (n - 1) * 10) // 2 + i * 10
            bite(cx, 0, 3); bite(cx, ph - 1, 3)
        bite(0, perf, 5); bite(w - 1, perf, 5)
    else:
        n = (ph - 34) // 10
        for i in range(n):
            cy = (ph - 1 - (n - 1) * 10) // 2 + i * 10
            bite(0, cy, 3); bite(w - 1, cy, 3)
        bite(perf, 0, 5); bite(perf, ph - 1, 5)
    inner = ImageChops.multiply(m, ImageChops.multiply(ImageChops.multiply(shift(m, 1, 0), shift(m, -1, 0)), ImageChops.multiply(shift(m, 0, 1), shift(m, 0, -1))))
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    im.paste(INK + (255,), (0, 0), shift(m, 0, SH))            # the hard shadow of the interface
    im.paste(INK + (255,), (0, 0), m)                          # the ink outline
    im.paste(K('c0') + (255,), (0, 0), inner)
    # the stub in a second paper tone
    stubm = Image.new('L', (w, h), 0)
    ImageDraw.Draw(stubm).rectangle([0, perf, w, h] if upright else [perf, 0, w, h], fill=255)
    im.paste(K('s0') + (255,), (0, 0), ImageChops.multiply(inner, stubm))
    # paper edges: light on the upper left, shade on the lower right
    lit = ImageChops.subtract(inner, shift(inner, 1, 1)); dark = ImageChops.subtract(inner, shift(inner, -1, -1))
    im.paste(K('c1') + (255,), (0, 0), ImageChops.multiply(dark, ImageChops.invert(stubm)))
    im.paste(K('s1') + (255,), (0, 0), ImageChops.multiply(dark, stubm))
    im.paste(WHITE + (255,), (0, 0), lit)
    px = im.load()
    # the tear line
    if upright:
        for x in range(8, w - 8):
            if (x // 3) % 2 == 0: px[x, perf] = K('s3') + (255,)
    else:
        for y in range(8, ph - 8):
            if (y // 3) % 2 == 0: px[perf, y] = K('s3') + (255,)
    return im, inner


def striped_frame(im, inner, box, split, upright, T=6):
    """An airmail border around the main part: orange stripes on the Thrill half, teal stripes on the Chill half."""
    px = im.load(); x0, y0, x1, y1 = box
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            edge = min(x - x0, x1 - x, y - y0, y1 - y)
            if edge >= T or not inner.getpixel((x, y)): continue
            if upright:
                warm = y < split
                if abs(y - split) < 6 and min(x - x0, x1 - x) < T: continue       # the frame opens where the two halves meet
            else:
                warm = x < split
                if abs(x - split) < 6 and min(y - y0, y1 - y) < T: continue
            a, b = ('o1', 'o2') if warm else ('b1', 'b2')
            if edge in (0, T - 1): c = K(b)
            else:
                ph = (x + y) if warm else (x - y)
                c = K(a) if (ph // 4) % 2 == 0 else K('c0')
            px[x, y] = c + (255,)


def sunburst(im, box, centre, n=28):
    """A faint print behind the name: white rays on the cream paper, hard edges."""
    px = im.load(); x0, y0, x1, y1 = box; cx, cy = centre; cream = K('c0') + (255,)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if px[x, y] != cream: continue
            a = math.atan2((y - cy) * 1.0, x - cx)
            if int(math.floor((a + math.pi) / (2 * math.pi / n) + 0.5)) % 2 == 0: px[x, y] = WHITE + (255,)


BOLT = ['....ooooo', '...oYYYo.', '..oYYYo..', '.oYYYooo.', 'oYYYYYYo.', 'oooYYYo..', '..oYYo...', '.oYYo....', '.oYo.....', '.oo......']
FLAKE = ['.....W.....', '...W.W.W...', '....WWW....', '.W...W...W.', '..W..W..W..', 'WWWWWWWWWWW', '..W..W..W..', '.W...W...W.', '....WWW....', '...W.W.W...', '.....W.....']
FLAKE_M = ['....W....', '..W.W.W..', '...WWW...', '.W..W..W.', 'WWWWWWWWW', '.W..W..W.', '...WWW...', '..W.W.W..', '....W....']
FLAKE_S = ['...W...', '.W.W.W.', '..WWW..', 'WWWWWWW', '..WWW..', '.W.W.W.', '...W...']
BOLT_S = ['...oooo', '..oYYo.', '.oYYoo.', 'oYYYYo.', 'ooYYo..', '.oYo...', '.oo....']
STAR = ['..o..', '.oYo.', 'oYYYo', '.oYo.', '..o..']


def badge(im, cx, cy, kind, r=13):
    """A round badge: a bolt for the Thrill side, a snowflake for the Chill side."""
    L = Layer(im); d = L.d
    a, b, c = ('o1', 'o0', 'o2') if kind == 'thrill' else ('b1', 'b0', 'b2')
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=K(c)); d.ellipse([cx - r, cy - r, cx + r - 2, cy + r - 2], fill=K(a))
    d.arc([cx - r + 2, cy - r + 2, cx + r - 4, cy + r - 4], 185, 265, fill=K(b))
    L.flush()
    if kind == 'thrill': stamp(im, BOLT if r >= 11 else BOLT_S, cx, cy + (5 if r >= 11 else 3), {'o': INK, 'Y': K('c0')})
    else: stamp(im, FLAKE if r >= 13 else FLAKE_M if r >= 11 else FLAKE_S, cx, cy + (5 if r >= 13 else 4 if r >= 11 else 3), {'W': K('c0')})


def barcode(im, x, y, w, h, seed=3):
    r = random.Random(seed); d = ImageDraw.Draw(im); xx = x
    while xx < x + w:
        bw = r.choice([1, 1, 2, 3]); d.rectangle([xx, y, min(x + w, xx + bw) - 1, y + h - 1], fill=INK + (255,)); xx += bw + r.choice([1, 1, 2])


def dashes(im, x0, x1, y, key='c3'):
    px = im.load()
    for x in range(x0, x1 + 1):
        if (x // 3) % 2 == 0: px[x, y] = K(key) + (255,)


D_TICKET = dict(w=528, h=212, perf=372)
P_TICKET = dict(w=175, h=324, perf=186, split=83)


def ticket_desktop():
    w, h, perf = D_TICKET['w'], D_TICKET['h'], D_TICKET['perf']
    im, inner = ticket(w, h, perf, False)
    box = (8, 8, perf - 9, h - 11); mid = (box[0] + box[2]) // 2 + 1
    striped_frame(im, inner, box, mid, False)
    sunburst(im, (box[0] + 7, box[1] + 7, box[2] - 7, box[3] - 7), (mid, 72))
    for yy in (box[1] + 2, box[3] - 3): stamp(im, STAR, mid, yy + 3, {'o': INK, 'Y': K('o0')})
    badge(im, 46, 160, 'thrill'); badge(im, perf - 47, 160, 'chill')
    barcode(im, perf + 26, 185, 60, 11)
    for sx in (perf + 40, perf + 116): stamp(im, STAR, sx, 20, {'o': INK, 'Y': K('o0')})
    return im


def ticket_phone():
    w, h, perf, split = P_TICKET['w'], P_TICKET['h'], P_TICKET['perf'], P_TICKET['split']
    im, inner = ticket(w, h, perf, True)
    striped_frame(im, inner, (8, 8, w - 9, perf - 8), split, True)
    sunburst(im, (15, 15, w - 16, perf - 15), (w // 2, split))
    badge(im, 19, split, 'thrill', 11); badge(im, w - 20, split, 'chill', 11)
    dashes(im, 36, 68, split); dashes(im, w - 69, w - 37, split)
    return im


# ------------------------------------------------------------------ the lettering
def word(text, size):
    """Fredoka Bold as a hard 1-bit mask: drawn 8 times larger letter by letter, then reduced, so equal letters come out equal."""
    S = 8; f = ImageFont.truetype(FONT, size * S); f.set_variation_by_axes([700])
    asc, desc = f.getmetrics(); xs = []; x = 0
    for i in range(len(text)):
        xs.append(x); x += int(round((f.getlength(text[:i + 1]) - f.getlength(text[:i])) / S))
    wd, hh = x + 8, (asc + desc) // S + 8
    big = Image.new('L', (wd * S, hh * S), 0); d = ImageDraw.Draw(big)
    for ch, xx in zip(text, xs): d.text(((xx + 4) * S, 4 * S), ch, fill=255, font=f)
    small = big.resize((wd, hh), Image.BOX).point(lambda v: 255 if v >= 128 else 0)
    return small.crop(small.getbbox())


def letters(mask, face, light, dark, side, depth=2):
    """Printed block letters: a flat face, a lit upper left rim, a block shadow to the lower right, an ink outline."""
    w, h = mask.size; pad = 2
    m = Image.new('L', (w + pad * 2 + depth, h + pad * 2 + depth), 0); m.paste(mask, (pad, pad))
    ext = m
    for k in range(1, depth + 1): ext = ImageChops.lighter(ext, shift(m, k, k))
    im = Image.new('RGBA', m.size, (0, 0, 0, 0))
    im.paste(INK + (255,), (0, 0), grow(ext, diagonal=True))
    im.paste(K(side) + (255,), (0, 0), ext)
    im.paste(K(face) + (255,), (0, 0), m)
    im.paste(K(dark) + (255,), (0, 0), ImageChops.subtract(m, shift(m, -1, -1)))
    im.paste(K(light) + (255,), (0, 0), ImageChops.subtract(m, shift(m, 1, 1)))
    return im


def logo_parts(size, amp_size):
    t = letters(word('Thrills', size), 'o2', 'o0', 'o3', 'o5')
    a = letters(word('&', amp_size), 'i1', 'i0', 'i2', 'i2')
    c = letters(word('Chills', size), 'b1', 'b0', 'b2', 'b3')
    return t, a, c


def logo_desktop():
    t, a, c = logo_parts(48, 48); gap = 9
    w = t.size[0] + a.size[0] + c.size[0] + gap * 2; w += w % 2; h = max(t.size[1], a.size[1], c.size[1])
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); x = 0
    for part in (t, a, c):
        im.paste(part, (x, h - part.size[1]), part); x += part.size[0] + gap
    return im


def logo_phone():
    t, a, c = logo_parts(44, 30)
    w = max(t.size[0], c.size[0]) | 1; gap = 3
    h = t.size[1] + a.size[1] + c.size[1] + gap * 2
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); y = 0
    for part in (t, a, c):
        im.paste(part, ((w - part.size[0]) // 2, y), part); y += part.size[1] + gap
    print('logo-phone: the middle of "&" is at y = %d' % (t.size[1] + gap + a.size[1] // 2))
    return im


if __name__ == '__main__':
    out = {
        'scene-desktop.png': scene_desktop(), 'scene-phone.png': scene_phone(),
        'ticket-desktop.png': ticket_desktop(), 'ticket-phone.png': ticket_phone(),
        'logo-desktop.png': logo_desktop(), 'logo-phone.png': logo_phone(),
    }
    for name, im in out.items():
        im.save(os.path.join(HERE, name))
        print('%-20s %4d x %-4d %2d colours' % (name, im.size[0], im.size[1], count_colours(im)))
