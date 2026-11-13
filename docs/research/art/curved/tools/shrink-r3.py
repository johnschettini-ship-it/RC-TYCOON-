# Round 3: cuts a rendered PNG to 256 colours only when it is over ~1 MB.
# Uses Pillow's fast-octree quantizer: unlike shrink.py's median cut it keeps small saturated
# colours (guest shirts, flowers) instead of averaging them away. Run after render-r3.cjs.
# usage: python3 tools/shrink-r3.py j compare-3
import os, sys
from PIL import Image
SHOT = '/home/user/RC-TYCOON-/docs/screenshots'
for k in sys.argv[1:]:
    names = [f'concept-curved-{k}.png'] + ([] if k.startswith('compare') else [f'concept-curved-{k}-phone.png'])
    for n in names:
        p = f'{SHOT}/{n}'
        if os.path.getsize(p) < 1_000_000:
            print(n, 'kept', os.path.getsize(p)); continue
        im = Image.open(p).convert('RGB')
        im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(p, optimize=True)
        print(n, 'cut', os.path.getsize(p))
