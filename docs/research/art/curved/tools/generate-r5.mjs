// Round 5 concept sheets: P (sketchbook), Q (comic pop), R (low-poly crystal), S (origami).
// Separate from generate.mjs, generate-r3.mjs and generate-r4.mjs on purpose: A-O stay byte-identical.
// Colour/geometry helpers, Ctx, Track, carGeom, cupGeom, ribbon and blobPts are copied from generate-r4.mjs
// (riders sit IN cars: well -> seated riders -> the car's camera-facing walls over their laps). Only the
// camera (isometric 2:1, x=(x-y)*52, y=(x+y)*26-z) is shared with the game.
// usage: node tools/generate-r5.mjs          -> all four
//        node tools/generate-r5.mjs p r      -> some
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


// ---------- shared building blocks (copied from round 4) ----------
// A track sampled by arc length. ctrl = [x, y, z] (tiles, tiles, px). at(d) -> point at arc length d.
function Track(ctrl, per = 12, closed = true) {
  const pts = spline3(ctrl, per, closed), L = [0];
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] - a[2]) / 40);
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i]));
  const tot = closed ? L[L.length - 1] + dist(pts[pts.length - 1], pts[0]) : L[L.length - 1];
  const at = (d) => {
    d = closed ? ((d % tot) + tot) % tot : Math.max(0, Math.min(tot, d));
    let i = 0; while (i < L.length - 1 && L[i + 1] < d) i++;
    const a = pts[i], b = i + 1 < pts.length ? pts[i + 1] : pts[0], e = (i + 1 < L.length ? L[i + 1] : tot);
    const t = (d - L[i]) / ((e - L[i]) || 1);
    return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
  };
  return { pts, L, tot, at, closed };
}
// A ride car as a TUB on a track: bottom/top corners, the side faces the camera can see, and seat points.
// Draw order for seated riders: well (top polygon) -> riders (back to front) -> visible sides over their laps.
function carGeom(P, trk, d, len, wid, h, lift = 3) {
  const A = trk.at(d - len / 2), B = trk.at(d + len / 2);
  let dx = B[0] - A[0], dy = B[1] - A[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const nx = -dy, ny = dx, w = wid / 2;
  const c3 = (p, s) => [p[0] + nx * w * s, p[1] + ny * w * s, p[2] + lift];
  const b = [c3(A, -1), c3(B, -1), c3(B, 1), c3(A, 1)], t = b.map((q) => [q[0], q[1], q[2] + h]);
  const N = [[-nx, -ny], [dx, dy], [nx, ny], [-dx, -dy]], sides = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; if (N[i][0] + N[i][1] > 0.02) sides.push({ pts: [P(...b[i]), P(...b[j]), P(...t[j]), P(...t[i])], n: N[i], end: i % 2 === 1, front: i === 1 }); }
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  const seat = (u, zIn) => [mid[0] + dx * len * u, mid[1] + dy * len * u, mid[2] + lift + h - zIn];
  return { b, t, top: t.map((q) => P(...q)), sides, dx, dy, nx, ny, A, B, mid, seat, depth: mid[0] + mid[1] };
}
// A cup (open cylinder): side, opening, and the FRONT WALL (side minus the opening) to draw over riders.
function cupGeom(c, gx, gy, r, z0, z1) {
  const s = c.cylSide(gx, gy, r, z0, z1), L = [s.c1[0] - s.rx, s.c1[1]], R = [s.c1[0] + s.rx, s.c1[1]];
  const A = `${f(s.rx)} ${f(s.ry)} 0 0 1`;
  return {
    ...s,
    front: `M${pt(L)}L${pt([s.c0[0] - s.rx, s.c0[1]])}A${f(s.rx)} ${f(s.ry)} 0 0 0 ${pt([s.c0[0] + s.rx, s.c0[1]])}L${pt(R)}A${A} ${pt(L)}Z`,
    rimFront: `M${pt(R)}A${A} ${pt(L)}`, rimBack: `M${pt(L)}A${A} ${pt(R)}`,
  };
}
// A strip of constant width along a smooth centre line, in GRID space (so it foreshortens like the ground).
function ribbon(P, ctrl, w, z = 0, per = 8) {
  const s = spline3(ctrl.map((p) => [p[0], p[1], p[2] ?? z]), per, false), Lp = [], Rp = [];
  s.forEach((p, i) => {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
    Lp.push(P(p[0] + nx, p[1] + ny, p[2])); Rp.push(P(p[0] - nx, p[1] - ny, p[2]));
  });
  return { poly: Lp.concat(Rp.slice().reverse()), L: Lp, R: Rp, mid: s };
}
// An organic closed outline in grid space (islands, ponds, planters).
function blobPts(gx, gy, R, seed, n = 72, amp = 1) {
  const r = rng(seed), ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, k = R * (1 + amp * (0.07 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.03 * Math.sin(7 * a + ph[2]))); return [gx + k * Math.cos(a), gy + k * Math.sin(a)]; });
}

// ---------- shared sheet frame (round-3 layout, round-5 label) ----------
function frame({ key, letter, name, file, blurb, pal, ink, sub, panel, panelInk, panelR = 18, swatchR = 9, swatchExtra = '', panelDeco = () => '', bg, scene, lineup, note, extraDefs = '', over = '', titleWeight = 800 }) {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" font-family="${FONT}">`);
  out.push(`<title>${letter} — ${name} · Thrills &amp; Chills round-5 art concept</title>`);
  out.push(`<defs>${extraDefs}</defs>`);
  out.push(bg);
  out.push(scene);
  out.push(over);
  out.push(`<text x="56" y="70" font-size="15" font-weight="700" letter-spacing="3" fill="${sub}">THRILLS &amp; CHILLS · ROUND 5 ART CONCEPT</text>`);
  out.push(`<text x="54" y="118" font-size="44" font-weight="${titleWeight}" fill="${ink}">${letter} — ${name}</text>`);
  blurb.forEach((l, i) => out.push(`<text x="56" y="${152 + i * 24}" font-size="17" font-weight="500" fill="${sub}">${l.replace(/&/g, '&amp;')}</text>`));
  out.push(`<text x="1200" y="70" font-size="15" font-weight="700" letter-spacing="3" fill="${sub}">PALETTE</text>`);
  pal.forEach((p, i) => out.push(`<rect x="${1200 + i * 42}" y="84" width="34" height="34" rx="${swatchR}" fill="${p}"${swatchExtra}/>`));
  out.push(`<g>${panel ? `<rect x="36" y="${1000 - 236}" width="${lineup.w + 40}" height="210" rx="${panelR}" fill="${panel}"/>${panelDeco(36, 1000 - 236, lineup.w + 40, 210)}` : ''}`);
  out.push(`<text x="56" y="${1000 - 204}" font-size="15" font-weight="700" letter-spacing="3" fill="${panelInk || sub}">GUESTS · 2×</text>${lineup.svg}</g>`);
  const nx = 1600 - 36 - 440;
  out.push(`<g>${panel ? `<rect x="${nx}" y="${1000 - 236}" width="440" height="210" rx="${panelR}" fill="${panel}"/>${panelDeco(nx, 1000 - 236, 440, 210)}` : ''}`);
  out.push(`<text x="${nx + 22}" y="${1000 - 204}" font-size="15" font-weight="700" letter-spacing="3" fill="${panelInk || sub}">STYLE NOTE</text>`);
  note.forEach((l, i) => out.push(`<text x="${nx + 22}" y="${1000 - 172 + i * 25}" font-size="16.5" font-weight="${i === 0 ? 700 : 500}" fill="${panelInk || sub}">${l.replace(/&/g, '&amp;')}</text>`));
  out.push(`</g></svg>`);
  fs.writeFileSync(`${OUT}/${file}.svg`, out.join('\n'));
  console.log(`${file}.svg`);
}

// ---------- round-5 helpers ----------
// Limb width floor: every guest arm/leg is at least 2.6 screen px at the size it is drawn, so it does not shimmer.
const LIMB = (k, base = 2.2) => f(Math.max(2.6, base * k));
// Single-stroke hand lettering (P labels): glyphs on a 4 x 6 grid, y down. Drawn as pen strokes, not a font.
const GLYPH = {
  A: [[[0, 6], [2, 0], [4, 6]], [[0.8, 3.8], [3.2, 3.8]]], B: [[[0, 6], [0, 0], [3, 0], [4, 1.2], [3, 3], [0, 3]], [[3, 3], [4, 4.5], [3, 6], [0, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1.5], [0, 4.5], [1, 6], [3, 6], [4, 5]]], D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]], F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1.5], [0, 4.5], [1, 6], [3, 6], [4, 5], [4, 3.5], [2.5, 3.5]]], H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]]], J: [[[4, 0], [4, 4.5], [3, 6], [1, 6], [0, 4.5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.3, 2.6], [4, 6]]], L: [[[0, 0], [0, 6], [4, 6]]], M: [[[0, 6], [0, 0], [2, 3.5], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]], O: [[[2, 0], [0.5, 0.8], [0, 3], [0.5, 5.2], [2, 6], [3.5, 5.2], [4, 3], [3.5, 0.8], [2, 0]]],
  P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]], Q: [[[2, 0], [0.5, 0.8], [0, 3], [0.5, 5.2], [2, 6], [3.5, 5.2], [4, 3], [3.5, 0.8], [2, 0]], [[2.6, 4.4], [4.2, 6.4]]],
  R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[2, 3], [4, 6]]], S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]], U: [[[0, 0], [0, 4.5], [1, 6], [3, 6], [4, 4.5], [4, 0]]], V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]], X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]], Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]], Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  0: [[[2, 0], [0.5, 0.8], [0, 3], [0.5, 5.2], [2, 6], [3.5, 5.2], [4, 3], [3.5, 0.8], [2, 0]]], 1: [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [0, 6], [4, 6]]], 3: [[[0, 0.5], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1.5, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5.5]]],
  4: [[[3, 6], [3, 0], [0, 4], [4, 4]]], 5: [[[4, 0], [0.5, 0], [0, 3], [3, 2.6], [4, 3.8], [4, 5], [3, 6], [0.5, 6], [0, 5.5]]],
  6: [[[3.5, 0], [1.5, 0.5], [0, 3], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 4]]], 7: [[[0, 0], [4, 0], [1.5, 6]]],
  8: [[[2, 3], [0.5, 2], [0.5, 0.8], [2, 0], [3.5, 0.8], [3.5, 2], [2, 3], [0, 4.4], [0.5, 5.6], [2, 6], [3.5, 5.6], [4, 4.4], [2, 3]]],
  9: [[[4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [3, 5.5], [1, 6]]],
  '-': [[[0.5, 3], [3.5, 3]]], '.': [[[1.8, 5.8], [2.2, 6]]], '!': [[[2, 0], [2, 4.2]], [[2, 5.6], [2, 6]]], '?': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [2, 3.2], [2, 4.2]], [[2, 5.6], [2, 6]]],
  '/': [[[4, 0], [0, 6]]], '+': [[[2, 1.5], [2, 4.5]], [[0.5, 3], [3.5, 3]]], ':': [[[2, 1.6], [2, 2]], [[2, 4.8], [2, 5.2]]], '=': [[[0.5, 2.2], [3.5, 2.2]], [[0.5, 3.8], [3.5, 3.8]]],
};
function hand(str, x, y, h, col, w = 1.4, slant = 0.14, seed = 1) {
  const r = rng(seed), s = h / 6; let cx = x, d = '';
  for (const ch of str.toUpperCase()) {
    if (ch === ' ') { cx += 3.4 * s; continue; }
    const g = GLYPH[ch]; if (!g) { cx += 4 * s; continue; }
    const dy = (r() - 0.5) * 0.6 * s, sc = 1 + (r() - 0.5) * 0.08;
    for (const st of g) d += 'M' + st.map(([gx, gy]) => pt([cx + (gx * sc + (6 - gy) * slant) * s + (r() - 0.5) * 0.35 * s, y + (gy - 6) * sc * s + dy + (r() - 0.5) * 0.35 * s])).join('L');
    cx += (ch === 'I' || ch === '1' || ch === '.' || ch === '!' || ch === ':' ? 3.6 : 5.4) * s + (r() - 0.5) * 0.4 * s;
  }
  return { svg: `<path d="${d}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`, w: cx - x };
}
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const scaleAbout = (pts, k, o = centroid(pts)) => pts.map((p) => [o[0] + (p[0] - o[0]) * k, o[1] + (p[1] - o[1]) * k]);

