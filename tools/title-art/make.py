#!/usr/bin/env python3
"""FINAL E of the intro of "Thrills & Chills": THE SKYLINE ON AN ORANGE DAY. Mock-up only, not game code.

A side view of the park: far hills, the skyline of the rides (wooden coaster and drop tower on the warm Thrill side at
the left, carousel and big wheel on the cool Chill side at the right, with a lake), a promenade with a fence, lamps and
tiny guests, and a lawn. The sky is flat bands drawn as arcs: an orange halo round a clear white sun over the coaster,
a teal halo over the wheel and the lake, and a pale sand top band across the whole top row (the CSS sky above it).

    python3 tools/title-art/make.py OUT_DIR

Writes into OUT_DIR, 1 file pixel = 1 art pixel (the game scales them by whole numbers):
  scene-wide.png  960 x 400   (desktop)        scene-tall.png  450 x 470   (phone)
  logo-line.png   496 x 62    (one line)       logo-stack.png  176 x 118   (three lines)
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from PIL import Image, ImageChops, ImageDraw, ImageFont
from palette import col, INK, count_colours

FONT = os.path.join(ROOT, 'src', 'assets', 'fonts', 'fredoka', 'fredoka-latin-wght-normal.woff2')   # the game's own font, read only

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
    for y in range(cut, H):                      # the lower band of the face (a clean edge: dither only in the sky)
        for x in range(W):
            if ap[x, y] and y >= cut: px[x, y] = low
    for y in range(H):                           # highlight: top edges (2 pixels) and left edges (1 pixel)
        for x in range(W):
            if not ap[x, y]: continue
            top = y < 2 or not ap[x, y - 1] or not ap[x, y - 2]
            left = x < 1 or not ap[x - 1, y]
            if (top or left) and y < cut + 6: px[x, y] = light
    return out


THRILL = (('o1', 'o2', 'o3'), 'o5')
CHILL = (('b0', 'b1', 'b2'), 'b3')
AMP = (('v0', 'v1', 'v2'), 'i1')              # the "&" in violet: the mix of the warm and the cool word


def logo_line():
    """The name on one line, 496 x 62 art pixels: "Thrills" (orange), "&" (ink), "Chills" (blue)."""
    t = block_word('Thrills', 72, *THRILL); a = block_word('&', 72, *AMP); c = block_word('Chills', 72, *CHILL)
    gap = 7; w = t.size[0] + a.size[0] + c.size[0] + 2 * gap; h = max(t.size[1], a.size[1], c.size[1])
    W, H = 496, 62
    assert w <= W and h <= H, (w, h)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); x = (W - w) // 2
    for part in (t, a, c):
        im.alpha_composite(part, (x, H - part.size[1])); x += part.size[0] + gap
    return im


def bar(w, light, dark):
    """A short rule of the name: 4 rows (ink, light, dark, ink) with round ends."""
    im = Image.new('RGBA', (w, 4), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle([1, 0, w - 2, 3], fill=INK + (255,)); d.rectangle([0, 1, w - 1, 2], fill=INK + (255,))
    d.line([(1, 1), (w - 2, 1)], fill=K(light) + (255,)); d.line([(1, 2), (w - 2, 2)], fill=K(dark) + (255,))
    return im


AMP_GRID = [                                  # a hand-drawn bold '&' for the stack (the font's '&' closes up when small)
    "......######........",
    ".....########.......",
    "....####..####......",
    "....###....###......",
    "....###....###......",
    "....###...####......",
    ".....###.####.......",
    ".....#######........",
    "....######.....####.",
    "...#######....####..",
    "..####.####..####...",
    ".####...####.###....",
    ".###.....#######....",
    "####......#####.....",
    "####.......####.....",
    "####......######....",
    ".####....########...",
    ".################...",
    "..##########..#####.",
    "....######.....#####",
]


def amp_small(depth=2):
    """The small '&' of the stack: the hand-drawn mask, a face of three tones (1-pixel highlight on the upper and left
    edges above the lower band), a side of `depth` pixels to the lower right that never fills the counters, ink lines."""
    m = Image.new('L', (len(AMP_GRID[0]), len(AMP_GRID)), 0)
    for y, r in enumerate(AMP_GRID):
        for x, c in enumerate(r):
            if c == '#': m.putpixel((x, y), 255)
    (fl, fb, fd), side = AMP
    pad = 2; W, H = m.size[0] + depth + 2 * pad, m.size[1] + depth + 2 * pad
    A = Image.new('L', (W, H), 0); A.paste(m, (pad, pad))
    bg = ImageChops.invert(A); ImageDraw.floodfill(bg, (0, 0), 128)
    holes = bg.point(lambda v: 255 if v == 255 else 0)        # background that the outside cannot reach: the counters
    E = Image.new('L', (W, H), 0)
    for k in range(1, depth + 1): E = ImageChops.lighter(E, shift(A, k, k))
    E = ImageChops.subtract(E, holes)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(INK + (255,), (0, 0), grow(ImageChops.lighter(A, E), 1, False))
    out.paste(K(side) + (255,), (0, 0), E)
    out.paste(INK + (255,), (0, 0), grow(A, 1, False))
    out.paste(K(fb) + (255,), (0, 0), A)
    px = out.load(); ap = A.load(); box = A.getbbox(); cut = box[1] + int((box[3] - box[1]) * 0.62)
    for y in range(H):
        for x in range(W):
            if not ap[x, y]: continue
            if y >= cut: px[x, y] = K(fd) + (255,)
            elif not ap[x, y - 1] or not ap[x - 1, y]: px[x, y] = K(fl) + (255,)
    return out


def logo_stack():
    """The name on three lines for narrow screens, 176 x 118 art pixels, every line centred: "Thrills" (orange),
    a violet "&" between an orange and a blue rule, "Chills" (blue)."""
    t = block_word('Thrills', 54, *THRILL, tracking=1); c = block_word('Chills', 54, *CHILL, tracking=1)
    a = amp_small()
    W = 176; ya = t.size[1] - 3; yc = ya + a.size[1] - 1; H = yc + c.size[1]
    assert t.size[0] <= W and c.size[0] <= W and H == 118, (t.size, a.size, c.size, H)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    im.alpha_composite(t, ((W - t.size[0]) // 2, 0))
    ax = (W - a.size[0]) // 2
    im.alpha_composite(a, (ax, ya))
    by = ya + a.size[1] // 2 - 2; bw = 44
    im.alpha_composite(bar(bw, 'o1', 'o3'), (ax - 5 - bw, by))
    im.alpha_composite(bar(bw, 'b0', 'b2'), (ax + a.size[0] + 3, by))
    im.alpha_composite(c, ((W - c.size[0]) // 2, yc))
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
def sky(sun, wa, wbands, cool, ca, cbands, top, bottom, ring=0):
    """Flat sky bands drawn as arcs. The warm family: ellipses round the sun (stretch wa = (ax, ay)), bands =
    [(limit, key), ...] from the sun outwards. The cool family: ellipses round the point `cool` (stretch ca). Where
    neither family reaches, the top colour (it fills the whole top row, so the CSS sky continues it). Where two bands
    of one family meet (or a band meets the top colour), ONE checker row: the outer band's pixels that touch the inner
    band take the inner colour on every second pixel. Warm wins where the families overlap, and a ring of the top colour
    `ring` units wide always lies round the warm halo, so the teal never touches the halo: warm turns into cool through
    the pale top band, on the arc of the halo."""
    W = S.W; grid = []
    for y in range(bottom):
        row = []
        for x in range(W):
            d = math.hypot((x - sun[0]) / wa[0], (y - sun[1]) / wa[1]); cell = None
            for i, (lim, key) in enumerate(wbands):
                if d < lim: cell = ('w', i, key); break
            if cell is None and d < wbands[-1][0] + ring: cell = ('t', 99, top)
            if cell is None:
                d = math.hypot((x - cool[0]) / ca[0], (y - cool[1]) / ca[1])
                for i, (lim, key) in enumerate(cbands):
                    if d < lim: cell = ('c', i, key); break
            row.append(cell or ('t', 99, top))
        grid.append(row)
    for y in range(bottom):
        for x in range(W):
            fam, rank, key = grid[y][x]; out = key
            if (x + y) % 2 == 0:
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < bottom:
                        f2, r2, k2 = grid[yy][xx]
                        if r2 < rank and (f2 == fam or fam == 't'): out = k2; break
            S.px[x, y] = K(out)


def sun_disc(cx, cy, r):
    """A clear flat disc: cream with a 1-pixel light rim on the upper left (no glow)."""
    S.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=K('c0'))


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
    """A lamp on the promenade (by day: no glow)."""
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


def tower(cx, gy, h, rw=17):
    top = gy - h
    bw = min(12, rw)                                               # half width of the base
    S.d.polygon([(cx - 6, gy + 2), (cx + bw + 2, gy + 2), (cx + bw * 3, gy - 2), (cx + bw + 2, gy - 2)], fill=K('g3'))
    L = Layer(); d = L.d
    d.rectangle([cx - bw, gy - 3, cx + bw, gy], fill=K('c0')); d.rectangle([cx + bw // 2, gy - 3, cx + bw, gy], fill=K('c2')); d.line([(cx - bw, gy), (cx + bw, gy)], fill=K('c2'))
    d.rectangle([cx - bw + 4, gy - 7, cx + bw - 4, gy - 4], fill=K('c0')); d.rectangle([cx + 4, gy - 7, cx + bw - 4, gy - 4], fill=K('c2'))
    for y in range(top, gy - 7):                                   # the shaft: cream with orange stripes that climb
        for x in range(cx - 4, cx + 5):
            stripe = ((y - top) + (x - cx)) % 12 < 4; shade = x > cx + 1
            L.P(x, y, ('o4' if shade else 'o2') if stripe else ('c2' if shade else 'c0'))
    yr = gy - int(h * 0.56)                                      # the ring of seats
    d.rectangle([cx - rw, yr - 3, cx + rw, yr + 3], fill=K('o1')); d.line([(cx - rw, yr - 3), (cx + rw, yr - 3)], fill=K('o0'))
    d.rectangle([cx - rw, yr + 2, cx + rw, yr + 3], fill=K('o3')); d.rectangle([cx + rw // 2, yr - 3, cx + rw, yr + 3], fill=K('o2')); d.rectangle([cx + rw // 2, yr + 2, cx + rw, yr + 3], fill=K('o4'))
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


def coaster(keys, gy, post=8, level=11, wood=('w0', 'w1', 'w2'), train_at=None, cars=3, body='t2', heading=1, clean=False):
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
    if clean:                                                      # the track: 2 pixels, a light line and a dark one
        pts = []                                                   # under it, the same thickness on every slope
        for x in xs:
            p = (int(round(x)), int(round(ys[x])))
            if not pts or p != pts[-1]: pts.append(p)
        L = Layer(); d = L.d
        lo, hi = xs[0], xs[-1]
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            xm = (xa + xb) / 2.0
            sl = (ys[max(lo, min(hi, round((xm + 0.75) * 4) / 4.0))] - ys[max(lo, min(hi, round((xm - 0.75) * 4) / 4.0))]) / 1.5
            off = ((1 if sl < 0 else -1), 0) if abs(sl) > 1.0 else (0, 1)
            d.line([(xa + off[0], ya + off[1]), (xb + off[0], yb + off[1])], fill=K('o3'))
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]): d.line([(xa, ya), (xb, yb)], fill=K('o1'))
        L.flush()
        if train_at is not None:                                   # cars follow the track column by column
            rows = CAR if heading > 0 else [row[::-1] for row in CAR]
            w = len(rows[0]); h = len(rows)
            for c in range(cars):
                x0 = train_at - heading * c * 9 - w // 2
                for i in range(w):
                    yb = yi(x0 + i) - 2
                    for j in range(h):
                        ch = rows[j][i]
                        if ch in '. ': continue
                        P(x0 + i, yb - h + 1 + j, {'o': 'i2', 'K': ['k0', 'k2', 'k0'][c % 3], 'R': body, 'Y': 'o0'}[ch])
        return yi
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



# ================================================================ more ground
def knoll(top, x1):
    """A grassy knoll in the front at the left (the desktop menu stands on it): a dome from the left edge whose right
    slope runs down to the bottom row at column x1. top(x) = its contour. A 1-pixel ink outline round it; light from
    the upper left: a band of the lightest grass under the contour where the slope faces up or left, the body in the
    lawn colour, a shade band of darker grass along the right slope, so it stands apart from the lawn behind it."""
    L = Layer(); d = L.d
    cols = [(x, int(round(top(x)))) for x in range(0, x1)]
    for x, y in cols:
        if y < S.H: d.line([(x, y), (x, S.H - 1)], fill=K('g1'))
    prev = None
    for x, y in cols:                                              # lit band: 3 rows, where the contour is flat or rising
        if y >= S.H: break
        slope = 0 if prev is None else y - prev
        if slope <= 1:
            for j in range(3 if slope <= 0 else 2): L.P(x, y + j, 'g0')
        prev = y
    for y in range(min(c[1] for c in cols), S.H):                  # shade band along the right slope
        xr = max([x for x, yy in cols if yy <= y] or [0])
        if xr <= 0: continue
        for x in range(max(0, xr - 11), xr + 1):
            if top(x) + 3 <= y: L.P(x, y, 'g2')
        L.P(xr, y, 'g3')
    L.flush()


def domes(specs, bottom, body='s2', lit='s1', shade='s3', x0=0, x1=None):
    """Far hills as round domes (no outline: they are far): specs = [(cx, top, half width), ...]. A lit 1-pixel rim
    on the left side of each dome and a flat shade on its right third (light from the upper left)."""
    x1 = S.W if x1 is None else x1
    for x in range(max(0, x0), min(S.W, x1)):
        best = None
        for cx, tp, hw in specs:
            u = (x - cx) / hw
            if abs(u) >= 1: continue
            y = int(round(tp + (bottom - tp) * (1 - math.sqrt(1 - u * u))))
            if best is None or y < best[0]: best = (y, u, cx, tp, hw)
        if best is None: continue
        y, u, cx, tp, hw = best
        # the shade is a crescent on the right: outside a lit core dome that is a little narrower and further left
        kc, kw = cx - 0.22 * hw, 0.84 * hw
        for yy in range(y, bottom + 1):
            v = (x - kc) / kw
            core = abs(v) < 1 and yy >= tp + (bottom - tp) * (1 - math.sqrt(1 - v * v))
            S.px[x, yy] = K(body if core else shade)
        if u < -0.05: P(x, y, lit)


def lake_side(xl, yfar, ynear, x1, seed=7):
    """A lake seen from the side, on the Chill side of the phone scene: water from the far bank (row yfar) down to the
    near bank (row ynear); its left shore runs along xl(y). A pale line at the far bank, a darker line at the near bank,
    a grass edge at the left shore, short ripples in calm rows."""
    for y in range(yfar, ynear + 1):
        xa = int(round(xl(y)))
        S.d.line([(xa, y), (x1, y)], fill=K('a1')); P(xa - 1, y, 'g3')
    S.d.line([(int(round(xl(yfar))), yfar), (x1, yfar)], fill=K('a0'))
    S.d.line([(int(round(xl(ynear))), ynear), (x1, ynear)], fill=K('a2'))
    r = random.Random(seed); done = []
    for _ in range(600):
        y = r.randint(yfar + 3, ynear - 3); x = r.randint(int(xl(y)) + 3, x1 - 8); n = r.randint(3, 7)
        if any(abs(y - b) < 4 and abs(x - a) < 16 for a, b in done): continue
        done.append((x, y)); S.d.line([(x, y), (x + n - 1, y)], fill=K('a0' if len(done) % 3 else 'a2'))
        if len(done) > (x1 - xl(ynear)) * (ynear - yfar) // 150: break


def jetty(x0, x1, y):
    """A wooden landing stage at the end of a path, out over the water: planks (2 rows) and two posts."""
    L = Layer(); d = L.d
    d.rectangle([x0, y, x1, y + 2], fill=K('w0')); d.line([(x0, y + 2), (x1, y + 2)], fill=K('w1'))
    for x in range(x0 + 4, x1, 4): d.point([(x, y + 1)], fill=K('w1'))
    for x in (x0 + 6, x1 - 2): d.rectangle([x, y + 3, x + 1, y + 6], fill=K('w2'))
    L.flush()


def lake_band(x0, x1, y0, y1, seed=7):
    """A lake seen from the side: a band of water from the far bank (y0) to the near bank (y1); a pale line at the far
    bank, a darker line at the near bank, a few short ripples."""
    S.d.rectangle([x0, y0, x1, y1], fill=K('a1'))
    S.d.line([(x0, y0), (x1, y0)], fill=K('a0')); S.d.line([(x0, y1), (x1, y1)], fill=K('a2'))
    r = random.Random(seed); done = []
    for _ in range(400):
        x, y = r.randint(x0 + 3, x1 - 10), r.randint(y0 + 3, y1 - 3); n = r.randint(3, 7)
        if any(abs(y - b) < 3 and abs(x - a) < 18 for a, b in done): continue
        done.append((x, y)); S.d.line([(x, y), (x + n - 1, y)], fill=K('a0' if len(done) % 3 else 'a2'))
        if len(done) > (x1 - x0) // 9: break


def flowerbed(x, y, w):
    """A low bed seen from the side: soil, a row of leaves, flowers of three colours."""
    L = Layer(); d = L.d
    d.rectangle([x, y - 1, x + w, y], fill=K('w2')); d.rectangle([x, y - 4, x + w, y - 2], fill=K('l2')); d.line([(x, y - 2), (x + w, y - 2)], fill=K('l3'))
    for i in range(1, w - 1, 4):
        d.rectangle([x + i, y - 6, x + i + 1, y - 5], fill=K(['p1', 'c0', 'o1'][(i // 4) % 3]))
    L.flush()


def flat_path(x0, x1, y0, y1):
    """A flat side-view path: a band of sand with a light top edge, a dark lower edge and joints."""
    S.d.rectangle([x0, y0, x1, y1], fill=K('s1'))
    S.d.line([(x0, y0), (x1, y0)], fill=K('s0')); S.d.line([(x0, y1), (x1, y1)], fill=K('s3'))
    for x in range(x0, x1):
        if x % 16 == 5: S.d.line([(x, y0 + 1), (x, y1 - 1)], fill=K('s2'))


# ================================================================ the two scenes
WARM_D = [(20, 'o1'), (46, 'o0'), (84, 's1')]
COOL_D = [(52, 't1'), (100, 'a0'), (150, 't0')]
WARM_P = [(14, 'o1'), (28, 'o0'), (46, 's1')]
COOL_P = [(38, 't1'), (74, 'a0'), (112, 't0')]


def dome_top(specs, bottom):
    """The contour y(x) of a row of round domes (as domes() draws them); None where no dome stands."""
    def f(x):
        best = None
        for cx, tp, hw in specs:
            u = (x - cx) / hw
            if abs(u) < 1:
                y = tp + (bottom - tp) * (1 - math.sqrt(1 - u * u))
                best = y if best is None else min(best, y)
        return best
    return f


def scene_wide():
    """960 x 400, the desktop scene. GY = 284 (ride ground), promenade rows 288..300, ride tops at row 134.
    Columns 0..250: the knoll in front (the menu stands on it). Columns 168..492: the skyline. 400..960: the lake.
    Window edges at 2x fall on columns 512 (1024 px), 640 (1280 px), 683 (1366 px), at 3x on 56..696 (1920 px):
    no object is cut there."""
    global S
    S = Scene(960, 400); GY = 284; M = 959
    sun = (246, 176)
    sky(sun, (1.5, 1.15), WARM_D, (590, 292), (2.0, 1.9), COOL_D, 's0', GY - 6, ring=12)
    sun_disc(*sun, 13)
    cloud(70, 196, 52, 'c0', 's1'); cloud(330, 140, 60, 'c0', 's1'); cloud(560, 150, 56, 'c0', 's1'); cloud(800, 168, 70, 'c0', 't0')
    birds([(300, 196), (310, 202), (321, 194)])
    balloon(84, 150, 13, 'o1', 'c0', 'o3', 'c2'); balloon(616, 168, 12, 't1', 'c0', 't3', 'c2')
    # far hills: round sand domes on the Thrill side, green in the middle, cool wooded hills on the Chill side
    teal = [(470, 238, 70), (575, 226, 78), (690, 240, 64), (800, 228, 84), (922, 240, 70)]
    cool = dome_top(teal, GY - 4)
    green = lambda x: 268 - 8 * math.sin(x / 44.0 + 2.2) - 3 * math.sin(x / 17.0) + max(0, 362 - x) ** 2 * 0.012
    domes(teal, GY - 4, body='t2', lit='t1', shade='t3', x0=380)
    domes([(150, 240, 66), (246, 248, 58), (330, 256, 50)], GY - 4)
    hill(330, 960, green, 'l2', GY - 4, 'l1')
    r = random.Random(11)
    x = 330
    while x < 960:
        mini_pine(x, int(green(x)) + 2, 'l3', 'l4', r.choice([6, 7, 8])); x += r.choice([6, 9, 9, 12, 17])
    x = 430
    while x < 960:
        y = cool(x)
        if y is not None and y < GY - 12: mini_pine(x, int(y) + 3, 't3', 't3', r.choice([5, 6, 7]))
        x += r.choice([5, 6, 8, 13, 19])
    forest(166, 330, lambda x: 272 - 3 * math.sin(x / 23.0), 'o1', 'o2', 'o3', GY - 4, 4)
    # ground: the back lawn of the rides, the promenade, the front lawn
    S.d.rectangle([0, GY - 4, M, 399], fill=K('g1')); S.d.rectangle([0, GY - 4, M, GY + 1], fill=K('g2'))
    promenade(GY + 4, GY + 16)
    # the skyline, from the back to the front
    coaster([(168, GY - 8, 0.12), (212, GY - 108, 0.3), (238, GY - 8, 0.3), (256, GY - 44, 0.4), (270, GY - 10, 0.4), (278, GY - 10, 0.3)], GY,
            wood=('w1', 'w2', 'w1'), train_at=217, heading=1, cars=2)
    tower(296, GY, 128, rw=14)
    carousel(350, GY, 60, 54)
    wheel(441, GY, 48)
    stall(536, GY + 3, ('t1', 't3'), CUP, {'o': 'i2', 'T': 't1', 'W': 'c0'})
    stall(666, GY + 3, ('o1', 'o3'))
    for x, s_ in ((566, 1), (612, 2), (746, 3), (790, 4), (900, 5)): tree_round(x, GY + 1, s_, R=8)
    for x, s_ in ((588, 1), (818, 3), (844, 4), (930, 6)): tree_pine(x, GY + 1, s_)
    fence(150, 960, GY + 3, gaps=[(326, 376), (420, 466)])
    for x in (184, 316, 392, 494, 580, 710, 860): lamp(x, GY + 4)
    crowd(250, 950, GY + 10, GY + 15, 24, 21, skip=((505, 519), (634, 646), (677, 702)))
    # the front: lake on the Chill side, lawn with autumn trees on the Thrill side
    shore = lambda x: None if x < 404 else (316 if x >= 452 else 316 + (452 - x) ** 2 * 0.03)
    lake(shore, 404, 960)
    tufts(170, 304, 404, 400, 5, taken=lambda x, y: 349 <= y <= 361)
    pier(530, 315); stamp(BOAT, 470, 366, {'o': 'i2', 'W': 'c0', 'R': 'o2'}); stamp(BOAT, 610, 372, {'o': 'i2', 'W': 'c0', 'R': 't2'})
    stamp(BOAT, 760, 352, {'o': 'i2', 'W': 'c0', 'R': 'p1'})
    guest(536, 320, 91); guest(541, 318, 92)
    for x, h in ((470, 4), (473, 6), (476, 5), (566, 5), (569, 7), (572, 4), (700, 6), (703, 4), (880, 5), (883, 7)):
        S.d.line([(x, 318 - h), (x, 318)], fill=K('l3')); P(x, 317 - h, 'w1')
    # a flat side-view path across the lawn from the knoll to the lake, ending on a landing stage over the water
    PY0, PY1 = 352, 358
    for y in range(PY0, PY1 + 1):
        xe = int(452 - math.sqrt(max(0.0, (y - 316) / 0.03)))           # the shore on this row
        S.d.line([(150, y), (xe + 1, y)], fill=K('s1'))
    S.d.line([(150, PY0), (417, PY0)], fill=K('s0')); S.d.line([(150, PY1), (417, PY1)], fill=K('s3'))
    for x in range(150, 414):
        if x % 16 == 5: S.d.line([(x, PY0 + 1), (x, PY1 - 1)], fill=K('s2'))
    jetty(412, 440, PY0 + 1)
    stamp(BOAT, 448, 362, {'o': 'i2', 'W': 'c0', 'R': 'b1'})
    flowerbed(284, 320, 22); flowerbed(330, 320, 30)
    # one autumn tree on the lawn, right of the columns the open panel covers (166..386 at 2x), so it is never cut
    ground_shadow(404, 420, 344, 'g2')
    tree_round(412, 344, 5, ('o0', 'o1', 'o2', 'o4'), R=11, trunk=11)
    stamp(BENCH, 330, 352, {'o': 'i2', 'W': 'w0', 'w': 'w1'})
    for n, x in enumerate((262, 268, 380)): guest(x, 357, 60 + n)
    # the knoll at the left, in front of everything behind it: a dome, its right slope reaches the bottom at column 250
    kt = lambda x: 230 + 0.8 * math.sin(x / 15.0) if x < 70 else 230 + ((x - 70) / 180.0) ** 2 * 172
    knoll(kt, 251)
    tufts(0, 240, 236, 400, 9, gap=12, taken=lambda x, y: y < kt(x) + 5 or x > 70 + 180 * math.sqrt(max(0, y - 230) / 172.0) - 14)
    for x, s_, R, t in ((24, 7, 10, 10), (118, 8, 9, 9)): tree_round(x, int(kt(x)) + 2, s_, ('o0', 'o1', 'o2', 'o4'), R=R, trunk=t)
    tree_pine(46, int(kt(46)) + 2, 9)
    stamp(BENCH, 72, 231, {'o': 'i2', 'W': 'w0', 'w': 'w1'})      # on the flat crest, not on the slope
    guest(82, 231, 71); guest(86, 232, 72)
    return S.im


def scene_tall():
    """450 x 470, the phone scene. GY = 300; promenade rows 304..314; ride tops (the tower's flag) at row 194; lawn
    315..469. Columns 139..305 hold the whole skyline, inside the 187 art px (131..318) that a 375 px phone sees at 2x;
    the rides stand apart: tower 139..153, coaster 155..221, carousel 225..259, wheel 269..307 (on the far bank of the
    lake). Window edges: 131 / 127 / 122 (375 / 390 / 412 px at 2x) and 97 (768 px at 3x) at the left, 318 / 322 /
    328 / 353 at the right: no object crosses them."""
    global S
    S = Scene(450, 470); GY = 300; M = 449; HB = GY - 14
    sun = (202, 196)
    sky(sun, (1.3, 1.45), WARM_P, (318, 252), (1.2, 2.3), COOL_P, 's0', HB, ring=10)
    sun_disc(*sun, 10)
    cloud(318, 150, 34, 'c0', 'a0'); cloud(252, 214, 26, 'c0', 't0'); cloud(96, 226, 30, 'c0', 's1')
    birds([(160, 176), (169, 181)])
    # far hills: sand domes on the Thrill side, round teal domes with small pines on the Chill side
    teal = [(292, 248, 46), (362, 238, 58), (436, 250, 52)]
    domes(teal, HB, body='t2', lit='t1', shade='t3', x0=238)
    tt = dome_top(teal, HB); r = random.Random(11); x = 252
    while x < 450:
        y = tt(x)
        if y is not None and y < HB - 6: mini_pine(x, int(y) + 3, 't3', 't3', r.choice([5, 6, 7]))
        x += r.choice([5, 6, 8, 11, 15])
    domes([(120, 258, 40), (196, 264, 36)], HB, x0=0, x1=238)
    forest(-6, 238, lambda x: 274 - 2 * math.sin(x / 17.0), 'o1', 'o2', 'o3', HB, 4, 3, 4)
    S.d.rectangle([0, HB, M, 469], fill=K('g1')); S.d.rectangle([0, HB, M, GY - 11], fill=K('g2'))
    # the far bank of the lake (the wheel stands on it) and the lake from there down to the promenade
    FB = GY - 30
    S.d.rectangle([256, FB - 3, M, FB], fill=K('g2')); S.d.line([(256, FB - 3), (M, FB - 3)], fill=K('g1'))
    xl = lambda y: 276 - (y - FB) * 0.22                      # the left shore: one even slant down to the left
    lake_side(xl, FB + 1, GY + 1, M)
    for x, h in ((272, 4), (274, 6), (276, 5), (316, 5), (318, 3), (362, 6), (365, 4)):
        S.d.line([(x, GY - 1 - h), (x, GY - 1)], fill=K('l3')); P(x, GY - 2 - h, 'w1')
    stamp(BOAT, 296, FB + 15, {'o': 'i2', 'W': 'c0', 'R': 'p1'})
    pier(330, GY - 8, w=10, n=5)
    promenade(GY + 4, GY + 14)
    coaster([(155, GY - 6, 0.12), (182, GY - 58, 0.45), (199, GY - 8, 0.45), (210, GY - 28, 0.5), (221, GY - 8, 0.5)], GY,
            post=6, level=9, wood=("w1", "w2", "w1"), train_at=181, heading=1, cars=1, clean=True)
    tower(146, GY, 84, rw=8)
    carousel(242, GY, 28, 36)
    wheel(288, FB, 19, booth=False)
    tree_pine(110, GY - 10, 1)
    for x, s_ in ((384, 2), (414, 5)): tree_pine(x, FB - 1, s_)
    tree_round(60, GY - 10, 3, ('o0', 'o1', 'o2', 'o4'), R=8)
    fence(0, 450, GY + 3, gaps=[(226, 258)])
    for x in (226, 310): lamp(x, GY + 4)
    crowd(142, 304, GY + 10, GY + 13, 7, 33)
    tufts(0, 318, 450, 470, 5)
    for x, s_ in ((109, 5), (340, 6)): tree_round(x, 352, s_, ('o0', 'o1', 'o2', 'o4'), R=8, trunk=9)
    flowerbed(64, 344, 24); flowerbed(370, 348, 24)
    return S.im


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: python3 tools/title-art/make.py OUT_DIR   (writes the four PNG files into OUT_DIR)')
    out_dir = os.path.abspath(sys.argv[1]); os.makedirs(out_dir, exist_ok=True)
    for name, make in (('scene-wide.png', scene_wide), ('scene-tall.png', scene_tall), ('logo-line.png', logo_line), ('logo-stack.png', logo_stack)):
        im = make()
        im.save(os.path.join(out_dir, name))
        print(name, '%d x %d' % im.size, count_colours(im), 'colours')
