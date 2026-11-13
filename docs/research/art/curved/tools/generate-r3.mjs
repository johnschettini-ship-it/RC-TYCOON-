// Round 3 concept sheets: H (toy diorama), I (neon night), J (lush mobile), K (minimal geometric).
// Separate from generate.mjs on purpose: A-G stay byte-identical. Each style here has its OWN scene
// layout, proportions and shape language; only the camera (isometric 2:1, x=(x-y)*52, y=(x+y)*26-z) is shared.
// usage: node tools/generate-r3.mjs          -> all four
//        node tools/generate-r3.mjs h j      -> some
import fs from 'fs';

const OUT = '/home/user/RC-TYCOON-/docs/research/art/curved';
const FONT = `system-ui, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif`;
const f = (n) => Math.round(n * 100) / 100;
const pt = (p) => `${f(p[0])},${f(p[1])}`;

// ---------- colour (same helpers as generate.mjs) ----------
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
const shade = (c, k) => { const [r, g, b] = hex2rgb(c); return rgb2hex(r * k * 0.97, g * k * 0.985, b * Math.min(1, k * 1.04)); };
const light = (c, t) => mix(c, '#ffffff', t);

// ---------- geometry (same helpers as generate.mjs) ----------
function rp(pts, r) {
  const n = pts.length; let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const l1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) || 1, l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
    const rr = Math.min(r, l1 / 2.05, l2 / 2.05);
    const a = [p1[0] + (p0[0] - p1[0]) / l1 * rr, p1[1] + (p0[1] - p1[1]) / l1 * rr];
    const b = [p1[0] + (p2[0] - p1[0]) / l2 * rr, p1[1] + (p2[1] - p1[1]) / l2 * rr];
    d += `${i ? 'L' : 'M'}${pt(a)}Q${pt(p1)} ${pt(b)}`;
  }
  return d + 'Z';
}
const poly = (pts) => 'M' + pts.map(pt).join('L') + 'Z';
const line = (pts) => 'M' + pts.map(pt).join('L');
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const ellD = (c, rx, ry) => `M${pt([c[0] - rx, c[1]])}A${f(rx)} ${f(ry)} 0 1 0 ${pt([c[0] + rx, c[1]])}A${f(rx)} ${f(ry)} 0 1 0 ${pt([c[0] - rx, c[1]])}Z`;
function smoothPath(pts, closed = false) {
  if (pts.length < 3) return line(pts);
  const n = pts.length, at = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${pt(p2)}`;
  }
  return d + (closed ? 'Z' : '');
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// Catmull-Rom through 3D control points -> dense samples
function spline3(ctrl, per = 10, closed = false) {
  const n = ctrl.length, out = [];
  const at = (i) => closed ? ctrl[(i + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  if (!closed) out.push(ctrl[n - 1].slice());
  return out;
}

// ---------- drawing context: the shared camera ----------
// S = zoom. Screen = (OX + (x - y) * 52 * S, OY + (x + y) * 26 * S - z * S). Same 2:1 model as the game.
function Ctx(S, OX, OY, zMirror = null) {
  const c = { S, OX, OY, o: [], defs: [], u: 0, items: [] };
  c.P = zMirror === null
    ? (x, y, z = 0) => [OX + (x - y) * 52 * S, OY + (x + y) * 26 * S - z * S]
    : (x, y, z = 0) => [OX + (x - y) * 52 * S, OY + (x + y) * 26 * S - (2 * zMirror - z) * S];
  c.id = (p) => `${p}${++c.u}`;
  c.push = (s) => c.o.push(s);
  c.def = (s) => c.defs.push(s);
  // rounded rectangle in GRID space (so iso corners are true quarter circles on the ground)
  c.rr = (x0, x1, y0, y1, r, z = 0, n = 7) => {
    r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
    const cs = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]], pts = [];
    for (const [cx, cy, a0] of cs) for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * Math.PI / 180; pts.push(c.P(cx + r * Math.cos(a), cy + r * Math.sin(a), z)); }
    return pts;
  };
  c.circ = (gx, gy, r, z = 0, n = 44) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return c.P(gx + r * Math.cos(a), gy + r * Math.sin(a), z); });
  // extruded rounded slab: band = hull(top + bottom). xf = screen x of the front corner (left/right split)
  c.slab = (x0, x1, y0, y1, r, z0, z1) => {
    const top = c.rr(x0, x1, y0, y1, r, z1), bot = c.rr(x0, x1, y0, y1, r, z0);
    const band = hull(top.concat(bot)); const xs = band.map((p) => p[0]);
    return { top, bot, band, xa: Math.min(...xs), xb: Math.max(...xs), xf: c.P(x1 - r * 0.29, y1 - r * 0.29)[0] };
  };
  // horizontal two-colour split gradient (lit left face / shaded right face), soft ramp around the front edge
  const gcache = new Map();
  c.split = (left, right, xa, xb, xf, soft = 0) => {
    const k = [left, right, f(xa), f(xb), f(xf), soft].join('|'); if (gcache.has(k)) return gcache.get(k);
    const id = c.id('sp'), t = Math.max(0, Math.min(1, (xf - xa) / (xb - xa || 1))), s = soft / (xb - xa || 1);
    c.def(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(xa)}" y1="0" x2="${f(xb)}" y2="0"><stop offset="${f(Math.max(0, t - s))}" stop-color="${left}"/><stop offset="${f(Math.min(1, t + s))}" stop-color="${right}"/></linearGradient>`);
    gcache.set(k, `url(#${id})`); return `url(#${id})`;
  };
  // object-bounding-box gradients, cached per colour
  c.og = (key, build) => { if (gcache.has(key)) return gcache.get(key); const id = c.id('og'); c.def(build(id)); gcache.set(key, `url(#${id})`); return `url(#${id})`; };
  c.cylSide = (gx, gy, r, z0, z1) => {
    const c0 = c.P(gx, gy, z0), c1 = c.P(gx, gy, z1), rx = Math.SQRT2 * 52 * S * r, ry = rx / 2;
    return { d: `M${pt([c1[0] - rx, c1[1]])}L${pt([c0[0] - rx, c0[1]])}A${f(rx)} ${f(ry)} 0 0 0 ${pt([c0[0] + rx, c0[1]])}L${pt([c1[0] + rx, c1[1]])}Z`, top: ellD(c1, rx, ry), c0, c1, rx, ry };
  };
  c.add = (depth, draw) => c.items.push({ depth, draw });
  c.flush = () => { c.items.sort((a, b) => a.depth - b.depth).forEach((it) => it.draw()); c.items = []; };
  return c;
}

// ---------- shared sheet frame ----------
function frame({ key, letter, name, file, blurb, pal, ink, sub, panel, panelInk, bg, scene, lineup, note, extraDefs = '', over = '' }) {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" font-family="${FONT}">`);
  out.push(`<title>${letter} — ${name} · Thrills &amp; Chills round-3 art concept</title>`);
  out.push(`<defs>${extraDefs}</defs>`);
  out.push(bg);
  out.push(scene);
  out.push(over);
  out.push(`<text x="56" y="70" font-size="15" font-weight="700" letter-spacing="3" fill="${sub}">THRILLS &amp; CHILLS · ROUND 3 ART CONCEPT</text>`);
  out.push(`<text x="54" y="118" font-size="44" font-weight="800" fill="${ink}">${letter} — ${name}</text>`);
  blurb.forEach((l, i) => out.push(`<text x="56" y="${152 + i * 24}" font-size="17" font-weight="500" fill="${sub}">${l.replace(/&/g, '&amp;')}</text>`));
  out.push(`<text x="1200" y="70" font-size="15" font-weight="700" letter-spacing="3" fill="${sub}">PALETTE</text>`);
  pal.forEach((p, i) => out.push(`<rect x="${1200 + i * 42}" y="84" width="34" height="34" rx="${key === 'k' ? 0 : 9}" fill="${p}"${key === 'k' ? ' stroke="#d6cfc2" stroke-width="1"' : ''}${key === 'i' ? ` stroke="${p}" stroke-opacity="0.35" stroke-width="5"` : ''}/>`));
  // guest line-up panel (bottom left) and style note (bottom right)
  out.push(`<g>${panel ? `<rect x="36" y="${1000 - 236}" width="${lineup.w + 40}" height="210" rx="${key === 'k' ? 0 : 18}" fill="${panel}"/>` : ''}`);
  out.push(`<text x="56" y="${1000 - 204}" font-size="15" font-weight="700" letter-spacing="3" fill="${panelInk || sub}">GUESTS · 2×</text>${lineup.svg}</g>`);
  const nx = 1600 - 36 - 440;
  out.push(`<g>${panel ? `<rect x="${nx}" y="${1000 - 236}" width="440" height="210" rx="${key === 'k' ? 0 : 18}" fill="${panel}"/>` : ''}`);
  out.push(`<text x="${nx + 22}" y="${1000 - 204}" font-size="15" font-weight="700" letter-spacing="3" fill="${panelInk || sub}">STYLE NOTE</text>`);
  note.forEach((l, i) => out.push(`<text x="${nx + 22}" y="${1000 - 172 + i * 25}" font-size="16.5" font-weight="${i === 0 ? 700 : 500}" fill="${panelInk || sub}">${l.replace(/&/g, '&amp;')}</text>`));
  out.push(`</g></svg>`);
  fs.writeFileSync(`${OUT}/${file}.svg`, out.join('\n'));
  console.log(`${file}.svg`);
}

