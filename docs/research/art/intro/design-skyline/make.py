#!/usr/bin/env python3
"""Design E of the intro mock-ups for "Thrills & Chills": THE SKYLINE AT ORANGE DUSK. Mock-up only, not game code.

A side view of the park, low on the screen: far hills, the skyline of the rides (wooden coaster and drop tower on the
warm Thrill side at the left, carousel and big wheel on the cool Chill side at the right), then a promenade with a fence,
lamps and tiny guests, a lawn with autumn trees on the left and a lake on the right.
The sky is flat bands around a low sun: warm near the sun (Thrill side), teal far from it (Chill side).

Writes, 1 file pixel = 1 art pixel (all shown at 2x):
  scene-desktop.png  640 x 400      scene-phone.png  195 x 422
  logo-desktop.png   520 x 72       logo-phone.png   187 x 142      (block lettering made from the game's font Fredoka)
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'kit3'))
from PIL import Image, ImageChops, ImageDraw, ImageFont
from palette import col, INK, count_colours

FONT = '/home/user/RC-TYCOON-/src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2'   # the game's own font, read only

_K = {}
def K(key):
    """Palette colour of a ramp key ('o0' is the lightest orange); an RGB tuple passes through."""
    if not isinstance(key, str): return key
    if key not in _K: _K[key] = col(key)
    return _K[key]


# ================================================================ masks
def shift(m, dx, dy):
    out = Image.new('L', m.size, 0); out.paste(m, (dx, dy)); return out


def grow(m, n=1, round_=True):
    """Dilates a mask by n pixels (4 and 8 neighbours in turn: an octagon, close to round)."""
    for i in range(n):
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if round_ and i % 2 == 1: nb += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
        out = m
        for dx, dy in nb: out = ImageChops.lighter(out, shift(m, dx, dy))
        m = out
    return m


# ================================================================ pixel lettering (the logo)
def text_mask(text, size, tracking=2, weight=700):
    """A hard 1-bit mask ('L', 0 or 255) of a text in Fredoka: drawn at 4x and reduced with a threshold."""
    k = 4
    f = ImageFont.truetype(FONT, size * k); f.set_variation_by_axes([weight])
    asc, desc = f.getmetrics()
    xs = [f.getlength(text[:i]) + i * tracking * k for i in range(len(text))]
    w = int(xs[-1] + f.getlength(text[-1])) + 8 * k; h = asc + desc + 8 * k
    w += (-w) % k; h += (-h) % k
    big = Image.new('L', (w, h), 0); d = ImageDraw.Draw(big)
    for ch, x in zip(text, xs): d.text((4 * k + x, 4 * k), ch, font=f, fill=255)
    small = big.resize((w // k, h // k), Image.BOX).point(lambda v: 255 if v >= 128 else 0)
    return small.crop(small.getbbox())


def block_word(text, size, face, side, depth=4, tracking=2):
    """One word as block lettering: a face of three flat tones (highlight on the upper left edges, base, a darker
    lower band), a side that runs to the lower right, and 1-pixel ink lines. face = (light, base, low), side = key."""
    m = text_mask(text, size, tracking)
    pad = 2; W, H = m.size[0] + depth + 2 * pad, m.size[1] + depth + 2 * pad
    A = Image.new('L', (W, H), 0); A.paste(m, (pad, pad))
    E = Image.new('L', (W, H), 0)
    for k in range(1, depth + 1): E = ImageChops.lighter(E, shift(A, k, k))
    B = ImageChops.lighter(A, E)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(INK + (255,), (0, 0), grow(B, 1, False))
    out.paste(K(side) + (255,), (0, 0), E)
    out.paste(INK + (255,), (0, 0), grow(A, 1, False))
    out.paste(K(face[1]) + (255,), (0, 0), A)
    px = out.load(); ap = A.load(); box = A.getbbox(); cut = box[1] + int((box[3] - box[1]) * 0.62)
    low, light = K(face[2]) + (255,), K(face[0]) + (255,)
    for y in range(cut, H):                      # the lower band of the face, joined with one checker row
        for x in range(W):
            if ap[x, y] and (y > cut or (x + y) % 2 == 0): px[x, y] = low
    for y in range(H):                           # highlight: top edges (2 pixels) and left edges (1 pixel)
        for x in range(W):
            if not ap[x, y]: continue
            top = y < 2 or not ap[x, y - 1] or not ap[x, y - 2]
            left = x < 1 or not ap[x - 1, y]
            if (top or left) and y < cut + 6: px[x, y] = light
    return out


THRILL = (('o1', 'o2', 'o3'), 'o5')
CHILL = (('b0', 'b1', 'b2'), 'b3')
AMP = (('i0', 'i1', 'i1'), 'i2')


def logo_desktop():
    """One line, 520 x 72 art pixels."""
    size = 72
    t = block_word('Thrills', size, *THRILL); a = block_word('&', size, *AMP); c = block_word('Chills', size, *CHILL)
    gap = 14; w = t.size[0] + a.size[0] + c.size[0] + 2 * gap; h = max(t.size[1], a.size[1], c.size[1])
    W, H = 520, 72
    assert w <= W and h <= H, (w, h)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); x = (W - w) // 2
    for part in (t, a, c):
        im.alpha_composite(part, (x, H - part.size[1])); x += part.size[0] + gap
    return im


def logo_phone():
    """Two lines with a small '&' between two rules, 187 x 142 art pixels."""
    t = block_word('Thrills', 57, *THRILL); c = block_word('Chills', 57, *CHILL); a = block_word('&', 38, *AMP, depth=2, tracking=0)
    W = 187; gap = 3; H = t.size[1] + a.size[1] + c.size[1] + 2 * gap
    assert max(t.size[0], c.size[0]) <= W and H == 142, (t.size, c.size, H)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    im.alpha_composite(t, ((W - t.size[0]) // 2, 0))
    ay = t.size[1] + gap; ax = (W - a.size[0]) // 2
    im.alpha_composite(a, (ax, ay))
    my = ay + a.size[1] // 2
    for x0, x1 in ((18, ax - 6), (ax + a.size[0] + 5, W - 19)):          # the two rules beside the '&'
        d.rectangle([x0, my - 1, x1, my + 1], fill=INK + (255,)); d.line([(x0 + 1, my), (x1 - 1, my)], fill=K('c0') + (255,))
    im.alpha_composite(c, ((W - c.size[0]) // 2, ay + a.size[1] + gap))
    return im


# ================================================================ scene tools
class Scene:
    def __init__(self, w, h):
        self.W, self.H = w, h
        self.im = Image.new('RGB', (w, h), K('s0')); self.d = ImageDraw.Draw(self.im); self.px = self.im.load()

S = None          # the scene that is being painted


def P(x, y, key):
    if 0 <= x < S.W and 0 <= y < S.H: S.px[x, y] = K(key)


class Layer:
    """A transparent sheet for one object. flush() adds the 1-pixel ink outline and pastes it into the scene."""
    def __init__(self, outline=True):
        self.im = Image.new('RGBA', (S.W, S.H), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im); self.outline = outline
    def P(self, x, y, key):
        if 0 <= x < S.W and 0 <= y < S.H: self.im.putpixel((x, y), K(key) + (255,))
    def flush(self):
        a = self.im.getchannel('A')
        if self.outline: S.im.paste(INK, (0, 0), ImageChops.subtract(grow(a, 1, False), a))
        S.im.paste(self.im, (0, 0), self.im)


def stamp(rows, x, y, cmap, L=None):
    """Paints a text sprite; x = its centre column, y = its bottom row."""
    h = len(rows); w = max(len(r) for r in rows); x0 = x - w // 2; y0 = y - h + 1
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in '. ': continue
            if L: L.P(x0 + i, y0 + j, cmap[ch])
            else: P(x0 + i, y0 + j, cmap[ch])


HORSE = ['.....oo..', '....oWWo.', '.oooWWWo.', 'oWWWWWo..', 'oWSSWWo..', 'oWWWWWo..', '.oWoWo...', '.oo.oo...']
GONDOLA = ['..o.o..', '.ooooo.', 'oRRRRRo', 'oWWoWWo', 'oCCCCCo', 'oCCCCCo', '.ooooo.']
CAR = ['.oooooo.', 'oKoKoKoo', 'oRRRRRRo', 'oRYYYYRo', '.oooooo.']
LAMP = ['.ooo.', 'oYYYo', 'oYWYo', '.ooo.', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '.ooo.']
BENCH = ['.oooooooooo.', 'oWWWWWWWWWWo', 'oooooooooooo', 'owwwwwwwwwwo', '.oooooooooo.', '..o......o..', '..o......o..']
ICE = ['.ooo.', 'oPPPo', 'oPWPo', 'oPPPo', 'oCCCo', '.oCo.', '..o..']
CUP = ['...o..', '..oo..', 'oooooo', 'oTTTTo', 'oTWTTo', '.oTTo.', '.oooo.']
BOAT = ['....o....', '...oWo...', '..oWWo...', '.oWWWo...', '....o....', 'ooooooooo', 'oRRRRRRRo', '.ooooooo.']
GUESTS = [['.HH.', '.SS.', 'TTTT', 'TTTT', '.PP.', '.PP.'], ['.HH.', '.SS.', 'TTTT', '.TT.', '.PP.', 'P..P'], ['.HH.', '.SS.', 'TTTT', '.TT.', '.PP.'], ['HH', 'SS', 'TT', 'PP']]
SHIRTS = ['o2', 't2', 'b1', 'c0', 'o3', 'p1', 'v1', 't3', 'b2']


# ================================================================ sky
def sky(sun, ax, ay, bands, bottom, left=1.0):
    """Flat bands around the low sun: ellipses of distance d from it. bands = [(limit of d, colour key), ...] from the
    sun outwards; the last band takes the rest. Two bands meet in one checker ring. left < 1 stretches the bands on
    the left of the sun, so the whole Thrill side stays warm."""
    sx, sy = sun; keys = [K(k) for _, k in bands]; lims = [l for l, _ in bands]; n = len(lims) - 1
    for y in range(bottom):
        for x in range(S.W):
            dx = (x - sx) * (left if x < sx else 1.0)
            d = math.hypot(dx / ax, (y - sy) / ay); i = 0
            while i < n and d >= lims[i]: i += 1
            if i < n and lims[i] - d < 2.0 and (x + y) % 2 == 0: i += 1
            S.px[x, y] = keys[i]


def cloud(x, y, w, top='c0', under='s0'):
    """A long flat evening cloud; (x, y) = left end of its base row, w = length. Lit top rows, one shade row below."""
    rows = [(0.36, 0.24, top), (0.24, 0.48, top), (0.10, 0.78, top), (0.02, 0.96, top), (0.0, 1.0, top), (0.08, 0.86, under), (0.22, 0.56, under)]
    for j, (o, l, key) in enumerate(rows):
        yy = y - 4 + j
        S.d.line([(x + int(w * o), yy), (x + int(w * o) + int(w * l), yy)], fill=K(key))


def stars(spots):
    """The first stars on the cool side: a plus of five pixels (big) or one pixel."""
    for x, y, big in spots:
        P(x, y, 'c0')
        if big:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): P(x + dx, y + dy, 'c0')


def moon(cx, cy, r):
    """The pale moon of the cool side: a flat disc with three small seas."""
    S.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=K('c0'))
    for dx, dy, w in ((-r // 2, -r // 3, 2), (r // 4, r // 4, 3), (-r // 4, r // 2, 2)):
        S.d.line([(cx + dx, cy + dy), (cx + dx + w - 1, cy + dy)], fill=K('t0'))


def birds(spots):
    for x, y in spots:
        for dx, dy in ((-2, -1), (-1, 0), (0, 1), (1, 0), (2, -1)): P(x + dx, y + dy, 'i1')


def balloon(cx, cy, r, a, b, a2, b2):
    """A hot-air balloon with gores of two colours (a, b; a2, b2 = their shade tones on the right)."""
    L = Layer(); hh = int(r * 1.05); tail = int(r * 0.95); n = 7
    for y in range(cy - hh, cy + tail + 1):
        if y <= cy: half = r * math.sqrt(max(0.0, 1 - ((y - cy) / (hh + 0.5)) ** 2))
        else: half = 2.2 + (r - 2.2) * math.cos((y - cy) / tail * math.pi / 2) ** 0.8
        half = min(half, r - 0.6)                                  # the widest part spans several rows: no nub
        for x in range(cx - int(half), cx + int(half) + 1):
            u = max(-1.0, min(1.0, (x - cx) / max(half, 1.0)))
            g = min(n - 1, int((math.asin(u) / math.pi + 0.5) * n))
            L.P(x, y, ((a if g < n - 2 else a2) if g % 2 == 0 else (b if g < n - 2 else b2)))
    by = cy + tail + 1
    L.d.rectangle([cx - 2, by, cx + 2, by], fill=K(a2))
    L.flush()
    for dx in (-2, 2): S.d.line([(cx + dx, by + 2), (cx + dx, by + 4)], fill=INK)
    L = Layer(); L.d.rectangle([cx - 2, by + 5, cx + 2, by + 7], fill=K('w1')); L.d.line([(cx - 2, by + 5), (cx + 2, by + 5)], fill=K('w0')); L.flush()


# ================================================================ land
def hill(x0, x1, fn, key, bottom, rim=None):
    """A far hill: one flat silhouette without outline; rim = a lighter 1-pixel edge on the slopes that face the light."""
    prev = None
    for x in range(max(0, x0), min(S.W, x1)):
        y = int(round(fn(x)))
        if y < bottom:
            S.d.line([(x, y), (x, bottom)], fill=K(key))
            if rim and prev is not None and y <= prev: P(x, y, rim)
        prev = y


def mini_pine(x, y, lit, dark, h=7):
    for j in range(h):
        half = (j + 1) // 2 if j < h - 1 else 0
        for dx in range(-half, half + 1): P(x + dx, y - h + 1 + j, lit if dx <= 0 else dark)
    P(x, y, dark)


def mini_round(x, y, lit, dark, r=3):
    S.d.ellipse([x - r, y - 2 * r, x + r, y], fill=K(dark)); S.d.ellipse([x - r, y - 2 * r, x + r - 2, y - 2], fill=K(lit))


def forest(x0, x1, fn, lit, base, dark, bottom, seed, rmin=3, rmax=5):
    """A far wood without outline: a band of round crowns in one flat tone; each crown has a lit cluster on its upper
    left and a dark edge on its lower right."""
    r = random.Random(seed); x = x0; crowns = []
    while x < x1:
        rr = r.randint(rmin, rmax); crowns.append((x, int(fn(x)) + rr, rr)); x += r.randint(rr + 1, rr + 4)
    for cx, cy, rr in crowns:
        S.d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=K(base)); S.d.rectangle([cx - rr, cy, cx + rr, bottom], fill=K(base))
    for cx, cy, rr in crowns:
        S.d.arc([cx - rr, cy - rr, cx + rr, cy + rr], -30, 80, fill=K(dark))
        S.d.ellipse([cx - rr + 1, cy - rr + 1, cx, cy - 1], fill=K(lit))


def tufts(x0, y0, x1, y1, seed, key='g3', gap=9, taken=None):
    """Grass tufts: three pixels each, a fixed seed, never closer than `gap` to another (no noise)."""
    r = random.Random(seed); spots = []
    for _ in range((x1 - x0) * (y1 - y0) // 6):
        x, y = r.randint(x0 + 2, x1 - 3), r.randint(y0 + 3, y1 - 2)
        if taken and taken(x, y): continue
        if all(abs(x - a) + abs(y - b) >= gap for a, b in spots): spots.append((x, y))
        if len(spots) >= (x1 - x0) * (y1 - y0) // 260: break
    for x, y in spots:
        P(x - 1, y - 1, key); P(x, y - 2, key); P(x + 1, y - 1, key)
    return spots


def tree_round(bx, by, seed, ramp=('l0', 'l1', 'l2', 'l3'), R=None, trunk=9):
    r = random.Random(seed); R = R or r.randint(7, 9)
    L = Layer(); d = L.d
    d.rectangle([bx - 1, by - trunk, bx + 1, by], fill=K('w1')); d.line([bx + 1, by - trunk, bx + 1, by], fill=K('w2'))
    cy = by - trunk + 1 - R + 2; blobs = [(-R + 3, 3, R - 2), (R - 3, 2, R - 2), (0, -3, R)]
    for dx, dy, rr in blobs: d.ellipse([bx + dx - rr, cy + dy - rr, bx + dx + rr, cy + dy + rr], fill=K(ramp[3]))
    for dx, dy, rr in blobs: d.ellipse([bx + dx - rr, cy + dy - rr, bx + dx + rr - 2, cy + dy + rr - 3], fill=K(ramp[2]))
    for dx, dy, rr in blobs: d.ellipse([bx + dx - rr + 1, cy + dy - rr + 1, bx + dx + rr - 6, cy + dy + rr - 7], fill=K(ramp[1]))
    for k in range(7):
        dx, dy, rr = blobs[k % 3]; px_, py_ = bx + dx - rr + 3 + r.randint(0, rr - 2), cy + dy - rr + 2 + r.randint(0, rr - 4)
        d.point([(px_, py_), (px_ + 1, py_)], fill=K(ramp[0]))
    L.flush()


def tree_pine(bx, by, seed, s=None):
    r = random.Random(seed); s = r.choice([0, 0, 1]) if s is None else s
    L = Layer(); d = L.d
    d.rectangle([bx - 1, by - 4, bx + 1, by], fill=K('w2'))
    for hw, yo, hh in [(9 + s, 3, 12), (7 + s, 10, 11), (5, 17, 10 + s)]:
        top = (bx, by - yo - hh)
        d.polygon([top, (bx - hw, by - yo), (bx, by - yo)], fill=K('l2')); d.polygon([top, (bx, by - yo), (bx + hw, by - yo)], fill=K('l4'))
        d.line([top, (bx - hw, by - yo)], fill=K('l1')); d.line([(bx - hw + 1, by - yo), (bx - 1, by - yo)], fill=K('l3'))
    L.flush()


def bush(bx, by, ramp=('l0', 'l2', 'l3')):
    L = Layer()
    L.d.ellipse([bx - 5, by - 6, bx + 5, by], fill=K(ramp[2])); L.d.ellipse([bx - 5, by - 6, bx + 3, by - 2], fill=K(ramp[1]))
    L.d.point([(bx - 3, by - 5), (bx - 2, by - 5), (bx, by - 4)], fill=K(ramp[0])); L.flush()


def lamp(x, y):
    """A lamp with a small glow: a checker diamond around its head (dusk)."""
    hx, hy = x, y - 9
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            m = abs(dx) + abs(dy)
            if 2 <= m <= 5 and (dx + dy) % 2 == 0: P(hx + dx, hy + dy, 'c0' if m <= 3 else 'o0')
    stamp(LAMP, x, y, {'o': 'i2', 'Y': 'o0', 'W': 'c0'})


def fence(x0, x1, y, gaps=()):
    """A low white fence: posts every 5 pixels and one rail, a shade row below the rail."""
    for x in range(x0, x1):
        if any(a <= x <= b for a, b in gaps): continue
        P(x, y - 3, 'c0'); P(x, y - 2, 'c3')
        if x % 5 == 0:
            for yy in range(y - 5, y + 1): P(x, yy, 'c0')


def guest(x, y, n):
    """A tiny guest, 4 to 6 pixels high, no outline: hair, face, shirt, legs."""
    r = random.Random(n * 7919 + 13)
    cm = {'H': r.choice(['i2', 'w2', 'w3', 'i2', 'o2']), 'S': r.choice(['k1', 'k1', 'k2']), 'T': SHIRTS[n % len(SHIRTS)], 'P': r.choice(['b3', 'i1', 'i1'])}
    stamp(GUESTS[r.choice([0, 0, 1, 1, 2, 3])], x, y, cm)


def toy_balloon(x, y, key):
    """A guest's balloon: a string of three pixels and a head of 3 x 3 with a light pixel."""
    for j in range(3): P(x, y - j, 'i1')
    for dx in (-1, 0, 1):
        for dy in (-5, -4, -3): P(x + dx, y + dy, key)
    P(x - 1, y - 5, 'c0')


