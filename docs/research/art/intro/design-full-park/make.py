#!/usr/bin/env python3
"""Design A of the intro screen of "Thrills & Chills": THE WHOLE SCREEN IS THE PARK. Mock-up only, not game code.

Writes two pixel pictures into this folder (1 file pixel = 1 art pixel; intro.html shows both at 2x):
  park-desktop.png  640 x 400   the park in landscape: Thrill on the left, Chill on the right
  park-phone.png    195 x 422   the park in portrait: Thrill at the top, Chill below, the pond behind the menu
The isometric helpers and the rides are adapted from concepts/pixel3.py (the approved drafts): same palette ramps,
same 32 x 16 tile, same ink outline pass. The ground, the compositions, the tiny guests and the mirrored coaster are new.
"""
import math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'kit3'))
from PIL import Image, ImageDraw, ImageChops
from palette import c_table, INK, count_colours, reduce_colours

C = c_table()            # pixel3 keys, from 1: C['g1'] is the lightest grass
TZ = 20
W = H = OX = OY = 0      # set by begin()
frame = shadow = SD = None
items = []


def begin(w, h, ox, oy):
    """Starts a new picture of w x h art pixels; tile (0, 0) lands on the pixel (ox, oy)."""
    global W, H, OX, OY, frame, shadow, SD, items
    W, H, OX, OY = w, h, ox, oy
    frame = Image.new('RGB', (W, H), C['g2'])
    shadow = Image.new('L', (W, H), 0); SD = ImageDraw.Draw(shadow)
    items = []


def scr(x, y, z=0): return (int(round(OX + (x - y) * 16)), int(round(OY + (x + y) * 8 - z)))
def tile(sx, sy):
    """The tile position under a pixel (the inverse of scr at z = 0)."""
    a = (sx - OX) / 16.0; b = (sy - OY) / 8.0
    return ((a + b) / 2, (b - a) / 2)
def h3(a, b, c=0):
    n = (a * 374761393 + b * 668265263 + c * 2147483647) & 0xffffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535.0