// ======================================================================
// H — Chunky toy diorama
// Painted wooden toys on a plastic tray: big-head peg-doll guests, stubby fat rides, rounded board edges,
// flat satin paint in primaries (three tones, no gradients on objects), tilt-shift blur top and bottom.
// ======================================================================
function styleH() {
  const S = 1.4, c = Ctx(S, 800, 168);
  const K = { red: '#e8352f', blue: '#2367e0', yellow: '#ffc21a', green: '#33b04a', white: '#fff8ec', ink: '#1d2340', cream: '#fff0c9', skin: ['#ffd2a8', '#e9a874', '#a8683f', '#6e4128'] };
  const T = (col) => ({ top: light(col, 0.16), left: col, right: shade(col, 0.74) }); // three flat tones per paint
  const LAND = 14;
  const P = c.P;
  // satin bevel: a thin light line along the top edge of a shape
  const bevel = (pts, col, w = 2.2) => c.push(`<path d="${line(pts)}" fill="none" stroke="${light(col, 0.55)}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.85"/>`);
  function slab(x0, x1, y0, y1, r, z0, z1, col, sideCol, opts = {}) {
    const s = c.slab(x0, x1, y0, y1, r, z0, z1), sc = T(sideCol || col);
    c.push(`<path d="${poly(s.band)}" fill="${c.split(sc.left, sc.right, s.xa, s.xb, s.xf, 26 * S * r)}"/>`);
    c.push(`<path d="${poly(s.top)}" fill="${opts.topFill || T(col).top}" stroke="${opts.topFill || T(col).top}" stroke-width="1.2"/>`);
    // front rim highlight: the rounded toy edge catching light
    const n = s.top.length, front = s.top.slice(Math.floor(n * 0.25), Math.floor(n * 0.75) + 1);
    if (!opts.noBevel) bevel(front, col, 2.6);
    return s;
  }
  function box(x0, x1, y0, y1, z0, z1, col, r = 5, cols = {}) {
    const t = T(col);
    c.push(`<path d="${rp([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], r)}" fill="${cols.right || t.right}"/>`);
    c.push(`<path d="${rp([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], r)}" fill="${cols.left || t.left}"/>`);
    c.push(`<path d="${rp([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], r)}" fill="${cols.top || t.top}"/>`);
    bevel([P(x0 + 0.05, y1, z1 - 1), P(x1, y1, z1 - 1), P(x1, y0 + 0.05, z1 - 1)], cols.top || col, 1.8);
  }
  function cyl(gx, gy, r, z0, z1, col, topCol) {
    const s = c.cylSide(gx, gy, r, z0, z1), t = T(col);
    c.push(`<path d="${s.d}" fill="${c.split(t.left, t.right, s.c0[0] - s.rx, s.c0[0] + s.rx, s.c0[0] + s.rx * 0.25, s.rx * 0.3)}"/>`);
    c.push(`<path d="${s.top}" fill="${topCol || t.top}"/>`);
    c.push(`<path d="M${pt([s.c1[0] - s.rx * 0.96, s.c1[1] + s.ry * 0.2])}A${f(s.rx)} ${f(s.ry)} 0 0 0 ${pt([s.c1[0] + s.rx * 0.5, s.c1[1] + s.ry * 0.86])}" fill="none" stroke="${light(topCol || col, 0.6)}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.8"/>`);
    return s;
  }
  // painted ball: flat base, flat shade crescent, one round satin highlight
  function ball(cx, cy, r, col) {
    const id = c.id('bc');
    c.def(`<clipPath id="${id}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath>`);
    c.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${col}"/>`);
    c.push(`<circle cx="${f(cx - r * 0.38)}" cy="${f(cy - r * 0.42)}" r="${f(r * 1.12)}" fill="none" stroke="${shade(col, 0.76)}" stroke-width="${f(r * 0.7)}" clip-path="url(#${id})" transform="rotate(0)"/>`);
    c.push(`<ellipse cx="${f(cx - r * 0.38)}" cy="${f(cy - r * 0.42)}" rx="${f(r * 0.3)}" ry="${f(r * 0.22)}" transform="rotate(-30 ${f(cx - r * 0.38)} ${f(cy - r * 0.42)})" fill="#fff" fill-opacity="0.75"/>`);
  }
  const shadowAt = (gx, gy, r, z = LAND, k = 1) => { const p = P(gx, gy, z); c.push(`<ellipse cx="${f(p[0] + 3)}" cy="${f(p[1] + 2)}" rx="${f(Math.SQRT2 * 52 * S * r)}" ry="${f(Math.SQRT2 * 26 * S * r)}" fill="#14306a" fill-opacity="${0.26 * k}" filter="url(#hSoft)"/>`); };

  // ---- peg-doll guest: ball head ~42% of height, rounded peg body, painted face ----
  function guest(sx, sy, g, k = 1, shadow = true) {
    const u = (v) => f(v * k), X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k);
    const out = [];
    if (shadow) out.push(`<ellipse cx="${X(1)}" cy="${Y(0.5)}" rx="${u(8.5)}" ry="${u(3.6)}" fill="#14306a" fill-opacity="0.3"/>`);
    const bodyD = `M${X(-6.4)},${Y(-1.5)}C${X(-6.6)},${Y(-9)} ${X(-5)},${Y(-17)} ${X(-3.6)},${Y(-19.5)}L${X(3.6)},${Y(-19.5)}C${X(5)},${Y(-17)} ${X(6.6)},${Y(-9)} ${X(6.4)},${Y(-1.5)}Q${X(6.2)},${Y(0.6)} ${X(3.6)},${Y(0.6)}L${X(-3.6)},${Y(0.6)}Q${X(-6.2)},${Y(0.6)} ${X(-6.4)},${Y(-1.5)}Z`;
    const sp = (col) => c.og(`hsp${col}${g.dir}`, (id) => `<linearGradient id="${id}" x1="${g.dir > 0 ? 0 : 1}" y1="0" x2="${g.dir > 0 ? 1 : 0}" y2="0"><stop offset="0.56" stop-color="${col}"/><stop offset="0.56" stop-color="${shade(col, 0.76)}"/></linearGradient>`);
    out.push(`<path d="${bodyD}" fill="${sp(g.shirt)}"/>`);
    // trousers / skirt band: lower 40% of the peg painted
    const cid = c.id('hc'); c.def(`<clipPath id="${cid}"><path d="${bodyD}"/></clipPath>`);
    out.push(`<rect x="${f(sx - 8 * k)}" y="${Y(-7.2)}" width="${u(16)}" height="${u(9)}" fill="${sp(g.pants)}" clip-path="url(#${cid})"/>`);
    if (g.stripe) out.push(`<rect x="${f(sx - 8 * k)}" y="${Y(-14.5)}" width="${u(16)}" height="${u(2.4)}" fill="${K.white}" clip-path="url(#${cid})"/>`);
    // little stub arms
    out.push(`<path d="M${X(-5.2)},${Y(-15)}q${u(-2.6 * g.dir)},${u(4)} ${u(-1.4 * g.dir)},${u(7)}" stroke="${shade(g.shirt, 0.82)}" stroke-width="${u(3.4)}" fill="none" stroke-linecap="round"/>`);
    if (g.balloon) {
      out.push(`<path d="M${X(5.6)},${Y(-12)}C${X(9)},${Y(-22)} ${X(6)},${Y(-34)} ${X(9)},${Y(-44)}" stroke="#4a4a5a" stroke-width="${u(0.8)}" fill="none"/>`);
      out.push(`<ellipse cx="${X(9.5)}" cy="${Y(-49)}" rx="${u(5.4)}" ry="${u(6.2)}" fill="${g.balloon}"/><ellipse cx="${X(8)}" cy="${Y(-51.5)}" rx="${u(1.6)}" ry="${u(1.1)}" fill="#fff" fill-opacity="0.8"/>`);
    }
    out.push(`<path d="M${X(5.2)},${Y(-15)}q${u(2.6 * g.dir)},${u(4)} ${u(1.4 * g.dir)},${u(7)}" stroke="${g.shirt}" stroke-width="${u(3.4)}" fill="none" stroke-linecap="round"/>`);
    // head
    const hy = -27.5, hr = 8;
    out.push(`<circle cx="${X(0)}" cy="${Y(hy)}" r="${u(hr)}" fill="${g.skin}"/>`);
    out.push(`<path d="M${X(2.6)},${Y(hy - 7.5)}A${u(hr)} ${u(hr)} 0 0 ${g.dir > 0 ? 1 : 0} ${X(2.6)},${Y(hy + 7.5)}A${u(9)} ${u(9)} 0 0 ${g.dir > 0 ? 0 : 1} ${X(2.6)},${Y(hy - 7.5)}Z" fill="${shade(g.skin, 0.86)}"/>`);
    // hair
    if (g.hair === 'cap') out.push(`<path d="M${X(-8.2)},${Y(hy - 0.5)}C${X(-8.5)},${Y(hy - 11)} ${X(8.5)},${Y(hy - 11)} ${X(8.2)},${Y(hy - 0.5)}C${X(4)},${Y(hy - 4)} ${X(-3)},${Y(hy - 5)} ${X(-8.2)},${Y(hy - 0.5)}Z" fill="${g.hairCol}"/>`);
    if (g.hair === 'bob') out.push(`<path d="M${X(-8.6)},${Y(hy + 4)}C${X(-10)},${Y(hy - 12)} ${X(9.5)},${Y(hy - 12)} ${X(8.6)},${Y(hy - 1)}C${X(4)},${Y(hy - 5)} ${X(-2)},${Y(hy - 4)} ${X(-5)},${Y(hy + 0)}L${X(-5.5)},${Y(hy + 5)}Z" fill="${g.hairCol}"/>`);
    if (g.hair === 'buns') { out.push(`<path d="M${X(-8.2)},${Y(hy - 0.5)}C${X(-8.5)},${Y(hy - 11)} ${X(8.5)},${Y(hy - 11)} ${X(8.2)},${Y(hy - 0.5)}C${X(4)},${Y(hy - 4)} ${X(-3)},${Y(hy - 5)} ${X(-8.2)},${Y(hy - 0.5)}Z" fill="${g.hairCol}"/><circle cx="${X(-7.5)}" cy="${Y(hy - 6)}" r="${u(3.4)}" fill="${g.hairCol}"/><circle cx="${X(7)}" cy="${Y(hy - 7)}" r="${u(3.4)}" fill="${g.hairCol}"/>`); }
    if (g.hat) out.push(`<ellipse cx="${X(0)}" cy="${Y(hy - 5)}" rx="${u(10)}" ry="${u(2.6)}" fill="${shade(g.hat, 0.8)}"/><path d="M${X(-6.4)},${Y(hy - 5)}C${X(-6.4)},${Y(hy - 14)} ${X(6.4)},${Y(hy - 14)} ${X(6.4)},${Y(hy - 5)}Z" fill="${g.hat}"/>`);
    // painted face: two dot eyes and cheeks, looking the way they walk
    out.push(`<circle cx="${X(1.2)}" cy="${Y(hy + 0.6)}" r="${u(1.15)}" fill="${K.ink}"/><circle cx="${X(5.2)}" cy="${Y(hy + 0.6)}" r="${u(1.15)}" fill="${K.ink}"/>`);
    out.push(`<circle cx="${X(0.2)}" cy="${Y(hy + 3.6)}" r="${u(1.3)}" fill="#ff7b8a" fill-opacity="0.6"/><path d="M${X(2.4)},${Y(hy + 3.6)}q${u(1.2 * g.dir)},${u(1.2)} ${u(2.4 * g.dir)},0" stroke="${K.ink}" stroke-width="${u(0.8)}" fill="none" stroke-linecap="round"/>`);
    if (g.pack) out.push(`<rect x="${f(sx - (g.dir > 0 ? 9.5 : -4.5) * k)}" y="${Y(-17)}" width="${u(5)}" height="${u(9)}" rx="${u(2)}" fill="${g.pack}"/>`);
    return out.join('');
  }
  const G = [
    { dir: 1, shirt: K.red, pants: K.blue, skin: K.skin[0], hair: 'cap', hairCol: '#6b3b1f' },
    { dir: -1, shirt: K.yellow, pants: K.green, skin: K.skin[2], hair: 'buns', hairCol: '#2a1a12', balloon: K.red },
    { dir: 1, shirt: K.blue, pants: '#f7f2e6', skin: K.skin[1], hair: 'cap', hairCol: '#2a1a12', hat: K.yellow },
    { dir: -1, shirt: K.green, pants: K.blue, skin: K.skin[3], hair: 'bob', hairCol: '#1a1210', stripe: true },
    { dir: 1, shirt: '#ffffff', pants: K.red, skin: K.skin[0], hair: 'bob', hairCol: '#e0a12b', pack: K.blue },
    { dir: -1, shirt: K.red, pants: K.yellow, skin: K.skin[2], hair: 'cap', hairCol: '#3a2618', stripe: true },
  ];

  // ================= the board =================
  // tray (blue plastic) holding water; two land pieces; a raised hill; channel + pond
  c.push(`<ellipse cx="800" cy="${f(P(4, 4)[1] + 120)}" rx="640" ry="200" fill="#7a4a1a" fill-opacity="0.18" filter="url(#hSoftWide)"/>`);
  slab(0, 8, 0, 8, 0.9, -48, -6, '#38b6ff', K.blue, { topFill: 'url(#hWater)' });
  // water ripples (painted rings)
  for (const [x, y, r] of [[6.2, 6.4, 0.5], [6.9, 7.1, 0.3], [1.2, 4.75, 0.25], [6.9, 4.7, 0.22]]) c.push(`<path d="${smoothPath(c.circ(x, y, r, -6, 24), true)}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2"/>`);
  slab(0.35, 7.65, 0.35, 4.3, 0.5, -6, LAND, K.green, '#8a5a32');
  slab(0.35, 4.75, 5.15, 7.65, 0.5, -6, LAND, K.green, '#8a5a32');
  // hill (back left), stepped like a stacked toy block
  slab(0.7, 3.0, 0.7, 2.6, 0.55, LAND, LAND + 24, '#4cc45c', '#3a9a48');
  // paths: chunky cream slabs, rounded
  const PZ = LAND + 3;
  const paths = [[0.75, 7.25, 3.25, 3.95], [3.05, 3.75, 3.6, 7.3], [3.75, 4.4, 6.0, 6.7]];
  for (const [x0, x1, y0, y1] of paths) slab(x0, x1, y0, y1, 0.28, LAND, PZ, K.cream, '#e2b874', { noBevel: true });

  // ================= objects (depth sorted) =================
  // bridge over the channel (on the path line x 3.05-3.75)
  c.add(3.4 + 4.75 - 0.4, () => {
    box(2.95, 3.85, 4.15, 5.3, LAND - 4, PZ, K.yellow, 6);
    for (const xx of [2.98, 3.82]) {
      c.push(`<path d="${line([P(xx, 4.2, PZ + 1), P(xx, 5.25, PZ + 1)])}" stroke="${shade(K.red, 0.74)}" stroke-width="${9 * S}" stroke-linecap="round"/>`);
      for (const yy of [4.25, 4.72, 5.2]) c.push(`<path d="${line([P(xx, yy, PZ), P(xx, yy, PZ + 13)])}" stroke="${shade(K.red, xx > 3.5 ? 0.74 : 1)}" stroke-width="${5.5 * S}" stroke-linecap="round"/>`);
      c.push(`<path d="${line([P(xx, 4.2, PZ + 13), P(xx, 5.25, PZ + 13)])}" stroke="${xx > 3.5 ? shade(K.red, 0.8) : K.red}" stroke-width="${6.5 * S}" stroke-linecap="round"/>`);
      c.push(`<path d="${line([P(xx, 4.24, PZ + 14.6), P(xx, 5.2, PZ + 14.6)])}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>`);
    }
  });
  // lollipop trees on the hill and around
  const tree = (x, y, z, rad, col, h = 22) => c.add(x + y, () => {
    shadowAt(x + 0.15, y + 0.05, rad / 58, z, 1.1);
    cyl(x, y, 0.07, z, z + h, '#a0622c');
    const p = P(x, y, z + h + rad * 0.8); ball(p[0], p[1], rad * S, col);
  });
  tree(1.25, 1.35, LAND + 24, 17, K.green); tree(2.3, 1.15, LAND + 24, 13, '#7ccf3b'); tree(1.6, 2.15, LAND + 24, 12, K.green);
  tree(0.85, 6.0, LAND, 14, '#7ccf3b'); tree(1.0, 7.0, LAND, 10, K.green);
  // cone trees (stacked toy cones)
  const cone = (x, y, sc) => c.add(x + y, () => {
    shadowAt(x + 0.12, y, 0.28 * sc, LAND);
    cyl(x, y, 0.06, LAND, LAND + 8, '#a0622c');
    for (let i = 0; i < 3; i++) {
      const zb = LAND + 6 + i * 13 * sc, rr = (0.34 - i * 0.08) * sc, top = P(x, y, zb + 24 * sc - i * 3), b = P(x, y, zb), rx = Math.SQRT2 * 52 * S * rr;
      c.push(`<path d="M${pt([b[0] - rx, b[1]])}A${f(rx)} ${f(rx / 2)} 0 0 0 ${pt([b[0] + rx, b[1]])}L${pt(top)}Z" fill="${c.split('#2fa84a', '#1f7d3a', b[0] - rx, b[0] + rx, b[0] + rx * 0.2, 2)}"/>`);
    }
  });
  cone(7.0, 0.85, 1); cone(4.25, 7.15, 0.9);

  // ---- stubby coaster: a fat oval track with one hump, chunky yellow posts, fat cars ----
  const cx0 = 5.55, cy0 = 2.05, rxo = 1.5, ryo = 1.25;
  const trk = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120 * Math.PI * 2, x = cx0 + rxo * Math.cos(t), y = cy0 + ryo * Math.sin(t);
    let d = Math.atan2(Math.sin(t - 3.6), Math.cos(t - 3.6));
    const z = LAND + 18 + 54 * Math.exp(-((d / 0.75) ** 2)) - 6 * Math.exp(-(((d - 1.4) / 0.5) ** 2));
    trk.push([x, y, z, t]);
  }
  const back = trk.filter((p) => p[0] + p[1] < cx0 + cy0 + 0.25), front = trk.filter((p) => p[0] + p[1] >= cx0 + cy0 - 0.25);
  const segs = (arr) => { const out = []; let cur = []; for (let i = 0; i < trk.length; i++) { if (arr.includes(trk[i])) cur.push(trk[i]); else if (cur.length) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out; };
  const drawTrack = (pts) => {
    const sp = pts.map((p) => P(p[0], p[1], p[2]));
    c.push(`<path d="${smoothPath(sp)}" fill="none" stroke="${shade(K.red, 0.62)}" stroke-width="${f(13 * S)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    c.push(`<path d="${smoothPath(sp.map((q) => [q[0], q[1] - 3]))}" fill="none" stroke="${K.red}" stroke-width="${f(9 * S)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    c.push(`<path d="${smoothPath(sp.map((q) => [q[0], q[1] - 6]))}" fill="none" stroke="#ffb3a8" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.9"/>`);
  };
  c.add(cx0 + cy0 - 1.2, () => {
    shadowAt(cx0, cy0 + 0.1, 1.45, LAND, 0.8);
    // station platform under the front straight
    box(5.5, 6.9, 2.95, 3.45, LAND, LAND + 12, K.white, 6);
    segs(back).forEach(drawTrack);
    for (let i = 0; i < trk.length; i += 8) { const p = trk[i]; if (p[0] + p[1] < cx0 + cy0 + 0.25) cyl(p[0], p[1], 0.075, LAND, p[2] - 5, K.yellow); }
  });
  c.add(cx0 + cy0 + 0.6, () => {
    for (let i = 0; i < trk.length; i += 8) { const p = trk[i]; if (p[0] + p[1] >= cx0 + cy0 + 0.25) cyl(p[0], p[1], 0.075, LAND, p[2] - 5, K.yellow); }
    segs(front).forEach(drawTrack);
    // three fat cars on the front-right of the oval, big-head riders
    [0.5, 0.82, 1.14].forEach((t, i) => {
      const x = cx0 + rxo * Math.cos(t), y = cy0 + ryo * Math.sin(t);
      const p = P(x, y, trk[Math.round(t / (Math.PI * 2) * 120)][2] + 4);
      const q = P(cx0 + rxo * Math.cos(t + 0.05), cy0 + ryo * Math.sin(t + 0.05)); const ang = Math.atan2(q[1] - P(x, y)[1], q[0] - P(x, y)[0]) * 180 / Math.PI;
      const col = [K.blue, K.yellow, K.green][i];
      c.push(guest(p[0] - 1, p[1] - 6, { ...G[(i + 2) % 6], dir: -1 }, 0.6 * S, false));
      c.push(`<g transform="translate(${pt(p)}) rotate(${f(ang)})"><rect x="-18" y="-13" width="36" height="20" rx="9" fill="${shade(col, 0.74)}"/><rect x="-18" y="-15" width="36" height="13" rx="6.5" fill="${col}"/><rect x="-14" y="-13" width="28" height="3" rx="1.5" fill="#fff" fill-opacity="0.6"/></g>`);
    });
  });

  // ---- teacup flat ride on the front land ----
  const tx = 2.15, ty = 6.35;
  c.add(tx + ty - 0.4, () => {
    shadowAt(tx + 0.1, ty + 0.06, 1.25, LAND, 1);
    const s = cyl(tx, ty, 1.2, LAND, LAND + 10, K.white);
    // a red band around the base
    const b = c.cylSide(tx, ty, 1.21, LAND, LAND + 5);
    c.push(`<path d="${b.d}" fill="${c.split(K.red, shade(K.red, 0.74), b.c0[0] - b.rx, b.c0[0] + b.rx, b.c0[0] + b.rx * 0.25, b.rx * 0.3)}"/>`);
    // painted wedges on the turntable
    for (let i = 0; i < 12; i++) {
      const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2, pts = [P(tx, ty, LAND + 10)];
      for (let j = 0; j <= 6; j++) { const a = a0 + (a1 - a0) * j / 6; pts.push(P(tx + 1.2 * Math.cos(a), ty + 1.2 * Math.sin(a), LAND + 10)); }
      c.push(`<path d="${poly(pts)}" fill="${i % 2 ? light(K.yellow, 0.1) : light(K.white, 0.1)}"/>`);
    }
    const cups = [0.4, 2.5, 4.6].map((a, i) => ({ a, x: tx + 0.7 * Math.cos(a), y: ty + 0.7 * Math.sin(a), col: [K.red, K.blue, K.yellow][i] }));
    const hub = { x: tx, y: ty, hub: true };
    [...cups, hub].sort((p, q) => (p.x + p.y) - (q.x + q.y)).forEach((cu) => {
      const z0 = LAND + 10;
      if (cu.hub) { cyl(tx, ty, 0.18, z0, z0 + 26, K.blue); const p = P(tx, ty, z0 + 32); ball(p[0], p[1], 13 * S, K.red); const q = P(tx, ty, z0 + 47); ball(q[0], q[1], 5 * S, K.yellow); return; }
      // cup: a fat flared cylinder with polka dots and a handle, two big-head riders inside
      const s2 = c.cylSide(cu.x, cu.y, 0.36, z0 + 2, z0 + 22); const t = T(cu.col);
      const flare = `M${pt([s2.c1[0] - s2.rx, s2.c1[1]])}C${pt([s2.c1[0] - s2.rx, s2.c1[1] + 18])} ${pt([s2.c0[0] - s2.rx * 0.6, s2.c0[1]])} ${pt([s2.c0[0] - s2.rx * 0.45, s2.c0[1]])}A${f(s2.rx * 0.45)} ${f(s2.ry * 0.45)} 0 0 0 ${pt([s2.c0[0] + s2.rx * 0.45, s2.c0[1]])}C${pt([s2.c0[0] + s2.rx * 0.6, s2.c0[1]])} ${pt([s2.c1[0] + s2.rx, s2.c1[1] + 18])} ${pt([s2.c1[0] + s2.rx, s2.c1[1]])}Z`;
      c.push(`<ellipse cx="${f(s2.c0[0])}" cy="${f(s2.c0[1] + 2)}" rx="${f(s2.rx * 0.7)}" ry="${f(s2.ry * 0.6)}" fill="#14306a" fill-opacity="0.3"/>`);
      c.push(`<path d="${flare}" fill="${c.split(t.left, t.right, s2.c0[0] - s2.rx, s2.c0[0] + s2.rx, s2.c0[0] + s2.rx * 0.25, s2.rx * 0.3)}"/>`);
      for (const [dx, dy] of [[-0.55, 0.45], [0.05, 0.62], [0.6, 0.42], [-0.25, 0.85], [0.35, 0.88]]) c.push(`<circle cx="${f(s2.c1[0] + dx * s2.rx)}" cy="${f(s2.c1[1] + dy * 22 * S)}" r="${f(2.6 * S)}" fill="#fff" fill-opacity="${dx > 0.2 ? 0.7 : 0.95}"/>`);
      c.push(`<path d="M${pt([s2.c1[0] + s2.rx * 0.95, s2.c1[1] + 6])}c${f(10 * S)},-2 ${f(10 * S)},${f(14 * S)} ${f(-1 * S)},${f(14 * S)}" fill="none" stroke="${t.right}" stroke-width="${f(4 * S)}" stroke-linecap="round"/>`);
      c.push(`<path d="${s2.top}" fill="${shade(cu.col, 0.55)}"/>`);
      c.push(guest(s2.c1[0] - 6, s2.c1[1] + s2.ry + 3, { ...G[(Math.round(cu.a) + 1) % 6], dir: 1, balloon: null }, 0.62 * S, false));
      c.push(guest(s2.c1[0] + 7, s2.c1[1] + s2.ry + 1, { ...G[(Math.round(cu.a) + 4) % 6], dir: -1, balloon: null }, 0.62 * S, false));
      // front wall of the cup redrawn over the riders' legs: flare minus the opening
      const mid = c.id('hm');
      c.def(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><path d="${flare}" fill="#fff"/><path d="${s2.top}" fill="#000"/></mask>`);
      c.push(`<g mask="url(#${mid})"><path d="${flare}" fill="${c.split(t.left, t.right, s2.c0[0] - s2.rx, s2.c0[0] + s2.rx, s2.c0[0] + s2.rx * 0.25, s2.rx * 0.3)}"/>`);
      for (const [dx, dy] of [[-0.55, 0.45], [0.05, 0.62], [0.6, 0.42], [-0.25, 0.85], [0.35, 0.88]]) c.push(`<circle cx="${f(s2.c1[0] + dx * s2.rx)}" cy="${f(s2.c1[1] + dy * 22 * S)}" r="${f(2.6 * S)}" fill="#fff" fill-opacity="${dx > 0.2 ? 0.7 : 0.95}"/>`);
      c.push(`</g>`);
      c.push(`<path d="M${pt([s2.c1[0] - s2.rx, s2.c1[1]])}A${f(s2.rx)} ${f(s2.ry)} 0 0 0 ${pt([s2.c1[0] + s2.rx, s2.c1[1]])}" fill="none" stroke="${light(cu.col, 0.3)}" stroke-width="${f(3.4 * S)}"/>`);
    });
  });

  // ---- popcorn stall: fat striped box, white counter, giant bucket on top ----
  c.add(3.3 + 2.7, () => {
    shadowAt(3.75, 2.75, 0.55, LAND, 1);
    const x0 = 3.2, x1 = 4.25, y0 = 2.3, y1 = 3.12, z1 = LAND + 26;
    box(x0, x1, y0, y1, LAND, z1, K.red, 7);
    // white stripes on the two visible faces
    for (let i = 1; i < 5; i += 2) {
      const xa = x0 + (x1 - x0) * i / 5, xb = x0 + (x1 - x0) * (i + 1) / 5;
      c.push(`<path d="${poly([P(xa, y1, z1 - 3), P(xb, y1, z1 - 3), P(xb, y1, LAND + 3), P(xa, y1, LAND + 3)])}" fill="${K.white}"/>`);
      const ya = y0 + (y1 - y0) * i / 5, yb = y0 + (y1 - y0) * (i + 1) / 5;
      c.push(`<path d="${poly([P(x1, ya, z1 - 3), P(x1, yb, z1 - 3), P(x1, yb, LAND + 3), P(x1, ya, LAND + 3)])}" fill="${shade(K.white, 0.8)}"/>`);
    }
    box(x0 - 0.1, x1 + 0.1, y0 - 0.1, y1 + 0.12, z1, z1 + 5, K.white, 4);
    const s = cyl(3.75, 2.7, 0.3, z1 + 5, z1 + 34, K.white);
    for (let i = 0; i < 3; i++) { const ox = (i - 1) * s.rx * 0.55; c.push(`<path d="M${pt([s.c1[0] + ox - 4, s.c1[1] + 4])}L${pt([s.c0[0] + ox * 0.9 - 3.4, s.c0[1] + 3])}L${pt([s.c0[0] + ox * 0.9 + 3.4, s.c0[1] + 3])}L${pt([s.c1[0] + ox + 4, s.c1[1] + 4])}Z" fill="${i === 2 ? shade(K.red, 0.8) : K.red}"/>`); }
    for (const [dx, dy, r] of [[-12, -4, 8], [0, -9, 9], [11, -4, 8], [-5, 1, 7], [6, 1, 7], [2, -15, 6]]) ball(s.c1[0] + dx, s.c1[1] + dy, r, '#fff1b8');
  });
  // bench + lamp along the main path
  c.add(1.9 + 3.0, () => {
    box(1.55, 2.35, 2.95, 3.18, LAND, LAND + 7, K.blue, 4);
    box(1.55, 2.35, 2.92, 3.02, LAND + 7, LAND + 17, K.blue, 3);
  });
  c.add(1.4 + 6.0, () => {});
  // bushes and flowers (round painted balls in clusters)
  const bush = (x, y, cols) => c.add(x + y, () => { shadowAt(x, y, 0.3, LAND, 0.8); cols.forEach(([dx, dy, r, col]) => { const p = P(x + dx, y + dy, LAND + r * 0.8); ball(p[0], p[1], r * S, col); }); });
  bush(4.35, 5.55, [[0, 0, 9, '#2fa84a'], [0.22, 0.12, 7, '#3fc25a'], [-0.1, 0.25, 4, K.red]]);
  bush(6.95, 3.75, [[0, 0, 8, '#2fa84a'], [0.2, -0.1, 4, K.yellow], [-0.15, 0.1, 4, K.red]]);
  bush(0.95, 2.95, [[0, 0, 9, '#3fc25a'], [0.15, 0.2, 5, K.yellow]]);
  // a duck boat on the pond
  c.add(6.2 + 6.3, () => {
    const p = P(6.25, 6.35, -4);
    c.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1] + 4)}" rx="${f(26 * S)}" ry="${f(9 * S)}" fill="#ffffff" fill-opacity="0.45"/>`);
    c.push(`<path d="M${f(p[0] - 22 * S)},${f(p[1] - 2)}C${f(p[0] - 20 * S)},${f(p[1] + 12 * S)} ${f(p[0] + 20 * S)},${f(p[1] + 12 * S)} ${f(p[0] + 22 * S)},${f(p[1] - 6)}L${f(p[0] + 8 * S)},${f(p[1] - 4 * S)}Z" fill="${K.yellow}"/>`);
    c.push(`<path d="M${f(p[0] - 22 * S)},${f(p[1] - 2)}C${f(p[0] - 20 * S)},${f(p[1] + 12 * S)} ${f(p[0] + 20 * S)},${f(p[1] + 12 * S)} ${f(p[0] + 22 * S)},${f(p[1] - 6)}" fill="none" stroke="${shade(K.yellow, 0.75)}" stroke-width="${f(4 * S)}"/>`);
    ball(p[0] + 16 * S, p[1] - 15 * S, 8 * S, K.yellow);
    c.push(`<path d="M${f(p[0] + 22 * S)},${f(p[1] - 15 * S)}l${f(7 * S)},${f(2 * S)}l${f(-7 * S)},${f(3 * S)}Z" fill="#ff8a1a"/><circle cx="${f(p[0] + 18 * S)}" cy="${f(p[1] - 17 * S)}" r="${f(1.3 * S)}" fill="${K.ink}"/>`);
    c.push(guest(p[0] - 4 * S, p[1] - 0 * S, { ...G[4], dir: 1 }, 0.62 * S, false));
  });
  // walking guests
  const walk = [[1.4, 3.6, 0], [2.4, 3.55, 1], [4.6, 3.65, 2], [6.3, 3.62, 3], [3.4, 4.95, 4], [3.42, 6.35, 5], [4.05, 6.4, 1]];
  walk.forEach(([x, y, gi], i) => c.add(x + y + 0.1, () => { const p = P(x, y, PZ); c.push(guest(p[0], p[1], { ...G[gi], dir: i % 2 ? -1 : 1 }, 0.95 * S)); }));
  c.flush();

  // ---- composition: tilt-shift (scene drawn twice: blurred, and sharp through a band mask) ----
  const scene = c.o.join('\n');
  const defs = c.defs.join('') + `
    <linearGradient id="hBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7c2"/><stop offset="1" stop-color="#f6c98c"/></linearGradient>
    <linearGradient id="hWater" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#57c8ff"/><stop offset="1" stop-color="#2a9ff0"/></linearGradient>
    <filter id="hSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="hSoftWide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="hTilt" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="4.2"/></filter>
    <filter id="hBokeh"><feGaussianBlur stdDeviation="14"/></filter>
    <linearGradient id="hBand" x1="0" y1="0" x2="0" y2="1000" gradientUnits="userSpaceOnUse"><stop offset="0.26" stop-color="#000"/><stop offset="0.42" stop-color="#fff"/><stop offset="0.66" stop-color="#fff"/><stop offset="0.8" stop-color="#000"/></linearGradient>
    <mask id="hMask"><rect width="1600" height="1000" fill="url(#hBand)"/></mask>
    <g id="hScene">${scene}</g>`;
  const R = rng(7); let bokeh = '';
  for (let i = 0; i < 16; i++) { const y = R() < 0.5 ? 40 + R() * 200 : 820 + R() * 170; bokeh += `<circle cx="${f(R() * 1600)}" cy="${f(y)}" r="${f(20 + R() * 46)}" fill="${['#ffffff', '#ffd27a', '#ff9e7a', '#9fd3ff'][i % 4]}" fill-opacity="0.35"/>`; }
  const bg = `<rect width="1600" height="1000" fill="url(#hBg)"/><g filter="url(#hBokeh)">${bokeh}</g>`;
  const sceneOut = `<use href="#hScene" filter="url(#hTilt)"/><use href="#hScene" mask="url(#hMask)"/>`;
  let lu = ''; G.forEach((g, i) => { lu += guest(96 + i * 76, 1000 - 42, g, 2 * 0.95 * S); });
  frame({
    key: 'h', letter: 'H', name: 'Chunky toy diorama', file: 'h-toy',
    blurb: ['Painted wooden toys on a plastic tray, shot close with a', 'tilt-shift lens. Big-head peg-doll guests, stubby fat rides,', 'rounded board edges, flat satin paint in primaries.'],
    pal: [K.red, K.blue, K.yellow, K.green, K.white, '#38b6ff', K.cream], ink: K.ink, sub: '#6a4a2a', panel: '#fff8ecdd', panelInk: '#5a3a1e',
    bg, scene: sceneOut, extraDefs: defs, lineup: { svg: lu, w: 470 },
    note: ['Every object = 3 flat paints + 1 bevel line.', 'No outlines. Guests: peg body + ball head (42%).', 'Board: rounded slabs, blue tray, water inside.', 'Tilt-shift = blur outside a horizontal band.', 'Satin highlight: one white oval per ball.'],
  });
}

// ======================================================================
// I — Neon night
// Night is the base look, not a filter: a dark navy park where rides, paths and edges are drawn as
// glowing tube lines (cyan, magenta, yellow) with almost no fill, coloured light pools on the ground,
// mirrored neon in the canal, and guests as dark silhouettes rim-lit by the nearest light.
// ======================================================================
function styleI() {
  const S = 1.0, OY = 236, WL = -12; // water level
  const c = Ctx(S, 800, OY), m = Ctx(S, 800, OY, WL); // m = the canal's mirror image
  const N = { cyan: '#36f1ff', mag: '#ff3fd0', yel: '#ffe04a', warm: '#ffb54a', night: '#0a0e2a', ground: '#141b47', ground2: '#18225a', path: '#222d6e', sil: '#05071a' };
  // neon tube: wide faint halo + mid glow + white-hot core. No blur filter: three strokes = cheap on canvas too
  const neon = (cc, d, col, w = 2, k = 1) => {
    cc.push(`<path d="${d}" fill="none" stroke="${col}" stroke-opacity="${f(0.1 * k)}" stroke-width="${f(w * 6.5)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    cc.push(`<path d="${d}" fill="none" stroke="${col}" stroke-opacity="${f(0.32 * k)}" stroke-width="${f(w * 2.6)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    cc.push(`<path d="${d}" fill="none" stroke="${light(col, 0.55)}" stroke-opacity="${f(Math.min(1, 0.95 * k))}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  };
  const dim = (cc, d, col, w = 1, a = 0.45) => cc.push(`<path d="${d}" fill="none" stroke="${col}" stroke-opacity="${a}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  const pool = (cc, gx, gy, r, col, a = 0.5, z = 0) => { const p = cc.P(gx, gy, z); cc.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${f(Math.SQRT2 * 52 * r)}" ry="${f(Math.SQRT2 * 26 * r)}" fill="${c.og('pool' + col + a, (id) => `<radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity="${a}"/><stop offset="0.45" stop-color="${col}" stop-opacity="${f(a * 0.38)}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`)}"/>`); };
  const bulb = (cc, p, col, r = 2.2) => cc.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(r * 3.2)}" fill="${col}" fill-opacity="0.18"/><circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(r)}" fill="${light(col, 0.7)}"/>`);

  // ---- silhouette guest: dark shape, rim light on the lit side, one glowing accessory ----
  function guest(cc, sx, sy, g, k = 1) {
    const X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), u = (v) => f(v * k), out = [];
    const body = `M${X(-3.6)},${Y(-11)}C${X(-4.4)},${Y(-17)} ${X(-3)},${Y(-19.5)} ${X(0)},${Y(-19.5)}C${X(3)},${Y(-19.5)} ${X(4.4)},${Y(-17)} ${X(3.6)},${Y(-11)}L${X(2.6)},${Y(-9)}L${X(-2.6)},${Y(-9)}Z`;
    const legs = `M${X(-1.4)},${Y(-9.5)}L${X(-1.8 - g.step)},${Y(-0.6)}M${X(1.4)},${Y(-9.5)}L${X(1.8 + g.step)},${Y(-0.6)}`;
    const head = ellD([+X(0.3), +Y(-23.2)], 3.3 * k, 3.5 * k);
    out.push(`<ellipse cx="${X(0)}" cy="${Y(0)}" rx="${u(6)}" ry="${u(2.2)}" fill="#000" fill-opacity="0.45"/>`);
    // rim light: the whole silhouette in the light's colour, nudged toward the light, then the dark shape on top
    const sil = (col, dx, dy) => `<g transform="translate(${f(dx)},${f(dy)})"><path d="${legs}" stroke="${col}" stroke-width="${u(2.6)}" stroke-linecap="round" fill="none"/><path d="${body}" fill="${col}"/><path d="${head}" fill="${col}"/></g>`;
    out.push(sil(g.rimCol, 0, 0).replace('<g ', `<g opacity="0.25" filter="url(#iHalo)" `));
    out.push(sil(light(g.rimCol, 0.25), g.rim * 1.3 * k, -0.5 * k));
    out.push(sil('#0a0d26', 0, 0));
    // top light on head and shoulders (the overhead lamp)
    out.push(`<path d="M${X(-2.4)},${Y(-25.8)}Q${X(0.3)},${Y(-27.6)} ${X(3)},${Y(-25.8)}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="${u(0.9)}" fill="none" stroke-linecap="round"/>`);
    if (g.acc === 'balloon') { out.push(`<path d="M${X(3)},${Y(-14)}Q${X(7)},${Y(-24)} ${X(6)},${Y(-34)}" stroke="${g.accCol}" stroke-opacity="0.6" stroke-width="${u(0.6)}" fill="none"/>`); const p = [+X(6.2), +Y(-38)]; out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${u(11)}" fill="${g.accCol}" fill-opacity="0.16"/><ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${u(4)}" ry="${u(4.6)}" fill="${g.accCol}" fill-opacity="0.85"/><ellipse cx="${f(p[0] - 1.2 * k)}" cy="${f(p[1] - 1.6 * k)}" rx="${u(1.4)}" ry="${u(1.8)}" fill="#fff" fill-opacity="0.8"/>`); }
    if (g.acc === 'band') out.push(`<path d="M${X(-3)},${Y(-25)}Q${X(0.3)},${Y(-27)} ${X(3.5)},${Y(-24.5)}" stroke="${g.accCol}" stroke-width="${u(3.4)}" stroke-opacity="0.3" fill="none" stroke-linecap="round"/><path d="M${X(-3)},${Y(-25)}Q${X(0.3)},${Y(-27)} ${X(3.5)},${Y(-24.5)}" stroke="${light(g.accCol, 0.5)}" stroke-width="${u(1.2)}" fill="none" stroke-linecap="round"/>`);
    if (g.acc === 'stick') out.push(`<path d="M${X(3.6)},${Y(-12)}L${X(6.5)},${Y(-20)}" stroke="${g.accCol}" stroke-width="${u(4)}" stroke-opacity="0.3" stroke-linecap="round"/><path d="M${X(3.6)},${Y(-12)}L${X(6.5)},${Y(-20)}" stroke="${light(g.accCol, 0.5)}" stroke-width="${u(1.6)}" stroke-linecap="round"/>`);
    if (g.acc === 'phone') out.push(`<circle cx="${X(4.5)}" cy="${Y(-15)}" r="${u(5)}" fill="#bfe8ff" fill-opacity="0.2"/><rect x="${f(+X(4.5) - 1.2 * k)}" y="${Y(-17)}" width="${u(2.4)}" height="${u(3.6)}" rx="${u(0.6)}" fill="#e6f7ff"/>`);
    if (g.acc === 'ears') out.push(`<circle cx="${X(-2.6)}" cy="${Y(-26.4)}" r="${u(1.6)}" fill="none" stroke="${light(g.accCol, 0.4)}" stroke-width="${u(1)}"/><circle cx="${X(3.2)}" cy="${Y(-26.4)}" r="${u(1.6)}" fill="none" stroke="${light(g.accCol, 0.4)}" stroke-width="${u(1)}"/>`);
    return out.join('');
  }
  const G = [
    { dir: 1, step: 1.4, rim: 1, rimCol: N.cyan, acc: 'balloon', accCol: N.mag },
    { dir: -1, step: -1.2, rim: -1, rimCol: N.warm, acc: 'band', accCol: N.cyan },
    { dir: 1, step: -1.4, rim: 1, rimCol: N.mag, acc: 'stick', accCol: N.yel },
    { dir: -1, step: 1.2, rim: 1, rimCol: N.cyan, acc: 'phone' },
    { dir: 1, step: 1.1, rim: -1, rimCol: N.yel, acc: 'ears', accCol: N.mag },
    { dir: -1, step: -1.3, rim: -1, rimCol: N.mag, acc: 'balloon', accCol: N.yel },
  ];

  // ================= terrain =================
  const slab = (x0, x1, y0, y1, z0, z1, top, side, edge, r = 0.18) => {
    const s = c.slab(x0, x1, y0, y1, r, z0, z1);
    c.push(`<path d="${poly(s.band)}" fill="${c.split(side, shade(side, 0.7), s.xa, s.xb, s.xf, 4)}"/>`);
    c.push(`<path d="${poly(s.top)}" fill="${top}" stroke="${top}" stroke-width="1"/>`);
    if (edge) { const n = s.top.length; dim(c, line(s.top.slice(Math.floor(n * 0.25), Math.floor(n * 0.75) + 1)), edge, 1.4, 0.7); dim(c, line(s.bot.slice(Math.floor(n * 0.25), Math.floor(n * 0.75) + 1)), edge, 1, 0.25); }
    return s;
  };
  const base = slab(0, 11, 0, 11, -40, WL, '#0b1640', '#070b22', null, 0.25);
  const waterTop = base.top;
  // water: deep gradient + reflections (mirror ctx), then ripple streaks
  c.push(`<path d="${poly(waterTop)}" fill="url(#iWater)"/>`);
  const reflectId = c.id('wclip'); c.def(`<clipPath id="${reflectId}"><path d="${poly(c.rr(0, 11, 5.95, 7.45, 0.1, WL))}"/></clipPath>`);
  const reflectAt = c.o.length; // reflections are spliced in here once the objects exist
  const R = rng(3);
  for (let i = 0; i < 46; i++) { const x = 0.3 + R() * 10.4, y = 6.1 + R() * 1.2, p = c.P(x, y, WL), w = 6 + R() * 22; c.push(`<path d="M${f(p[0] - w)},${f(p[1])}h${f(w * 2)}" stroke="${[N.cyan, N.mag, '#7c8bff'][i % 3]}" stroke-opacity="${f(0.12 + R() * 0.2)}" stroke-width="1.2" stroke-linecap="round"/>`); }
  slab(0.1, 10.9, 0.1, 5.95, WL, 0, N.ground, '#0d1236', N.cyan);
  slab(0.1, 10.9, 7.45, 10.9, WL, 0, N.ground, '#0d1236', N.cyan);
  // faint tile grid: the game's grid, visible only as a dim lattice
  for (let i = 1; i < 11; i++) for (const [y0, y1] of [[0.1, 5.95], [7.45, 10.9]]) { c.push(`<path d="${line([c.P(i, y0), c.P(i, y1)])}" stroke="#2a3a8a" stroke-opacity="0.28" stroke-width="0.8"/>`); }
  for (const y of [1, 2, 3, 4, 5, 8, 9, 10]) c.push(`<path d="${line([c.P(0.1, y), c.P(10.9, y)])}" stroke="#2a3a8a" stroke-opacity="0.28" stroke-width="0.8"/>`);
  // light pools (drawn on the ground before everything standing)
  const lamps = [[1.3, 4.45], [3.9, 4.45], [7.1, 4.45], [9.8, 4.45], [4.6, 8.0], [6.6, 8.0], [9.9, 9.9]];
  const poolLayer = () => {
    pool(c, 2.4, 2.6, 2.4, N.mag, 0.32); pool(c, 8.2, 9.3, 2.0, N.yel, 0.3); pool(c, 8.2, 9.3, 1.0, N.mag, 0.25);
    pool(c, 2.6, 8.8, 1.3, N.warm, 0.45); pool(c, 7.6, 2.6, 2.6, N.cyan, 0.12);
    lamps.forEach(([x, y]) => pool(c, x, y + 0.2, 1.1, '#ffd690', 0.42));
  };
  // paths: dim fill, cyan edge tubes, a dashed centre strip of tiny lights
  const pathRect = (x0, x1, y0, y1) => {
    const top = c.rr(x0, x1, y0, y1, 0.08, 1);
    c.push(`<path d="${poly(top)}" fill="${N.path}" fill-opacity="0.9"/>`);
  };
  const pathEdges = (x0, x1, y0, y1, sides) => {
    for (const s of sides) {
      const seg = s === 'n' ? [[x0, y0], [x1, y0]] : s === 's' ? [[x0, y1], [x1, y1]] : s === 'w' ? [[x0, y0], [x0, y1]] : [[x1, y0], [x1, y1]];
      neon(c, line(seg.map(([x, y]) => c.P(x, y, 1))), N.cyan, 1.2, 0.8);
    }
  };
  pathRect(0.4, 10.6, 4.6, 5.5); pathRect(4.95, 5.85, 7.45, 9.2); pathRect(5.85, 9.0, 8.4, 9.2); pathRect(1.6, 4.95, 8.4, 9.2);
  poolLayer();
  pathEdges(0.4, 10.6, 4.6, 5.5, ['n']);
  neon(c, line([[0.4, 5.5], [4.95, 5.5]].map(([x, y]) => c.P(x, y, 1))), N.cyan, 1.2, 0.8);
  neon(c, line([[5.85, 5.5], [10.6, 5.5]].map(([x, y]) => c.P(x, y, 1))), N.cyan, 1.2, 0.8);
  neon(c, line([[1.6, 8.4], [4.95, 8.4], [4.95, 7.45]].map(([x, y]) => c.P(x, y, 1))), N.cyan, 1.2, 0.8);
  neon(c, line([[5.85, 7.45], [5.85, 8.4], [9.0, 8.4]].map(([x, y]) => c.P(x, y, 1))), N.cyan, 1.2, 0.8);
  neon(c, line([[1.6, 9.2], [9.0, 9.2]].map(([x, y]) => c.P(x, y, 1))), N.cyan, 1.2, 0.8);
  for (let x = 0.7; x < 10.5; x += 0.32) { const p = c.P(x, 5.05, 1); c.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="1.1" fill="${N.yel}" fill-opacity="0.55"/>`); }

  // ================= objects =================
  // ---- Ferris wheel (the big ride): plane along x, two magenta rims, 12 lit gondolas ----
  const W0 = { x: 2.45, y: 2.55, R: 1.95 }, RZ = 56, HUB = W0.R * RZ + 18;
  function wheel(cc, k = 1) {
    const wp = (a, dy, rr = W0.R) => cc.P(W0.x + rr * Math.cos(a), W0.y + dy, HUB + rr * RZ * Math.sin(a));
    // A-frame legs
    for (const dy of [-0.3, 0.3]) for (const dx of [-1.0, 1.0]) dim(cc, line([cc.P(W0.x + dx, W0.y + dy * 1.6, 0), cc.P(W0.x, W0.y + dy, HUB)]), N.cyan, 2.2, 0.55 * k);
    const rim = (dy, a) => { const pts = []; for (let i = 0; i <= 72; i++) pts.push(wp(i / 72 * Math.PI * 2, dy)); return poly(pts); };
    neon(cc, rim(-0.22), N.mag, 1.8, 0.55 * k);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; dim(cc, line([cc.P(W0.x, W0.y + 0.22, HUB), wp(a, 0.22)]), N.mag, 1, 0.5 * k); }
    neon(cc, rim(0.22, 1), N.mag, 2.2, k);
    neon(cc, rim(0.22).replace(/./g, (ch) => ch), N.mag, 0.1, 0); // keeps the front rim on top
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + 0.1, p = wp(a, 0.0);
      dim(cc, line([p, [p[0], p[1] + 6]]), N.yel, 1, 0.6 * k);
      cc.push(`<rect x="${f(p[0] - 6)}" y="${f(p[1] + 5)}" width="12" height="10" rx="3.5" fill="#ffd56a" fill-opacity="${f(0.22 * k)}" stroke="${N.yel}" stroke-opacity="${f(0.9 * k)}" stroke-width="1.3"/>`);
      cc.push(`<rect x="${f(p[0] - 4)}" y="${f(p[1] + 7)}" width="8" height="4" rx="1.5" fill="#fff4c4" fill-opacity="${f(0.85 * k)}"/>`);
    }
    for (let i = 0; i < 24; i++) bulb(cc, wp(i / 24 * Math.PI * 2, 0.22), '#ffffff', 1.3 * (k > 0.5 ? 1 : 0.8));
    bulb(cc, cc.P(W0.x, W0.y + 0.22, HUB), N.yel, 4);
  }
  // ---- coaster: yellow neon rails, a lift, a drop and a vertical loop ----
  const loop = []; for (let i = 0; i <= 16; i++) { const t = i / 16 * Math.PI * 2; loop.push([6.7 - 0.72 * Math.sin(t), 1.05 + 0.5 * i / 16, 58 - 48 * Math.cos(t)]); }
  const ctrl = [[6.0, 4.15, 6], [7.2, 4.15, 6], [8.3, 4.0, 30], [9.3, 3.5, 92], [9.95, 2.7, 128], [10.0, 1.7, 122], [9.4, 0.95, 70], [8.4, 0.8, 16], [7.5, 0.95, 10], ...loop.slice(1, 16), [5.7, 1.7, 10], [5.15, 2.5, 22], [5.2, 3.5, 18], [5.4, 4.0, 8]];
  const trk = spline3(ctrl, 5, true);
  function coaster(cc, k = 1) {
    const rails = [[], []], sup = [];
    trk.forEach((p, i) => {
      const q = trk[(i + 1) % trk.length], o = trk[(i - 1 + trk.length) % trk.length];
      let tx = q[0] - o[0], ty = q[1] - o[1]; const L = Math.hypot(tx, ty);
      if (L < 0.03) { tx = 0; ty = 1; } else { tx /= L; ty /= L; }
      const nx = -ty * 0.09, ny = tx * 0.09;
      rails[0].push(cc.P(p[0] + nx, p[1] + ny, p[2])); rails[1].push(cc.P(p[0] - nx, p[1] - ny, p[2]));
      if (i % 5 === 0 && p[2] > 14 && !(p[0] > 5.9 && p[0] < 7.5 && p[1] < 1.6)) sup.push(p);
    });
    sup.forEach((p) => dim(cc, line([cc.P(p[0], p[1], 0), cc.P(p[0], p[1], p[2] - 3)]), N.cyan, 1.4, 0.38 * k));
    neon(cc, poly(rails[0]), N.yel, 1.5, 0.75 * k); neon(cc, poly(rails[1]), N.yel, 1.5, k);
    // station canopy outline
    const st = [[5.85, 3.85], [7.35, 3.85], [7.35, 4.45], [5.85, 4.45]];
    neon(cc, poly(st.map(([x, y]) => cc.P(x, y, 30))), N.cyan, 1.2, 0.7 * k);
    for (const [x, y] of st) dim(cc, line([cc.P(x, y, 0), cc.P(x, y, 30)]), N.cyan, 1.2, 0.5 * k);
  }
  // ---- twister flat ride ----
  const TW = { x: 8.25, y: 9.35 };
  function twister(cc, k = 1) {
    const ring = (r, z) => poly(cc.circ(TW.x, TW.y, r, z, 60));
    cc.push(`<path d="${ring(1.25, 4)}" fill="#1a1550" fill-opacity="0.75"/>`);
    neon(cc, ring(1.25, 4), N.mag, 1.8, k); dim(cc, ring(0.9, 4), N.mag, 1, 0.5);
    neon(cc, line([cc.P(TW.x, TW.y, 4), cc.P(TW.x, TW.y, 46)]), N.yel, 1.6, k);
    neon(cc, ring(0.32, 46), N.yel, 1.4, k);
    const cars = [0.3, 1.87, 3.44, 5.01].map((a) => ({ a, x: TW.x + 0.86 * Math.cos(a), y: TW.y + 0.86 * Math.sin(a) })).sort((p, q) => p.x + p.y - q.x - q.y);
    cars.forEach((cr) => {
      dim(cc, line([cc.P(TW.x, TW.y, 40), cc.P(cr.x, cr.y, 22)]), N.yel, 1.4, 0.7);
      const s = cc.cylSide(cr.x, cr.y, 0.24, 8, 18);
      cc.push(`<path d="${s.d}" fill="#2a1240" fill-opacity="0.9"/>`);
      neon(cc, s.top, N.cyan, 1.3, k);
      cc.push(guest(cc, s.c1[0] - 3, s.c1[1] + 8, { ...G[(Math.round(cr.a * 3)) % 6], dir: 1, acc: 'band', accCol: N.yel }, 0.75).replace(/<ellipse[^>]*fill="#000"[^>]*\/>/, ''));
      cc.push(`<path d="${s.d}" fill="none"/>`);
      neon(cc, `M${pt([s.c1[0] - s.rx, s.c1[1]])}A${f(s.rx)} ${f(s.ry)} 0 0 0 ${pt([s.c1[0] + s.rx, s.c1[1]])}L${pt([s.c0[0] + s.rx, s.c0[1]])}A${f(s.rx)} ${f(s.ry)} 0 0 1 ${pt([s.c0[0] - s.rx, s.c0[1]])}Z`, N.cyan, 1.1, 0.8 * k);
    });
  }
  // ---- snack stall: dark box, glowing window, neon sign ----
  function stall(cc) {
    const x0 = 2.05, x1 = 3.15, y0 = 7.75, y1 = 8.35, z1 = 30;
    cc.push(`<path d="${poly([cc.P(x1, y0, z1), cc.P(x1, y1, z1), cc.P(x1, y1, 0), cc.P(x1, y0, 0)])}" fill="#0c1033"/>`);
    cc.push(`<path d="${poly([cc.P(x0, y1, z1), cc.P(x1, y1, z1), cc.P(x1, y1, 0), cc.P(x0, y1, 0)])}" fill="#141a48"/>`);
    cc.push(`<path d="${poly([cc.P(x0, y0, z1), cc.P(x1, y0, z1), cc.P(x1, y1, z1), cc.P(x0, y1, z1)])}" fill="#1c2460"/>`);
    // window: warm light spilling out
    cc.push(`<path d="${poly([cc.P(x0 + 0.12, y1, 24), cc.P(x1 - 0.12, y1, 24), cc.P(x1 - 0.12, y1, 11), cc.P(x0 + 0.12, y1, 11)])}" fill="url(#iWin)"/>`);
    cc.push(`<path d="${poly([cc.P(x0 + 0.1, y1, 11), cc.P(x1 - 0.1, y1, 11), cc.P(x1 + 0.05, y1 + 0.45, 0.5), cc.P(x0 - 0.05, y1 + 0.45, 0.5)])}" fill="${N.warm}" fill-opacity="0.16"/>`);
    neon(cc, poly([cc.P(x0, y0, z1), cc.P(x1, y0, z1), cc.P(x1, y1, z1), cc.P(x0, y1, z1)]), N.cyan, 1.1, 0.8);
    neon(cc, line([cc.P(x0, y1, z1), cc.P(x0, y1, 0)]), N.cyan, 1, 0.5); neon(cc, line([cc.P(x1, y1, z1), cc.P(x1, y1, 0)]), N.cyan, 1, 0.7);
    // sign on the roof, written along the +y face (skewed into the iso plane)
    const sp = cc.P(x0 + 0.05, y1 - 0.25, z1 + 6);
    for (const [w, a, col] of [[7, 0.18, N.mag], [3, 0.45, N.mag], [1, 1, '#ffd1f4']]) cc.push(`<text transform="matrix(1,0.5,0,1,${f(sp[0])},${f(sp[1])})" font-size="17" font-weight="800" letter-spacing="1.5" fill="none" stroke="${col}" stroke-opacity="${a}" stroke-width="${w}" stroke-linejoin="round">SNACKS</text>`);
  }
  // ---- bridge: an arched neon rail over the canal ----
  function bridge(cc, k = 1) {
    const arch = (x) => { const pts = []; for (let i = 0; i <= 20; i++) { const y = 5.5 + 1.95 * i / 20; pts.push(cc.P(x, y, 1 + 16 * Math.sin(Math.PI * i / 20))); } return pts; };
    cc.push(`<path d="${poly(arch(4.95).concat(arch(5.85).reverse()))}" fill="#26307a" fill-opacity="0.92"/>`); for (const yy of [5.6, 6.0, 6.4, 6.8, 7.2]) { const zz = 1 + 16 * Math.sin(Math.PI * (yy - 5.5) / 1.95); dim(cc, line([cc.P(4.95, yy, zz), cc.P(5.85, yy, zz)]), N.cyan, 0.8, 0.35 * k); }
    for (const x of [4.95, 5.85]) { const a = arch(x); neon(cc, line(a.map((p) => [p[0], p[1] - 14])), N.cyan, 1.4, k * (x > 5 ? 1 : 0.7)); for (let i = 0; i <= 20; i += 4) dim(cc, line([a[i], [a[i][0], a[i][1] - 14]]), N.cyan, 1, 0.5 * k); for (let i = 2; i <= 20; i += 4) bulb(cc, [a[i][0], a[i][1] - 14], N.yel, 1.4); }
  }
  // ---- lamps ----
  const lamp = (cc, x, y) => { dim(cc, line([cc.P(x, y, 0), cc.P(x, y, 34)]), '#8aa0ff', 1.6, 0.6); bulb(cc, cc.P(x, y, 36), '#ffe7b0', 3.2); };
  // ---- trees: dark silhouettes, teal rim, a few fairy lights ----
  const trees = (cc, list) => list.forEach(([x, y, r]) => {
    const p = cc.P(x, y, 0); dim(cc, line([p, [p[0], p[1] - 16]]), '#2a3a6a', 3, 1);
    const q = [p[0], p[1] - 16 - r * 0.8];
    cc.push(`<ellipse cx="${f(q[0])}" cy="${f(q[1])}" rx="${f(r)}" ry="${f(r * 0.92)}" fill="#0b1a33"/>`);
    cc.push(`<path d="M${f(q[0] - r * 0.8)},${f(q[1] - r * 0.45)}A${f(r)} ${f(r * 0.92)} 0 0 1 ${f(q[0] + r * 0.6)},${f(q[1] - r * 0.7)}" stroke="#4be3d0" stroke-opacity="0.55" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
    for (let i = 0; i < 5; i++) { const a = i * 1.7 + x; cc.push(`<circle cx="${f(q[0] + Math.cos(a) * r * 0.6)}" cy="${f(q[1] + Math.sin(a) * r * 0.5)}" r="1.4" fill="${N.yel}"/><circle cx="${f(q[0] + Math.cos(a) * r * 0.6)}" cy="${f(q[1] + Math.sin(a) * r * 0.5)}" r="4" fill="${N.yel}" fill-opacity="0.15"/>`); }
  });

  // reflections (mirror ctx), spliced under the land
  wheel(m, 0.5); coaster(m, 0.45); bridge(m, 0.6); lamps.slice(0, 4).forEach(([x, y]) => lamp(m, x, y));
  c.o.splice(reflectAt, 0, `<g clip-path="url(#${reflectId})" opacity="0.8" filter="url(#iRefl)">${m.o.join('')}</g>`);

  c.add(2.45 + 2.55, () => wheel(c));
  c.add(7.5 + 2.5 - 1.5, () => coaster(c));
  c.add(5.4 + 6.5, () => bridge(c));
  c.add(2.6 + 8.0, () => stall(c));
  c.add(TW.x + TW.y - 0.5, () => twister(c));
  lamps.forEach(([x, y]) => c.add(x + y, () => lamp(c, x, y)));
  c.add(0.9 + 9.6, () => trees(c, [[0.75, 9.3, 15], [1.25, 10.1, 18], [0.6, 10.5, 12]]));
  c.add(10.2 + 6.0 - 3, () => trees(c, [[10.3, 0.7, 14], [10.4, 3.6, 12]]));
  c.add(4.5 + 3.2, () => trees(c, [[4.6, 3.2, 13]]));
  // coaster train in the station: three small capsules with lit riders
  c.add(6.6 + 4.15, () => {
    [6.15, 6.6, 7.05].forEach((x, i) => {
      const p = c.P(x, 4.15, 8);
      c.push(guest(c, p[0], p[1] + 2, { ...G[(i + 1) % 6], dir: 1 }, 0.6).replace(/<ellipse[^>]*fill="#000"[^>]*\/>/, ''));
      c.push(`<path d="M${f(p[0] - 13)},${f(p[1] - 8)}l26,13l0,4l-26,-13Z" fill="#160d30"/>`);
      neon(c, `M${f(p[0] - 13)},${f(p[1] - 8)}l26,13`, N.mag, 1.2, 1);
    });
  });
  // guests
  const walk = [[1.0, 5.0, 0], [1.9, 4.85, 3], [3.2, 5.2, 1], [4.5, 4.95, 2], [6.9, 5.1, 4], [8.3, 4.9, 5], [9.4, 5.2, 0], [5.35, 6.6, 3], [5.5, 8.2, 2], [3.4, 8.8, 5], [2.4, 8.85, 1], [7.0, 8.75, 0], [9.6, 8.7, 4]];
  walk.forEach(([x, y, gi], i) => c.add(x + y + 0.05, () => { const p = c.P(x, y, x > 4.9 && x < 5.9 && y > 5.5 && y < 7.5 ? 1 + 16 * Math.sin(Math.PI * (y - 5.5) / 1.95) : 1); c.push(guest(c, p[0], p[1], { ...G[gi], dir: i % 3 ? 1 : -1 }, 1.05)); }));
  c.flush();

  // ================= sheet =================
  const Rs = rng(11); let stars = '';
  for (let i = 0; i < 140; i++) { const x = Rs() * 1600, y = Rs() * 1000, r = Rs() < 0.1 ? 1.4 : 0.7; stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="#dfe6ff" fill-opacity="${f(0.25 + Rs() * 0.5)}"/>`; }
  const bg = `<rect width="1600" height="1000" fill="url(#iSky)"/>${stars}
    <ellipse cx="820" cy="540" rx="760" ry="380" fill="url(#iHaze)"/>
    <circle cx="1460" cy="250" r="90" fill="url(#iMoonGlow)"/><path d="M1478,218A34,34 0 1 0 1490,268A30,30 0 1 1 1478,218Z" fill="#e9ecff" fill-opacity="0.92"/>`;
  const defs = c.defs.join('') + m.defs.join('') + `
    <linearGradient id="iSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060918"/><stop offset="0.6" stop-color="#0c1236"/><stop offset="1" stop-color="#151b4c"/></linearGradient>
    <radialGradient id="iHaze"><stop offset="0" stop-color="#3a2a9a" stop-opacity="0.35"/><stop offset="1" stop-color="#3a2a9a" stop-opacity="0"/></radialGradient>
    <linearGradient id="iWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040820"/><stop offset="1" stop-color="#0a1a52"/></linearGradient>
    <linearGradient id="iWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset="1" stop-color="#ffb54a"/></linearGradient>
    <radialGradient id="iMoonGlow"><stop offset="0" stop-color="#a9b6ff" stop-opacity="0.18"/><stop offset="1" stop-color="#a9b6ff" stop-opacity="0"/></radialGradient>
    <filter id="iHalo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="iRefl" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6 0.6"/></filter>`;
  let lu = '';
  G.forEach((g, i) => { const x = 104 + i * 74, y = 1000 - 48; lu += `<ellipse cx="${x}" cy="${y - 4}" rx="34" ry="12" fill="url(#luPool${i % 3})"/>` + guest(c, x, y, g, 2 * 1.05); });
  const luDefs = [N.cyan, N.warm, N.mag].map((col, i) => `<radialGradient id="luPool${i}"><stop offset="0" stop-color="${col}" stop-opacity="0.55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`).join('');
  frame({
    key: 'i', letter: 'I', name: 'Neon night', file: 'i-neon',
    blurb: ['Night is the base look. A dark navy park; rides, paths and', 'edges are glowing tubes in cyan, magenta and yellow with', 'almost no fill. Light pools on the ground, neon in the water.'],
    pal: [N.night, N.ground, N.path, N.cyan, N.mag, N.yel, N.warm], ink: '#f2f0ff', sub: '#9aa6e0', panel: '#0b1033e6', panelInk: '#b9c2f2',
    bg, scene: c.o.join('\n'), extraDefs: defs + luDefs, lineup: { svg: lu, w: 470 },
    note: ['Neon = 3 strokes: halo, glow, white core.', 'No blur needed; additive blend on canvas.', 'Fill only where light falls: pools, windows.', 'Guests: silhouette + rim light + 1 glow item.', 'Canal = the same neon, mirrored and dimmed.'],
  });
}

// ======================================================================
// J — Lush premium mobile
// Rich and polished: a lake with shoreline foam and a sandy rim, a rock-sided hill, glossy clustered
// foliage, flowerbeds, kerb-stone paths, soft ambient occlusion, gentle gradients and specular highlights.
// ======================================================================
function styleJ() {
  const S = 1.12, c = Ctx(S, 800, 188), P = c.P, Z = 6; // Z = grass level
  const C = {
    grassA: '#8fe05a', grassB: '#45b23a', soil: '#9a6236', soilD: '#6e4223', sand: '#f6dd9a', rock: '#c7b8a2', rockD: '#9a8a76',
    waterA: '#3fd2e8', waterB: '#1680c4', foam: '#ffffff', path: '#f4e7cc', kerb: '#d9cfbd', kerbD: '#a99d88',
    red: '#ff4d5e', teal: '#16c2b0', yellow: '#ffd23a', pink: '#ff7fb6', violet: '#8a6cff', orange: '#ff9a2e', white: '#ffffff', wood: '#b9773f', ink: '#24304f',
    leaf: ['#3ec14a', '#27a64a', '#69d64a', '#1f9a5a'],
  };
  // glossy sphere gradient (cached per colour)
  const gloss = (col) => c.og('jg' + col, (id) => `<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="${light(col, 0.45)}"/><stop offset="0.5" stop-color="${col}"/><stop offset="1" stop-color="${shade(col, 0.62)}"/></radialGradient>`);
  const vgrad = (a, b, key) => c.og('jv' + key + a + b, (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);
  const ao = (gx, gy, r, z = Z, k = 1) => { const p = P(gx, gy, z); c.push(`<ellipse cx="${f(p[0] + 2)}" cy="${f(p[1] + 1)}" rx="${f(Math.SQRT2 * 52 * S * r)}" ry="${f(Math.SQRT2 * 26 * S * r)}" fill="#0e3a1a" fill-opacity="${f(0.32 * k)}" filter="url(#jAO)"/>`); };
  function face(pts, col, role, r = 3) {
    const fill = role === 'top' ? light(col, 0.12) : role === 'right' ? shade(col, 0.78) : col;
    const g = role === 'top' ? fill : vgrad(role === 'right' ? fill : light(fill, 0.06), shade(fill, 0.86), role);
    c.push(`<path d="${rp(pts, r)}" fill="${g}"/>`);
  }
  function box(x0, x1, y0, y1, z0, z1, col, r = 3, cols = {}) {
    face([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], cols.right || col, 'right', r);
    face([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], cols.left || col, 'left', r);
    face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], cols.top || col, 'top', r);
    c.push(`<path d="${line([P(x0 + 0.04, y1, z1), P(x1, y1, z1), P(x1, y0 + 0.04, z1)])}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.4" stroke-linejoin="round"/>`);
  }
  function cyl(gx, gy, r, z0, z1, col, topCol) {
    const s = c.cylSide(gx, gy, r, z0, z1);
    const id = c.og('jc' + col, (id2) => `<linearGradient id="${id2}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(col, 0.9)}"/><stop offset="0.28" stop-color="${light(col, 0.22)}"/><stop offset="0.62" stop-color="${col}"/><stop offset="1" stop-color="${shade(col, 0.66)}"/></linearGradient>`);
    c.push(`<path d="${s.d}" fill="${id}"/>`);
    c.push(`<path d="${s.top}" fill="${light(topCol || col, 0.1)}"/>`);
    return s;
  }
  const sphere = (cx, cy, r, col, hi = true) => {
    c.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${gloss(col)}"/>`);
    if (hi) c.push(`<ellipse cx="${f(cx - r * 0.34)}" cy="${f(cy - r * 0.42)}" rx="${f(r * 0.28)}" ry="${f(r * 0.17)}" transform="rotate(-28 ${f(cx - r * 0.34)} ${f(cy - r * 0.42)})" fill="#fff" fill-opacity="0.55"/>`);
  };

  // ---- guest: slim chibi (head ~26%), gradient shirt, shoes, swinging arms, hair highlight ----
  function guest(sx, sy, g, k = 1, sh = true) {
    const X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), u = (v) => f(v * k), out = [];
    if (sh) out.push(`<ellipse cx="${X(0.5)}" cy="${Y(0.2)}" rx="${u(6.5)}" ry="${u(2.6)}" fill="#0e3a1a" fill-opacity="0.35"/>`);
    const st = g.step;
    // back arm, legs, shoes
    out.push(`<path d="M${X(-2.8)},${Y(-17.5)}L${X(-3.6 - st * 0.8)},${Y(-11.5)}" stroke="${shade(g.skin, 0.8)}" stroke-width="${u(2.2)}" stroke-linecap="round"/>`);
    for (const [lx, s2] of [[-1.3, -st], [1.3, st]]) {
      out.push(`<path d="M${X(lx)},${Y(-9.5)}L${X(lx + s2 * 0.9)},${Y(-1.6)}" stroke="${lx < 0 ? shade(g.pants, 0.8) : g.pants}" stroke-width="${u(2.7)}" stroke-linecap="round"/>`);
      out.push(`<ellipse cx="${X(lx + s2 * 0.9 + 0.7)}" cy="${Y(-0.9)}" rx="${u(2)}" ry="${u(1.2)}" fill="${g.shoe || '#3a3f5a'}"/>`);
    }
    // torso with a soft gradient + collar highlight
    const tor = `M${X(-3.4)},${Y(-9)}C${X(-3.8)},${Y(-14)} ${X(-3.6)},${Y(-18.6)} ${X(0)},${Y(-19)}C${X(3.6)},${Y(-18.6)} ${X(3.8)},${Y(-14)} ${X(3.4)},${Y(-9)}Z`;
    out.push(`<path d="${tor}" fill="${c.og('jt' + g.shirt + g.dir, (id) => `<linearGradient id="${id}" x1="${g.dir > 0 ? 0 : 1}" y1="0" x2="${g.dir > 0 ? 1 : 0}" y2="0.4"><stop offset="0" stop-color="${light(g.shirt, 0.22)}"/><stop offset="0.55" stop-color="${g.shirt}"/><stop offset="1" stop-color="${shade(g.shirt, 0.7)}"/></linearGradient>`)}"/>`);
    out.push(`<path d="M${X(-3.4)},${Y(-9.4)}L${X(3.4)},${Y(-9.4)}" stroke="${g.pants}" stroke-width="${u(1.6)}"/>`);
    if (g.pack) out.push(`<rect x="${f(sx - (g.dir > 0 ? 6.4 : -3) * k)}" y="${Y(-17.5)}" width="${u(3.4)}" height="${u(7)}" rx="${u(1.2)}" fill="${g.pack}"/>`);
    // front arm
    out.push(`<path d="M${X(2.8)},${Y(-17.5)}L${X(3.8 + st * 0.8)},${Y(-11.5)}" stroke="${g.shirt}" stroke-width="${u(2.4)}" stroke-linecap="round"/><circle cx="${X(3.9 + st * 0.8)}" cy="${Y(-11)}" r="${u(1.2)}" fill="${g.skin}"/>`);
    if (g.balloon) { out.push(`<path d="M${X(4)},${Y(-11)}Q${X(7)},${Y(-22)} ${X(6)},${Y(-31)}" stroke="#ffffff" stroke-opacity="0.8" stroke-width="${u(0.6)}" fill="none"/>`); const bx = +X(6), by = +Y(-35); out.push(`<ellipse cx="${f(bx)}" cy="${f(by)}" rx="${u(3.8)}" ry="${u(4.4)}" fill="${gloss(g.balloon)}"/><ellipse cx="${f(bx - 1.2 * k)}" cy="${f(by - 1.8 * k)}" rx="${u(1)}" ry="${u(1.4)}" fill="#fff" fill-opacity="0.8"/>`); }
    // head
    const hx = +X(0.2), hy = +Y(-22.6);
    out.push(`<circle cx="${f(hx)}" cy="${f(hy)}" r="${u(4.4)}" fill="${c.og('jh' + g.skin, (id) => `<radialGradient id="${id}" cx="0.38" cy="0.35" r="0.75"><stop offset="0" stop-color="${light(g.skin, 0.2)}"/><stop offset="1" stop-color="${shade(g.skin, 0.84)}"/></radialGradient>`)}"/>`);
    const hair = { short: `M${X(-4.5)},${Y(-22)}C${X(-5)},${Y(-29)} ${X(5)},${Y(-29)} ${X(4.6)},${Y(-23.4)}C${X(2.5)},${Y(-25.6)} ${X(-1)},${Y(-25.6)} ${X(-4.5)},${Y(-22)}Z`,
      long: `M${X(-4.7)},${Y(-18.5)}C${X(-5.8)},${Y(-29)} ${X(5.4)},${Y(-29.5)} ${X(4.7)},${Y(-23)}C${X(2.5)},${Y(-25.5)} ${X(-0.8)},${Y(-25)} ${X(-2.2)},${Y(-22)}L${X(-2.6)},${Y(-18)}Z`,
      bun: `M${X(-4.5)},${Y(-22)}C${X(-5)},${Y(-29)} ${X(5)},${Y(-29)} ${X(4.6)},${Y(-23.4)}C${X(2.5)},${Y(-25.6)} ${X(-1)},${Y(-25.6)} ${X(-4.5)},${Y(-22)}Z M${X(-3.4)},${Y(-27.2)}a${u(2.5)},${u(2.5)} 0 1 0 ${u(0.1)},0Z` }[g.hairStyle];
    out.push(`<path d="${hair}" fill="${g.hair}"/><path d="M${X(-2.6)},${Y(-26.2)}Q${X(0)},${Y(-27.6)} ${X(2.4)},${Y(-26.4)}" stroke="${light(g.hair, 0.45)}" stroke-width="${u(0.9)}" fill="none" stroke-linecap="round"/>`);
    if (g.hat) out.push(`<path d="M${X(-4.8)},${Y(-24.6)}C${X(-4.8)},${Y(-30)} ${X(4.8)},${Y(-30)} ${X(4.8)},${Y(-24.6)}Z" fill="${g.hat}"/><path d="M${X(2)},${Y(-24.8)}L${X(8)},${Y(-24)}" stroke="${shade(g.hat, 0.75)}" stroke-width="${u(1.6)}" stroke-linecap="round"/>`);
    out.push(`<circle cx="${X(2.6)}" cy="${Y(-22.4)}" r="${u(0.65)}" fill="${C.ink}"/>`);
    return out.join('');
  }
  const G = [
    { dir: 1, step: 1, skin: '#f6cfab', shirt: '#ff5a6e', pants: '#2f4f9a', hair: '#6b3b1f', hairStyle: 'short', hat: '#ffd23a' },
    { dir: -1, step: -1, skin: '#8d5a3b', shirt: '#16c2b0', pants: '#f6f1e6', hair: '#1f1612', hairStyle: 'bun', balloon: '#ff7fb6' },
    { dir: 1, step: -1, skin: '#e3a77c', shirt: '#ffd23a', pants: '#3b4a7a', hair: '#2a1d14', hairStyle: 'long' },
    { dir: -1, step: 1, skin: '#c68642', shirt: '#8a6cff', pants: '#2b2f4a', hair: '#1a1210', hairStyle: 'short', pack: '#ff9a2e' },
    { dir: 1, step: 1, skin: '#f8d9c0', shirt: '#ffffff', pants: '#ff7fb6', hair: '#e8b04a', hairStyle: 'long', balloon: '#3fd2e8' },
    { dir: -1, step: -1, skin: '#5a3825', shirt: '#4fd16a', pants: '#24304f', hair: '#120d0a', hairStyle: 'short', hat: '#ff4d5e' },
  ];

  // ================= terrain =================
  c.push(`<ellipse cx="800" cy="${f(P(5.5, 5.5)[1] + 150)}" rx="690" ry="170" fill="#0b4a6a" fill-opacity="0.25" filter="url(#jSoftWide)"/>`);
  const wb = c.slab(0, 11, 0, 11, 0.45, -54, -10);
  c.push(`<path d="${poly(wb.band)}" fill="${c.split('#1a8fc8', '#0f679e', wb.xa, wb.xb, wb.xf, 30)}"/>`);
  // soil foot under the water body
  const sb = c.slab(0, 11, 0, 11, 0.45, -54, -46);
  c.push(`<path d="${poly(sb.band)}" fill="${c.split('#8a5a34', '#6a4224', sb.xa, sb.xb, sb.xf, 30)}"/>`);
  c.push(`<path d="${poly(wb.top)}" fill="url(#jWater)" stroke="#3fc4e0" stroke-width="1.2"/>`);
  // glass-like front edge of the water block
  c.push(`<path d="${line(wb.top.slice(8, 25))}" fill="none" stroke="#bff6ff" stroke-width="2.4" stroke-opacity="0.8"/>`);
  const lands = [[0.35, 10.65, 0.35, 6.0], [5.4, 10.65, 5.6, 10.65], [0.65, 3.85, 7.6, 10.4]];
  // shallow-water halo + foam around every land piece
  for (const [x0, x1, y0, y1] of lands) {
    c.push(`<path d="${poly(c.rr(x0 - 0.35, x1 + 0.35, y0 - 0.35, y1 + 0.35, 0.8, -10))}" fill="#7fe8ec" fill-opacity="0.45" filter="url(#jSoft)"/>`);
  }
  for (const [x0, x1, y0, y1] of lands) {
    const r = c.rr(x0 - 0.1, x1 + 0.1, y0 - 0.1, y1 + 0.1, 0.55, -10);
    c.push(`<path d="${poly(r)}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="7" stroke-dasharray="14 6 30 8"/>`);
    c.push(`<path d="${poly(r)}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="2"/>`);
  }
  // sparkles on the water
  const R = rng(5);
  for (let i = 0; i < 26; i++) { const x = 0.4 + R() * 4.6, y = 6.2 + R() * 4.6; if (x > 0.5 && x < 4.0 && y > 7.4 && y < 10.6) continue; const p = P(x, y, -10); c.push(`<path d="M${f(p[0] - 5)},${f(p[1])}h10" stroke="#fff" stroke-opacity="${f(0.4 + R() * 0.4)}" stroke-width="1.6" stroke-linecap="round"/>`); }
  // land: sand rim, soil sides with strata, grass top with gradient
  for (const [x0, x1, y0, y1] of lands) {
    const sr = c.slab(x0 - 0.06, x1 + 0.06, y0 - 0.06, y1 + 0.06, 0.55, -10, -5);
    c.push(`<path d="${poly(sr.band)}" fill="${c.split(C.sand, shade(C.sand, 0.82), sr.xa, sr.xb, sr.xf, 20)}"/>`);
  }
  for (const [x0, x1, y0, y1] of lands) {
    const s = c.slab(x0, x1, y0, y1, 0.5, -6, Z);
    c.push(`<path d="${poly(s.band)}" fill="${c.split(C.soil, C.soilD, s.xa, s.xb, s.xf, 20)}"/>`);
  }
  for (const [x0, x1, y0, y1] of lands) {
    const s = c.slab(x0, x1, y0, y1, 0.5, -6, Z);
    c.push(`<path d="${poly(s.top)}" fill="url(#jGrass)" stroke="#6fd24c" stroke-width="1"/>`);
    c.push(`<path d="${line(s.top.slice(8, 25))}" fill="none" stroke="#c6f59a" stroke-width="2" stroke-opacity="0.9"/>`);
  }
  // hill with rock sides (stacked strata), grass cap
  const hill = (x0, x1, y0, y1, z0, z1) => {
    const s = c.slab(x0, x1, y0, y1, 0.6, z0, z1);
    c.push(`<path d="${poly(s.band)}" fill="${c.split(C.rock, C.rockD, s.xa, s.xb, s.xf, 24)}"/>`);
    for (let k = 1; k < 4; k++) { const zz = z0 + (z1 - z0) * k / 4, b = c.rr(x0, x1, y0, y1, 0.6, zz); const n = b.length; c.push(`<path d="${line(b.slice(Math.floor(n * 0.25), Math.floor(n * 0.75) + 1))}" fill="none" stroke="${shade(C.rockD, 0.8)}" stroke-opacity="0.45" stroke-width="1.6" stroke-dasharray="${12 + k * 5} 4"/>`); }
    c.push(`<path d="${poly(s.top)}" fill="url(#jGrass)" stroke="#6fd24c" stroke-width="1"/>`);
    const n = s.top.length; c.push(`<path d="${line(s.top.slice(Math.floor(n * 0.25), Math.floor(n * 0.75) + 1))}" fill="none" stroke="#c6f59a" stroke-width="2.4"/>`);
    return s;
  };
  const HZ = Z + 30;
  hill(0.7, 4.3, 0.7, 3.3, Z, HZ);
  // grass texture: little tufts (skip paths and the hill)
  const onPath = (x, y) => (y > 4.25 && y < 5.35 && x > 1.55 && x < 10.05) || (x > 1.55 && x < 2.65 && y > 4.25 && y < 8.75) || (x > 6.85 && x < 7.95 && y > 4.25 && y < 10.15);
  for (let i = 0; i < 520; i++) {
    const L = lands[i % 3], x = L[0] + 0.2 + R() * (L[1] - L[0] - 0.4), y = L[2] + 0.2 + R() * (L[3] - L[2] - 0.4);
    if (onPath(x, y)) continue; const onHill = x > 0.75 && x < 4.25 && y > 0.75 && y < 3.25; const p = P(x, y, onHill ? HZ : Z);
    const col = R() < 0.5 ? '#3aa83a' : '#b6ef7a';
    c.push(`<path d="M${f(p[0] - 2)},${f(p[1])}l1,-3.4M${f(p[0])},${f(p[1])}l0,-4.4M${f(p[0] + 2)},${f(p[1])}l-1,-3.4" stroke="${col}" stroke-opacity="0.75" stroke-width="1" stroke-linecap="round"/>`);
  }
  // paths: kerb stones (light, with dark joints) around a warm paved surface
  const paths = [[1.6, 10.0, 4.3, 5.3], [1.6, 2.6, 5.3, 6.0], [1.6, 2.6, 7.6, 8.7], [6.9, 7.9, 5.3, 10.1]];
  for (const [x0, x1, y0, y1] of paths) {
    const kb = c.slab(x0, x1, y0, y1, 0.12, Z, Z + 2.5);
    c.push(`<path d="${poly(kb.band)}" fill="${C.kerbD}"/>`);
    c.push(`<path d="${poly(kb.top)}" fill="${C.kerb}"/>`);
  }
  for (const [x0, x1, y0, y1] of paths) {
    const inner = c.rr(x0 + 0.1, x1 - 0.1, y0 + 0.1, y1 - 0.1, 0.06, Z + 2.5);
    c.push(`<path d="${poly(inner)}" fill="url(#jPath)"/>`);
    c.push(`<path d="${poly(c.rr(x0 + 0.05, x1 - 0.05, y0 + 0.05, y1 - 0.05, 0.1, Z + 2.5))}" fill="none" stroke="${C.kerbD}" stroke-width="5.5" stroke-dasharray="1.2 9" stroke-opacity="0.8"/>`);
    // paving joints
    for (let x = Math.ceil(x0 * 2) / 2; x < x1 - 0.1; x += 0.5) if (x > x0 + 0.15) c.push(`<path d="${line([P(x, y0 + 0.1, Z + 2.5), P(x, y1 - 0.1, Z + 2.5)])}" stroke="#d8c7a2" stroke-width="1"/>`);
    for (let y = Math.ceil(y0 * 2) / 2; y < y1 - 0.1; y += 0.5) if (y > y0 + 0.15) c.push(`<path d="${line([P(x0 + 0.1, y, Z + 2.5), P(x1 - 0.1, y, Z + 2.5)])}" stroke="#d8c7a2" stroke-width="1"/>`);
  }
  const PZ = Z + 2.5;

  // ================= objects =================
  // ---- tree cluster: trunk + 5-7 glossy spheres; darker ones at the back ----
  const tree = (x, y, z, sc, palette = 0) => c.add(x + y, () => {
    ao(x + 0.08, y + 0.05, 0.42 * sc, z, 1.2);
    cyl(x, y, 0.06 * sc, z, z + 20 * sc, C.wood);
    const base = P(x, y, z + 20 * sc), r = 13 * S * sc, L = C.leaf;
    const parts = [[-0.8, -0.5, 0.75, L[3]], [0.75, -0.6, 0.72, L[1]], [0, -1.15, 0.8, L[1]], [-0.55, 0.1, 0.8, L[(palette + 0) % 4 === 3 ? 0 : 0]], [0.6, 0.15, 0.78, L[0]], [0.05, -0.35, 0.95, L[palette === 1 ? 2 : 0]], [0.1, -1.6, 0.55, L[2]]];
    parts.forEach(([dx, dy, rr, col]) => sphere(base[0] + dx * r, base[1] + dy * r, rr * r, col, rr > 0.7));
  });
  const bush = (x, y, sc, flowers) => c.add(x + y, () => {
    ao(x, y, 0.3 * sc, Z, 1);
    const p = P(x, y, Z), r = 8 * S * sc;
    [[-0.7, -0.6, 0.8, C.leaf[1]], [0.7, -0.6, 0.8, C.leaf[1]], [0, -0.9, 0.95, C.leaf[0]]].forEach(([dx, dy, rr, col]) => sphere(p[0] + dx * r, p[1] + dy * r, rr * r, col));
    if (flowers) for (let i = 0; i < 5; i++) c.push(`<circle cx="${f(p[0] + Math.cos(i * 2.3) * r * 0.9)}" cy="${f(p[1] - r + Math.sin(i * 2.3) * r * 0.45)}" r="${f(1.8 * S)}" fill="${flowers}" stroke="#fff" stroke-width="0.6"/>`);
  });
  // ---- flowerbed: raised rounded bed, kerb rim, dense coloured blooms ----
  const bed = (x0, x1, y0, y1, cols, seed) => c.add((x0 + x1) / 2 + (y0 + y1) / 2 - 0.3, () => {
    const s = c.slab(x0, x1, y0, y1, 0.3, Z, Z + 5);
    c.push(`<path d="${poly(s.band)}" fill="${c.split('#d9c9a8', '#b3a284', s.xa, s.xb, s.xf, 6)}"/><path d="${poly(s.top)}" fill="#e9dcc0"/>`);
    c.push(`<path d="${poly(c.rr(x0 + 0.08, x1 - 0.08, y0 + 0.08, y1 - 0.08, 0.24, Z + 5))}" fill="#5b3a22"/>`);
    const r2 = rng(seed);
    const pts = []; for (let i = 0; i < 60; i++) pts.push([x0 + 0.16 + r2() * (x1 - x0 - 0.32), y0 + 0.16 + r2() * (y1 - y0 - 0.32)]);
    pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(([x, y], i) => { const p = P(x, y, Z + 6); c.push(`<circle cx="${f(p[0])}" cy="${f(p[1] - 2)}" r="${f(3.4 * S)}" fill="${C.leaf[i % 2]}"/>`); c.push(`<circle cx="${f(p[0] + 0.5)}" cy="${f(p[1] - 4)}" r="${f(2.1 * S)}" fill="${cols[i % cols.length]}"/><circle cx="${f(p[0] - 0.2)}" cy="${f(p[1] - 4.6)}" r="0.8" fill="#fff" fill-opacity="0.8"/>`); });
  });
  // ---- coaster: glossy red tubular rails, white lattice-free supports, ties ----
  const ctrl = [[5.3, 3.75, 14], [6.9, 3.75, 14], [8.1, 3.6, 44], [9.2, 3.25, 104], [9.95, 2.55, 118], [9.95, 1.5, 110], [9.25, 0.85, 62], [8.1, 0.75, 18], [7.0, 0.95, 40], [6.0, 1.15, 66], [5.2, 1.65, 44], [4.85, 2.5, 26], [4.95, 3.3, 16]];
  const trk = spline3(ctrl, 8, true);
  const rail = (side) => trk.map((p, i) => { const q = trk[(i + 1) % trk.length], o = trk[(i - 1 + trk.length) % trk.length]; let tx = q[0] - o[0], ty = q[1] - o[1]; const L = Math.hypot(tx, ty) || 1; return [p[0] - ty / L * 0.1 * side, p[1] + tx / L * 0.1 * side, p[2]]; });
  const RA = rail(1), RB = rail(-1);
  const tube = (pts, w, col) => { const d = smoothPath(pts.map((p) => P(...p)), false); c.push(`<path d="${d}" fill="none" stroke="${shade(col, 0.62)}" stroke-width="${f(w + 1.8)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="${f(Math.max(1, w * 0.3))}" transform="translate(0,-${f(w * 0.25)})" stroke-linecap="round"/>`); };
  const half = (front) => { const segs = []; let cur = []; trk.forEach((p, i) => { const isF = p[0] + p[1] > 9.6; if (isF === front) cur.push(i); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur); return segs; };
  const drawCoaster = (front) => {
    trk.forEach((p, i) => { if ((p[0] + p[1] > 9.6) !== front || i % 6 || p[2] < 20) return; const g = P(p[0], p[1], Z); c.push(`<ellipse cx="${f(g[0])}" cy="${f(g[1])}" rx="5" ry="2.5" fill="#0e3a1a" fill-opacity="0.3"/>`); cyl(p[0], p[1], 0.05, Z, p[2] - 3, '#f4f6fb'); });
    half(front).forEach((seg) => {
      const ids = seg.length > 1 ? [seg[0] > 0 ? seg[0] - 1 : seg[0], ...seg, (seg[seg.length - 1] + 1) % trk.length] : seg;
      for (const i of seg) if (i % 2 === 0) c.push(`<path d="${line([P(...RA[i]), P(...RB[i])])}" stroke="#7a2a2f" stroke-width="2.2"/>`);
      tube(ids.map((i) => trk[i]).map((p) => [p[0], p[1], p[2] - 4]), 3, '#9aa3b8');
      tube(ids.map((i) => RA[i]), 3.2, C.red); tube(ids.map((i) => RB[i]), 3.2, C.red);
    });
  };
  c.add(7.0, () => { ao(7.6, 2.4, 2.2, Z, 0.5); box(5.2, 6.95, 3.95, 4.25, Z, Z + 10, '#f2efe8', 3); drawCoaster(false); });
  c.add(10.4, () => {
    drawCoaster(true);
    // station roof + train
    [5.55, 6.05, 6.55].forEach((x, i) => {
      const p = P(x, 3.75, 18);
      c.push(guest(p[0] - 2, p[1] + 1, { ...G[(i + 2) % 6], dir: 1, balloon: null }, 0.95 * S, false));
      c.push(`<path d="M${f(p[0] - 16)},${f(p[1] - 9)}l30,15l0,7l-30,-15Z" fill="${[C.teal, C.yellow, C.violet][i]}"/><path d="M${f(p[0] - 16)},${f(p[1] - 2)}l30,15l0,4l-30,-15Z" fill="${shade([C.teal, C.yellow, C.violet][i], 0.72)}"/><path d="M${f(p[0] - 15)},${f(p[1] - 8)}l28,14" stroke="#fff" stroke-opacity="0.7" stroke-width="1.4"/>`);
    });
  });
  // ---- swing ride: tower, striped canopy, chains flung outward ----
  const SW = { x: 9.25, y: 8.1 }, TOP = Z + 86;
  c.add(SW.x + SW.y, () => {
    ao(SW.x, SW.y, 1.25, Z, 0.8);
    cyl(SW.x, SW.y, 0.72, Z, Z + 6, '#f2efe8');
    const seats = Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2 + 0.2; return { a, top: [SW.x + 0.62 * Math.cos(a), SW.y + 0.62 * Math.sin(a), TOP - 10], seat: [SW.x + 1.18 * Math.cos(a), SW.y + 1.18 * Math.sin(a), Z + 42] }; });
    const drawSeat = (s, i) => {
      const a = P(...s.top), b = P(...s.seat);
      c.push(`<path d="M${pt(a)}L${pt(b)}" stroke="#7d8597" stroke-width="1"/><path d="M${f(a[0] + 3)},${f(a[1])}L${f(b[0] + 3)},${f(b[1])}" stroke="#7d8597" stroke-width="1"/>`);
      c.push(guest(b[0] + 1, b[1] + 11, { ...G[i % 6], dir: Math.cos(s.a) > 0 ? 1 : -1, balloon: null }, 0.9 * S, false));
      c.push(`<rect x="${f(b[0] - 5)}" y="${f(b[1] + 4)}" width="13" height="4.5" rx="2" fill="${[C.yellow, C.teal, C.pink][i % 3]}"/>`);
    };
    seats.filter((s) => Math.sin(s.a) + Math.cos(s.a) < 0).forEach((s, i) => drawSeat(s, i));
    cyl(SW.x, SW.y, 0.13, Z + 6, TOP, '#ffffff');
    for (const z of [Z + 24, Z + 48]) { const s = c.cylSide(SW.x, SW.y, 0.135, z, z + 5); c.push(`<path d="${s.d}" fill="${C.teal}"/>`); }
    // canopy: 12 striped wedges from the apex to a scalloped rim
    const apex = P(SW.x, SW.y, TOP + 22), wedges = [];
    for (let i = 0; i < 12; i++) { const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2; wedges.push({ i, mid: (a0 + a1) / 2, pts: [apex, ...[0, 0.5, 1].map((t) => { const a = a0 + (a1 - a0) * t; return P(SW.x + 0.86 * Math.cos(a), SW.y + 0.86 * Math.sin(a), TOP); })] }); }
    wedges.sort((p, q) => Math.sin(p.mid) + Math.cos(p.mid) - Math.sin(q.mid) - Math.cos(q.mid)).forEach((w) => {
      const lit = Math.cos(w.mid - 2.2); const col = w.i % 2 ? '#ffffff' : C.pink;
      c.push(`<path d="${poly(w.pts)}" fill="${lit > 0 ? light(col, 0.05) : shade(col, 0.8 + 0.1 * (1 + lit))}"/>`);
    });
    // valance scallops on the front half
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; if (Math.sin(a) + Math.cos(a) < -0.3) continue; const p = P(SW.x + 0.86 * Math.cos(a), SW.y + 0.86 * Math.sin(a), TOP); c.push(`<circle cx="${f(p[0])}" cy="${f(p[1] + 2)}" r="${f(4.2 * S)}" fill="${i % 2 ? C.yellow : C.teal}"/>`); }
    c.push(`<circle cx="${f(apex[0])}" cy="${f(apex[1] - 4)}" r="5" fill="${gloss(C.yellow)}"/>`);
    seats.filter((s) => Math.sin(s.a) + Math.cos(s.a) >= 0).forEach((s, i) => drawSeat(s, i + 5));
  });
  // ---- fruit hut: round planked wall, thatched cone roof, fruit on the counter ----
  const HT = { x: 6.0, y: 6.75 };
  c.add(HT.x + HT.y, () => {
    ao(HT.x, HT.y, 0.6, Z, 1.1);
    const s = cyl(HT.x, HT.y, 0.48, Z, Z + 24, '#f3d9a8');
    for (let i = -4; i <= 4; i++) { const xx = s.c0[0] + i * s.rx / 4.6; c.push(`<path d="M${f(xx)},${f(s.c1[1] + Math.sqrt(Math.max(0, 1 - (i / 4.6) ** 2)) * s.ry)}L${f(xx)},${f(s.c0[1] + Math.sqrt(Math.max(0, 1 - (i / 4.6) ** 2)) * s.ry)}" stroke="#c99a5c" stroke-opacity="0.6" stroke-width="1"/>`); }
    // counter opening facing the path (+x side)
    const o = P(HT.x + 0.32, HT.y + 0.32, Z + 18), o2 = P(HT.x + 0.42, HT.y - 0.12, Z + 18);
    c.push(`<path d="M${pt(o)}L${pt(o2)}L${f(o2[0])},${f(o2[1] + 10)}L${f(o[0])},${f(o[1] + 10)}Z" fill="#5b3a22"/>`);
    c.push(`<path d="M${f(o[0] - 3)},${f(o[1] + 10)}L${f(o2[0] + 3)},${f(o2[1] + 10)}l0,4L${f(o[0] - 3)},${f(o[1] + 14)}Z" fill="${C.wood}"/>`);
    [[0.25, C.orange], [0.45, C.red], [0.65, C.yellow], [0.85, '#7ad04a']].forEach(([t, col]) => sphere(o[0] + (o2[0] - o[0]) * t, o[1] + (o2[1] - o[1]) * t + 8, 3.2, col));
    // thatch
    const base = P(HT.x, HT.y, Z + 24), ap = P(HT.x, HT.y, Z + 58), rx = Math.SQRT2 * 52 * S * 0.72, ry = rx / 2;
    c.push(`<path d="M${f(base[0] - rx)},${f(base[1])}A${f(rx)} ${f(ry)} 0 0 0 ${f(base[0] + rx)},${f(base[1])}L${pt(ap)}Z" fill="${c.split('#f2c45a', '#c08a2a', base[0] - rx, base[0] + rx, base[0] + rx * 0.2, 18)}"/>`);
    for (let i = -6; i <= 6; i++) { const t = i / 6.5, bx = base[0] + t * rx, by = base[1] + Math.sqrt(1 - t * t) * ry; c.push(`<path d="M${f(bx)},${f(by)}L${f(ap[0] + t * 3)},${f(ap[1] + 4)}" stroke="#a87420" stroke-opacity="0.45" stroke-width="1"/>`); }
    c.push(`<path d="M${f(base[0] - rx)},${f(base[1])}A${f(rx)} ${f(ry)} 0 0 0 ${f(base[0] + rx)},${f(base[1])}" fill="none" stroke="#ffe08a" stroke-width="3" stroke-dasharray="5 3"/>`);
    // round sign with a fruit icon
    const sg = P(HT.x, HT.y, Z + 70); c.push(`<path d="M${pt(ap)}L${f(sg[0])},${f(sg[1] + 9)}" stroke="${C.wood}" stroke-width="2"/><circle cx="${f(sg[0])}" cy="${f(sg[1])}" r="10" fill="#fff" stroke="${C.orange}" stroke-width="2.4"/>`);
    sphere(sg[0], sg[1] + 1, 5.4, C.orange); c.push(`<path d="M${f(sg[0])},${f(sg[1] - 4)}q3,-4 6,-3" stroke="#3fa83a" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  });
  // ---- wooden bridge to the island ----
  c.add(2.1 + 6.8 - 0.3, () => {
    for (let y = 5.95; y < 7.7; y += 0.2) box(1.65, 2.55, y, y + 0.17, Z - 1, Z + 2, y % 0.4 < 0.2 ? C.wood : light(C.wood, 0.08), 1);
    for (const xx of [1.62, 2.58]) { for (let y = 6.0; y <= 7.6; y += 0.4) cyl(xx, y, 0.04, Z - 10, Z + 14, shade(C.wood, 0.85)); const a = P(xx, 5.95, Z + 14), b = P(xx, 7.65, Z + 14); c.push(`<path d="M${pt(a)}L${pt(b)}" stroke="${shade(C.wood, 0.7)}" stroke-width="4.4" stroke-linecap="round"/><path d="M${pt(a)}L${pt(b)}" stroke="${light(C.wood, 0.2)}" stroke-width="2.4" stroke-linecap="round"/>`); }
  });
  // ---- lamps, benches, lily pads, rocks ----
  const lamp = (x, y) => c.add(x + y, () => { ao(x, y, 0.1, Z, 1); cyl(x, y, 0.035, Z, Z + 40, '#3b4466'); const p = P(x, y, Z + 44); c.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="9" fill="#fff6c8" fill-opacity="0.35"/>`); sphere(p[0], p[1], 4.4, '#fff3c0'); });
  [[1.45, 4.2], [4.6, 4.2], [8.2, 4.2], [7.85 + 0.15, 7.2], [2.75, 8.5]].forEach(([x, y]) => lamp(x, y));
  const bench = (x, y) => c.add(x + y, () => { ao(x + 0.3, y + 0.1, 0.3, Z, 0.8); box(x, x + 0.62, y, y + 0.2, Z + 6, Z + 9, C.wood, 2); box(x, x + 0.62, y - 0.04, y + 0.03, Z + 9, Z + 17, C.wood, 2); for (const xx of [x + 0.06, x + 0.52]) box(xx, xx + 0.05, y + 0.02, y + 0.18, Z, Z + 6, '#3b4466', 1); });
  bench(3.1, 3.98); bench(5.6, 3.98);
  c.add(-1, () => {
    for (const [x, y, r] of [[4.3, 8.4, 0.22], [4.6, 9.0, 0.16], [4.1, 9.5, 0.2], [0.35, 6.9, 0.14]]) { const p = P(x, y, -10); c.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${f(Math.SQRT2 * 52 * S * r)}" ry="${f(Math.SQRT2 * 26 * S * r)}" fill="#3fb24a"/><path d="M${f(p[0])},${f(p[1])}l${f(Math.SQRT2 * 52 * S * r)},-2" stroke="#2a8a3a" stroke-width="1.4"/>`); }
    sphere(P(4.3, 8.4, -6)[0], P(4.3, 8.4, -6)[1], 3.4, C.pink);
  });
  // ---- vegetation ----
  tree(1.3, 1.3, HZ, 1.25, 1); tree(2.5, 1.0, HZ, 1.0); tree(3.6, 1.5, HZ, 1.15); tree(1.6, 2.6, HZ, 0.95, 1); tree(3.0, 2.5, HZ, 0.8);
  tree(1.25, 8.4, Z, 1.2); tree(1.05, 9.6, Z, 1.0, 1); tree(3.2, 9.9, Z, 1.1); tree(10.1, 10.0, Z, 1.15, 1); tree(10.2, 5.1, Z, 0.95);
  tree(4.4, 0.6, Z, 0.9);
  bush(3.45, 3.95, 1, C.pink); bush(9.6, 4.0, 1.1, C.yellow); bush(2.95, 8.9, 0.9, C.violet); bush(8.4, 10.1, 1, C.pink); bush(5.75, 9.8, 1.1, null); bush(0.9, 5.3, 1, C.yellow);
  bed(3.05, 4.4, 5.55, 5.95, [C.pink, C.yellow, '#ff5a6e'], 4);
  bed(8.15, 9.0, 5.55, 6.35, [C.violet, '#ffffff', C.pink], 9);
  bed(5.75, 6.65, 8.25, 9.3, [C.yellow, C.orange, '#ff5a6e'], 12);
  // ---- guests ----
  const walk = [[2.2, 4.75, 0], [3.4, 4.55, 1], [4.2, 4.95, 2], [5.3, 4.7, 3], [6.5, 4.95, 4], [8.9, 4.75, 5], [2.05, 5.6, 1], [2.1, 6.8, 3], [2.15, 8.2, 4], [7.35, 6.3, 0], [7.5, 7.7, 2], [7.25, 8.9, 5], [6.6, 6.75, 1]];
  walk.forEach(([x, y, gi], i) => c.add(x + y + 0.05, () => { const p = P(x, y, PZ); c.push(guest(p[0], p[1], { ...G[gi], dir: i % 2 ? -1 : 1 }, 1.25 * S)); }));
  c.flush();

  const scene = c.o.join('\n');
  const defs = c.defs.join('') + `
    <linearGradient id="jBg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#d9f4ff"/><stop offset="0.6" stop-color="#bfe8f7"/><stop offset="1" stop-color="#9fd6ea"/></linearGradient>
    <linearGradient id="jWater" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${C.waterA}"/><stop offset="1" stop-color="${C.waterB}"/></linearGradient>
    <linearGradient id="jGrass" gradientUnits="userSpaceOnUse" x1="0" y1="180" x2="0" y2="820"><stop offset="0" stop-color="${C.grassA}"/><stop offset="1" stop-color="${C.grassB}"/></linearGradient>
    <linearGradient id="jPath" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="760"><stop offset="0" stop-color="#fff4dc"/><stop offset="1" stop-color="#ecd8b0"/></linearGradient>
    <radialGradient id="jSun" cx="0.25" cy="0.15" r="0.9"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff6d8" stop-opacity="0"/><stop offset="1" stop-color="#0a3a5a" stop-opacity="0.18"/></radialGradient>
    <filter id="jAO" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="jSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="jSoftWide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="36"/></filter>`;
  const R2 = rng(21); let clouds = '';
  for (const [x, y, w] of [[230, 300, 150], [1380, 330, 190], [1250, 560, 120], [120, 600, 110]]) clouds += `<g opacity="0.85">${[0, 1, 2, 3].map((i) => `<circle cx="${f(x + (i - 1.5) * w * 0.28)}" cy="${f(y - (i % 3 ? w * 0.12 : 0))}" r="${f(w * (i % 3 ? 0.24 : 0.18))}" fill="#ffffff"/>`).join('')}<rect x="${f(x - w * 0.55)}" y="${f(y - 2)}" width="${f(w * 1.1)}" height="${f(w * 0.16)}" rx="${f(w * 0.08)}" fill="#ffffff"/></g>`;
  const bg = `<rect width="1600" height="1000" fill="url(#jBg)"/>${clouds}`;
  let lu = ''; G.forEach((g, i) => { lu += guest(100 + i * 76, 1000 - 46, g, 2 * 1.25 * S); });
  frame({
    key: 'j', letter: 'J', name: 'Lush premium mobile', file: 'j-lush',
    blurb: ['Rich, saturated and polished: a lake with foam and a sandy', 'rim, rock-sided hill, glossy clustered foliage, flowerbeds,', 'kerb-stone paths, soft ambient occlusion, gentle gradients.'],
    pal: [C.grassA, C.grassB, C.waterA, C.waterB, C.sand, C.path, C.red, C.pink], ink: '#17324a', sub: '#2f5670', panel: '#ffffffd9', panelInk: '#21435a',
    bg, scene: scene + `<rect width="1600" height="1000" fill="url(#jSun)" pointer-events="none"/>`, extraDefs: defs, lineup: { svg: lu, w: 470 },
    note: ['Gradients on every face; gloss on every ball.', 'Soft AO under all objects (pre-blurred).', 'Shore = halo + foam band + sand rim.', 'Paths: kerb band, paving joints, warm fill.', 'Foliage = 5-7 glossy spheres per tree.'],
  });
}