def fountain(x, y):
    """A small fountain in side view: a stone basin, a column with a bowl, two arcs of water drops."""
    L = Layer(); d = L.d
    d.rectangle([x - 11, y - 4, x + 11, y], fill=K('c1')); d.line([(x - 11, y - 4), (x + 11, y - 4)], fill=K('c0')); d.rectangle([x + 6, y - 3, x + 11, y], fill=K('c2'))
    d.line([(x - 9, y - 5), (x + 9, y - 5)], fill=K('a1'))
    d.rectangle([x - 1, y - 12, x + 1, y - 6], fill=K('c0')); d.line([(x + 1, y - 12), (x + 1, y - 6)], fill=K('c2'))
    d.rectangle([x - 4, y - 14, x + 4, y - 13], fill=K('c0')); d.line([(x + 2, y - 13), (x + 4, y - 13)], fill=K('c2'))
    L.flush()
    for dx, dy in ((0, -19), (0, -17), (-1, -16), (1, -16), (-2, -17), (2, -17), (-4, -16), (4, -16), (-5, -14), (5, -14), (-6, -11), (6, -11), (-7, -8), (7, -8)):
        P(x + dx, y + dy, 'c0' if (dx + dy) % 2 == 0 else 'a0')


def pier(x, y, w=14, n=8):
    """A wooden pier from the bank into the lake: planks, a dark edge, two posts in the water."""
    L = Layer(); d = L.d
    d.rectangle([x, y, x + w, y + n], fill=K('w0')); d.rectangle([x + w - 3, y, x + w, y + n], fill=K('w1'))
    for yy in range(y + 2, y + n, 3): d.line([(x, yy), (x + w, yy)], fill=K('w1'))
    d.rectangle([x + 1, y + n + 1, x + 2, y + n + 3], fill=K('w2')); d.rectangle([x + w - 2, y + n + 1, x + w - 1, y + n + 3], fill=K('w2'))
    L.flush()


