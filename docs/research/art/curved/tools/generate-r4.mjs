// Round 4 concept sheets: L (sky islands), M (felt and stitch), N (stained glass), O (retro-future chrome).
// Separate from generate.mjs and generate-r3.mjs on purpose: A-K stay byte-identical. Helpers below the
// colour block are copied from generate-r3.mjs; only the camera (isometric 2:1, x=(x-y)*52, y=(x+y)*26-z)
// is shared with the game. Every ride car here is a TUB: well, then seated riders, then the car's front
// walls drawn over the riders' laps, so riders sit IN the cars (round 3 stood them on top).
// usage: node tools/generate-r4.mjs          -> all four
//        node tools/generate-r4.mjs l n      -> some
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


// ---------- round-4 shared building blocks ----------
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

// ---------- shared sheet frame (round-3 layout, round-4 label) ----------
function frame({ key, letter, name, file, blurb, pal, ink, sub, panel, panelInk, panelR = 18, swatchR = 9, swatchExtra = '', panelDeco = () => '', bg, scene, lineup, note, extraDefs = '', over = '', titleWeight = 800 }) {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" font-family="${FONT}">`);
  out.push(`<title>${letter} — ${name} · Thrills &amp; Chills round-4 art concept</title>`);
  out.push(`<defs>${extraDefs}</defs>`);
  out.push(bg);
  out.push(scene);
  out.push(over);
  out.push(`<text x="56" y="70" font-size="15" font-weight="700" letter-spacing="3" fill="${sub}">THRILLS &amp; CHILLS · ROUND 4 ART CONCEPT</text>`);
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

// ======================================================================
// L — Sky islands
// The park on floating pastel islands joined by rope bridges, a cloud sea below. Organic, curvy rides
// (a flower-petal spinner, a vine coaster with seed-pod cars, a mushroom stall). Backlit from the upper
// right: shade is lilac (never grey) and every silhouette gets a thin white rim on its sun side.
// ======================================================================
function styleL() {
  const S = 1.2, c = Ctx(S, 770, 190), P = c.P;
  const K = { pink: '#f7b9d2', rose: '#ec8db5', lilac: '#cdb8f0', lav: '#a58ed8', mint: '#aeeacf', mintD: '#78cda9', cream: '#fff6ec', peach: '#ffd5bf', butter: '#ffe7a3', ink: '#5a4785', soil: '#f4c6cf', rock: '#d3c0f0', rockD: '#a490d8', sky: '#bfe4f2' };
  const SH = '#8a74c8';
  const sh = (col, t = 0.32) => mix(col, SH, t), lit = (col, t = 0.2) => light(col, t);
  const RIM = (o = 0.85) => `stroke="#ffffff" stroke-opacity="${o}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  // gradients: horizontal (lilac shade left, lit right), vertical, and a sphere lit from the upper right
  const hg = (col) => c.og(`lh${col}`, (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sh(col, 0.42)}"/><stop offset="0.55" stop-color="${col}"/><stop offset="1" stop-color="${lit(col, 0.28)}"/></linearGradient>`);
  const vg = (a, b) => c.og(`lv${a}${b}`, (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);
  const rg = (col) => c.og(`lr${col}`, (id) => `<radialGradient id="${id}" cx="0.62" cy="0.34" r="0.75"><stop offset="0" stop-color="${lit(col, 0.45)}"/><stop offset="0.55" stop-color="${col}"/><stop offset="1" stop-color="${sh(col, 0.38)}"/></radialGradient>`);
  const ball = (cx, cy, r, col) => {
    c.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${rg(col)}"/>`);
    const a0 = -95 * Math.PI / 180, a1 = 15 * Math.PI / 180, q = (a) => [cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1)];
    c.push(`<path d="M${pt(q(a0))}A${f(r - 1)} ${f(r - 1)} 0 0 1 ${pt(q(a1))}" ${RIM(0.8)} stroke-width="${f(Math.max(1.4, r * 0.13))}"/>`);
  };
  const cyl = (gx, gy, r, z0, z1, col, topCol) => {
    const s = c.cylSide(gx, gy, r, z0, z1);
    c.push(`<path d="${s.d}" fill="${hg(col)}"/><path d="${s.top}" fill="${topCol || lit(col, 0.3)}"/>`);
    c.push(`<path d="M${pt([s.c1[0] + s.rx - 0.8, s.c1[1]])}L${pt([s.c0[0] + s.rx - 0.8, s.c0[1]])}" ${RIM(0.7)} stroke-width="1.4"/>`);
    return s;
  };
  const soft = (cx, cy, rx, ry, o = 0.22) => c.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="#7d64c0" fill-opacity="${o}" filter="url(#lBlur)"/>`);
  const shadowAt = (gx, gy, r, z) => { const p = P(gx, gy, z); soft(p[0] - 2, p[1] + 1, Math.SQRT2 * 52 * S * r, Math.SQRT2 * 26 * S * r); };

  // ---------- guests: soft bell-shaped cloaks, round heads, a trailing scarf ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const u = (v) => f(v * k), X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), o = [];
    const top = seated ? -11 : -19, hem = seated ? 1 : -4.5, hy = top - 5.4;
    if (!seated) {
      o.push(`<ellipse cx="${X(0.4)}" cy="${Y(0.2)}" rx="${u(7)}" ry="${u(2.4)}" fill="#7d64c0" fill-opacity="0.28"/>`);
      o.push(`<path d="M${X(-2)},${Y(-5.5)}L${X(-2.6)},${Y(-0.6)}M${X(2.2)},${Y(-5.5)}L${X(3)},${Y(-0.9)}" stroke="${g.legs}" stroke-width="${u(2.6)}" stroke-linecap="round"/>`);
    }
    if (g.scarf) o.push(`<path d="M${X(-1)},${Y(top + 2)}C${X(-6)},${Y(top + 1)} ${X(-8)},${Y(top + 6)} ${X(-12)},${Y(top + 4)}" stroke="${g.scarf}" stroke-width="${u(2.4)}" fill="none" stroke-linecap="round"/>`);
    const bd = `M${X(-2.7)},${Y(top)}C${X(-4.4)},${Y(top + 5)} ${X(-7.2)},${Y(hem - 3)} ${X(-6.9)},${Y(hem)}Q${X(0)},${Y(hem + 2.6)} ${X(6.9)},${Y(hem)}C${X(7.2)},${Y(hem - 3)} ${X(4.4)},${Y(top + 5)} ${X(2.7)},${Y(top)}Q${X(0)},${Y(top - 1.7)} ${X(-2.7)},${Y(top)}Z`;
    o.push(`<path d="${bd}" fill="${hg(g.col)}"/>`);
    // rim light on the screen-right edge of body and head (sun behind, upper right)
    const rs = g.dir; // v * dir > 0 means screen right
    o.push(`<path d="M${X(2.9 * rs)},${Y(top + 0.6)}C${X(4.6 * rs)},${Y(top + 5)} ${X(7 * rs)},${Y(hem - 3)} ${X(6.6 * rs)},${Y(hem - 0.4)}" ${RIM(0.75)} stroke-width="${u(0.9)}"/>`);
    if (g.sash) o.push(`<path d="M${X(-3.5)},${Y(top + 3)}L${X(4.6)},${Y(top + 8.5)}" stroke="${g.sash}" stroke-width="${u(1.8)}" stroke-linecap="round"/>`);
    if (seated) o.push(`<path d="M${X(-3.4)},${Y(top + 2)}L${X(-6.5)},${Y(top - 6.5)}M${X(3.4)},${Y(top + 2)}L${X(6.5)},${Y(top - 6.5)}" stroke="${sh(g.col, 0.15)}" stroke-width="${u(2.4)}" stroke-linecap="round"/><circle cx="${X(-6.6)}" cy="${Y(top - 7)}" r="${u(1.5)}" fill="${g.skin}"/><circle cx="${X(6.6)}" cy="${Y(top - 7)}" r="${u(1.5)}" fill="${g.skin}"/>`);
    else o.push(`<path d="M${X(3.4)},${Y(top + 2.5)}Q${X(6.5)},${Y(top + 6)} ${X(6)},${Y(top + 9)}" stroke="${sh(g.col, 0.15)}" stroke-width="${u(2.3)}" fill="none" stroke-linecap="round"/><circle cx="${X(6)}" cy="${Y(top + 9.4)}" r="${u(1.3)}" fill="${g.skin}"/>`);
    if (g.parasol && !seated) o.push(`<path d="M${X(6)},${Y(top + 9)}L${X(8.5)},${Y(top - 15)}" stroke="${K.ink}" stroke-width="${u(0.8)}"/><path d="M${X(0)},${Y(top - 12)}Q${X(8.5)},${Y(top - 24)} ${X(17)},${Y(top - 12)}Q${X(14.2)},${Y(top - 10)} ${X(11.3)},${Y(top - 12)}Q${X(8.5)},${Y(top - 10)} ${X(5.7)},${Y(top - 12)}Q${X(2.8)},${Y(top - 10)} ${X(0)},${Y(top - 12)}Z" fill="${g.parasol}"/><path d="M${X(9)},${Y(top - 18)}Q${X(13)},${Y(top - 17)} ${X(15.5)},${Y(top - 13)}" ${RIM(0.8)} stroke-width="${u(0.8)}"/>`);
    if (g.balloon && !seated) { const bx = 9, by = top - 20; o.push(`<path d="M${X(6)},${Y(top + 9)}Q${X(10)},${Y(top - 4)} ${X(bx)},${Y(by + 4.5)}" stroke="${K.ink}" stroke-width="${u(0.6)}" fill="none"/><path d="M${X(bx)},${Y(by + 5)}C${X(bx - 7)},${Y(by - 1)} ${X(bx - 3.5)},${Y(by - 6.5)} ${X(bx)},${Y(by - 3)}C${X(bx + 3.5)},${Y(by - 6.5)} ${X(bx + 7)},${Y(by - 1)} ${X(bx)},${Y(by + 5)}Z" fill="${g.balloon}"/>`); }
    // head
    o.push(`<circle cx="${X(0)}" cy="${Y(hy)}" r="${u(5.6)}" fill="${rg(g.skin)}"/>`);
    if (g.hair === 'bob') o.push(`<path d="M${X(-5.9)},${Y(hy + 2.5)}C${X(-7)},${Y(hy - 8)} ${X(6.5)},${Y(hy - 9)} ${X(5.8)},${Y(hy - 1)}C${X(2)},${Y(hy - 4)} ${X(-2)},${Y(hy - 3)} ${X(-3.6)},${Y(hy + 0.5)}L${X(-3.8)},${Y(hy + 3.5)}Z" fill="${g.hairCol}"/>`);
    if (g.hair === 'bun') o.push(`<circle cx="${X(-3.2)}" cy="${Y(hy - 5.4)}" r="${u(2.8)}" fill="${g.hairCol}"/><path d="M${X(-5.8)},${Y(hy + 0.5)}C${X(-6)},${Y(hy - 7.5)} ${X(5.5)},${Y(hy - 8)} ${X(5.7)},${Y(hy - 1.5)}C${X(2)},${Y(hy - 4.2)} ${X(-2.5)},${Y(hy - 3.5)} ${X(-5.8)},${Y(hy + 0.5)}Z" fill="${g.hairCol}"/>`);
    if (g.hair === 'hood') o.push(`<path d="M${X(-6.4)},${Y(hy + 3)}C${X(-7.5)},${Y(hy - 6)} ${X(-2)},${Y(hy - 9)} ${X(2)},${Y(hy - 7.5)}C${X(-1)},${Y(hy - 11)} ${X(-6)},${Y(hy - 12)} ${X(-9)},${Y(hy - 10)}C${X(-5)},${Y(hy - 13)} ${X(4)},${Y(hy - 12)} ${X(6.3)},${Y(hy - 2)}C${X(3)},${Y(hy - 5)} ${X(-2)},${Y(hy - 4)} ${X(-3.6)},${Y(hy + 3)}Z" fill="${g.col}"/>`);
    if (g.hair === 'puff') o.push(`<circle cx="${X(-4)}" cy="${Y(hy - 3.5)}" r="${u(3.4)}" fill="${g.hairCol}"/><circle cx="${X(0.5)}" cy="${Y(hy - 5.6)}" r="${u(3.6)}" fill="${g.hairCol}"/><circle cx="${X(4.4)}" cy="${Y(hy - 3.8)}" r="${u(3)}" fill="${g.hairCol}"/>`);
    if (g.flower) o.push(`<circle cx="${X(-2)}" cy="${Y(hy - 5.2)}" r="${u(1.6)}" fill="${g.flower}"/><circle cx="${X(1.8)}" cy="${Y(hy - 5.8)}" r="${u(1.6)}" fill="${K.butter}"/>`);
    o.push(`<path d="M${X(3.6 * rs)},${Y(hy - 4)}A${u(5.3)} ${u(5.3)} 0 0 ${rs > 0 ? 1 : 0} ${X(5.3 * rs)},${Y(hy + 1.5)}" ${RIM(0.85)} stroke-width="${u(0.9)}"/>`);
    o.push(`<circle cx="${X(1.6)}" cy="${Y(hy + 0.6)}" r="${u(0.85)}" fill="${K.ink}"/><circle cx="${X(4.3)}" cy="${Y(hy + 0.6)}" r="${u(0.85)}" fill="${K.ink}"/><circle cx="${X(0.6)}" cy="${Y(hy + 2.8)}" r="${u(1.2)}" fill="#ff8fb0" fill-opacity="0.55"/>`);
    return o.join('');
  }
  const skins = ['#ffe0cc', '#f2bf9c', '#c98d6a', '#8e5a42'];
  const G = [
    { dir: 1, col: K.pink, legs: K.lav, skin: skins[0], hair: 'bob', hairCol: '#b07a64', scarf: K.mint, parasol: K.mint },
    { dir: -1, col: K.mint, legs: K.lav, skin: skins[2], hair: 'puff', hairCol: '#4a3248', balloon: K.rose },
    { dir: 1, col: K.lilac, legs: '#7f6ab8', skin: skins[1], hair: 'hood', hairCol: '#000', sash: K.butter },
    { dir: -1, col: K.butter, legs: '#d58aa8', skin: skins[3], hair: 'bun', hairCol: '#2e2030', scarf: K.rose, flower: K.rose },
    { dir: 1, col: K.sky, legs: K.lav, skin: skins[0], hair: 'puff', hairCol: '#e8b46a', sash: K.pink },
    { dir: -1, col: K.rose, legs: '#7f6ab8', skin: skins[2], hair: 'bob', hairCol: '#3a2630', parasol: K.butter },
  ];
  const GK = 1.32 * S;

  // ---------- islands ----------
  function island(gx, gy, R, Z, seed, hang) {
    const xy = blobPts(gx, gy, R, seed), top = xy.map((q) => P(q[0], q[1], Z)), lip = xy.map((q) => P(q[0], q[1], Z - 16));
    const xs = lip.map((p) => p[0]), iL = xs.indexOf(Math.min(...xs)), iR = xs.indexOf(Math.max(...xs));
    const arc = (a, b) => { const o = []; for (let i = a; ; i = (i + 1) % lip.length) { o.push(lip[i]); if (i === b) break; } return o; };
    const a1 = arc(iL, iR), a2 = arc(iR, iL), my = (a) => a.reduce((s, p) => s + p[1], 0) / a.length;
    const frontLR = my(a1) > my(a2) ? a1 : a2.slice().reverse();
    const pL = lip[iL], pR = lip[iR], w = pR[0] - pL[0], cy = Math.max(...lip.map((p) => p[1]));
    const tip = [(pL[0] + pR[0]) / 2 + w * 0.06, cy + hang];
    const curve = [pR, [pR[0] - w * 0.07, cy + hang * 0.22], [pR[0] - w * 0.24, cy + hang * 0.55], [tip[0] + w * 0.07, tip[1] - hang * 0.1], tip, [tip[0] - w * 0.11, tip[1] - hang * 0.24], [pL[0] + w * 0.2, cy + hang * 0.42], [pL[0] + w * 0.04, cy + hang * 0.16], pL];
    const under = `M${frontLR.map(pt).join('L')}` + smoothPath(curve).replace(/^M[^C]*/, '') + 'Z';
    const hid = c.id('lu'); c.def(`<clipPath id="${hid}"><path d="${under}"/></clipPath>`);
    // glow behind the island (sun is behind the park)
    c.push(`<ellipse cx="${f((pL[0] + pR[0]) / 2 + 10)}" cy="${f(cy - 10)}" rx="${f(w * 0.56)}" ry="${f(w * 0.3)}" fill="#ffffff" fill-opacity="0.35" filter="url(#lBlurWide)"/>`);
    c.push(`<path d="${under}" fill="${vg(K.rock, K.rockD)}"/>`);
    for (let i = 1; i <= 3; i++) c.push(`<path d="M${pt([pL[0] - 10, cy + hang * i * 0.2])}Q${pt([(pL[0] + pR[0]) / 2, cy + hang * i * 0.2 + 18])} ${pt([pR[0] + 10, cy + hang * i * 0.2 - 6])}" stroke="${lit(K.rock, 0.35)}" stroke-width="2.4" fill="none" stroke-opacity="0.55" clip-path="url(#${hid})"/>`);
    c.push(`<path d="${smoothPath(curve.slice(0, 4))}" ${RIM(0.6)} stroke-width="2.2"/>`);
    // hanging vines with leaves
    const r = rng(seed + 9);
    frontLR.forEach((p, i) => { if (i % 7 !== 3) return; const L = 22 + r() * 46; c.push(`<path d="M${pt(p)}c${f(-6 + r() * 4)},${f(L * 0.4)} ${f(6)},${f(L * 0.6)} 0,${f(L)}" stroke="${K.mintD}" stroke-width="1.6" fill="none"/><ellipse cx="${f(p[0] + 2)}" cy="${f(p[1] + L * 0.55)}" rx="3.2" ry="1.8" fill="${K.mint}"/><circle cx="${f(p[0])}" cy="${f(p[1] + L + 2)}" r="2.6" fill="${K.pink}"/>`); });
    c.push(`<path d="${poly(hull(top.concat(lip)))}" fill="${vg(K.soil, sh(K.soil, 0.3))}"/>`);
    c.push(`<path d="${smoothPath(top, true)}" fill="${c.og(`lg${K.mint}`, (id) => `<radialGradient id="${id}" cx="0.55" cy="0.42" r="0.6"><stop offset="0" stop-color="${lit(K.mint, 0.45)}"/><stop offset="1" stop-color="${K.mint}"/></radialGradient>`)}"/>`);
    // rim: the far (back) edge of the top catches the light
    const yc = (Math.min(...top.map((p) => p[1])) + Math.max(...top.map((p) => p[1]))) / 2;
    let run = []; const runs = [];
    top.concat(top.slice(0, 1)).forEach((p) => { if (p[1] < yc + 4) run.push(p); else if (run.length) { runs.push(run); run = []; } }); if (run.length) runs.push(run);
    runs.forEach((rr) => c.push(`<path d="${smoothPath(rr)}" ${RIM(0.9)} stroke-width="2.6"/>`));
    // flower specks
    for (let i = 0; i < R * 22; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * R * 0.86, p = P(gx + d * Math.cos(a), gy + d * Math.sin(a), Z); c.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(1 + r())}" fill="${[K.cream, K.pink, K.butter][i % 3]}" fill-opacity="0.9"/>`); }
    return { xy, top };
  }
  function cloud(cx, cy, w, op = 1, tint = '#efe4fb') {
    const puffs = [[-0.4, 0.04, 0.2], [-0.18, -0.1, 0.27], [0.1, -0.15, 0.3], [0.36, -0.02, 0.22], [0.0, 0.05, 0.28]];
    let s = `<g opacity="${op}"><ellipse cx="${f(cx)}" cy="${f(cy + w * 0.1)}" rx="${f(w * 0.56)}" ry="${f(w * 0.13)}" fill="${tint}"/>`;
    puffs.forEach(([x, y, r]) => { s += `<circle cx="${f(cx + x * w)}" cy="${f(cy + y * w)}" r="${f(r * w)}" fill="${vg('#ffffff', tint)}"/>`; });
    return s + '</g>';
  }
  function puffTree(x, y, z, cols, h = 34, rad = 15) {
    c.add(x + y, () => {
      shadowAt(x + 0.1, y + 0.05, 0.36, z);
      const b = P(x, y, z), t = P(x + 0.05, y - 0.05, z + h);
      c.push(`<path d="M${pt(b)}C${pt([b[0] - 6, b[1] - h * 0.4])} ${pt([t[0] + 7, t[1] + h * 0.45])} ${pt(t)}" stroke="#d9a7b5" stroke-width="${f(4.2 * S)}" fill="none" stroke-linecap="round"/>`);
      ball(t[0] - rad * 0.55, t[1] - rad * 0.2, rad * 0.75, cols[1]); ball(t[0] + rad * 0.6, t[1] - rad * 0.35, rad * 0.7, cols[2] || cols[1]); ball(t[0], t[1] - rad * 0.75, rad, cols[0]);
    });
  }
  function bridge(A, B, sag, guests = []) {
    const N = 14, at = (t, side, dz = 0) => { const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy), nx = -dy / l * 0.27 * side, ny = dx / l * 0.27 * side; return P(A[0] + dx * t + nx, A[1] + dy * t + ny, A[2] + (B[2] - A[2]) * t - sag * 4 * t * (1 - t) + dz); };
    const far = (A[0] - A[1] > B[0] - B[1]) ? 1 : -1; // which rope is behind
    const rope = (side, dz) => smoothPath(Array.from({ length: N + 1 }, (_, i) => at(i / N, side, dz - (dz ? -sag * 0.25 * 4 * (i / N) * (1 - i / N) : 0))));
    const backSide = [1, -1].sort((a, b) => { const pa = at(0.5, a), pb = at(0.5, b); return pa[1] - pb[1]; })[0];
    c.push(`<path d="${rope(backSide, 15)}" stroke="${K.rose}" stroke-width="1.8" fill="none"/>`);
    for (let i = 0; i <= N; i++) { const t = i / N; c.push(`<path d="M${pt(at(t, backSide, 15 + sag * 0.25 * 4 * t * (1 - t)))}L${pt(at(t, backSide))}" stroke="${K.rose}" stroke-width="0.9" stroke-opacity="0.8"/>`); }
    for (let i = 0; i <= N; i++) { const t = (i + 0.5) / (N + 1), a = at(t, -1), b = at(t, 1); c.push(`<path d="M${pt(a)}L${pt(b)}" stroke="${sh(K.peach, 0.25)}" stroke-width="${f(7 * S)}" stroke-linecap="round"/><path d="M${pt(a)}L${pt(b)}" stroke="${K.peach}" stroke-width="${f(4.6 * S)}" stroke-linecap="round" transform="translate(0,-1.2)"/>`); }
    guests.forEach(([t, g]) => { const p = at(t, 0); c.push(guest(p[0], p[1] - 1, g, GK)); });
    for (let i = 0; i <= N; i++) { const t = i / N; c.push(`<path d="M${pt(at(t, -backSide, 15 + sag * 0.25 * 4 * t * (1 - t)))}L${pt(at(t, -backSide))}" stroke="${K.rose}" stroke-width="0.9" stroke-opacity="0.8"/>`); }
    c.push(`<path d="${rope(-backSide, 15)}" stroke="${K.rose}" stroke-width="2" fill="none"/>`);
    for (const [E, s] of [[A, 1], [A, -1], [B, 1], [B, -1]]) { const d = Math.hypot(B[0] - A[0], B[1] - A[1]); const nx = -(B[1] - A[1]) / d * 0.27 * s, ny = (B[0] - A[0]) / d * 0.27 * s; const p0 = P(E[0] + nx, E[1] + ny, E[2]), p1 = P(E[0] + nx, E[1] + ny, E[2] + 20); c.push(`<path d="M${pt(p0)}L${pt(p1)}" stroke="#d9a7b5" stroke-width="4" stroke-linecap="round"/><circle cx="${f(p1[0])}" cy="${f(p1[1])}" r="3" fill="${K.pink}"/>`); }
  }

  // ---------- background: dawn sky, the sun behind the park, a cloud sea below ----------
  let bg = `<rect width="1600" height="1000" fill="url(#lSky)"/><circle cx="1280" cy="170" r="420" fill="url(#lSun)"/>`;
  const sr = rng(4);
  for (let i = 0; i < 26; i++) { const x = sr() * 1600, y = sr() * 520, s = 2 + sr() * 4; bg += `<path d="M${f(x)},${f(y - s)}Q${f(x)},${f(y)} ${f(x + s)},${f(y)}Q${f(x)},${f(y)} ${f(x)},${f(y + s)}Q${f(x)},${f(y)} ${f(x - s)},${f(y)}Q${f(x)},${f(y)} ${f(x)},${f(y - s)}Z" fill="#ffffff" fill-opacity="${f(0.5 + sr() * 0.4)}"/>`; }
  bg += cloud(260, 300, 220, 0.55) + cloud(1420, 420, 260, 0.6) + cloud(1050, 150, 150, 0.45);
  // distant islands
  bg += `<g opacity="0.45"><path d="M150,520q40,-14 80,0q-14,46 -40,60q-26,-20 -40,-60z" fill="${K.rock}"/><ellipse cx="190" cy="520" rx="40" ry="12" fill="${K.mint}"/><path d="M1440,250q30,-10 60,0q-10,32 -30,42q-20,-14 -30,-42z" fill="${K.rock}"/><ellipse cx="1470" cy="250" rx="30" ry="9" fill="${K.mint}"/></g>`;

  // ---------- scene ----------
  const I1 = { x: 3.2, y: 4.4, R: 2.7, Z: 0 }, I2 = { x: 7.6, y: 0.4, R: 2.2, Z: 46 }, I3 = { x: 7.0, y: 7.4, R: 1.35, Z: -30 };
  c.push(cloud(560, 640, 300, 0.7) + cloud(1180, 560, 260, 0.65));
  // tiny rock with a tree (back left)
  island(0.2, 0.6, 0.75, 70, 31, 70); puffTree(0.25, 0.6, 70, [K.pink, K.lilac, K.rose], 26, 13); c.flush();

  // --- I2: the vine coaster ---
  island(I2.x, I2.y, I2.R, I2.Z, 7, 150);
  const Z2 = I2.Z, cx2 = I2.x, cy2 = I2.y;
  const trk = Track([[-1.35, 1.25, 8], [-0.2, 1.55, 8], [0.95, 1.3, 12], [1.55, 0.5, 46], [1.45, -0.6, 96], [0.7, -1.45, 112], [-0.2, -1.5, 70], [-0.6, -0.6, 30], [-0.1, 0.0, 44], [-0.7, 0.35, 70], [-1.5, -0.2, 52], [-1.75, 0.65, 22]].map(([x, y, z]) => [cx2 + x, cy2 + y, Z2 + z]), 10, true);
  // station platform behind the front straight
  c.add(cx2 + cy2 + 0.4, () => {
    const s = c.slab(cx2 - 1.3, cx2 + 0.2, cy2 + 0.95, cy2 + 1.25, 0.12, Z2, Z2 + 6);
    c.push(`<path d="${poly(s.band)}" fill="${hg(K.cream)}"/><path d="${poly(s.top)}" fill="${lit(K.cream, 0.5)}"/>`);
  });
  // supports: curving vine stems with a leaf
  const tp = trk.pts;
  tp.forEach((p, i) => {
    if (i % 3 || p[2] < Z2 + 14) return;
    c.add(p[0] + p[1] - 0.05, () => {
      const a = P(p[0], p[1], Z2), b = P(p[0], p[1], p[2] - 3), m = [(a[0] + b[0]) / 2 + 7, (a[1] + b[1]) / 2];
      c.push(`<path d="M${pt(a)}Q${pt(m)} ${pt(b)}" stroke="${sh(K.mintD, 0.25)}" stroke-width="${f(4.4 * S)}" fill="none" stroke-linecap="round"/><path d="M${pt([a[0] + 1.5, a[1]])}Q${pt([m[0] + 1.6, m[1]])} ${pt([b[0] + 1.5, b[1]])}" ${RIM(0.6)} stroke-width="1"/>`);
      c.push(`<path d="M${pt([m[0] - 3, m[1]])}q-8,-6 -12,2q7,4 12,-2z" fill="${K.mint}"/>`);
    });
  });
  // track: segments sorted with everything else; a lilac spine, two white rails, petal ties
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.12, ny = dx / l * 0.12;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2, () => {
      c.push(`<path d="M${pt(P(p[0], p[1], p[2] - 4))}L${pt(P(q[0], q[1], q[2] - 4))}" stroke="${K.lav}" stroke-width="${f(5 * S)}" stroke-linecap="round"/>`);
      if (i % 2 === 0) c.push(`<path d="M${pt(P(p[0] + nx, p[1] + ny, p[2]))}L${pt(P(p[0] - nx, p[1] - ny, p[2]))}" stroke="${K.rose}" stroke-width="${f(2.6 * S)}" stroke-linecap="round"/>`);
      for (const s of [1, -1]) c.push(`<path d="M${pt(P(p[0] + nx * s, p[1] + ny * s, p[2]))}L${pt(P(q[0] + nx * s, q[1] + ny * s, q[2]))}" stroke="#ffffff" stroke-width="${f(2.4 * S)}" stroke-linecap="round"/>`);
    });
  }
  // seed-pod cars on the front straight, riders SEATED inside
  const RG = [G[1], G[3], G[0], G[4], G[5], G[2]];
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 0.35 + k * 0.62, 0.52, 0.42, 11, 2);
    c.add(car.depth + 0.3, () => {
      const col = [K.lilac, K.pink, K.mint][k];
      c.push(`<path d="${rp(car.top, 5)}" fill="${sh(col, 0.55)}"/>`);
      [-0.2, 0.2].map((u) => car.seat(u, 7)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...RG[(k * 2 + j) % 6], dir: car.dx - car.dy > 0 ? 1 : -1 }, GK * 0.92, true)); });
      car.sides.forEach((sd) => c.push(`<path d="${rp(sd.pts, 4)}" fill="${sd.n[0] > sd.n[1] ? col : sh(col, 0.3)}"/>`));
      c.push(`<path d="${rp(car.top, 5)}" fill="none" stroke="${lit(col, 0.5)}" stroke-width="1.6"/>`);
      const fr = car.sides.find((s) => s.front); if (fr) { const m = [(fr.pts[0][0] + fr.pts[2][0]) / 2, (fr.pts[0][1] + fr.pts[2][1]) / 2]; c.push(`<path d="M${pt([m[0] - 4, m[1] - 2])}q6,-8 10,0q-5,4 -10,0z" fill="${K.mintD}"/>`); }
    });
  });
  // queue guests on the station
  [[cx2 - 1.05, cy2 + 1.1, G[2]], [cx2 - 0.6, cy2 + 1.12, G[5]]].forEach(([x, y, g]) => c.add(x + y + 0.35, () => { const p = P(x, y, Z2 + 6); c.push(guest(p[0], p[1], g, GK)); }));
  puffTree(cx2 + 0.2, cy2 - 0.1, Z2, [K.lilac, K.pink, K.mint], 30, 15);
  c.flush();

  // --- I1: spinner, mushroom stall, paths ---
  island(I1.x, I1.y, I1.R, I1.Z, 3, 190);
  const B1a = [5.02, 2.78, 0], B1b = [6.02, 1.86, Z2];
  const path1 = ribbon(P, [[5.15, 2.7], [4.4, 3.55], [3.8, 4.35], [4.15, 5.2], [5.25, 5.95]], 0.62, 0.5);
  const path2 = ribbon(P, [[3.85, 4.38], [3.45, 4.5], [3.15, 4.62]], 0.5, 0.5);
  for (const pa of [path2, path1]) { c.push(`<path d="${smoothPath(pa.poly, true)}" fill="${K.cream}" stroke="${K.peach}" stroke-width="2.4"/>`); }
  for (const pa of [path1]) { const st = pa.mid.filter((_, i) => i % 3 === 1); st.forEach((m) => { const p = P(m[0], m[1], 0.5); c.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="7" ry="3.4" fill="${K.peach}" fill-opacity="0.55"/>`); }); }
  bridge(B1a, B1b, 10, [[0.55, G[3]]]);
  // flower-petal spinner: lily-pad base, stem, petal canopy, petal cups with seated riders
  const SP = { x: 2.25, y: 4.95 };
  c.add(SP.x + SP.y - 1.3, () => {
    shadowAt(SP.x, SP.y, 1.25, 0);
    const pad = (z) => Array.from({ length: 80 }, (_, i) => { const a = i / 80 * Math.PI * 2, r = 1.18 * (1 + 0.035 * Math.cos(a * 12)); return P(SP.x + r * Math.cos(a), SP.y + r * Math.sin(a), z); });
    const t = pad(7), b = pad(0);
    c.push(`<path d="${poly(hull(t.concat(b)))}" fill="${hg(K.mintD)}"/><path d="${smoothPath(t, true)}" fill="${c.og('lpad', (id) => `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.55"><stop offset="0" stop-color="${lit(K.mint, 0.5)}"/><stop offset="0.7" stop-color="${K.mint}"/><stop offset="1" stop-color="${K.mintD}"/></radialGradient>`)}"/>`);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.push(`<path d="M${pt(P(SP.x + 0.2 * Math.cos(a), SP.y + 0.2 * Math.sin(a), 7))}L${pt(P(SP.x + 1.05 * Math.cos(a), SP.y + 1.05 * Math.sin(a), 7))}" stroke="${lit(K.mint, 0.6)}" stroke-width="1.2" stroke-opacity="0.7"/>`); }
  });
  const cups = Array.from({ length: 5 }, (_, i) => { const a = i / 5 * Math.PI * 2 + 0.5; return { a, x: SP.x + 0.74 * Math.cos(a), y: SP.y + 0.74 * Math.sin(a), col: [K.pink, K.lilac, K.rose, K.butter, K.sky][i] }; });
  cups.forEach((cp, i) => c.add(cp.x + cp.y - 0.6, () => {
    const g = cupGeom(c, cp.x, cp.y, 0.27, 7, 21);
    // petal backrest on the outward side (behind the riders when the cup faces us)
    const out = [Math.cos(cp.a), Math.sin(cp.a)], back = out[0] + out[1] < 0 ? 1 : -1;
    const pb = P(cp.x - out[0] * 0.26 * back, cp.y - out[1] * 0.26 * back, 18);
    c.push(`<path d="M${pt([pb[0] - 11, pb[1] + 2])}C${pt([pb[0] - 14, pb[1] - 20])} ${pt([pb[0] - 2, pb[1] - 30])} ${pt([pb[0], pb[1] - 32])}C${pt([pb[0] + 2, pb[1] - 30])} ${pt([pb[0] + 14, pb[1] - 20])} ${pt([pb[0] + 11, pb[1] + 2])}Z" fill="${rg(cp.col)}" fill-opacity="0.95"/>`);
    c.push(`<path d="${g.d}" fill="${hg(cp.col)}"/><path d="${g.top}" fill="${sh(cp.col, 0.5)}"/>`);
    const s = P(cp.x, cp.y, 21 - 8);
    [[-4.5, G[(i + 1) % 6]], [5, G[(i + 3) % 6]]].forEach(([dx, gg], j) => c.push(guest(s[0] + dx, s[1] + (j ? 2 : -1), { ...gg, dir: j ? -1 : 1 }, GK * 0.9, true)));
    c.push(`<path d="${g.front}" fill="${hg(cp.col)}"/><path d="${g.rimFront}" stroke="${lit(cp.col, 0.6)}" stroke-width="2" fill="none"/>`);
    for (let k = 0; k < 7; k++) { const a = Math.PI * (k / 6); const q = [g.c1[0] + Math.cos(a) * g.rx, g.c1[1] + Math.sin(a) * g.ry]; c.push(`<circle cx="${f(q[0])}" cy="${f(q[1] + 1)}" r="2.4" fill="${lit(cp.col, 0.35)}"/>`); }
  }));
  c.add(SP.x + SP.y, () => cyl(SP.x, SP.y, 0.12, 7, 70, K.mintD));
  c.add(SP.x + SP.y + 2.5, () => {
    // petal canopy (drawn last: it is above everything on the ride)
    const petals = Array.from({ length: 9 }, (_, i) => i / 9 * Math.PI * 2 + 0.2).sort((a, b) => (Math.cos(a) + Math.sin(a)) - (Math.cos(b) + Math.sin(b)));
    petals.forEach((a, i) => {
      const pts = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12, rr = 0.12 + 1.0 * t, hw = 0.33 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.75); pts.push([rr, hw, 70 + 16 * t * t]); }
      const side = pts.map(([rr, hw, z]) => P(SP.x + rr * Math.cos(a) - hw * Math.sin(a), SP.y + rr * Math.sin(a) + hw * Math.cos(a), z));
      const other = pts.slice().reverse().map(([rr, hw, z]) => P(SP.x + rr * Math.cos(a) + hw * Math.sin(a), SP.y + rr * Math.sin(a) - hw * Math.cos(a), z));
      const col = i % 2 ? K.pink : K.lilac;
      c.push(`<path d="${smoothPath(side.concat(other), true)}" fill="${rg(col)}" stroke="${lit(col, 0.55)}" stroke-width="1.2"/>`);
      const mid = pts.map(([rr, , z]) => P(SP.x + rr * Math.cos(a), SP.y + rr * Math.sin(a), z));
      c.push(`<path d="${smoothPath(mid.slice(2, 11))}" stroke="${sh(col, 0.2)}" stroke-width="1" fill="none" stroke-opacity="0.6"/>`);
    });
    const ctr = P(SP.x, SP.y, 76); ball(ctr[0], ctr[1], 10 * S, K.butter);
  });
  // mushroom stall: cream stalk with a serving window, a spotted dome cap
  const MS = { x: 3.35, y: 3.0 };
  c.add(MS.x + MS.y, () => {
    shadowAt(MS.x, MS.y, 0.85, 0);
    const s = cyl(MS.x, MS.y, 0.4, 0, 56, K.cream, K.cream);
    const fx = s.c0[0], fy = s.c0[1] + s.ry;
    c.push(`<path d="${rp([[fx - 20, fy - 32], [fx + 12, fy - 32], [fx + 12, fy - 12], [fx - 20, fy - 12]], 7)}" fill="${K.ink}" fill-opacity="0.75"/><path d="M${f(fx - 23)},${f(fy - 11)}L${f(fx + 15)},${f(fy - 11)}" stroke="${K.rose}" stroke-width="3.4" stroke-linecap="round"/>`);
    c.push(`<path d="M${f(fx - 8)},${f(fy - 14)}l3,-9l3,9z" fill="${K.butter}"/><circle cx="${f(fx - 5)}" cy="${f(fy - 24)}" r="3.6" fill="${K.pink}"/><circle cx="${f(fx + 5)}" cy="${f(fy - 18)}" r="3" fill="${K.mint}"/>`);
    const b = P(MS.x, MS.y, 56), rx = Math.SQRT2 * 52 * S * 0.8, ry = rx / 2, H = 46;
    c.push(`<path d="M${pt([b[0] - rx, b[1]])}A${f(rx)} ${f(ry)} 0 0 0 ${pt([b[0] + rx, b[1]])}" stroke="${sh(K.cream, 0.15)}" stroke-width="7" fill="none" transform="translate(0,2)"/>`);
    c.push(`<path d="M${pt([b[0] - rx, b[1]])}A${f(rx)} ${f(H)} 0 0 1 ${pt([b[0] + rx, b[1]])}A${f(rx)} ${f(ry)} 0 0 1 ${pt([b[0] - rx, b[1]])}Z" fill="${rg(K.rose)}"/>`);
    [[-0.5, -0.45, 0.14], [0.08, -0.8, 0.12], [0.5, -0.38, 0.15], [-0.12, -0.2, 0.11], [-0.78, -0.05, 0.08], [0.3, 0.12, 0.1], [0.78, -0.1, 0.07]].forEach(([x, y, r]) => c.push(`<ellipse cx="${f(b[0] + x * rx)}" cy="${f(b[1] + y * H)}" rx="${f(r * rx)}" ry="${f(r * rx * 0.72)}" fill="${K.cream}" fill-opacity="0.95"/>`));
    c.push(`<path d="M${pt([b[0] + rx * 0.1, b[1] - H + 1.5])}A${f(rx - 1.5)} ${f(H - 1.5)} 0 0 1 ${pt([b[0] + rx - 1.5, b[1] - 2])}" ${RIM(0.9)} stroke-width="2.6"/>`);
  });
  puffTree(1.15, 3.55, 0, [K.pink, K.rose, K.lilac], 40, 18); puffTree(2.35, 2.35, 0, [K.mint, K.mintD, K.lilac], 30, 14); puffTree(2.95, 6.75, 0, [K.lilac, K.pink, K.mint], 34, 15);
  // guests on the paths
  [[4.75, 3.15, 0], [4.15, 3.95, 1], [3.95, 4.95, 4], [4.55, 5.5, 5], [3.35, 4.62, 2]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 0.5); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();

  // --- I3: a quiet terrace below the main island ---
  bridge([5.2, 5.95, 0.5], [6.05, 6.6, -30], 6, [[0.45, G[0]]]);
  island(I3.x, I3.y, I3.R, I3.Z, 12, 110);
  const Z3 = I3.Z;
  c.add(7.3 + 6.7, () => { // bell-flower lamp
    const b = P(7.25, 6.85, Z3), t = P(7.25, 6.85, Z3 + 50);
    c.push(`<path d="M${pt(b)}C${pt([b[0] + 2, b[1] - 30])} ${pt([t[0] - 8, t[1] + 4])} ${pt([t[0] + 6, t[1]])}" stroke="${K.mintD}" stroke-width="3" fill="none"/>`);
    c.push(`<circle cx="${f(t[0] + 9)}" cy="${f(t[1] + 14)}" r="14" fill="${K.butter}" fill-opacity="0.35" filter="url(#lBlur)"/><path d="M${f(t[0] + 1)},${f(t[1] + 12)}C${f(t[0] + 1)},${f(t[1] - 2)} ${f(t[0] + 17)},${f(t[1] - 2)} ${f(t[0] + 17)},${f(t[1] + 12)}Q${f(t[0] + 9)},${f(t[1] + 8)} ${f(t[0] + 1)},${f(t[1] + 12)}Z" fill="${rg(K.lilac)}"/><circle cx="${f(t[0] + 9)}" cy="${f(t[1] + 12)}" r="3" fill="${K.butter}"/>`);
  });
  c.add(6.8 + 7.75, () => { // bench: a soft cream curve
    const a = P(6.35, 7.8, Z3), b = P(7.15, 7.8, Z3);
    c.push(`<path d="M${pt([a[0], a[1] - 9])}L${pt([b[0], b[1] - 9])}" stroke="${K.peach}" stroke-width="7" stroke-linecap="round"/><path d="M${pt([a[0] + 4, a[1] - 6])}L${pt([a[0] + 4, a[1]])}M${pt([b[0] - 4, b[1] - 6])}L${pt([b[0] - 4, b[1]])}" stroke="${sh(K.peach, 0.3)}" stroke-width="3"/>`);
  });
  puffTree(7.7, 8.0, Z3, [K.pink, K.lilac, K.rose], 28, 13);
  [[6.45, 7.05, 4], [6.9, 7.35, 1]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, Z3); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();
  island(10.4, 4.6, 0.55, 10, 44, 60); c.flush();
  // cloud sea in front
  c.push(cloud(220, 900, 380, 0.95) + cloud(620, 960, 420, 0.95) + cloud(1040, 900, 380, 0.92) + cloud(1450, 950, 420, 0.95) + cloud(880, 800, 220, 0.75));

  const extraDefs = c.defs.join('') + `<linearGradient id="lSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9d7e8"/><stop offset="0.5" stop-color="#e3d4f6"/><stop offset="1" stop-color="#cfe9ef"/></linearGradient>
    <radialGradient id="lSun"><stop offset="0" stop-color="#fffbe9" stop-opacity="0.95"/><stop offset="0.35" stop-color="#ffeef4" stop-opacity="0.5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <filter id="lBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="lBlurWide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>`;
  let lu = ''; G.forEach((g, i) => { lu += guest(110 + i * 76, 1000 - 50, g, 2 * GK); });
  frame({
    key: 'l', letter: 'L', name: 'Sky islands', file: 'l-sky',
    blurb: ['The park floats on pastel islands tied together with rope', 'bridges, over a sea of cloud. Curvy, grown-not-built rides,', 'backlit: lilac shade and a thin white rim on every edge.'],
    pal: [K.pink, K.rose, K.lilac, K.mint, K.butter, K.cream, K.sky], ink: K.ink, sub: '#7a6aa6', panel: '#ffffffb8', panelInk: '#5a4785', panelR: 26, swatchR: 17,
    bg, scene: c.o.join('\n'), extraDefs, lineup: { svg: lu, w: 470 },
    note: ['Light from behind: rim line on the sun side.', 'Shade = mix toward lilac #8a74c8, never grey.', 'Soft gradients: sides, balls, petals, the sky.', 'Islands: blob top + hanging rock, cloud sea.', 'Cars and cups are tubs: riders sit inside.'],
  });
}