def vnoise(x, y):
    xi, yi = math.floor(x), math.floor(y); fx, fy = x - xi, y - yi
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = h3(xi, yi), h3(xi + 1, yi), h3(xi, yi + 1), h3(xi + 1, yi + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
def inside(x, y): return 0 <= x < W and 0 <= y < H


# ---------------------------------------------------------------- ground
class Map:
    """The ground of one scene, in tile units: path tiles, round plazas, ponds (unions of circles), lawns."""
    def __init__(self):
        self.paths = set(); self.plazas = []; self.ponds = []; self.gardens = []; self.tracks = []; self.lawns = []
        self.cool = lambda x, y: False       # where the lawn is the fresh green of the Chill side
    def path(self, x0, y0, x1, y1):
        for tx in range(min(x0, x1), max(x0, x1) + 1):
            for ty in range(min(y0, y1), max(y0, y1) + 1): self.paths.add((tx, ty))
    def pond_d(self, x, y):
        best = 9.0; n = (0.0, 0.0)
        for cx, cy, r in self.ponds:
            dx, dy = x - cx, y - cy; dd = math.hypot(dx, dy)
            if dd - r < best: best = dd - r; n = (dx / (dd or 1), dy / (dd or 1))
        return best, n
    def plaza_d(self, x, y):
        best = 9.0
        for cx, cy, r in self.plazas: best = min(best, math.hypot(x - cx, y - cy) - r)
        return best
    def kind(self, x, y):
        if self.ponds and self.pond_d(x, y)[0] < 0: return 'water'
        if self.plazas and self.plaza_d(x, y) < 0: return 'plaza'
        if (math.floor(x), math.floor(y)) in self.paths: return 'path'
        if self.gardens and self.garden(x, y): return 'garden'
        if self.tracks:
            d, ang, w = self.track_d(x, y)
            if d < w / 2: return 'track'
        return 'grass'
    def track_d(self, x, y):
        """Distance from the middle line of a kart track (a stadium shape that lies along the screen), and an angle around it."""
        best = (9.0, 0.0, 0.0)
        for cx, cy, h, r, w in self.tracks:
            t = max(-h, min(h, ((x - cx) - (y - cy)) / 2)); px_, py_ = cx + t, cy - t
            d = abs(math.hypot(x - px_, y - py_) - r)
            if d < best[0]: best = (d, math.atan2((y - cy) + (x - cx), (x - cx) - (y - cy)), w)
        return best
    def lawn(self, x, y):
        for cx, cy, r in self.lawns:
            d = math.hypot(x - cx, y - cy)
            if d < r: return r - d
        return None
    def garden(self, x, y):
        for cx, cy, r in self.gardens:
            dd = math.hypot(x - cx, y - cy) / r
            if dd < 1: return (cx, cy, r, dd)
        return None


def ground(M):
    px = frame.load()
    for sy in range(H):
        for sx in range(W):
            x, y = tile(sx + 0.5, sy + 0.5)
            k = M.kind(x, y)
            if k == 'grass':
                # Three flat tones in soft patches; one checker row where two tones meet.
                n = vnoise(x * 0.36 + 3.1, y * 0.36 + 1.7) * 0.72 + vnoise(x * 1.3 + 7, y * 1.3 + 3) * 0.28
                chk = 0.012 if (sx + sy) % 2 else -0.012
                v = n + chk
                col = (C['l1'] if M.cool(x, y) else C['g1']) if v < 0.36 else C['g2'] if v < 0.6 else C['g3']
                if M.lawns:
                    e = M.lawn(x, y)
                    if e is not None: col = C['l2'] if e < 0.14 else C['l1']
                if M.ponds:
                    d, _ = M.pond_d(x, y)
                    if d < 0.1: col = C['s4']
                    elif d < 0.22: col = C['g4']
            elif k == 'garden':
                # A round flower bed in two halves: warm flowers on the Thrill side, cool flowers on the Chill side.
                cx, cy, r, dd = M.garden(x, y); cool = (x - y) > (cx - cy); dot = (sx % 4 == 0 and sy % 4 == 0) or (sx % 4 == 2 and sy % 4 == 2)
                if dd > 0.86: col = C['l4'] if (x + y) > (cx + cy) and dd > 0.93 else C['l3']
                elif abs((x - y) - (cx - cy)) < 0.13: col = C['s1']
                elif dd > 0.52: col = (C['c1'] if dot else C['b2']) if cool else (C['o1'] if dot else C['o3'])
                elif dd > 0.3: col = C['l2'] if dot else C['l1']
                else: col = (C['b1'] if dot else C['c1']) if cool else (C['o3'] if dot else C['o1'])
            elif k == 'track':
                d, ang, w = M.track_d(x, y)
                col = C['c4']
                if d > w / 2 - 0.1: col = C['o4'] if int(math.floor(ang * 16 / math.pi)) % 2 == 0 else C['c1']
                elif d < 0.04 and int(math.floor(ang * 32 / math.pi)) % 2 == 0: col = C['c2']
            elif k == 'water':
                d, nrm = M.pond_d(x, y)
                col = C['a2']
                if h3(sx // 5, sy, 11) < 0.06 and sy % 2 == 0: col = C['a1']
                elif h3((sx + 2) // 6, sy, 23) < 0.05 and sy % 2 == 1: col = C['a3']
                if d > -0.2:
                    up = -(nrm[0] + nrm[1])              # > 0: the bank lies above this pixel on the screen
                    if up > 0.25: col = C['a4'] if d > -0.12 else C['a3']
                    elif up < -0.25 and d > -0.08: col = C['a1']
            else:
                fx, fy = x - math.floor(x), y - math.floor(y)
                joint = (fx * 2) % 1 < 0.13 or (fy * 2) % 1 < 0.13
                if k == 'plaza':
                    col = C['c1'] if (int(math.floor(x * 2)) + int(math.floor(y * 2))) % 2 == 0 else C['s1']
                    if joint: col = C['s2']
                    if M.plaza_d(x, y) > -0.12: col = C['s4']
                else:
                    r = h3(int(math.floor(x * 2)), int(math.floor(y * 2)), 5)
                    col = C['s1'] if r < 0.22 else C['s2']
                    if joint: col = C['s3']
                    for ex, ey in ((x - 0.11, y), (x + 0.11, y), (x, y - 0.11), (x, y + 0.11)):
                        if M.kind(ex, ey) in ('grass', 'water'): col = C['s4']; break
            px[sx, sy] = col


def P(x, y, col):
    if inside(x, y): frame.load()[x, y] = col


def details(M, seed, count, warm):
    """Planned small marks in the grass: tufts and flowers, never closer than 7 pixels to each other."""
    R = random.Random(seed); spots = []
    for _ in range(count * 12):
        if len(spots) >= count: break
        sx, sy = R.randint(3, W - 4), R.randint(5, H - 3); x, y = tile(sx, sy)
        if M.kind(x, y) != 'grass' or any(M.kind(x + dx, y + dy) != 'grass' for dx, dy in ((0.35, 0), (-0.35, 0), (0, 0.35), (0, -0.35))): continue
        if M.ponds and M.pond_d(x, y)[0] < 0.4: continue
        if any(abs(sx - a) + abs(sy - b) < 9 for a, b in spots): continue
        spots.append((sx, sy)); kind = R.random()
        if kind < 0.68:
            for dx, dy, c in [(-1, -1, 'g4'), (0, -2, 'g4'), (1, -1, 'g4'), (0, 0, 'g3')]: P(sx + dx, sy + dy, C[c])
        elif kind < 0.9:
            col = C[R.choice(['o1', 'o3', 'c1'] if warm(sx, sy) else ['c1', 'p2', 'b1'])]
            P(sx, sy - 1, col); P(sx, sy, C['l3'])
            if R.random() < 0.5: P(sx + 2, sy, col); P(sx + 2, sy + 1, C['l3'])
        else:
            P(sx, sy, C['c3']); P(sx + 1, sy, C['c4']); P(sx, sy - 1, C['c2'])


def meadow(M, seed, n, box, warm):
    """Small planned clusters of flowers in a calm stretch of grass (box = x0, y0, x1, y1 in pixels)."""
    R = random.Random(seed); done = []
    for _ in range(n * 30):
        if len(done) >= n: break
        cx, cy = R.randint(box[0], box[2]), R.randint(box[1], box[3])
        if any(abs(cx - a) < 26 and abs(cy - b) < 12 for a, b in done): continue
        if any(M.kind(*tile(cx + dx, cy + dy)) != 'grass' for dx, dy in ((-9, 0), (9, 0), (0, -5), (0, 5), (0, 0))): continue
        done.append((cx, cy)); cols = ['o1', 'o3', 'c1'] if warm(cx, cy) else ['c1', 'b1', 'p2']
        for k, (dx, dy) in enumerate([(-6, 0), (-3, -2), (0, 1), (3, -1), (6, 1), (-1, 3), (2, -3)]):
            P(cx + dx, cy + dy - 1, C[cols[k % 3]]); P(cx + dx, cy + dy, C['l3'])


# ---------------------------------------------------------------- shadows: one flat darker tone of the same ramp
def sh_ell(x, y, r, k=1.0):
    cx, cy = scr(x + r * 0.55 * k, y - r * 0.55 * k); rx, ry = int(r * 22.6 * (1 + 0.35 * k)), max(1, int(r * 11.3))
    SD.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
def sh_box(x, y, w, d, hpx):
    s = hpx / TZ * 0.75
    SD.polygon([scr(x, y + d), scr(x, y), scr(x + s, y - s), scr(x + w + s, y - s), scr(x + w + s, y + d - s), scr(x + w, y + d)], fill=255)
SHADE = {'g1': 'g3', 'g2': 'g4', 'g3': 'g4', 'g4': 'g5', 's1': 'c3', 's2': 'c3', 's3': 's4', 's4': 's5', 'c1': 'c3', 'c2': 'c3', 'c3': 'c4',
         'a1': 'a2', 'a2': 'a3', 'a3': 'a4', 'l1': 'l2', 'l2': 'l3', 'l3': 'l4', 'o1': 'o2', 'o3': 'o4', 'p2': 'p3', 'b1': 'b2'}
def apply_shadows():
    table = {C[a]: C[b] for a, b in SHADE.items()}
    px, sp = frame.load(), shadow.load()
    for sy in range(H):
        for sx in range(W):
            if sp[sx, sy]:
                c = px[sx, sy]
                if c in table: px[sx, sy] = table[c]


# ---------------------------------------------------------------- drawing helpers (from pixel3.py)
class Layer:
    """A transparent sheet. flush() pastes it into the frame with a 1-pixel ink outline around everything on it."""
    def __init__(self, outline=True):
        self.im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im); self.outline = outline
    def flush(self):
        a = self.im.getchannel('A')
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
    m2 = m.copy(); ImageDraw.Draw(m2).rectangle([-1, 0, max(-1, cx + int(rx * split)), H], fill=0)
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

def add(key, fn): items.append((key, fn))

LAMP = ['.ooo.', 'oYYYo', 'oYWYo', '.ooo.', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '..o..', '.ooo.']
BENCH = ['.oooooooooo.', 'oWWWWWWWWWWo', 'oooooooooooo', 'owwwwwwwwwwo', '.oooooooooo.', '..o......o..', '..o......o..']
SWAN = ['.....oo...', '....oWNo..', '.oooWWo...', 'oWWWWWWWo.', 'oCCCCCCCo.', '.ooooooo..']
BOAT = ['....o.....', '...oWo....', '...oWWo...', '.oooooooo.', 'oCCCCCCCCo', '.oooooooo.']
HORSE = ['.....oo.', '.ooooWWo', 'oWWWWWo.', 'oWSSWWo.', '.oWooWo.', '.oo..oo.']
GONDOLA = ['..o.o..', '.ooooo.', 'oRRRRRo', 'oWWoWWo', 'oCCCCCo', 'oCCCCCo', '.ooooo.']
CAR = ['.oooooo.', 'oKoKoKoo', 'oRRRRRRo', 'oRYYYYRo', '.oooooo.']
ICE = ['.ooo.', 'oPPPo', 'oPWPo', 'oPPPo', 'oCCCo', '.oCo.', '..o..']
BURGER = ['.ooooo.', 'oBBBBBo', 'oGGGGGo', 'oRRRRRo', 'oBBBBBo', '.ooooo.']
CUP = ['...o..', '..oo..', 'oooooo', 'oTTTTo', 'oTWTTo', '.oTTo.', '.oooo.']
SHIRTS = ['o4', 'o5', 't3', 'b2', 'p2', 'o3', 'b3', 't4', 'c1', 'l3']
HAIR = ['i3', 'w3', 'w4', 'o2', 'i3']
SKIN = ['k1', 'k1', 'k2', 'k3']


# ---------------------------------------------------------------- tiny guests: 2 pixels wide, 4 or 5 pixels high, no outline
def guest(x, y, n, balloon=None):
    r = random.Random(n * 7919 + 13); cx, cy = scr(x, y)
    kid = r.random() < 0.16
    hair, skin, shirt, legs = C[r.choice(HAIR)], C[r.choice(SKIN)], C[SHIRTS[n % len(SHIRTS)]], C[r.choice(['i2', 'i3', 'i2', 'w3'])]
    SD.rectangle([cx + 1, cy, cx + 3, cy], fill=255)
    def draw():
        top = cy - (4 if kid else 6)
        for dx in (0, 1):
            P(cx + dx, top, hair); P(cx + dx, top + 1, skin); P(cx + dx, top + 2, shirt); P(cx + dx, cy - 1, legs)
            if not kid: P(cx + dx, top + 3, shirt); P(cx + dx, top + 4, legs)
        if not kid: P(cx - 1, top + 2, shirt); P(cx + 2, top + 2, shirt)      # shoulders
        if balloon:
            bx, by = cx + 4, top - 4
            for dx, dy in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (0, 1)]: P(bx + dx, by + dy, C[balloon])
            P(bx - 1, by - 1, C['c1']); P(bx, by + 2, INK); P(bx - 1, by + 3, INK); P(bx - 1, by + 4, INK)
    add(x + y + 0.02, draw)

def lamp(x, y):
    cx, cy = scr(x, y)
    add(x + y, lambda: stamp(LAMP, cx, cy, {'o': INK, 'Y': C['o1'], 'W': C['c1']}))
def bench(x, y):
    cx, cy = scr(x, y); SD.rectangle([cx - 5, cy - 1, cx + 8, cy + 1], fill=255)
    add(x + y, lambda: stamp(BENCH, cx, cy, {'o': INK, 'W': C['w1'], 'w': C['w2']}))


# ---------------------------------------------------------------- plants
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
def tree_autumn(x, y, seed): tree_round(x, y, seed, ('o1', 'o2', 'o3', 'o5'))
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
def bush(x, y, seed=0, ramp=('l1', 'l3', 'l4')):
    def draw():
        L = Layer(); bx, by = scr(x, y)
        L.d.ellipse([bx - 5, by - 6, bx + 5, by], fill=C[ramp[2]]); L.d.ellipse([bx - 5, by - 6, bx + 3, by - 2], fill=C[ramp[1]]); L.d.point([(bx - 3, by - 5), (bx - 2, by - 5), (bx, by - 4)], fill=C[ramp[0]])
        L.flush()
    add(x + y, draw)
def flowerbed(x, y, cols=('p2', 'o1', 'c1', 'b1')):
    def draw():
        L = Layer(); pts = [scr(x, y), scr(x + 0.8, y), scr(x + 0.8, y + 0.8), scr(x, y + 0.8)]
        L.d.polygon(pts, fill=C['w3']); r = random.Random(int(x * 97 + y * 31))
        for k in range(16):
            px_, py_ = scr(x + 0.12 + r.random() * 0.56, y + 0.12 + r.random() * 0.56)
            L.d.point([(px_, py_)], fill=C[r.choice(cols)]); L.d.point([(px_, py_ + 1)], fill=C['l3'])
        L.flush()
    add(x + y + 0.5, draw)


# ---------------------------------------------------------------- buildings and rides
def stall(x, y, awn, icon, icmap):
    sh_box(x, y, 1, 1, 22)
    def draw():
        L = Layer(); ibox(L, x + 0.1, y + 0.1, 0.8, 0.8, 0, 13, C['c1'], C['c1'], C['c3']); d = L.d
        d.polygon([scr(x + 0.22, y + 0.9, 11), scr(x + 0.78, y + 0.9, 11), scr(x + 0.78, y + 0.9, 5), scr(x + 0.22, y + 0.9, 5)], fill=C['i2'])
        vx, vy = scr(x + 0.5, y + 0.9, 6); d.rectangle([vx - 1, vy - 4, vx, vy - 3], fill=C['k1']); d.rectangle([vx - 2, vy - 2, vx + 1, vy], fill=C[awn]); d.point([(vx - 1, vy - 5), (vx, vy - 5)], fill=C['w3'])
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
def stall_ice(x, y, awn='t3'): stall(x, y, awn, ICE, {'o': INK, 'P': C['p2'], 'W': C['c1'], 'C': C['w1']})
def stall_cup(x, y, awn='b2'): stall(x, y, awn, CUP, {'o': INK, 'T': C['t2'], 'W': C['c1']})
def stall_burger(x, y, awn='o2'): stall(x, y, awn, BURGER, {'o': INK, 'B': C['w1'], 'G': C['l2'], 'R': C['o5']})

def fountain(x, y):
    def draw():
        L = Layer(); icyl(L, x, y, 0.62, 0, 4, C['a1'], C['c2'], C['c4']); d = L.d
        cx, cy = scr(x, y, 4); rx, ry = 11, 5
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=C['a2']); d.arc([cx - rx, cy - ry, cx + rx, cy + ry], 180, 360, fill=C['a4'])
        d.rectangle([cx - 1, cy - 9, cx + 1, cy], fill=C['c2']); d.line([(cx + 1, cy - 9), (cx + 1, cy)], fill=C['c4']); d.ellipse([cx - 4, cy - 11, cx + 4, cy - 8], fill=C['c1'])
        L.flush()
        for dx, dy in [(0, -15), (0, -14), (-1, -13), (1, -13), (-2, -12), (2, -12), (-3, -10), (3, -10), (-4, -8), (4, -8), (-5, -5), (5, -5), (-6, -2), (6, -2), (0, -17), (-7, 1), (7, 1)]:
            P(cx + dx, cy + dy, C['c1'] if (dx + dy) % 2 == 0 else C['a1'])
    add(x + y + 0.3, draw)