def crowd(x0, x1, y0, y1, groups, seed, skip=()):
    """Guests in small groups of one to four on the promenade; a fixed seed; groups keep their distance."""
    r = random.Random(seed); centres = []; n = seed
    for _ in range(groups * 40):
        x = r.randint(x0, x1)
        if any(a <= x <= b for a, b in skip): continue
        if all(abs(x - a) >= 26 for a in centres): centres.append(x)
        if len(centres) >= groups: break
    spots = []
    for cx in centres:
        k = r.choice([1, 2, 2, 3, 3, 4]); x = cx - (k - 1) * 3
        for i in range(k):
            spots.append((x + i * 6 + r.randint(-1, 0), r.randint(y0, y1)))
    for x, y in sorted(spots, key=lambda p: p[1]):
        n += 1; guest(x, y, n)
        if n % 7 == 3: toy_balloon(x + 3, y - 6, ['p1', 'b1', 'o2', 't2'][n % 4])


def ground_shadow(x0, x1, y, key='g3'):
    S.d.ellipse([x0, y - 2, x1, y + 2], fill=K(key))


# ================================================================ rides (side view)
def wheel(cx, gy, R, booth=True):
    hy = gy - R - 12
    ground_shadow(cx - int(R * 0.5), cx + int(R * 1.0), gy)
    L = Layer(); d = L.d                                           # back legs, darker
    for sgn in (-1, 1): d.line([(cx + sgn * int(R * 0.42) + 3, gy - 3), (cx + 2, hy)], fill=K('c3'), width=2)
    L.flush()
    L = Layer(outline=False); d = L.d                              # spokes and the inner ring: thin, no outline
    for k in range(12):
        a = k * math.pi / 6 + math.pi / 12
        d.line([(cx, hy), (cx + int(round(R * math.cos(a))), hy + int(round(R * math.sin(a))))], fill=K('c3'))
    r2 = int(R * 0.6); d.ellipse([cx - r2, hy - r2, cx + r2, hy + r2], outline=K('b2'))
    L.flush()
    L = Layer(); d = L.d                                           # the rim: 2 pixels, light on the upper left
    d.ellipse([cx - R, hy - R, cx + R, hy + R], outline=K('b1'), width=2)
    px = L.im.load()
    for y in range(max(0, hy - R), min(S.H, hy + R + 1)):
        for x in range(max(0, cx - R), min(S.W, cx + R + 1)):
            if px[x, y][3]:
                t = ((x - cx) + (y - hy)) / R
                if t < -0.75: px[x, y] = K('b0') + (255,)
                elif t > 0.75: px[x, y] = K('b2') + (255,)
    L.flush()
    for k in range(24):                                            # lights on the rim
        a = k * math.pi / 12; P(cx + int(round((R - 1) * math.cos(a))), hy + int(round((R - 1) * math.sin(a))), 'o0' if k % 2 else 'c0')
    cols = [('t1', 't2'), ('c0', 'b1'), ('v0', 'v1'), ('o0', 'o1'), ('b0', 'b1'), ('p0', 'p1')]
    for k in range(12):                                            # gondolas hang from the rim
        a = k * math.pi / 6 + math.pi / 12; gx, gyy = cx + int(round((R - 1) * math.cos(a))), hy + int(round((R - 1) * math.sin(a)))
        lo, hi = cols[k % len(cols)]
        stamp(GONDOLA, gx, gyy + 7, {'o': 'i2', 'R': hi, 'W': 'c0', 'C': lo})
    L = Layer(); d = L.d                                           # front legs, hub, base
    for sgn in (-1, 1):
        fx = cx + sgn * int(R * 0.5)
        d.line([(fx, gy - 3), (cx, hy)], fill=K('c0'), width=3); d.line([(fx + 1, gy - 3), (cx + 1, hy)], fill=K('c2'))
    by = gy - int(R * 0.42); d.line([(cx - int(R * 0.33), by), (cx + int(R * 0.33), by)], fill=K('c1'), width=2)
    d.ellipse([cx - 4, hy - 4, cx + 4, hy + 4], fill=K('o1')); d.ellipse([cx - 4, hy - 4, cx + 2, hy + 2], fill=K('o0')); d.point([(cx - 2, hy - 2), (cx - 1, hy - 2)], fill=K('c0'))
    hw = int(R * 0.72)
    d.rectangle([cx - hw, gy - 3, cx + hw, gy], fill=K('c0')); d.line([(cx - hw, gy), (cx + hw, gy)], fill=K('c2')); d.rectangle([cx + hw - 6, gy - 3, cx + hw, gy], fill=K('c2'))
    L.flush()
    if not booth: return
    bx = cx + hw - 9                                               # the ticket booth
    L = Layer(); d = L.d
    d.rectangle([bx - 5, gy - 15, bx + 5, gy - 4], fill=K('c0')); d.rectangle([bx + 3, gy - 15, bx + 5, gy - 4], fill=K('c2'))
    d.rectangle([bx - 3, gy - 12, bx + 1, gy - 8], fill=K('i1')); d.point([(bx - 1, gy - 10), (bx - 1, gy - 9)], fill=K('k0'))
    d.polygon([(bx - 7, gy - 16), (bx, gy - 21), (bx + 7, gy - 16)], fill=K('t2')); d.polygon([(bx, gy - 21), (bx + 7, gy - 16), (bx, gy - 16)], fill=K('t3'))
    L.flush()