// ======================================================================
// M — Felt and stitch
// A plush park: every surface is felt, cut in panels with dashed stitch seams, padded so each panel
// puffs up (inner shadow at its lower edge, a soft light at its upper edge), buttons for details,
// yarn for rails and ropes, knitted posts. One fibre/fuzz filter over the whole scene.
// ======================================================================
function styleM() {
  const S = 1.1, c = Ctx(S, 800, 236), P = c.P;
  const K = { rust: '#c4573a', berry: '#b8456a', mustard: '#e0a43a', teal: '#3f8f8a', cream: '#f6e8cf', oat: '#e2c89e', tan: '#d2a874', moss: '#7f9a4a', olive: '#93ad58', sage: '#a7b971', leaf: '#6f8d3f', denim: '#4f6f9a', brown: '#7a4b2e', ink: '#3b2318', thread: '#fff3dc', plum: '#6d3f63', sky: '#7fb0c9' };
  const T = (col) => ({ top: col, left: shade(col, 0.88), right: shade(col, 0.74) });
  const PUFF = 'filter="url(#mPuff)"';
  const face = (pts, col, r = 7, extra = '') => c.push(`<path d="${rp(pts, r)}" fill="${col}" ${PUFF}${extra}/>`);
  const inset = (pts, d) => { const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length; return pts.map((p) => { const l = Math.hypot(cx - p[0], cy - p[1]) || 1; return [p[0] + (cx - p[0]) / l * d, p[1] + (cy - p[1]) / l * d]; }); };
  const DASH = (w = 1.3, col = K.thread, dash = '4 3') => `fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"`;
  const stitch = (pts, col = K.thread, d = 4.2, r = 6) => c.push(`<path d="${rp(inset(pts, d), r)}" ${DASH(1.3, col)} stroke-opacity="0.9"/>`);
  const yarn = (d, col, w) => `<path d="${d}" stroke="${shade(col, 0.7)}" stroke-width="${f(w + 1.6)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${col}" stroke-width="${f(w)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${light(col, 0.35)}" stroke-width="${f(w * 0.45)}" stroke-dasharray="${f(w * 0.55)} ${f(w * 0.75)}" fill="none" stroke-linecap="round"/>`;
  const knit = (a, b, col, w) => `<path d="M${pt(a)}L${pt(b)}" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" ${PUFF}/><path d="M${pt(a)}L${pt(b)}" stroke="${shade(col, 0.72)}" stroke-width="${f(w)}" stroke-dasharray="1.3 2.3" stroke-opacity="0.75"/><path d="M${pt([a[0] - w * 0.18, a[1]])}L${pt([b[0] - w * 0.18, b[1]])}" stroke="${light(col, 0.3)}" stroke-width="${f(w * 0.22)}" stroke-dasharray="1.3 2.3" stroke-opacity="0.8"/>`;
  const button = (cx, cy, r, col) => { let s = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${col}" stroke="${shade(col, 0.7)}" stroke-width="${f(r * 0.18)}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.66)}" fill="none" stroke="${shade(col, 0.82)}" stroke-width="${f(r * 0.1)}"/>`; for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) s += `<circle cx="${f(cx + dx * r * 0.26)}" cy="${f(cy + dy * r * 0.26)}" r="${f(r * 0.12)}" fill="${shade(col, 0.55)}"/>`; s += `<path d="M${f(cx - r * 0.26)},${f(cy - r * 0.26)}L${f(cx + r * 0.26)},${f(cy + r * 0.26)}M${f(cx + r * 0.26)},${f(cy - r * 0.26)}L${f(cx - r * 0.26)},${f(cy + r * 0.26)}" stroke="${K.thread}" stroke-width="${f(r * 0.1)}"/>`; c.push(s); };
  const box = (x0, x1, y0, y1, z0, z1, col, r = 7, st = true) => {
    const t = T(col), R = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], L = [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], Tp = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
    face(R, t.right, r); face(L, t.left, r); face(Tp, t.top, r);
    if (st) { stitch(Tp, K.thread, 3.6, 4); }
  };
  const cyl = (gx, gy, r, z0, z1, col, topCol) => {
    const s = c.cylSide(gx, gy, r, z0, z1), t = T(col);
    c.push(`<path d="${s.d}" fill="${c.split(t.left, t.right, s.c0[0] - s.rx, s.c0[0] + s.rx, s.c0[0] + s.rx * 0.3, s.rx * 0.5)}" ${PUFF}/><path d="${s.top}" fill="${topCol || t.top}" ${PUFF}/>`);
    return s;
  };
  const soft = (gx, gy, r, z = 0, o = 0.3) => { const p = P(gx, gy, z); c.push(`<ellipse cx="${f(p[0] + 3)}" cy="${f(p[1] + 3)}" rx="${f(Math.SQRT2 * 52 * S * r)}" ry="${f(Math.SQRT2 * 26 * S * r)}" fill="#4a2410" fill-opacity="${o}" filter="url(#mBlur)"/>`); };

  // ---------- plush-doll guests: big felt head, button eyes, yarn hair, a stitched seam ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const u = (v) => f(v * k), X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), o = [];
    const top = seated ? -12 : -20, bot = seated ? 2 : -4.5, hy = top - 7;
    if (!seated) {
      o.push(`<ellipse cx="${X(0.5)}" cy="${Y(0.4)}" rx="${u(7.5)}" ry="${u(2.8)}" fill="#4a2410" fill-opacity="0.3"/>`);
      o.push(`<rect x="${f(sx - 5 * k)}" y="${Y(-7)}" width="${u(4.4)}" height="${u(7.2)}" rx="${u(2.2)}" fill="${shade(g.pants, 0.85)}"/><rect x="${f(sx + 0.6 * k)}" y="${Y(-7)}" width="${u(4.4)}" height="${u(7.4)}" rx="${u(2.2)}" fill="${g.pants}"/>`);
    }
    const bd = `M${X(-4)},${Y(top)}C${X(-7.5)},${Y(top + 2)} ${X(-7.8)},${Y(bot - 1)} ${X(-5.5)},${Y(bot)}L${X(5.5)},${Y(bot)}C${X(7.8)},${Y(bot - 1)} ${X(7.5)},${Y(top + 2)} ${X(4)},${Y(top)}Z`;
    if (!seated) o.push(`<path d="M${X(-5.6)},${Y(top + 2.5)}q${u(-3.2 * g.dir)},${u(3)} ${u(-2.4 * g.dir)},${u(7.5)}" stroke="${shade(g.shirt, 0.8)}" stroke-width="${u(3.6)}" fill="none" stroke-linecap="round"/>`);
    o.push(`<path d="${bd}" fill="${g.shirt}"/>`);
    if (g.patch) o.push(`<rect x="${f(sx + (g.dir > 0 ? -4.2 : 0.6) * k)}" y="${Y(top + 4.5)}" width="${u(3.6)}" height="${u(3.6)}" rx="${u(0.6)}" fill="${g.patch}" stroke="${K.thread}" stroke-width="${u(0.35)}" stroke-dasharray="${u(0.8)} ${u(0.6)}"/>`);
    o.push(`<path d="M${X(0.6)},${Y(top + 1)}L${X(0.6)},${Y(bot - 0.5)}" ${DASH(f(0.45 * k), K.thread, `${u(1.1)} ${u(0.9)}`)}/>`);
    if (g.overalls) o.push(`<path d="M${X(-5.6)},${Y(bot - 5)}L${X(5.6)},${Y(bot - 5)}L${X(5.5)},${Y(bot)}L${X(-5.5)},${Y(bot)}Z" fill="${g.pants}"/><path d="M${X(-3)},${Y(top + 0.5)}L${X(-3)},${Y(bot - 5)}M${X(3.4)},${Y(top + 0.5)}L${X(3.4)},${Y(bot - 5)}" stroke="${g.pants}" stroke-width="${u(1.6)}"/>`);
    if (seated) o.push(`<path d="M${X(-5)},${Y(top + 2)}L${X(-8)},${Y(top - 6)}M${X(5)},${Y(top + 2)}L${X(8)},${Y(top - 6)}" stroke="${shade(g.shirt, 0.86)}" stroke-width="${u(3.4)}" stroke-linecap="round"/><circle cx="${X(-8.2)}" cy="${Y(top - 6.6)}" r="${u(1.9)}" fill="${g.skin}"/><circle cx="${X(8.2)}" cy="${Y(top - 6.6)}" r="${u(1.9)}" fill="${g.skin}"/>`);
    else o.push(`<path d="M${X(5.6)},${Y(top + 2.5)}q${u(3 * g.dir)},${u(3)} ${u(2.2 * g.dir)},${u(7.5)}" stroke="${g.shirt}" stroke-width="${u(3.6)}" fill="none" stroke-linecap="round"/><circle cx="${X(7.8)}" cy="${Y(top + 10.4)}" r="${u(1.9)}" fill="${g.skin}"/>`);
    if (g.balloon && !seated) o.push(`<path d="M${X(7.8)},${Y(top + 10)}C${X(11)},${Y(top)} ${X(8)},${Y(top - 12)} ${X(10)},${Y(top - 20)}" ${DASH(f(0.7 * k), K.ink, `${u(1)} ${u(0.8)}`)}/><circle cx="${X(10)}" cy="${Y(top - 25)}" r="${u(5.4)}" fill="${g.balloon}"/><path d="M${X(10)},${Y(top - 30.4)}L${X(10)},${Y(top - 19.6)}" ${DASH(f(0.5 * k), K.thread, `${u(1)} ${u(0.8)}`)}/>`);
    // head: a felt ball, button eyes, stitched smile
    o.push(`<circle cx="${X(0)}" cy="${Y(hy)}" r="${u(7.4)}" fill="${g.skin}"/>`);
    if (g.hair === 'loops') { let d = ''; for (let i = 0; i < 6; i++) { const a = Math.PI * (1.05 + i * 0.18); d += `<circle cx="${X(Math.cos(a) * 6.6)}" cy="${Y(hy + Math.sin(a) * 6.6)}" r="${u(2.5)}" fill="none" stroke="${g.hairCol}" stroke-width="${u(1.5)}"/>`; } o.push(d); }
    if (g.hair === 'cap') o.push(`<path d="M${X(-7.6)},${Y(hy - 0.5)}C${X(-7.8)},${Y(hy - 10.5)} ${X(7.8)},${Y(hy - 10.5)} ${X(7.6)},${Y(hy - 0.5)}L${X(11)},${Y(hy - 0.8)}L${X(7.4)},${Y(hy - 2.4)}C${X(3)},${Y(hy - 4)} ${X(-3)},${Y(hy - 4)} ${X(-7.6)},${Y(hy - 0.5)}Z" fill="${g.hairCol}"/>${''}`);
    if (g.hair === 'braids') o.push(`<path d="M${X(-7.4)},${Y(hy + 1)}C${X(-8)},${Y(hy - 10)} ${X(8)},${Y(hy - 10)} ${X(7.4)},${Y(hy + 1)}C${X(4)},${Y(hy - 3.5)} ${X(-4)},${Y(hy - 3.5)} ${X(-7.4)},${Y(hy + 1)}Z" fill="${g.hairCol}"/><path d="M${X(-7)},${Y(hy)}L${X(-8)},${Y(hy + 9)}" ${DASH(f(2.6 * k), g.hairCol, `${u(1.6)} ${u(0.6)}`)}/>`);
    if (g.hair === 'beanie') o.push(`<path d="M${X(-7.6)},${Y(hy - 1)}C${X(-7.8)},${Y(hy - 11)} ${X(7.8)},${Y(hy - 11)} ${X(7.6)},${Y(hy - 1)}Z" fill="${g.hairCol}"/><rect x="${f(sx - 7.8 * k)}" y="${Y(hy - 2.8)}" width="${u(15.6)}" height="${u(2.8)}" rx="${u(1.4)}" fill="${shade(g.hairCol, 0.82)}"/><circle cx="${X(0)}" cy="${Y(hy - 10.4)}" r="${u(2.6)}" fill="${K.cream}"/>`);
    o.push(`<circle cx="${X(1.4)}" cy="${Y(hy + 0.8)}" r="${u(1.45)}" fill="${K.ink}"/><circle cx="${X(5)}" cy="${Y(hy + 0.8)}" r="${u(1.45)}" fill="${K.ink}"/><circle cx="${X(1.0)}" cy="${Y(hy + 0.3)}" r="${u(0.45)}" fill="#ffffff"/><circle cx="${X(4.6)}" cy="${Y(hy + 0.3)}" r="${u(0.45)}" fill="#ffffff"/>`);
    o.push(`<path d="M${X(1.6)},${Y(hy + 3.6)}q${u(1.6 * g.dir)},${u(1.6)} ${u(3.2 * g.dir)},0" fill="none" stroke="${K.ink}" stroke-width="${u(0.6)}" stroke-dasharray="${u(0.8)} ${u(0.5)}"/><circle cx="${X(-2.2)}" cy="${Y(hy + 3)}" r="${u(1.5)}" fill="#e2766d" fill-opacity="0.45"/>`);
    return `<g filter="url(#mPuffS)">${o.join('')}</g>`;
  }
  const skins = ['#f4cfae', '#e1aa80', '#b57a52', '#7b4f35'];
  const G = [
    { dir: 1, shirt: K.mustard, pants: K.denim, skin: skins[0], hair: 'loops', hairCol: K.rust, patch: K.teal },
    { dir: -1, shirt: K.teal, pants: K.brown, skin: skins[2], hair: 'beanie', hairCol: K.berry, balloon: K.rust },
    { dir: 1, shirt: K.berry, pants: K.oat, skin: skins[1], hair: 'braids', hairCol: '#4a2a1c', overalls: true },
    { dir: -1, shirt: K.cream, pants: K.rust, skin: skins[3], hair: 'cap', hairCol: K.teal, patch: K.mustard },
    { dir: 1, shirt: K.rust, pants: K.teal, skin: skins[0], hair: 'beanie', hairCol: K.mustard },
    { dir: -1, shirt: K.sky, pants: K.denim, skin: skins[2], hair: 'loops', hairCol: '#2c1a12', overalls: true },
  ];
  const GK = 1.18 * S;

  // ---------- the cushion: a padded patchwork board ----------
  const BX = 9, BY = 8, TOPZ = 0;
  soft(4.6, 4.2, 5.2, -34, 0.12);
  const sl = c.slab(0, BX, 0, BY, 0.45, -34, TOPZ);
  c.push(`<path d="${poly(sl.band)}" fill="${c.split(K.berry, shade(K.berry, 0.78), sl.xa, sl.xb, sl.xf, 30)}" ${PUFF}/>`);
  c.push(`<path d="${smoothPath(sl.bot.map((p) => [p[0], p[1] - 9]).slice(Math.floor(sl.bot.length * 0.22), Math.floor(sl.bot.length * 0.78)))}" ${DASH(1.5)}/>`);
  const pc = [K.olive, K.sage, K.moss, '#a0b45f', '#86a14e', '#b2bf78'];
  const pr = rng(5);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const x0 = i * 1.5, x1 = x0 + 1.5, y0 = j * 2, y1 = y0 + 2, q = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
    face(q, pc[Math.floor(pr() * pc.length)], 8); stitch(q, K.thread, 5, 5);
    if (pr() < 0.45) { const p = P(x0 + 0.4 + pr() * 0.7, y0 + 0.5 + pr() * 1.0); c.push(`<path d="M${f(p[0] - 4)},${f(p[1])}l4,-2l4,2l-4,2z" fill="${K.cream}" fill-opacity="0.5"/>`); }
  }
  // piping cord around the top edge
  c.push(`<path d="${smoothPath(sl.top, true)}" stroke="${K.mustard}" stroke-width="7" fill="none" ${PUFF}/><path d="${smoothPath(sl.top, true)}" stroke="${shade(K.mustard, 0.7)}" stroke-width="7" fill="none" stroke-dasharray="2 4"/>`);
  // pond: blue felt with stitched ripples and lily pads
  const pond = blobPts(1.55, 6.35, 1.05, 21, 60, 0.6).map((q) => P(q[0], q[1], 0));
  c.push(`<path d="${smoothPath(pond, true)}" fill="${K.sky}" ${PUFF}/>`);
  for (const r of [0.35, 0.62]) c.push(`<path d="${smoothPath(c.circ(1.65, 6.4, r, 0, 30), true)}" ${DASH(1.2, '#e6f2f6', '3 3')}/>`);
  for (const [x, y] of [[1.0, 6.0], [2.05, 6.85]]) { const p = P(x, y); c.push(`<path d="M${f(p[0])},${f(p[1])}m-11,0a11,5.5 0 1 0 22,0a11,5.5 0 1 0 -22,0z" fill="${K.leaf}" ${PUFF}/><path d="M${f(p[0])},${f(p[1])}l10,-2" stroke="${K.sky}" stroke-width="2"/>`); }
  // paths: oat felt strips with stitching down both sides
  const strips = [ribbon(P, [[0.1, 3.55], [3.0, 3.55], [6.0, 3.55], [8.9, 3.55]], 0.95, 0.5, 4), ribbon(P, [[4.55, 3.6], [4.55, 5.5], [4.55, 7.9]], 0.95, 0.5, 4), ribbon(P, [[4.6, 5.65], [5.4, 5.65]], 0.8, 0.5, 4)];
  strips.forEach((sp) => { c.push(`<path d="${poly(sp.poly)}" fill="${K.oat}" ${PUFF}/>`); });
  strips.forEach((sp, i) => { const inner = ribbon(P, i === 0 ? [[0.25, 3.55], [8.75, 3.55]] : i === 1 ? [[4.55, 4.1], [4.55, 7.75]] : [[4.6, 5.65], [5.4, 5.65]], 0.68, 0.5, 4); c.push(`<path d="${line(inner.L)}" ${DASH(1.3, K.brown, '4 3')} stroke-opacity="0.65"/><path d="${line(inner.R)}" ${DASH(1.3, K.brown, '4 3')} stroke-opacity="0.65"/>`); });

  // ---------- coaster: yarn rails on knitted posts, pillow cars ----------
  const C0 = { x: 7.05, y: 1.55 };
  const trk = Track([[-1.5, 1.05, 10], [0.0, 1.15, 10], [1.25, 0.95, 16], [1.6, 0.1, 56], [1.25, -0.85, 116], [0.25, -1.1, 126], [-0.7, -0.95, 70], [-1.2, -0.3, 30], [-1.65, 0.45, 40]].map(([x, y, z]) => [C0.x + x, C0.y + y, z]), 10, true);
  const tp = trk.pts;
  tp.forEach((p, i) => { if (i % 4 || p[2] < 16) return; c.add(p[0] + p[1] - 0.04, () => { soft(p[0], p[1], 0.12, 0, 0.3); c.push(knit(P(p[0], p[1], 0), P(p[0], p[1], p[2] - 5), K.mustard, 7.5 * S)); }); });
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.13, ny = dx / l * 0.13;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2, () => {
      if (i % 2 === 0) { const a = P(p[0] + nx * 1.4, p[1] + ny * 1.4, p[2] - 2), b = P(p[0] - nx * 1.4, p[1] - ny * 1.4, p[2] - 2); c.push(`<path d="M${pt(a)}L${pt(b)}" stroke="${K.tan}" stroke-width="${f(4 * S)}" stroke-linecap="round"/>`); }
      for (const s of [1, -1]) c.push(yarn(`M${pt(P(p[0] + nx * s, p[1] + ny * s, p[2]))}L${pt(P(q[0] + nx * s, q[1] + ny * s, q[2]))}`, K.rust, 3.4 * S));
    });
  }
  // station: a quilted platform
  c.add(C0.x + C0.y + 0.6, () => box(C0.x - 1.45, C0.x + 0.15, C0.y + 1.3, C0.y + 1.75, 0, 8, K.mustard, 5));
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 0.3 + k * 0.6, 0.5, 0.44, 12, 2);
    const col = [K.teal, K.berry, K.mustard][k];
    c.add(car.depth + 0.2, () => {
      c.push(`<path d="${rp(car.top, 6)}" fill="${shade(col, 0.55)}"/>`);
      [-0.2, 0.2].map((u) => car.seat(u, 8)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j + 1) % 6], dir: 1 }, GK * 0.85, true)); });
      car.sides.forEach((sd) => { face(sd.pts, sd.n[0] > sd.n[1] ? shade(col, 0.78) : shade(col, 0.92), 6); stitch(sd.pts, K.thread, 3, 3); });
      c.push(`<path d="${rp(car.top, 6)}" stroke="${light(col, 0.3)}" stroke-width="3" fill="none" ${PUFF}/>`);
      const fr = car.sides.find((s) => s.front) || car.sides[0]; const m = [(fr.pts[0][0] + fr.pts[2][0]) / 2, (fr.pts[0][1] + fr.pts[2][1]) / 2]; button(m[0], m[1], 3.4, K.cream);
    });
  });
  [[C0.x - 1.1, C0.y + 1.55], [C0.x - 0.65, C0.y + 1.55]].forEach(([x, y], i) => c.add(x + y + 0.7, () => { const p = P(x, y, 8); c.push(guest(p[0], p[1], G[[3, 4][i]], GK)); }));

  // ---------- octopus spinner: a plush octopus swinging felt cups on yarn arms ----------
  const OC = { x: 2.25, y: 1.75 };
  c.add(OC.x + OC.y - 1.4, () => {
    soft(OC.x, OC.y, 1.35, 0, 0.3);
    const s = c.slab(OC.x - 1.3, OC.x + 1.3, OC.y - 1.3, OC.y + 1.3, 1.3, 0, 9);
    c.push(`<path d="${poly(s.band)}" fill="${c.split(K.teal, shade(K.teal, 0.75), s.xa, s.xb, s.xf, 20)}" ${PUFF}/><path d="${poly(s.top)}" fill="${K.cream}" ${PUFF}/>`);
    c.push(`<path d="${smoothPath(c.circ(OC.x, OC.y, 1.12, 9, 60), true)}" ${DASH(1.4, K.rust, '5 3')}/>`);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.push(`<path d="M${pt(P(OC.x + 0.62 * Math.cos(a), OC.y + 0.62 * Math.sin(a), 9))}L${pt(P(OC.x + 1.08 * Math.cos(a), OC.y + 1.08 * Math.sin(a), 9))}" stroke="${i % 2 ? K.mustard : K.oat}" stroke-width="3" stroke-linecap="round"/>`); }
  });
  const cups = Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 + 0.3; return { a, x: OC.x + 0.98 * Math.cos(a), y: OC.y + 0.98 * Math.sin(a), col: [K.mustard, K.teal, K.rust, K.sky, K.berry, K.olive][i] }; });
  const arm = (cp) => { const a0 = P(OC.x + 0.4 * Math.cos(cp.a), OC.y + 0.4 * Math.sin(cp.a), 22), m = P(OC.x + 0.8 * Math.cos(cp.a + 0.35), OC.y + 0.8 * Math.sin(cp.a + 0.35), 40), e = P(cp.x, cp.y, 30); c.push(yarn(`M${pt(a0)}Q${pt(m)} ${pt(e)}`, K.berry, 5 * S)); };
  cups.forEach((cp, i) => c.add(cp.x + cp.y - 0.5, () => {
    arm(cp);
    const g = cupGeom(c, cp.x, cp.y, 0.27, 14, 30), t = T(cp.col);
    c.push(`<path d="${g.d}" fill="${c.split(t.left, t.right, g.c0[0] - g.rx, g.c0[0] + g.rx, g.c0[0] + g.rx * 0.3, g.rx * 0.5)}" ${PUFF}/><path d="${g.top}" fill="${shade(cp.col, 0.5)}"/>`);
    const s = P(cp.x, cp.y, 30 - 9);
    [[-4.5, (i + 1) % 6, 1], [4.5, (i + 4) % 6, -1]].forEach(([dx, gi, dir]) => c.push(guest(s[0] + dx, s[1] + (dir > 0 ? -1 : 1.5), { ...G[gi], dir }, GK * 0.82, true)));
    c.push(`<path d="${g.front}" fill="${c.split(t.left, t.right, g.c0[0] - g.rx, g.c0[0] + g.rx, g.c0[0] + g.rx * 0.3, g.rx * 0.5)}" ${PUFF}/><path d="${g.rimFront}" stroke="${light(cp.col, 0.35)}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
    c.push(`<path d="M${pt([g.c0[0] - g.rx + 3, g.c0[1] - 7])}A${f(g.rx - 3)} ${f(g.ry - 1.5)} 0 0 0 ${pt([g.c0[0] + g.rx - 3, g.c0[1] - 7])}" ${DASH(1.2)}/>`);
  }));
  c.add(OC.x + OC.y, () => {
    // body: a felt dome with button eyes and a stitched smile
    const b = P(OC.x, OC.y, 12), rx = Math.SQRT2 * 52 * S * 0.5, ry = rx / 2, H = 66;
    c.push(`<path d="M${pt([b[0] - rx, b[1]])}C${pt([b[0] - rx * 1.15, b[1] - H * 0.7])} ${pt([b[0] - rx * 0.7, b[1] - H * 1.12])} ${pt([b[0], b[1] - H])}C${pt([b[0] + rx * 0.7, b[1] - H * 1.12])} ${pt([b[0] + rx * 1.15, b[1] - H * 0.7])} ${pt([b[0] + rx, b[1]])}A${f(rx)} ${f(ry)} 0 0 1 ${pt([b[0] - rx, b[1]])}Z" fill="${c.split(K.berry, shade(K.berry, 0.78), b[0] - rx, b[0] + rx, b[0] + rx * 0.25, rx * 0.5)}" ${PUFF}/>`);
    c.push(`<path d="M${pt([b[0] + 2, b[1] - H + 3])}C${pt([b[0] - rx * 0.2, b[1] - H * 0.5])} ${pt([b[0] - rx * 0.1, b[1] - H * 0.2])} ${pt([b[0] + 2, b[1] + ry - 3])}" ${DASH(1.3)}/>`);
    button(b[0] - rx * 0.36, b[1] - H * 0.42, 6.4, K.cream); button(b[0] + rx * 0.36, b[1] - H * 0.42, 6.4, K.cream);
    c.push(`<circle cx="${f(b[0] - rx * 0.36)}" cy="${f(b[1] - H * 0.42)}" r="2.6" fill="${K.ink}"/><circle cx="${f(b[0] + rx * 0.36)}" cy="${f(b[1] - H * 0.42)}" r="2.6" fill="${K.ink}"/>`);
    c.push(`<path d="M${f(b[0] - 9)},${f(b[1] - H * 0.22)}q9,7 18,0" ${DASH(1.6, K.ink, '2.5 2')}/><circle cx="${f(b[0] - rx * 0.62)}" cy="${f(b[1] - H * 0.26)}" r="4" fill="#f08a8a" fill-opacity="0.6"/><circle cx="${f(b[0] + rx * 0.62)}" cy="${f(b[1] - H * 0.26)}" r="4" fill="#f08a8a" fill-opacity="0.6"/>`);
  });
  // front cups' arms must reach over the body: draw them again in front
  cups.filter((cp) => Math.cos(cp.a) + Math.sin(cp.a) > 0.2).forEach((cp) => c.add(OC.x + OC.y + 0.02, () => arm(cp)));

  // ---------- cupcake stall: pleated wrapper, frosting dome, a button cherry ----------
  const CS = { x: 6.0, y: 5.4 };
  c.add(CS.x + CS.y, () => {
    soft(CS.x, CS.y, 0.75, 0, 0.32);
    const s = cyl(CS.x, CS.y, 0.55, 0, 34, K.mustard, K.mustard);
    for (let i = 1; i < 10; i++) { const a = Math.PI * (i / 10); const x = s.c0[0] - Math.cos(a) * s.rx, y0 = s.c0[1] + Math.sin(a) * s.ry, y1 = s.c1[1] + Math.sin(a) * s.ry; c.push(`<path d="M${f(x)},${f(y0 - 2)}L${f(x)},${f(y1 + 2)}" ${DASH(1.1, shade(K.mustard, 0.65), '3 2.5')}/>`); }
    const fx = s.c0[0] - 4, fy = s.c0[1] + s.ry;
    c.push(`<path d="${rp([[fx - 18, fy - 30], [fx + 16, fy - 30], [fx + 16, fy - 12], [fx - 18, fy - 12]], 6)}" fill="${K.ink}" fill-opacity="0.85"/><path d="M${f(fx - 21)},${f(fy - 11)}L${f(fx + 19)},${f(fy - 11)}" stroke="${K.cream}" stroke-width="4" stroke-linecap="round" ${PUFF}/>`);
    c.push(`<circle cx="${f(fx - 7)}" cy="${f(fy - 16)}" r="3.4" fill="${K.berry}"/><circle cx="${f(fx + 4)}" cy="${f(fy - 16)}" r="3.4" fill="${K.teal}"/>`);
    // frosting: three stacked puffs
    [[34, 0.62, 10], [44, 0.48, 10], [54, 0.3, 9]].forEach(([z, r, h]) => { const b = P(CS.x, CS.y, z), rx = Math.SQRT2 * 52 * S * r, ry = rx / 2; c.push(`<path d="M${pt([b[0] - rx, b[1]])}C${pt([b[0] - rx, b[1] - h - ry * 1.3])} ${pt([b[0] + rx, b[1] - h - ry * 1.3])} ${pt([b[0] + rx, b[1]])}A${f(rx)} ${f(ry)} 0 0 1 ${pt([b[0] - rx, b[1]])}Z" fill="${c.split('#f6c4cf', '#e6a2b4', b[0] - rx, b[0] + rx, b[0] + rx * 0.2, rx * 0.4)}" ${PUFF}/>`); });
    const sr = rng(77); for (let i = 0; i < 14; i++) { const b = P(CS.x, CS.y, 40 + sr() * 16); const x = b[0] + (sr() - 0.5) * 60, y = b[1] - sr() * 10; c.push(`<path d="M${f(x)},${f(y)}l${f(3 * Math.cos(i))},${f(3 * Math.sin(i))}" stroke="${[K.teal, K.mustard, K.cream, K.sky][i % 4]}" stroke-width="2.4" stroke-linecap="round"/>`); }
    const tp2 = P(CS.x, CS.y, 74); button(tp2[0], tp2[1], 7.5, '#d0332f');
  });

  // ---------- felt trees, spool lamps, a bench ----------
  const tree = (x, y, col, h = 30, r = 15) => c.add(x + y, () => {
    soft(x, y, 0.35, 0, 0.3);
    const b = P(x, y, 0), t = P(x, y, h);
    c.push(`<path d="M${pt(b)}L${pt(t)}" stroke="${K.brown}" stroke-width="${f(5.5 * S)}" stroke-linecap="round" ${PUFF}/><path d="M${pt([b[0] - 3, b[1] - 3])}L${pt([b[0] + 3, b[1] - 9])}M${pt([b[0] - 3, b[1] - 12])}L${pt([b[0] + 3, b[1] - 18])}" ${DASH(1, K.thread, '2 2')}/>`);
    c.push(`<ellipse cx="${f(t[0] - r * 0.55)}" cy="${f(t[1] - r * 0.3)}" rx="${f(r * 0.8)}" ry="${f(r * 0.72)}" fill="${shade(col, 0.82)}" ${PUFF}/><ellipse cx="${f(t[0] + r * 0.4)}" cy="${f(t[1] - r * 0.85)}" rx="${f(r)}" ry="${f(r * 0.86)}" fill="${col}" ${PUFF}/>`);
    c.push(`<path d="M${f(t[0] + r * 0.4)},${f(t[1] - r * 0.1)}L${f(t[0] + r * 0.4)},${f(t[1] - r * 1.5)}M${f(t[0] + r * 0.4)},${f(t[1] - r * 0.7)}l${f(r * 0.4)},${f(-r * 0.35)}M${f(t[0] + r * 0.4)},${f(t[1] - r * 0.45)}l${f(-r * 0.4)},${f(-r * 0.35)}" ${DASH(1.2, light(col, 0.5), '2.5 2')}/>`);
    button(t[0] + r * 0.9, t[1] - r * 0.4, 3.2, '#d0332f'); button(t[0] - r * 0.7, t[1] - r * 0.2, 2.8, K.mustard);
  });
  const pine = (x, y, h = 52) => c.add(x + y, () => {
    soft(x, y, 0.3, 0, 0.3);
    const b = P(x, y, 0);
    [[0, 26, h * 0.5], [h * 0.3, 20, h * 0.42], [h * 0.58, 13, h * 0.42]].forEach(([z, w, hh], i) => { const yb = b[1] - z - 4; c.push(`<path d="${rp([[b[0] - w, yb], [b[0], yb - hh], [b[0] + w, yb]], 5)}" fill="${i % 2 ? K.leaf : shade(K.leaf, 0.9)}" ${PUFF}/><path d="M${f(b[0] - w + 6)},${f(yb - 4)}L${f(b[0] + w - 6)},${f(yb - 4)}" ${DASH(1.1)}/>`); });
  });
  tree(0.7, 4.6, K.olive, 30, 16); tree(3.4, 0.5, '#9bb85a', 26, 14); tree(8.3, 5.0, K.moss, 32, 17); tree(3.3, 7.1, '#a4b864', 26, 14);
  pine(0.5, 0.6, 60); pine(0.9, 2.9, 46); pine(8.6, 7.4, 56); pine(6.9, 7.3, 44);
  const spool = (x, y) => c.add(x + y, () => {
    soft(x, y, 0.16, 0, 0.3);
    const b = P(x, y, 0), t = P(x, y, 46);
    c.push(knit(b, [t[0], t[1] + 6], K.brown, 4));
    cyl(x, y, 0.14, 40, 44, K.oat); cyl(x, y, 0.1, 44, 52, K.teal); cyl(x, y, 0.14, 52, 56, K.oat);
    const g = P(x, y, 62); c.push(`<circle cx="${f(g[0])}" cy="${f(g[1])}" r="12" fill="#ffd27a" fill-opacity="0.45" filter="url(#mBlur)"/><circle cx="${f(g[0])}" cy="${f(g[1])}" r="5" fill="#ffe7a6"/>`);
  });
  spool(3.6, 2.9); spool(5.3, 4.3); spool(3.85, 6.4);
  c.add(2.2 + 4.3, () => box(1.7, 2.7, 4.25, 4.55, 0, 8, K.rust, 5));

  // ---------- guests ----------
  [[1.2, 3.5, 0], [2.6, 3.62, 1], [3.9, 3.45, 2], [5.6, 3.6, 3], [7.4, 3.5, 5], [4.5, 4.9, 4], [4.6, 6.6, 0], [5.2, 5.75, 2], [2.0, 4.42, 5]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 1); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();

  const extraDefs = c.defs.join('') + `
    <filter id="mPuff" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b"/><feOffset in="b" dx="-1.8" dy="-2.4" result="o1"/><feComposite in="SourceAlpha" in2="o1" operator="out" result="e1"/><feFlood flood-color="#3e1a0a" flood-opacity="0.5"/><feComposite in2="e1" operator="in" result="s1"/><feOffset in="b" dx="1.4" dy="2" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="e2"/><feFlood flood-color="#fff4dc" flood-opacity="0.45"/><feComposite in2="e2" operator="in" result="s2"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s1"/><feMergeNode in="s2"/></feMerge></filter>
    <filter id="mPuffS" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="b"/><feOffset in="b" dx="-0.9" dy="-1.2" result="o1"/><feComposite in="SourceAlpha" in2="o1" operator="out" result="e1"/><feFlood flood-color="#3e1a0a" flood-opacity="0.45"/><feComposite in2="e1" operator="in" result="s1"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s1"/></feMerge></filter>
    <filter id="mBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="mFelt" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="0.6 1.1" numOctaves="3" seed="8" result="n2"/><feColorMatrix in="n2" type="saturate" values="0" result="g"/><feComponentTransfer in="g" result="g2"><feFuncR type="linear" slope="0.5" intercept="0.66"/><feFuncG type="linear" slope="0.5" intercept="0.66"/><feFuncB type="linear" slope="0.5" intercept="0.66"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer><feComposite in="d" in2="g2" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/></filter>
    <pattern id="mGing" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="#f3e3c6"/><rect width="18" height="36" fill="#c4573a" fill-opacity="0.12"/><rect width="36" height="18" fill="#c4573a" fill-opacity="0.12"/></pattern>`;
  const bg = `<rect width="1600" height="1000" fill="url(#mGing)"/><rect width="1600" height="1000" fill="#f6ead5" fill-opacity="0.35"/>`;
  let lu = ''; G.forEach((g, i) => { lu += guest(112 + i * 74, 1000 - 52, g, 2 * GK); });
  frame({
    key: 'm', letter: 'M', name: 'Felt and stitch', file: 'm-felt',
    blurb: ['A plush toy park sewn from felt: padded panels with dashed', 'stitch seams, buttons for eyes and details, yarn rails on', 'knitted posts, a soft fuzzy fibre over everything. Cosy.'],
    pal: [K.rust, K.berry, K.mustard, K.teal, K.olive, K.oat, K.cream], ink: K.ink, sub: '#7a4b2e', panel: '#fff6e6e8', panelInk: '#5a3420', panelR: 22, swatchR: 17,
    bg, scene: `<g filter="url(#mFelt)">${c.o.join('\n')}</g>`, extraDefs, lineup: { svg: lu, w: 470 },
    panelDeco: (x, y, w, h) => `<rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="16" fill="none" stroke="#c4573a" stroke-width="1.6" stroke-dasharray="6 4" stroke-opacity="0.7"/>`,
    note: ['Every panel = flat felt + a puff (inner shadow).', 'Seams: dashed thread, 4 px in from each edge.', 'Rails = yarn (3 strokes), posts = knit (ribbed).', 'Buttons for eyes, cherries, car badges.', 'One fibre + fuzz filter over the whole scene.'],
  });
}

// ======================================================================
// N — Stained glass
// Every object is cut into jewel-coloured glass pieces held by dark lead came. Each piece is lit from
// BEHIND (a radial gradient, light centre, deep edge), the ground is a mosaic, and sunbeams cross the
// scene. No outlines other than the lead; no shadows on the glass, only coloured light thrown below.
// ======================================================================
function styleN() {
  const S = 1.15, c = Ctx(S, 800, 222), P = c.P;
  const K = { lead: '#1b1722', emerald: '#1f9e6b', jade: '#38b77f', moss: '#4f9a3b', topaz: '#eaa63a', citrine: '#f6d460', sapphire: '#2f6fd1', azure: '#4aa3e8', ruby: '#cc2f4b', rose: '#e8607e', amethyst: '#7c4ccc', amber: '#b8662a', umber: '#7c4422', pearl: '#f3ecd8', ink: '#f6ecd6' };
  const LW = 3.0;
  const gl = (col) => c.og(`ng${col}`, (id) => `<radialGradient id="${id}" cx="0.5" cy="0.45" r="0.62"><stop offset="0" stop-color="${light(col, 0.62)}"/><stop offset="0.5" stop-color="${light(col, 0.12)}"/><stop offset="1" stop-color="${shade(col, 0.72)}"/></radialGradient>`);
  const glass = (pts, col, lw = LW) => c.push(`<path d="${poly(pts)}" fill="${gl(col)}" stroke="${K.lead}" stroke-width="${lw}" stroke-linejoin="round"/>`);
  const glassD = (d, col, lw = LW) => c.push(`<path d="${d}" fill="${gl(col)}" stroke="${K.lead}" stroke-width="${lw}" stroke-linejoin="round"/>`);
  const area = (p) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function cut(pts, n, r) {
    let pieces = [pts];
    for (let k = 0; k < n; k++) {
      pieces.sort((a, b) => area(b) - area(a));
      const p = pieces.shift(), m = p.length;
      let i = 0, best = 0; for (let e = 0; e < m; e++) { const L = Math.hypot(p[(e + 1) % m][0] - p[e][0], p[(e + 1) % m][1] - p[e][1]); if (L > best) { best = L; i = e; } }
      const j = (i + Math.floor(m / 2)) % m, a = lerp(p[i], p[(i + 1) % m], 0.32 + r() * 0.36), b = lerp(p[j], p[(j + 1) % m], 0.32 + r() * 0.36);
      const A = [a]; for (let e = (i + 1) % m; ; e = (e + 1) % m) { A.push(p[e]); if (e === j) break; } A.push(b);
      const B = [b]; for (let e = (j + 1) % m; ; e = (e + 1) % m) { B.push(p[e]); if (e === i) break; } B.push(a);
      pieces.push(A, B);
    }
    return pieces;
  }
  const R = rng(11);
  const tones = (col) => [light(col, 0.14), col, shade(col, 0.86)];
  const pane = (pts, col, n = 2, lw = LW) => cut(pts, n, R).forEach((q, i) => glass(q, tones(col)[(i + Math.floor(R() * 3)) % 3], lw));
  const box = (x0, x1, y0, y1, z0, z1, col, n = 1) => {
    pane([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], shade(col, 0.72), n);
    pane([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], col, n);
    pane([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], light(col, 0.2), n);
  };
  const arcPts = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  // cylinder: the front half cut into vertical staves, the top into pie wedges
  const cyl = (gx, gy, r, z0, z1, cols, staves = 4, wedges = 6) => {
    const s = c.cylSide(gx, gy, r, z0, z1);
    for (let i = 0; i < staves; i++) {
      const a0 = Math.PI * i / staves, a1 = Math.PI * (i + 1) / staves;
      const top = arcPts(s.c1[0], s.c1[1], s.rx, s.ry, a1, a0, 6), bot = arcPts(s.c0[0], s.c0[1], s.rx, s.ry, a0, a1, 6);
      const col = cols[i % cols.length]; glass(bot.concat(top), i < staves / 2 ? col : shade(col, 0.78));
    }
    for (let i = 0; i < wedges; i++) { const a0 = Math.PI * 2 * i / wedges, a1 = Math.PI * 2 * (i + 1) / wedges; glass([[s.c1[0], s.c1[1]]].concat(arcPts(s.c1[0], s.c1[1], s.rx, s.ry, a0, a1, 5)), light(cols[(i + 1) % cols.length], 0.2)); }
    return s;
  };
  // ball (tree crown): a circle cut into irregular leaf pieces
  const ball = (cx, cy, r, cols, n = 5) => {
    const circ = Array.from({ length: 28 }, (_, i) => { const a = i / 28 * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    cut(circ, n, R).forEach((q, i) => { const m = q.reduce((s, p) => [s[0] + p[0] / q.length, s[1] + p[1] / q.length], [0, 0]); glass(q, (m[0] - cx) - (m[1] - cy) > r * 0.25 ? light(cols[i % cols.length], 0.25) : (m[1] - cy) > r * 0.3 ? shade(cols[i % cols.length], 0.8) : cols[i % cols.length]); });
  };


  // ---------- glass guests: every body part is one lead-framed piece ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const X = (v) => sx + v * k * g.dir, Y = (v) => sy + v * k, Q = (arr) => arr.map(([x, y]) => [X(x), Y(y)]);
    const lw = f(Math.max(1.1, 0.95 * k)), o = [];
    const pc = (pts, col) => o.push(`<path d="${poly(Q(pts))}" fill="${gl(col)}" stroke="${K.lead}" stroke-width="${lw}" stroke-linejoin="round"/>`);
    const top = seated ? -12 : -20, hip = seated ? 2 : -9.5, hy = top - 5.6;
    if (!seated) {
      pc([[-3.6, hip], [-0.3, hip], [-0.8, 0], [-4.2, 0]], shade(g.pants, 0.8));
      pc([[0.3, hip], [3.6, hip], [4.4, 0], [1.0, 0]], g.pants);
      pc([[-5.2, top + 1], [-7.6, top + 9.5], [-5.8, top + 10.2], [-3.8, top + 3]], shade(g.shirt, 0.75));
    }
    pc([[-4.8, top], [0, top - 0.6], [0, hip], [-3.8, hip]], light(g.shirt, 0.2));
    pc([[0, top - 0.6], [4.8, top], [3.8, hip], [0, hip]], g.shirt);
    if (g.belt) pc([[-3.9, hip - 2.4], [3.9, hip - 2.4], [3.8, hip], [-3.8, hip]], g.belt);
    if (seated) { pc([[-4.6, top + 1.5], [-8.2, top - 6], [-6.4, top - 7], [-3, top + 0.5]], shade(g.shirt, 0.8)); pc([[4.6, top + 1.5], [8.2, top - 6], [6.4, top - 7], [3, top + 0.5]], shade(g.shirt, 0.8)); }
    else pc([[5.2, top + 1], [7.6, top + 9.5], [5.8, top + 10.2], [3.8, top + 3]], shade(g.shirt, 0.88));
    if (g.balloon && !seated) { o.push(`<path d="M${f(X(6.8))},${f(Y(top + 9))}L${f(X(10))},${f(Y(top - 14))}" stroke="${K.lead}" stroke-width="${lw}"/>`); o.push(`<path d="${ellD([X(10), Y(top - 19)], 5 * k, 5.8 * k)}" fill="${gl(g.balloon)}" stroke="${K.lead}" stroke-width="${lw}"/><path d="M${f(X(10))},${f(Y(top - 24.8))}L${f(X(10))},${f(Y(top - 13.2))}" stroke="${K.lead}" stroke-width="${f(lw * 0.7)}"/>`); }
    o.push(`<path d="${ellD([X(0), Y(hy)], 5.3 * k, 5.3 * k)}" fill="${gl(g.skin)}" stroke="${K.lead}" stroke-width="${lw}"/>`);
    if (g.hair === 'cap') pc([[-5.6, hy - 0.5], [-4.6, hy - 5], [0, hy - 6.6], [4.6, hy - 5], [5.6, hy - 1.2], [9, hy - 1.2], [5.4, hy - 2.8], [0, hy - 3.6]], g.hairCol);
    if (g.hair === 'long') pc([[-5.6, hy + 4.5], [-6, hy - 2], [-3, hy - 6], [2, hy - 6.4], [5.6, hy - 2.6], [2, hy - 3.2], [-2.6, hy - 1.6], [-3.2, hy + 4.5]], g.hairCol);
    if (g.hair === 'crop') pc([[-5.4, hy + 0.5], [-5, hy - 4], [0, hy - 6.2], [5, hy - 4.2], [5.4, hy - 1.4], [1, hy - 3.4], [-3, hy - 2.6]], g.hairCol);
    if (g.hair === 'crown') { pc([[-5, hy - 2.6], [-5.4, hy - 8], [-2.6, hy - 5.2], [0, hy - 9], [2.6, hy - 5.2], [5.4, hy - 8], [5, hy - 2.6]], K.citrine); }
    o.push(`<circle cx="${f(X(2.2))}" cy="${f(Y(hy + 0.4))}" r="${f(0.8 * k)}" fill="${K.lead}"/><circle cx="${f(X(4.4))}" cy="${f(Y(hy + 0.4))}" r="${f(0.8 * k)}" fill="${K.lead}"/>`);
    return o.join('');
  }
  const skins = ['#f6d2b4', '#e2a77c', '#b9774c', '#7f4c30'];
  const G = [
    { dir: 1, shirt: K.ruby, pants: K.sapphire, skin: skins[0], hair: 'cap', hairCol: K.emerald, belt: K.citrine },
    { dir: -1, shirt: K.citrine, pants: K.amethyst, skin: skins[2], hair: 'long', hairCol: '#3a2418', balloon: K.rose },
    { dir: 1, shirt: K.azure, pants: K.umber, skin: skins[1], hair: 'crop', hairCol: '#5a3020' },
    { dir: -1, shirt: K.amethyst, pants: K.emerald, skin: skins[3], hair: 'crown', hairCol: '#000', belt: K.topaz },
    { dir: 1, shirt: K.jade, pants: K.ruby, skin: skins[0], hair: 'long', hairCol: K.topaz },
    { dir: -1, shirt: K.topaz, pants: K.sapphire, skin: skins[2], hair: 'cap', hairCol: K.ruby, balloon: K.azure },
  ];
  const GK = 1.25 * S;

  // ---------- the window-island: an octagon of mosaic glass ----------
  const W = 9, H = 8, ct = 1.4;
  const oct = [[ct, 0], [W - ct, 0], [W, ct], [W, H - ct], [W - ct, H], [ct, H], [0, H - ct], [0, ct]];
  const Z0 = -30;
  // coloured light thrown on the dark floor below (the sun shines through the glass)
  c.push(`<g opacity="0.55" filter="url(#nGlow)">${[[K.emerald, 620, 760, 260], [K.topaz, 900, 800, 200], [K.sapphire, 520, 820, 160], [K.ruby, 1080, 760, 150], [K.amethyst, 760, 860, 180]].map(([col, x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.32}" fill="${col}"/>`).join('')}</g>`);
  // sides: facing edges of the octagon, cut into staves of umber/amber glass
  oct.forEach((a, i) => {
    const b = oct[(i + 1) % oct.length], nx = b[1] - a[1], ny = -(b[0] - a[0]);
    if (nx + ny <= 0.01) return;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 0.9));
    for (let k = 0; k < n; k++) {
      const p0 = lerp(a, b, k / n), p1 = lerp(a, b, (k + 1) / n), zm = Z0 + 12 + (k % 2) * 6;
      glass([P(p0[0], p0[1], 0), P(p1[0], p1[1], 0), P(p1[0], p1[1], zm), P(p0[0], p0[1], zm)], nx > ny ? shade(K.amber, 0.8) : K.amber);
      glass([P(p0[0], p0[1], zm), P(p1[0], p1[1], zm), P(p1[0], p1[1], Z0), P(p0[0], p0[1], Z0)], nx > ny ? shade(K.umber, 0.8) : K.umber);
    }
  });
  // mosaic top: a jittered lattice of half-tile cells, coloured by what lies there, clipped to the octagon
  const cid = c.id('nc'); c.def(`<clipPath id="${cid}"><path d="${poly(oct.map((q) => P(q[0], q[1], 0)))}"/></clipPath>`);
  const step = 0.5, nx = W / step, ny = H / step, V = [];
  for (let i = 0; i <= nx; i++) { V.push([]); for (let j = 0; j <= ny; j++) { const edge = i === 0 || j === 0 || i === nx || j === ny; V[i].push([i * step + (edge ? 0 : (R() - 0.5) * 0.24), j * step + (edge ? 0 : (R() - 0.5) * 0.24)]); } }
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); };
  const PATHS = [[[0, 4.4], [4.6, 4.4]], [[4.6, 4.4], [4.6, 8]], [[4.6, 4.4], [6.2, 3.3]], [[6.2, 3.3], [9, 3.3]], [[4.6, 6.0], [5.8, 6.0]]];
  const kind = (p) => {
    if (PATHS.some(([a, b]) => segD(p, a, b) < 0.5)) return 'path';
    if (Math.hypot(p[0] - 2.1, (p[1] - 6.5) * 1.15) < 1.15) return 'water';
    if (Math.hypot(p[0] - 7.4, p[1] - 6.4) < 0.62) return 'bed';
    return 'grass';
  };
  let mosaic = '';
  const mpush = (pts, col) => { mosaic += `<path d="${poly(pts.map((q) => P(q[0], q[1], 0)))}" fill="${gl(col)}" stroke="${K.lead}" stroke-width="2.4" stroke-linejoin="round"/>`; };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const q = [V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]], cen = [(i + 0.5) * step, (j + 0.5) * step], kd = kind(cen);
    const pick = { path: [K.topaz, K.citrine, '#e7b54e'], water: [K.sapphire, K.azure, '#3d86dc'], bed: [K.ruby, K.rose, K.amethyst], grass: [K.emerald, K.jade, K.moss, '#2a8a5c'] }[kd];
    const col = pick[Math.floor(R() * pick.length)];
    if (R() < 0.38) { const d = R() < 0.5; const t1 = d ? [q[0], q[1], q[2]] : [q[0], q[1], q[3]], t2 = d ? [q[0], q[2], q[3]] : [q[1], q[2], q[3]]; mpush(t1, col); mpush(t2, pick[Math.floor(R() * pick.length)]); } else mpush(q, col);
  }
  c.push(`<g clip-path="url(#${cid})">${mosaic}</g>`);
  c.push(`<path d="${poly(oct.map((q) => P(q[0], q[1], 0)))}" fill="none" stroke="${K.lead}" stroke-width="5" stroke-linejoin="round"/>`);
  // lily pads on the water: two green rounds
  [[1.6, 6.2], [2.7, 6.9]].forEach(([x, y]) => { const p = P(x, y); glassD(ellD(p, 12, 6), K.jade, 2); });

  // ---------- coaster: ruby glass rails on amber posts, a camelback along the back ----------
  const C0 = { x: 6.9, y: 1.45 };
  const trk = Track([[-1.6, 0.95, 12], [0.0, 1.1, 12], [1.3, 0.9, 18], [1.75, 0.0, 66], [1.4, -0.8, 118], [0.5, -1.05, 44], [-0.4, -1.0, 96], [-1.3, -0.7, 54], [-1.8, 0.15, 26]].map(([x, y, z]) => [C0.x + x, C0.y + y, z]), 10, true);
  const tp = trk.pts;
  tp.forEach((p, i) => { if (i % 4 || p[2] < 18) return; c.add(p[0] + p[1] - 0.04, () => { const a = P(p[0], p[1], 0), b = P(p[0], p[1], p[2] - 4); c.push(`<path d="M${pt(a)}L${pt(b)}" stroke="${K.lead}" stroke-width="${f(7.5 * S)}" stroke-linecap="round"/><path d="M${pt(a)}L${pt(b)}" stroke="${K.topaz}" stroke-width="${f(3.6 * S)}"/><path d="M${pt(a)}L${pt(b)}" stroke="${light(K.topaz, 0.6)}" stroke-width="1.2"/>`); for (let z = 22; z < p[2] - 8; z += 22) { const m = P(p[0], p[1], z); c.push(`<path d="M${f(m[0] - 4.5)},${f(m[1])}L${f(m[0] + 4.5)},${f(m[1])}" stroke="${K.lead}" stroke-width="2.4"/>`); } }); });
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx2 = -dy / l * 0.13, ny2 = dx / l * 0.13;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2, () => {
      const rails = [1, -1].map((s) => [P(p[0] + nx2 * s, p[1] + ny2 * s, p[2]), P(q[0] + nx2 * s, q[1] + ny2 * s, q[2])]);
      c.push(rails.map(([a, b]) => `<path d="M${pt(a)}L${pt(b)}" stroke="${K.lead}" stroke-width="${f(8 * S)}" stroke-linecap="round"/>`).join(''));
      c.push(`<path d="M${pt(rails[0][0])}L${pt(rails[1][0])}" stroke="${K.lead}" stroke-width="3"/>`);
      c.push(rails.map(([a, b]) => `<path d="M${pt(a)}L${pt(b)}" stroke="${K.ruby}" stroke-width="${f(4 * S)}"/><path d="M${pt(a)}L${pt(b)}" stroke="${light(K.ruby, 0.55)}" stroke-width="1.4"/>`).join(''));
    });
  }
  c.add(C0.x + C0.y + 0.75, () => box(C0.x - 1.5, C0.x + 0.1, C0.y + 1.28, C0.y + 1.7, 0, 9, K.amethyst, 1));
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 0.3 + k * 0.6, 0.5, 0.42, 12, 2), col = [K.sapphire, K.emerald, K.amethyst][k];
    c.add(car.depth + 0.2, () => {
      glass(car.top, shade(col, 0.45));
      [-0.2, 0.2].map((u) => car.seat(u, 8)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j + 1) % 6], dir: 1 }, GK * 0.85, true)); });
      car.sides.forEach((sd) => pane(sd.pts, sd.n[0] > sd.n[1] ? shade(col, 0.78) : col, sd.end ? 0 : 1));
    });
  });
  [[C0.x - 1.15, C0.y + 1.5], [C0.x - 0.7, C0.y + 1.5]].forEach(([x, y], i) => c.add(x + y + 0.8, () => { const p = P(x, y, 9); c.push(guest(p[0], p[1], G[[4, 2][i]], GK)); }));

  // ---------- swinging boat: twin A-frames, a glass hull with seated rows ----------
  const SB = { x: 2.4, y: 1.95, pz: 122, L: 84, th: 0.38 };
  const U = 58; // px per tile used for the swing rotation
  const rot = (u, w, v) => { const rx = u * U, ry = v - SB.L, X = rx * Math.cos(SB.th) - ry * Math.sin(SB.th), Z = rx * Math.sin(SB.th) + ry * Math.cos(SB.th); return [SB.x + X / U, SB.y + w, SB.pz + Z]; };
  const frame2 = (yy) => { const a = P(SB.x - 1.0, yy, 0), b = P(SB.x + 1.0, yy, 0), t = P(SB.x, yy, SB.pz); for (const e of [a, b]) c.push(`<path d="M${pt(e)}L${pt(t)}" stroke="${K.lead}" stroke-width="${f(9 * S)}" stroke-linecap="round"/><path d="M${pt(e)}L${pt(t)}" stroke="${K.sapphire}" stroke-width="${f(4.6 * S)}"/><path d="M${pt(e)}L${pt(t)}" stroke="${light(K.sapphire, 0.6)}" stroke-width="1.4"/>`); glassD(ellD(t, 7, 7), K.citrine, 2.4); };
  const armsAt = (w) => { const t = P(SB.x, SB.y + w, SB.pz); for (const u of [-0.7, 0.7]) { const e = P(...rot(u, w, 6)); c.push(`<path d="M${pt(t)}L${pt(e)}" stroke="${K.lead}" stroke-width="${f(6 * S)}" stroke-linecap="round"/><path d="M${pt(t)}L${pt(e)}" stroke="${K.citrine}" stroke-width="${f(2.6 * S)}"/>`); } };
  c.add(SB.x + SB.y - 1.2, () => { frame2(SB.y - 0.6); armsAt(-0.4); });
  c.add(SB.x + SB.y, () => {
    const us = Array.from({ length: 17 }, (_, i) => -1.25 + 2.5 * i / 16), hw = (u) => 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow(u / 1.27, 4))), dv = (u) => 12 * Math.pow(u / 1.25, 4);
    const deck = us.map((u) => P(...rot(u, hw(u), dv(u)))).concat(us.slice().reverse().map((u) => P(...rot(u, -hw(u), dv(u)))));
    glass(deck, '#2a1f3a');
    // seated riders, back row (-w) first
    [-0.18, 0.18].forEach((w) => [-0.7, 0, 0.7].forEach((u, j) => { const p = P(...rot(u, w, dv(u) - 12)); c.push(guest(p[0], p[1], { ...G[(j * 2 + (w > 0 ? 1 : 0)) % 6], dir: 1 }, GK * 0.85, true)); }));
    // hull side (+w faces the camera): cut into glass at each row
    const top = us.map((u) => P(...rot(u, hw(u), dv(u)))), keel = us.map((u) => P(...rot(u, 0.05, dv(u) - 36 * (1 - Math.pow(u / 1.25, 2)))));
    for (let k = 0; k < 4; k++) {
      const a = k * 4, b = k * 4 + 4, band = (t) => top.slice(a, b + 1).map((p, i) => lerp(p, keel[a + i], t));
      glass(band(0).concat(band(0.45).reverse()), [K.ruby, K.citrine, K.ruby, K.citrine][k]);
      glass(band(0.45).concat(band(1).reverse()), [K.sapphire, K.amethyst, K.sapphire, K.amethyst][k]);
    }
    c.push(`<path d="${line(top)}" stroke="${K.lead}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="${line(top)}" stroke="${K.citrine}" stroke-width="2" fill="none"/>`);
    const m = lerp(top[8], keel[8], 0.45); glassD(ellD(m, 10, 10), K.citrine, 2.6); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.push(`<path d="M${f(m[0] + Math.cos(a) * 10)},${f(m[1] + Math.sin(a) * 10)}L${f(m[0] + Math.cos(a) * 15)},${f(m[1] + Math.sin(a) * 15)}" stroke="${K.lead}" stroke-width="2"/>`); }
  });
  c.add(SB.x + SB.y + 1.2, () => { armsAt(0.4); frame2(SB.y + 0.6); });

  // ---------- kiosk: a hexagonal glass lantern with a pyramid roof ----------
  const KS = { x: 6.35, y: 5.55, r: 0.6 };
  c.add(KS.x + KS.y, () => {
    const hex = (r, z) => Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 + Math.PI / 6; return [KS.x + r * Math.cos(a), KS.y + r * Math.sin(a), z]; });
    const b = hex(KS.r, 0), t = hex(KS.r, 34), e = hex(KS.r * 1.2, 34), apex = [KS.x, KS.y, 74];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6, mx = (b[i][0] + b[j][0]) / 2 - KS.x, my = (b[i][1] + b[j][1]) / 2 - KS.y; if (mx + my <= 0.01) continue;
      const lit = mx < my;
      glass([P(...b[i]), P(...b[j]), P(b[j][0], b[j][1], 12), P(b[i][0], b[i][1], 12)], lit ? K.ruby : shade(K.ruby, 0.75));
      glass([P(b[i][0], b[i][1], 12), P(b[j][0], b[j][1], 12), P(...t[j]), P(...t[i])], lit ? K.citrine : shade(K.citrine, 0.8));
      const mid = P((b[i][0] + b[j][0]) / 2, (b[i][1] + b[j][1]) / 2, 22); if (lit) c.push(`<path d="M${f(mid[0] - 6)},${f(mid[1] + 4)}L${f(mid[0] - 6)},${f(mid[1] - 4)}Q${f(mid[0])},${f(mid[1] - 11)} ${f(mid[0] + 6)},${f(mid[1] - 4)}L${f(mid[0] + 6)},${f(mid[1] + 4)}Z" fill="${gl(K.pearl)}" stroke="${K.lead}" stroke-width="2"/>`);
    }
    const roof = []; for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; roof.push({ i, j, d: (e[i][0] + e[j][0] + e[i][1] + e[j][1]) / 2 }); }
    roof.sort((a, b) => a.d - b.d).forEach(({ i, j }) => glass([P(...e[i]), P(...e[j]), P(...apex)], [K.ruby, K.topaz, K.amethyst, K.ruby, K.topaz, K.amethyst][i]));
    const tp2 = P(KS.x, KS.y, 80); glassD(ellD(tp2, 6, 6), K.citrine, 2.4);
  });

  // ---------- glass trees and lanterns ----------
  const tree = (x, y, r = 17, h = 26, cols = [K.emerald, K.jade, K.moss]) => c.add(x + y, () => {
    const b = P(x, y, 0), t = P(x, y, h);
    c.push(`<path d="M${pt(b)}L${pt(t)}" stroke="${K.lead}" stroke-width="${f(7 * S)}" stroke-linecap="round"/><path d="M${pt(b)}L${pt(t)}" stroke="${K.umber}" stroke-width="${f(3.2 * S)}"/>`);
    ball(t[0], t[1] - r * 0.7, r * S, cols);
  });
  const cypress = (x, y, h = 60, w = 13) => c.add(x + y, () => {
    const b = P(x, y, 0), L = [b[0], b[1] - 4], T = [b[0], b[1] - h];
    const lens = (s) => `M${pt(L)}C${pt([L[0] + s * w * 1.3, L[1] - h * 0.25])} ${pt([T[0] + s * w * 0.8, T[1] + h * 0.25])} ${pt(T)}`;
    glassD(lens(-1) + `L${pt(L)}Z`, K.jade); glassD(lens(1) + `L${pt(L)}Z`, shade(K.emerald, 0.8));
    for (const t of [0.35, 0.65]) { const yy = L[1] - h * t; c.push(`<path d="M${f(b[0] - w * 0.9)},${f(yy + 4)}L${f(b[0] + w * 0.9)},${f(yy - 2)}" stroke="${K.lead}" stroke-width="2.2"/>`); }
  });
  tree(0.9, 3.0, 18, 26); tree(3.4, 7.0, 16, 24, [K.jade, K.moss, K.emerald]); tree(8.1, 5.0, 17, 26, [K.moss, K.emerald, K.jade]); tree(5.6, 7.3, 14, 22);
  cypress(0.7, 5.3, 64); cypress(1.0, 0.9, 58); cypress(8.4, 6.8, 56); cypress(3.6, 3.2, 50, 11);
  const lantern = (x, y) => c.add(x + y, () => {
    const b = P(x, y, 0), t = P(x, y, 46);
    c.push(`<path d="M${pt(b)}L${pt(t)}" stroke="${K.lead}" stroke-width="4"/><circle cx="${f(t[0])}" cy="${f(t[1] - 7)}" r="16" fill="${K.citrine}" fill-opacity="0.35" filter="url(#nSoft)"/>`);
    glass([[t[0], t[1] - 16], [t[0] + 6, t[1] - 7], [t[0], t[1] + 2], [t[0] - 6, t[1] - 7]], K.citrine, 2.2);
  });
  lantern(3.95, 3.95); lantern(5.2, 4.95); lantern(4.05, 6.6);
  c.add(7.4 + 6.4, () => { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, p = P(7.4 + 0.3 * Math.cos(a), 6.4 + 0.3 * Math.sin(a), 0); glassD(ellD([p[0], p[1] - 8], 5.5, 5.5), [K.ruby, K.rose, K.amethyst, K.citrine, K.rose][i], 1.8); } });
  [[0.9, 4.45, 0], [2.4, 4.35, 5], [3.6, 4.5, 2], [4.65, 5.3, 3], [4.55, 7.1, 1], [5.3, 6.05, 4], [5.5, 3.75, 0], [7.6, 3.3, 3], [8.5, 3.25, 5]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 0); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();

  // ---------- background, sunbeams, frame ----------
  const extraDefs = c.defs.join('') + `
    <radialGradient id="nBack" cx="0.5" cy="0.48" r="0.7"><stop offset="0" stop-color="#3a2a46"/><stop offset="0.55" stop-color="#1e1828"/><stop offset="1" stop-color="#0e0b14"/></radialGradient>
    <linearGradient id="nBeam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff2c4" stop-opacity="0"/><stop offset="0.5" stop-color="#fff2c4" stop-opacity="0.22"/><stop offset="1" stop-color="#fff2c4" stop-opacity="0"/></linearGradient>
    <filter id="nGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="34"/></filter>
    <filter id="nSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <pattern id="nLattice" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0L80,0M0,0L0,80" stroke="#2c2436" stroke-width="3"/></pattern>`;
  const bg = `<rect width="1600" height="1000" fill="url(#nBack)"/><rect width="1600" height="1000" fill="url(#nLattice)" opacity="0.6"/>`;
  const beams = [[-120, 150], [180, 110], [430, 170], [760, 90]].map(([x, w]) => `<path d="M${x},-40L${x + w},-40L${x + w + 900},1040L${x + 900},1040Z" fill="url(#nBeam)" style="mix-blend-mode:screen" transform="rotate(0)"/>`).join('');
  const motes = Array.from({ length: 40 }, () => `<circle cx="${f(R() * 1600)}" cy="${f(R() * 1000)}" r="${f(0.8 + R() * 1.6)}" fill="#fff6d8" fill-opacity="${f(0.25 + R() * 0.5)}"/>`).join('');
  let lu = ''; G.forEach((g, i) => { lu += guest(112 + i * 74, 1000 - 48, g, 2 * GK); });
  frame({
    key: 'n', letter: 'N', name: 'Stained glass', file: 'n-glass',
    blurb: ['Every object is cut into jewel glass held by dark lead.', 'Light comes from behind: each piece glows bright at the', 'centre and deepens to its edge. Sunbeams cross the park.'],
    pal: [K.ruby, K.topaz, K.citrine, K.emerald, K.sapphire, K.amethyst, K.lead], ink: K.ink, sub: '#cbb99b', panel: '#120f18e6', panelInk: '#efe2c6', panelR: 6, swatchR: 4,
    swatchExtra: ` stroke="#6a5a3a" stroke-width="2"`,
    panelDeco: (x, y, w, h) => `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="3" fill="none" stroke="#5a4a2a" stroke-width="2"/>`,
    bg, scene: c.o.join('\n') + beams + motes, extraDefs, lineup: { svg: lu, w: 470 },
    note: ['Piece = radial fill (light centre) + 3 px lead.', 'Faces are cut 1-3 times; cylinders into staves.', 'Ground = jittered half-tile mosaic, by terrain.', 'Shading = darker glass, never a cast shadow.', 'Sunbeams: 4 screen-blended bands on top.'],
  });
}

