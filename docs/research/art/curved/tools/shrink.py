# Shrinks the rendered concept PNGs to a 256-colour palette (no pngquant here). Run after render.cjs.
# usage: python3 shrink.py d e f g compare-2
import sys
from PIL import Image
SHOT = '/home/user/RC-TYCOON-/docs/screenshots'
for k in sys.argv[1:]:
    names = [f'concept-curved-{k}.png'] + ([] if k.startswith('compare') else [f'concept-curved-{k}-phone.png'])
    for n in names:
        p = f'{SHOT}/{n}'
        im = Image.open(p).convert('RGB')
        q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
        q.save(p, optimize=True)
        print(n)
