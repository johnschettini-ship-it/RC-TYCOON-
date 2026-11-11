#!/usr/bin/env python3
"""Exports the pictures of the intro (final design E) as data for the game, which may not ship image files.

For each picture that the pages use it writes json/<name>.json:
    {"w": W, "h": H, "palette": ["#rrggbb", ...], "rows": [[[paletteIndex, runLength], ...], ...]}
One list of runs per row, left to right; the runs of a row add up to W; a transparent pixel has the index -1.
The palette is sorted by how often a colour is used (index 0 = the most used colour).
Then it decodes every JSON file again, compares it with the PNG pixel for pixel, and prints the raw size and the gzip
size (level 9) of each file and the totals. The total gzip size must stay under 40,000 bytes.

    python3 tools/title-art/export.py PNG_DIR [JSON_DIR]

PNG_DIR holds the four PNG files that make.py wrote; JSON_DIR (default: PNG_DIR/json) receives the JSON files.
"""
import gzip, json, os, sys
from PIL import Image

PICTURES = ['scene-wide.png', 'scene-tall.png', 'logo-line.png', 'logo-stack.png']
LIMIT = 40000


def encode(im):
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    counts = {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 255: counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
            elif a != 0: raise ValueError('half-transparent pixel at %d, %d' % (x, y))
    pal = sorted(counts, key=lambda c: (-counts[c], c))
    index = {c: i for i, c in enumerate(pal)}
    rows = []
    for y in range(h):
        runs = []
        for x in range(w):
            r, g, b, a = px[x, y]
            i = index[(r, g, b)] if a == 255 else -1
            if runs and runs[-1][0] == i: runs[-1][1] += 1
            else: runs.append([i, 1])
        rows.append(runs)
    return {'w': w, 'h': h, 'palette': ['#%02x%02x%02x' % c for c in pal], 'rows': rows}


def decode(data):
    """The same steps the game takes: palette index -> colour, runs -> pixels (transparent for -1)."""
    w, h = data['w'], data['h']
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); px = im.load()
    pal = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for c in data['palette']]
    assert len(data['rows']) == h
    for y, runs in enumerate(data['rows']):
        x = 0
        for i, n in runs:
            for _ in range(n):
                px[x, y] = pal[i] if i >= 0 else (0, 0, 0, 0); x += 1
        assert x == w, 'row %d has %d pixels, not %d' % (y, x, w)
    return im


def same(a, b):
    a = a.convert('RGBA'); b = b.convert('RGBA')
    if a.size != b.size: return False
    pa, pb = a.load(), b.load()
    for y in range(a.size[1]):
        for x in range(a.size[0]):
            ca, cb = pa[x, y], pb[x, y]
            if ca[3] == 0 and cb[3] == 0: continue
            if ca != cb: return False
    return True


def main():
    if len(sys.argv) not in (2, 3):
        print('usage: python3 tools/title-art/export.py PNG_DIR [JSON_DIR]'); return 2
    png_dir = os.path.abspath(sys.argv[1])
    out_dir = os.path.abspath(sys.argv[2]) if len(sys.argv) == 3 else os.path.join(png_dir, 'json')
    os.makedirs(out_dir, exist_ok=True)
    total_raw = total_gz = 0; ok = True
    print('%-18s %9s %9s %8s %s' % ('picture', 'raw', 'gzip', 'colours', 'check'))
    for name in PICTURES:
        im = Image.open(os.path.join(png_dir, name)); im.load()
        data = encode(im)
        text = json.dumps(data, separators=(',', ':'))
        path = os.path.join(out_dir, name[:-4] + '.json')
        with open(path, 'w') as f: f.write(text)
        with open(path) as f: back = decode(json.load(f))
        good = same(im, back); ok &= good
        raw = len(text.encode()); gz = len(gzip.compress(text.encode(), 9))
        total_raw += raw; total_gz += gz
        print('%-18s %9d %9d %8d %s' % (name[:-4] + '.json', raw, gz, len(data['palette']), 'equal to the PNG' if good else 'DIFFERENT'))
    print('%-18s %9d %9d' % ('total', total_raw, total_gz))
    under = total_gz < LIMIT
    print('gzip total %d bytes: %s the limit of %d' % (total_gz, 'under' if under else 'OVER', LIMIT))
    return 0 if ok and under else 1


if __name__ == '__main__':
    sys.exit(main())