def carousel(cx, gy, w=72, h=60):
    hw = w // 2; top = gy - h; base = top + int(h * 0.27)          # base = the lower edge of the roof cone
    ground_shadow(cx - hw + 6, cx + hw + 12, gy)
    L = Layer(); d = L.d
    d.rectangle([cx - hw, gy - 3, cx + hw, gy], fill=K('c0')); d.line([(cx - hw, gy), (cx + hw, gy)], fill=K('c2')); d.rectangle([cx + hw - 8, gy - 3, cx + hw, gy], fill=K('c2'))
    d.rectangle([cx - hw + 3, gy - 6, cx + hw - 3, gy - 4], fill=K('t1')); d.rectangle([cx + int(hw * 0.4), gy - 6, cx + hw - 3, gy - 4], fill=K('t2'))
    d.rectangle([cx - 4, base, cx + 4, gy - 7], fill=K('c0')); d.rectangle([cx + 2, base, cx + 4, gy - 7], fill=K('c2'))
    for yy in range(base + 12, gy - 9, 8): d.line([(cx - 4, yy), (cx + 4, yy)], fill=K('o2'))
    n = max(2, w // 22); sad = ['o2', 'b1', 'p1', 'v1']
    offs = [int(round((hw - 7) * (2 * i + 1) / (2 * n))) for i in range(n)]
    for i, dx in enumerate([-o for o in reversed(offs)] + offs):
        x = cx + dx
        d.line([(x, base), (x, gy - 7)], fill=K('o0'))
        stamp(HORSE, x + 1, gy - 9 - (i % 2) * 4, {'o': 'i2', 'W': 'c0' if i % 2 else 'o0', 'S': sad[i % 4]}, L)
    L.flush()
    L = Layer(); d = L.d                                           # the tent: striped cone and valance
    n = 12; xs = [cx - hw - 3 + int(round((w + 6) * i / n)) for i in range(n + 1)]
    for i in range(n):
        lit = i < n * 0.6
        d.polygon([(cx, top), (xs[i], base), (xs[i + 1], base)], fill=K((('t1' if lit else 't3') if i % 2 == 0 else ('c0' if lit else 'c2'))))
    for i in range(n):
        lit = i < n * 0.6; key = K((('c0' if lit else 'c2') if i % 2 == 0 else ('t2' if lit else 't3')))
        d.rectangle([xs[i], base + 1, xs[i + 1] - 1, base + 5], fill=key); d.line([(xs[i] + 1, base + 6), (xs[i + 1] - 2, base + 6)], fill=key)
    d.rectangle([cx - 1, top - 3, cx + 1, top - 1], fill=K('o0')); d.line([(cx, top - 9), (cx, top - 4)], fill=K('w2'))
    d.polygon([(cx + 1, top - 9), (cx + 6, top - 7), (cx + 1, top - 6)], fill=K('o3'))
    L.flush()
    for i in range(n): P((xs[i] + xs[i + 1]) // 2, base + 8, 'o0')    # lights under the valance


def tower(cx, gy, h):
    top = gy - h
    S.d.polygon([(cx - 6, gy + 2), (cx + 14, gy + 2), (cx + 40, gy - 2), (cx + 14, gy - 2)], fill=K('g3'))
    L = Layer(); d = L.d
    d.rectangle([cx - 12, gy - 3, cx + 12, gy], fill=K('c0')); d.rectangle([cx + 6, gy - 3, cx + 12, gy], fill=K('c2')); d.line([(cx - 12, gy), (cx + 12, gy)], fill=K('c2'))
    d.rectangle([cx - 8, gy - 7, cx + 8, gy - 4], fill=K('c0')); d.rectangle([cx + 4, gy - 7, cx + 8, gy - 4], fill=K('c2'))
    for y in range(top, gy - 7):                                   # the shaft: cream with orange stripes that climb
        for x in range(cx - 4, cx + 5):
            stripe = ((y - top) + (x - cx)) % 12 < 4; shade = x > cx + 1
            L.P(x, y, ('o4' if shade else 'o2') if stripe else ('c2' if shade else 'c0'))
    yr = gy - int(h * 0.56); rw = 17                              # the ring of seats
    d.rectangle([cx - rw, yr - 3, cx + rw, yr + 3], fill=K('o1')); d.line([(cx - rw, yr - 3), (cx + rw, yr - 3)], fill=K('o0'))
    d.rectangle([cx - rw, yr + 2, cx + rw, yr + 3], fill=K('o3')); d.rectangle([cx + 9, yr - 3, cx + rw, yr + 3], fill=K('o2')); d.rectangle([cx + 9, yr + 2, cx + rw, yr + 3], fill=K('o4'))
    for x, y in ((cx - rw, yr - 3), (cx + rw, yr - 3), (cx - rw, yr + 3), (cx + rw, yr + 3)): L.im.putpixel((x, y), (0, 0, 0, 0))
    for i, dx in enumerate(range(-rw + 3, rw - 1, 4)):             # riders: a head and a shirt, legs hang below
        L.P(cx + dx, yr - 5, ['w2', 'i2', 'o0', 'w1'][i % 4]); L.P(cx + dx, yr - 4, ['k0', 'k2'][i % 2])
        L.P(cx + dx, yr + 4, ['b3', 'i1'][i % 2])
        L.P(cx + dx, yr - 1, SHIRTS[(i * 2 + 1) % 6]); L.P(cx + dx, yr, SHIRTS[(i * 2 + 1) % 6]); L.P(cx + dx + 1, yr - 1, SHIRTS[(i * 2 + 1) % 6])
    d.rectangle([cx - 7, top - 6, cx + 7, top - 1], fill=K('o1')); d.line([(cx - 7, top - 6), (cx + 7, top - 6)], fill=K('o0'))
    d.rectangle([cx + 3, top - 6, cx + 7, top - 1], fill=K('o3')); d.line([(cx - 7, top - 1), (cx + 7, top - 1)], fill=K('o3'))
    d.polygon([(cx - 9, top - 7), (cx, top - 13), (cx + 9, top - 7)], fill=K('o2')); d.polygon([(cx, top - 13), (cx + 9, top - 7), (cx, top - 7)], fill=K('o4'))
    d.line([(cx, top - 22), (cx, top - 14)], fill=K('w2')); d.polygon([(cx + 1, top - 22), (cx + 8, top - 20), (cx + 1, top - 17)], fill=K('o0'))
    L.flush()


def profile(keys):
    """The track of the coaster as y(x) for every x. keys = [(x, y, ease), ...]: between two keys the slope rises over
    the first `ease` share of the way, stays, and falls to zero over the last share: flat tops and valleys, straight slopes."""
    ys = {}
    for (xa, ya, ea), (xb, yb, eb) in zip(keys, keys[1:]):
        n = (xb - xa) * 4; acc = [0.0]
        for i in range(n):
            t = (i + 0.5) / n; acc.append(acc[-1] + min(1.0, t / max(ea, 1e-6), (1 - t) / max(eb, 1e-6)))
        for i in range(n + 1): ys[xa + i / 4.0] = ya + (yb - ya) * acc[i] / acc[-1]
    return ys


def coaster(keys, gy, post=8, level=11, wood=('w0', 'w1', 'w2'), train_at=None, cars=3, body='t2', heading=1):
    """A wooden coaster in side view: a lattice of posts, beams and braces under an orange track with ink outline."""
    ys = profile(keys); xs = sorted(ys); x0, x1 = int(xs[0]), int(xs[-1])
    yi = lambda x: int(round(ys[float(x)]))
    L = Layer(outline=False); d = L.d
    cols_ = [x for x in range(x0 + 3, x1 + 1, post) if 0 <= x < S.W + post]
    for a, b in zip(cols_, cols_[1:]):                             # beams and braces between two posts, under the track
        j = 1
        while gy - j * level > max(yi(a), yi(b)) + 3:
            y = gy - j * level; d.line([(a, y), (b, y)], fill=K(wood[1]))
            if gy - (j + 1) * level > max(yi(a), yi(b)) + 3 and (cols_.index(a) + j) % 2 == 0: d.line([(a, y), (b, y - level)], fill=K(wood[2]))
            elif gy - (j + 1) * level > max(yi(a), yi(b)) + 3: d.line([(a, y - level), (b, y)], fill=K(wood[2]))
            j += 1
        if gy - level > max(yi(a), yi(b)) + 3:
            d.line([(a, gy), (b, gy - level)] if cols_.index(a) % 2 else [(a, gy - level), (b, gy)], fill=K(wood[2]))
    for x in cols_:
        if yi(x) + 2 < gy: d.line([(x, yi(x) + 2), (x, gy)], fill=K(wood[0])); d.line([(x + 1, yi(x) + 3), (x + 1, gy)], fill=K(wood[1]))
    L.flush()
    L = Layer(); px = L.im                                         # the track: 3 pixels, light above, dark below
    pts = [(int(round(x)), int(round(ys[x]))) for x in xs]
    for x, y in pts:
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)): L.P(x + dx, y + dy, 'o2')
    for x, y in pts: L.P(x, y + 1, 'o4'); L.P(x + 1, y + 1, 'o4')
    for x, y in pts: L.P(x, y - 1, 'o1'); L.P(x - 1, y - 1, 'o1')
    for x, y in pts: L.P(x, y, 'o2')
    L.flush()
    if train_at is not None:
        rows = CAR if heading > 0 else [row[::-1] for row in CAR]
        for c in range(cars):                                      # the first car leads in the direction of travel
            x = train_at - heading * c * 9
            stamp(rows, x, yi(x) - 2, {'o': 'i2', 'K': ['k0', 'k2', 'k0'][c % 3], 'R': body, 'Y': 'o0'})
    return yi


