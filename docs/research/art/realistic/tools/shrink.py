# Cuts the round-6 PNGs to a 256-colour palette (Pillow; no pngquant here) when they are over ~1 MB.
# usage: python3 shrink.py            -> every docs/screenshots/concept-real-*.png over the limit
import glob, os
from PIL import Image
SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../screenshots')
LIMIT = 1_000_000
for p in sorted(glob.glob(os.path.join(SHOT, 'concept-real-*.png'))):
    before = os.path.getsize(p)
    if before <= LIMIT:
        print(f'{os.path.basename(p)}: {before // 1024} KB (kept)')
        continue
    im = Image.open(p).convert('RGB')
    q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(p, optimize=True)
    print(f'{os.path.basename(p)}: {before // 1024} KB -> {os.path.getsize(p) // 1024} KB')