// ======================================================================
// O — Retro-future chrome
// A 1960s space-age park: chrome rides banded with reflections (sky above the horizon line, warm ground
// below), glass domes and canopies, a monorail on swept pylons, boomerang shapes, starburst lamps,
// a cream terrazzo plaza. Teal / orange / cream, crisp soft shadows, tall sleek guests.
// ======================================================================
function styleO() {
  const S = 1.15, c = Ctx(S, 800, 232), P = c.P;
  const K = { teal: '#2a9d9f', tealD: '#1b6d72', orange: '#ee7a3a', orangeD: '#c95b22', cream: '#f6ecd8', creamD: '#e6d6b8', mustard: '#f3b43f', ink: '#173b45', sky: '#c4eae6', grass: '#9fcf9a', leaf: '#3f8a5a', white: '#ffffff' };
  // chrome: vertical reflection bands on cylinders and tubes; a horizon reflection on spheres
  const chromeV = c.og('ochv', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4b5a62"/><stop offset="0.14" stop-color="#d9e5e7"/><stop offset="0.26" stop-color="#ffffff"/><stop offset="0.38" stop-color="#8fa1a8"/><stop offset="0.52" stop-color="#4e5d65"/><stop offset="0.6" stop-color="#d8a07a"/><stop offset="0.72" stop-color="#eef3f4"/><stop offset="0.86" stop-color="#9aabb1"/><stop offset="1" stop-color="#53626a"/></linearGradient>`);
  const chromeBall = c.og('ochb', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="#9fd8d6"/><stop offset="0.36" stop-color="#f4fbfb"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="0.53" stop-color="#3a4950"/><stop offset="0.66" stop-color="#b9774c"/><stop offset="1" stop-color="#f1d2b0"/></linearGradient>`);
  const flat = (col) => ({ top: light(col, 0.1), left: col, right: shade(col, 0.78) });
  const face = (pts, col, r = 3) => c.push(`<path d="${rp(pts, r)}" fill="${col}"/>`);
  const box = (x0, x1, y0, y1, z0, z1, col, r = 3) => { const t = flat(col); face([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], t.right, r); face([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], t.left, r); face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], t.top, r); };
  const chromeCyl = (gx, gy, r, z0, z1) => { const s = c.cylSide(gx, gy, r, z0, z1); c.push(`<path d="${s.d}" fill="${chromeV}"/><path d="${s.top}" fill="#e9f1f2"/>`); return s; };
  const paintCyl = (gx, gy, r, z0, z1, col, topCol) => { const s = c.cylSide(gx, gy, r, z0, z1), t = flat(col); c.push(`<path d="${s.d}" fill="${c.split(t.left, t.right, s.c0[0] - s.rx, s.c0[0] + s.rx, s.c0[0] + s.rx * 0.2, s.rx * 0.25)}"/><path d="${s.top}" fill="${topCol || t.top}"/>`); c.push(`<path d="M${pt([s.c0[0] - s.rx * 0.55, s.c0[1] + s.ry * 0.82])}L${pt([s.c1[0] - s.rx * 0.55, s.c1[1] + s.ry * 0.82])}" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2"/>`); return s; };
  const sphere = (cx, cy, r) => c.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${chromeBall}" stroke="#3a4950" stroke-width="0.8"/><ellipse cx="${f(cx - r * 0.35)}" cy="${f(cy - r * 0.45)}" rx="${f(r * 0.22)}" ry="${f(r * 0.14)}" fill="#ffffff" transform="rotate(-30 ${f(cx - r * 0.35)} ${f(cy - r * 0.45)})"/>`);
  const tube = (d, w) => `<path d="${d}" stroke="#34434a" stroke-width="${f(w + 2.2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="#aebcc1" stroke-width="${f(w)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="#ffffff" stroke-width="${f(w * 0.36)}" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-${f(w * 0.22)})"/>`;
  const shadow = (gx, gy, rx, ry = rx / 2, z = 0, o = 0.2) => { const p = P(gx, gy, z); c.push(`<ellipse cx="${f(p[0] + 4)}" cy="${f(p[1] + 2)}" rx="${f(rx)}" ry="${f(ry)}" fill="${K.ink}" fill-opacity="${o}" filter="url(#oSoft)"/>`); };
  // glass dome over an opening (ellipse c, rx, ry), height h
  const dome = (c1, rx, ry, h) => c.push(`<path d="M${pt([c1[0] - rx, c1[1]])}A${f(rx)} ${f(h)} 0 0 1 ${pt([c1[0] + rx, c1[1]])}A${f(rx)} ${f(ry)} 0 0 1 ${pt([c1[0] - rx, c1[1]])}Z" fill="#dff6f6" fill-opacity="0.32" stroke="#ffffff" stroke-opacity="0.85" stroke-width="1.2"/><path d="M${pt([c1[0] - rx * 0.62, c1[1] - h * 0.55])}A${f(rx * 0.75)} ${f(h * 0.8)} 0 0 1 ${pt([c1[0] - rx * 0.05, c1[1] - h * 0.93])}" stroke="#ffffff" stroke-width="${f(Math.max(1.6, rx * 0.12))}" fill="none" stroke-linecap="round" stroke-opacity="0.9"/>`);
  const starburst = (cx, cy, r, col = K.mustard, n = 8) => { let s = ''; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.2, rr = i % 2 ? r * 0.65 : r; s += `<path d="M${f(cx)},${f(cy)}L${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr * 0.9)}" stroke="${col}" stroke-width="1.6"/><circle cx="${f(cx + Math.cos(a) * rr)}" cy="${f(cy + Math.sin(a) * rr * 0.9)}" r="${f(r * 0.1 + 0.8)}" fill="${col}"/>`; } return s; };

  // ---------- sleek guests: long legs, small heads, A-line tunics, white boots ----------
  function guest(sx, sy, g, k = 1, seated = false) {
    const u = (v) => f(v * k), X = (v) => f(sx + v * k * g.dir), Y = (v) => f(sy + v * k), o = [];
    const sh0 = seated ? -13 : -27.5, waist = seated ? -6 : -20.5, hem = seated ? 2 : -13.5, hy = sh0 - 5.4;
    if (!seated) {
      o.push(`<ellipse cx="${X(1.5)}" cy="${Y(0.3)}" rx="${u(6.5)}" ry="${u(2)}" fill="${K.ink}" fill-opacity="0.25"/>`);
      o.push(`<path d="M${X(-1.6)},${Y(hem)}L${X(-2.6)},${Y(-0.6)}M${X(1.6)},${Y(hem)}L${X(2.8)},${Y(-0.8)}" stroke="${g.legs}" stroke-width="${u(2.1)}" stroke-linecap="round"/>`);
      o.push(`<path d="M${X(-2.4)},${Y(-4.5)}L${X(-2.7)},${Y(-0.4)}M${X(2.6)},${Y(-4.5)}L${X(2.9)},${Y(-0.6)}" stroke="#ffffff" stroke-width="${u(2.6)}" stroke-linecap="round"/><path d="M${X(-2.6)},${Y(-0.4)}l${u(-1.6 * g.dir)},0M${X(2.9)},${Y(-0.6)}l${u(1.8 * g.dir)},0" stroke="#ffffff" stroke-width="${u(1.6)}" stroke-linecap="round"/>`);
      o.push(`<path d="M${X(-3)},${Y(sh0 + 1)}L${X(-5.2)},${Y(waist + 2)}L${X(-4.4)},${Y(hem + 2)}" stroke="${shade(g.top, 0.8)}" stroke-width="${u(1.6)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    const body = g.dress
      ? `M${X(-3.4)},${Y(sh0)}L${X(3.4)},${Y(sh0)}L${X(2.4)},${Y(waist)}L${X(6.2)},${Y(hem)}L${X(-6.2)},${Y(hem)}L${X(-2.4)},${Y(waist)}Z`
      : `M${X(-3.6)},${Y(sh0)}L${X(3.6)},${Y(sh0)}L${X(2.8)},${Y(waist + 1.5)}L${X(3.2)},${Y(hem + 3)}L${X(-3.2)},${Y(hem + 3)}L${X(-2.8)},${Y(waist + 1.5)}Z`;
    o.push(`<path d="${body}" fill="${c.split(g.top, shade(g.top, 0.8), sx - 6 * k, sx + 6 * k, sx + 1 * k, 0.1)}" stroke-linejoin="round"/>`);
    if (!g.dress && !seated) o.push(`<path d="M${X(-3.2)},${Y(hem + 3)}L${X(-3.2)},${Y(hem)}L${X(3.2)},${Y(hem)}L${X(3.2)},${Y(hem + 3)}Z" fill="${g.legs}"/>`);
    if (g.stripe) o.push(`<path d="M${X(-3)},${Y(waist + 0.4)}L${X(3)},${Y(waist + 0.4)}" stroke="${g.stripe}" stroke-width="${u(1.6)}"/>`);
    o.push(`<path d="M${X(-2.6)},${Y(sh0 + 0.2)}Q${X(0)},${Y(sh0 + 3.2)} ${X(2.6)},${Y(sh0 + 0.2)}" fill="#ffffff"/>`);
    if (seated) o.push(`<path d="M${X(-3.2)},${Y(sh0 + 1)}L${X(-6)},${Y(sh0 - 7)}M${X(3.2)},${Y(sh0 + 1)}L${X(6)},${Y(sh0 - 7)}" stroke="${shade(g.top, 0.85)}" stroke-width="${u(1.8)}" stroke-linecap="round"/><circle cx="${X(-6.1)}" cy="${Y(sh0 - 7.6)}" r="${u(1.1)}" fill="${g.skin}"/><circle cx="${X(6.1)}" cy="${Y(sh0 - 7.6)}" r="${u(1.1)}" fill="${g.skin}"/>`);
    else o.push(`<path d="M${X(3)},${Y(sh0 + 1)}L${X(5.4)},${Y(waist + 1.5)}L${X(4.2)},${Y(hem + 2.5)}" stroke="${g.top}" stroke-width="${u(1.6)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    o.push(`<path d="M${X(0)},${Y(sh0)}L${X(0)},${Y(hy + 3)}" stroke="${g.skin}" stroke-width="${u(1.8)}"/><ellipse cx="${X(0.3)}" cy="${Y(hy)}" rx="${u(3.8)}" ry="${u(4.3)}" fill="${g.skin}"/>`);
    if (g.hair === 'bob') o.push(`<path d="M${X(-4.4)},${Y(hy + 3.6)}C${X(-5)},${Y(hy - 6.5)} ${X(5.4)},${Y(hy - 7)} ${X(4.4)},${Y(hy + 0.2)}L${X(2.2)},${Y(hy - 2.6)}C${X(0)},${Y(hy - 2.4)} ${X(-2)},${Y(hy - 1.4)} ${X(-2.4)},${Y(hy + 3.6)}Z" fill="${g.hairCol}"/>`);
    if (g.hair === 'hive') o.push(`<ellipse cx="${X(-0.4)}" cy="${Y(hy - 6)}" rx="${u(4.4)}" ry="${u(5.6)}" fill="${g.hairCol}"/><path d="M${X(-4.2)},${Y(hy + 2)}C${X(-4.8)},${Y(hy - 3)} ${X(2)},${Y(hy - 4.8)} ${X(4.2)},${Y(hy - 1.2)}C${X(1)},${Y(hy - 2.4)} ${X(-2)},${Y(hy - 1)} ${X(-2.6)},${Y(hy + 2)}Z" fill="${g.hairCol}"/>`);
    if (g.hair === 'flat') o.push(`<path d="M${X(-4)},${Y(hy)}C${X(-4.4)},${Y(hy - 5.8)} ${X(4.4)},${Y(hy - 6.2)} ${X(4.2)},${Y(hy - 1.6)}C${X(1)},${Y(hy - 3)} ${X(-2)},${Y(hy - 2.6)} ${X(-4)},${Y(hy)}Z" fill="${g.hairCol}"/>`);
    if (g.hair === 'flip') o.push(`<path d="M${X(-4.2)},${Y(hy + 2)}C${X(-4.6)},${Y(hy - 6)} ${X(4.6)},${Y(hy - 6.4)} ${X(4.2)},${Y(hy + 0.5)}Q${X(6.4)},${Y(hy + 3.2)} ${X(5.4)},${Y(hy + 3.6)}Q${X(3.4)},${Y(hy + 1)} ${X(2)},${Y(hy - 2.4)}C${X(0)},${Y(hy - 2)} ${X(-2)},${Y(hy - 1)} ${X(-2.4)},${Y(hy + 2)}Q${X(-5)},${Y(hy + 4.6)} ${X(-6.2)},${Y(hy + 3.6)}Z" fill="${g.hairCol}"/>`);
    o.push(`<circle cx="${X(2.1)}" cy="${Y(hy + 0.3)}" r="${u(0.6)}" fill="${K.ink}"/>`);
    if (g.helmet && !seated) o.push(`<circle cx="${X(0.2)}" cy="${Y(hy - 0.6)}" r="${u(6.6)}" fill="#e6fbfb" fill-opacity="0.28" stroke="#ffffff" stroke-width="${u(0.7)}"/><path d="M${X(-3.4)},${Y(hy - 4.4)}A${u(5)} ${u(5)} 0 0 1 ${X(1.6)},${Y(hy - 6.4)}" stroke="#ffffff" stroke-width="${u(1)}" fill="none" stroke-linecap="round"/><path d="M${X(-4.6)},${Y(hy + 4.6)}L${X(4.8)},${Y(hy + 4.6)}" stroke="#b9c7cb" stroke-width="${u(1.4)}" stroke-linecap="round"/>`);
    if (g.balloon && !seated) o.push(`<path d="M${X(4.4)},${Y(hem + 2)}L${X(8)},${Y(sh0 - 14)}" stroke="${K.ink}" stroke-width="${u(0.5)}"/><path d="M${X(8)},${Y(sh0 - 14)}m${u(-4.4)},0a${u(4.4)},${u(1.6)} 0 1 0 ${u(8.8)},0a${u(4.4)},${u(1.6)} 0 1 0 ${u(-8.8)},0z" fill="${K.orange}"/><path d="M${X(8)},${Y(sh0 - 14)}m${u(-2.4)},${u(-0.6)}a${u(2.4)},${u(2.6)} 0 0 1 ${u(4.8)},0z" fill="#dff6f6" fill-opacity="0.8"/>`);
    return o.join('');
  }
  const skins = ['#f6d4b8', '#e2a87e', '#b8784e', '#7c4d33'];
  const G = [
    { dir: 1, top: K.orange, legs: K.ink, skin: skins[0], hair: 'bob', hairCol: '#2b2320', dress: true },
    { dir: -1, top: K.teal, legs: '#e9e1d0', skin: skins[2], hair: 'flat', hairCol: '#1f1714', helmet: true, stripe: K.orange },
    { dir: 1, top: K.cream, legs: K.teal, skin: skins[1], hair: 'hive', hairCol: '#c4562a', dress: true, balloon: true },
    { dir: -1, top: K.mustard, legs: K.ink, skin: skins[3], hair: 'flip', hairCol: '#1d1512', dress: true },
    { dir: 1, top: '#ffffff', legs: K.orange, skin: skins[0], hair: 'flat', hairCol: '#e0b05a', stripe: K.teal },
    { dir: -1, top: K.tealD, legs: K.cream, skin: skins[2], hair: 'hive', hairCol: '#2a1c18', dress: true },
  ];
  const GK = 1.12 * S;

  // ---------- the plaza: a rounded terrazzo deck on an orange band ----------
  const sl = c.slab(0, 9, 0, 8, 1.6, -26, 0);
  c.push(`<ellipse cx="${f(P(4.6, 4.2)[0] + 20)}" cy="${f(P(4.6, 4.2)[1] + 40)}" rx="560" ry="230" fill="${K.ink}" fill-opacity="0.18" filter="url(#oWide)"/>`);
  c.push(`<path d="${poly(sl.band)}" fill="${c.split(K.orange, K.orangeD, sl.xa, sl.xb, sl.xf, 4)}"/>`);
  const mid = c.rr(0, 9, 0, 8, 1.6, -9); c.push(`<path d="${line(mid.slice(Math.floor(mid.length * 0.24), Math.floor(mid.length * 0.76) + 1))}" stroke="${K.cream}" stroke-width="4" fill="none"/>`);
  c.push(`<path d="${poly(sl.top)}" fill="${K.cream}"/>`);
  const tid = c.id('ot'); c.def(`<clipPath id="${tid}"><path d="${poly(sl.top)}"/></clipPath>`);
  const tr = rng(19); let terr = ''; for (let i = 0; i < 900; i++) { const p = P(tr() * 9, tr() * 8); terr += `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(0.6 + tr() * 1.2)}" fill="${[K.teal, K.orange, '#9aa7a8', K.mustard, '#c9b89a'][i % 5]}" fill-opacity="0.45"/>`; }
  c.push(`<g clip-path="url(#${tid})">${terr}</g>`);
  // lawns: rounded grass lozenges
  [[0.4, 2.6, 0.4, 3.6], [5.6, 8.6, 6.0, 7.6], [0.4, 3.3, 5.2, 7.6]].forEach(([x0, x1, y0, y1]) => c.push(`<path d="${poly(c.rr(x0, x1, y0, y1, 0.7, 0))}" fill="${K.grass}"/><path d="${poly(c.rr(x0, x1, y0, y1, 0.7, 0))}" fill="none" stroke="${shade(K.grass, 0.8)}" stroke-width="2"/>`));
  // kidney pool with a cream coping
  const pool = blobPts(1.9, 6.4, 0.95, 5, 60, 1.6).map((q) => P(q[0], q[1], 0));
  c.push(`<path d="${smoothPath(pool, true)}" fill="${K.cream}" stroke="${K.creamD}" stroke-width="7"/><path d="${smoothPath(pool, true)}" fill="${K.teal}" transform="translate(0,2) scale(1)"/>`);
  c.push(`<path d="${smoothPath(blobPts(1.9, 6.4, 0.72, 5, 60, 1.6).map((q) => P(q[0], q[1], 0)), true)}" fill="#55c3c0"/>`);
  for (const [x, y] of [[1.6, 6.1], [2.2, 6.6], [1.9, 6.9]]) { const p = P(x, y); c.push(`<path d="M${f(p[0] - 9)},${f(p[1])}q4.5,-3 9,0t9,0" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-opacity="0.8"/>`); }
  // walkways: teal terrazzo, a boomerang curve, orange edging
  const walk = [ribbon(P, [[0.15, 4.6], [2.5, 4.4], [4.4, 4.9], [6.2, 5.5], [8.85, 5.3]], 0.92, 0, 6), ribbon(P, [[4.5, 4.9], [4.65, 6.4], [4.25, 7.85]], 0.85, 0, 6)];
  walk.forEach((w) => c.push(`<path d="${smoothPath(w.poly, true)}" fill="#8fc1bf"/>`));
  walk.forEach((w) => c.push(`<path d="${smoothPath(w.L)}" stroke="${K.orange}" stroke-width="2.4" fill="none"/><path d="${smoothPath(w.R)}" stroke="${K.orange}" stroke-width="2.4" fill="none"/>`));
  walk.forEach((w) => w.mid.forEach((m, i) => { if (i % 3) return; const p = P(m[0], m[1]); c.push(`<path d="M${f(p[0] - 9)},${f(p[1] + 2)}q9,-9 18,0" stroke="${K.cream}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-opacity="0.8"/>`); }));

  // ---------- monorail: a cream beam on swept chrome pylons, a three-car bullet train ----------
  const rail = Track([[0.3, 4.9, 86], [0.55, 3.0, 86], [1.4, 1.0, 86], [3.6, 0.15, 86], [6.2, 0.2, 86], [8.1, 0.6, 86]], 10, false);
  const rp_ = rail.pts;
  rp_.forEach((p, i) => { if (!(i % 10 === 2 || i === rp_.length - 3)) return; c.add(p[0] + p[1] - 0.3, () => {
    shadow(p[0] + 0.3, p[1] + 0.3, 14, 6);
    const a = P(p[0] + 0.32, p[1] + 0.32, 0), b = P(p[0], p[1], p[2] - 12), m = P(p[0] + 0.28, p[1] + 0.28, 40);
    c.push(`<path d="M${f(a[0] - 3)},${f(a[1])}Q${f(m[0] - 2)},${f(m[1])} ${f(b[0] - 12)},${f(b[1])}L${f(b[0] + 12)},${f(b[1])}Q${f(m[0] + 4)},${f(m[1])} ${f(a[0] + 3)},${f(a[1])}Z" fill="${chromeV}" stroke="#34434a" stroke-width="1"/>`);
  }); });
  for (let i = 0; i < rp_.length - 1; i++) {
    const p = rp_[i], q = rp_[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.16, ny = dx / l * 0.16;
    c.add((p[0] + p[1] + q[0] + q[1]) / 2 - 0.25, () => {
      const T = [P(p[0] + nx, p[1] + ny, p[2]), P(q[0] + nx, q[1] + ny, q[2]), P(q[0] - nx, q[1] - ny, q[2]), P(p[0] - nx, p[1] - ny, p[2])];
      const fs = nx + ny > 0 ? 1 : -1, F = [P(p[0] + nx * fs, p[1] + ny * fs, p[2]), P(q[0] + nx * fs, q[1] + ny * fs, q[2]), P(q[0] + nx * fs, q[1] + ny * fs, q[2] - 12), P(p[0] + nx * fs, p[1] + ny * fs, p[2] - 12)];
      c.push(`<path d="${poly(F)}" fill="${K.creamD}" stroke="${K.creamD}" stroke-width="0.8"/><path d="M${pt(lerp2(F[3], F[0], 0.45))}L${pt(lerp2(F[2], F[1], 0.45))}" stroke="${K.orange}" stroke-width="2.4"/><path d="${poly(T)}" fill="${K.cream}" stroke="${K.cream}" stroke-width="0.8"/>`);
    });
  }
  function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, rail, rail.tot * 0.2 + k * 0.7, 0.66, 0.4, 15, 0);
    c.add(car.depth + 0.1, () => {
      c.push(`<path d="${rp(car.top, 6)}" fill="#2e4a52"/>`);
      [-0.18, 0.18].map((u) => car.seat(u, 9)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j) % 6], dir: car.dx - car.dy > 0 ? 1 : -1 }, GK * 0.92, true)); });
      car.sides.forEach((sd) => { c.push(`<path d="${rp(sd.pts, 5)}" fill="${sd.n[0] > sd.n[1] ? K.creamD : K.cream}"/>`); c.push(`<path d="M${pt(lerp2(sd.pts[0], sd.pts[3], 0.42))}L${pt(lerp2(sd.pts[1], sd.pts[2], 0.42))}" stroke="${K.orange}" stroke-width="3.4"/>`); });
      // glass canopy over the riders
      const cx = car.top.reduce((s, p) => s + p[0], 0) / 4, cy = car.top.reduce((s, p) => s + p[1], 0) / 4;
      const tt = car.top.map((p) => [p[0], p[1]]);
      c.push(`<path d="${smoothPath(tt.map((p) => [cx + (p[0] - cx) * 0.96, cy + (p[1] - cy) * 0.96 - 4]).concat(tt.map((p) => [cx + (p[0] - cx) * 0.7, cy + (p[1] - cy) * 0.7 - 22])).slice(0, 4), true)}" fill="none"/>`);
      c.push(`<path d="${rp(tt.map((p) => [cx + (p[0] - cx) * 0.98, cy + (p[1] - cy) * 0.98]), 6)}" fill="none" stroke="#ffffff" stroke-width="1.4"/>`);
      const rx = Math.hypot(tt[0][0] - tt[1][0], tt[0][1] - tt[1][1]) * 0.55; dome([cx, cy + 2], rx, rx * 0.36, 22);
    });
  });

  // ---------- Orbiter: chrome column, hub sphere, saucer gondolas under glass domes ----------
  const OB = { x: 3.9, y: 2.3 };
  c.add(OB.x + OB.y - 1.3, () => {
    shadow(OB.x, OB.y, 98, 48, 0, 0.18);
    const s = c.slab(OB.x - 1.3, OB.x + 1.3, OB.y - 1.3, OB.y + 1.3, 1.3, 0, 7);
    c.push(`<path d="${poly(s.band)}" fill="${c.split(K.teal, K.tealD, s.xa, s.xb, s.xf, 2)}"/><path d="${poly(s.top)}" fill="${K.cream}"/>`);
    for (let i = 0; i < 16; i++) { const a0 = i / 16 * Math.PI * 2, a1 = a0 + Math.PI / 16, r1 = 1.2; c.push(`<path d="${poly([P(OB.x, OB.y, 7), P(OB.x + r1 * Math.cos(a0), OB.y + r1 * Math.sin(a0), 7), P(OB.x + r1 * Math.cos(a1), OB.y + r1 * Math.sin(a1), 7)])}" fill="${i % 2 ? K.orange : K.mustard}" fill-opacity="0.9"/>`); }
    const cc = P(OB.x, OB.y, 7); c.push(`<ellipse cx="${f(cc[0])}" cy="${f(cc[1])}" rx="26" ry="13" fill="${K.teal}"/>`);
  });
  const gond = Array.from({ length: 5 }, (_, i) => { const a = i / 5 * Math.PI * 2 + 0.5; return { a, x: OB.x + 1.05 * Math.cos(a), y: OB.y + 1.05 * Math.sin(a), col: [K.orange, K.teal, K.mustard, K.orange, K.teal][i] }; });
  const hubZ = 92;
  gond.forEach((gd, i) => c.add(gd.x + gd.y - 0.5, () => {
    const h = P(OB.x + 0.12 * Math.cos(gd.a), OB.y + 0.12 * Math.sin(gd.a), hubZ), e = P(gd.x, gd.y, 64);
    c.push(tube(`M${pt(h)}Q${pt(P(OB.x + 0.7 * Math.cos(gd.a), OB.y + 0.7 * Math.sin(gd.a), hubZ + 18))} ${pt(e)}`, 3.4));
    const g = cupGeom(c, gd.x, gd.y, 0.32, 48, 60), t = flat(gd.col);
    c.push(`<path d="M${pt([g.c0[0] - g.rx * 0.5, g.c0[1]])}L${pt([g.c0[0], g.c0[1] + 12])}L${pt([g.c0[0] + g.rx * 0.5, g.c0[1]])}Z" fill="${chromeV}"/>`);
    c.push(`<path d="${g.d}" fill="${c.split(t.left, t.right, g.c0[0] - g.rx, g.c0[0] + g.rx, g.c0[0] + g.rx * 0.2, 2)}"/><path d="${g.top}" fill="#2e4a52"/>`);
    const s = P(gd.x, gd.y, 60 - 7);
    [[-5, (i + 2) % 6, 1], [5, (i + 4) % 6, -1]].forEach(([dx, gi, dir]) => c.push(guest(s[0] + dx, s[1] + (dir > 0 ? -1 : 1), { ...G[gi], dir }, GK * 0.88, true)));
    c.push(`<path d="${g.front}" fill="${c.split(t.left, t.right, g.c0[0] - g.rx, g.c0[0] + g.rx, g.c0[0] + g.rx * 0.2, 2)}"/>`);
    c.push(`<path d="M${pt([g.c1[0] - g.rx - 5, g.c1[1]])}A${f(g.rx + 5)} ${f(g.ry + 2.5)} 0 0 0 ${pt([g.c1[0] + g.rx + 5, g.c1[1]])}" stroke="#34434a" stroke-width="5.4" fill="none" stroke-linecap="round"/><path d="M${pt([g.c1[0] - g.rx - 5, g.c1[1]])}A${f(g.rx + 5)} ${f(g.ry + 2.5)} 0 0 0 ${pt([g.c1[0] + g.rx + 5, g.c1[1]])}" stroke="#e3ecee" stroke-width="3.4" fill="none" stroke-linecap="round"/>`);
    dome(g.c1, g.rx + 3, g.ry + 1.5, 28);
  }));
  c.add(OB.x + OB.y, () => { chromeCyl(OB.x, OB.y, 0.13, 7, hubZ); const h = P(OB.x, OB.y, hubZ + 6); sphere(h[0], h[1], 15); const t = P(OB.x, OB.y, hubZ + 30); c.push(`<path d="M${f(h[0])},${f(h[1] - 14)}L${pt(t)}" stroke="#34434a" stroke-width="2.4"/>${starburst(t[0], t[1], 10, K.orange)}<circle cx="${f(t[0])}" cy="${f(t[1])}" r="3" fill="${K.mustard}"/>`); });
  gond.filter((gd) => Math.cos(gd.a) + Math.sin(gd.a) > 0.3).forEach((gd) => c.add(OB.x + OB.y + 0.02, () => { const h = P(OB.x + 0.12 * Math.cos(gd.a), OB.y + 0.12 * Math.sin(gd.a), hubZ), e = P(gd.x, gd.y, 64); c.push(tube(`M${pt(h)}Q${pt(P(OB.x + 0.7 * Math.cos(gd.a), OB.y + 0.7 * Math.sin(gd.a), hubZ + 18))} ${pt(lerp2(h, e, 0.55))}`, 3.4)); }));

  // ---------- Comet coaster: a chrome tube track, rocket cars with fins ----------
  const C0 = { x: 7.05, y: 2.95 };
  const trk = Track([[-1.5, 1.25, 12], [0.0, 1.4, 12], [1.25, 1.15, 18], [1.65, 0.1, 70], [1.25, -1.0, 132], [0.25, -1.35, 64], [-0.75, -1.25, 108], [-1.45, -0.55, 52], [-1.8, 0.45, 24]].map(([x, y, z]) => [C0.x + x, C0.y + y, z]), 10, true);
  const tp = trk.pts;
  tp.forEach((p, i) => { if (i % 5 || p[2] < 18) return; c.add(p[0] + p[1] - 0.04, () => { shadow(p[0], p[1], 6, 3); const a = P(p[0], p[1], 0), b = P(p[0], p[1], p[2] - 5); c.push(tube(`M${pt(a)}L${pt(b)}`, 2.6)); const m = P(p[0], p[1], p[2] * 0.55); c.push(`<path d="M${f(m[0] - 7)},${f(m[1] + 5)}Q${f(m[0])},${f(m[1] - 4)} ${f(m[0] + 7)},${f(m[1] + 5)}" stroke="${K.orange}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`); }); });
  for (let i = 0; i < tp.length; i++) {
    const p = tp[i], q = tp[(i + 1) % tp.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.11, ny = dx / l * 0.11;
    c.add((p[0] + q[0] + p[1] + q[1]) / 2, () => {
      c.push(`<path d="M${pt(P(p[0], p[1], p[2] - 6))}L${pt(P(q[0], q[1], q[2] - 6))}" stroke="${K.teal}" stroke-width="${f(5.5 * S)}" stroke-linecap="round"/>`);
      for (const s of [1, -1]) c.push(tube(`M${pt(P(p[0] + nx * s, p[1] + ny * s, p[2]))}L${pt(P(q[0] + nx * s, q[1] + ny * s, q[2]))}`, 2.4 * S));
    });
  }
  c.add(C0.x + C0.y + 0.85, () => { box(C0.x - 1.5, C0.x + 0.15, C0.y + 1.58, C0.y + 2.0, 0, 9, K.cream, 3); const p0 = P(C0.x - 1.5, C0.y + 2.0, 9), p1 = P(C0.x + 0.15, C0.y + 2.0, 9); c.push(`<path d="M${pt(p0)}L${pt(p1)}" stroke="${K.orange}" stroke-width="3"/>`); });
  [0, 1, 2].forEach((k) => {
    const car = carGeom(P, trk, 0.3 + k * 0.62, 0.52, 0.42, 12, 2);
    const col = [K.orange, K.teal, K.mustard][k];
    c.add(car.depth + 0.25, () => {
      c.push(`<path d="${rp(car.top, 4)}" fill="#2e4a52"/>`);
      [-0.2, 0.2].map((u) => car.seat(u, 8)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach((s, j) => { const p = P(...s); c.push(guest(p[0], p[1], { ...G[(k * 2 + j + 3) % 6], dir: 1 }, GK * 0.9, true)); });
      car.sides.forEach((sd) => { c.push(`<path d="${rp(sd.pts, 4)}" fill="${sd.n[0] > sd.n[1] ? shade(col, 0.8) : col}"/>`); if (!sd.end) c.push(`<path d="M${pt(lerp2(sd.pts[0], sd.pts[3], 0.5))}L${pt(lerp2(sd.pts[1], sd.pts[2], 0.5))}" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.8"/>`); });
      // tail fin: a boomerang blade at the back of the car
      const tail = P(...car.seat(-0.5, 0)); c.push(`<path d="M${f(tail[0] - 2)},${f(tail[1])}q-4,-14 -12,-16q8,9 6,18z" fill="${chromeV}" stroke="#34434a" stroke-width="0.8"/>`);
      c.push(`<path d="${rp(car.top, 4)}" fill="none" stroke="#e3ecee" stroke-width="2"/>`);
    });
  });
  [[C0.x - 1.15, C0.y + 1.8], [C0.x - 0.7, C0.y + 1.8]].forEach(([x, y], i) => c.add(x + y + 0.9, () => { const p = P(x, y, 9); c.push(guest(p[0], p[1], G[[0, 4][i]], GK)); }));

  // ---------- Googie snack kiosk: glass drum, boomerang roof, starburst sign ----------
  const GS = { x: 6.3, y: 6.55 };
  c.add(GS.x + GS.y, () => {
    shadow(GS.x, GS.y, 50, 24);
    const b2 = c.cylSide(GS.x, GS.y, 0.54, 0, 11), t2 = flat(K.orange); c.push(`<path d="${b2.d}" fill="${c.split(t2.left, t2.right, b2.c0[0] - b2.rx, b2.c0[0] + b2.rx, b2.c0[0] + b2.rx * 0.2, 2)}"/><path d="${b2.top}" fill="${K.cream}"/>`);
    const s = c.cylSide(GS.x, GS.y, 0.46, 11, 36);
    c.push(`<path d="${s.d}" fill="#bfe8e6"/><path d="${s.top}" fill="${K.cream}"/>`);
    for (let i = 1; i < 6; i++) { const a = Math.PI * i / 6, x = s.c0[0] - Math.cos(a) * s.rx; c.push(`<path d="M${f(x)},${f(s.c0[1] + Math.sin(a) * s.ry)}L${f(x)},${f(s.c1[1] + Math.sin(a) * s.ry)}" stroke="#ffffff" stroke-width="2"/>`); }
    c.push(`<path d="M${pt([s.c0[0] - s.rx * 0.7, s.c0[1] - 6])}L${pt([s.c0[0] - s.rx * 0.7, s.c1[1] + 8])}" stroke="#ffffff" stroke-width="4" stroke-opacity="0.7"/>`);
    c.push(`<circle cx="${f(s.c0[0] - 8)}" cy="${f(s.c0[1] - 18)}" r="4" fill="${K.mustard}"/><path d="M${f(s.c0[0] + 4)},${f(s.c0[1] - 14)}l4,-10l4,10z" fill="${K.orange}"/>`);
    // boomerang roof: a V-shaped slab, tips raised
    const bo = (z, dz) => [[-0.95, 0.6, z + dz], [0.48, 0.48, z], [0.6, -0.95, z + dz], [0.38, -0.98, z + dz], [0.12, 0.12, z], [-0.98, 0.38, z + dz]].map(([x, y, zz]) => P(GS.x + x, GS.y + y, zz));
    const top = bo(42, 10), under = top.map((p) => [p[0], p[1] + 6]);
    c.push(`<path d="${rp(under, 4)}" fill="${K.tealD}"/><path d="${rp(top, 4)}" fill="${K.orange}"/><path d="${rp(top, 4)}" fill="none" stroke="#ffb07a" stroke-width="1.6"/>`);
    const pole0 = P(GS.x + 0.9, GS.y + 0.6, 0), pole1 = P(GS.x + 0.6, GS.y + 0.3, 92);
    c.push(tube(`M${pt(pole0)}L${pt(pole1)}`, 3));
    const sg = P(GS.x + 0.66, GS.y + 0.36, 72);
    c.push(`<path d="${rp([[sg[0] - 24, sg[1] - 9], [sg[0] + 28, sg[1] - 15], [sg[0] + 24, sg[1] + 5], [sg[0] - 28, sg[1] + 9]], 5)}" fill="${K.teal}" stroke="${K.cream}" stroke-width="2"/><text x="${f(sg[0])}" y="${f(sg[1] + 3)}" font-size="10.5" font-weight="800" fill="${K.cream}" text-anchor="middle" transform="rotate(-8 ${f(sg[0])} ${f(sg[1])})" letter-spacing="1">SNACKS</text>`);
    c.push(starburst(pole1[0], pole1[1], 13, K.orange) + `<circle cx="${f(pole1[0])}" cy="${f(pole1[1])}" r="4" fill="${K.mustard}"/>`);
  });

  // ---------- starburst lamps, boomerang planters, palms ----------
  const lamp = (x, y) => c.add(x + y, () => {
    shadow(x, y, 6, 3);
    const a = P(x, y, 0), t = P(x, y, 58);
    c.push(tube(`M${pt(a)}L${pt(t)}`, 2.2) + `<circle cx="${f(t[0])}" cy="${f(t[1])}" r="16" fill="${K.mustard}" fill-opacity="0.32" filter="url(#oSoft)"/>` + starburst(t[0], t[1], 12, K.ink) + `<circle cx="${f(t[0])}" cy="${f(t[1])}" r="4.2" fill="#fff4c8" stroke="${K.mustard}" stroke-width="1.6"/>`);
  });
  lamp(1.5, 4.0); lamp(3.6, 5.3); lamp(5.6, 4.85); lamp(7.6, 6.1); lamp(3.9, 7.4);
  const planter = (x, y, flip = 1) => c.add(x + y, () => {
    const shape = [[-0.8, -0.3], [0, 0.15], [0.8, -0.3], [0.85, 0.05], [0, 0.5], [-0.85, 0.05]].map(([a, b]) => [x + a, y + b * flip]);
    const t = shape.map((q) => P(q[0], q[1], 12)), bt = shape.map((q) => P(q[0], q[1], 0));
    c.push(`<path d="${rp(hull(t.concat(bt)), 4)}" fill="${K.tealD}"/><path d="${rp(t, 4)}" fill="${K.teal}"/><path d="${rp(t.map((p) => [p[0], p[1] + 1.5]), 4)}" fill="#6b4a32" transform="scale(1)" opacity="0.0"/>`);
    shape.forEach((q, i) => { if (i % 2) return; const b = P(q[0] * 0.8 + x * 0.2, q[1] * 0.8 + y * 0.2, 12); for (let k = -2; k <= 2; k++) c.push(`<path d="M${f(b[0] + k * 2.4)},${f(b[1])}l${f(k * 2)},${f(-16 - (2 - Math.abs(k)) * 5)}l${f(1.6)},${f(16 + (2 - Math.abs(k)) * 5)}z" fill="${k % 2 ? K.leaf : shade(K.leaf, 0.8)}"/>`); });
  });
  planter(1.6, 2.2); planter(8.0, 7.0, -1); planter(5.4, 3.6);
  const palm = (x, y, h = 70) => c.add(x + y, () => {
    shadow(x, y, 26, 10);
    const b = P(x, y, 0), t = P(x + 0.1, y - 0.1, h);
    c.push(`<path d="M${pt(b)}Q${f(b[0] + 10)},${f((b[1] + t[1]) / 2)} ${pt(t)}" stroke="#b79367" stroke-width="5" fill="none" stroke-dasharray="4 1.5"/>`);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3, ex = t[0] + Math.cos(a) * 26, ey = t[1] + Math.sin(a) * 11 + 6; c.push(`<path d="M${pt(t)}Q${f((t[0] + ex) / 2)},${f(Math.min(t[1], ey) - 10)} ${f(ex)},${f(ey)}Q${f((t[0] + ex) / 2)},${f(Math.min(t[1], ey) - 3)} ${pt(t)}Z" fill="${i % 2 ? K.leaf : '#5aa66f'}"/>`); }
  });
  palm(0.8, 6.0, 74); palm(8.5, 4.4, 66); palm(3.1, 6.7, 60); palm(0.7, 1.0, 64);
  // benches: cream boomerang seats
  c.add(2.6 + 5.25, () => { const a = P(2.3, 5.25, 7), m = P(2.75, 5.1, 7), b = P(3.2, 5.25, 7); c.push(`<path d="M${pt(a)}Q${pt(m)} ${pt(b)}" stroke="${K.creamD}" stroke-width="8" stroke-linecap="round" fill="none"/><path d="M${pt(a)}Q${pt(m)} ${pt(b)}" stroke="${K.cream}" stroke-width="5" stroke-linecap="round" fill="none" transform="translate(0,-1.5)"/><path d="M${pt(m)}l0,8" stroke="#34434a" stroke-width="2"/>`); });
  // guests
  [[0.9, 4.6, 0], [2.2, 4.45, 3], [3.3, 4.6, 1], [4.6, 5.6, 5], [4.55, 6.9, 2], [5.6, 5.3, 4], [6.9, 5.6, 1], [8.1, 5.35, 3], [4.3, 4.85, 2], [5.2, 6.2, 0]].forEach(([x, y, gi]) => c.add(x + y + 0.05, () => { const p = P(x, y, 0); c.push(guest(p[0], p[1], G[gi], GK)); }));
  c.flush();

  const extraDefs = c.defs.join('') + `
    <linearGradient id="oSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd9d5"/><stop offset="0.55" stop-color="#d9efe6"/><stop offset="1" stop-color="#f6ecd8"/></linearGradient>
    <filter id="oSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="oWide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>`;
  let bg = `<rect width="1600" height="1000" fill="url(#oSky)"/>`;
  // a ringed planet, orbit lines, atomic starbursts: the 1960s idea of tomorrow
  bg += `<g transform="translate(1380 250)"><ellipse rx="150" ry="34" fill="none" stroke="${K.cream}" stroke-width="10" transform="rotate(-14)"/><circle r="70" fill="${K.orange}"/><path d="M-70,0A70,70 0 0 0 70,0Z" fill="${K.orangeD}" opacity="0.5"/><path d="M-150,0A150,34 0 0 0 150,0" fill="none" stroke="${K.cream}" stroke-width="10" transform="rotate(-14)"/></g>`;
  bg += `<ellipse cx="420" cy="380" rx="380" ry="90" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2" transform="rotate(-12 420 380)"/><ellipse cx="1200" cy="560" rx="460" ry="110" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2" transform="rotate(10 1200 560)"/>`;
  const br = rng(23); for (let i = 0; i < 18; i++) { const x = 60 + br() * 1480, y = 220 + br() * 600; if (x > 300 && x < 1350 && y > 230 && y < 760) continue; bg += `<g opacity="0.75">${starburst(x, y, 6 + br() * 10, [K.cream, K.orange, '#ffffff'][i % 3], 8)}</g>`; }
  let lu = ''; G.forEach((g, i) => { lu += guest(110 + i * 76, 1000 - 46, g, 2 * GK); });
  frame({
    key: 'o', letter: 'O', name: 'Retro-future chrome', file: 'o-retro',
    blurb: ['A 1960s space-age park: chrome rides banded with', 'reflections, glass domes, a monorail on swept pylons,', 'boomerang roofs, starburst lamps and sleek guests.'],
    pal: [K.teal, K.tealD, K.orange, K.mustard, K.cream, '#aebcc1', K.ink], ink: K.ink, sub: '#2f6a70', panel: '#fbf4e6f0', panelInk: K.ink, panelR: 30, swatchR: 17,
    panelDeco: (x, y, w, h) => `<path d="M${x + w - 120},${y + 26}q40,-18 92,-6q-30,0 -60,16z" fill="${K.orange}"/><path d="M${x + w - 120},${y + 26}q40,-18 92,-6" fill="none" stroke="${K.teal}" stroke-width="2"/>`,
    bg, scene: c.o.join('\n'), extraDefs, lineup: { svg: lu, w: 470 },
    note: ['Chrome = 9-stop band gradient, sky over ground.', 'Paint: flat, two tones per object, hard split.', 'Glass: 30% white dome + one curved highlight.', 'Shapes: boomerangs, saucers, starbursts, fins.', 'Riders sit under canopies and in saucers.'],
  });
}

const want = process.argv.slice(2);
const all = { l: styleL, m: styleM, n: styleN, o: styleO };
for (const k of Object.keys(all)) if (!want.length || want.includes(k)) all[k]();