def station(x0, x1, gy, ty):
    """The coaster's station: a deck at the height of the track and a striped roof."""
    L = Layer(); d = L.d
    d.rectangle([x0, ty + 2, x1, gy], fill=K('c0')); d.rectangle([x1 - 5, ty + 2, x1, gy], fill=K('c2')); d.line([(x0, ty + 2), (x1, ty + 2)], fill=K('c1'))
    d.rectangle([x0 + 4, ty + 6, x1 - 9, gy - 2], fill=K('c1'))
    for x in (x0 + 2, x1 - 3): d.rectangle([x, ty - 16, x + 1, ty + 1], fill=K('c0'))
    L.flush()
    L = Layer(); d = L.d
    n = (x1 - x0 + 8) // 4
    for i in range(n):
        xa = x0 - 4 + i * 4; key = K(('o1' if i % 2 == 0 else 'c0') if i < n * 0.65 else ('o3' if i % 2 == 0 else 'c2'))
        d.rectangle([xa, ty - 22, xa + 3, ty - 17], fill=key)
    d.line([(x0 - 4, ty - 16), (x0 - 4 + n * 4 - 1, ty - 16)], fill=K('o3'))
    mx = (x0 + x1) // 2
    d.rectangle([mx - 9, ty - 29, mx + 9, ty - 23], fill=K('o3')); d.line([(mx - 9, ty - 29), (mx + 9, ty - 29)], fill=K('o2'))
    for i in range(-7, 8, 3): d.rectangle([mx + i, ty - 27, mx + i + 1, ty - 25], fill=K('c0'))
    L.flush()