// ======================================================================
// K — Minimal geometric
// Five colours, each in exactly three planes of light (top / left / right, mixed toward slate).
// No outlines, no texture, no gradients. Big simple solids, hard flat cast shadows, lots of empty space.
// ======================================================================
function styleK() {
  const S = 0.92, c = Ctx(S, 790, 300), P = c.P;
  const K = { bone: '#f3eee5', sage: '#a9c2a4', coral: '#e8735a', slate: '#2f4858', amber: '#f2b84b' };
  const T = (col) => ({ top: col, left: mix(col, K.slate, 0.17), right: mix(col, K.slate, 0.4) });
  const SH = `fill="${K.slate}" fill-opacity="0.2"`;
  const V = [0.0125, 0.0035]; // shadow: grid offset per px of height (sun high on the left, behind)
  const face = (pts, fill) => c.push(`<path d="${poly(pts)}" fill="${fill}"/>`);
  function box(x0, x1, y0, y1, z0, z1, col, cols = {}) {
    const t = T(col);
    face([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], cols.right || t.right);
    face([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], cols.left || t.left);
    face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], cols.top || t.top);
  }
  function cyl(gx, gy, r, z0, z1, col) {
    const s = c.cylSide(gx, gy, r, z0, z1), t = T(col);
    c.push(`<path d="${s.d}" fill="${c.split(t.left, t.right, s.c0[0] - s.rx, s.c0[0] + s.rx, s.c0[0] + s.rx * 0.18, 0)}"/>`);
    c.push(`<path d="${s.top}" fill="${t.top}"/>`);
  }
  function cone(gx, gy, r, z0, h, col) {
    const b = P(gx, gy, z0), a = P(gx, gy, z0 + h), rx = Math.SQRT2 * 52 * S * r, t = T(col);
    c.push(`<path d="M${pt([b[0] - rx, b[1]])}A${f(rx)} ${f(rx / 2)} 0 0 0 ${pt([b[0] + rx, b[1]])}L${pt(a)}Z" fill="${c.split(t.left, t.right, b[0] - rx, b[0] + rx, b[0] + rx * 0.15, 0)}"/>`);
  }
  // hard cast shadow of a vertical prism / cylinder onto the plane z = zp
  const castBox = (x0, x1, y0, y1, h, zp = 0, clip = ' clip-path="url(#kGround)"') => { const dx = h * V[0], dy = h * V[1]; const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].flatMap(([x, y]) => [P(x, y, zp), P(x + dx, y + dy, zp)]); c.push(`<path d="${poly(hull(pts))}" ${SH}${clip}/>`); };
  const castCyl = (gx, gy, r, h, zp = 0, clip = zp ? '' : ' clip-path="url(#kGround)"') => { const pts = [...c.circ(gx, gy, r, zp, 24), ...c.circ(gx + h * V[0], gy + h * V[1], r, zp, 24)]; c.push(`<path d="${poly(hull(pts))}" ${SH}${clip}/>`); };

  // ---- capsule guest: body capsule + round head, split into a lit and a shade half ----
  function guest(sx, sy, g, k = 1) {
    const u = (v) => f(v * k), out = [];
    out.push(`<path d="M${f(sx)},${f(sy)}l${u(11)},${u(3)}" stroke="${K.slate}" stroke-opacity="0.2" stroke-width="${u(6.5)}" stroke-linecap="round"/>`);
    const w = 8.4, h = 15, x = sx - w / 2 * k, y = sy - h * k;
    const sp = (col) => c.og('ks' + col, (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0.55" stop-color="${T(col).left}"/><stop offset="0.55" stop-color="${T(col).right}"/></linearGradient>`);
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${u(w)}" height="${u(h)}" rx="${u(w / 2)}" fill="${sp(g.body)}"/>`);
    out.push(`<circle cx="${f(sx)}" cy="${f(sy - (h + 5) * k)}" r="${u(4.3)}" fill="${sp(g.head)}"/>`);
    if (g.dot) out.push(`<circle cx="${f(sx)}" cy="${f(sy - (h + 13) * k)}" r="${u(3)}" fill="${g.dot}"/><path d="M${f(sx)},${f(sy - (h + 10) * k)}L${f(sx)},${f(sy - (h + 4) * k)}" stroke="${K.slate}" stroke-opacity="0.5" stroke-width="${u(0.5)}"/>`);
    return out.join('');
  }
  const G = [
    { body: K.coral, head: K.bone }, { body: K.amber, head: K.bone, dot: K.coral }, { body: K.slate, head: K.bone },
    { body: K.bone, head: K.amber }, { body: K.coral, head: K.amber }, { body: K.sage, head: K.bone, dot: K.amber },
  ];

  // ================= terrain =================
  // ground plane
  box(0, 10, 0, 10, -26, 0, K.sage, { left: T(K.bone).left, right: T(K.bone).right });
  c.def(`<clipPath id="kGround"><path d="${poly([P(0, 0), P(10, 0), P(10, 10), P(0, 10)])}"/></clipPath>`);
  // pool: an inset, back walls in shade, flat water plane with one light bar
  const pool = [5.6, 9.4, 6.6, 9.4], DEP = 16;
  c.push(`<path d="${poly([P(pool[0], pool[2]), P(pool[1], pool[2]), P(pool[1], pool[3]), P(pool[0], pool[3])])}" fill="${T(K.bone).right}"/>`);
  c.def(`<clipPath id="kPoolC"><path d="${poly([P(pool[0], pool[2]), P(pool[1], pool[2]), P(pool[1], pool[3]), P(pool[0], pool[3])])}"/></clipPath>`);
  c.push(`<path d="${poly([P(pool[0], pool[2], -DEP), P(pool[1], pool[2], -DEP), P(pool[1], pool[3], -DEP), P(pool[0], pool[3], -DEP)])}" fill="${mix(K.slate, K.sage, 0.35)}" clip-path="url(#kPoolC)"/>`);
  c.push(`<path d="${poly([P(pool[0], pool[2], -DEP), P(pool[0], pool[3], -DEP), P(pool[0], pool[3], 0), P(pool[0], pool[2], 0)])}" fill="${T(K.bone).right}" clip-path="url(#kPoolC)"/>`);
  c.push(`<path d="${poly([P(pool[0], pool[2], -DEP), P(pool[1], pool[2], -DEP), P(pool[1], pool[2], 0), P(pool[0], pool[2], 0)])}" fill="${T(K.bone).left}" clip-path="url(#kPoolC)"/>`);
  c.push(`<path d="${poly([P(7.6, pool[2] + 0.3, -DEP), P(8.0, pool[2] + 0.3, -DEP), P(8.0, pool[3] - 0.2, -DEP), P(7.6, pool[3] - 0.2, -DEP)])}" fill="${K.bone}" fill-opacity="0.22" clip-path="url(#kPoolC)"/>`);
  // paths: flat bone planes, flush, no kerbs
  const paths = [[0, 10, 5.0, 5.8], [4.6, 5.4, 5.8, 10], [5.4, 10, 9.55, 10]];
  for (const [x0, x1, y0, y1] of paths) face([P(x0, y0, 0.5), P(x1, y0, 0.5), P(x1, y1, 0.5), P(x0, y1, 0.5)], K.bone);
  // ground shadows (drawn before the plateau so the plateau covers what it should)
  const PL = [0, 4.4, 0, 4.4], PZ = 40;
  castBox(PL[0], PL[1], PL[2], PL[3], PZ);
  const TW = { x: 2.1, y: 2.1, h: 230 };
  castBox(TW.x - 0.22, TW.x + 0.22, TW.y - 0.22, TW.y + 0.22, PZ + TW.h);
  // coaster shadow: the track projected along the sun onto the ground, one flat band
  const ctrl = [[5.6, 3.8, 12], [7.6, 3.8, 12], [8.8, 3.6, 60], [9.5, 2.9, 128], [9.55, 1.8, 140], [9.0, 1.0, 120], [7.9, 0.75, 40], [6.6, 0.8, 14], [5.6, 1.2, 40], [5.15, 2.0, 70], [5.1, 3.0, 40]];
  const trk = spline3(ctrl, 10, true);
  c.push(`<path d="${smoothPath(trk.map((p) => P(p[0] + p[2] * V[0], p[1] + p[2] * V[1], 0)), true)}" fill="none" stroke="${K.slate}" stroke-opacity="0.2" stroke-width="${f(10 * S)}" stroke-linejoin="round" clip-path="url(#kGround)"/>`);
  // plateau (raised terrain step) + stairs
  box(PL[0], PL[1], PL[2], PL[3], 0, PZ, K.sage, { left: T(K.bone).left, right: T(K.bone).right });
  face([P(0.6, 3.2, PZ + 0.5), P(4.4, 3.2, PZ + 0.5), P(4.4, 4.0, PZ + 0.5), P(0.6, 4.0, PZ + 0.5)], K.bone);
  for (let i = 0; i < 5; i++) box(4.4 + i * 0.2, 4.6 + i * 0.2, 3.2, 4.0, 0, PZ * (1 - (i + 1) / 6), K.bone);
  c.def(`<clipPath id="kPlat"><path d="${poly([P(PL[0], PL[2], PZ), P(PL[1], PL[2], PZ), P(PL[1], PL[3], PZ), P(PL[0], PL[3], PZ)])}"/></clipPath>`);
  castBox(TW.x - 0.22, TW.x + 0.22, TW.y - 0.22, TW.y + 0.22, TW.h, PZ, ` clip-path="url(#kPlat)"`);

  // ================= objects =================
  // drop tower: one tall square column, a ring carriage, a cap
  c.add(TW.x + TW.y, () => {
    box(TW.x - 0.42, TW.x + 0.42, TW.y - 0.42, TW.y + 0.42, PZ, PZ + 8, K.bone);
    box(TW.x - 0.2, TW.x + 0.2, TW.y - 0.2, TW.y + 0.2, PZ + 8, PZ + TW.h, K.coral);
    box(TW.x - 0.34, TW.x + 0.34, TW.y - 0.34, TW.y + 0.34, PZ + 150, PZ + 166, K.amber);
    box(TW.x - 0.26, TW.x + 0.26, TW.y - 0.26, TW.y + 0.26, PZ + TW.h, PZ + TW.h + 10, K.bone);
  });
  // coaster: a two-plane ribbon (top plane lit, edge plane in shade), thin slate posts
  c.add(7.3 + 2.3, () => {
    trk.forEach((p, i) => { if (i % 6 || p[2] < 18) return; const a = P(p[0], p[1], 0), b = P(p[0], p[1], p[2] - 4); c.push(`<path d="M${pt(a)}L${pt(b)}" stroke="${T(K.bone).right}" stroke-width="${f(3.2 * S)}"/>`); });
    const pts = trk.map((p) => P(p[0], p[1], p[2]));
    c.push(`<path d="${smoothPath(pts.map((q) => [q[0], q[1] + 4]), true)}" fill="none" stroke="${T(K.coral).right}" stroke-width="${f(9 * S)}" stroke-linejoin="round"/>`);
    c.push(`<path d="${smoothPath(pts, true)}" fill="none" stroke="${K.coral}" stroke-width="${f(9 * S)}" stroke-linejoin="round"/>`);
    // station: a bone slab with a flat amber roof plane
    box(5.6, 7.6, 4.0, 4.5, 0, 8, K.bone);
    [5.95, 6.45, 6.95].forEach((x) => { const p = P(x, 3.8, 14); c.push(guest(p[0], p[1] + 2, { body: K.slate, head: K.bone }, 0.7 * S)); });
    [5.95, 6.45, 6.95].forEach((x) => box(x - 0.2, x + 0.2, 3.65, 3.95, 12, 20, K.amber));
  });
  // stall: bone cube, coral counter band, tilted amber roof plane
  const ST = [6.4, 7.3, 4.1, 4.8];
  c.add(6.85 + 4.45, () => {
    castBox(ST[0], ST[1], ST[2], ST[3], 40);
    box(ST[0], ST[1], ST[2], ST[3], 0, 30, K.bone);
    face([P(ST[0], ST[3], 16), P(ST[1], ST[3], 16), P(ST[1], ST[3], 12), P(ST[0], ST[3], 12)], K.coral);
    face([P(ST[1], ST[2], 16), P(ST[1], ST[3], 16), P(ST[1], ST[3], 12), P(ST[1], ST[2], 12)], T(K.coral).right);
    const r = [P(ST[0] - 0.1, ST[2] - 0.1, 44), P(ST[1] + 0.1, ST[2] - 0.1, 44), P(ST[1] + 0.1, ST[3] + 0.25, 32), P(ST[0] - 0.1, ST[3] + 0.25, 32)];
    face([r[3], r[2], [r[2][0], r[2][1] + 4], [r[3][0], r[3][1] + 4]], T(K.amber).left);
    face([r[1], r[2], [r[2][0], r[2][1] + 4], [r[1][0], r[1][1] + 4]], T(K.amber).right);
    face(r, K.amber);
    for (const [x, y] of [[ST[0] - 0.05, ST[3] + 0.2], [ST[1] + 0.05, ST[3] + 0.2]]) c.push(`<path d="${line([P(x, y, 0), P(x, y, 33)])}" stroke="${T(K.bone).right}" stroke-width="2"/>`);
  });
  // trees: cones in groups, each with its flat shadow
  const tree = (x, y, r, h, z = 0) => c.add(x + y, () => { castCyl(x, y, r * 0.6, h * 0.7, z); cone(x, y, r, z, h, mix(K.sage, K.slate, 0.25)); });
  [[1.0, 6.6, 0.42, 70], [1.8, 7.2, 0.34, 54], [0.8, 7.8, 0.3, 46], [2.8, 8.8, 0.4, 66], [3.5, 9.4, 0.3, 48], [1.6, 9.2, 0.36, 58]].forEach((t) => tree(...t));
  [[3.4, 0.7, 0.32, 50], [0.8, 1.1, 0.36, 60]].forEach(([x, y, r, h]) => tree(x, y, r, h, PZ));
  [[9.7, 4.9, 0.3, 50], [9.6, 6.2, 0.26, 40]].forEach((t) => tree(...t));
  // round topiary: a cylinder trunk and a flat-shaded disc stack
  const pill = (x, y) => c.add(x + y, () => { castCyl(x, y, 0.28, 30); cyl(x, y, 0.28, 0, 30, mix(K.sage, K.slate, 0.12)); });
  pill(5.9, 6.1); pill(9.0, 6.1); pill(2.6, 6.3);
  // benches: bone bars
  c.add(3.0 + 4.9, () => box(2.6, 3.4, 4.75, 4.95, 0, 6, K.bone));
  // guests
  const walk = [[0.9, 5.4, 0], [2.0, 5.25, 1], [3.3, 5.5, 2], [4.0, 5.35, 4], [5.0, 6.6, 3], [4.95, 8.2, 5], [6.2, 5.45, 4], [7.9, 5.3, 0], [8.9, 5.55, 1], [6.8, 9.78, 2], [8.4, 9.8, 5], [1.6, 3.6, 3], [3.0, 3.55, 0]];
  walk.forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, y < 4.1 ? PZ + 0.5 : 0.5); c.push(guest(p[0], p[1], G[gi], 1.5 * S)); }));
  c.flush();

  const bg = `<rect width="1600" height="1000" fill="${K.bone}"/><circle cx="1390" cy="300" r="78" fill="${K.amber}"/>`;
  let lu = ''; G.forEach((g, i) => { lu += guest(100 + i * 74, 1000 - 50, g, 2 * 1.5 * S); });
  frame({
    key: 'k', letter: 'K', name: 'Minimal geometric', file: 'k-minimal',
    blurb: ['Five colours, three planes of light each. No outlines, no', 'texture, no gradients: big simple solids, flat hard shadows,', 'capsule guests and a lot of empty space. Calm and premium.'],
    pal: [K.bone, K.sage, K.coral, K.amber, K.slate], ink: K.slate, sub: mix(K.slate, K.bone, 0.3), panel: null, panelInk: K.slate,
    bg, scene: c.o.join('\n'), extraDefs: c.defs.join(''), lineup: { svg: lu, w: 470 },
    note: ['Faces: top = colour, left/right = 17% / 40% slate.', 'Shadows: one slate plane at 20%, cast by height.', 'Every ride is boxes, cylinders and cones only.', 'Guests: capsule + head, split light/shade.', '~1 fill per face: the cheapest sheet to draw.'],
  });
}

const want = process.argv.slice(2);
const all = { h: styleH, i: styleI, j: styleJ, k: styleK };
for (const k of Object.keys(all)) if (!want.length || want.includes(k)) all[k]();