def carousel(x, y):
    sh_ell(x, y, 1.75, 1.0)
    def draw():
        L = Layer(); d = L.d
        icyl(L, x, y, 1.62, 0, 3, C['c1'], C['c2'], C['c4']); icyl(L, x, y, 1.46, 3, 2, C['t1'], C['t2'], C['t4'])
        cx, cy = scr(x, y, 5); d.arc([cx - 27, cy - 13, cx + 27, cy + 13], 0, 360, fill=C['t2'])
        horses = sorted([(x + 1.06 * math.cos(t), y + 1.06 * math.sin(t), k) for k, t in enumerate([0.3 + k * math.pi / 4 for k in range(8)])], key=lambda h: h[0] + h[1])
        def horse(hx, hy, k):
            d.line([scr(hx, hy, 5), scr(hx, hy, 35)], fill=C['o1']); hx_, hy_ = scr(hx, hy, 8 + (k % 2) * 4)
            stamp(HORSE, hx_, hy_ + 1, {'o': INK, 'W': C['c1'] if k % 2 else C['o1'], 'S': C[['t3', 'b2', 'p2', 'b3'][k % 4]]}, L.im)
        for hx, hy, k in horses:
            if hx + hy < x + y: horse(hx, hy, k)
        icyl(L, x, y, 0.28, 5, 30, C['c1'], C['c1'], C['c3'])
        for z in (11, 19, 27, 33):
            bx_, by_ = scr(x, y, z); d.arc([bx_ - 6, by_ - 3, bx_ + 6, by_ + 3], 0, 180, fill=C['t3'])
        for hx, hy, k in horses:
            if hx + hy >= x + y: horse(hx, hy, k)
        L.flush()
        L = Layer(); d = L.d; icyl(L, x, y, 1.7, 35, 4, C['c1'], C['c1'], C['c2'])
        for k in range(24):
            t0, t1 = -math.pi / 4 + k * math.pi / 24, -math.pi / 4 + (k + 1) * math.pi / 24
            if k % 2 == 0: d.polygon([scr(x + 1.7 * math.cos(t0), y + 1.7 * math.sin(t0), 39), scr(x + 1.7 * math.cos(t1), y + 1.7 * math.sin(t1), 39), scr(x + 1.7 * math.cos(t1), y + 1.7 * math.sin(t1), 35), scr(x + 1.7 * math.cos(t0), y + 1.7 * math.sin(t0), 35)], fill=C['t3'] if k < 14 else C['t4'])
        icone(L, x, y, 1.74, 39, 17, [(C['t2'], C['t4']), (C['c1'], C['c3'])], 16, 0.2)
        ax, ay = scr(x, y, 56); d.rectangle([ax - 1, ay - 3, ax + 1, ay - 1], fill=C['o1']); d.line([(ax, ay - 9), (ax, ay - 4)], fill=C['w3']); d.polygon([(ax + 1, ay - 9), (ax + 6, ay - 7), (ax + 1, ay - 6)], fill=C['t3'])
        L.flush()
        for k in range(13):
            t = -math.pi / 4 + k * math.pi / 12; bx, by = scr(x + 1.72 * math.cos(t), y + 1.72 * math.sin(t), 36); P(bx, by, C['o1'])
    add(x + y + 1.2, draw)