def stall(x, gy, awn=('o1', 'o3'), icon=ICE, icmap=None):
    """A small stall seen from the front: a counter window under a striped awning, a sign on the roof."""
    L = Layer(); d = L.d
    d.rectangle([x - 10, gy - 13, x + 10, gy], fill=K('c0')); d.rectangle([x + 6, gy - 13, x + 10, gy], fill=K('c2'))
    d.rectangle([x - 7, gy - 11, x + 3, gy - 6], fill=K('i1')); d.rectangle([x - 3, gy - 10, x - 2, gy - 9], fill=K('k0')); d.rectangle([x - 4, gy - 8, x - 1, gy - 7], fill=K(awn[0]))
    d.line([(x - 8, gy - 5), (x + 4, gy - 5)], fill=K('w0')); d.line([(x - 8, gy - 4), (x + 4, gy - 4)], fill=K('w1'))
    L.flush()
    L = Layer(); d = L.d
    for i in range(8):
        xa = x - 12 + i * 3; key = K((awn[0] if i < 6 else awn[1]) if i % 2 == 0 else ('c0' if i < 6 else 'c2'))
        d.rectangle([xa, gy - 19, xa + 2, gy - 14], fill=key); d.point([(xa + 1, gy - 13)], fill=key)
    d.line([(x - 11, gy - 20), (x + 10, gy - 20)], fill=K('c0'))
    L.flush()
    stamp(icon, x, gy - 21, icmap or {'o': 'i2', 'P': 'p1', 'W': 'c0', 'C': 'w0'})


