#!/usr/bin/env python3
"""Checks one intro design folder. Mock-up tool, not game code.

    python3 check.py <design folder>

1. Runs make.py of the folder (working directory = the folder; `from palette import ...` works).
2. Checks every PNG that make.py wrote, and every PNG that intro.html shows: each pixel fully opaque or fully
   transparent, at most 48 colours, every colour in palette.ALLOWED.
3. Renders intro.html with Chromium (shot.cjs) to desktop.png (1280 x 800) and phone.png (390 x 844) and prints for
   each screen: whether the font Fredoka loaded, the scale of every pixel picture, every menu item (the six elements
   with the attribute data-menu) with its size in px, and every rule failure.
Exit code 1 when there is a failure, 0 when the design passes. A design with a failure is not finished.
"""
import json, os, re, subprocess, sys, time
from urllib.parse import unquote, urlparse

KIT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, KIT)
sys.dont_write_bytecode = True
from PIL import Image
from palette import ALLOWED, hexs, nearest

NODE_MODULES = os.environ.get('NODE_PATH') or '/home/user/RC-TYCOON-/node_modules'
MAX_COLOURS = 48
MIN_HEIGHT = 44      # px, a menu item
MIN_GAP = 8          # px, between two menu items
MENU = ['Continue', 'New game', 'Load', 'Import', 'Settings', 'Credits']
SHOTS = ('desktop.png', 'phone.png')

failures, warnings = [], []
where_now = ['']     # the part of the report that a failure belongs to: '', 'desktop: ' or 'phone: '


def fail(msg):
    failures.append(where_now[0] + msg); print('  FAIL  ' + msg)


def warn(msg):
    warnings.append(where_now[0] + msg); print('  warn  ' + msg)


def note(msg):
    print('  note  ' + msg)


def ok(msg):
    print('  ok    ' + msg)


def num(v):
    """A pixel number without a useless '.0'."""
    return ('%.2f' % v).rstrip('0').rstrip('.')