def tower(x, y):
    sh_box(x - 0.7, y - 0.7, 1.4, 1.4, 8); bx_, by_ = scr(x, y); SD.rectangle([bx_, by_ - 2, bx_ + 112, by_ + 1], fill=255); SD.ellipse([bx_ + 52, by_ - 6, bx_ + 96, by_ + 5], fill=255)
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
    add(x + y + 0.9, draw)

def wheel(x, y):
    Rt, Rz, hz = 2.35, 47, 58
    sh_box(x - 1.6, y - 0.7, 3.2, 1.4, 6); sh_ell(x + 1.0, y - 1.0, 1.1, 1.2)
    def pt(t, f=1.0): return scr(x + Rt * f * math.cos(t), y, hz + Rz * f * math.sin(t))
    def draw():
        L = Layer(); ibox(L, x - 1.6, y - 0.7, 3.2, 1.4, 0, 3, C['c1'], C['c2'], C['c4'], C['c1'])
        ibox(L, x + 0.7, y + 0.1, 0.6, 0.5, 3, 9, C['t2'], C['c1'], C['c3']); ibox(L, x + 0.64, y + 0.04, 0.72, 0.62, 12, 2, C['t2'], C['t3'], C['t4'])
        L.d.line([scr(x - 1.15, y - 0.5, 3), scr(x, y - 0.2, hz)], fill=C['c3'], width=2); L.d.line([scr(x + 1.15, y - 0.5, 3), scr(x, y - 0.2, hz)], fill=C['c3'], width=2)
        L.flush()
        L = Layer(outline=False); hub = scr(x, y, hz)
        for k in range(12): L.d.line([hub, pt(k * math.pi / 6)], fill=C['c4'])
        L.d.line([pt(k * math.pi / 36, 0.8) for k in range(73)], fill=C['b3']); L.flush()
        L = Layer(); L.d.line([pt(k * math.pi / 48) for k in range(97)], fill=C['b2'], width=2)
        for k in range(24):
            if k % 2 == 0: L.d.point([pt(k * math.pi / 12)], fill=C['c1'])
        L.flush()
        for k in range(10):
            gx, gy = pt(0.16 + k * math.pi / 5); cols = [('t2', 't4'), ('b2', 'b3'), ('c1', 't3'), ('t3', 't4'), ('b1', 'b3')][k % 5]
            stamp(GONDOLA, gx, gy + 8, {'o': INK, 'R': C[cols[1]], 'W': C['c1'], 'C': C[cols[0]]})
        L = Layer(); L.d.line([scr(x - 1.15, y + 0.5, 3), scr(x, y + 0.2, hz)], fill=C['c1'], width=2); L.d.line([scr(x + 1.15, y + 0.5, 3), scr(x, y + 0.2, hz)], fill=C['c1'], width=2)
        hx, hy = hub; L.d.ellipse([hx - 3, hy - 3, hx + 3, hy + 3], fill=C['o1']); L.d.point([(hx - 1, hy - 1)], fill=C['c1']); L.flush()
    add(x + y + 0.75, draw)