# ================================================================ ground
def promenade(y0, y1, x0=0, x1=None):
    """The sandy promenade: a band of paving with joints in two rows."""
    x1 = S.W if x1 is None else x1
    S.d.rectangle([x0, y0, x1 - 1, y1], fill=K('s1'))
    S.d.line([(x0, y0), (x1 - 1, y0)], fill=K('s3')); S.d.line([(x0, y1), (x1 - 1, y1)], fill=K('s3'))
    mid = (y0 + y1) // 2; S.d.line([(x0, mid), (x1 - 1, mid)], fill=K('s2'))
    for x in range(x0, x1):
        if x % 14 == 3: S.d.line([(x, y0 + 1), (x, mid - 1)], fill=K('s2'))
        if x % 14 == 10: S.d.line([(x, mid + 1), (x, y1 - 1)], fill=K('s2'))
        if x % 28 in (6, 7, 8): P(x, y0 + 2, 's0')
        if x % 28 in (20, 21, 22): P(x, mid + 2, 's0')


def lake(shore, x0, x1, seed=3):
    """Calm water below the line shore(x): one flat tone, short light and dark ripples, a pale edge at the bank."""
    water = set()
    for x in range(max(0, x0), min(S.W, x1)):
        ys = shore(x)
        if ys is None or ys >= S.H: continue
        ys = int(ys)
        S.d.line([(x, ys), (x, S.H - 1)], fill=K('a1'))
        P(x, ys - 1, 'g3'); P(x, ys, 'a0'); P(x, ys + 1, 'a2')
        for y in range(ys + 3, S.H): water.add((x, y))
    r = random.Random(seed); done = []
    for _ in range(4000):
        if not water: break
        x, y = r.randint(max(0, x0), min(S.W, x1) - 1), r.randint(0, S.H - 1); n = r.randint(3, 8)
        if not all((x + i, y) in water and (x + i, y - 1) in water for i in (-1, 0, n)): continue
        if any(abs(y - b) < 4 and abs(x - a) < 16 for a, b in done): continue
        done.append((x, y)); key = 'a0' if len(done) % 3 else 'a2'
        S.d.line([(x, y), (x + n - 1, y)], fill=K(key))
    return water


