#!/usr/bin/env python3
"""Shared palette of the intro mock-ups for "Thrills & Chills". Mock-up only, not game code.

The ramps are copied from concepts/pixel3.py: RAMPS is the "orange" theme (the warm orange day of the approved
drafts), FROST_RAMPS is the "frost" theme (the same ramps with snow ground, grey paths, cold leaves and ice water).
Every ramp runs from its lightest tone (index 0) to its darkest tone (last index).

    from palette import RAMPS, FROST_RAMPS, INK, WHITE, BLACK, ALLOWED, col, fcol, c_table, nearest, count_colours, reduce_colours

    col('o0')        -> (255, 215, 106)   the lightest tone of ramp 'o' (orange theme), index from 0
    col('o5')        -> (110, 35, 48)     the darkest tone of ramp 'o'
    col('o-1')       -> the darkest tone, whatever the length of the ramp
    fcol('g0')       -> (255, 255, 255)   the same key in the frost theme
    c_table()        -> {'g1': ..., 'g2': ...}  the table C of pixel3.py: the SAME colours with keys from 1
    nearest(rgb)     -> the allowed colour nearest to an RGB tuple (after a mix of two colours)
    count_colours(im), reduce_colours(im, 48)  -> count the colours of a PIL image; bring it down to 48

Run `python3 palette.py` to print every key with its hex value.
"""

RAMPS = {
    'g': ['#f0e07a', '#d6c85a', '#bdb24b', '#98993f', '#6f7f3a', '#4d6238'],  # grass, yellow-green
    's': ['#ffe9bf', '#fbd08e', '#f0ae62', '#cf8444', '#9c5a36', '#6e3d2e'],  # sand, paths
    'o': ['#ffd76a', '#ffab33', '#f47a1c', '#d9501a', '#a8301f', '#6e2330'],  # orange to red: the Thrill colour
    't': ['#b4f0e0', '#62d1c0', '#2fa89c', '#207a80', '#1a5266'],             # teal: the Chill colour of the rides
    'b': ['#a9d8ff', '#5aa2ee', '#356cc4', '#27468c'],                        # blue
    'v': ['#c9a4f0', '#9a6bd6', '#6b45a8', '#472d78'],                        # violet
    'c': ['#fff8e6', '#f3e0be', '#d3b894', '#a48a78', '#75606a'],             # cream to warm grey: walls, plates, steel
    'l': ['#c2de62', '#8fc04a', '#5a9a44', '#3a7748', '#28554a'],             # leaves
    'w': ['#d99a5a', '#b06a34', '#7a4426', '#4f2c22'],                        # wood
    'k': ['#f8d2a6', '#d99a66', '#9a5e38', '#5e3a26'],                        # skin tones of the tiny guests
    'a': ['#8fe3d6', '#52c4bd', '#35a0aa', '#27788c'],                        # water
    'p': ['#ffb0c0', '#ff7a9a', '#d94a78'],                                   # pink
    'i': ['#6e4470', '#4a2c52', '#2a1a36'],                                   # ink: outlines and shadows
}

# The frost theme of pixel3.py: the orange ramps with four ramps replaced.
FROST_RAMPS = dict(RAMPS)
FROST_RAMPS.update({
    'g': ['#ffffff', '#eef6ff', '#dbe9f7', '#bcd2ea', '#93b0d2', '#6f8fb8'],  # snow ground
    's': ['#f4f1ea', '#dcd6cc', '#bdb5ab', '#958d8a', '#6d6670', '#4d4856'],  # grey stone paths
    'l': ['#bfe6cf', '#74b596', '#3f8a72', '#2a6660', '#1d4a52'],             # cold leaves
    'a': ['#f2fbff', '#c9ecf7', '#9fd6ea', '#6fb4d6'],                        # ice
})


def rgb(h):
    """'#ffd76a' -> (255, 215, 106)"""
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def hexs(c):
    """(255, 215, 106) -> '#ffd76a'"""
    return '#%02x%02x%02x' % tuple(c[:3])


def col(key, ramps=None):
    """RGB tuple of a ramp tone. key = ramp letter + index from 0: 'o0' is the lightest tone of ramp 'o',
    the last index is the darkest ('o5'); a negative index counts from the dark end ('o-1' is the darkest).
    ramps: RAMPS (the default, orange theme) or FROST_RAMPS."""
    ramp = (ramps or RAMPS)[key[0]]
    return rgb(ramp[int(key[1:])])


def fcol(key):
    """col(key) in the frost theme."""
    return col(key, FROST_RAMPS)


def c_table(ramps=None):
    """The colour table C of pixel3.py: keys from 1 ('g1' is the lightest grass tone, the same colour as col('g0')).
    Use it when you copy helpers or object functions from pixel3.py, which all say C['o4'] and so on."""
    return {'%s%d' % (name, n + 1): rgb(h) for name, ramp in (ramps or RAMPS).items() for n, h in enumerate(ramp)}


INK = rgb(RAMPS['i'][-1])     # (42, 26, 54), #2a1a36: the outline colour of the pixel pictures
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

# Every colour that a pixel picture may hold: both ramp sets, pure white and pure black.
ALLOWED = frozenset([rgb(h) for ramps in (RAMPS, FROST_RAMPS) for ramp in ramps.values() for h in ramp] + [WHITE, BLACK])


def nearest(c, colours=None):
    """The allowed colour nearest to c (use it after you mix two colours, as snap() does in pixel3.py)."""
    pool = sorted(colours or ALLOWED)
    return min(pool, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)


def count_colours(im):
    """Number of different colours of the opaque pixels of a PIL image (the limit of one picture is 48)."""
    rgba = im.convert('RGBA')
    return len({c[:3] for n, c in rgba.getcolors(rgba.size[0] * rgba.size[1] + 1) if c[3] == 255})


def reduce_colours(im, limit=48, keep=()):
    """Returns a copy of a PIL image with at most `limit` colours: the rarest colours become the nearest colour that
    stays. Colours in `keep` (RGB tuples; INK always) are never dropped. Transparent pixels stay as they are.
    A last resort for a scene of 49 to 55 colours; first try to draw with fewer ramps."""
    rgba = im.convert('RGBA'); w, h = rgba.size
    counts = {}
    for n, c in rgba.getcolors(w * h + 1):
        if c[3] == 255: counts[c[:3]] = counts.get(c[:3], 0) + n
    fixed = set(keep) | {INK}
    order = sorted(counts, key=lambda c: (c in fixed, counts[c]), reverse=True)   # kept colours first, then the most used
    stay = order[:limit]; swap = {c: nearest(c, stay) for c in order[limit:]}
    if swap:
        px = rgba.load()
        for y in range(h):
            for x in range(w):
                c = px[x, y]
                if c[3] == 255 and c[:3] in swap: px[x, y] = swap[c[:3]] + (255,)
    return rgba if im.mode == 'RGBA' else rgba.convert('RGB')


if __name__ == '__main__':
    for title, ramps in (('RAMPS (orange theme)', RAMPS), ('FROST_RAMPS (frost theme): the ramps that differ', {k: v for k, v in FROST_RAMPS.items() if v != RAMPS[k]})):
        print(title)
        for name, ramp in ramps.items():
            print('  ' + '  '.join('%s%d %s' % (name, n, h) for n, h in enumerate(ramp)))
    print('INK', hexs(INK), '  ALLOWED holds', len(ALLOWED), 'colours')