def coaster(ax, ay, flip=False):
    """The wooden coaster of the drafts on a 5 x 5 tile footprint with its far corner at tile (ax, ay).
    flip mirrors it (tile x and y change places): the station then faces the lower right and the lift hill stands on the left."""
    def Wp(u, v): return (ax + v, ay + u) if flip else (ax + u, ay + v)
    def Bx(u, v, w, d): return (ax + v, ay + u, d, w) if flip else (ax + u, ay + v, w, d)
    cp0 = [(6.5, 10.5, 7), (8, 10.5, 7), (9.5, 10.5, 7), (10.35, 10.3, 8), (10.5, 9.5, 15), (10.5, 8, 38), (10.5, 6.8, 60), (10.3, 5.8, 68), (9.6, 5.5, 63), (8.8, 5.5, 30), (8.2, 5.5, 14), (7.4, 5.5, 38), (6.6, 5.5, 20), (5.9, 5.6, 12), (5.5, 6.3, 14), (5.5, 7.5, 27), (5.5, 8.7, 12), (5.5, 9.8, 8), (5.8, 10.4, 7)]
    cp = [Wp(x - 5.5, y - 5.5) + (z,) for x, y, z in cp0]
    N = len(cp); pts = []
    def cr(a, b, c, d, t): return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
    for i in range(N):
        for k in range(12):
            t = k / 12; a, b, c, d = cp[(i - 1) % N], cp[i], cp[(i + 1) % N], cp[(i + 2) % N]
            pts.append(tuple(cr(a[j], b[j], c[j], d[j], t) for j in range(3)))
    M = len(pts); sh_box(*Bx(0.5, 4.55, 4, 0.9), 26)
    for i in range(0, M, 4):
        p = pts[i]
        if p[2] > 10: q = scr(p[0] + p[2] / TZ * 0.7, p[1] - p[2] / TZ * 0.7); SD.ellipse([q[0] - 5, q[1] - 2, q[0] + 5, q[1] + 2], fill=255)
    def part(near):
        sel = [i for i in range(M) if ((pts[i][0] + pts[i][1]) >= ax + ay + 5.2) == near]
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
            L = Layer(); ibox(L, *Bx(0.5, 4.55, 4, 0.9), 0, 4, C['c1'], C['c2'], C['c4'], C['c1']); L.flush()
        L = Layer(); d = L.d; run = []
        for i in sel + [None]:
            if i is not None and (not run or i == run[-1] + 1): run.append(i); continue
            if len(run) > 1:
                line = [scr(*pts[j % M]) for j in run + [run[-1] + 1]]
                d.line([(p[0], p[1] + 1) for p in line], fill=C['o5']); d.line(line, fill=C['o4']); d.line([(p[0], p[1] - 1) for p in line], fill=C['o2'])
            run = [i] if i is not None else []
        L.flush()
        for i in sel:
            if i % 3 == 0: sx_, sy_ = scr(*pts[i]); P(sx_, sy_, C['o6'])
    def train(start, n, body):
        def draw():
            for c in range(n):
                p = pts[(start + c * 5) % M]; sx_, sy_ = scr(p[0], p[1], p[2])
                stamp(CAR, sx_, sy_ - 1, {'o': INK, 'K': C[['k1', 'k2', 'k3'][c % 3]], 'R': C[body], 'Y': C['o1']})
        return draw
    base = ax + ay
    add(base + 2.0, lambda: part(False)); add(base + 4.5, train(8 * 12 + 2, 3, 'o5'))
    def near():
        part(True); train(5 * 12 + 2, 3, 'c1')(); train(1 * 12, 3, 'o5')()
        L = Layer(); d = L.d
        for u, v in [(0.62, 4.6), (4.38, 4.6), (0.62, 5.42), (4.38, 5.42)]:
            px_, py_ = Wp(u, v); d.line([scr(px_, py_, 4), scr(px_, py_, 24)], fill=C['c1'], width=2)
        ibox(L, *Bx(0.45, 4.45, 4.1, 1.1), 24, 3, C['o2'], C['o3'], C['o5'], C['o1'])
        for k in range(8):
            u0, u1 = 0.45 + 4.1 * (k * 2) / 16, 0.45 + 4.1 * (k * 2 + 1) / 16
            d.polygon([scr(*Wp(u0, 4.45), 27), scr(*Wp(u1, 4.45), 27), scr(*Wp(u1, 5.55), 27), scr(*Wp(u0, 5.55), 27)], fill=C['c1'])
        ibox(L, *Bx(1.8, 5.25, 1.4, 0.1), 27, 8, C['o4'], C['o4'], C['o5'], C['o2'])
        for k in range(5): sx_, sy_ = scr(*Wp(1.95 + k * 0.27, 5.36), 31); d.rectangle([sx_ - 1, sy_ - 1, sx_, sy_ + 1], fill=C['c1'])
        L.flush()
    add(base + 7.9, near)

