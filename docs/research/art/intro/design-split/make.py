#!/usr/bin/env python3
"""Design B, "Two halves, one park". Mock-up only, not game code.

Writes, 1 file pixel = 1 art pixel (all shown at 2x):
  scene-desktop.png  640 x 400   a warm Thrill half (left) and a cool Chill half (right) that meet in a slanted seam
  scene-phone.png    195 x 422   the Thrill half on top, the Chill half below, the lake under the menu
  logo-d-*.png, logo-p-*.png     pixel lettering of "Thrills", "&", "Chills" for the desktop and for the phone
Each half is painted as its own side-view picture; the two are joined along the seam with a hard mask.
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'kit3'))
from PIL import Image, ImageDraw, ImageFont, ImageChops
from palette import col, fcol, INK, WHITE, count_colours, reduce_colours

FONT = '/home/user/RC-TYCOON-/src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2'


def C(key):
    """'o0' a tone of the orange theme, 'Fa0' a tone of the frost theme, 'W' pure white."""
    if key == 'W': return WHITE
    if key[0] == 'F': return fcol(key[1:])
    return col(key)


# ---------------------------------------------------------------- tools
class Layer:
    """A transparent sheet. flush() adds a 1-pixel ink outline around everything on it and pastes it into the picture."""
    def __init__(self, im, outline=True):
        self.target = im; self.im = Image.new('RGBA', im.size, (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im); self.outline = outline

    def flush(self):
        a = self.im.getchannel('A'); w, h = self.im.size
        if self.outline:
            dil = a
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): dil = ImageChops.lighter(dil, ImageChops.offset(a, dx, dy))
            edge = ImageChops.subtract(dil, a); ImageDraw.Draw(edge).rectangle([0, 0, w - 1, h - 1], outline=0)
            self.target.paste(INK, (0, 0), edge)
        self.target.paste(self.im, (0, 0), self.im)


def put(im, x, y, c):
    if 0 <= x < im.size[0] and 0 <= y < im.size[1]: im.putpixel((x, y), c if im.mode == 'RGB' else c + (255,))


def stamp(im, rows, x, y, cmap, anchor='bottom'):
    """Paints a text sprite. anchor 'bottom': (x, y) is the bottom centre; 'top': the top centre."""
    h, w = len(rows), max(len(r) for r in rows); x0 = x - w // 2; y0 = y - h + 1 if anchor == 'bottom' else y
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in '. ': continue
            put(im, x0 + i, y0 + j, cmap[ch])


def bands(im, rows, bottom):
    """Flat bands from rows = [(top y, colour key), ...] down to y = bottom; two checker rows join two bands."""
    px = im.load(); w = im.size[0]; prev = None
    for n, (top, key) in enumerate(rows):
        end = rows[n + 1][0] if n + 1 < len(rows) else bottom; c = C(key)
        for y in range(max(0, top), min(im.size[1], end)):
            for x in range(w):
                px[x, y] = prev if prev is not None and y - top < 2 and (x + y) % 2 == 0 else c
        prev = c


def recolour(im, box, table, shape='ellipse'):
    """A flat shadow: every pixel inside the ellipse (or box) changes its colour by the table."""
    x0, y0, x1, y1 = box; px = im.load(); cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, max(0.5, (x1 - x0) / 2), max(0.5, (y1 - y0) / 2)
    for y in range(max(0, y0), min(im.size[1], y1 + 1)):
        for x in range(max(0, x0), min(im.size[0], x1 + 1)):
            if shape == 'ellipse' and ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1: continue
            c = px[x, y]
            if c in table: px[x, y] = table[c]


def shade_table(pairs): return {C(a): C(b) for a, b in pairs}
WARM_SHADE = shade_table([('g0', 'g2'), ('g1', 'g2'), ('g2', 'g3'), ('s0', 's2'), ('s1', 's2'), ('s2', 's3')])
COOL_SHADE = shade_table([('Fl0', 'Fl2'), ('Fl1', 'Fl2'), ('Fl2', 'Fl3'), ('s0', 's2'), ('s1', 's2'), ('s2', 's3'), ('a0', 'a2'), ('a1', 'a2')])


def spline(cp, n=14):
    pts = []
    for i in range(len(cp) - 1):
        a, b, c, d = cp[max(i - 1, 0)], cp[i], cp[i + 1], cp[min(i + 2, len(cp) - 1)]
        for k in range(n):
            t = k / n
            pts.append(tuple(0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t ** 3) for j in range(2)))
    pts.append(tuple(cp[-1])); return pts


# ---------------------------------------------------------------- sprites
GUEST = ['.HH.', '.SS.', 'TTTT', '.TT.', '.PP.', '.PP.']          # 4 x 6 art pixels
KID = ['HH', 'SS', 'TT', 'PP']                                    # 2 x 4
LAMP = ['.ooo.', 'oYYYo', 'oYWYo', '.ooo.', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '.ooo.']
BENCH = ['.oooooooooo.', 'oWWWWWWWWWWo', 'oooooooooooo', 'owwwwwwwwwwo', '.oooooooooo.', '..o......o..', '..o......o..']
HORSE = ['.....oo..', '....oWWo.', '.oooWWWo.', 'oWWWWWo..', 'oWSSWWo..', 'oWWWWWo..', '.oWoWo...', '.oo.oo...']
GONDOLA = ['...o.o...', '..ooooo..', '.oRRRRRo.', 'oRRRRRRRo', 'oWWoWoWWo', 'oWWoWoWWo', 'oCCCCCCCo', 'oCCCCCCCo', '.ooooooo.']
GONDOLA_S = ['..o.o..', '.ooooo.', 'oRRRRRo', 'oWWoWWo', 'oCCCCCo', 'oCCCCCo', '.ooooo.']
BALLOON = ['.BB.', 'BWBB', 'BBBB', '.BB.', '..o.', '..o.', '..o.']
BIRD = ['W...W', '.W.W.', '..W..']


def guest(im, x, y, r, shirts, kid=False, balloon=None):
    cm = {'H': C(r.choice(['i2', 'w2', 'w1', 'o1', 'w2'])), 'S': C(r.choice(['k0', 'k0', 'k2'])), 'T': C(r.choice(shirts)), 'P': C(r.choice(['i1', 'b3', 'w2']))}
    stamp(im, KID if kid else GUEST, x, y, cm)
    if balloon: stamp(im, BALLOON, x + 3, y - 5, {'B': C(balloon), 'W': C('c0'), 'o': INK})


def crowd(im, r, n, x0, x1, y0, y1, shirts, keep=5, avoid=()):
    placed = []
    for _ in range(n * 30):
        if len(placed) >= n: break
        x, y = r.randint(x0, x1), r.randint(y0, y1)
        if any(abs(x - a) < keep and abs(y - b) < 4 for a, b in placed): continue
        if any(a0 <= x <= a1 for a0, a1 in avoid): continue
        placed.append((x, y))
    for x, y in sorted(placed, key=lambda p: p[1]):
        guest(im, x, y, r, shirts, kid=r.random() < 0.18, balloon=r.choice(['o3', 't1', 'o1', 'b1']) if r.random() < 0.12 else None)


# ---------------------------------------------------------------- far things
def cloud(im, x, y, w, body, shade):
    """A flat cloud with its bottom edge at y, left edge at x. No outline (a far thing)."""
    L = Layer(im, outline=False); d = L.d; h = max(6, w // 4)
    d.ellipse([x, y - h, x + w * 0.5, y + h * 0.6], fill=C(body)); d.ellipse([x + w * 0.22, y - h * 1.7, x + w * 0.72, y + h * 0.5], fill=C(body)); d.ellipse([x + w * 0.5, y - h * 1.1, x + w, y + h * 0.6], fill=C(body))
    d.rectangle([x - 2, y + 1, x + w + 2, y + h], fill=(0, 0, 0, 0))
    px = L.im.load()
    for yy in range(y - 2, y + 1):
        for xx in range(max(0, x), min(im.size[0], x + w + 1)):
            if 0 <= yy < im.size[1] and px[xx, yy][3] and (yy > y - 2 or (xx + yy) % 2 == 0): px[xx, yy] = C(shade) + (255,)
    L.flush()


def hill(im, cx, base, rx, ry, key, top=None):
    d = ImageDraw.Draw(im)
    d.chord([cx - rx, base - ry, cx + rx, base + ry], 180, 360, fill=C(key))
    if top: d.arc([cx - rx, base - ry, cx + rx, base + ry], 200, 300, fill=C(top))


def far_pines(im, cx, base, rx, ry, xs, key='t2'):
    """Small flat pines on the ridge of a far hill (no outline: far things are flat)."""
    d = ImageDraw.Draw(im)
    for n, x in enumerate(xs):
        if abs(x - cx) >= rx: continue
        y = int(base - ry * math.sqrt(1 - ((x - cx) / rx) ** 2)) + 2; h = 6 + (n * 3) % 4
        d.polygon([(x, y - h), (x - 3, y), (x + 3, y)], fill=C(key)); d.line([(x, y), (x, y + 1)], fill=C(key))


def sun(im, cx, cy, r):
    d = ImageDraw.Draw(im)
    d.ellipse([cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3], fill=C('o0'))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=C('c0'))


def birds(im, spots, key='c0'):
    for x, y in spots: stamp(im, BIRD, x, y, {'W': C(key)})


def loose_balloons(im, spots):
    for x, y, key in spots: stamp(im, BALLOON, x, y, {'B': C(key), 'W': C('c0'), 'o': INK})


def airballoon(im, cx, cy, stripes, basket=('w1', 'w2')):
    """A hot-air balloon, 31 x 50 art pixels: envelope centre (cx, cy)."""
    L = Layer(im); d = L.d; m = Image.new('L', im.size, 0); md = ImageDraw.Draw(m)
    md.ellipse([cx - 15, cy - 18, cx + 15, cy + 12], fill=255); md.polygon([(cx - 11, cy + 6), (cx + 11, cy + 6), (cx + 4, cy + 20), (cx - 4, cy + 20)], fill=255)
    for k in range(6):
        band = Image.new('L', im.size, 0); ImageDraw.Draw(band).rectangle([cx - 15 + k * 5, 0, cx - 11 + k * 5 + (1 if k == 5 else 0), im.size[1]], fill=255)
        L.im.paste(C(stripes[k]) + (255,), (0, 0), ImageChops.multiply(m, band))
    d.arc([cx - 13, cy - 16, cx + 13, cy + 10], 200, 250, fill=C('c0'))
    d.line([(cx - 4, cy + 21), (cx - 3, cy + 26)], fill=C('w2')); d.line([(cx + 4, cy + 21), (cx + 3, cy + 26)], fill=C('w2'))
    d.rectangle([cx - 3, cy + 26, cx + 3, cy + 30], fill=C(basket[1])); d.line([(cx - 3, cy + 26), (cx + 3, cy + 26)], fill=C(basket[0]))
    L.flush()


# ---------------------------------------------------------------- plants and small things
def tree_round(im, bx, by, seed, ramp=('Fl0', 'Fl1', 'Fl2', 'Fl3'), R=None):
    r = random.Random(seed); R = R or r.randint(7, 9)
    L = Layer(im); d = L.d
    d.rectangle([bx - 1, by - 9, bx + 1, by], fill=C('w1')); d.line([bx + 1, by - 9, bx + 1, by], fill=C('w2'))
    cy = by - 8 - R + 2; blobs = [(-R + 3, 3, R - 2), (R - 3, 2, R - 2), (0, -3, R)]
    for dx, dy, rr in blobs: d.ellipse([bx + dx - rr, cy + dy - rr, bx + dx + rr, cy + dy + rr], fill=C(ramp[3]))
    for dx, dy, rr in blobs: d.ellipse([bx + dx - rr, cy + dy - rr, bx + dx + rr - 2, cy + dy + rr - 3], fill=C(ramp[2]))
    for dx, dy, rr in blobs: d.ellipse([bx + dx - rr + 1, cy + dy - rr + 1, bx + dx + rr - 6, cy + dy + rr - 7], fill=C(ramp[1]))
    for k in range(7):
        dx, dy, rr = blobs[k % 3]; px_, py_ = bx + dx - rr + 3 + r.randint(0, rr - 2), cy + dy - rr + 2 + r.randint(0, rr - 4)
        d.point([(px_, py_), (px_ + 1, py_)], fill=C(ramp[0]))
    L.flush()


AUTUMN = ('o0', 'o1', 'o2', 'o4')


PINE = ('Fl1', 'Fl2', 'Fl3', 'Fl4')                    # the Chill half uses the cold leaf ramp of the frost theme


def tree_pine(im, bx, by, seed, big=0, ramp=PINE):
    r = random.Random(seed); s = r.choice([0, 0, 1]) + big
    L = Layer(im); d = L.d
    d.rectangle([bx - 1, by - 4, bx + 1, by], fill=C('w2'))
    for hw, yo, hh in [(9 + s, 3, 12 + big), (7 + s, 10 + big, 11 + big), (5 + big // 2, 17 + 2 * big, 10 + s)]:
        top = (bx, by - yo - hh)
        d.polygon([top, (bx - hw, by - yo), (bx, by - yo)], fill=C(ramp[1])); d.polygon([top, (bx, by - yo), (bx + hw, by - yo)], fill=C(ramp[3]))
        d.line([top, (bx - hw, by - yo)], fill=C(ramp[0])); d.line([(bx - hw + 1, by - yo), (bx - 1, by - yo)], fill=C(ramp[2]))
    L.flush()


def bush(im, bx, by, ramp=('Fl0', 'Fl2', 'Fl3')):
    L = Layer(im)
    L.d.ellipse([bx - 5, by - 6, bx + 5, by], fill=C(ramp[2])); L.d.ellipse([bx - 5, by - 6, bx + 3, by - 2], fill=C(ramp[1])); L.d.point([(bx - 3, by - 5), (bx - 2, by - 5), (bx, by - 4)], fill=C(ramp[0]))
    L.flush()


def lamp(im, x, y): stamp(im, LAMP, x, y, {'o': INK, 'Y': C('o0'), 'W': C('c0')})
def bench(im, x, y): stamp(im, BENCH, x, y, {'o': INK, 'W': C('w0'), 'w': C('w1')})


def flowerbed(im, x, y, w, seed, blooms=('c0', 'o0', 'o1')):
    L = Layer(im); L.d.rectangle([x, y - 2, x + w, y], fill=C('w2')); L.d.line([(x, y - 2), (x + w, y - 2)], fill=C('Fl2')); L.flush()
    r = random.Random(seed)
    for xx in range(x + 1, x + w, 3):
        put(im, xx, y - 3, C(r.choice(blooms))); put(im, xx, y - 2, C('Fl2'))


def stall(im, x, y, awn, dark):
    L = Layer(im); d = L.d
    d.rectangle([x - 12, y - 14, x + 12, y], fill=C('c0')); d.rectangle([x + 7, y - 14, x + 12, y], fill=C('c2'))
    d.rectangle([x - 9, y - 12, x + 4, y - 6], fill=C('i1'))
    d.rectangle([x - 4, y - 11, x - 3, y - 10], fill=C('k0')); d.rectangle([x - 5, y - 9, x - 2, y - 7], fill=C(awn))
    d.line([(x - 10, y - 5), (x + 5, y - 5)], fill=C('w0')); d.line([(x - 10, y - 4), (x + 5, y - 4)], fill=C('w1'))
    for i in range(8):
        x0 = x - 16 + i * 4; c = (awn if i < 6 else dark) if i % 2 == 0 else ('c0' if i < 6 else 'c2')
        d.rectangle([x0, y - 21, x0 + 3, y - 15 + (1 if i % 2 == 0 else 0)], fill=C(c))
    d.line([(x - 16, y - 21), (x + 15, y - 21)], fill=C('c0'))
    L.flush()


def fountain(im, x, y):
    L = Layer(im); d = L.d
    d.rectangle([x - 13, y - 5, x + 13, y], fill=C('c1')); d.rectangle([x + 5, y - 5, x + 13, y], fill=C('c3')); d.line([(x - 13, y - 5), (x + 13, y - 5)], fill=C('c0'))
    d.line([(x - 11, y - 6), (x + 11, y - 6)], fill=C('a1'))
    d.rectangle([x - 1, y - 15, x + 1, y - 7], fill=C('c1')); d.line([(x + 1, y - 15), (x + 1, y - 7)], fill=C('c3')); d.rectangle([x - 5, y - 17, x + 5, y - 15], fill=C('c0'))
    L.flush()
    for dx, dy in [(0, -22), (0, -20), (-1, -19), (1, -19), (-3, -18), (3, -18), (-5, -16), (5, -16), (-7, -13), (7, -13), (-8, -10), (8, -10), (-9, -7), (9, -7)]:
        put(im, x + dx, y + dy, C('c0') if (dx + dy) % 2 == 0 else C('a0'))


def boat(im, x, y, hull=('w0', 'w1'), sail=None):
    L = Layer(im); d = L.d
    d.polygon([(x - 7, y - 3), (x + 7, y - 3), (x + 5, y), (x - 5, y)], fill=C(hull[1])); d.line([(x - 7, y - 3), (x + 7, y - 3)], fill=C(hull[0]))
    if sail:
        d.line([(x, y - 16), (x, y - 4)], fill=C('w2')); d.polygon([(x + 1, y - 15), (x + 7, y - 5), (x + 1, y - 5)], fill=C(sail[0])); d.polygon([(x - 1, y - 13), (x - 5, y - 5), (x - 1, y - 5)], fill=C(sail[1]))
    else:
        d.rectangle([x - 1, y - 7, x, y - 6], fill=C('k0')); d.rectangle([x - 2, y - 5, x + 1, y - 4], fill=C('o1')); d.point([(x - 1, y - 8), (x, y - 8)], fill=C('w2'))
    L.flush()
    for dx in range(-8, 9, 2): put(im, x + dx, y + 2, C('a0'))


def jetty(im, x, y, ln):
    """A low wooden landing stage over the water, from x to x + ln at height y."""
    L = Layer(im); d = L.d
    for px_ in range(x + 3, x + ln, 9): d.rectangle([px_, y + 2, px_ + 1, y + 6], fill=C('w2'))
    d.rectangle([x, y, x + ln, y + 2], fill=C('w1')); d.line([(x, y), (x + ln, y)], fill=C('w0'))
    L.flush()


def reeds(im, x, y, n=3):
    for k in range(n):
        h = 6 + (k * 5) % 4; xx = x + k * 3
        for yy in range(y - h, y + 1): put(im, xx, yy, C('Fl2'))
        put(im, xx, y - h - 1, C('w1')); put(im, xx, y - h - 2, C('w1'))


def signpost(im, x, y):
    """Two arrow boards on one post: warm to the left, cool to the right. It stands on the seam."""
    L = Layer(im); d = L.d
    d.rectangle([x - 1, y - 30, x + 1, y], fill=C('w1')); d.line([(x + 1, y - 30), (x + 1, y)], fill=C('w2')); d.rectangle([x - 2, y - 33, x + 2, y - 31], fill=C('o0'))
    d.polygon([(x - 19, y - 24), (x - 14, y - 29), (x + 3, y - 29), (x + 3, y - 20), (x - 14, y - 20)], fill=C('o2')); d.line([(x - 13, y - 29), (x + 3, y - 29)], fill=C('o0')); d.line([(x - 13, y - 20), (x + 3, y - 20)], fill=C('o4'))
    d.polygon([(x + 19, y - 12), (x + 14, y - 17), (x - 3, y - 17), (x - 3, y - 8), (x + 14, y - 8)], fill=C('t2')); d.line([(x - 3, y - 17), (x + 13, y - 17)], fill=C('t0')); d.line([(x - 3, y - 8), (x + 13, y - 8)], fill=C('t3'))
    L.flush()
    for dx in (-10, -6, -2): put(im, x + dx, y - 24, C('c0')); put(im, x + dx, y - 25, C('c0'))
    for dx in (2, 6, 10): put(im, x + dx, y - 12, C('c0')); put(im, x + dx, y - 13, C('c0'))


# ---------------------------------------------------------------- the rides
CAR = ['.LLLLLLLLLLLL.', 'BBBBBBBBBBBBBB', 'BWWWBBBBBBWWWB', 'BBBBBBBBBBBBBB', 'DDDDDDDDDDDDDD', '.DDDDDDDDDDDD.']


def car_sprite(body):
    cm = {'L': C(body[0]), 'B': C(body[1]), 'D': C(body[2]), 'W': C('c0')}
    spr = Image.new('RGBA', (len(CAR[0]), len(CAR)), (0, 0, 0, 0))
    stamp(spr, CAR, len(CAR[0]) // 2, len(CAR) - 1, cm)
    return spr


def rotated(spr, deg, k=5):
    """Turns a small sprite by any angle and keeps hard pixels: turn it at k times the size, then take the main colour of each block."""
    big = spr.resize((spr.size[0] * k, spr.size[1] * k), Image.NEAREST).rotate(deg, resample=Image.NEAREST, expand=True)
    w, h = -(-big.size[0] // k), -(-big.size[1] // k)
    canvas = Image.new('RGBA', (w * k, h * k), (0, 0, 0, 0)); canvas.paste(big, ((w * k - big.size[0]) // 2, (h * k - big.size[1]) // 2))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); cp, op = canvas.load(), out.load()
    for y in range(h):
        for x in range(w):
            count = {}
            for yy in range(k):
                for xx in range(k):
                    c = cp[x * k + xx, y * k + yy]; c = c if c[3] else (0, 0, 0, 0); count[c] = count.get(c, 0) + 1
            best = max(count, key=count.get)
            if best[3] == 0 and count[best] < k * k * 0.62:          # keep thin parts (arms, heads)
                best = max((c for c in count if c[3]), key=count.get)
            op[x, y] = best
    return out


def ring(L, cx, cy, R, th, shade):
    px = L.im.load(); w, h = L.im.size
    for y in range(int(cy - R - 2), int(cy + R + 3)):
        for x in range(int(cx - R - 2), int(cx + R + 3)):
            if not (0 <= x < w and 0 <= y < h): continue
            dx, dy = x - cx, y - cy; r = math.hypot(dx, dy)
            if R - th + 0.5 < r <= R + 0.5:
                px[x, y] = C(shade((-dx - dy) / (r * 1.4142) if r else 0, min(th - 1, int(R + 0.5 - r)), th)) + (255,)


def wheel(im, cx, cy, R, base_y, cars, spokes, small=False):
    """The big wheel, seen from the front: a true circle of radius R around (cx, cy)."""
    spread = int(R * 0.52); top = base_y - (5 if small else 7)
    L = Layer(im); d = L.d                                                   # the far legs
    for s in (-1, 1): d.line([(cx, cy), (cx + s * (spread - (4 if small else 7)), top)], fill=C('c3'), width=2 if small else 3)
    L.flush()
    L = Layer(im, outline=False); d = L.d                                    # spokes and the inner rings: thin, no outline
    for k in range(spokes):
        t = 2 * math.pi * k / spokes + 0.13
        d.line([(cx, cy), (cx + (R - 2) * math.cos(t), cy + (R - 2) * math.sin(t))], fill=C('b2'))
    ring(L, cx, cy, round(R * 0.66), 1, lambda li, band, th: 'b1'); ring(L, cx, cy, round(R * 0.3), 1, lambda li, band, th: 'b1')
    L.flush()
    def tube(li, band, th):
        if band == 0: return 'b0' if li > 0.2 else 'b2' if li < -0.3 else 'b1'
        if band == th - 1: return 'b0' if li < -0.3 else 'b2' if li > 0.2 else 'b1'
        return 'b1'
    L = Layer(im); ring(L, cx, cy, R, 2 if small else 3, tube); L.flush()    # the rim
    for k in range(spokes):                                                  # bulbs
        t = 2 * math.pi * k / spokes + 0.13
        put(im, round(cx + (R - (0.5 if small else 1)) * math.cos(t)), round(cy + (R - (0.5 if small else 1)) * math.sin(t)), C('c0'))
    cols = [('t1', 't2'), ('b1', 'b2'), ('c0', 'o1'), ('t0', 't3'), ('b0', 'b2')]
    for k in range(cars):                                                    # gondolas hang under the rim
        t = 2 * math.pi * k / cars + 0.26; gx, gy = round(cx + (R - 1) * math.cos(t)), round(cy + (R - 1) * math.sin(t))
        body, roof = cols[k % len(cols)]
        stamp(im, GONDOLA_S if small else GONDOLA, gx, gy - 1, {'o': INK, 'R': C(roof), 'W': C('c0'), 'C': C(body)}, anchor='top')
    L = Layer(im); d = L.d                                                   # the base, the near legs, the hub
    d.rectangle([cx - spread - 9, top, cx + spread + 9, base_y], fill=C('c1')); d.rectangle([cx + spread - 6, top, cx + spread + 9, base_y], fill=C('c3')); d.line([(cx - spread - 9, top), (cx + spread + 9, top)], fill=C('c0'))
    for s in (-1, 1):
        d.line([(cx, cy), (cx + s * spread, top)], fill=C('c0'), width=2 if small else 3)
        d.line([(cx + 1, cy), (cx + s * spread + 1, top)], fill=C('c2'))
    bx = cx + spread + (2 if small else 0)                                  # a ticket booth at the right end of the base
    d.rectangle([bx, top - (8 if small else 11), bx + (7 if small else 9), top - 1], fill=C('c0')); d.rectangle([bx + (5 if small else 6), top - (8 if small else 11), bx + (7 if small else 9), top - 1], fill=C('c2'))
    d.rectangle([bx + 1, top - (6 if small else 8), bx + (3 if small else 4), top - (4 if small else 5)], fill=C('i1'))
    d.rectangle([bx - 2, top - (11 if small else 15), bx + (9 if small else 11), top - (9 if small else 12)], fill=C('t2')); d.line([(bx - 2, top - (11 if small else 15)), (bx + (9 if small else 11), top - (11 if small else 15))], fill=C('t0'))
    d.line([(cx - spread - 9, top + 2), (cx + spread - 7, top + 2)], fill=C('t1'))
    hr = 3 if small else 5
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=C('o1')); d.ellipse([cx - hr, cy - hr, cx + hr - 2, cy + hr - 2], fill=C('o0')); d.point([(cx - 1, cy - 1)], fill=C('c0'))
    L.flush()


def coaster(im, cp, ground, trains=(), x_range=None, body=('t1', 't2', 't3')):
    """A wooden coaster seen from the side: cream lattice, orange track, a train of cars."""
    pts = spline(cp); w = im.size[0]
    def y_at(x):
        best = None
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 != x1 and min(x0, x1) <= x <= max(x0, x1):
                y = y0 + (y1 - y0) * (x - x0) / (x1 - x0)
                if best is None or y < best: best = y
        return best
    xa, xb = x_range or (int(min(p[0] for p in pts)), int(max(p[0] for p in pts)))
    posts = []
    for x in range(xa - xa % 9, xb + 1, 9):
        y = y_at(x)
        if y is not None and y < ground - 8 and -4 <= x < w + 4: posts.append((x, int(y) + 3))
    L = Layer(im, outline=False); d = L.d
    for (x0, y0), (x1, y1) in zip(posts, posts[1:]):
        if x1 - x0 > 9: continue
        lvl = ground - 8; k = (x0 // 9) % 2
        while lvl > max(y0, y1) + 3:
            d.line([(x0, lvl), (x1, lvl)], fill=C('c2'))
            if lvl - 11 > min(y0, y1): d.line([(x0, lvl), (x1, lvl - 11)] if k % 2 == 0 else [(x0, lvl - 11), (x1, lvl)], fill=C('c3'))
            lvl -= 11; k += 1
    for x, y in posts: d.line([(x, y), (x, ground)], fill=C('c0')); d.line([(x + 1, y), (x + 1, ground)], fill=C('c3'))
    L.flush()
    def normal(i, up=False):
        a, b = pts[max(0, i - 2)], pts[min(len(pts) - 1, i + 2)]; dx, dy = b[0] - a[0], b[1] - a[1]; ln = math.hypot(dx, dy) or 1
        nx, ny = dy / ln, -dx / ln
        if (ny > 0) if up else (nx + ny > 0): nx, ny = -nx, -ny
        return nx, ny, dx / ln, dy / ln
    L = Layer(im); d = L.d
    mid = [(round(x), round(y)) for x, y in pts]
    d.line(mid, fill=C('o3'), width=3)
    d.line([(round(x - normal(i)[0]), round(y - normal(i)[1])) for i, (x, y) in enumerate(pts)], fill=C('o4'))
    d.line([(round(x + normal(i)[0]), round(y + normal(i)[1])) for i, (x, y) in enumerate(pts)], fill=C('o1'))
    L.flush()
    dist = [0.0]
    for a, b in zip(pts, pts[1:]): dist.append(dist[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    step = 0
    for i in range(len(pts)):
        if dist[i] >= step: put(im, mid[i][0], mid[i][1], C('o5')); step += 4
    def at(s):
        i = min(range(len(dist)), key=lambda k: abs(dist[k] - s)); return i
    for lead, n in trains:                                                 # lead: index into the spline of the first car
        L = Layer(im); d = L.d
        for c in range(n):
            i = at(dist[lead] - c * 15); x, y = pts[i]; nx, ny, tx, ty = normal(i, up=True)
            spr = rotated(car_sprite(body), math.degrees(math.atan2(-ty, tx)))
            cx, cy = x + nx * 5.5, y + ny * 5.5
            if cx - spr.size[0] / 2 < 0 or cx + spr.size[0] / 2 >= w or cy - spr.size[1] / 2 < 0: continue
            L.im.alpha_composite(spr, (int(round(cx - spr.size[0] / 2)), int(round(cy - spr.size[1] / 2))))
            for k, a in enumerate((-3.5, 3.5)):                             # two riders: a head and hair
                hx, hy = int(round(cx + tx * a + nx * 4.6)), int(round(cy + ty * a + ny * 4.6)); skin = C(['k0', 'k2', 'k0'][(c + k) % 3])
                d.rectangle([hx - 1, hy - 1, hx, hy], fill=skin)
                if abs(ny) >= abs(nx): d.point([(hx - 1, hy - 2), (hx, hy - 2)], fill=C(['w2', 'i2', 'o1'][(c * 2 + k) % 3]))
                else: d.point([(hx + (1 if nx > 0 else -2), hy - 1), (hx + (1 if nx > 0 else -2), hy)], fill=C(['w2', 'i2', 'o1'][(c * 2 + k) % 3]))
        L.flush()


def tower(im, x, base_y, top_y, ring_y, shirts=('t1', 'b1', 'c0', 'o0')):
    """The drop tower from the side: a striped shaft, a ring of seats on its way down."""
    L = Layer(im); d = L.d
    d.rectangle([x - 21, base_y - 8, x + 21, base_y], fill=C('c1')); d.rectangle([x + 9, base_y - 8, x + 21, base_y], fill=C('c3')); d.line([(x - 21, base_y - 8), (x + 21, base_y - 8)], fill=C('c0'))
    d.rectangle([x - 13, base_y - 14, x + 13, base_y - 9], fill=C('c1')); d.rectangle([x + 6, base_y - 14, x + 13, base_y - 9], fill=C('c3')); d.line([(x - 13, base_y - 14), (x + 13, base_y - 14)], fill=C('c0'))
    d.rectangle([x - 7, top_y + 9, x + 7, base_y - 15], fill=C('c0')); d.rectangle([x + 2, top_y + 9, x + 7, base_y - 15], fill=C('c2'))
    y = base_y - 22
    while y > top_y + 20:
        d.polygon([(x - 7, y), (x + 1, y - 5), (x + 1, y - 8), (x - 7, y - 3)], fill=C('o2')); d.polygon([(x + 2, y - 5), (x + 7, y - 8), (x + 7, y - 11), (x + 2, y - 8)], fill=C('o4'))
        y -= 16
    d.rectangle([x - 11, top_y, x + 11, top_y + 9], fill=C('o2')); d.rectangle([x + 4, top_y, x + 11, top_y + 9], fill=C('o4')); d.line([(x - 11, top_y), (x + 11, top_y)], fill=C('o0')); d.line([(x - 11, top_y + 9), (x + 11, top_y + 9)], fill=C('o4'))
    d.line([(x, top_y - 12), (x, top_y - 1)], fill=C('w2')); d.polygon([(x + 1, top_y - 12), (x + 10, top_y - 9), (x + 1, top_y - 6)], fill=C('o3'))
    L.flush()
    L = Layer(im); d = L.d; rw = 25; by = ring_y                          # the ring of seats with seven tiny riders
    d.rectangle([x - rw + 2, by, x + rw - 2, by + 9], fill=C('o2')); d.rectangle([x - rw, by + 2, x + rw, by + 7], fill=C('o2'))
    d.rectangle([x + 11, by, x + rw - 2, by + 9], fill=C('o3')); d.rectangle([x + 11, by + 2, x + rw, by + 7], fill=C('o3'))
    d.line([(x - rw + 2, by + 9), (x + rw - 2, by + 9)], fill=C('o4')); d.line([(x - rw + 1, by + 3), (x + 10, by + 3)], fill=C('o1')); d.line([(x + 11, by + 3), (x + rw - 1, by + 3)], fill=C('o2'))
    for k in range(-3, 4):                                                 # each rider: hair, face, shirt above the ring, legs under it
        hx = x + k * 7; n = k + 3
        d.point([(hx - 1, by - 4), (hx, by - 4)], fill=C(['w2', 'i2', 'o1', 'w1'][n % 4])); d.point([(hx - 1, by - 3), (hx, by - 3)], fill=C(['k0', 'k2', 'k0'][n % 3]))
        d.rectangle([hx - 2, by - 2, hx + 1, by + 1], fill=C(shirts[n % len(shirts)]))
        d.line([(hx - 2, by + 10), (hx - 2, by + 11)], fill=C('i1')); d.line([(hx + 1, by + 10), (hx + 1, by + 11)], fill=C('i1'))
    L.flush()
    for dx, ln in ((-rw + 3, 9), (-rw + 11, 14), (rw - 11, 12), (rw - 3, 8)):      # the ring falls: short streaks above it
        for yy in range(by - 9 - ln, by - 9): put(im, x + dx, yy, C('c0'))


def carousel(im, x, base_y, lit=('t1', 'c0'), dark=('t3', 'c2'), trim='t2'):
    L = Layer(im); d = L.d; roof = base_y - 37
    d.rectangle([x - 31, base_y - 5, x + 31, base_y], fill=C('c1')); d.rectangle([x + 13, base_y - 5, x + 31, base_y], fill=C('c3')); d.line([(x - 31, base_y - 5), (x + 31, base_y - 5)], fill=C('c0'))
    d.rectangle([x - 28, base_y - 8, x + 28, base_y - 6], fill=C(lit[0])); d.rectangle([x + 12, base_y - 8, x + 28, base_y - 6], fill=C(dark[0]))
    d.rectangle([x - 5, roof + 4, x + 5, base_y - 9], fill=C('c0')); d.rectangle([x + 2, roof + 4, x + 5, base_y - 9], fill=C('c2'))
    for yy in (roof + 11, roof + 19): d.line([(x - 5, yy), (x + 5, yy)], fill=C('o2'))
    for k, dx in enumerate((-24, -13, 13, 24)):
        d.line([(x + dx, roof + 4), (x + dx, base_y - 9)], fill=C('o0'))
        stamp(L.im, HORSE, x + dx + 1, base_y - 11 - (k % 2) * 5, {'o': INK, 'W': C('c0') if k % 2 else C('o0'), 'S': C(['o3', 'b1', 't2', 'o1'][k])})
    apex = (x, roof - 19); n = 12; half = 34
    xs = [x + half * math.sin(-math.pi / 2 + math.pi * i / n) for i in range(n + 1)]
    for i in range(n):
        is_lit = i < n * 0.6; c = (lit if is_lit else dark)[i % 2]
        d.polygon([apex, (xs[i], roof), (xs[i + 1], roof)], fill=C(c))
    for i in range(17):
        x0 = x - 34 + i * 4; c = (trim if i < 11 else dark[0]) if i % 2 == 0 else ('c0' if i < 11 else 'c2')
        d.rectangle([x0, roof + 1, x0 + 3, roof + 4 + (1 if i % 2 == 0 else 0)], fill=C(c))
    d.rectangle([x - 1, roof - 22, x + 1, roof - 20], fill=C('o0')); d.line([(x, roof - 29), (x, roof - 23)], fill=C('w2')); d.polygon([(x + 1, roof - 29), (x + 6, roof - 27), (x + 1, roof - 25)], fill=C('o3'))
    L.flush()
    for i in range(-5, 6): put(im, x + i * 6, roof, C('o0'))


# ---------------------------------------------------------------- ground
def tufts(im, r, box, key, n, keep=9, avoid=None):
    x0, y0, x1, y1 = box; placed = []; px = im.load()
    for _ in range(n * 20):
        if len(placed) >= n: break
        x, y = r.randint(x0 + 2, x1 - 3), r.randint(y0 + 3, y1 - 1)
        if any(abs(x - a) + abs(y - b) < keep for a, b in placed): continue
        if avoid and px[x, y] not in avoid: continue
        placed.append((x, y))
    for x, y in placed:
        for dx, dy in ((-1, -1), (0, -2), (1, -1)): put(im, x + dx, y + dy, C(key))


def path(im, y0, y1, x0=0, x1=None, seed=3):
    """A paved path across the picture, as in the drafts: light and mid pavers, darker joints and edges."""
    x1 = im.size[0] if x1 is None else x1; d = ImageDraw.Draw(im); r = random.Random(seed)
    d.rectangle([x0, y0, x1 - 1, y1], fill=C('s1'))
    rows = max(1, (y1 - y0 - 1) // 6); rh = (y1 - y0 - 1) / rows
    for j in range(rows):
        ya, yb = int(y0 + 1 + j * rh), int(y0 + 1 + (j + 1) * rh) - 1
        for x in range(x0 - (j % 2) * 6, x1, 12):
            if r.random() < 0.3: d.rectangle([max(x0, x + 1), ya, min(x1 - 1, x + 11), yb - 1], fill=C('s0'))
            if x >= x0: d.line([(x, ya), (x, yb)], fill=C('s2'))
        if j: d.line([(x0, ya - 1), (x1 - 1, ya - 1)], fill=C('s2'))
    d.line([(x0, y0), (x1 - 1, y0)], fill=C('s3')); d.line([(x0, y1), (x1 - 1, y1)], fill=C('s3'))


def water(im, mask, r, calm=1.0, bank='Fl3'):
    """A lake where the mask is set: a dark shore line under the bank, flat water, a few short ripples."""
    px = im.load(); mp = mask.load(); w, h = im.size
    inside = lambda x, y: 0 <= x < w and 0 <= y < h and mp[x, y]
    for y in range(h):
        for x in range(w):
            if not mp[x, y]:
                if inside(x, y + 1) or inside(x + 1, y) or inside(x - 1, y): px[x, y] = C(bank)
                continue
            if not inside(x, y - 1) and y > 0: c = 'a3'
            elif not inside(x, y - 2) and y > 1: c = 'a2'
            elif not inside(x, y - 3) and y > 2 and (x + y) % 2 == 0: c = 'a2'
            else: c = 'a1'
            px[x, y] = C(c)
    box = mask.getbbox(); want = int((box[2] - box[0]) * (box[3] - box[1]) / 120 * calm); placed = []
    for _ in range(want * 12):
        if len(placed) >= want: break
        x, y = r.randint(box[0] + 2, box[2] - 10), r.randint(box[1] + 6, box[3] - 2); ln = 4 + len(placed) * 7 % 5
        if not all(inside(a, b) for a, b in ((x - 4, y), (x + ln + 4, y), (x, y - 5), (x + ln, y - 5))): continue
        if any(abs(x - a) < 14 and abs(y - b) < 4 for a, b, _ in placed): continue
        placed.append((x, y, ln))
    d = ImageDraw.Draw(im)
    for n, (x, y, ln) in enumerate(placed): d.line([(x, y), (x + ln, y)], fill=C('a0') if n % 3 else C('a2'))


def lily(im, x, y, flower=False):
    d = ImageDraw.Draw(im); d.rectangle([x, y, x + 3, y + 1], fill=C('Fl1')); d.point([(x + 1, y), (x + 3, y + 1)], fill=C('Fl2'))
    if flower: d.point([(x + 2, y - 1)], fill=C('c0'))


# ---------------------------------------------------------------- the lettering
def grow(a, n=1, diag=False):
    for _ in range(n):
        out = a
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if diag else []): out = ImageChops.lighter(out, ImageChops.offset(a, dx, dy))
        a = out
    return a


def glyph_mask(text, size):
    f = ImageFont.truetype(FONT, size); f.set_variation_by_axes([700])
    x0, y0, x1, y1 = f.getbbox(text)
    m = Image.new('L', (x1 - x0 + 4, y1 - y0 + 4), 0)
    d = ImageDraw.Draw(m); d.fontmode = '1'
    d.text((2 - x0, 2 - y0), text, fill=255, font=f)
    return m.crop(m.getbbox())


def word(text, size, tones, name):
    """Pixel lettering: banded fill, 2 px ink, 2 px cream, 1 px ink, hard shadow 3 px down."""
    hi, light, base, dark = [C(t) for t in tones]
    m = glyph_mask(text, size); w, h = m.size; PAD = 7
    W, H = w + PAD * 2, h + PAD * 2 + 3
    a = Image.new('L', (W, H), 0); a.paste(m, (PAD, PAD))
    ink1 = grow(grow(a, 1, True), 1)
    cream = grow(grow(ink1, 1, True), 1)
    ink2 = grow(cream, 1)
    sh = ink2
    for k in (1, 2, 3): sh = ImageChops.lighter(sh, ImageChops.offset(ink2, 0, k))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(INK + (255,), (0, 0), sh)
    out.paste(C('c0') + (255,), (0, 0), cream)
    out.paste(INK + (255,), (0, 0), ink1)
    px = out.load(); ap = a.load(); split = PAD + int(h * 0.48)
    ip = ink1.load(); cp = cream.load(); seen = set()                       # no lonely specks: a cream island of a few pixels inside a letter becomes ink
    for y0 in range(H):
        for x0 in range(W):
            if (x0, y0) in seen or not cp[x0, y0] or ip[x0, y0]: continue
            todo = [(x0, y0)]; part = []; seen.add((x0, y0))
            while todo:
                x, y = todo.pop(); part.append((x, y))
                for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= q[0] < W and 0 <= q[1] < H and q not in seen and cp[q] and not ip[q]: seen.add(q); todo.append(q)
            if len(part) < 14:
                for q in part: px[q] = INK + (255,)
    for y in range(H):
        for x in range(W):
            if not ap[x, y]: continue
            c = light if y < split or (y < split + 2 and (x + y) % 2 == 0) else base
            if not ap[x, y - 1] or not ap[x - 1, y]: c = hi
            if not ap[x, y + 1] or not ap[x, y + 2] or not ap[x + 1, y]: c = dark
            px[x, y] = c + (255,)
    out.save(os.path.join(HERE, name)); print(name, '%d x %d' % out.size, count_colours(out), 'colours')


# ---------------------------------------------------------------- desktop: 640 x 400, the seam runs from the top to the bottom
def desktop():
    W, H = 640, 400; HOR = 312; PY0, PY1 = 338, 352
    seam = lambda y: 332 - y // 4                        # one pixel to the left every four rows: even steps
    warm = Image.new('RGB', (W, H)); cool = Image.new('RGB', (W, H)); r = random.Random(11)

    # ---- the Thrill half
    bands(warm, [(0, 'o1'), (36, 'o0'), (268, 's0')], HOR)
    sun(warm, 14, 52, 19)
    cloud(warm, 72, 150, 46, 'c0', 's0'); cloud(warm, 196, 132, 30, 'c0', 's0'); cloud(warm, 6, 236, 34, 'c0', 's1')
    loose_balloons(warm, [(86, 96, 'o3'), (94, 84, 't1'), (226, 196, 'o2')])
    hill(warm, 60, HOR, 150, 30, 'o1'); hill(warm, 250, HOR, 120, 20, 'o1')
    bands(warm, [(HOR, 'g2'), (HOR + 5, 'g1'), (PY1 + 16, 'g0')], H)
    path(warm, PY0, PY1)
    tufts(warm, r, (0, HOR + 4, 300, PY0 - 1), 'g3', 16, avoid=(C('g1'),)); tufts(warm, r, (0, PY1 + 2, 300, H), 'g3', 18, avoid=(C('g1'), C('g0')))
    for box in ([24, 322, 96, 334], [126, 330, 176, 338], [14, 386, 60, 399], [92, 376, 134, 386], [178, 388, 226, 399]): recolour(warm, box, WARM_SHADE)
    coaster(warm, [(-30, 312), (10, 284), (60, 216), (104, 142), (134, 106), (152, 101), (167, 118), (179, 170), (189, 240), (199, 284), (214, 298), (236, 290), (262, 262), (290, 262), (320, 290)], HOR + 6, trains=[(6 * 14 + 6, 4)])
    tower(warm, 46, 328, 28, 132)
    tree_round(warm, 106, 330, 5, AUTUMN); tree_round(warm, 206, 332, 8, AUTUMN, 7)
    stall(warm, 150, 336, 'o2', 'o4')
    lamp(warm, 120, PY0 - 1); lamp(warm, 182, PY0 - 1); lamp(warm, 20, PY0 - 1)
    crowd(warm, r, 13, 4, 300, PY0 + 4, PY1 - 1, ['o3', 'o1', 't2', 'b1', 'c0', 'o2'], avoid=((228, 262),))
    for k in range(4): guest(warm, 132 + k * 5, 337, r, ['o3', 't2', 'c0', 'b1'])
    bench(warm, 64, PY1 + 9)
    crowd(warm, r, 5, 60, 190, 362, 376, ['o3', 't2', 'c0', 'b1'], keep=14)
    tree_round(warm, 36, 398, 2, AUTUMN, 9); tree_round(warm, 112, 384, 3, AUTUMN, 8); tree_round(warm, 200, 399, 4, AUTUMN, 8)
    bush(warm, 150, 372, ('o0', 'o2', 'o4')); bush(warm, 76, 396, ('g0', 'g2', 'g3'))

    # ---- the Chill half
    bands(cool, [(0, 'b1'), (36, 'b0'), (268, 'Fa1')], HOR)
    cloud(cool, 428, 146, 40, 'W', 'b0'); cloud(cool, 566, 96, 30, 'W', 'b0'); cloud(cool, 604, 214, 34, 'W', 'Fa2')
    birds(cool, [(424, 196), (436, 190), (450, 198)], 'W')
    hill(cool, 420, HOR, 130, 26, 't1'); hill(cool, 600, HOR, 110, 34, 't1')
    far_pines(cool, 420, HOR, 130, 26, [318, 327, 340, 366, 376, 392, 401, 412, 424]); far_pines(cool, 600, HOR, 110, 34, [505, 514, 526, 548, 560, 584, 592, 604])
    bands(cool, [(HOR, 'Fl2'), (HOR + 5, 'Fl1')], H)
    path(cool, PY0, PY1)
    lake = Image.new('L', (W, H), 0); ImageDraw.Draw(lake).ellipse([270, 360, 800, 520], fill=255)
    water(cool, lake, r)
    tufts(cool, r, (240, HOR + 4, W, PY0 - 1), 'Fl2', 18, avoid=(C('Fl1'),))
    for box in ([500, 322, 612, 336], [426, 330, 496, 338]): recolour(cool, box, COOL_SHADE)
    airballoon(cool, 600, 52, ['t2', 'c0', 't1', 'c0', 't3', 'c2'])
    for n, (x, big) in enumerate([(616, 2), (634, 0), (420, 1)]): tree_pine(cool, x, 328 + (n % 2) * 2, 20 + n, big)
    wheel(cool, 528, 188, 84, 328, 12, 24)
    carousel(cool, 452, 334)
    tree_round(cool, 598, 337, 6)
    fountain(cool, 334, 334)
    flowerbed(cool, 372, 336, 26, 4); flowerbed(cool, 272, 336, 30, 5)
    lamp(cool, 406, PY0 - 1); lamp(cool, 308, PY0 - 1); lamp(cool, 502, PY0 - 1); lamp(cool, 578, PY0 - 1)
    crowd(cool, r, 12, 250, 632, PY0 + 4, PY1 - 1, ['t2', 'b1', 't1', 'c0', 'b2', 'o1'])
    bench(cool, 520, PY1 + 7); bush(cool, 300, 364); bush(cool, 384, 358)
    jetty(cool, 424, 362, 44); boat(cool, 480, 376); boat(cool, 584, 384, sail=('c0', 'c2'))
    reeds(cool, 336, 388); reeds(cool, 606, 368, 4); reeds(cool, 392, 374, 2)
    flowerbed(cool, 536, 358, 34, 9); guest(cool, 440, 361, r, ['t2']); guest(cool, 452, 361, r, ['b1'], kid=True)
    lily(cool, 356, 392, True); lily(cool, 372, 384); lily(cool, 520, 394, True); lily(cool, 410, 376)
    tree_pine(cool, 634, 366, 40, 1)

    # ---- join the halves along the seam
    m = Image.new('L', (W, H), 0); mp = m.load()
    for y in range(H):
        for x in range(seam(y)): mp[x, y] = 255
    im = Image.composite(warm, cool, m); px = im.load()
    for y in range(H):
        xs = seam(y)
        for dx, c in ((-2, INK), (-1, C('c0')), (0, C('c0')), (1, C('c0')), (2, INK)): px[xs + dx, y] = c
    signpost(im, seam(366), 366)
    return im


# ---------------------------------------------------------------- phone: 195 x 422, the seam runs from the left to the right
def phone():
    W, H = 195, 422; HOR = 290; LAKE = 308
    seam = lambda x: 150 - x // 10                       # one pixel up every ten columns
    warm = Image.new('RGB', (W, H)); cool = Image.new('RGB', (W, H)); r = random.Random(23)

    # ---- the Thrill half: the tops of the rides, high in a warm sky
    bands(warm, [(0, 'o1'), (26, 'o0')], H)
    sun(warm, 8, 18, 12)
    cloud(warm, 64, 60, 34, 'c0', 's0'); cloud(warm, 96, 134, 44, 'c0', 's0')
    coaster(warm, [(-40, 172), (0, 134), (60, 72), (112, 31), (136, 21), (154, 25), (168, 48), (178, 98), (186, 150), (192, 190)], 200, trains=[(6 * 14 + 2, 4)])
    tower(warm, 34, 210, 16, 44)

    # ---- the Chill half
    bands(cool, [(0, 'b1'), (170, 'b0'), (232, 'Fa1')], HOR)
    cloud(cool, 122, 226, 36, 'W', 'b0'); cloud(cool, 150, 256, 30, 'W', 'Fa2')
    birds(cool, [(132, 210), (144, 204)], 'W')
    hill(cool, 40, HOR, 110, 22, 't1'); hill(cool, 170, HOR, 80, 30, 't1')
    far_pines(cool, 40, HOR, 110, 22, [8, 17, 30, 96, 106]); far_pines(cool, 170, HOR, 80, 30, [128, 138, 190])
    bands(cool, [(HOR, 'Fl2'), (HOR + 4, 'Fl1')], H)
    lake = Image.new('L', (W, H), 0); ImageDraw.Draw(lake).rectangle([0, LAKE, W, H], fill=255)
    water(cool, lake, r, calm=0.55)
    recolour(cool, [40, 296, 110, 305], COOL_SHADE); recolour(cool, [126, 298, 190, 306], COOL_SHADE)
    for n, (x, big) in enumerate([(118, 1), (186, 2), (4, 0)]): tree_pine(cool, x, 298 + n % 2, 50 + n, big)
    wheel(cool, 62, 249, 42, 302, 10, 20, small=True)
    carousel(cool, 152, 304)
    tree_pine(cool, 110, 305, 61); bush(cool, 16, 306)
    crowd(cool, r, 5, 20, 120, 306, 307, ['t2', 'b1', 'c0', 'o1'])

    m = Image.new('L', (W, H), 0); mp = m.load()
    for x in range(W):
        for y in range(seam(x)): mp[x, y] = 255
    im = Image.composite(warm, cool, m); px = im.load()
    for x in range(W):
        ys = seam(x)
        for dy, c in ((-2, INK), (-1, C('c0')), (0, C('c0')), (1, C('c0')), (2, INK)): px[x, ys + dy] = c
    return im


def save(im, name):
    n = count_colours(im)
    if n > 48: im = reduce_colours(im, 48); print(name, 'had', n, 'colours: reduced')
    im.save(os.path.join(HERE, name)); print(name, '%d x %d' % im.size, count_colours(im), 'colours')


T = ('o0', 'o1', 'o2', 'o4'); A = ('i0', 'i1', 'i1', 'i2'); B = ('b0', 'b1', 'b2', 'b3')
word('Thrills', 60, T, 'logo-d-thrills.png'); word('&', 60, A, 'logo-d-and.png'); word('Chills', 60, B, 'logo-d-chills.png')
word('Thrills', 48, T, 'logo-p-thrills.png'); word('&', 36, A, 'logo-p-and.png'); word('Chills', 48, B, 'logo-p-chills.png')
save(desktop(), 'scene-desktop.png')
save(phone(), 'scene-phone.png')