# ================================================================ the two scenes
def flowerbed(x, y, w):
    """A low bed seen from the side: soil, a row of leaves, flowers of three colours."""
    L = Layer(); d = L.d
    d.rectangle([x, y - 1, x + w, y], fill=K('w2')); d.rectangle([x, y - 4, x + w, y - 2], fill=K('l2')); d.line([(x, y - 2), (x + w, y - 2)], fill=K('l3'))
    for i in range(1, w - 1, 4):
        d.rectangle([x + i, y - 6, x + i + 1, y - 5], fill=K(['p1', 'c0', 'o1'][(i // 4) % 3]))
    L.flush()


def branch_path(xa, xb, y0, xc, xd, y1):
    """A path from the promenade towards the viewer: it widens downwards."""
    S.d.polygon([(xa, y0), (xb, y0), (xd, y1), (xc, y1)], fill=K('s1'))
    S.d.line([(xa, y0), (xc, y1)], fill=K('s3')); S.d.line([(xb, y0), (xd, y1)], fill=K('s3'))
    S.d.line([(xa + 1, y0), (xb - 1, y0)], fill=K('s1'))
    y = y0 + 5; step = 6
    while y < y1:
        t = (y - y0) / float(y1 - y0); S.d.line([(int(xa + (xc - xa) * t) + 2, y), (int(xb + (xd - xb) * t) - 2, y)], fill=K('s2'))
        y += step; step += 2


BANDS_D = [(36, 'o1'), (78, 'o0'), (140, 's1'), (200, 's0'), (246, 'c0'), (300, 't0'), (362, 'a0'), (1e9, 't1')]
BANDS_P = [(27, 'o1'), (56, 'o0'), (98, 's1'), (136, 's0'), (166, 'c0'), (200, 't0'), (242, 'a0'), (1e9, 't1')]


def scene_desktop():
    """640 x 400. The Thrill side is on the left (under the word "Thrills"), the Chill side on the right. The menu plate
    of the desktop covers art x 24..176, y 170..380: only lawn and the far end of the coaster lie behind it."""
    global S
    S = Scene(640, 400); GY = 312; M = 639
    sun = (214, 272)
    sky(sun, 1.1, 1.35, BANDS_D, 304, left=0.5)
    S.d.ellipse([sun[0] - 22, sun[1] - 22, sun[0] + 22, sun[1] + 22], fill=K('c0'))
    stars([(566, 10, False), (598, 16, False), (634, 78, False), (624, 108, True), (636, 162, False), (606, 96, False), (588, 58, False)])
    moon(615, 40, 9)
    cloud(140, 152, 58, 'c0', 's0'); cloud(288, 192, 64, 'c0', 's0'); cloud(516, 148, 60, 'c0', 'a0')
    birds([(432, 150), (442, 156), (454, 148)])
    balloon(96, 128, 15, 'o1', 'c0', 'o3', 'c2'); balloon(602, 134, 15, 't1', 'c0', 't3', 'c2')
    # far hills: warm on the Thrill side, cool and wooded on the Chill side
    warm = lambda x: 300 - 16 * math.sin((M - x - 330) / 90.0) - 5 * math.sin((M - x) / 27.0 + 1) - (M - x - 330) * 0.03
    cool = lambda x: 282 - 16 * math.sin((M - x) / 70.0 + 0.6) - 8 * math.sin((M - x) / 31.0) + max(0, 352 - x) * 1.1
    green = lambda x: 296 - 10 * math.sin((M - x) / 48.0 + 2.2) - 4 * math.sin((M - x) / 19.0) + max(0, M - x - 250) * 0.2
    hill(326, 640, cool, 't2', 304, 't1'); hill(0, 332, warm, 's3', 304, 's2'); hill(310, 640, green, 'l2', 304, 'l1')
    r = random.Random(11)
    for u in range(6, 330, 9):
        if r.random() < 0.7: mini_pine(M - u + r.randint(-2, 2), int(green(M - u)) + 2, 'l3', 'l4', r.choice([6, 7, 8]))
    x = 636
    while x > 356:                                                 # far pines on the cool ridge
        mini_pine(x, int(cool(x)) + 2, 't3', 't3', r.choice([5, 6, 7])); x -= r.choice([5, 6, 6, 8, 13, 19])
    forest(-6, 238, lambda x: 293 - 3 * math.sin(x / 23.0) - (236 - x) * 0.012, 'o1', 'o2', 'o3', 304, 4)   # the autumn wood behind the coaster
    # ground: the lawn of the rides, the promenade, the front lawn, the lake on the Chill side
    S.d.rectangle([0, 304, 639, 399], fill=K('g1')); S.d.rectangle([0, 304, 639, 309], fill=K('g2'))
    for x in range(0, 640, 2): P(x, 310, 'g2')
    promenade(GY + 10, GY + 25)
    branch_path(388, 416, GY + 25, 362, 446, 399)
    shore = lambda x: None if x < 452 else (346 if x >= 540 else 346 + (540 - x) ** 2 * 0.007)
    water = lake(shore, 452, 640)
    onlawn = lambda x, y: not (356 <= x <= 451) and (x < 452 or y < shore(x) - 5)
    tufts(176, 340, 640, 400, 5, taken=lambda x, y: not onlawn(x, y))
    for n, (x, y) in enumerate([(190, 366), (222, 384), (284, 350), (318, 372), (344, 392), (430, 372), (442, 390), (478, 384), (300, 392), (250, 346)]):
        P(x, y, ['p1', 'c0', 'o1'][n % 3]); P(x + 1, y, ['p1', 'c0', 'o1'][n % 3]); P(x, y + 1, 'g3')          # a few flowers in the lawn
    tufts(0, 304, 640, 320, 6, key='g3', gap=14)
    # the skyline, from the back to the front
    coaster([(148, GY - 30, 0.4), (180, GY - 74, 0.5), (206, GY - 8, 0.35), (240, GY - 142, 0.28), (310, GY - 12, 0.25), (342, GY - 12, 0.3)], GY,
            wood=('w1', 'w2', 'w1'), train_at=236, heading=-1)
    station(312, 346, GY, GY - 12)
    tower(370, GY, 150)
    stall(398, GY + 9, ('o1', 'o3'))
    carousel(450, GY, 72, 60)
    wheel(562, GY, 64)
    fence(0, 640, GY + 9, gaps=[(304, 486), (514, 610)])
    for x in (186, 246, 492, 616): lamp(x, GY + 10)
    crowd(182, 634, GY + 16, GY + 24, 15, 21)
    for n, (x, y) in enumerate([(396, 352), (405, 356), (411, 372), (390, 384), (397, 386)]): guest(x, y, 70 + n)
    # the front: near trees, beds, the fountain, and the small life of the lake
    pier(574, 345); stamp(BOAT, 560, 362, {'o': 'i2', 'W': 'c0', 'R': 'o2'}); stamp(BOAT, 612, 388, {'o': 'i2', 'W': 'c0', 'R': 't2'})
    guest(580, 350, 91); guest(586, 348, 92)
    for x, h in ((548, 4), (551, 6), (554, 5), (598, 5), (601, 7), (604, 4), (634, 6), (637, 4)):          # reeds at the bank
        S.d.line([(x, 348 - h), (x, 348)], fill=K('l3')); P(x, 347 - h, 'w1')
    flowerbed(326, 346, 30); flowerbed(420, 346, 30)
    for x0, x1, y in [(230, 258, 372), (300, 326, 362), (262, 292, 398), (452, 478, 365), (500, 524, 352), (620, 640, 345)]: ground_shadow(x0, x1, y, 'g2')
    tree_round(236, 372, 5, ('o0', 'o1', 'o2', 'o4'), R=11, trunk=11); tree_round(304, 362, 6, ('o0', 'o1', 'o2', 'o4'), R=10, trunk=10)
    bush(338, 380, ('o0', 'o1', 'o3')); stamp(BENCH, 204, 352, {'o': 'i2', 'W': 'w0', 'w': 'w1'})
    fountain(462, 366); tree_round(506, 352, 4, R=9); tree_pine(627, 344, 3)
    tree_round(268, 404, 8, ('o0', 'o1', 'o2', 'o4'), R=12, trunk=12); tree_round(196, 402, 9, ('o0', 'o1', 'o2', 'o4'), R=11, trunk=12)
    return S.im


def scene_phone():
    """195 x 422. The same park for the portrait screen: the rides stand close and overlap in depth. The menu block
    covers everything below art y = 274."""
    global S
    S = Scene(195, 422); GY = 258; M = 194
    sun = (37, 226)
    sky(sun, 1.0, 1.5, BANDS_P, 252, left=0.5)
    S.d.ellipse([sun[0] - 18, sun[1] - 18, sun[0] + 18, sun[1] + 18], fill=K('c0'))
    cloud(70, 172, 30, 'c0', 's0')
    warm = lambda x: 246 - 10 * math.sin((M - x - 96) / 50.0) - 3 * math.sin((M - x) / 15.0 + 1)
    cool = lambda x: 236 - 10 * math.sin((M - x) / 40.0 + 0.6) - 5 * math.sin((M - x) / 17.0) + max(0, M - x - 90) * 0.3
    green = lambda x: 246 - 6 * math.sin((M - x) / 26.0 + 2.2) - 2 * math.sin((M - x) / 11.0) + max(0, M - x - 70) * 0.2
    hill(65, 195, cool, 't2', 252, 't1'); hill(0, 99, warm, 's3', 252, 's2'); hill(95, 195, green, 'l2', 252, 'l1')
    r = random.Random(11)
    for u in range(4, 98, 9):
        if r.random() < 0.7: mini_pine(M - u + r.randint(-2, 2), int(green(M - u)) + 2, 'l3', 'l4', r.choice([6, 7]))
    forest(-6, 84, lambda x: 243 - 2 * math.sin(x / 17.0), 'o1', 'o2', 'o3', 252, 4, 3, 4)
    S.d.rectangle([0, 252, 194, 421], fill=K('g1')); S.d.rectangle([0, 252, 194, 255], fill=K('g2'))
    promenade(GY + 8, GY + 22)
    tufts(0, GY + 24, 195, 422, 5)
    coaster([(-9, GY - 50, 0.5), (9, GY - 8, 0.35), (29, GY - 86, 0.3), (83, GY - 10, 0.25), (95, GY - 10, 0.3)], GY, post=7, level=10,
            wood=('w1', 'w2', 'w1'), train_at=26, heading=-1)
    tower(61, GY, 74)
    wheel(145, GY, 40, booth=False)
    carousel(95, GY, 50, 44)
    fence(0, 195, GY + 7, gaps=[(48, 176)])
    for x in (6, 43, 123, 187): lamp(x, GY + 8)
    crowd(6, 188, GY + 13, GY + 15, 6, 33)
    return S.im


if __name__ == '__main__':
    for name, make in (('scene-desktop.png', scene_desktop), ('scene-phone.png', scene_phone), ('logo-desktop.png', logo_desktop), ('logo-phone.png', logo_phone)):
        im = make()
        im.save(os.path.join(HERE, name))
        print(name, '%d x %d' % im.size, count_colours(im), 'colours')