def ship(x, y, swing=0.5):
    """A swinging ship. It swings in the plane along tile y and shows its side to the lower right."""
    hz, Rz, Rt = 54, 43, 2.2
    sh_box(x - 0.75, y - 2.0, 1.5, 4.0, 6); sh_ell(x + 1.4, y - 1.2, 1.2, 1.2)
    def pt(a, f=1.0): return scr(x, y + Rt * f * math.sin(a), hz - Rz * f * math.cos(a))
    def draw():
        L = Layer(); ibox(L, x - 0.75, y - 2.0, 1.5, 4.0, 0, 3, C['c1'], C['c2'], C['c4'], C['c1']); L.flush()
        L = Layer(outline=False)                                                      # the far frame: thin, no outline
        L.d.line([scr(x - 0.5, y - 1.6, 3), scr(x - 0.3, y, hz)], fill=C['c4']); L.d.line([scr(x - 0.5, y + 1.6, 3), scr(x - 0.3, y, hz)], fill=C['c4']); L.flush()
        L = Layer(); d = L.d; a0, a1 = swing - 0.78, swing + 0.78; n = 24
        keel = [pt(a0 + (a1 - a0) * k / n) for k in range(n + 1)]
        deck = [pt(a0 + (a1 - a0) * k / n, 0.76) for k in range(2, n - 1)]
        d.line([scr(x, y, hz), pt(swing - 0.22, 0.78)], fill=C['c1'], width=2); d.line([scr(x, y, hz), pt(swing + 0.22, 0.78)], fill=C['c1'], width=2)
        d.polygon(keel + deck[::-1], fill=C['o4'])                                   # the hull: a crescent with raised ends
        d.polygon([pt(a0 + (a1 - a0) * k / n, 0.92) for k in range(1, n)] + deck[::-1], fill=C['o2'])
        d.line([pt(a0 + (a1 - a0) * k / n, 0.85) for k in range(2, n - 1)], fill=C['c1'], width=2)    # a cream stripe
        d.line(keel, fill=C['o5'])
        for k in range(7):
            hx, hy = deck[2 + k * (len(deck) - 5) // 6]
            d.rectangle([hx, hy - 2, hx + 1, hy - 1], fill=C[['k1', 'k2', 'k3'][k % 3]]); d.point([(hx, hy - 3), (hx + 1, hy - 3)], fill=C[['w3', 'i3', 'o2'][k % 3]])
        L.flush()
        L = Layer(); d = L.d
        d.line([scr(x + 0.5, y - 1.6, 3), scr(x + 0.3, y, hz)], fill=C['c1'], width=2); d.line([scr(x + 0.5, y + 1.6, 3), scr(x + 0.3, y, hz)], fill=C['c1'], width=2)
        hx, hy = scr(x + 0.3, y, hz); d.ellipse([hx - 3, hy - 3, hx + 3, hy + 3], fill=C['o1']); d.point([(hx - 1, hy - 1)], fill=C['c1'])
        L.flush()
    add(x + y + 0.75, draw)

KART = ['.ooooo.', 'oRRRRRo', 'oRhhRRo', 'oRRRRRo', '.ooooo.']
def kart(x, y, body):
    cx, cy = scr(x, y); SD.rectangle([cx - 1, cy + 1, cx + 5, cy + 1], fill=255)
    add(x + y, lambda: stamp(KART, cx, cy, {'o': INK, 'R': C[body], 'h': C['c1']}))
def pennant(x, y, col='o4', h=15):
    """A thin pole with a small flag."""
    def draw():
        L = Layer(); d = L.d; bx, by = scr(x, y)
        d.line([(bx, by), (bx, by - h)], fill=C['w3']); d.polygon([(bx + 1, by - h), (bx + 6, by - h + 2), (bx + 1, by - h + 4)], fill=C[col])
        L.flush()
    add(x + y, draw)
def gate(a, b):
    """A start gate over the kart track: two striped posts and a chequered banner."""
    def draw():
        L = Layer(); d = L.d; p0, p1 = scr(*a), scr(*b)
        for px_, py_ in (p0, p1):
            for yy in range(py_ - 15, py_ + 1): d.point([(px_, yy), (px_ + 1, yy)], fill=C['o4'] if ((py_ - yy) // 3) % 2 else C['c1'])
        for xx in range(p0[0], p1[0] + 2):
            for yy in range(p0[1] - 19, p0[1] - 14): d.point([(xx, yy)], fill=C['c1'] if ((xx - p0[0]) // 2 + (yy - p0[1])) % 2 else C['i3'])
        L.flush()
    add(max(a[0] + a[1], b[0] + b[1]) + 0.3, draw)

def gazebo(x, y, roof=('b2', 'b3')):
    """A small round pavilion with a striped cone roof."""
    sh_ell(x, y, 1.05, 1.1)
    def draw():
        L = Layer(); d = L.d
        icyl(L, x, y, 0.98, 0, 2, C['s1'], C['c2'], C['c4'])
        fx_, fy_ = scr(x, y, 2); d.ellipse([fx_ - 15, fy_ - 7, fx_ + 15, fy_ + 7], fill=C['s2']); d.ellipse([fx_ - 12, fy_ - 6, fx_ + 12, fy_ + 6], fill=C['s1'])
        posts = sorted([(x + 0.82 * math.cos(t), y + 0.82 * math.sin(t)) for t in [0.4 + k * math.pi / 3 for k in range(6)]], key=lambda p: p[0] + p[1])
        for px_, py_ in posts[:3]: d.line([scr(px_, py_, 2), scr(px_, py_, 26)], fill=C['c3'])
        d.rectangle([fx_ - 4, fy_ - 4, fx_ + 4, fy_ - 3], fill=C['w1']); d.line([(fx_ - 4, fy_ - 2), (fx_ + 4, fy_ - 2)], fill=C['w2']); d.point([(fx_ - 3, fy_ - 1), (fx_ + 3, fy_ - 1)], fill=C['w3'])
        L.flush()
        L = Layer(); d = L.d; icyl(L, x, y, 1.04, 25, 3, C['c1'], C['c3'], C['c4'], split=-1.1)
        icone(L, x, y, 1.1, 28, 13, [(C[roof[0]], C[roof[1]]), (C['c1'], C['c3'])], 12, 0.2)
        ax, ay = scr(x, y, 41); d.rectangle([ax - 1, ay - 3, ax + 1, ay - 1], fill=C['o1'])
        for px_, py_ in posts[3:]: d.line([scr(px_, py_, 2), scr(px_, py_, 27)], fill=C['c1'], width=2)
        L.flush()
    add(x + y + 0.9, draw)

def swan(x, y, col):
    cx, cy = scr(x, y); add(x + y, lambda: stamp(SWAN, cx, cy, {'o': INK, 'W': C['c1'], 'N': C['o3'], 'C': C[col]}))
def boat(x, y, col):
    cx, cy = scr(x, y); add(x + y, lambda: stamp(BOAT, cx, cy, {'o': INK, 'W': C['c1'], 'C': C[col]}))
def lily(x, y, flower):
    cx, cy = scr(x, y)
    def draw():
        for dx, dy in [(0, 0), (1, 0), (2, 0), (-1, 0), (0, -1), (1, -1), (0, 1), (1, 1)]: P(cx + dx, cy + dy, C['l2'] if dy < 1 else C['l3'])
        if flower: P(cx, cy - 1, C['p2']); P(cx + 1, cy - 1, C['c1'])
    add(x + y - 0.4, draw)
def pole(x, y, stripe='o4'):
    def draw():
        L = Layer(); p0, p1 = scr(x, y), scr(x, y, 26)
        for yy in range(p1[1], p0[1] + 1): L.d.point([(p0[0], yy), (p0[0] + 1, yy)], fill=C[stripe] if ((yy - p1[1]) // 3) % 2 else C['c1'])
        L.d.rectangle([p1[0] - 1, p1[1] - 3, p1[0] + 2, p1[1] - 1], fill=C['o1']); L.flush()
    add(x + y + 0.01, draw)
def bunting(a, b, key, cols=('o4', 'o1', 't3', 'c1', 'b2')):
    def draw():
        p0, p1 = scr(a[0], a[1], 25), scr(b[0], b[1], 25); n = max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))
        for k in range(n + 1):
            t = k / n; X = int(round(p0[0] + (p1[0] - p0[0]) * t)); Y = int(round(p0[1] + (p1[1] - p0[1]) * t + 5 * math.sin(math.pi * t)))
            P(X, Y, C['i2'])
            if k % 5 == 2:
                col = C[cols[(k // 5) % len(cols)]]
                for dx, dy in [(-1, 1), (0, 1), (1, 1), (0, 2)]: P(X + dx, Y + dy, col)
                P(X, Y + 3, INK)
    add(key, draw)
def balloon(cx, cy, stripes=('o3', 'c1', 'o2', 'c1', 'o4', 'c2')):
    """A hot-air balloon above the park; (cx, cy) is the centre of its envelope in pixels."""
    SD.ellipse([cx + 46, cy + 104, cx + 74, cy + 116], fill=255)
    def draw():
        L = Layer(); d = L.d; m = Image.new('L', (W, H), 0); md = ImageDraw.Draw(m)
        md.ellipse([cx - 15, cy - 18, cx + 15, cy + 12], fill=255); md.polygon([(cx - 11, cy + 6), (cx + 11, cy + 6), (cx + 4, cy + 20), (cx - 4, cy + 20)], fill=255)
        for k in range(6):
            band = Image.new('L', (W, H), 0); ImageDraw.Draw(band).rectangle([cx - 15 + k * 5, 0, cx - 11 + k * 5, H], fill=255)
            L.im.paste(C[stripes[k]] + (255,), (0, 0), ImageChops.multiply(m, band))
        d.arc([cx - 15, cy - 18, cx + 15, cy + 12], 200, 250, fill=C['c1'])
        d.line([(cx - 4, cy + 21), (cx - 3, cy + 26)], fill=C['w3']); d.line([(cx + 4, cy + 21), (cx + 3, cy + 26)], fill=C['w3'])
        d.rectangle([cx - 3, cy + 26, cx + 3, cy + 30], fill=C['w2']); d.line([(cx - 3, cy + 26), (cx + 3, cy + 26)], fill=C['w1']); d.rectangle([cx - 1, cy + 23, cx, cy + 25], fill=C['k1'])
        L.flush()
    add(999, draw)

# ---------------------------------------------------------------- scene tools
def scatter(seed, n, ok, plant, gap=0.85, span=34):
    """Places up to n plants on free grass with a fixed seed; ok(x, y, sx, sy) says where; plant(x, y, sx, sy, rnd, k) plants one."""
    T = random.Random(seed); placed = []
    for k in range(n * 60):
        if len(placed) >= n: break
        x, y = T.uniform(-span, span), T.uniform(-span, span); sx, sy = scr(x, y)
        if not (-10 < sx < W + 10 and 6 < sy < H + 24) or not ok(x, y, sx, sy): continue
        if any(math.hypot(x - a, y - b) < gap for a, b in placed): continue
        placed.append((x, y)); plant(x, y, sx, sy, T, k)
    return placed

def finish(name):
    apply_shadows()
    for key, fn in sorted(items, key=lambda it: it[0]): fn()
    im = frame
    n = count_colours(im)
    if n > 48: im = reduce_colours(im, 48)
    im.save(os.path.join(HERE, name))
    print('%s  %d x %d  %d colours%s' % (name, W, H, n, ' (reduced to %d)' % count_colours(im) if n > 48 else ''))


# ---------------------------------------------------------------- the desktop park: 640 x 400, Thrill left, Chill right
def desktop():
    begin(640, 400, 320, 187)                       # the plaza centre, tile (0.5, 0.5), lands on pixel (320, 195)
    M = Map()
    M.path(-30, 0, 30, 0); M.path(0, -30, 0, 30)    # an X of two avenues through the plaza
    M.path(-1, 4, -1, 4)                            # to the coaster station
    M.path(1, -9, 3, -9)                            # to the wheel
    M.path(6, -1, 6, -1)                            # to the carousel
    M.path(-1, 11, -1, 11)                          # to the ship
    M.plazas.append((0.5, 0.5, 2.3))
    M.ponds += [(11.2, -5.4, 2.5), (13.4, -6.6, 2.1), (12.8, -3.9, 1.7), (9.6, -6.9, 1.4)]
    M.gardens.append((4.4, 4.4, 1.9))
    M.tracks.append((4.9, 11.5, 1.5, 1.45, 0.62))
    M.lawns.append((12.0, 3.9, 2.3))
    M.cool = lambda x, y: x > 1 and y < 0
    ground(M)
    warm = lambda sx, sy: sx < 320
    details(M, 9, 230, warm)
    meadow(M, 4, 18, (20, 336, 620, 396), warm)

    # Thrill, left
    coaster(-6.5, 1.5, flip=True); tower(-10, 5); ship(-2.9, 11.3)
    stall_burger(-4.6, -1.7, 'o2'); stall_burger(-6.8, -1.7, 'o4')
    for (kx, ky), body in zip([(3.25, 12.05), (4.3, 13.75), (6.9, 11.0), (4.4, 10.7), (5.7, 9.5)], ['o4', 'o1', 'b2', 'c1', 'o4']): kart(kx, ky, body)
    gate((7.14, 9.26), (7.71, 8.69))
    pennant(4.3, 12.0, 'o4'); pennant(5.0, 11.3, 'o1'); pennant(5.7, 10.6, 'o4')
    stall_burger(1.4, 8.4, 'o4'); bench(-1.2, 8.6); pennant(-1.25, 3.3, 'o4'); pennant(-1.25, 5.6, 'o4')
    # Chill, right
    wheel(5.7, -8.4); carousel(6, -2.7); gazebo(12.0, 3.9)
    stall_ice(-1.7, -4.6, 't3'); stall_cup(-1.7, -6.8, 'b2')
    balloon(611, 38, ('t3', 'c1', 't2', 'c1', 't4', 'c2'))
    swan(11.0, -5.6, 't3'); swan(13.2, -6.4, 'b2'); boat(12.6, -4.2, 'c2')
    for lx, ly, fl in [(10.2, -4.2, True), (12.2, -7.4, False), (14.2, -5.4, True), (9.6, -6.8, False)]: lily(lx, ly, fl)
    for fx_, fy_ in [(10.1, 2.9), (13.1, 4.1), (11.0, 5.3)]: flowerbed(fx_, fy_, ('b1', 'p2', 'c1', 'b2'))
    bench(13.4, 2.6); bench(10.4, 4.6); pennant(5.6, -0.5, 't3'); pennant(7.4, -0.5, 't3')
    # the plaza
    fountain(0.5, 0.5)
    for cxy, st in [((-1, -1), 'o4'), ((2, -1), 't3'), ((2, 2), 't3'), ((-1, 2), 'o4')]: pole(*cxy, stripe=st)
    warmc, coolc = ('o4', 'o1', 'o2', 'c1'), ('t3', 'b2', 'c1', 't2')
    bunting((-1, -1), (2, -1), 0.05, ('o4', 'o1', 'c1', 't3', 'b2')); bunting((-1, -1), (-1, 2), 0.06, warmc)
    bunting((2, -1), (2, 2), 4.05, coolc); bunting((-1, 2), (2, 2), 4.06, ('o4', 'o1', 'c1', 't3', 'b2'))
    for t in (-22, -17, -12, -7, -3.2, 4.2, 8, 12, 16, 20):
        lamp(t, -0.08); lamp(-0.08, t)
    for bx_, by_ in [(-8.6, 1.2), (5.5, 1.2), (-13.4, 1.2)]: bench(bx_, by_)

    def free(x, y, sx, sy):
        for dx in (-0.7, 0, 0.7):
            for dy in (-0.7, 0, 0.7):
                if M.kind(x + dx, y + dy) != 'grass': return False
        if M.pond_d(x, y)[0] < 0.9: return False
        if sy > 334 and 50 < sx < 590: return False                     # the menu row: calm ground
        if 498 < sx < 594 and 40 < sy < 176: return False                # nothing behind the open wheel
        if -7.3 < x < -0.6 and 0.8 < y < 7.4: return False              # coaster
        if math.hypot(x + 10, y - 5) < 1.5: return False                 # tower
        if -4.5 < x < -1.2 and 8.6 < y < 14: return False                # ship
        if 3.6 < x < 7.9 and -9.9 < y < -6.9: return False               # wheel
        if math.hypot(x - 6, y + 2.7) < 2.6: return False                # carousel
        if -7.6 < x < -3.2 and -2.6 < y < -0.2: return False             # stalls
        if -2.6 < x < -0.2 and -7.6 < y < -3.2: return False
        if math.hypot(x - 0.5, y - 0.5) < 4.2: return False              # around the plaza
        if math.hypot(x - 4.4, y - 4.4) < 2.9: return False              # around the garden
        if math.hypot(x - 12.0, y - 3.9) < 2.9: return False             # the gazebo lawn
        if 0.9 < x < 3 and 7.6 < y < 9.8: return False                   # the stall by the lower avenue
        if abs((x - 4.9) + (y - 11.5)) < 5 and abs((x - 4.9) - (y - 11.5)) < 7.4: return False   # the kart track
        return True
    def plant(x, y, sx, sy, T, k):
        if sx < 300: (tree_autumn if T.random() < 0.62 else tree_pine if T.random() < 0.55 else tree_round)(x, y, k)
        elif sx > 340: (tree_round if T.random() < 0.6 else tree_pine)(x, y, k)
        else: (tree_round if T.random() < 0.5 else tree_autumn)(x, y, k)
    scatter(41, 84, free, plant)
    scatter(5, 16, free, lambda x, y, sx, sy, T, k: bush(x, y, k, ('o1', 'o3', 'o5') if sx < 300 else ('l1', 'l3', 'l4')), gap=1.2)

    G = random.Random(77); gi = [0]; spots = []
    def walk(n, fn, balloons=0.08):
        for _ in range(n):
            x, y = fn(G.random(), G.random())
            if math.hypot(x - 0.5, y - 0.5) < 1.1 or any(math.hypot(x - a, y - b) < 0.3 for a, b in spots): continue
            spots.append((x, y)); gi[0] += 1
            guest(x, y, gi[0], balloon=G.choice(['o4', 't2', 'p2', 'o1']) if G.random() < balloons else None)
    walk(50, lambda a, b: (-22 + a * 44, 0.2 + b * 0.6))
    walk(50, lambda a, b: (0.2 + b * 0.6, -22 + a * 44))
    walk(30, lambda a, b: (-1.3 + a * 3.6, -1.3 + b * 3.6), balloons=0.3)
    walk(4, lambda a, b: (-0.9 + a * 0.8, 4.2 + b * 0.6)); walk(3, lambda a, b: (6.2 + b * 0.6, -0.9 + a * 0.8)); walk(4, lambda a, b: (1.2 + a * 2.6, -8.8 + b * 0.6))
    walk(8, lambda a, b: (-7 + a * 3.4, 0.15 + b * 0.5)); walk(8, lambda a, b: (0.15 + b * 0.5, -7 + a * 3.4)); walk(4, lambda a, b: (0.3 + b * 0.5, 7.6 + a * 1.6)); walk(3, lambda a, b: (-0.9 + a * 0.8, 11.2 + b * 0.6))
    finish('park-desktop.png')


# ---------------------------------------------------------------- the phone park: 195 x 422, Thrill at the top, Chill below
def phone():
    begin(195, 422, 97, 182)
    M = Map()
    M.path(-30, 0, 30, 0)                           # the avenue between the two sides
    M.path(6, 1, 6, 7)                              # down to the water
    for sx, sy, r in [(100, 312, 1.5), (55, 334, 2.6), (145, 332, 2.6), (100, 380, 3.4), (25, 388, 2.8), (172, 388, 2.8), (100, 430, 3.2), (20, 430, 3), (180, 430, 3)]:
        M.ponds.append(tile(sx, sy) + (r,))
    M.cool = lambda x, y: y > 1
    ground(M)
    details(M, 9, 60, lambda sx, sy: sy < 190)
    coaster(-5.4, -6.1); tower(-1.95, 2.65)
    wheel(8.4, 4.9); carousel(4.6, 8.2)
    stall_ice(1.5, 1.5, 't3'); stall_burger(1.4, -2.7, 'o4'); bench(-3.6, 1.25); pennant(0.7, -0.35, 'o4')
    swan(*tile(100, 316), 't3')
    for t in (-7, -3, 1.5, 5.3, 9.5): lamp(t, -0.08)
    def free(x, y, sx, sy):
        for dx in (-0.7, 0, 0.7):
            for dy in (-0.7, 0, 0.7):
                if M.kind(x + dx, y + dy) != 'grass': return False
        if M.pond_d(x, y)[0] < 0.9: return False
        if -6.2 < x < -0.2 and -6.7 < y < -0.3: return False
        if math.hypot(x + 1.95, y - 2.65) < 1.4: return False
        if sx > 108 and 150 < sy < 300: return False
        if 6.4 < x < 10.4 and 3.6 < y < 6.2: return False
        if math.hypot(x - 4.6, y - 8.2) < 2.5: return False
        if 1 < x < 3.2 and 1 < y < 3.2: return False
        if 0.8 < x < 3 and -3.4 < y < -1.2: return False
        return True
    def plant(x, y, sx, sy, T, k):
        if sy < 185: (tree_autumn if T.random() < 0.7 else tree_pine)(x, y, k)
        else: (tree_round if T.random() < 0.6 else tree_pine)(x, y, k)
    scatter(41, 22, free, plant)
    G = random.Random(78); gi = [0]; spots = []
    def walk(n, fn, balloons=0.1):
        for _ in range(n):
            x, y = fn(G.random(), G.random())
            if any(math.hypot(x - a, y - b) < 0.3 for a, b in spots): continue
            spots.append((x, y)); gi[0] += 1
            guest(x, y, gi[0], balloon=G.choice(['o4', 't2', 'p2', 'o1']) if G.random() < balloons else None)
    walk(44, lambda a, b: (-7 + a * 14, 0.15 + b * 0.7), balloons=0.14)
    walk(8, lambda a, b: (6.2 + b * 0.6, 1 + a * 6)); walk(4, lambda a, b: (1.2 + a * 1.4, 2.7 + b * 0.5))
    finish('park-phone.png')


if __name__ == '__main__':
    desktop()
    phone()