def block_size(im):
    """How many file pixels one art pixel takes when the file is already scaled up (1 = not scaled)."""
    w, h = im.size
    for k in (8, 6, 5, 4, 3, 2):
        if w % k or h % k or w // k < 2 or h // k < 2: continue
        small = im.resize((w // k, h // k), Image.NEAREST, box=(0, 0, w, h))
        # NEAREST takes the centre pixel of each block; the file is scaled when every block is flat.
        if small.resize((w, h), Image.NEAREST).tobytes() == im.tobytes(): return k
    return 1


def check_png(path, label):
    """Validates one pixel picture. Returns its (width, height) or None."""
    try:
        im = Image.open(path); im.load()
    except Exception as e:
        fail('%s: cannot be read as a picture (%s)' % (label, e)); return None
    rgba = im.convert('RGBA'); w, h = rgba.size
    colours = rgba.getcolors(maxcolors=w * h + 1) or []
    problems = []
    half = sum(n for n, c in colours if 0 < c[3] < 255)
    if half: problems.append('%d pixel%s half transparent (alpha must be 0 or 255)' % (half, ' is' if half == 1 else 's are'))
    opaque = {}
    for n, c in colours:
        if c[3] == 255: opaque[c[:3]] = opaque.get(c[:3], 0) + n
    if len(opaque) > MAX_COLOURS: problems.append('%d colours (at most %d)' % (len(opaque), MAX_COLOURS))
    bad = sorted(((n, c) for c, n in opaque.items() if c not in ALLOWED), reverse=True)
    if bad:
        shown = ', '.join('%s (%d px, nearest %s)' % (hexs(c), n, hexs(nearest(c))) for n, c in bad[:8])
        problems.append('%d colour%s not in the palette: %s%s' % (len(bad), ' is' if len(bad) == 1 else 's are', shown, ' ...' if len(bad) > 8 else ''))
    if problems:
        for p in problems: fail('%s: %s' % (label, p))
    else:
        clear = sum(n for n, c in colours if c[3] == 0)
        ok('%s  %d x %d, %d colours%s' % (label, w, h, len(opaque), ', with transparent pixels' if clear else ''))
    k = block_size(rgba)
    if k > 1: note('%s is already scaled %d times in the file: write it at 1 file pixel for 1 art pixel and scale it in CSS' % (label, k))
    return (w, h)


def is_whole(v):
    return v >= 0.99 and abs(v - round(v)) < 0.011


def gap(a, b):
    """Distance in px between two boxes (0 when they touch or overlap)."""
    dx = max(0.0, a['x'] - (b['x'] + b['width']), b['x'] - (a['x'] + a['width']))
    dy = max(0.0, a['y'] - (b['y'] + b['height']), b['y'] - (a['y'] + a['height']))
    return (dx * dx + dy * dy) ** 0.5


def bg_scale(size, natural):
    """Scale of a CSS background from the computed background-size, or None when it cannot be worked out."""
    parts = size.split()
    if parts in (['auto'], ['auto', 'auto']): return (1.0, 1.0)
    def px(p): return float(p[:-2]) if re.fullmatch(r'-?[\d.]+px', p) else None
    if len(parts) == 1: parts.append('auto')
    if len(parts) != 2: return None
    w, h = px(parts[0]), px(parts[1])
    if w is not None and h is not None: return (w / natural[0], h / natural[1])
    if w is not None and parts[1] == 'auto': return (w / natural[0],) * 2
    if h is not None and parts[0] == 'auto': return (h / natural[1],) * 2
    return None


def main():
    if len(sys.argv) != 2:
        print(__doc__); return 2
    folder = os.path.abspath(sys.argv[1])
    if not os.path.isdir(folder):
        print('check.py: not a folder: ' + folder); return 2
    rel = lambda p: os.path.relpath(p, folder)
    print('check.py  ' + folder)

    print('\n== files ==')
    for name in ('make.py', 'intro.html', 'NOTES.txt'):
        if os.path.isfile(os.path.join(folder, name)): ok(name)
        else: fail('%s is missing (a design is one folder with make.py, intro.html and NOTES.txt)' % name)

    # ------------------------------------------------------------ 1. make.py
    print('\n== make.py ==')
    start = time.time()
    if os.path.isfile(os.path.join(folder, 'make.py')):
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
        env['PYTHONPATH'] = KIT + (os.pathsep + env['PYTHONPATH'] if env.get('PYTHONPATH') else '')
        try:
            run = subprocess.run([sys.executable, 'make.py'], cwd=folder, env=env, capture_output=True, text=True, timeout=600)
            lines = (run.stdout + run.stderr).rstrip().splitlines()
            for line in lines[-40:]: print('  | ' + line)
            if run.returncode: fail('make.py ended with exit code %d' % run.returncode)
            else: ok('make.py ran in %.1f s' % (time.time() - start))
        except subprocess.TimeoutExpired:
            fail('make.py ran longer than 600 s')

    pngs = []
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__']
        for f in files:
            if not f.lower().endswith('.png'): continue
            p = os.path.join(root, f)
            if root == folder and f in SHOTS: continue
            pngs.append(p)
    pngs.sort()
    fresh = [p for p in pngs if os.path.getmtime(p) >= start - 1.0]

    # ------------------------------------------------------------ 3. render (before the picture report, to learn which pictures the page shows)
    shot = None
    if os.path.isfile(os.path.join(folder, 'intro.html')):
        env = dict(os.environ, NODE_PATH=NODE_MODULES)
        try:
            run = subprocess.run(['node', os.path.join(KIT, 'shot.cjs'), folder], env=env, capture_output=True, text=True, timeout=240)
            if run.returncode:
                print('\n== render =='); fail('shot.cjs ended with exit code %d: %s' % (run.returncode, (run.stderr or run.stdout).strip()[-600:]))
            else:
                shot = json.loads(run.stdout[run.stdout.index('{'):])
        except subprocess.TimeoutExpired:
            print('\n== render =='); fail('shot.cjs ran longer than 240 s')
        except ValueError as e:
            print('\n== render =='); fail('shot.cjs printed no JSON (%s)' % e)

    used = set()
    if shot:
        for screen in shot.values():
            for r in screen.get('resources', []):
                if r.lower().endswith('.png'): used.add(os.path.abspath(r))

    # ------------------------------------------------------------ 2. pictures
    print('\n== pictures ==')
    sizes = {}
    todo = sorted(set(fresh) | {p for p in used if os.path.isfile(p)}) or pngs
    if not pngs and not used: note('the folder has no PNG picture')
    elif not fresh and pngs: note('make.py wrote no PNG in this run: every PNG of the folder is checked')
    for p in todo:
        inside = os.path.commonpath([folder, p]) == folder
        label = rel(p) if inside else p
        size = check_png(p, label)
        if size: sizes[p] = size
        if not inside: fail('%s lies outside the design folder: make.py must write every picture of the design into the folder' % p)
        elif p not in fresh and fresh: warn('%s is shown by intro.html but was not written by make.py in this run' % label)
    for p in pngs:
        if p not in todo: note('%s is not checked: make.py did not write it in this run and intro.html does not show it' % rel(p))

    # ------------------------------------------------------------ 3. screens
    if shot:
        for name in ('desktop', 'phone'):
            s = shot[name]; W, H = s['width'], s['height']
            print('\n== %s  %d x %d  ->  %s ==' % (name, W, H, os.path.join(folder, name + '.png')))
            where_now[0] = name + ': '
            if s['fontLoaded']: ok('font Fredoka loaded')
            else: fail('font Fredoka did not load (font faces: %s)' % (', '.join(s.get('fontFaces', [])) or 'none'))
            if not s['baseCss']: fail('base.css is not loaded: link it with <link rel="stylesheet" href="../kit3/base.css"> (a design folder sits beside kit3)')
            broken = {os.path.basename(unquote(urlparse(im['src']).path)) for im in s.get('images', []) if not im['loaded']}
            for e in s.get('errors', []):
                if os.path.basename(unquote(urlparse(e.split(' ')[-1]).path)) not in broken: fail(e)

            def scale_report(label, sx, sy, rendering, where):
                if sx is None:
                    warn('%s: check.py cannot work out the scale of this picture (%s); give it sizes in px' % (label, where)); return
                if not is_whole(sx) or not is_whole(sy) or abs(sx - sy) > 0.011:
                    fail('%s is shown at %s x by %s x: a pixel picture needs one whole-number scale (%s)' % (label, num(sx), num(sy), where)); return
                if round(sx) > 1 and rendering not in ('pixelated', 'crisp-edges'):
                    fail('%s is scaled %d x without hard pixels: use <img class="px"> or image-rendering: pixelated (%s)' % (label, round(sx), where)); return
                ok('picture %s shown at %d x  (%s)' % (label, round(sx), where))

            seen = set()
            for im in s.get('images', []):
                src = im['src']; label = src or '(img without src)'
                path = None
                if src.startswith('file:'): path = os.path.abspath(unquote(urlparse(src).path))
                elif src and not re.match(r'^[a-z]+:', src): path = os.path.abspath(os.path.join(folder, unquote(urlparse(src).path)))
                if path: seen.add(path)
                if not im['loaded']:
                    fail('picture %s did not load' % label); continue
                if not im['shown']: continue
                nw, nh, w, h = im['naturalWidth'], im['naturalHeight'], im['width'], im['height']
                fit = im['objectFit']
                if fit == 'fill': sx, sy = w / nw, h / nh
                elif fit == 'cover': sx = sy = max(w / nw, h / nh)
                elif fit == 'none': sx = sy = 1.0
                else:
                    sx = sy = min(w / nw, h / nh)
                    if fit == 'scale-down': sx = sy = min(1.0, sx)
                where = '%d x %d px in the file, box %s x %s at %s, %s' % (nw, nh, num(w), num(h), num(im['x']), num(im['y']))
                if fit != 'fill': where += ', object-fit %s' % fit
                scale_report(label, sx, sy, im['rendering'], where)
                if src.lower().split('?')[0].endswith('.png') and not im['px']: note('%s has no class "px"' % label)
                if abs(im['x'] - round(im['x'])) > 0.01 or abs(im['y'] - round(im['y'])) > 0.01:
                    warn('%s sits on a fraction of a pixel (%s, %s): its pixels can come out uneven; place it on whole pixels' % (label, num(im['x']), num(im['y'])))
            for bg in s.get('backgrounds', []):
                path = bg['file']; label = (rel(path) if os.path.commonpath([folder, path]) == folder else path) + ' (CSS background)'
                seen.add(os.path.abspath(path))
                natural = sizes.get(os.path.abspath(path))
                if not natural:
                    try: natural = Image.open(path).size
                    except Exception: fail('%s did not load' % label); continue
                sc = bg_scale(bg['size'], natural)
                where = '%d x %d px in the file, background-size %s on <%s>' % (natural[0], natural[1], bg['size'], bg['tag'])
                scale_report(label, sc[0] if sc else None, sc[1] if sc else None, bg['rendering'], where)

            menu = s.get('menu', [])
            if s.get('hiddenMenu'): note('%d hidden data-menu element%s ignored on this screen' % (s['hiddenMenu'], ' is' if s['hiddenMenu'] == 1 else 's are'))
            print('  menu: %d items with data-menu' % len(menu))
            for n, m in enumerate(menu):
                print('    %d. %-12s %s x %s px  at %s, %s' % (n + 1, '"%s"' % m['text'], num(m['width']), num(m['height']), num(m['x']), num(m['y'])))
            if len(menu) < len(MENU): fail('%d menu items with the attribute data-menu are visible; the menu has six' % len(menu))
            elif len(menu) > len(MENU): warn('%d elements have data-menu; the menu has six items' % len(menu))
            texts = [m['text'].lower() for m in menu]
            if len(menu) == len(MENU) and any(not t.startswith(want.lower()) for t, want in zip(texts, MENU)):
                warn('the menu items are %s; the brief asks for %s in this order' % (', '.join('"%s"' % m['text'] for m in menu), ', '.join(MENU)))
            for m in menu:
                if m['height'] < MIN_HEIGHT - 0.01: fail('"%s" is %s px high (at least %d px)' % (m['text'], num(m['height']), MIN_HEIGHT))
                if m['width'] < MIN_HEIGHT - 0.01: warn('"%s" is %s px wide (a touch target is at least %d px)' % (m['text'], num(m['width']), MIN_HEIGHT))
                if m['x'] < -0.5 or m['y'] < -0.5 or m['x'] + m['width'] > W + 0.5 or m['y'] + m['height'] > H + 0.5:
                    fail('"%s" lies outside the screen (box %s, %s to %s, %s; screen %d x %d)' % (m['text'], num(m['x']), num(m['y']), num(m['x'] + m['width']), num(m['y'] + m['height']), W, H))
                elif name == 'phone' and m['y'] + m['height'] / 2 < H / 2:
                    warn('"%s" sits in the upper half of the phone (centre at y = %s): the menu belongs in reach of a thumb, below y = %d' % (m['text'], num(m['y'] + m['height'] / 2), H // 2))
            for i in range(len(menu)):
                for j in range(i + 1, len(menu)):
                    g = gap(menu[i], menu[j])
                    if g < MIN_GAP - 0.01:
                        fail('"%s" and "%s" are %s (at least %d px between two menu items)' % (menu[i]['text'], menu[j]['text'], 'touching or overlapping' if g == 0 else num(g) + ' px apart', MIN_GAP))
            c = s.get('content', {})
            if c and (c['width'] > W or c['height'] > H):
                note('the page content is %d x %d px: what lies outside the %d x %d screen is cut off' % (c['width'], c['height'], W, H))
            for p in sorted(used):
                if p in s.get('resources', []) and p not in seen and os.path.isfile(p):
                    note('%s is loaded but check.py found no <img> or background that shows it' % (rel(p) if os.path.commonpath([folder, p]) == folder else p))

    where_now[0] = ''
    print('\n== result ==')
    for w in warnings: print('  warn  ' + w)
    for f in failures: print('  FAIL  ' + f)
    if failures:
        print('FAILED: %d failure%s, %d warning%s. A design with a failure is not finished.' % (len(failures), '' if len(failures) == 1 else 's', len(warnings), '' if len(warnings) == 1 else 's'))
        return 1
    print('PASSED with %d warning%s. Now open desktop.png and phone.png and look at them.' % (len(warnings), '' if len(warnings) == 1 else 's'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