// ======================================================================
// P — Sketchbook
// A designer's sketchbook page: pen ink with overshoot at the corners, loose alcohol-marker washes laid
// off-register (they spill out on one side and leave paper on the other; a second pass = the shade), blue
// pencil construction lines, hatched pen shadows and hand-lettered labels with arrows.
// ======================================================================
function styleP() {
  const S = 1.12, c = Ctx(S, 760, 236), P = c.P, R = rng(4242);
  const INK = '#25232c', BLUE = '#6f9ad3';
  const K = { grass: '#a6d66f', grassD: '#79b54d', sand: '#f4c98a', red: '#f0604f', coral: '#ff9468', teal: '#3cb5a6', blue: '#62a0dc', yellow: '#ffd34a', purple: '#ad86d8', wood: '#d39a5c', grey: '#aab2b8', pink: '#f59bbd', water: '#8fd0ee', skin: ['#f6d2b4', '#e6ad84', '#b77b52', '#80553a'] };
  const jt = (a) => (R() - 0.5) * 2 * a;
  const MUL = 'style="mix-blend-mode:multiply"';
  // one pen stroke a -> b that overshoots both ends a little and bows very slightly
  const seg = (a, b, w = 1.6, o = 4, col = INK, op = 1) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, oo = Math.min(o, l * 0.3);
    const o1 = oo * (0.3 + R() * 0.9), o2 = oo * (0.3 + R() * 0.9);
    const A = [a[0] - ux * o1 + jt(0.4), a[1] - uy * o1 + jt(0.4)], B = [b[0] + ux * o2 + jt(0.4), b[1] + uy * o2 + jt(0.4)];
    const bow = jt(Math.min(2, l * 0.015)), M = [(A[0] + B[0]) / 2 - uy * bow, (A[1] + B[1]) / 2 + ux * bow];
    return `<path d="M${pt(A)}Q${pt(M)} ${pt(B)}" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" fill="none"${op < 1 ? ` stroke-opacity="${op}"` : ''}/>`;
  };
  const inkPoly = (pts, closed = true, w = 1.6, o = 4) => pts.map((p, i) => (i < pts.length - 1 || closed) ? seg(p, pts[(i + 1) % pts.length], w, o) : '').join('');
  // a smooth pen line, drawn twice: a confident pass and a faint second pass slightly off (sketch look)
  const inkCurve = (pts, closed = false, w = 1.6, col = INK) => {
    const q = pts.map((p) => [p[0] + jt(0.9), p[1] + jt(0.9)]);
    return `<path d="${smoothPath(pts, closed)}" stroke="${col}" stroke-width="${f(w)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${smoothPath(q, closed)}" stroke="${col}" stroke-width="${f(w * 0.55)}" stroke-opacity="0.45" fill="none" stroke-linecap="round"/>`;
  };
  // an ellipse drawn as one loop that overshoots past its start
  const inkEll = (cx, cy, rx, ry, w = 1.5, col = INK) => {
    const a0 = R() * 6.28, n = 28, pts = [];
    for (let i = 0; i <= n + 3; i++) { const a = a0 + i / n * Math.PI * 2 * 1.0, rr = 1 + (i > n ? 0.05 * (i - n) : 0) + jt(0.012); pts.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]); }
    return `<path d="${smoothPath(pts)}" stroke="${col}" stroke-width="${f(w)}" fill="none" stroke-linecap="round"/>`;
  };
  // marker wash: the shape, shrunk a touch and pushed off-register (spills one side, leaves paper the other)
  const wash = (pts, col, op = 0.62, k = 0.93, sh = 3) => { const q = scaleAbout(pts, k).map((p) => [p[0] + sh * 0.8, p[1] - sh * 0.5]); return `<path d="${smoothPath(q.map((p) => [p[0] + jt(0.6), p[1] + jt(0.6)]), true)}" fill="${col}" fill-opacity="${op}" ${MUL}/>`; };
  // big areas: parallel marker strokes clipped to a jittered outline, each stroke its own path so overlaps darken
  const streak = (pts, col, w = 18, op = 0.42, ang = -0.42, gap = 0.78) => {
    const id = c.id('pc'), cl = scaleAbout(pts, 0.985).map((p) => [p[0] + 5, p[1] - 3]);
    c.def(`<clipPath id="${id}"><path d="${smoothPath(cl, true)}"/></clipPath>`);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, D = Math.hypot(x1 - x0, y1 - y0) / 2;
    let s = `<g clip-path="url(#${id})" ${MUL}>`;
    for (let t = -D; t <= D; t += w * gap) {
      if (R() < 0.04) continue;
      const a = -D * (0.75 + R() * 0.3), b = D * (0.75 + R() * 0.3), ox = cx + nx * (t + jt(w * 0.25)), oy = cy + ny * (t + jt(w * 0.25)), tw = jt(0.035), ex = dx + nx * tw, ey = dy + ny * tw;
      s += `<path d="M${f(ox + ex * a)},${f(oy + ey * a)}L${f(ox + ex * b)},${f(oy + ey * b)}" stroke="${col}" stroke-opacity="${f(op * (0.85 + R() * 0.3))}" stroke-width="${f(w * (0.9 + R() * 0.2))}" stroke-linecap="round"/>`;
    }
    return s + '</g>';
  };
  // pen hatching inside an ellipse (cast shadows): short diagonal strokes
  const hatch = (cx, cy, rx, ry, sp = 4.2, op = 0.55) => {
    let d = '';
    for (let t = -rx - ry; t < rx + ry; t += sp) {
      // line x - y*1.2 = t through the ellipse: sample its endpoints numerically
      const xs = []; for (let i = 0; i <= 40; i++) { const yy = -ry + i / 40 * 2 * ry, xx = t + yy * 1.2; if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) xs.push([xx, yy]); }
      if (xs.length > 1) { const a = xs[0], b = xs[xs.length - 1]; d += `M${f(cx + a[0] + jt(0.8))},${f(cy + a[1])}L${f(cx + b[0] + jt(0.8))},${f(cy + b[1])}`; }
    }
    return `<path d="${d}" stroke="${INK}" stroke-opacity="${op}" stroke-width="0.9" stroke-linecap="round"/>`;
  };
  const gHatch = (gx, gy, r, z = 0, op = 0.5) => { const p = P(gx, gy, z); return hatch(p[0] + 4, p[1] + 2, Math.SQRT2 * 52 * S * r, Math.SQRT2 * 26 * S * r, 4.2, op); };
  const cons = (a, b, ext = 40, op = 0.5) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return `<path d="M${f(a[0] - dx / l * ext)},${f(a[1] - dy / l * ext)}L${f(b[0] + dx / l * ext)},${f(b[1] + dy / l * ext)}" stroke="${BLUE}" stroke-opacity="${op}" stroke-width="1"/>`; };
  const consEll = (cx, cy, rx, ry, op = 0.45) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" stroke="${BLUE}" stroke-opacity="${op}" stroke-width="1" fill="none"/>`;
  const arrow = (pts, w = 1.3) => { const a = pts[pts.length - 2], b = pts[pts.length - 1], an = Math.atan2(b[1] - a[1], b[0] - a[0]); return `<path d="${smoothPath(pts)}" stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round"/><path d="M${f(b[0] - Math.cos(an - 0.45) * 9)},${f(b[1] - Math.sin(an - 0.45) * 9)}L${pt(b)}L${f(b[0] - Math.cos(an + 0.45) * 9)},${f(b[1] - Math.sin(an + 0.45) * 9)}" stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; };
  // a box: three faces, marker on top lightly, sides darker by a second marker pass, inked edges
  const box = (x0, x1, y0, y1, z0, z1, col, opt = {}) => {
    const T = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], Rf = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], Lf = [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)];
    let s = wash(Lf, col, 0.62) + wash(Rf, col, 0.62) + wash(Rf, col, 0.5, 0.86, 2) + wash(T, col, 0.38, 0.9, 2);
    s += inkPoly([T[0], T[1], T[2], T[3]], true, opt.w || 1.6) + seg(Lf[0], Lf[3], opt.w || 1.6) + seg(Lf[1], Lf[2], opt.w || 1.6) + seg(Rf[3], Rf[2], opt.w || 1.6) + seg(Lf[3], Lf[2], opt.w || 1.6) + seg(Rf[0], Rf[3], opt.w || 1.6);
    return s;
  };

  // ---------- guests: pen figures with a marker shirt laid off-register ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const u = (v) => f(v * k), X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), o = [], LW = LIMB(k, 2.2);
    const top = seated ? -12 : -21, bot = seated ? 0 : -8.5, hy = top - 6.2;
    if (!seated) {
      o.push(hatch(sx + 2 * k, sy + 0.5 * k, 6.5 * k, 2.2 * k, 2.6 * Math.max(1, k * 0.8), 0.5));
      o.push(`<path d="M${X(-1.9)},${Y(bot)}L${X(-2.6)},${Y(-0.6)}l${u(-1.6 * g.dir)},0M${X(1.9)},${Y(bot)}L${X(3)},${Y(-1)}l${u(1.8 * g.dir)},${u(0.3)}" stroke="${g.pants ? shade(g.pants, 0.55) : INK}" stroke-width="${LW}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
    }
    const body = [[-3.6, top], [3.6, top], [5.4, bot], [-5.4, bot]].map(([a, b]) => [sx + a * k * g.dir, sy + b * k]);
    o.push(`<path d="${smoothPath(body, true)}" fill="#fffdf6"/><circle cx="${X(0)}" cy="${Y(hy)}" r="${u(5.3)}" fill="#fffdf6"/>`);
    o.push(`<path d="${smoothPath(scaleAbout(body, 0.95).map((p) => [p[0] + 1.3 * k, p[1] - 0.8 * k]), true)}" fill="${g.shirt}" fill-opacity="0.85" ${MUL}/>`);
    o.push(`<path d="M${X(-3.6)},${Y(top)}Q${X(-5.8)},${Y(top + 4)} ${X(-5.6)},${Y(bot + 0.5)}L${X(5.9)},${Y(bot + 0.4)}Q${X(5.8)},${Y(top + 4)} ${X(3.4)},${Y(top - 0.3)}" stroke="${INK}" stroke-width="${f(Math.max(1.1, 0.95 * k))}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (seated) o.push(`<path d="M${X(-4.6)},${Y(top + 2)}L${X(-7.6)},${Y(top - 6.5)}M${X(4.6)},${Y(top + 2)}L${X(7.6)},${Y(top - 6.5)}" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>`);
    else o.push(`<path d="M${X(4.8)},${Y(top + 2)}Q${X(7.2)},${Y(top + 6)} ${X(6.6)},${Y(top + 9.5)}M${X(-4.8)},${Y(top + 2)}Q${X(-7)},${Y(top + 5)} ${X(-7.4)},${Y(top + 8.5)}" stroke="${INK}" stroke-width="${LW}" fill="none" stroke-linecap="round"/>`);
    if (g.bag && !seated) o.push(`<path d="M${X(-7.4)},${Y(top + 8)}l${u(-2 * g.dir)},${u(1)}l${u(0.4 * g.dir)},${u(5)}l${u(4.4 * g.dir)},0l${u(0.2 * g.dir)},${u(-5)}z" fill="${g.bag}" fill-opacity="0.8" ${MUL} stroke="${INK}" stroke-width="${f(0.9 * k)}"/>`);
    if (g.balloon && !seated) o.push(`<path d="M${X(6.6)},${Y(top + 9.5)}Q${X(10)},${Y(top - 2)} ${X(8.5)},${Y(top - 14)}" stroke="${INK}" stroke-width="${f(0.7 * k)}" fill="none"/><circle cx="${X(9.6)}" cy="${Y(top - 19.6)}" r="${u(5.2)}" fill="${g.balloon}" fill-opacity="0.85" ${MUL}/>${inkEll(+X(8.6), +Y(top - 19), 5 * k, 5.6 * k, 0.9 * k)}`);
    // head: skin wash + one open pen loop + hair scribble
    o.push(`<circle cx="${X(0.9)}" cy="${Y(hy - 0.5)}" r="${u(5.1)}" fill="${g.skin}" ${MUL}/>`);
    o.push(inkEll(+X(0), +Y(hy), 5.2 * k, 5.4 * k, Math.max(1.1, 0.95 * k)));
    if (g.hair === 'cap') o.push(`<path d="M${X(-5.4)},${Y(hy - 1)}Q${X(0)},${Y(hy - 10)} ${X(5.4)},${Y(hy - 1)}L${X(9)},${Y(hy - 0.6)}" fill="${g.hairCol}" fill-opacity="0.9" ${MUL} stroke="${INK}" stroke-width="${f(0.9 * k)}" stroke-linecap="round"/>`);
    else if (g.hair === 'bun') o.push(`<path d="M${X(-5.2)},${Y(hy)}Q${X(-4)},${Y(hy - 7)} ${X(1)},${Y(hy - 5.6)}Q${X(5)},${Y(hy - 5)} ${X(5)},${Y(hy - 1)}" fill="${g.hairCol}" fill-opacity="0.85" ${MUL}/><path d="M${X(-4.6)},${Y(hy - 1)}l${u(2.2 * g.dir)},${u(-3)}l${u(1)},${u(2.4)}l${u(2.2 * g.dir)},${u(-3)}l${u(1)},${u(2.6)}l${u(2.2 * g.dir)},${u(-2)}" stroke="${INK}" stroke-width="${f(0.8 * k)}" fill="none" stroke-linejoin="round"/>${inkEll(+X(-3.4), +Y(hy - 6.6), 2.4 * k, 2.2 * k, 0.9 * k)}`);
    else o.push(`<path d="M${X(-5.4)},${Y(hy + 1.5)}Q${X(-5.8)},${Y(hy - 7.5)} ${X(0.5)},${Y(hy - 6)}Q${X(6)},${Y(hy - 5)} ${X(5.3)},${Y(hy - 0.5)}" fill="${g.hairCol}" fill-opacity="0.85" ${MUL}/><path d="M${X(-5)},${Y(hy + 1)}q${u(1 * g.dir)},${u(-7)} ${u(6 * g.dir)},${u(-6.4)}q${u(4 * g.dir)},${u(0.6)} ${u(4.6 * g.dir)},${u(4.6)}" stroke="${INK}" stroke-width="${f(0.9 * k)}" fill="none"/>`);
    o.push(`<circle cx="${X(2.4)}" cy="${Y(hy + 0.2)}" r="${u(0.75)}" fill="${INK}"/>`);
    return o.join('');
  }
  const G = [
    { dir: 1, shirt: K.red, pants: K.blue, skin: K.skin[0], hair: 'mop', hairCol: K.wood, bag: K.yellow },
    { dir: -1, shirt: K.teal, pants: '#6c6f7a', skin: K.skin[2], hair: 'bun', hairCol: '#4a3428', balloon: K.pink },
    { dir: 1, shirt: K.yellow, pants: K.purple, skin: K.skin[1], hair: 'cap', hairCol: K.blue },
    { dir: -1, shirt: K.purple, pants: K.wood, skin: K.skin[3], hair: 'mop', hairCol: '#2b2320' },
    { dir: 1, shirt: K.coral, pants: K.teal, skin: K.skin[0], hair: 'bun', hairCol: K.yellow },
    { dir: -1, shirt: K.blue, pants: K.red, skin: K.skin[1], hair: 'cap', hairCol: K.red, bag: K.teal },
  ];
  const GK = 1.12 * S;

  // ---------- construction: iso grid guides and a horizon, in blue pencil ----------
  let under = '';
  for (let i = 0; i <= 10; i += 2) under += cons(P(i, -0.5), P(i, 10), 30, 0.32) + cons(P(-0.5, i), P(10.5, i), 30, 0.32);
  under += cons([120, 214], [1480, 214], 0, 0.4) + `<text x="1410" y="208" font-size="12" fill="${BLUE}" fill-opacity="0.7" font-style="italic">h.l.</text>`;
  under += cons(P(5, 4.5, 0), P(5, 4.5, 260), 20, 0.3);
  // ground: a loose oval vignette of grass marker that never reaches a hard edge
  const ground = blobPts(5, 4.7, 5.6, 9, 60, 1.6).map((q) => P(q[0], q[1], 0));
  under += streak(ground, K.grass, 26, 0.36, -0.46, 0.62);
  under += streak(scaleAbout(ground, 0.62).map((p) => [p[0] + 60, p[1] + 10]), K.grassD, 16, 0.22, -0.46, 1.4);
  // pond, back right of the swinger
  const pond = blobPts(1.0, 6.3, 0.95, 31, 40, 0.8).map((q) => P(q[0], q[1], 0));
  under += streak(pond, K.water, 12, 0.55, -0.3, 0.7) + inkCurve(pond, true, 1.4);
  for (let i = 0; i < 3; i++) { const p = P(0.8 + i * 0.25, 6.2 + i * 0.12); under += seg([p[0] - 10, p[1]], [p[0] + 10, p[1]], 1, 2, '#3a7fb0', 0.7); }
  // paths: sand marker strips, both kerbs inked in broken strokes
  const paths = [ribbon(P, [[0.2, 4.9], [3, 4.9], [6, 4.95], [9.8, 4.9]], 1.15, 0, 4), ribbon(P, [[5.1, 4.9], [5.1, 7], [5.05, 9.8]], 1.05, 0, 4), ribbon(P, [[6.3, 4.6], [6.3, 3.75]], 0.8, 0, 2)];
  paths.forEach((rb) => { under += streak(rb.poly, K.sand, 14, 0.55, -0.42, 0.72); });
  paths.forEach((rb) => { for (const side of [rb.L, rb.R]) for (let i = 0; i < side.length - 1; i++) if (R() > 0.12) under += seg(side[i], side[i + 1], 1.4, 3); });
  // paving ticks along the main path
  for (let x = 0.6; x < 9.6; x += 0.62) { if (Math.abs(x - 5.1) < 0.6) continue; under += seg(P(x, 4.42), P(x, 5.38), 0.8, 1, INK, 0.35); }
  c.push(under);

  // ---------- coaster: a wooden out-and-back, lattice bents drawn like structure studies ----------
  const trk = Track([[4.4, 3.35, 9], [6.0, 3.35, 9], [7.4, 3.25, 26], [8.6, 2.85, 92], [9.35, 2.05, 124], [9.15, 1.05, 118], [8.3, 0.6, 64], [7.1, 0.7, 14], [5.9, 0.75, 52], [4.7, 0.85, 62], [3.7, 1.25, 30], [3.35, 2.3, 14], [3.6, 3.15, 9]], 10, true);
  const tp = trk.pts, posts = [];
  tp.forEach((p, i) => { if (i % 3 === 0 && p[2] > 14) posts.push(p); });
  posts.forEach((p, i) => c.add(p[0] + p[1] - 0.15, () => {
    const a = P(p[0], p[1], 0), b = P(p[0], p[1], p[2] - 4); c.push(seg(a, b, 1.5, 3));
    const q = posts[i + 1]; if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.9) { const a2 = P(q[0], q[1], 0), b2 = P(q[0], q[1], q[2] - 4), m = Math.min(p[2], q[2]) - 6; for (let z = 0; z < m - 10; z += 26) c.push(seg(P(p[0], p[1], z), P(q[0], q[1], Math.min(z + 26, m)), 0.9, 2, INK, 0.7) + seg(P(q[0], q[1], z), P(p[0], p[1], Math.min(z + 26, m)), 0.9, 2, INK, 0.7)); c.push(seg(a, a2, 0.9, 2, INK, 0.5)); }
    c.push(seg([a[0] - 5, a[1]], [a[0] + 5, a[1]], 1.2, 1));
  }));
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.12, ny = dx / l * 0.12;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2, () => {
      const L0 = P(p[0] + nx, p[1] + ny, p[2]), L1 = P(q[0] + nx, q[1] + ny, q[2]), R0 = P(p[0] - nx, p[1] - ny, p[2]), R1 = P(q[0] - nx, q[1] - ny, q[2]);
      c.push(`<path d="M${pt(L0)}L${pt(L1)}L${pt(R1)}L${pt(R0)}Z" fill="${K.red}" fill-opacity="0.55" ${MUL}/>`);
      c.push(`<path d="M${pt(L0)}L${pt(L1)}M${pt(R0)}L${pt(R1)}" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`);
      if (i % 2 === 0) c.push(seg(L0, R0, 0.9, 1.5));
    });
  }
  c.add(4.4 + 3.35 + 0.5, () => c.push(box(4.3, 6.0, 3.6, 4.05, 0, 9, K.wood) + box(4.3, 4.45, 3.6, 4.05, 9, 34, K.wood) + box(5.85, 6.0, 3.6, 4.05, 9, 34, K.wood) + box(4.2, 6.1, 3.5, 4.15, 34, 40, K.red)));
  const carCols = [K.blue, K.yellow, K.teal];
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 11.2 + k * 0.62, 0.52, 0.44, 12, 2);
    const col = carCols[k];
    c.add(car.depth + 0.25, () => {
      c.push(`<path d="${poly(car.top)}" fill="${INK}" fill-opacity="0.75"/>`);
      [-0.2, 0.2].map((u) => car.seat(u, 9)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j + 1) % 6], dir: 1 }, GK * 0.9, true)); });
      car.sides.forEach((sd) => { c.push(wash(sd.pts, col, 0.75, 0.96, 1.5)); if (sd.n[0] > sd.n[1]) c.push(wash(sd.pts, col, 0.45, 0.85, 1)); c.push(inkPoly(sd.pts, true, 1.5, 3)); });
      c.push(inkPoly(car.top, true, 1.5, 3));
    });
  });
  // speed marks behind the train
  c.add(20, () => { const a = P(...trk.at(10.2)), b = P(...trk.at(9.2)); for (let i = -1; i <= 1; i++) c.push(seg([a[0] + i * 6, a[1] + i * 7], [b[0] + i * 6, b[1] + i * 7], 1, 2, INK, 0.55)); });

  // ---------- wave swinger: pole, scalloped canopy, chair-tubs out on chains ----------
  const WS = { x: 2.2, y: 2.3 }, NS = 8, ZTOP = 118;
  const wsC = P(WS.x, WS.y, 0);
  c.push(consEll(wsC[0], wsC[1], Math.SQRT2 * 52 * S * 1.45, Math.SQRT2 * 26 * S * 1.45) + cons(P(WS.x, WS.y, 0), P(WS.x, WS.y, ZTOP + 30), 24, 0.4));
  c.add(WS.x + WS.y - 2, () => { c.push(gHatch(WS.x, WS.y, 1.25, 0, 0.32)); const s = c.cylSide(WS.x, WS.y, 0.6, 0, 8); c.push(`<path d="${s.d}" fill="${K.grey}" fill-opacity="0.6" ${MUL}/><path d="${s.top}" fill="${K.purple}" fill-opacity="0.35" ${MUL}/>` + inkEll(s.c1[0], s.c1[1], s.rx, s.ry, 1.5) + seg([s.c1[0] - s.rx, s.c1[1]], [s.c0[0] - s.rx, s.c0[1]], 1.4, 2) + seg([s.c1[0] + s.rx, s.c1[1]], [s.c0[0] + s.rx, s.c0[1]], 1.4, 2)); });
  const seats = Array.from({ length: NS }, (_, i) => { const a = i / NS * Math.PI * 2 + 0.25; return { a, x: WS.x + 1.32 * Math.cos(a), y: WS.y + 1.32 * Math.sin(a), z: 52 + 6 * Math.sin(a * 2), hx: WS.x + 0.92 * Math.cos(a), hy: WS.y + 0.92 * Math.sin(a), col: [K.red, K.yellow, K.blue, K.teal][i % 4] }; });
  const seatDraw = (s, i) => {
    const h = P(s.hx, s.hy, ZTOP - 12), g = cupGeom(c, s.x, s.y, 0.17, s.z - 8, s.z + 3), cA = [g.c1[0] - g.rx * 0.8, g.c1[1]], cB = [g.c1[0] + g.rx * 0.8, g.c1[1]];
    c.push(seg(h, cA, 0.9, 1) + seg(h, cB, 0.9, 1));
    c.push(`<path d="${g.top}" fill="${INK}" fill-opacity="0.7"/>`);
    const r = P(s.x, s.y, s.z + 3 - 9); c.push(guest(r[0], r[1], { ...G[(i + 2) % 6], dir: Math.cos(s.a) - Math.sin(s.a) > 0 ? 1 : -1 }, GK * 0.8, true));
    c.push(`<path d="${g.front}" fill="${s.col}" fill-opacity="0.75" ${MUL}/>` + `<path d="${g.rimFront}" stroke="${INK}" stroke-width="1.4" fill="none"/>` + seg([g.c1[0] - g.rx, g.c1[1]], [g.c0[0] - g.rx, g.c0[1]], 1.3, 2) + seg([g.c1[0] + g.rx, g.c1[1]], [g.c0[0] + g.rx, g.c0[1]], 1.3, 2) + `<path d="M${pt([g.c0[0] - g.rx, g.c0[1]])}A${f(g.rx)} ${f(g.ry)} 0 0 0 ${pt([g.c0[0] + g.rx, g.c0[1]])}" stroke="${INK}" stroke-width="1.4" fill="none"/>`);
  };
  seats.forEach((s, i) => { if (Math.cos(s.a) + Math.sin(s.a) < 0) c.add(WS.x + WS.y - 1 + (Math.cos(s.a) + Math.sin(s.a)) * 0.1, () => seatDraw(s, i)); });
  c.add(WS.x + WS.y, () => {
    const a = P(WS.x, WS.y, 8), b = P(WS.x, WS.y, ZTOP);
    c.push(`<path d="M${f(a[0] - 4)},${f(a[1])}L${f(b[0] - 4)},${f(b[1])}L${f(b[0] + 4)},${f(b[1])}L${f(a[0] + 4)},${f(a[1])}Z" fill="${K.yellow}" fill-opacity="0.7" ${MUL}/>` + seg([a[0] - 4, a[1]], [b[0] - 4, b[1]], 1.5, 4) + seg([a[0] + 4, a[1]], [b[0] + 4, b[1]], 1.5, 4));
    // canopy: scalloped cone, red/white panels
    const rim = c.circ(WS.x, WS.y, 1.02, ZTOP - 14, 32), ap = P(WS.x, WS.y, ZTOP + 26);
    for (let i = 0; i < 16; i++) { if (i % 2) continue; const q0 = rim[i * 2], q1 = rim[(i * 2 + 2) % 32]; c.push(wash([ap, q0, rim[i * 2 + 1], q1], K.red, 0.72, 0.97, 1)); }
    const front = rim.filter((q) => q[1] >= ap[1] - 30);
    c.push(inkCurve(rim, true, 1.5)); for (let i = 0; i < 32; i += 4) { if (rim[i][1] > rim[0][1] - 40) c.push(seg(ap, rim[i], 1, 2, INK, 0.75)); }
    let sc = ''; for (let i = 0; i < 32; i++) { const q0 = rim[i], q1 = rim[(i + 1) % 32]; if (q0[1] < P(WS.x, WS.y, ZTOP - 14)[1] - 4) continue; sc += `M${pt(q0)}Q${f((q0[0] + q1[0]) / 2)},${f((q0[1] + q1[1]) / 2 + 6)} ${pt(q1)}`; }
    c.push(`<path d="${sc}" stroke="${INK}" stroke-width="1.2" fill="none"/>` + `<path d="M${pt(ap)}l0,-14" stroke="${INK}" stroke-width="1.4"/><path d="M${f(ap[0])},${f(ap[1] - 14)}l12,4l-12,4" fill="${K.coral}" fill-opacity="0.8" stroke="${INK}" stroke-width="1.1" ${MUL}/>`);
    void front;
  });
  seats.forEach((s, i) => { if (Math.cos(s.a) + Math.sin(s.a) >= 0) c.add(WS.x + WS.y + 0.5 + (Math.cos(s.a) + Math.sin(s.a)) * 0.2, () => seatDraw(s, i)); });

  // ---------- lemonade cart with a striped umbrella ----------
  const LC = { x: 7.2, y: 6.5 };
  c.add(LC.x + LC.y, () => {
    c.push(gHatch(LC.x + 0.1, LC.y, 0.75, 0, 0.45));
    c.push(box(LC.x - 0.55, LC.x + 0.5, LC.y - 0.3, LC.y + 0.3, 10, 34, K.yellow) + box(LC.x - 0.62, LC.x + 0.57, LC.y - 0.36, LC.y + 0.36, 34, 37, K.wood));
    for (const [x, y] of [[LC.x - 0.3, LC.y + 0.32], [LC.x + 0.3, LC.y + 0.32]]) { const p = P(x, y, 9); c.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="7" ry="9" fill="#ffffff"/>` + inkEll(p[0], p[1], 7, 9, 1.5) + `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="1.4" fill="${INK}"/>`); }
    const pb = P(LC.x + 0.1, LC.y, 37), ptp = P(LC.x + 0.1, LC.y, 92); c.push(seg(pb, ptp, 1.5, 2));
    const rim = c.circ(LC.x + 0.1, LC.y, 0.64, 84, 24), ap = P(LC.x + 0.1, LC.y, 104);
    for (let i = 0; i < 24; i += 4) c.push(wash([ap, rim[i], rim[i + 1], rim[(i + 2) % 24]], K.coral, 0.75, 0.97, 0.8));
    c.push(inkCurve(rim, true, 1.5)); for (let i = 0; i < 24; i += 2) if (rim[i][1] > ap[1]) c.push(seg(ap, rim[i], 0.9, 1, INK, 0.7));
    // jugs on the counter
    for (const dx of [-0.35, 0.1]) { const p = P(LC.x + dx, LC.y - 0.05, 37); c.push(`<path d="M${f(p[0] - 4)},${f(p[1])}l1,-11l6,0l1,11z" fill="${K.yellow}" fill-opacity="0.9" ${MUL} stroke="${INK}" stroke-width="1.1"/>`); }
  });

  // ---------- trees: scribbled crowns and zig-zag pines; a bench; lamps ----------
  const tree = (x, y, r = 22, h = 30, col = K.grassD) => c.add(x + y, () => {
    c.push(gHatch(x, y, 0.42, 0, 0.5));
    const b = P(x, y, 0), t = P(x, y, h); c.push(seg([b[0] - 2.5, b[1]], [t[0] - 2, t[1]], 1.4, 2) + seg([b[0] + 2.5, b[1]], [t[0] + 2, t[1]], 1.4, 2));
    const cx = t[0], cy = t[1] - r * 0.8, n = 11, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = r * (0.9 + R() * 0.2); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]); }
    c.push(wash(pts, col, 0.62, 0.92, 4) + wash(pts.map((p) => [p[0] + r * 0.3, p[1] + r * 0.25]), col, 0.35, 0.6, 0));
    let d = `M${pt(pts[0])}`; for (let i = 0; i < n; i++) { const p0 = pts[i], p1 = pts[(i + 1) % n], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, ox = (mx - cx) * 0.35, oy = (my - cy) * 0.35; d += `Q${f(mx + ox)},${f(my + oy)} ${pt(p1)}`; }
    c.push(`<path d="${d}" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`);
    for (let i = 0; i < 3; i++) { const ex = cx + jt(r * 0.4) + r * 0.15, ey = cy + jt(r * 0.4) + r * 0.2; c.push(`<path d="M${f(ex)},${f(ey)}q3,-4 6,0q-3,2 -6,0" stroke="${INK}" stroke-width="0.9" fill="none" stroke-opacity="0.6"/>`); }
  });
  const pine = (x, y, h = 70) => c.add(x + y, () => {
    c.push(gHatch(x, y, 0.32, 0, 0.5));
    const b = P(x, y, 0), w = h * 0.34, pts = [[b[0], b[1] - h]];
    for (let i = 1; i <= 4; i++) { const yy = b[1] - h + i * h / 4.3, ww = w * i / 4; pts.push([b[0] + ww, yy], [b[0] + ww * 0.45, yy - 2]); }
    const L = pts.slice(1).map((p) => [2 * b[0] - p[0], p[1]]).reverse(), sh = [pts[0], ...pts.slice(1), ...L];
    c.push(wash(sh, K.teal, 0.55, 0.94, 3) + wash(sh.filter((p) => p[0] >= b[0] - 1), '#2f8a7e', 0.3, 0.9, 0) + inkPoly(sh, true, 1.4, 3) + seg([b[0], b[1] - 8], [b[0], b[1] + 1], 2, 1));
  });
  tree(0.7, 3.6, 24, 26); tree(3.3, 7.6, 20, 24, '#8fc05a'); tree(9.2, 6.2, 26, 30); tree(1.7, 8.2, 18, 22, '#8fc05a');
  pine(9.0, 4.0, 74); pine(0.5, 1.2, 66); pine(8.3, 8.2, 60); pine(2.6, 0.2, 56);
  c.add(3.6 + 4.2, () => c.push(gHatch(3.6, 4.15, 0.3, 0, 0.4) + box(3.15, 4.05, 4.05, 4.25, 6, 9, K.wood) + box(3.15, 4.05, 4.02, 4.07, 9, 18, K.wood) + seg(P(3.25, 4.25, 0), P(3.25, 4.25, 6), 1.3, 1) + seg(P(3.95, 4.25, 0), P(3.95, 4.25, 6), 1.3, 1)));
  const lamp = (x, y) => c.add(x + y, () => { const b = P(x, y, 0), t = P(x, y, 56); c.push(seg(b, t, 1.5, 2) + `<path d="M${f(t[0] - 5)},${f(t[1])}l2,-9l6,0l2,9z" fill="${K.yellow}" fill-opacity="0.9" ${MUL} stroke="${INK}" stroke-width="1.2"/>` + seg([b[0] - 5, b[1]], [b[0] + 5, b[1]], 1.3, 1)); });
  lamp(4.4, 4.2); lamp(7.6, 5.7); lamp(4.4, 7.7);

  // ---------- guests on the paths ----------
  [[0.9, 4.75, 0], [2.0, 5.15, 1], [3.1, 4.7, 2], [4.4, 5.2, 3], [5.95, 4.75, 4], [7.1, 5.2, 5], [8.6, 4.8, 1], [5.2, 6.2, 2], [4.9, 7.6, 0], [5.3, 8.7, 3], [6.3, 4.05, 5], [6.2, 3.85, 0]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 0); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();

  // ---------- hand-lettered labels and arrows, notes in the margin ----------
  let notes = '';
  const lab = (txt, x, y, h, pts, seed) => { const t = hand(txt, x, y, h, INK, 1.5, 0.14, seed); notes += t.svg; if (pts) notes += arrow(pts, 1.3); return t; };
  lab('WAVE SWINGER', 112, 330, 15, [[230, 336], [300, 362], [340, 392]], 3);
  lab('LIFT HILL', 1290, 300, 15, [[1300, 306], [1262, 330], [1236, 370]], 5);
  lab('LEMONADE', 1010, 700, 15, [[1004, 690], [940, 660], [880, 628]], 7);
  lab('QUEUE', 990, 470, 12, [[1000, 476], [990, 492], [968, 506]], 9);
  lab('POND?', 236, 590, 13, [[290, 570], [380, 520], [440, 488]], 11);
  // dimension line across the main path: 2 tiles
  const d0 = P(4.52, 8.6), d1 = P(5.68, 8.6), off = [30, 15];
  notes += `<path d="M${f(d0[0] + off[0])},${f(d0[1] + off[1])}L${f(d1[0] + off[0])},${f(d1[1] + off[1])}" stroke="${INK}" stroke-width="1"/>` + seg([d0[0] + off[0] - 4, d0[1] + off[1] - 4], [d0[0] + off[0] + 4, d0[1] + off[1] + 4], 1, 0) + seg([d1[0] + off[0] - 4, d1[1] + off[1] - 4], [d1[0] + off[0] + 4, d1[1] + off[1] + 4], 1, 0);
  notes += hand('2 TILES', d1[0] + off[0] + 10, d1[1] + off[1] + 22, 11, INK, 1.2, 0.14, 13).svg;
  // loose "colour check" marker swatches and a ringed note
  const sw = [[1240, 215, K.red], [1278, 222, K.yellow], [1316, 214, K.teal], [1354, 222, K.blue], [1392, 216, K.grass]];
  sw.forEach(([x, y, col], i) => { notes += `<path d="M${x - 14},${y + 6}q8,-14 30,-12q-6,10 -28,16z" fill="${col}" fill-opacity="0.7" ${MUL}/>`; void i; });
  notes += hand('CARS: BLUE/YELLOW/TEAL?', 1238, 262, 11, INK, 1.2, 0.14, 21).svg;
  notes += `<ellipse cx="1330" cy="256" rx="104" ry="20" stroke="${K.red}" stroke-width="1.6" fill="none" transform="rotate(-3 1330 256)"/>`;
  notes += hand('V5 - PARK SKETCH', 1236, 160, 13, BLUE, 1.3, 0.14, 23).svg;

  const extraDefs = c.defs.join('') + `
    <filter id="pGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="2"/><feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.32  0 0 0 0.09 0"/></filter>
    <pattern id="pDots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="1.1" fill="#b9c4d4"/></pattern>
    <radialGradient id="pVig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#6b5a3a" stop-opacity="0.12"/></radialGradient>`;
  let bg = `<rect width="1600" height="1000" fill="#f8f4ea"/><rect width="1600" height="1000" fill="url(#pDots)" opacity="0.7"/><rect width="1600" height="1000" filter="url(#pGrain)"/><rect width="1600" height="1000" fill="url(#pVig)"/>`;
  // spiral binding down the left edge
  bg += `<rect x="0" y="0" width="34" height="1000" fill="#e9e2d2"/>`;
  for (let y = 30; y < 1000; y += 34) bg += `<circle cx="20" cy="${y}" r="5" fill="#3b3a40"/><path d="M20,${y}C-6,${y - 6} -6,${y - 20} 8,${y - 22}" stroke="#8c8f99" stroke-width="3" fill="none"/>`;
  // a coffee ring, faint
  bg += `<circle cx="1490" cy="560" r="58" fill="none" stroke="#b08654" stroke-opacity="0.18" stroke-width="7"/><circle cx="1494" cy="563" r="55" fill="none" stroke="#b08654" stroke-opacity="0.1" stroke-width="2"/>`;
  const scene = c.o.join('\n') + notes;
  let lu = ''; G.forEach((g, i) => { lu += guest(112 + i * 74, 1000 - 48, g, 2 * GK); });
  frame({
    key: 'p', letter: 'P', name: 'Sketchbook', file: 'p-sketch',
    blurb: ['A designer’s sketchbook page: pen ink that overshoots the', 'corners, marker washes laid off-register, blue-pencil', 'construction lines, hatched shadows, hand-lettered notes.'],
    pal: [K.red, K.yellow, K.teal, K.blue, K.grass, K.sand, INK], ink: INK, sub: '#5b5560', panel: '#fffdf6e6', panelInk: INK, panelR: 4, swatchR: 3,
    panelDeco: (x, y, w, h) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" fill="none" stroke="${INK}" stroke-opacity="0.25"/><rect x="${x - 14}" y="${y - 10}" width="64" height="22" fill="#efe2b8" fill-opacity="0.85" transform="rotate(-24 ${x + 18} ${y})"/><rect x="${x + w - 50}" y="${y - 10}" width="64" height="22" fill="#efe2b8" fill-opacity="0.85" transform="rotate(22 ${x + w - 18} ${y})"/>`,
    bg, scene, extraDefs, lineup: { svg: lu, w: 470 },
    note: ['Ink: 1.5 px pen, every edge overshoots 1-4 px.', 'Colour: marker, 60% multiply, off-register.', 'Shade = a second marker pass on the same face.', 'Shadows: pen hatching. Guides: blue pencil.', 'Riders sit in chair-tubs and coaster cars.'],
  });
}

// ======================================================================
// Q — Comic pop
// A comic-book panel: thick black brush ink on everything, flat bold primaries, Ben-Day dots ONLY where
// there is shadow (shaded faces, cast shadows), white glints, action lines on whatever moves, sound
// effects, a speech bubble over one guest, and the page cut into panels with white gutters.
// ======================================================================
function styleQ() {
  const S = 1.2, c = Ctx(S, 760, 214), P = c.P;
  const INK = '#111111';
  const K = { red: '#ec1c24', yellow: '#ffd51f', blue: '#1e6ff0', cyan: '#4cc9f5', green: '#29b34a', greenL: '#7bd44a', white: '#ffffff', orange: '#ff8a1c', pink: '#ff6fae', purple: '#8a4fd8', path: '#ffe9a8', grey: '#b7c3d3', navy: '#1b2a6b', skin: ['#ffd9b8', '#f3b07e', '#c98454', '#8a5532'] };
  const BD = (op = 0.5) => `fill="url(#qBD)" opacity="${op}"`;
  const fillInk = (d, col, w = 3.2) => `<path d="${d}" fill="${col}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const dots = (d, op = 0.55) => `<path d="${d}" ${BD(op)}/>`;
  const shadow = (gx, gy, r, z = 0, op = 0.75) => { const p = P(gx, gy, z); return `<ellipse cx="${f(p[0] + 6)}" cy="${f(p[1] + 3)}" rx="${f(Math.SQRT2 * 52 * S * r)}" ry="${f(Math.SQRT2 * 26 * S * r)}" ${BD(op)}/>`; };
  const glint = (x, y, l = 8) => `<path d="M${f(x)},${f(y)}l${f(l * 0.6)},${f(-l * 0.5)}" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="${f(x + l * 0.95)}" cy="${f(y - l * 0.82)}" r="1.4" fill="#fff"/>`;
  // box: light top, base left, base + Ben-Day right; all edges inked
  const box = (x0, x1, y0, y1, z0, z1, col, w = 3) => {
    const T = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], Rf = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], Lf = [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)];
    return fillInk(poly(Lf), col, w) + fillInk(poly(Rf), col, w) + dots(poly(Rf), 0.55) + fillInk(poly(T), light(col, 0.35), w);
  };
  const cyl = (gx, gy, r, z0, z1, col, top) => {
    const s = c.cylSide(gx, gy, r, z0, z1), id = c.id('qc');
    c.def(`<clipPath id="${id}"><rect x="${f(s.c0[0] + s.rx * 0.15)}" y="${f(s.c1[1] - s.ry - 400)}" width="${f(s.rx * 2)}" height="900"/></clipPath>`);
    return fillInk(s.d, col) + `<g clip-path="url(#${id})">${dots(s.d, 0.55)}</g>` + fillInk(s.top, top || light(col, 0.35));
  };
  const burst = (cx, cy, r0, r1, n, col, w = 3.5, rot = 0) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * Math.PI * 2, r = i % 2 ? r0 : r1 * (0.85 + 0.3 * ((i * 7) % 5) / 5); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8]); } return fillInk(poly(pts), col, w); };
  const sfx = (txt, x, y, size, col, rot = -8, sh = K.red) => `<g transform="rotate(${rot} ${x} ${y})" font-family="${FONT}" font-weight="900" font-style="italic" font-size="${size}" letter-spacing="1"><text x="${x + 5}" y="${y + 5}" fill="${sh}" stroke="${INK}" stroke-width="${f(size * 0.11)}" stroke-linejoin="round" paint-order="stroke">${txt}</text><text x="${x}" y="${y}" fill="${col}" stroke="${INK}" stroke-width="${f(size * 0.11)}" stroke-linejoin="round" paint-order="stroke">${txt}</text></g>`;
  const speed = (a, b, n = 4, sp = 7, w = 2.6) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; let s = ''; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * sp, t0 = (i % 2) * 0.18; s += `<path d="M${f(a[0] + dx * t0 + nx * o)},${f(a[1] + dy * t0 + ny * o)}L${f(b[0] + nx * o)},${f(b[1] + ny * o)}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`; } return s; };

  // ---------- guests: chunky comic kids and grown-ups; big eyes, inked limbs ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const u = (v) => f(v * k), X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), o = [], LW = +LIMB(k, 2.4), OL = Math.max(1.3, 1.05 * k);
    const top = seated ? -12 : -20, bot = seated ? 0 : -8, hy = top - 7.2;
    const limb = (d, col) => `<path d="${d}" stroke="${INK}" stroke-width="${f(LW + OL * 2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${col}" stroke-width="${f(LW)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (!seated) {
      o.push(`<ellipse cx="${X(1)}" cy="${Y(0.3)}" rx="${u(7.4)}" ry="${u(2.6)}" ${BD(0.8)}/>`);
      o.push(limb(`M${X(-2)},${Y(bot)}L${X(-2.6)},${Y(-1.6)}M${X(2)},${Y(bot)}L${X(3)},${Y(-1.8)}`, g.pants));
      o.push(`<ellipse cx="${X(-3.3)}" cy="${Y(-0.9)}" rx="${u(2.4)}" ry="${u(1.4)}" fill="${INK}"/><ellipse cx="${X(3.9)}" cy="${Y(-1.1)}" rx="${u(2.4)}" ry="${u(1.4)}" fill="${INK}"/>`);
      o.push(limb(`M${X(-4.6)},${Y(top + 2.5)}Q${X(-7)},${Y(top + 6)} ${X(-7)},${Y(top + 9)}`, g.shirt));
    }
    const bd = `M${X(-3.8)},${Y(top)}Q${X(-6.4)},${Y(top + 1)} ${X(-6)},${Y(bot)}L${X(6)},${Y(bot)}Q${X(6.4)},${Y(top + 1)} ${X(3.8)},${Y(top)}Z`;
    o.push(fillInk(bd, g.shirt, f(OL * 1.15)));
    if (g.stripe) o.push(`<path d="M${X(-6.1)},${Y(bot - 4)}L${X(6.1)},${Y(bot - 4)}" stroke="${g.stripe}" stroke-width="${u(2.2)}"/>`);
    o.push(`<path d="M${X(-1.6)},${Y(top + 1.6)}L${X(-1.6)},${Y(bot - 1)}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="${u(1.1)}" stroke-linecap="round"/>`);
    if (seated) o.push(limb(`M${X(-4.6)},${Y(top + 2)}L${X(-8)},${Y(top - 7)}M${X(4.6)},${Y(top + 2)}L${X(8)},${Y(top - 7)}`, g.shirt) + `<circle cx="${X(-8.2)}" cy="${Y(top - 7.8)}" r="${u(2)}" fill="${g.skin}" stroke="${INK}" stroke-width="${f(OL)}"/><circle cx="${X(8.2)}" cy="${Y(top - 7.8)}" r="${u(2)}" fill="${g.skin}" stroke="${INK}" stroke-width="${f(OL)}"/>`);
    else o.push(limb(`M${X(4.6)},${Y(top + 2.5)}Q${X(7.2)},${Y(top + 6)} ${X(7)},${Y(top + 9)}`, g.shirt) + `<circle cx="${X(7)}" cy="${Y(top + 10)}" r="${u(1.9)}" fill="${g.skin}" stroke="${INK}" stroke-width="${f(OL)}"/>`);
    if (g.balloon && !seated) o.push(`<path d="M${X(7)},${Y(top + 9)}Q${X(11)},${Y(top - 4)} ${X(9)},${Y(top - 15)}" stroke="${INK}" stroke-width="${u(0.8)}" fill="none"/>` + fillInk(ellD([+X(9), +Y(top - 21)], 5.6 * k, 6.4 * k), g.balloon, f(OL)) + glint(+X(7), +Y(top - 22), 4 * k));
    // head
    o.push(fillInk(ellD([+X(0), +Y(hy)], 6.8 * k, 6.6 * k), g.skin, f(OL * 1.15)));
    if (g.hair === 'spike') o.push(fillInk(`M${X(-6.8)},${Y(hy - 0.5)}L${X(-8)},${Y(hy - 5)}L${X(-4.5)},${Y(hy - 6)}L${X(-4)},${Y(hy - 10)}L${X(0)},${Y(hy - 7.5)}L${X(2.5)},${Y(hy - 11)}L${X(4)},${Y(hy - 7)}L${X(8)},${Y(hy - 7.5)}L${X(6.6)},${Y(hy - 2)}Q${X(1)},${Y(hy - 5)} ${X(-6.8)},${Y(hy - 0.5)}Z`, g.hairCol, f(OL)));
    else if (g.hair === 'pony') o.push(fillInk(`M${X(-6.9)},${Y(hy + 1)}Q${X(-7.5)},${Y(hy - 8.5)} ${X(0)},${Y(hy - 8)}Q${X(7.2)},${Y(hy - 7.5)} ${X(6.8)},${Y(hy - 1)}Q${X(2)},${Y(hy - 4.6)} ${X(-3)},${Y(hy - 2.5)}L${X(-4.4)},${Y(hy + 1.6)}Z`, g.hairCol, f(OL)) + fillInk(`M${X(-6)},${Y(hy - 5)}Q${X(-12)},${Y(hy - 4)} ${X(-11)},${Y(hy + 4)}Q${X(-9)},${Y(hy - 1)} ${X(-6.4)},${Y(hy - 1.5)}Z`, g.hairCol, f(OL)));
    else if (g.hair === 'cap') o.push(fillInk(`M${X(-6.8)},${Y(hy - 0.5)}Q${X(-6.8)},${Y(hy - 9.4)} ${X(0)},${Y(hy - 9.2)}Q${X(6.8)},${Y(hy - 9)} ${X(6.8)},${Y(hy - 1.5)}L${X(11)},${Y(hy - 1)}Q${X(11)},${Y(hy - 2.8)} ${X(6.4)},${Y(hy - 3.6)}Q${X(0)},${Y(hy - 4.2)} ${X(-6.8)},${Y(hy - 0.5)}Z`, g.hairCol, f(OL)));
    else o.push(fillInk(`M${X(-7)},${Y(hy + 2)}Q${X(-9)},${Y(hy - 9)} ${X(0)},${Y(hy - 8.6)}Q${X(9)},${Y(hy - 9)} ${X(7)},${Y(hy + 2)}Q${X(6)},${Y(hy - 3.5)} ${X(1)},${Y(hy - 4.2)}Q${X(-5)},${Y(hy - 4)} ${X(-7)},${Y(hy + 2)}Z`, g.hairCol, f(OL)));
    o.push(`<path d="M${X(-3.6)},${Y(hy - 6.4)}Q${X(-1)},${Y(hy - 7.6)} ${X(1.6)},${Y(hy - 7.2)}" stroke="#ffffff" stroke-width="${u(1.1)}" fill="none" stroke-linecap="round" stroke-opacity="0.85"/>`);
    // eyes and an open smile
    o.push(`<ellipse cx="${X(1.6)}" cy="${Y(hy + 0.2)}" rx="${u(1.7)}" ry="${u(2.2)}" fill="#fff" stroke="${INK}" stroke-width="${u(0.7)}"/><ellipse cx="${X(5)}" cy="${Y(hy + 0.2)}" rx="${u(1.5)}" ry="${u(2.1)}" fill="#fff" stroke="${INK}" stroke-width="${u(0.7)}"/><circle cx="${X(2.2)}" cy="${Y(hy + 0.6)}" r="${u(0.95)}" fill="${INK}"/><circle cx="${X(5.5)}" cy="${Y(hy + 0.6)}" r="${u(0.9)}" fill="${INK}"/>`);
    o.push(`<path d="M${X(1.4)},${Y(hy + 3.4)}Q${X(3.6)},${Y(hy + 6.8)} ${X(5.6)},${Y(hy + 3.2)}Z" fill="${INK}"/>`);
    return o.join('');
  }
  const G = [
    { dir: 1, shirt: K.red, pants: K.blue, skin: K.skin[0], hair: 'spike', hairCol: K.yellow },
    { dir: -1, shirt: K.yellow, pants: K.navy, skin: K.skin[2], hair: 'pony', hairCol: INK, balloon: K.red },
    { dir: 1, shirt: K.blue, pants: K.red, skin: K.skin[1], hair: 'cap', hairCol: K.green, stripe: K.white },
    { dir: -1, shirt: K.green, pants: K.yellow, skin: K.skin[3], hair: 'mop', hairCol: INK },
    { dir: 1, shirt: K.pink, pants: K.navy, skin: K.skin[0], hair: 'pony', hairCol: K.orange, stripe: K.yellow },
    { dir: -1, shirt: K.orange, pants: K.blue, skin: K.skin[1], hair: 'cap', hairCol: K.red },
  ];
  const GK = 1.12 * S;

  // ---------- ground: runs out past the panel border; back edge = an inked hedge line ----------
  const gpoly = [P(0, 0), P(18, 0), P(18, 18), P(0, 18)];
  c.push(fillInk(poly(gpoly), K.green, 4));
  // mown stripes, flat lighter green, inked only at the hedge
  for (let i = 0; i < 18; i += 2) c.push(`<path d="${poly([P(i, 0), P(i + 1, 0), P(i + 1, 18), P(i, 18)])}" fill="${K.greenL}" fill-opacity="0.35"/>`);
  let hedge = ''; for (let i = 0; i < 18; i += 0.5) { const a = P(i, -0.05), b = P(i + 0.5, -0.05); hedge += `Q${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2 - 22)} ${pt(b)}`; }
  c.push(`<path d="M${pt(P(0, -0.05))}${hedge}Z" fill="#178a3a" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`);
  hedge = ''; for (let i = 0; i < 18; i += 0.5) { const a = P(-0.05, i), b = P(-0.05, i + 0.5); hedge += `Q${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2 - 22)} ${pt(b)}`; }
  c.push(`<path d="M${pt(P(-0.05, 0))}${hedge}Z" fill="#178a3a" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`);
  // paths: cream with a thick ink kerb; dots on the shaded kerb face
  const paths = [ribbon(P, [[-0.2, 4.4], [6, 4.4], [12, 4.4], [18, 4.4]], 1.3, 0, 3), ribbon(P, [[4.5, 4.4], [4.5, 10], [4.5, 18]], 1.25, 0, 3), ribbon(P, [[2.2, 4.4], [2.2, 3.0]], 0.9, 0, 2)];
  paths.forEach((rb) => c.push(`<path d="${poly(rb.poly)}" fill="${K.path}"/>`));
  paths.forEach((rb) => c.push(`<path d="${line(rb.L)}M${line(rb.R).slice(1)}" stroke="${INK}" stroke-width="3.4" fill="none"/>`));
  for (let x = 0.4; x < 16; x += 0.9) { if (Math.abs(x - 4.5) < 0.8) continue; c.push(`<path d="M${pt(P(x, 3.9))}l7,-3.5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`); }
  for (let y = 5.6; y < 16; y += 0.9) c.push(`<path d="M${pt(P(4.2, y))}l7,3.5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`);

  // ---------- coaster: red tube rails, blue columns, a vertical loop ----------
  const trk = Track([[1.0, 2.0, 9], [3.0, 2.0, 9], [4.3, 2.0, 42], [5.4, 2.0, 120], [6.1, 2.0, 132], [6.9, 2.05, 70], [7.6, 2.2, 14], [8.4, 2.3, 16], [9.1, 2.4, 56], [9.05, 2.55, 116], [8.4, 2.65, 140], [7.8, 2.75, 112], [7.8, 2.85, 56], [8.5, 2.95, 18], [9.6, 3.0, 14], [10.4, 2.4, 24], [10.3, 1.0, 40], [9.2, 0.45, 52], [7, 0.4, 44], [4.6, 0.45, 34], [2.2, 0.55, 22], [0.6, 1.0, 12], [0.4, 1.7, 9]], 12, true);
  const tp = trk.pts;
  tp.forEach((p, i) => { if (i % 6 || p[2] < 20 || (p[0] > 7.4 && p[0] < 9.4 && p[1] > 2.2 && p[1] < 3.0 && p[2] > 60)) return; c.add(p[0] + p[1] - 0.1, () => { c.push(shadow(p[0], p[1], 0.14, 0, 0.8)); const b = P(p[0], p[1], 0), t = P(p[0], p[1], p[2] - 4); c.push(`<path d="M${pt(b)}L${pt(t)}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M${pt(b)}L${pt(t)}" stroke="${K.blue}" stroke-width="5" stroke-linecap="round"/><path d="M${f(b[0] + 1.2)},${f(b[1])}L${f(t[0] + 1.2)},${f(t[1])}" stroke="url(#qBD)" stroke-width="2.4"/>`); }); });
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.12, ny = dx / l * 0.12;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2 + (p[2] > 100 && p[0] > 7.5 ? -0.3 : 0), () => {
      const seg2 = (s) => `M${pt(P(p[0] + nx * s, p[1] + ny * s, p[2]))}L${pt(P(q[0] + nx * s, q[1] + ny * s, q[2]))}`;
      c.push(`<path d="${seg2(1)}${seg2(-1)}" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/><path d="${seg2(1)}${seg2(-1)}" stroke="${K.red}" stroke-width="3.8" stroke-linecap="round"/>`);
      if (i % 3 === 0) c.push(`<path d="M${pt(P(p[0] + nx, p[1] + ny, p[2]))}L${pt(P(p[0] - nx, p[1] - ny, p[2]))}" stroke="${INK}" stroke-width="2.4"/>`);
    });
  }
  c.add(1.0 + 2.0 + 0.9, () => c.push(box(0.9, 3.1, 2.25, 2.7, 0, 10, K.yellow) + box(0.9, 1.05, 2.25, 2.7, 10, 44, K.red) + box(2.95, 3.1, 2.25, 2.7, 10, 44, K.red) + box(0.8, 3.2, 2.15, 2.8, 44, 52, K.blue)));
  // train on the first drop, with action lines and a sound effect
  const cols = [K.yellow, K.cyan, K.pink];
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 22.0 - k * 0.62, 0.52, 0.46, 12, 3), col = cols[k];
    c.add(car.depth + 0.3, () => {
      c.push(fillInk(poly(car.top), INK, 3));
      [-0.2, 0.2].map((u) => car.seat(u, 9)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j + 3) % 6], dir: 1 }, GK * 0.88, true)); });
      car.sides.forEach((sd) => { c.push(fillInk(poly(sd.pts), col, 3)); if (sd.n[0] > sd.n[1]) c.push(dots(poly(sd.pts), 0.55)); });
      const fr = car.sides.find((s) => !s.end) || car.sides[0]; c.push(glint(fr.pts[3][0] + 6, fr.pts[3][1] + 7, 7));
    });
  });
  c.add(30, () => { const a = P(...trk.at(20.2)), b = P(...trk.at(18.9)); c.push(speed([a[0] - 4, a[1] - 22], [b[0] - 4, b[1] - 22], 5, 8, 2.6)); });

  // ---------- bumper cars: a fenced rink, sparking poles, a collision ----------
  const BC = { x0: 6.3, x1: 9.9, y0: 5.6, y1: 8.6 };
  c.add(BC.x0 + BC.y0 - 0.5, () => {
    c.push(fillInk(poly([P(BC.x0, BC.y0, 6), P(BC.x1, BC.y0, 6), P(BC.x1, BC.y1, 6), P(BC.x0, BC.y1, 6)]), K.grey, 3.5));
    for (let x = BC.x0 + 0.6; x < BC.x1; x += 0.6) c.push(`<path d="M${pt(P(x, BC.y0, 6))}L${pt(P(x, BC.y1, 6))}" stroke="#97a5b8" stroke-width="1.6"/>`);
    // back fence walls (x0 side and y0 side)
    c.push(fillInk(poly([P(BC.x0, BC.y1, 6), P(BC.x0, BC.y0, 6), P(BC.x0, BC.y0, 20), P(BC.x0, BC.y1, 20)]), K.red, 3) + fillInk(poly([P(BC.x0, BC.y0, 6), P(BC.x1, BC.y0, 6), P(BC.x1, BC.y0, 20), P(BC.x0, BC.y0, 20)]), K.red, 3));
    for (let t = 0.5; t < 3.6; t += 1) c.push(`<path d="${poly([P(BC.x0 + t, BC.y0, 7), P(BC.x0 + t + 0.5, BC.y0, 7), P(BC.x0 + t + 0.5, BC.y0, 19), P(BC.x0 + t, BC.y0, 19)])}" fill="#fff"/>`);
    // billboard on the back fence
    const s0 = P(BC.x0 + 0.9, BC.y0, 20), s1 = P(BC.x0 + 2.7, BC.y0, 20), m = [(s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2];
    c.push(`<path d="M${pt(s0)}l0,-30M${pt(s1)}l0,-30" stroke="${INK}" stroke-width="4"/>` + fillInk(poly([[s0[0], s0[1] - 22], [s1[0], s1[1] - 22], [s1[0], s1[1] - 58], [s0[0], s0[1] - 58]]), K.yellow, 3.4));
    c.push(`<text x="${f(m[0])}" y="${f(m[1] - 32)}" text-anchor="middle" font-weight="900" font-style="italic" font-size="21" fill="${K.red}" stroke="${INK}" stroke-width="1" transform="rotate(26.57 ${f(m[0])} ${f(m[1] - 40)})">BUMPERS</text>`);
  });
  const cars = [[7.0, 6.4, 0.3, K.yellow, 0], [8.0, 6.35, 2.9, K.blue, 1], [7.6, 7.6, -0.4, K.purple, 4], [9.1, 7.4, 1.9, K.orange, 2], [8.7, 8.1, 3.6, K.cyan, 5]];
  cars.forEach(([x, y, a, col, gi]) => {
    const tr = Track([[x - Math.cos(a) * 0.3, y - Math.sin(a) * 0.3, 6], [x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, 6]], 2, false), car = carGeom(P, tr, tr.tot / 2, 0.56, 0.42, 11, 3);
    c.add(x + y, () => {
      c.push(shadow(x, y, 0.32, 6, 0.8));
      const rim = hull(car.b.map((q) => P(q[0], q[1], q[2] + 2)).concat(car.b.map((q) => P(q[0] + (q[0] - x) * 0.25, q[1] + (q[1] - y) * 0.25, q[2] + 2))));
      c.push(fillInk(rp(rim, 8), INK, 2));
      const back = P(...car.seat(-0.42, -4)), pole = P(...car.seat(-0.42, -70));
      c.push(`<path d="M${pt(back)}L${pt(pole)}" stroke="${INK}" stroke-width="5"/><path d="M${pt(back)}L${pt(pole)}" stroke="${K.yellow}" stroke-width="2"/>`);
      c.push(burst(pole[0], pole[1] - 4, 4, 11, 6, K.yellow, 2.4, a));
      c.push(fillInk(rp(car.top, 4), INK, 3));
      const s = P(...car.seat(0.05, 9)); c.push(guest(s[0], s[1], { ...G[gi], dir: Math.cos(a) - Math.sin(a) >= 0 ? 1 : -1 }, GK * 0.9, true));
      car.sides.forEach((sd) => { c.push(fillInk(rp(sd.pts, 3), col, 3)); if (sd.n[0] > sd.n[1]) c.push(dots(rp(sd.pts, 3), 0.55)); });
      const fr = car.sides[0]; c.push(glint(fr.pts[3][0] + 5, fr.pts[3][1] + 6, 6));
    });
  });
  // motion arcs behind two cars, the collision burst
  c.add(BC.x1 + BC.y1, () => {
    const a = P(7.0, 6.4, 6), b = P(8.0, 6.35, 6), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 30];
    c.push(`<path d="M${f(a[0] - 54)},${f(a[1] - 10)}Q${f(a[0] - 36)},${f(a[1] + 14)} ${f(a[0] - 16)},${f(a[1] + 12)}M${f(a[0] - 52)},${f(a[1] + 4)}Q${f(a[0] - 38)},${f(a[1] + 22)} ${f(a[0] - 20)},${f(a[1] + 22)}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
    const d = P(9.1, 7.4, 6); c.push(`<path d="M${f(d[0] + 30)},${f(d[1] - 18)}q16,4 26,-6M${f(d[0] + 34)},${f(d[1] - 6)}q16,4 26,-6" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
    c.push(burst(m[0] + 8, m[1] - 40, 22, 44, 9, K.yellow, 3.4, 0.2) + sfx('BONK!', m[0] - 26, m[1] - 31, 26, K.red, -10, K.yellow));
  });
  // front fence (drawn last for the rink): low wall with a gate gap
  c.add(BC.x1 + BC.y1 + 0.2, () => {
    c.push(fillInk(poly([P(BC.x1, BC.y0, 6), P(BC.x1, BC.y1, 6), P(BC.x1, BC.y1, 20), P(BC.x1, BC.y0, 20)]), K.red, 3) + dots(poly([P(BC.x1, BC.y0, 6), P(BC.x1, BC.y1, 6), P(BC.x1, BC.y1, 20), P(BC.x1, BC.y0, 20)]), 0.5));
    c.push(fillInk(poly([P(BC.x0, BC.y1, 0), P(BC.x0 + 1.2, BC.y1, 0), P(BC.x0 + 1.2, BC.y1, 20), P(BC.x0, BC.y1, 20)]), K.red, 3) + fillInk(poly([P(BC.x0 + 2, BC.y1, 0), P(BC.x1, BC.y1, 0), P(BC.x1, BC.y1, 20), P(BC.x0 + 2, BC.y1, 20)]), K.red, 3));
    for (const t of [0.3, 0.9, 2.3, 2.9]) c.push(`<path d="${poly([P(BC.x0 + t, BC.y1, 3), P(BC.x0 + t + 0.3, BC.y1, 3), P(BC.x0 + t + 0.3, BC.y1, 17), P(BC.x0 + t, BC.y1, 17)])}" fill="#fff"/>`);
  });

  // ---------- hot dog stand with a giant hot dog on the roof ----------
  const HD = { x: 2.0, y: 6.2 };
  c.add(HD.x + HD.y, () => {
    c.push(shadow(HD.x + 0.1, HD.y, 0.9, 0, 0.8));
    c.push(box(HD.x - 0.6, HD.x + 0.6, HD.y - 0.55, HD.y + 0.55, 0, 40, K.white));
    const w0 = P(HD.x - 0.35, HD.y + 0.55, 14), w1 = P(HD.x + 0.4, HD.y + 0.55, 14), w2 = P(HD.x + 0.4, HD.y + 0.55, 34), w3 = P(HD.x - 0.35, HD.y + 0.55, 34);
    c.push(fillInk(poly([w0, w1, w2, w3]), INK, 2.6) + box(HD.x - 0.6, HD.x + 0.6, HD.y + 0.55, HD.y + 0.75, 0, 16, K.red, 2.6));
    // striped awning sloping out over the counter
    for (let i = 0; i < 6; i++) { const t0 = -0.6 + i * 0.2, t1 = t0 + 0.2; c.push(fillInk(poly([P(HD.x + t0, HD.y + 0.55, 46), P(HD.x + t1, HD.y + 0.55, 46), P(HD.x + t1, HD.y + 0.95, 36), P(HD.x + t0, HD.y + 0.95, 36)]), i % 2 ? K.white : K.red, 2.4)); }
    // roof sign: a hot dog
    const b = P(HD.x, HD.y, 58);
    c.push(`<path d="M${pt(P(HD.x, HD.y, 40))}L${f(b[0])},${f(b[1] + 6)}" stroke="${INK}" stroke-width="5"/>`);
    c.push(fillInk(`M${f(b[0] - 48)},${f(b[1] - 4)}Q${f(b[0])},${f(b[1] + 30)} ${f(b[0] + 48)},${f(b[1] - 4)}Q${f(b[0])},${f(b[1] + 10)} ${f(b[0] - 48)},${f(b[1] - 4)}Z`, '#f2b35e', 3.4));
    c.push(fillInk(`M${f(b[0] - 56)},${f(b[1] - 6)}Q${f(b[0] - 60)},${f(b[1] - 18)} ${f(b[0] - 48)},${f(b[1] - 16)}Q${f(b[0])},${f(b[1] + 4)} ${f(b[0] + 48)},${f(b[1] - 16)}Q${f(b[0] + 60)},${f(b[1] - 18)} ${f(b[0] + 56)},${f(b[1] - 6)}Q${f(b[0])},${f(b[1] + 22)} ${f(b[0] - 56)},${f(b[1] - 6)}Z`, K.red, 3.4));
    c.push(`<path d="M${f(b[0] - 38)},${f(b[1] - 4)}q8,-8 16,0q8,8 16,0q8,-8 16,0q8,8 16,0" stroke="${K.yellow}" stroke-width="3.4" fill="none" stroke-linecap="round"/>` + glint(b[0] - 40, b[1] - 10, 8));
    c.push(sfx('HOT!', b[0] - 104, b[1] - 34, 24, K.yellow, -12));
  });

  // ---------- trees, lamp posts, a bench ----------
  const tree = (x, y, r = 26, h = 26) => c.add(x + y, () => {
    c.push(shadow(x, y, 0.5, 0, 0.8));
    const b = P(x, y, 0), t = P(x, y, h);
    c.push(`<path d="M${pt(b)}L${pt(t)}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M${pt(b)}L${pt(t)}" stroke="#a5642d" stroke-width="5.5" stroke-linecap="round"/>`);
    const cx = t[0], cy = t[1] - r * 0.85, n = 9; let d = '';
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, p = [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9]; if (!i) d = `M${pt(p)}`; else { const am = (i - 0.5) / n * Math.PI * 2; d += `Q${f(cx + Math.cos(am) * r * 1.3)},${f(cy + Math.sin(am) * r * 1.17)} ${pt(p)}`; } }
    const id = c.id('qt'); c.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    c.push(fillInk(d + 'Z', K.green, 3.4) + `<g clip-path="url(#${id})"><ellipse cx="${f(cx + r * 0.55)}" cy="${f(cy + r * 0.5)}" rx="${f(r * 1.1)}" ry="${f(r * 0.85)}" ${BD(0.55)}/></g>` + `<path d="M${f(cx - r * 0.5)},${f(cy - r * 0.35)}q${f(r * 0.2)},${f(-r * 0.3)} ${f(r * 0.5)},${f(-r * 0.35)}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  });
  tree(0.6, 3.3, 26, 24); tree(11.2, 3.4, 28, 26); tree(3.4, 8.6, 26, 24); tree(0.4, 8.2, 30, 28); tree(10.6, 5.6, 24, 22); tree(5.8, 9.4, 22, 22); tree(12.6, 1.4, 26, 24);
  const lamp = (x, y) => c.add(x + y, () => { const b = P(x, y, 0), t = P(x, y, 62); c.push(`<path d="M${pt(b)}L${pt(t)}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M${pt(b)}L${pt(t)}" stroke="${K.navy}" stroke-width="2.6"/>` + fillInk(ellD([t[0], t[1] - 7], 7, 8), K.yellow, 3) + glint(t[0] - 4, t[1] - 7, 4)); });
  lamp(3.6, 3.6); lamp(6.2, 5.2); lamp(3.6, 6.4); lamp(9.4, 5.2);
  c.add(7.8 + 3.55, () => c.push(shadow(7.8, 3.55, 0.35, 0, 0.7) + box(7.3, 8.3, 3.45, 3.65, 6, 10, K.orange, 2.6) + box(7.3, 8.3, 3.42, 3.48, 10, 20, K.orange, 2.6) + `<path d="M${pt(P(7.4, 3.65, 0))}l0,-6M${pt(P(8.2, 3.65, 0))}l0,-6" stroke="${INK}" stroke-width="3"/>`));

  // ---------- guests (one of them gets the speech bubble) ----------
  const crowd = [[0.6, 4.6, 0], [1.6, 4.15, 1], [2.25, 3.4, 4], [3.0, 4.7, 2], [5.6, 4.2, 3], [6.8, 4.75, 4], [8.3, 4.2, 5], [9.6, 4.65, 0], [10.9, 4.3, 2], [4.75, 5.9, 5], [4.25, 7.2, 1], [4.7, 8.5, 3], [4.3, 9.8, 0], [12.0, 4.6, 1]];
  crowd.forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 0); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();
  // speech bubble over the guest at (5.6, 4.2)
  const sp = P(5.6, 4.2, 0), bx = sp[0] - 150, by = sp[1] - 128;
  let bubble = fillInk(`M${f(bx)},${f(by)}C${f(bx)},${f(by - 46)} ${f(bx + 190)},${f(by - 46)} ${f(bx + 190)},${f(by)}C${f(bx + 190)},${f(by + 34)} ${f(bx + 140)},${f(by + 40)} ${f(bx + 128)},${f(by + 38)}L${f(sp[0] - 4)},${f(sp[1] - 58)}L${f(bx + 104)},${f(by + 40)}C${f(bx + 40)},${f(by + 42)} ${f(bx)},${f(by + 32)} ${f(bx)},${f(by)}Z`, '#ffffff', 3.6);
  bubble += `<text x="${f(bx + 95)}" y="${f(by - 4)}" text-anchor="middle" font-weight="900" font-size="21" fill="${INK}">BEST DAY</text><text x="${f(bx + 95)}" y="${f(by + 20)}" text-anchor="middle" font-weight="900" font-size="21" fill="${K.red}">EVER!!</text>`;
  const trackSfx = P(...trk.at(21.0));
  const over = bubble + sfx('WHOOSH!', trackSfx[0] - 40, trackSfx[1] - 92, 40, K.yellow, -14);

  const extraDefs = c.defs.join('') + `
    <pattern id="qBD" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3.5" cy="3.5" r="2.15" fill="#14205a"/></pattern>
    <clipPath id="qPanel"><rect x="20" y="20" width="1560" height="960"/></clipPath>`;
  // page: white gutters, one big panel with a thick border, flat cyan sky with inked clouds
  let bg = `<rect width="1600" height="1000" fill="#fbfaf3"/><rect x="20" y="20" width="1560" height="960" fill="${K.cyan}"/>`;
  const cloud = (x, y, s) => fillInk(`M${x},${y}c${-30 * s},0 ${-34 * s},${-34 * s} ${-6 * s},${-36 * s}c${4 * s},${-26 * s} ${44 * s},${-30 * s} ${54 * s},${-8 * s}c${18 * s},${-18 * s} ${54 * s},${-6 * s} ${44 * s},${18 * s}c${24 * s},${4 * s} ${20 * s},${26 * s} ${-4 * s},${26 * s}Z`, '#ffffff', 3.4);
  bg += cloud(1180, 300, 1.1) + cloud(330, 330, 0.9) + cloud(1480, 520, 0.8);
  const scene = `<g clip-path="url(#qPanel)">${c.o.join('\n')}${over}</g><rect x="20" y="20" width="1560" height="960" fill="none" stroke="${INK}" stroke-width="8"/>`;
  // caption box behind the title, palette box
  const head = `<path d="M36,36L640,36L630,214L36,214Z" fill="${K.yellow}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><rect x="1182" y="44" width="350" height="88" fill="#ffffff" stroke="${INK}" stroke-width="4"/>`;
  let lu = ''; G.forEach((g, i) => { lu += guest(112 + i * 74, 1000 - 50, g, 2 * GK); });
  frame({
    key: 'q', letter: 'Q', name: 'Comic pop', file: 'q-comic',
    blurb: ['A comic panel: thick black brush ink, flat primaries, Ben-Day', 'dots only in the shadows, action lines on moving rides,', 'sound effects, a speech bubble, white page gutters.'],
    pal: [K.red, K.yellow, K.blue, K.cyan, K.green, K.path, INK], ink: INK, sub: '#1b1b1b', panel: '#ffffff', panelInk: INK, panelR: 0, swatchR: 0, swatchExtra: ` stroke="${INK}" stroke-width="3"`,
    panelDeco: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="5"/><rect x="${x}" y="${y}" width="${w}" height="44" fill="${K.yellow}" stroke="${INK}" stroke-width="5"/>`,
    bg, scene: scene + head, extraDefs, lineup: { svg: lu, w: 470 },
    note: ['Ink: 3-4 px black on every edge, 7 px on rails.', 'Fill: flat primaries; top faces 35% lighter.', 'Shadow = Ben-Day dots, never a darker tint.', 'Motion: action lines + sound effects on rides.', 'Riders sit in the coaster and bumper cars.'],
  });
}

// ======================================================================
// R — Low-poly crystal
// A faceted terrain chunk: every surface is flat-shaded triangles (one colour per facet from its normal
// against a cool morning light from the upper left), gem-like trees and rocks, a faceted river that falls
// off the front cliff, a polygon Ferris wheel with hex gondolas, a crystal kiosk. Pale, clean sky.
// ======================================================================
function styleR() {
  const S = 1.12, c = Ctx(S, 790, 206), P = c.P, R = rng(77);
  const K = { grass: '#7cc79a', grass2: '#94d3a2', hill: '#a9dcb0', path: '#ece6da', water: '#69c6e6', rock: '#9fb0c4', soil: '#b9a48f', coral: '#ff7f86', mint: '#5fd4c0', lav: '#a99be8', ice: '#e4f2fb', gold: '#ffc95c', pine: '#3f9a86', white: '#fbfdff', navy: '#33415e', skin: ['#f4d1b8', '#e3a983', '#b97d58', '#7f533a'] };
  const W = 40, nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((t) => t / l); };
  const VIEW = nrm([40, 40, 52]), LV = nrm([-0.62, 0.5, 0.62]);
  const norm3 = (a, b, d) => { const u = [(b[0] - a[0]) * W, (b[1] - a[1]) * W, b[2] - a[2]], v = [(d[0] - a[0]) * W, (d[1] - a[1]) * W, d[2] - a[2]]; return nrm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // one tone per facet: dark side cools toward slate blue, lit side lifts toward white
  const tone = (col, n) => { const d = Math.max(0, dot(n, LV)), b = 0.18 + 0.82 * d; return b < 0.6 ? mix(mix(shade(col, 0.6), '#4d6a9a', 0.18), col, (b - 0.18) / 0.42) : mix(col, light(col, 0.5), (b - 0.6) / 0.4); };
  const fpath = (pts3, fill) => `<path d="${poly(pts3.map((q) => P(...q)))}" fill="${fill}" stroke="${fill}" stroke-width="0.7" stroke-linejoin="round"/>`;
  // a facet of a convex solid centred at ctr: outward normal, drawn only if it faces the camera
  const facet = (pts3, col, ctr) => { let n = norm3(pts3[0], pts3[1], pts3[2]); const cc = [pts3.reduce((s, q) => s + q[0], 0) / pts3.length, pts3.reduce((s, q) => s + q[1], 0) / pts3.length, pts3.reduce((s, q) => s + q[2], 0) / pts3.length]; if (dot(n, [(cc[0] - ctr[0]) * W, (cc[1] - ctr[1]) * W, cc[2] - ctr[2]]) < 0) n = n.map((t) => -t); return dot(n, VIEW) > 0.001 ? fpath(pts3, tone(col, n)) : ''; };
  const ring = (cx, cy, r, n, z, rot = 0, jit = 0) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2, rr = r * (1 + (jit ? (R() - 0.5) * jit : 0)); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a), z]; });
  const prism = (cx, cy, r, n, z0, z1, col, rot = 0, topCol = null, r1 = null) => { const b = ring(cx, cy, r, n, z0, rot), t = ring(cx, cy, r1 ?? r, n, z1, rot), ctr = [cx, cy, (z0 + z1) / 2]; let s = ''; for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += facet([b[i], b[j], t[j], t[i]], col, ctr); } if ((r1 ?? r) > 0) s += fpath(t, tone(topCol || col, [0, 0, 1])); return s; };
  const pyramid = (base, apex, col, ctr) => base.map((q, i) => facet([q, base[(i + 1) % base.length], apex], col, ctr)).join('');
  const gem = (cx, cy, r, n, zb, zm, zt, col, jit = 0.25, rot = R() * 6) => { const m = ring(cx, cy, r, n, zm, rot, jit).map((q) => [q[0], q[1], q[2] + (R() - 0.5) * (zt - zb) * 0.12]), ctr = [cx, cy, zm]; return pyramid(m, [cx, cy, zb], col, ctr) + pyramid(m, [cx + (R() - 0.5) * r * 0.3, cy + (R() - 0.5) * r * 0.3, zt], col, ctr); };
  const box = (x0, x1, y0, y1, z0, z1, col) => { const ctr = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]; const v = (x, y, z) => [x, y, z]; return facet([v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)], col, ctr) + facet([v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)], col, ctr) + fpath([v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], tone(col, [0, 0, 1])); };
  // flat, crisp, cool cast shadow: the footprint pushed away from the light
  const castShadow = (pts2, h) => { const k = h / 120; return `<path d="${poly(pts2.map(([x, y]) => P(x + 0.55 * k, y - 0.35 * k, 0)).concat(pts2.slice().reverse().map(([x, y]) => P(x, y, 0))))}" fill="#3d5a8a" fill-opacity="0.2"/>`; };
  const footShadow = (cx, cy, r, h, n = 6) => { const fp = ring(cx, cy, r, n, 0).map((q) => [q[0], q[1]]); const k = h / 120; return `<path d="${poly(hull(fp.map(([x, y]) => P(x, y, 0)).concat(fp.map(([x, y]) => P(x + 0.55 * k, y - 0.35 * k, 0)))))}" fill="#3d5a8a" fill-opacity="0.2"/>`; };

  // ---------- guests: two-tone faceted bodies, hex heads ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const u = (v) => f(v * k), X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), o = [], LW = +LIMB(k, 2.4);
    const top = seated ? -12 : -20, bot = seated ? 0 : -8, hy = top - 6.4, D = g.dir;
    const q = (pts, col) => `<path d="M${pts.map(([a, b]) => `${X(a)},${Y(b)}`).join('L')}Z" fill="${col}"/>`;
    const lit = (col) => light(col, 0.22), drk = (col) => mix(shade(col, 0.72), '#4d6a9a', 0.15);
    const legW = LW / k / 2;
    if (!seated) {
      o.push(`<path d="M${X(-6)},${Y(0.4)}L${X(2)},${Y(-1.6)}L${X(9)},${Y(-0.4)}L${X(1)},${Y(1.6)}Z" fill="#3d5a8a" fill-opacity="0.22"/>`);
      o.push(q([[-2 - legW, bot], [-2 + legW, bot], [-2 + legW, -0.6], [-2 - legW, -0.6]], D > 0 ? lit(g.pants) : drk(g.pants)));
      o.push(q([[2 - legW, bot], [2 + legW, bot], [2.6 + legW, -0.9], [2.6 - legW, -0.9]], D > 0 ? drk(g.pants) : lit(g.pants)));
      o.push(q([[-2 - legW - 0.6, -1.2], [-2 + legW + 1, -1.2], [-2 + legW + 1, 0], [-2 - legW - 0.6, 0]], g.shoe || K.navy) + q([[2.6 - legW - 0.4, -1.5], [2.6 + legW + 1.2, -1.5], [2.6 + legW + 1.2, -0.3], [2.6 - legW - 0.4, -0.3]], g.shoe || K.navy));
      o.push(`<path d="M${X(-4.6)},${Y(top + 2)}L${X(-6.6)},${Y(top + 9)}" stroke="${drk(g.shirt)}" stroke-width="${f(LW)}" stroke-linecap="square"/>`);
    }
    // body: two facets split down the middle, a shoulder facet catching the light
    o.push(q([[-4, top], [0.4, top - 0.4], [0.6, bot], [-5.6, bot]], lit(g.shirt)) + q([[0.4, top - 0.4], [4, top], [5.6, bot], [0.6, bot]], drk(g.shirt)) + q([[-4, top], [4, top], [0.4, top + 3.2]], light(g.shirt, 0.42)));
    if (g.belt) o.push(q([[-5.4, bot - 2.4], [5.4, bot - 2.4], [5.6, bot], [-5.6, bot]], g.belt));
    if (seated) o.push(`<path d="M${X(-4)},${Y(top + 1.5)}L${X(-7.4)},${Y(top - 6.5)}M${X(4)},${Y(top + 1.5)}L${X(7.4)},${Y(top - 6.5)}" stroke="${g.shirt}" stroke-width="${f(LW)}" stroke-linecap="square"/>` + q([[-8.6, top - 9], [-6.2, top - 9], [-6.2, top - 6.6], [-8.6, top - 6.6]], g.skin) + q([[6.2, top - 9], [8.6, top - 9], [8.6, top - 6.6], [6.2, top - 6.6]], g.skin));
    else o.push(`<path d="M${X(4.6)},${Y(top + 2)}L${X(6.4)},${Y(top + 9)}" stroke="${lit(g.shirt)}" stroke-width="${f(LW)}" stroke-linecap="square"/>` + q([[5.4, top + 9], [7.6, top + 9], [7.6, top + 11.2], [5.4, top + 11.2]], g.skin));
    if (g.balloon && !seated) o.push(`<path d="M${X(6.5)},${Y(top + 9)}L${X(9)},${Y(top - 12)}" stroke="${K.navy}" stroke-width="${u(0.6)}"/>` + q([[9, top - 26], [13.4, top - 20], [9, top - 12], [4.6, top - 20]], g.balloon) + q([[9, top - 26], [13.4, top - 20], [9, top - 19]], light(g.balloon, 0.4)));
    // head: a hexagon in three facets
    const hx = [[0, hy - 6.2], [5.2, hy - 3.1], [5.2, hy + 3.1], [0, hy + 6.2], [-5.2, hy + 3.1], [-5.2, hy - 3.1]], hc = [0.6, hy - 0.3];
    o.push(q([hx[5], hx[0], hc, hx[4]], light(g.skin, 0.16)) + q([hx[0], hx[1], hx[2], hc], g.skin) + q([hc, hx[2], hx[3], hx[4]], shade(g.skin, 0.86)));
    const hairCap = [[-5.6, hy + 1.5], [-5.6, hy - 3.4], [0, hy - 6.9], [5.6, hy - 3.4], [5.6, hy - 1.4], [1, hy - 3.6]];
    if (g.hair === 'cap') o.push(q([[-5.6, hy - 1.6], [-4.6, hy - 5.6], [0, hy - 7.2], [4.8, hy - 5.4], [5.6, hy - 1.8]], g.hairCol) + q([[5.6, hy - 1.8], [10, hy - 1.2], [5.6, hy - 0.2]], drk(g.hairCol)));
    else if (g.hair === 'long') o.push(q([[-6, hy + 5.5], ...hairCap.slice(1, 4), [5.6, hy - 1], [1, hy - 3.6], [-3, hy - 1], [-3.6, hy + 5.5]], g.hairCol) + q([[-6, hy + 5.5], [-3.6, hy + 5.5], [-3, hy - 1]], drk(g.hairCol)));
    else o.push(q(hairCap, g.hairCol) + q([[0, hy - 6.9], [5.6, hy - 3.4], [5.6, hy - 1.4], [1, hy - 3.6]], drk(g.hairCol)));
    o.push(q([[2.4, hy - 0.4], [3.4, hy - 0.4], [3.4, hy + 1.2], [2.4, hy + 1.2]], K.navy));
    return o.join('');
  }
  const G = [
    { dir: 1, shirt: K.coral, pants: K.navy, skin: K.skin[0], hair: 'short', hairCol: '#6b4a3a' },
    { dir: -1, shirt: K.mint, pants: '#5b6a8f', skin: K.skin[2], hair: 'long', hairCol: '#2e2a3a', balloon: K.gold },
    { dir: 1, shirt: K.gold, pants: '#4b7fb8', skin: K.skin[1], hair: 'cap', hairCol: K.lav },
    { dir: -1, shirt: K.lav, pants: '#e9e4f5', skin: K.skin[3], hair: 'short', hairCol: '#1f1c26', belt: K.coral },
    { dir: 1, shirt: '#5aa9f0', pants: K.coral, skin: K.skin[0], hair: 'long', hairCol: '#e0a24a' },
    { dir: -1, shirt: K.white, pants: K.mint, skin: K.skin[1], hair: 'cap', hairCol: K.coral, belt: '#5aa9f0' },
  ];
  const GK = 1.12 * S;

  // ---------- terrain: a triangulated heightfield chunk with a river, paths on the grid, faceted cliffs ----------
  const BX = 11, BY = 9, st = 0.5, NX = BX / st, NY = BY / st;
  const riverC = [[5.2, -0.2], [5.6, 1.4], [5.0, 3.0], [5.4, 4.5], [6.6, 6.0], [7.1, 7.6], [6.9, 9.3]];
  const riverS = spline3(riverC.map((q) => [q[0], q[1], 0]), 8, false);
  const dRiver = (x, y) => Math.min(...riverS.map((q) => Math.hypot(q[0] - x, q[1] - y)));
  const onPath = (x, y) => (y >= 4 && y <= 5) || (x >= 3 && x <= 4 && y >= 4) || (x >= 2.5 && x <= 3.5 && y >= 3 && y <= 4) || (x >= 8 && x <= 9 && y >= 3 && y <= 4);
  const bump = (x, y, cx, cy, r) => { const d = Math.hypot(x - cx, y - cy) / r; return d >= 1 ? 0 : Math.pow(1 - d * d, 1.6); };
  const H = (x, y) => 78 * bump(x, y, 0.2, 0.3, 2.6) + 46 * bump(x, y, 10.6, 8.4, 2.2) + 30 * bump(x, y, 0.3, 8.6, 1.8);
  const V = [];
  for (let j = 0; j <= NY; j++) { V.push([]); for (let i = 0; i <= NX; i++) {
    let x = i * st, y = j * st; const edge = i === 0 || j === 0 || i === NX || j === NY, dr = dRiver(x, y), nearPath = onPath(x, y) || onPath(x + 0.25, y + 0.25) || onPath(x - 0.25, y - 0.25) || onPath(x + 0.25, y - 0.25) || onPath(x - 0.25, y + 0.25);
    let z = H(x, y) + (nearPath ? (R() - 0.5) * 1.2 : (R() - 0.5) * 5);
    if (dr < 0.42) z = -7; else if (dr < 0.75) z = Math.min(z, -1.5 + (R() - 0.5) * 2);
    if (!edge && !nearPath && dr > 0.75) { x += (R() - 0.5) * 0.16; y += (R() - 0.5) * 0.16; }
    V[j].push([x, y, z]);
  } }
  let terr = '';
  const triCol = (a, b, d) => { const cx = (a[0] + b[0] + d[0]) / 3, cy = (a[1] + b[1] + d[1]) / 3, cz = (a[2] + b[2] + d[2]) / 3; if (dRiver(cx, cy) < 0.5) return 'w'; if (onPath(cx, cy)) return 'p'; return cz > 26 ? 'h' : 'g'; };
  const terrTri = (a, b, d) => { const m = triCol(a, b, d); let n = norm3(a, b, d); if (n[2] < 0) n = n.map((t) => -t); let col = m === 'w' ? K.water : m === 'p' ? K.path : m === 'h' ? K.hill : (R() < 0.5 ? K.grass : K.grass2); if (m === 'w') { n = nrm([n[0] + (R() - 0.5) * 0.5, n[1] + (R() - 0.5) * 0.5, n[2]]); } if (m === 'g' && R() < 0.06) col = '#b5df8f'; return fpath([a, b, d], tone(col, n)); };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = V[j][i], b = V[j][i + 1], d = V[j + 1][i + 1], e = V[j + 1][i];
    if ((i + j) % 2) { terr += terrTri(a, b, d) + terrTri(a, d, e); } else { terr += terrTri(a, b, e) + terrTri(b, d, e); }
  }
  // cliffs: the two camera-facing sides, three rows of jittered points down to a ragged base
  const cliff = (edgePts, outward) => {
    let s = ''; const rows = [edgePts];
    [[-20, 0.08], [-40, 0.14], [-60, 0.2]].forEach(([dz, jit], r) => rows.push(edgePts.map((q, i) => [q[0] + outward[0] * (0.06 + r * 0.04) * (i % 2 ? 1 : 0.4), q[1] + outward[1] * (0.06 + r * 0.04) * (i % 2 ? 1 : 0.4), Math.min(q[2], 0) + dz + (R() - 0.5) * 18 * (r + 1) * 0.5 - (r === 2 ? R() * 18 : 0)])));
    for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < edgePts.length - 1; i++) {
      const a = rows[r][i], b = rows[r][i + 1], d = rows[r + 1][i + 1], e = rows[r + 1][i];
      const isW = Math.abs(a[0] - 6.95) < 0.55 && outward[1] > 0 && r < 3;
      const col = isW ? K.water : r === 0 ? K.soil : r === 1 ? K.rock : mix(K.rock, '#7f92ad', 0.4);
      for (const t of [[a, b, d], [a, d, e]]) { let n = norm3(...t); if (dot(n, [outward[0], outward[1], 0]) < 0) n = n.map((v) => -v); s += fpath(t, isW ? mix(tone(col, n), '#ffffff', R() * 0.35) : tone(col, n)); }
    }
    return s;
  };
  const front = V[NY].map((q) => q.slice()), right = V.map((row) => row[NX].slice());
  // ground mist below the chunk
  c.push(`<ellipse cx="${f(P(BX / 2, BY / 2)[0] + 20)}" cy="${f(P(BX / 2, BY / 2)[1] + 150)}" rx="640" ry="120" fill="#c3d8ea" fill-opacity="0.55" filter="url(#rBlur)"/>`);
  c.push(cliff(front, [0, 1]) + cliff(right, [1, 0]) + terr);
  // foam where the river leaves the cliff
  const wf = P(6.95, 9, -7); c.push(`<path d="M${f(wf[0] - 24)},${f(wf[1] + 70)}l12,-8l10,6l12,-10l12,8l10,-4l-4,14l-46,4z" fill="#ffffff" fill-opacity="0.9"/>`);

  // ---------- coaster: angular track (straight facets), white square posts, coral cars ----------
  const trk = Track([[7.3, 3.5, 10], [9.6, 3.5, 10], [10.4, 3.2, 20], [10.6, 2.2, 70], [10.3, 1.0, 112], [9.4, 0.5, 116], [8.4, 0.7, 50], [7.7, 1.3, 16], [7.0, 2.1, 42], [7.6, 2.6, 60], [8.6, 2.3, 44], [9.0, 1.6, 28], [8.4, 1.2, 22], [6.9, 1.0, 34], [6.3, 1.8, 26], [6.4, 2.9, 14]], 4, true);
  const tp = trk.pts;
  tp.forEach((p, i) => { if (i % 2 || p[2] < 18) return; c.add(p[0] + p[1] - 0.12, () => c.push(footShadow(p[0], p[1], 0.07, p[2], 4) + prism(p[0], p[1], 0.07, 4, 0, p[2] - 5, K.white, Math.PI / 4))); });
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.15, ny = dx / l * 0.15;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2, () => {
      const a = [p[0] + nx, p[1] + ny, p[2]], b = [q[0] + nx, q[1] + ny, q[2]], d = [q[0] - nx, q[1] - ny, q[2]], e = [p[0] - nx, p[1] - ny, p[2]], dn = (v) => [v[0], v[1], v[2] - 6];
      const ctr = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 - 3];
      c.push(facet([a, b, dn(b), dn(a)], K.coral, ctr) + facet([e, d, dn(d), dn(e)], K.coral, ctr) + facet([dn(a), dn(b), dn(d), dn(e)], K.coral, ctr));
      let n = norm3(a, b, d); if (n[2] < 0) n = n.map((t) => -t); c.push(fpath([a, b, d, e], tone(K.ice, n)));
      c.push(`<path d="M${pt(P(...a))}L${pt(P(...b))}M${pt(P(...e))}L${pt(P(...d))}" stroke="${tone(K.coral, [0, 0, 1])}" stroke-width="2"/>`);
    });
  }
  c.add(8.45 + 3.85 + 0.4, () => c.push(box(7.3, 9.6, 3.72, 4.05, 0, 10, K.lav) + prism(7.45, 3.95, 0.07, 4, 10, 36, K.white, Math.PI / 4) + prism(9.45, 3.95, 0.07, 4, 10, 36, K.white, Math.PI / 4) + box(7.3, 9.6, 3.72, 4.1, 36, 40, K.mint)));
  const carCols = [K.gold, K.mint, K.lav];
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 13.6 - k * 0.58, 0.5, 0.44, 12, 2), col = carCols[k];
    c.add(car.depth + 0.25, () => {
      c.push(`<path d="${poly(car.top)}" fill="${mix(shade(col, 0.45), '#2a3550', 0.3)}"/>`);
      [-0.2, 0.2].map((u) => car.seat(u, 9)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j + 1) % 6], dir: 1 }, GK * 0.88, true)); });
      const ctr = [car.mid[0], car.mid[1], car.mid[2] + 8];
      car.sides.forEach((sd) => { const i = car.sides.indexOf(sd); const b3 = car.b, t3 = car.t; void i; });
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; c.push(facet([car.b[i], car.b[j], car.t[j], car.t[i]], col, ctr)); }
      // a faceted nose wedge on the front car
      if (k === 0) { const f0 = car.t[1], f1 = car.t[2], tip = [car.B[0] + car.dx * 0.12, car.B[1] + car.dy * 0.12, car.B[2] + 6]; c.push(facet([f0, f1, tip], col, ctr) + facet([car.b[1], car.b[2], tip], col, ctr)); }
    });
  });

  // ---------- Ferris wheel: polygon rim, spokes, hex gondolas ----------
  const FW = { x: 3.1, y: 2.0, z: 104, rt: 1.3, rz: 78, n: 12 };
  const rimPt = (i, dx = 0) => { const a = i / FW.n * Math.PI * 2 + 0.13; return [FW.x + dx, FW.y + FW.rt * Math.cos(a), FW.z + FW.rz * Math.sin(a)]; };
  const legs = (dx) => { let s = ''; for (const sy of [-1, 1]) { const b = [FW.x + dx * 2.8, FW.y + sy * 0.9, 0], t = [FW.x + dx, FW.y, FW.z]; const bP = P(...b), tP = P(...t); s += `<path d="M${pt(bP)}L${pt(tP)}" stroke="${dx < 0 ? mix(K.white, '#8ea2c2', 0.45) : K.white}" stroke-width="7" stroke-linecap="square"/><path d="M${f(bP[0] + 2)},${f(bP[1])}L${f(tP[0] + 2)},${f(tP[1])}" stroke="${mix(K.white, '#8ea2c2', 0.6)}" stroke-width="2.5"/>`; } return s; };
  const rimLine = (dx, col, w) => `<path d="${poly(Array.from({ length: FW.n }, (_, i) => P(...rimPt(i, dx))))}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linejoin="miter"/>`;
  c.add(FW.x + FW.y - 2, () => { c.push(castShadow([[FW.x - 0.2, FW.y - 1.4], [FW.x + 0.2, FW.y - 1.4], [FW.x + 0.2, FW.y + 1.4], [FW.x - 0.2, FW.y + 1.4]], 150)); c.push(legs(-0.22) + rimLine(-0.16, mix(K.lav, '#5b6a9a', 0.35), 5)); for (let i = 0; i < FW.n; i++) c.push(`<path d="M${pt(P(FW.x - 0.16, FW.y, FW.z))}L${pt(P(...rimPt(i, -0.16)))}" stroke="${mix(K.lav, '#5b6a9a', 0.3)}" stroke-width="2.2"/>`); });
  const gond = (i) => { const r = rimPt(i), cx = r[0], cy = r[1], z1 = r[2] - 30, z0 = z1 - 14;
    c.add(FW.x + cy + 0.02 + (i / 100), () => {
      const hang = P(cx, cy, r[2]);
      const b = ring(cx, cy, 0.2, 6, z0, Math.PI / 6), t = ring(cx, cy, 0.24, 6, z1, Math.PI / 6), ctr = [cx, cy, (z0 + z1) / 2];
      c.push(`<path d="M${pt(hang)}L${pt(P(cx, cy, z1 + 18))}" stroke="${K.navy}" stroke-width="2"/>` + `<path d="${poly(t.map((q) => P(...q)))}" fill="${mix(shade(K.ice, 0.5), '#2a3550', 0.3)}"/>`);
      const s = P(cx, cy, z1 - 9); c.push(guest(s[0] - 4, s[1] - 1, { ...G[i % 6], dir: 1 }, GK * 0.78, true) + guest(s[0] + 5, s[1] + 2, { ...G[(i + 3) % 6], dir: -1 }, GK * 0.78, true));
      for (let k = 0; k < 6; k++) { const j = (k + 1) % 6; c.push(facet([b[k], b[j], t[j], t[k]], i % 3 === 0 ? K.coral : i % 3 === 1 ? K.mint : K.gold, ctr)); }
      // a crystal canopy over each gondola
      c.push(pyramid(ring(cx, cy, 0.24, 6, z1 + 16, Math.PI / 6), [cx, cy, z1 + 26], K.ice, [cx, cy, z1 + 18]));
    }); };
  for (let i = 0; i < FW.n; i++) gond(i);
  c.add(FW.x + FW.y + 2.2, () => { c.push(rimLine(0.16, K.lav, 5)); for (let i = 0; i < FW.n; i++) c.push(`<path d="M${pt(P(FW.x + 0.16, FW.y, FW.z))}L${pt(P(...rimPt(i, 0.16)))}" stroke="${light(K.lav, 0.2)}" stroke-width="2.2"/>`); c.push(gem(FW.x + 0.2, FW.y, 0.16, 6, FW.z - 12, FW.z, FW.z + 12, K.gold, 0.1) + legs(0.22)); });
  c.add(FW.x + FW.y + 0.5, () => c.push(box(FW.x + 0.5, FW.x + 1.2, FW.y - 0.4, FW.y + 0.4, 0, 8, K.lav)));

  // ---------- crystal kiosk: hex body, gem roof, an ice-cream cone sign ----------
  const KS = { x: 1.8, y: 6.3 };
  c.add(KS.x + KS.y, () => {
    c.push(footShadow(KS.x, KS.y, 0.6, 90));
    c.push(prism(KS.x, KS.y, 0.55, 6, 0, 30, K.ice, 0, K.ice));
    // serving window on the camera-facing faces
    const w = ring(KS.x, KS.y, 0.555, 6, 0, 0); const wa = w[0], wb = w[1];
    c.push(fpath([[wa[0], wa[1], 9], [wb[0], wb[1], 9], [wb[0], wb[1], 24], [wa[0], wa[1], 24]], '#3a4f74'));
    c.push(fpath([[w[1][0], w[1][1], 9], [w[2][0], w[2][1], 9], [w[2][0], w[2][1], 24], [w[1][0], w[1][1], 24]], '#2c3d5d'));
    c.push(box(KS.x - 0.1, KS.x + 0.75, KS.y + 0.1, KS.y + 0.72, 0, 11, K.mint));
    c.push(prism(KS.x, KS.y, 0.8, 6, 30, 34, K.lav) + pyramid(ring(KS.x, KS.y, 0.8, 6, 34, 0), [KS.x, KS.y, 84], K.lav, [KS.x, KS.y, 46]));
    const cb = [KS.x, KS.y, 84]; c.push(pyramid(ring(KS.x, KS.y, 0.2, 5, 106, 0.4), cb, K.gold, [KS.x, KS.y, 100]) + fpath(ring(KS.x, KS.y, 0.2, 5, 106, 0.4), tone(K.gold, [0, 0, 1])) + gem(KS.x, KS.y, 0.24, 7, 102, 112, 128, K.coral, 0.2));
  });

  // ---------- bridge over the river ----------
  c.add(5.4 + 4.5 + 0.2, () => { c.push(box(4.4, 6.4, 4.05, 4.95, 2, 7, '#d9b892')); for (let x = 4.5; x < 6.4; x += 0.35) c.push(`<path d="M${pt(P(x, 4.05, 7))}L${pt(P(x, 4.95, 7))}" stroke="#b8946c" stroke-width="1.2"/>`); c.push(box(4.4, 6.4, 4.88, 4.98, 7, 14, '#d9b892') + prism(4.45, 4.93, 0.06, 4, 7, 20, K.white, Math.PI / 4) + prism(6.35, 4.93, 0.06, 4, 7, 20, K.white, Math.PI / 4)); });
  c.add(5.4 + 4.0 - 0.6, () => c.push(box(4.4, 6.4, 4.02, 4.12, 7, 14, '#d9b892')));

  // ---------- trees and rocks: gems ----------
  const pine = (x, y, h = 70, col = K.pine) => c.add(x + y, () => { c.push(footShadow(x, y, 0.3, h * 1.2) + prism(x, y, 0.06, 5, 0, 10, K.soil) + pyramid(ring(x, y, 0.36, 6, 8, R() * 6, 0.25), [x, y, h * 0.62], col, [x, y, 20]) + pyramid(ring(x, y, 0.26, 6, h * 0.45, R() * 6, 0.25), [x, y, h], light(col, 0.08), [x, y, h * 0.6])); });
  const round = (x, y, r = 0.4, h = 54, col = K.grass2) => c.add(x + y, () => { c.push(footShadow(x, y, r * 0.8, h) + prism(x, y, 0.06, 5, 0, h * 0.45, K.soil) + gem(x, y, r, 7, h * 0.22, h * 0.56, h, col, 0.3)); });
  const rock = (x, y, r = 0.25, h = 16) => c.add(x + y, () => c.push(gem(x, y, r, 6, -2, h * 0.4, h, K.rock, 0.4)));
  pine(0.6, 1.9, 80); pine(1.5, 0.6, 92); pine(0.4, 3.3, 66, '#4aa58f'); pine(10.3, 7.5, 74); pine(9.4, 8.4, 64, '#4aa58f'); pine(10.5, 5.6, 60); pine(0.5, 7.6, 70);
  round(2.2, 8.4, 0.42, 58, '#8ccf8a'); round(7.9, 5.6, 0.4, 52); round(4.6, 2.6, 0.36, 48, '#8ccf8a'); round(6.4, 7.9, 0.38, 50); round(9.6, 6.4, 0.44, 58, '#8ccf8a'); round(4.9, 8.6, 0.34, 44);
  rock(4.6, 3.6, 0.22, 14); rock(6.0, 5.4, 0.2, 12); rock(6.1, 0.8, 0.28, 18); rock(7.6, 7.0, 0.2, 12); rock(1.2, 4.6, 0.18, 10); rock(8.6, 8.7, 0.26, 16);
  // lamp posts: tall thin prisms with a gold gem
  const lamp = (x, y) => c.add(x + y, () => c.push(prism(x, y, 0.05, 4, 0, 52, K.white, Math.PI / 4) + gem(x, y, 0.1, 5, 50, 57, 66, K.gold, 0.1)));
  lamp(2.85, 3.85); lamp(4.15, 5.15); lamp(7.2, 3.85); lamp(4.15, 7.4);

  // ---------- guests ----------
  [[0.5, 4.5, 0], [1.6, 4.3, 1], [2.6, 4.75, 2], [3.5, 5.6, 3], [3.4, 7.1, 4], [3.6, 8.4, 1], [7.0, 4.35, 5], [8.1, 4.7, 0], [9.4, 4.3, 2], [10.5, 4.65, 4], [8.5, 3.3, 3], [3.0, 3.3, 5]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 0); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();

  const extraDefs = c.defs.join('') + `
    <linearGradient id="rSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7e9f7"/><stop offset="0.6" stop-color="#eef6fb"/><stop offset="1" stop-color="#f7fafc"/></linearGradient>
    <filter id="rBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>`;
  let bg = `<rect width="1600" height="1000" fill="url(#rSky)"/>`;
  // far faceted mountains: each peak = a lit left facet and a shaded right facet
  const mtn = (x, base, w, h, col) => { const top = [x + (R() - 0.5) * w * 0.2, base - h]; return `<path d="M${x - w},${base}L${pt(top)}L${f(x - w * 0.1)},${base}Z" fill="${light(col, 0.25)}"/><path d="M${f(x - w * 0.1)},${base}L${pt(top)}L${x + w},${base}Z" fill="${col}"/><path d="M${pt(top)}L${f(top[0] - w * 0.22)},${f(top[1] + h * 0.28)}L${f(top[0] + w * 0.05)},${f(top[1] + h * 0.2)}L${f(top[0] + w * 0.2)},${f(top[1] + h * 0.3)}Z" fill="#ffffff" fill-opacity="0.85"/>`; };
  [[220, 460, 200, 160, '#bcd2ea'], [470, 470, 230, 210, '#aecae6'], [1150, 470, 260, 230, '#b5cfe9'], [1400, 470, 220, 170, '#c1d6ec'], [760, 420, 180, 120, '#c8daee']].forEach(([x, b, w, h, col]) => { bg += mtn(x, b, w, h, col); });
  bg += `<rect x="0" y="440" width="1600" height="560" fill="#eef5fa"/>`;
  // low-poly clouds and a pale sun
  const lcloud = (x, y, s) => `<path d="M${x},${y}l${30 * s},${-26 * s}l${34 * s},${4 * s}l${26 * s},${-18 * s}l${40 * s},${16 * s}l${22 * s},${24 * s}Z" fill="#ffffff"/><path d="M${x},${y}l${152 * s},0l${-40 * s},${12 * s}l${-80 * s},${-2 * s}Z" fill="#dfe9f3"/>`;
  bg += `<path d="${poly(Array.from({ length: 7 }, (_, i) => [300 + 46 * Math.cos(i / 7 * 6.283), 250 + 46 * Math.sin(i / 7 * 6.283)]))}" fill="#fff6dc"/>` + lcloud(1060, 250, 1.2) + lcloud(380, 330, 0.9) + lcloud(1320, 360, 0.8);
  let lu = ''; G.forEach((g, i) => { lu += guest(112 + i * 74, 1000 - 50, g, 2 * GK); });
  frame({
    key: 'r', letter: 'R', name: 'Low-poly crystal', file: 'r-lowpoly',
    blurb: ['Everything faceted into flat-shaded triangles: a terrain', 'chunk with a faceted river and waterfall, gem trees and', 'rocks, a polygon Ferris wheel. Cool morning, pale sky.'],
    pal: [K.grass, K.path, K.water, K.coral, K.mint, K.lav, K.gold], ink: K.navy, sub: '#5b6f8f', panel: '#ffffffd9', panelInk: K.navy, panelR: 6, swatchR: 0,
    panelDeco: (x, y, w, h) => `<path d="M${x + w - 70},${y}L${x + w},${y}L${x + w},${y + 50}Z" fill="${K.lav}" fill-opacity="0.35"/><path d="M${x + w - 34},${y}L${x + w},${y}L${x + w},${y + 26}Z" fill="${K.mint}" fill-opacity="0.5"/>`,
    bg, scene: c.o.join('\n'), extraDefs, lineup: { svg: lu, w: 470 },
    note: ['One flat colour per triangle, from its normal.', 'Light: cool, upper left; shade drifts to slate.', 'Terrain: 0.5-tile triangle grid, z jitter 5 px.', 'Shadows: crisp flat footprints, 20% slate.', 'Riders sit in hex gondolas and coaster cars.'],
  });
}

// ======================================================================
// S — Origami
// Folded paper, not stacked paper: every object is a few creased planes. Each plane takes one tone from
// its angle to the light plus a soft ramp from its crease to its edge; mountain folds get a pale crease
// line, valley folds a dark one. A pleated carousel roof, paper-crane seats, paper-boat coaster cars on a
// paper-strip track with accordion legs, folded trees, a pleated pond, a folding screen behind the park.
// ======================================================================
function styleS() {
  const S = 1.14, c = Ctx(S, 800, 272), P = c.P, R = rng(9);
  const K = { red: '#e4573f', indigo: '#33508f', pink: '#f1a7b6', mustard: '#e9b440', green: '#79b98d', greenD: '#5f9f78', cream: '#f7f0e2', sky: '#86bfdc', teal: '#4ea58c', kraft: '#c99a6b', plum: '#8b5a8c', ink: '#3a3340', skin: ['#f6d7bf', '#e7b38d', '#bd8762', '#87593d'] };
  const W = 40, nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((t) => t / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const VIEW = nrm([40, 40, 52]), LV = nrm([-0.6, 0.45, 0.66]);
  const norm3 = (a, b, d) => { const u = [(b[0] - a[0]) * W, (b[1] - a[1]) * W, b[2] - a[2]], v = [(d[0] - a[0]) * W, (d[1] - a[1]) * W, d[2] - a[2]]; return nrm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]); };
  const tone = (col, n) => { const b = 0.4 + 0.6 * Math.max(0, dot(n, LV)); return b < 0.72 ? mix(shade(col, 0.74), col, (b - 0.4) / 0.32) : mix(col, light(col, 0.28), (b - 0.72) / 0.28); };
  // a paper plane: its tone, with a soft ramp across it (lighter at the start of the ramp = the crease side)
  const ramp = (base, ang = 0) => c.og(`sr${base}${ang}`, (id) => `<linearGradient id="${id}" x1="${ang ? 1 : 0}" y1="0" x2="${ang ? 0 : 1}" y2="1"><stop offset="0" stop-color="${light(base, 0.1)}"/><stop offset="1" stop-color="${shade(base, 0.92)}"/></linearGradient>`);
  const sheet = (pts2, base, ang = 0) => `<path d="${poly(pts2)}" fill="${ramp(base, ang)}" stroke="${base}" stroke-width="0.5" stroke-linejoin="round"/>`;
  const plane = (pts3, col, ctr = null, ang = 0) => { let n = norm3(pts3[0], pts3[1], pts3[2]); if (ctr) { const cc = [pts3.reduce((s, q) => s + q[0], 0) / pts3.length, pts3.reduce((s, q) => s + q[1], 0) / pts3.length, pts3.reduce((s, q) => s + q[2], 0) / pts3.length]; if (dot(n, [(cc[0] - ctr[0]) * W, (cc[1] - ctr[1]) * W, cc[2] - ctr[2]]) < 0) n = n.map((t) => -t); } else if (n[2] < 0) n = n.map((t) => -t); if (dot(n, VIEW) <= 0.001) return ''; return sheet(pts3.map((q) => P(...q)), tone(col, n), ang); };
  const mtn = (a, b, op = 0.75) => `<path d="M${pt(a)}L${pt(b)}" stroke="#ffffff" stroke-opacity="${op}" stroke-width="1.2" stroke-linecap="round"/>`;
  const val = (a, b, op = 0.28) => `<path d="M${pt(a)}L${pt(b)}" stroke="#2a1f2a" stroke-opacity="${op}" stroke-width="1.1" stroke-linecap="round"/>`;
  const soft = (gx, gy, r, z = 0, op = 0.24) => { const p = P(gx, gy, z); return `<ellipse cx="${f(p[0] + 5)}" cy="${f(p[1] + 3)}" rx="${f(Math.SQRT2 * 52 * S * r)}" ry="${f(Math.SQRT2 * 26 * S * r)}" fill="#4b3a3a" fill-opacity="${op}" filter="url(#sBlur)"/>`; };
  const ring = (cx, cy, r, n, z, rot = 0) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a), z]; });
  const tri2 = (a, b, d, col, ang = 0) => sheet([a, b, d], col, ang);

  // ---------- guests: folded-paper people: a creased cone body, a diamond head folded on its diagonal ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const u = (v) => f(v * k), X = (v) => sx + v * k * g.dir, Y = (v) => sy + v * k, o = [], LW = +LIMB(k, 2.4), D = g.dir;
    const T = (pts, col) => `<path d="M${pts.map(([a, b]) => `${f(X(a))},${f(Y(b))}`).join('L')}Z" fill="${col}"/>`;
    const lit = (col) => light(col, 0.14), drk = (col) => shade(col, 0.8);
    const top = seated ? -12 : -20, bot = seated ? 0 : -7.5, hy = top - 6.6;
    if (!seated) {
      o.push(`<ellipse cx="${f(X(1.5))}" cy="${f(Y(0.6))}" rx="${u(6.8)}" ry="${u(2.3)}" fill="#4b3a3a" fill-opacity="0.28"/>`);
      const lw = LW / k / 2;
      o.push(T([[-2.2 - lw, bot], [-2.2 + lw, bot], [-2.6 + lw, -0.5], [-2.6 - lw - 1, -0.5]], lit(g.pants)) + T([[2.2 - lw, bot], [2.2 + lw, bot], [3 + lw + 1, -0.8], [3 - lw, -0.8]], drk(g.pants)));
    }
    // body: a cone folded down the middle (lit half toward the light), a folded collar triangle
    const L = D > 0 ? lit : drk, Rr = D > 0 ? drk : lit;
    o.push(T([[0, top - 0.5], [-6, bot], [0.4, bot]], L(g.shirt)) + T([[0, top - 0.5], [0.4, bot], [6, bot]], Rr(g.shirt)));
    o.push(T([[-3, top + 1.2], [3, top + 1.2], [0, top + 5]], g.collar || light(g.shirt, 0.5)));
    o.push(`<path d="M${f(X(0))},${f(Y(top + 5))}L${f(X(0.4))},${f(Y(bot))}" stroke="#ffffff" stroke-opacity="0.6" stroke-width="${u(0.5)}"/>`);
    if (seated) o.push(`<path d="M${f(X(-3))},${f(Y(top + 2.5))}L${f(X(-7.2))},${f(Y(top - 6))}M${f(X(3))},${f(Y(top + 2.5))}L${f(X(7.2))},${f(Y(top - 6))}" stroke="${g.shirt}" stroke-width="${f(LW)}" stroke-linecap="round"/>` + T([[-8.6, top - 8.6], [-6, top - 7.4], [-7.6, top - 5.2]], g.skin) + T([[8.6, top - 8.6], [6, top - 7.4], [7.6, top - 5.2]], g.skin));
    else o.push(`<path d="M${f(X(3.2))},${f(Y(top + 3))}L${f(X(6))},${f(Y(top + 10))}M${f(X(-3.2))},${f(Y(top + 3))}L${f(X(-5.6))},${f(Y(top + 9.6))}" stroke="${drk(g.shirt)}" stroke-width="${f(LW)}" stroke-linecap="round"/>`);
    if (g.fan && !seated) o.push(T([[6, top + 10], [1.5, top + 3], [10.5, top + 2]], g.fan) + `<path d="M${f(X(6))},${f(Y(top + 10))}L${f(X(4.5))},${f(Y(top + 2.6))}M${f(X(6))},${f(Y(top + 10))}L${f(X(7.5))},${f(Y(top + 2.4))}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="${u(0.5)}"/>`);
    if (g.kite && !seated) o.push(`<path d="M${f(X(6))},${f(Y(top + 10))}Q${f(X(12))},${f(Y(top - 2))} ${f(X(10))},${f(Y(top - 14))}" stroke="${K.ink}" stroke-width="${u(0.6)}" fill="none"/>` + T([[10, top - 26], [15, top - 18], [10, top - 13]], light(g.kite, 0.15)) + T([[10, top - 26], [10, top - 13], [5, top - 18]], g.kite));
    // head: a square turned 45 degrees and folded on its vertical diagonal
    o.push(T([[0, hy - 6], [-5.6, hy], [0, hy + 6]], D > 0 ? light(g.skin, 0.1) : shade(g.skin, 0.9)) + T([[0, hy - 6], [5.6, hy], [0, hy + 6]], D > 0 ? shade(g.skin, 0.9) : light(g.skin, 0.1)));
    if (g.hair === 'flap') o.push(T([[-5.6, hy], [0, hy - 6], [5.6, hy], [0, hy - 2.4]], g.hairCol) + T([[0, hy - 6], [5.6, hy], [0, hy - 2.4]], shade(g.hairCol, 0.82)));
    else if (g.hair === 'hat') o.push(T([[-8, hy - 2.2], [8, hy - 2.2], [0, hy - 12]], g.hairCol) + T([[0, hy - 12], [8, hy - 2.2], [0.8, hy - 2.2]], shade(g.hairCol, 0.82)));
    else o.push(T([[-5.6, hy], [-6.4, hy + 6], [-3, hy + 3], [0, hy - 6], [-5.6, hy - 1]], g.hairCol) + T([[0, hy - 6], [5.6, hy], [2, hy - 2.6]], shade(g.hairCol, 0.82)));
    o.push(`<circle cx="${f(X(2.2))}" cy="${f(Y(hy + 0.6))}" r="${u(0.85)}" fill="${K.ink}"/>`);
    return o.join('');
  }
  const G = [
    { dir: 1, shirt: K.red, pants: K.indigo, skin: K.skin[0], hair: 'flap', hairCol: '#3a2a26', fan: K.mustard },
    { dir: -1, shirt: K.indigo, pants: K.kraft, skin: K.skin[2], hair: 'bob', hairCol: '#2a2228', kite: K.pink },
    { dir: 1, shirt: K.mustard, pants: K.teal, skin: K.skin[1], hair: 'hat', hairCol: K.red },
    { dir: -1, shirt: K.teal, pants: K.cream, skin: K.skin[3], hair: 'flap', hairCol: '#1f1a1c', collar: K.mustard },
    { dir: 1, shirt: K.pink, pants: K.plum, skin: K.skin[0], hair: 'bob', hairCol: K.kraft },
    { dir: -1, shirt: K.plum, pants: K.indigo, skin: K.skin[1], hair: 'hat', hairCol: K.sky },
  ];
  const GK = 1.14 * S;

  // ---------- paper crane (seat or decoration): body diamond, raised wings, neck and tail points ----------
  const crane = (sx, sy, s, dir, col, between = '') => {
    const X = (v) => f(sx + v * s * dir), Y = (v) => f(sy + v * s), T = (pts, cl) => `<path d="M${pts.map(([a, b]) => `${X(a)},${Y(b)}`).join('L')}Z" fill="${cl}"/>`;
    let o = T([[-3, -3], [-2, -22], [5, -4]], shade(col, 0.78)) + T([[-2, -22], [5, -4], [1, -6]], shade(col, 0.9));
    o += T([[-10, -1], [-22, -15], [-7, 1]], shade(col, 0.86)) + T([[9, -1], [17, -17], [11, 1]], light(col, 0.1)) + T([[17, -17], [22, -14], [17.6, -15]], shade(col, 0.8));
    o += T([[-12, 0], [0, -5], [12, 0], [0, 4]], col) + T([[-12, 0], [12, 0], [0, 4]], shade(col, 0.85));
    o += between;
    o += T([[-6, 1], [3, 15], [8, 1]], light(col, 0.18)) + T([[3, 15], [8, 1], [4, 2]], col) + `<path d="M${X(-6)},${Y(1)}L${X(8)},${Y(1)}" stroke="#fff" stroke-opacity="0.7" stroke-width="1"/>`;
    return o;
  };

  // ---------- table + folding screen behind the park ----------
  const BX = 9, BY = 8;
  let under = '';
  // the green sheet: big pre-creased squares (the ghost of a fold pattern), each triangle tilted a hair
  under += `<path d="${poly([P(0, 0, -3), P(BX, 0, -3), P(BX, BY, -3), P(0, BY, -3)].map((q) => [q[0] + 10, q[1] + 10]))}" fill="#3d2f2f" fill-opacity="0.25" filter="url(#sBlurW)"/>`;
  const cs = 3, zz = (i, j) => ((i + j) % 2 ? 3 : -2);
  for (let j = 0; j < BY / 2; j++) for (let i = 0; i < Math.ceil(BX / 3); i++) {
    const x0 = i * cs, x1 = Math.min(BX, x0 + cs), y0 = j * 2, y1 = y0 + 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, m = [cx, cy, zz(i, j) * 1.5];
    const cn = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
    for (let k = 0; k < 4; k++) under += plane([cn[k], cn[(k + 1) % 4], m], (i + j) % 2 ? K.green : mix(K.green, K.greenD, 0.25), null, k % 2);
    for (let k = 0; k < 4; k++) under += (zz(i, j) > 0 ? mtn : val)(P(...cn[k]), P(...m), 0.45);
  }
  // paper edge: the sheet's thickness on the two near sides
  under += `<path d="M${pt(P(0, BY, 0))}L${pt(P(BX, BY, 0))}L${pt(P(BX, 0, 0))}L${pt(P(BX, 0, -3))}L${pt(P(BX, BY, -3))}L${pt(P(0, BY, -3))}Z" fill="${shade(K.green, 0.7)}"/>`;
  under += `<path d="M${pt(P(0, BY, 0))}L${pt(P(BX, BY, 0))}L${pt(P(BX, 0, 0))}" stroke="#ffffff" stroke-opacity="0.6" stroke-width="1.2" fill="none"/>`;
  // pleated pond: a blue sheet folded into parallel pleats
  const PD = { x0: 6.1, x1: 8.5, y0: 5.6, y1: 7.6 };
  under += soft((PD.x0 + PD.x1) / 2, (PD.y0 + PD.y1) / 2, 1.2, 0, 0.18);
  const npl = 8; for (let i = 0; i < npl; i++) { const xa = PD.x0 + (PD.x1 - PD.x0) * i / npl, xb = PD.x0 + (PD.x1 - PD.x0) * (i + 1) / npl, za = i % 2 ? 4 : 1, zb = i % 2 ? 1 : 4; under += plane([[xa, PD.y0, za], [xb, PD.y0, zb], [xb, PD.y1, zb], [xa, PD.y1, za]], K.sky, null, i % 2); under += (i % 2 ? val : mtn)(P(xa, PD.y0, za), P(xa, PD.y1, za), 0.6); }
  // paths: cream strips with a lengthwise crease and folded-over ends
  const strip = (x0, x1, y0, y1, along) => {
    let o = soft((x0 + x1) / 2, (y0 + y1) / 2, 0.01, 0, 0) + `<path d="${poly([P(x0, y0, 1), P(x1, y0, 1), P(x1, y1, 1), P(x0, y1, 1)].map((q) => [q[0] + 3, q[1] + 3]))}" fill="#4b3a3a" fill-opacity="0.16" filter="url(#sBlur)"/>`;
    if (along === 'x') { const ym = (y0 + y1) / 2; o += plane([[x0, y0, 1], [x1, y0, 1], [x1, ym, 2.5], [x0, ym, 2.5]], K.cream) + plane([[x0, ym, 2.5], [x1, ym, 2.5], [x1, y1, 1], [x0, y1, 1]], K.cream, null, 1) + mtn(P(x0, ym, 2.5), P(x1, ym, 2.5), 0.9); }
    else { const xm = (x0 + x1) / 2; o += plane([[x0, y0, 1], [xm, y0, 2.5], [xm, y1, 2.5], [x0, y1, 1]], K.cream) + plane([[xm, y0, 2.5], [x1, y0, 1], [x1, y1, 1], [xm, y1, 2.5]], K.cream, null, 1) + mtn(P(xm, y0, 2.5), P(xm, y1, 2.5), 0.9); }
    return o;
  };
  under += strip(0, BX, 4.1, 5.1, 'x') + strip(4.1, 5.1, 5.1, BY, 'y') + strip(2.25, 3.0, 3.55, 4.1, 'y') + strip(6.3, 7.0, 3.55, 4.1, 'y');
  // the folded-over corner at each path end (underside shows, darker)
  for (const [a, b, d] of [[[0, 4.1, 1], [0.45, 4.1, 1], [0, 4.55, 1]], [[BX, 5.1, 1], [BX - 0.45, 5.1, 1], [BX, 4.65, 1]], [[4.1, BY, 1], [4.1, BY - 0.45, 1], [4.55, BY, 1]]]) under += `<path d="${poly([P(...a), P(...b), P(...d)])}" fill="${shade(K.cream, 0.82)}"/>` + mtn(P(...b), P(...d), 0.9);
  c.push(under);

  // ---------- carousel: a folded octagon deck, paper cranes for seats, a pleated roof ----------
  const CR = { x: 2.55, y: 2.0 }, NC = 6, RZ = 98, RR = 1.38;
  c.add(CR.x + CR.y - 3, () => {
    c.push(soft(CR.x, CR.y, 1.4, 0, 0.26));
    const b = ring(CR.x, CR.y, 1.18, 8, 0, Math.PI / 8), t = ring(CR.x, CR.y, 1.18, 8, 12, Math.PI / 8), ctr = [CR.x, CR.y, 6];
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; c.push(plane([b[i], b[j], t[j], t[i]], i % 2 ? K.pink : K.cream, ctr, i % 2)); }
    // deck: a folded star: 16 triangles, alternating tones, crease lines from the centre
    const mid = ring(CR.x, CR.y, 1.18, 16, 12, Math.PI / 8 - Math.PI / 16 * 0);
    for (let i = 0; i < 16; i++) { const j = (i + 1) % 16; c.push(plane([[CR.x, CR.y, i % 2 ? 15 : 13], mid[i], mid[j]], i % 2 ? K.mustard : light(K.mustard, 0.25))); c.push((i % 2 ? mtn : val)(P(CR.x, CR.y, 14), P(...mid[i]), 0.5)); }
  });
  const seats = Array.from({ length: NC }, (_, i) => { const a = i / NC * Math.PI * 2 + 0.4; return { a, x: CR.x + 0.82 * Math.cos(a), y: CR.y + 0.82 * Math.sin(a), z: 30 + 6 * Math.sin(i * 2.1), col: [K.red, K.sky, K.mustard, K.pink, K.teal, K.cream][i] }; });
  const seat = (s, i) => {
    const p = P(s.x, s.y, s.z), ta = [-Math.sin(s.a), Math.cos(s.a)], sdx = P(s.x + ta[0], s.y + ta[1])[0] - P(s.x, s.y)[0], dir = sdx >= 0 ? 1 : -1;
    c.push(`<path d="M${pt(P(s.x, s.y, 14))}L${pt(P(s.x, s.y, RZ - 6))}" stroke="${K.mustard}" stroke-width="3"/><path d="M${f(P(s.x, s.y, 14)[0] + 1)},${f(P(s.x, s.y, 14)[1])}L${f(P(s.x, s.y, RZ - 6)[0] + 1)},${f(P(s.x, s.y, RZ - 6)[1])}" stroke="${shade(K.mustard, 0.75)}" stroke-width="1.2"/>`);
    c.push(crane(p[0], p[1] + 4, 1.25, dir, s.col, guest(p[0] + dir * 1, p[1] - 1, { ...G[(i + 1) % 6], dir }, GK * 0.85, true)));
  };
  seats.forEach((s, i) => { if (Math.cos(s.a) + Math.sin(s.a) < -0.3) c.add(CR.x + CR.y - 2, () => seat(s, i)); });
  c.add(CR.x + CR.y - 1.5, () => { const b = P(CR.x, CR.y, 14), t = P(CR.x, CR.y, RZ); c.push(`<path d="M${f(b[0] - 6)},${f(b[1])}L${f(t[0] - 6)},${f(t[1])}L${f(t[0])},${f(t[1])}L${f(b[0])},${f(b[1])}Z" fill="${light(K.red, 0.12)}"/><path d="M${f(b[0])},${f(b[1])}L${f(t[0])},${f(t[1])}L${f(t[0] + 6)},${f(t[1])}L${f(b[0] + 6)},${f(b[1])}Z" fill="${shade(K.red, 0.8)}"/>`); });
  seats.forEach((s, i) => { if (Math.cos(s.a) + Math.sin(s.a) >= -0.3) c.add(CR.x + CR.y - 1 + (Math.cos(s.a) + Math.sin(s.a)) * 0.3, () => seat(s, i)); });
  c.add(CR.x + CR.y + 0.6, () => {
    // pleated roof: 2N rim points alternating out/in and low/high; each pleat = two triangles to the apex
    const N = 14, A = [CR.x, CR.y, RZ + 48], rim = Array.from({ length: N * 2 }, (_, i) => { const a = i / (N * 2) * Math.PI * 2, r = i % 2 ? RR * 0.86 : RR; return [CR.x + r * Math.cos(a), CR.y + r * Math.sin(a), RZ + (i % 2 ? 9 : 0)]; }), ctr = [CR.x, CR.y, RZ + 10];
    for (let i = 0; i < N * 2; i++) { const j = (i + 1) % (N * 2), col = Math.floor(i / 2) % 2 ? K.cream : K.red; c.push(plane([A, rim[i], rim[j]], col, ctr, i % 2)); }
    for (let i = 0; i < N * 2; i++) { const q = rim[i], a = Math.atan2(q[1] - CR.y, q[0] - CR.x); if (Math.cos(a) + Math.sin(a) < -0.5) continue; c.push((i % 2 ? val : mtn)(P(...A), P(...q), i % 2 ? 0.35 : 0.8)); }
    // zig-zag hem (front half) and a folded flag on top
    const fr = rim.filter((q) => { const a = Math.atan2(q[1] - CR.y, q[0] - CR.x); return Math.cos(a) + Math.sin(a) > -0.3; });
    c.push(`<path d="${line(fr.map((q) => P(...q)))}" stroke="#ffffff" stroke-opacity="0.8" stroke-width="1.3" fill="none"/>`);
    const ap = P(...A); c.push(`<path d="M${pt(ap)}l0,-20" stroke="${K.ink}" stroke-width="1.6"/><path d="M${f(ap[0])},${f(ap[1] - 20)}l16,5l-16,5z" fill="${K.mustard}"/><path d="M${f(ap[0])},${f(ap[1] - 20)}l16,5l-16,0z" fill="${light(K.mustard, 0.2)}"/>`);
  });

  // ---------- paper-strip coaster on accordion legs, paper-boat cars ----------
  const trk = Track([[5.6, 3.25, 12], [7.4, 3.25, 12], [8.3, 3.05, 30], [8.7, 2.2, 100], [8.4, 1.1, 150], [7.5, 0.6, 146], [6.6, 0.9, 70], [6.1, 1.6, 26], [6.7, 2.3, 58], [7.6, 2.2, 76], [7.7, 1.5, 54], [6.4, 1.15, 52], [5.3, 1.5, 36], [5.0, 2.6, 18]], 10, true);
  const tp = trk.pts;
  const legPleat = (x, y, z) => { const b = P(x, y, 0); let o = soft(x, y, 0.1, 0, 0.3); const n = Math.max(2, Math.round(z / 12)), h = z / n; for (let i = 0; i < n; i++) { const y0 = b[1] - i * h, y1 = y0 - h, s0 = i % 2 ? 2.5 : -2.5, s1 = -s0; o += `<path d="M${f(b[0] - 5 + s0)},${f(y0)}L${f(b[0] + 5 + s0)},${f(y0)}L${f(b[0] + 5 + s1)},${f(y1)}L${f(b[0] - 5 + s1)},${f(y1)}Z" fill="${i % 2 ? K.mustard : shade(K.mustard, 0.78)}"/>`; } return o; };
  tp.forEach((p, i) => { if (i % 8 || p[2] < 20) return; c.add(p[0] + p[1] - 0.1, () => c.push(legPleat(p[0], p[1], p[2] - 3))); });
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.17, ny = dx / l * 0.17;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2, () => {
      const a = [p[0] + nx, p[1] + ny, p[2]], b = [q[0] + nx, q[1] + ny, q[2]], d = [q[0] - nx, q[1] - ny, q[2]], e = [p[0] - nx, p[1] - ny, p[2]], m0 = [p[0], p[1], p[2] + 2], m1 = [q[0], q[1], q[2] + 2];
      c.push(`<path d="${poly([P(...a), P(...b), P(b[0], b[1], b[2] - 4), P(a[0], a[1], a[2] - 4)])}" fill="${shade(K.indigo, 0.7)}"/><path d="${poly([P(...e), P(...d), P(d[0], d[1], d[2] - 4), P(e[0], e[1], e[2] - 4)])}" fill="${shade(K.indigo, 0.7)}"/>`);
      c.push(plane([a, b, m1, m0], K.indigo) + plane([m0, m1, d, e], K.indigo, null, 1));
      c.push(mtn(P(...m0), P(...m1), 0.55));
    });
  }
  c.add(6.5 + 3.6, () => { const ctr = [6.5, 3.62, 6]; const v = [[5.5, 3.45, 0], [7.5, 3.45, 0], [7.5, 3.8, 0], [5.5, 3.8, 0]]; const vt = v.map((q) => [q[0], q[1], 11]); for (let i = 0; i < 4; i++) c.push(plane([v[i], v[(i + 1) % 4], vt[(i + 1) % 4], vt[i]], K.kraft, ctr)); c.push(plane(vt, light(K.kraft, 0.2))); });
  const boats = [K.red, K.mustard, K.pink];
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 14.6 - k * 0.6, 0.48, 0.42, 10, 3), col = boats[k];
    const push = (q, s) => [q[0] + car.dx * 0.1 * s, q[1] + car.dy * 0.1 * s, q[2]];
    const tt = [push(car.t[0], -1), push(car.t[1], 1), push(car.t[2], 1), push(car.t[3], -1)];
    c.add(car.depth + 0.3, () => {
      c.push(`<path d="${poly(tt.map((q) => P(...q)))}" fill="${shade(col, 0.55)}"/>`);
      [-0.2, 0.2].map((u) => car.seat(u, 8)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j + 2) % 6], dir: 1 }, GK * 0.85, true)); });
      const ctr = [car.mid[0], car.mid[1], car.mid[2] + 6];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; c.push(plane([car.b[i], car.b[j], tt[j], tt[i]], col, ctr, i % 2)); }
      // the boat's centre sail, folded up on the near long side
      const near = [0, 2].map((i) => [i, (i + 1) % 4]).find(([i, j]) => { const n = car.sides.find((sd) => !sd.end); return n; });
      void near;
      for (const [i, j] of [[2, 3], [0, 1]]) { const a = tt[i], b = tt[j], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2] + 12]; const nn = [car.nx * (i === 2 ? 1 : -1), car.ny * (i === 2 ? 1 : -1)]; if (nn[0] + nn[1] <= 0) continue; const p1 = [a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3, a[2]], p2 = [a[0] + (b[0] - a[0]) * 0.7, a[1] + (b[1] - a[1]) * 0.7, a[2]]; c.push(tri2(P(...p1), P(...mid), P(...p2), light(col, 0.12)) + mtn(P(...mid), P((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, a[2]), 0.7)); }
    });
  });

  // ---------- tea stall: a folded-paper house with a creased roof and pennant flaps ----------
  const ST = { x: 1.9, y: 6.4 };
  c.add(ST.x + ST.y, () => {
    c.push(soft(ST.x, ST.y, 0.95, 0, 0.26));
    const x0 = ST.x - 0.6, x1 = ST.x + 0.6, y0 = ST.y - 0.5, y1 = ST.y + 0.5, z1 = 34, ctr = [ST.x, ST.y, 17];
    c.push(plane([[x1, y0, 0], [x1, y1, 0], [x1, y1, z1], [x1, y0, z1]], K.cream, ctr) + plane([[x0, y1, 0], [x1, y1, 0], [x1, y1, z1], [x0, y1, z1]], K.cream, ctr, 1));
    c.push(`<path d="${poly([P(x0 + 0.25, y1, 10), P(x1 - 0.2, y1, 10), P(x1 - 0.2, y1, 27), P(x0 + 0.25, y1, 27)])}" fill="${shade(K.indigo, 0.6)}"/>`);
    // counter flap folded down
    c.push(plane([[x0 + 0.2, y1, 10], [x1 - 0.15, y1, 10], [x1 - 0.15, y1 + 0.3, 8], [x0 + 0.2, y1 + 0.3, 8]], K.kraft));
    for (const dx of [0.0, 0.35]) { const p = P(x0 + 0.45 + dx, y1 + 0.15, 9); c.push(`<path d="M${f(p[0] - 4)},${f(p[1])}l1,-7l6,0l1,7z" fill="${K.teal}"/><path d="M${f(p[0])},${f(p[1])}l0,-7l3,0l1,7z" fill="${shade(K.teal, 0.8)}"/>`); }
    // roof: ridge along x, two planes, a little overhang; gable triangle on the near x end
    const ov = 0.18, rz = z1 + 26, ridgeA = [x0 - ov, ST.y, rz], ridgeB = [x1 + ov, ST.y, rz];
    c.push(plane([[x1, y0, z1], [x1, y1, z1], [x1, ST.y, rz]], K.cream, ctr));
    c.push(plane([ridgeA, ridgeB, [x1 + ov, y0 - ov, z1 - 2], [x0 - ov, y0 - ov, z1 - 2]], K.red, [ST.x, ST.y, z1]) + plane([ridgeA, ridgeB, [x1 + ov, y1 + ov, z1 - 2], [x0 - ov, y1 + ov, z1 - 2]], K.red, [ST.x, ST.y, z1], 1) + mtn(P(...ridgeA), P(...ridgeB), 0.9));
    // pennant flaps folded down from the near eave
    for (let i = 0; i < 6; i++) { const xa = x0 - ov + (x1 - x0 + 2 * ov) * i / 6, xb = xa + (x1 - x0 + 2 * ov) / 6; c.push(tri2(P(xa, y1 + ov, z1 - 2), P(xb, y1 + ov, z1 - 2), P((xa + xb) / 2, y1 + ov, z1 - 12), i % 2 ? K.mustard : K.pink)); }
    // a folded fan sign on the ridge
    const fp = P(ST.x + 0.1, ST.y, rz + 4); let fan = ''; for (let i = 0; i < 7; i++) { const a0 = Math.PI * (1.1 + i * 0.114), a1 = a0 + Math.PI * 0.114; fan += `<path d="M${pt(fp)}L${f(fp[0] + Math.cos(a0) * 30)},${f(fp[1] + Math.sin(a0) * 30)}L${f(fp[0] + Math.cos(a1) * 30)},${f(fp[1] + Math.sin(a1) * 30)}Z" fill="${i % 2 ? K.indigo : light(K.indigo, 0.2)}"/>`; } c.push(fan + `<circle cx="${f(fp[0])}" cy="${f(fp[1] - 16)}" r="6" fill="${K.red}"/>`);
  });

  // ---------- folded trees, lanterns, cranes by the pond ----------
  const pine = (x, y, h = 70, col = K.teal) => c.add(x + y, () => {
    c.push(soft(x, y, 0.35, 0, 0.26));
    const b = P(x, y, 0); c.push(`<path d="M${f(b[0] - 3)},${f(b[1])}l0,-12l3,0l0,12z" fill="${K.kraft}"/><path d="M${f(b[0])},${f(b[1])}l0,-12l3,0l0,12z" fill="${shade(K.kraft, 0.8)}"/>`);
    [[10, 22, h * 0.42], [h * 0.34, 17, h * 0.4], [h * 0.6, 12, h * 0.4]].forEach(([z, w, hh]) => { const yb = b[1] - z, ap = [b[0], yb - hh]; c.push(tri2([b[0] - w, yb], ap, [b[0], yb + 3], light(col, 0.12)) + tri2([b[0], yb + 3], ap, [b[0] + w, yb], shade(col, 0.8)) + `<path d="M${pt(ap)}L${f(b[0])},${f(yb + 3)}" stroke="#fff" stroke-opacity="0.55" stroke-width="1"/>`); });
  });
  const ball = (x, y, r = 22, h = 22, col = K.green) => c.add(x + y, () => {
    c.push(soft(x, y, 0.38, 0, 0.26));
    const b = P(x, y, 0), cx = b[0], cy = b[1] - h - r; c.push(`<path d="M${f(cx - 2.5)},${f(b[1])}l0,${f(-h - 4)}l2.5,0l0,${f(h + 4)}z" fill="${K.kraft}"/><path d="M${f(cx)},${f(b[1])}l0,${f(-h - 4)}l2.5,0l0,${f(h + 4)}z" fill="${shade(K.kraft, 0.8)}"/>`);
    // a folded balloon: four faces around a centre point, creases to each corner
    const T = [cx, cy - r], Rt = [cx + r, cy], B = [cx, cy + r * 0.9], L = [cx - r, cy], M = [cx - r * 0.12, cy - r * 0.08];
    c.push(tri2(L, T, M, light(col, 0.22)) + tri2(T, Rt, M, light(col, 0.04)) + tri2(Rt, B, M, shade(col, 0.76)) + tri2(B, L, M, shade(col, 0.9)));
    c.push(mtn(T, M, 0.7) + mtn(L, M, 0.6) + val(Rt, M, 0.3) + val(B, M, 0.3));
  });
  pine(0.5, 0.5, 78); pine(0.4, 3.4, 64, K.greenD); pine(8.6, 4.0, 70); pine(3.6, 7.5, 60, K.greenD); pine(8.5, 7.8, 66);
  ball(0.7, 5.8, 22, 20, K.green); ball(3.4, 3.4, 18, 18, K.pink); ball(5.6, 6.2, 22, 22, K.green); ball(8.7, 5.4, 18, 16, K.pink); ball(0.6, 7.6, 18, 18, K.mustard); ball(5.2, 0.4, 20, 20, K.green);
  const lantern = (x, y) => c.add(x + y, () => { const b = P(x, y, 0), t = P(x, y, 50); c.push(`<path d="M${pt(b)}L${pt(t)}" stroke="${K.ink}" stroke-width="2.2"/>` + `<path d="M${f(t[0] - 7)},${f(t[1] + 2)}L${f(t[0])},${f(t[1] - 12)}L${f(t[0])},${f(t[1] + 8)}Z" fill="${light(K.red, 0.25)}"/><path d="M${f(t[0])},${f(t[1] - 12)}L${f(t[0] + 7)},${f(t[1] + 2)}L${f(t[0])},${f(t[1] + 8)}Z" fill="${K.red}"/>`); });
  lantern(3.9, 3.95); lantern(5.3, 5.3); lantern(7.9, 3.95); lantern(3.9, 6.8);
  [[6.7, 6.2, 1, K.cream], [7.8, 6.9, -1, K.pink], [7.3, 5.9, -1, K.mustard]].forEach(([x, y, d, col]) => c.add(x + y + 0.1, () => { const p = P(x, y, 5); c.push(soft(x, y, 0.2, 2, 0.2) + crane(p[0], p[1], 0.9, d, col)); }));

  // ---------- guests ----------
  [[0.6, 4.5, 0], [1.7, 4.75, 1], [2.6, 3.85, 2], [3.6, 4.4, 3], [5.6, 4.8, 4], [6.7, 4.35, 5], [6.65, 3.75, 1], [8.0, 4.7, 2], [4.5, 5.8, 0], [4.7, 6.9, 5], [4.4, 7.7, 3]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 2); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();

  let bg = `<rect width="1600" height="1000" fill="url(#sBg)"/>`;
  // the folding screen behind: six panels, alternating toward and away from the light, a sun and hills across them
  const scr = Array.from({ length: 7 }, (_, i) => [-0.2 + i * (BX + 0.4) / 6, i % 2 ? -1.25 : -0.35]);
  let screen = '';
  const SH = 170;
  for (let i = 0; i < 6; i++) {
    const a = scr[i], b = scr[i + 1], q = [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], SH], [a[0], a[1], SH]];
    const litP = i % 2 === 0, t = litP ? '#fbf3e1' : '#e3d3b6';
    screen += sheet(q.map((v) => P(...v)), t, i % 2);
    screen += `<path d="${poly([P(a[0], a[1], SH - 10), P(b[0], b[1], SH - 10), P(b[0], b[1], SH), P(a[0], a[1], SH)])}" fill="${litP ? K.mustard : shade(K.mustard, 0.8)}"/><path d="${poly([P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], 8), P(a[0], a[1], 8)])}" fill="${litP ? K.kraft : shade(K.kraft, 0.8)}"/>`;
    // hills painted across the panels
    const hz = (x) => 40 + 50 * Math.max(0, Math.sin((x + 0.4) * 0.62)) + 18 * Math.sin(x * 1.7);
    const hp = []; for (let k = 0; k <= 6; k++) { const u = k / 6, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; hp.push(P(x, y, hz(x))); }
    screen += `<path d="M${pt(P(a[0], a[1], 8))}L${hp.map(pt).join('L')}L${pt(P(b[0], b[1], 8))}Z" fill="${litP ? K.teal : shade(K.teal, 0.8)}" fill-opacity="0.75"/>`;
    const hp2 = []; for (let k = 0; k <= 6; k++) { const u = k / 6, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; hp2.push(P(x, y, 24 + 22 * Math.max(0, Math.sin(x * 0.9 + 2)))); }
    screen += `<path d="M${pt(P(a[0], a[1], 8))}L${hp2.map(pt).join('L')}L${pt(P(b[0], b[1], 8))}Z" fill="${litP ? K.greenD : shade(K.greenD, 0.8)}" fill-opacity="0.85"/>`;
    if (i < 5) screen += (i % 2 ? val : mtn)(P(b[0], b[1], 0), P(b[0], b[1], SH), 0.9);
  }
  screen = `<path d="${poly(scr.map((q) => P(q[0], q[1], 0)).concat(scr.slice().reverse().map((q) => P(q[0] + 0.5, q[1] + 0.2, 0))))}" fill="#4b3a3a" fill-opacity="0.12" filter="url(#sBlur)"/>` + screen;
  // a vermilion sun painted on panels 4-5
  const sc = scr[4], sp = P(sc[0], sc[1] + 0.02, 128);
  screen += `<circle cx="${f(sp[0])}" cy="${f(sp[1])}" r="34" fill="${K.red}" fill-opacity="0.85"/>`;
  bg += `<path d="${poly([P(-0.4, -0.45, 0), P(BX + 0.4, -0.45, 0), P(BX + 0.4, -0.45, 236)].map((q) => [q[0] + 8, q[1] + 8]))}" fill="none"/>`;
  // flying cranes
  [[230, 330, 1.6, 1, K.red], [380, 270, 1.1, 1, K.mustard], [1260, 300, 1.8, -1, K.indigo], [1440, 420, 1.2, -1, K.pink], [1100, 210, 1.0, -1, K.teal]].forEach(([x, y, s, d, col]) => { bg += crane(x, y, s, d, col); });
  const extraDefs = c.defs.join('') + `
    <filter id="sBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="sBlurW" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <linearGradient id="sBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dfe4"/><stop offset="1" stop-color="#c9d1d8"/></linearGradient>`;
  let lu = ''; G.forEach((g, i) => { lu += guest(112 + i * 74, 1000 - 50, g, 2 * GK); });
  frame({
    key: 's', letter: 'S', name: 'Origami', file: 's-origami',
    blurb: ['Folded paper, not stacked paper: every object is a few', 'creased planes, lit by its fold. Pleated carousel roof,', 'crane seats, paper-boat cars, a folding screen behind.'],
    pal: [K.red, K.indigo, K.mustard, K.pink, K.green, K.sky, K.cream], ink: K.ink, sub: '#56606b', panel: '#fbf7efee', panelInk: K.ink, panelR: 2, swatchR: 0,
    swatchExtra: '',
    panelDeco: (x, y, w, h) => `<path d="M${x + w - 46},${y}L${x + w},${y}L${x + w},${y + 46}Z" fill="${K.red}"/><path d="M${x + w - 46},${y}L${x + w},${y + 46}L${x + w - 46},${y + 46}Z" fill="${shade(K.red, 0.8)}"/><path d="M${x + w - 46},${y}L${x + w},${y + 46}" stroke="#fff" stroke-opacity="0.7"/>`,
    bg: bg + screen, scene: c.o.join('\n'), extraDefs, lineup: { svg: lu, w: 470 },
    note: ['Plane tone = its angle to the light + a soft ramp.', 'Creases: mountain = pale line, valley = dark line.', 'Folds, not layers: no outlines, no stacked edges.', 'Shadows: soft, the paper lifts off the sheet.', 'Riders sit on cranes and in paper boats.'],
  });
}

const want = process.argv.slice(2);
const all = { p: styleP, q: styleQ, r: styleR, s: styleS };
for (const k of Object.keys(all)) if (!want.length || want.includes(k)) all[k]();
