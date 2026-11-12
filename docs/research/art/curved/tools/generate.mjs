// Generates the three "curved" concept sheets from ONE shared scene description.
// Only the renderer rules (fills, outlines, shading, shadows) differ per style.
import fs from 'fs';

const OUT = '/home/user/RC-TYCOON-/docs/research/art/curved';
const W = 52, H = 26, OX = 800, OY = 196;
const P = (x, y, z = 0) => [OX + (x - y) * W, OY + (x + y) * H - z];
const R2 = Math.SQRT2;
const f = (n) => Math.round(n * 100) / 100;
const pt = (p) => `${f(p[0])},${f(p[1])}`;
const FONT = `system-ui, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif`;

// ---------- colour ----------
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
// darken keeping hue (multiply), with a hint of cool so shadows don't go muddy
const shade = (c, k) => { const [r, g, b] = hex2rgb(c); return rgb2hex(r * k * 0.97, g * k * 0.985, b * Math.min(1, k * 1.04)); };
const light = (c, t) => mix(c, '#ffffff', t);

// ---------- geometry ----------
function rp(pts, r) { // rounded closed polygon
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
const ell = (c, rx, ry, t) => [c[0] + rx * Math.cos(t), c[1] + ry * Math.sin(t)];
function smoothPath(pts) { // Catmull-Rom → cubic, open
  if (pts.length < 3) return line(pts);
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- styles ----------
const STYLES = {
  a: {
    letter: 'A', name: 'Soft rounded flat', file: 'a-soft-flat',
    blurb: ['Smooth vector shapes and rounded corners. Two-tone faces', '(light / dark), thin outlines in each fill\u2019s own darker hue,', 'soft blurred ground shadows. Pastel-bright.'],
    outline: 'hue', sw: 1.6, r: 6, ink: '#2b3159',
    bg: ['#e6f3ff', '#fff3e4'], titleInk: '#2b3159', sub: '#5a5f80',
    pal: {
      grass: '#97d77a', grassAlt: '#a2dd86', tuft: '#79c063', earth: '#e2b282', patch: '#89cf6e',
      path: '#f7e5c8', curb: '#e6c9a0', joint: '#dcc29d',
      stripeA: '#ff8d7e', stripeB: '#fff5e1', trim: '#ffcf5c', deck: '#ffe2ae', base: '#8ed6c4', column: '#ffd77a',
      horses: ['#ffffff', '#ffd3e4', '#d9cfff', '#fff1b0'], mane: '#ff9fb8', saddle: '#7fb6ff',
      rail: '#ff9a4d', spine: '#f6f2fb', support: '#f6f2fb', tie: '#c9837a', car: '#ff6f7d', carTrim: '#ffd166', seat: '#5b4f8f',
      wall: '#fff4e3', wood: '#e9ab72', awnA: '#6fc7f2', awnB: '#ffffff', sign: '#ffd166', scoop: '#ff9fc1', cone: '#f0b26a',
      leaf: '#6cc56f', leaf2: '#4cb47a', trunk: '#b9835a', bush: '#63c27a', flower: '#ffa3c6', flower2: '#fff3a6',
      bench: '#e8a66e', metal: '#56609a', glow: '#ffe28c', queueRail: '#7f8bd0',
      pants: ['#5466b8', '#3b4a7a', '#7a8fe0', '#d9c3a0', '#3d405c'],
    },
  },
  b: {
    letter: 'B', name: 'Clay / toy 3D', file: 'b-clay',
    blurb: ['Chunky toy-like objects with smooth gradient shading and', 'glossy highlights, as if moulded from clay or plastic.', 'No outlines; soft contact (ambient-occlusion) shadows.'],
    outline: 'none', sw: 0, r: 10, ink: '#3a2f45',
    bg: ['#fbefe2', '#e5eef7'], titleInk: '#3a2f45', sub: '#6d6178',
    pal: {
      grass: '#7fcb5c', grassAlt: '#86d063', tuft: '#6cbd4c', earth: '#d79a62', patch: '#72c252',
      path: '#f3d6ab', curb: '#e8c08c', joint: '#d9b07c',
      stripeA: '#ff5f55', stripeB: '#fff2d8', trim: '#ffc22e', deck: '#ffd88f', base: '#4fc4b0', column: '#ffcf4a',
      horses: ['#ffffff', '#ffb6d0', '#c5b5ff', '#ffe68c'], mane: '#ff7fa6', saddle: '#4f9dff',
      rail: '#ff7b2c', spine: '#fbf8ff', support: '#fbf8ff', tie: '#c25b48', car: '#ff4b5c', carTrim: '#ffc93c', seat: '#4b3f7f',
      wall: '#fff3e0', wood: '#e0904f', awnA: '#3fb2f2', awnB: '#ffffff', sign: '#ffc93c', scoop: '#ff86b4', cone: '#e8a052',
      leaf: '#5ec052', leaf2: '#38a865', trunk: '#a96c42', bush: '#4fbb63', flower: '#ff7fb0', flower2: '#fff07a',
      bench: '#dd8d50', metal: '#40508f', glow: '#ffe07a', queueRail: '#6a74d6',
      pants: ['#4a5ac0', '#2f3d70', '#6c84ea', '#d6bb92', '#35385a'],
    },
  },
  c: {
    letter: 'C', name: 'Bold cartoon', file: 'c-cartoon',
    blurb: ['Clean curved shapes with one confident ink outline width', 'everywhere. Flat bright fills with exactly one shade step.', 'Built to read at phone size.'],
    outline: 'ink', sw: 2.6, r: 5, ink: '#1f2340',
    bg: ['#cfeefe', '#e4f6ff'], titleInk: '#1f2340', sub: '#3d4266',
    pal: {
      grass: '#84d35c', grassAlt: '#84d35c', tuft: '#5fb43d', earth: '#e9a35e', patch: '#76c84f',
      path: '#ffe4b3', curb: '#f2c98a', joint: '#efcf98',
      stripeA: '#ff6150', stripeB: '#fffaf0', trim: '#ffc12e', deck: '#ffd77e', base: '#35c2a5', column: '#ffc12e',
      horses: ['#ffffff', '#ffb0cd', '#bfaeff', '#ffe27a'], mane: '#ff6f9c', saddle: '#3d9be0',
      rail: '#ff7a1a', spine: '#ffffff', support: '#ffffff', tie: '#1f2340', car: '#ff4f5e', carTrim: '#ffc12e', seat: '#1f2340',
      wall: '#fff6e6', wood: '#ec9a52', awnA: '#38a9ee', awnB: '#ffffff', sign: '#ffc12e', scoop: '#ff7fb2', cone: '#eda150',
      leaf: '#4cc55a', leaf2: '#2fb38a', trunk: '#a8673a', bush: '#45bd5d', flower: '#ff6fa8', flower2: '#fff07a',
      bench: '#ec9a52', metal: '#3b4277', glow: '#ffe066', queueRail: '#4f63d9',
      pants: ['#4f63d9', '#30425a', '#3d9be0', '#d9bf94', '#30425a'],
    },
  },
};

// ---------- second round: D, E, F, G ----------
// Same scene, same primitives. These four only add a "material" branch in the paint helpers below.
// F's six inks (plus the paper). Every colour in the F sheet is snapped to one of these at the end.
const INKS_F = { paper: '#f3e6c8', navy: '#243152', red: '#d6452f', teal: '#2a8a80', mustard: '#e8a62a', olive: '#7fa33c', peach: '#efb38f' };
STYLES.d = {
  letter: 'D', name: 'Storybook painted', file: 'd-storybook',
  blurb: ['Gouache on warm paper. Muted, sun-faded colours with a', 'baked-in paper grain, slightly wobbly hand-drawn edges and', 'coloured-pencil linework (never black). Soft violet washes.'],
  outline: 'pencil', sw: 1.3, r: 7, ink: '#5b3d33',
  bg: ['#f6ecd8', '#efe2c8'], titleInk: '#5b3d33', sub: '#8a6a58',
  pal: {
    grass: '#a9c47f', grassAlt: '#a9c47f', tuft: '#83a663', earth: '#c99a6e', patch: '#9bbb72',
    path: '#efdcbc', curb: '#d9bf98', joint: '#cdb08a',
    stripeA: '#d9735f', stripeB: '#f7ead2', trim: '#e7b65a', deck: '#efd4a2', base: '#7fb5a8', column: '#e7c06e',
    horses: ['#fbf3e4', '#eec0c4', '#c9bfe0', '#f1dfa0'], mane: '#d88a96', saddle: '#7c9cc8',
    rail: '#d98a52', spine: '#efe6da', support: '#efe6da', tie: '#a7735f', car: '#cf5f5c', carTrim: '#e8bf62', seat: '#5e4d72',
    wall: '#f6ead6', wood: '#c98e5e', awnA: '#6aa6c4', awnB: '#f8efdd', sign: '#e8bf62', scoop: '#e597aa', cone: '#d9a463',
    leaf: '#7fae62', leaf2: '#5e9a72', trunk: '#9a6b4b', bush: '#79aa69', flower: '#e58fa6', flower2: '#f3e39a',
    bench: '#c98e5e', metal: '#5a5d7e', glow: '#f6dc8c', queueRail: '#7f86b8',
    pants: ['#5b6aa6', '#44506e', '#7c8fc4', '#cdb894', '#4a4a5c'],
  },
};
STYLES.e = {
  letter: 'E', name: 'Paper craft', file: 'e-paper',
  blurb: ['Every shape is a piece of cut card: bright craft colours, a', 'thin white die-cut edge and a small crisp drop shadow under', 'each layer. Faint paper fibre texture. No outlines.'],
  outline: 'diecut', sw: 2, r: 6, ink: '#2e2a4a',
  bg: ['#dff1f5', '#f7efe1'], titleInk: '#2e2a4a', sub: '#5d5878',
  pal: {
    grass: '#6cc75a', grassAlt: '#6cc75a', tuft: '#4fae47', earth: '#c98a4e', patch: '#82d46a',
    path: '#fde3b0', curb: '#f2c37a', joint: '#e9c58e',
    stripeA: '#f2493d', stripeB: '#fff8ec', trim: '#ffbf1f', deck: '#ffd27a', base: '#1fb8a6', column: '#ffbf1f',
    horses: ['#ffffff', '#ff9cc4', '#a99cff', '#ffe066'], mane: '#ff5c95', saddle: '#2f8fe8',
    rail: '#ff7a14', spine: '#ffffff', support: '#ffffff', tie: '#b5523e', car: '#f23d52', carTrim: '#ffbf1f', seat: '#3a2f6e',
    wall: '#fff6e8', wood: '#e8893f', awnA: '#2a9ff0', awnB: '#ffffff', sign: '#ffbf1f', scoop: '#ff78ab', cone: '#e8963f',
    leaf: '#3fbf52', leaf2: '#16a389', trunk: '#9a5f33', bush: '#36b45a', flower: '#ff5fa0', flower2: '#fff066',
    bench: '#e8893f', metal: '#3a4280', glow: '#ffe066', queueRail: '#4d5fe0',
    pants: ['#4057d8', '#2d3a64', '#2f8fe8', '#d8bb8a', '#2d3a64'],
  },
};
STYLES.f = {
  letter: 'F', name: 'Retro poster', file: 'f-poster',
  blurb: ['A mid-century fairground print: six inks on cream paper, flat', 'shapes, halftone dots instead of shading, and outlines printed', 'slightly out of register. Paper grain over everything.'],
  outline: 'misreg', sw: 1.8, r: 5, ink: INKS_F.navy,
  bg: [INKS_F.paper, INKS_F.paper], titleInk: INKS_F.navy, sub: INKS_F.navy,
  pal: {
    grass: INKS_F.olive, grassAlt: INKS_F.olive, tuft: INKS_F.teal, earth: INKS_F.mustard, patch: INKS_F.olive,
    path: INKS_F.paper, curb: INKS_F.peach, joint: INKS_F.peach,
    stripeA: INKS_F.red, stripeB: INKS_F.paper, trim: INKS_F.mustard, deck: INKS_F.peach, base: INKS_F.teal, column: INKS_F.mustard,
    horses: [INKS_F.paper, INKS_F.peach, INKS_F.paper, INKS_F.mustard], mane: INKS_F.red, saddle: INKS_F.teal,
    rail: INKS_F.red, spine: INKS_F.paper, support: INKS_F.paper, tie: INKS_F.navy, car: INKS_F.red, carTrim: INKS_F.mustard, seat: INKS_F.navy,
    wall: INKS_F.paper, wood: INKS_F.mustard, awnA: INKS_F.teal, awnB: INKS_F.paper, sign: INKS_F.mustard, scoop: INKS_F.red, cone: INKS_F.peach,
    leaf: INKS_F.teal, leaf2: INKS_F.teal, trunk: INKS_F.navy, bush: INKS_F.teal, flower: INKS_F.red, flower2: INKS_F.mustard,
    bench: INKS_F.red, metal: INKS_F.navy, glow: INKS_F.mustard, queueRail: INKS_F.navy,
    pants: [INKS_F.navy, INKS_F.navy, INKS_F.teal, INKS_F.peach, INKS_F.navy],
  },
};
STYLES.g = {
  letter: 'G', name: 'Golden hour lights', file: 'g-golden',
  blurb: ['Shapes and colours of A, lit by a low evening sun from the', 'left: warm lit faces, cool blue shade sides, long soft shadows.', 'Ride bulbs, lamp and stall window glow. A day/night preview.'],
  outline: 'hue', sw: 1.4, r: 6, ink: '#2b2d5a',
  bg: ['#2c3268', '#3a2f5c'], titleInk: '#fff1dc', sub: '#ffd9b8',
  pal: { ...STYLES.a.pal },
};

// ---------- the shared scene ----------
const SCENE = {
  carousel: { x: 2.5, y: 2.5 },
  path: [...Array.from({ length: 12 }, (_, x) => [x, 6]), ...[7, 8, 9, 10, 11].map((y) => [7, y])],
  queue: [[2, 4], [2, 5]],
  stall: { x0: 7.08, x1: 7.92, y0: 5.08, y1: 5.88 },
  bench: { x0: 4.12, x1: 4.88, y0: 5.48, y1: 5.8 },
  lamp: [5.82, 5.72],
  bush: [5.25, 7.75],
  tree1: [1.25, 8.45],
  tree2: [10.35, 8.85],
  walkers: [
    { at: [3.25, 6.55], dir: -1, step: 1, skin: '#f3c9a3', shirt: '#ffd23f', pants: 3, hair: '#5a3825', hairStyle: 'pony', dress: '#2fb39a' },
    { at: [4.75, 6.3], dir: 1, step: -1, skin: '#d9a27a', shirt: '#4f63d9', pants: 1, hair: '#3b2a20', hairStyle: 'short', hat: '#e8503a' },
    { at: [6.3, 6.7], dir: 1, step: 1, skin: '#8d5a3b', shirt: '#f39a2b', pants: 2, hair: '#1f1a1a', hairStyle: 'curly', kid: true, balloon: '#56b4e9' },
    { at: [7.5, 8.4], dir: -1, step: -1, skin: '#f6d4b8', shirt: '#b78be6', pants: 3, hair: '#d9d9e3', hairStyle: 'bun' },
    { at: [8.9, 6.5], dir: 1, step: 1, skin: '#c68642', shirt: '#7cc04b', pants: 4, hair: '#2a1d14', hairStyle: 'short', pack: '#e8503a' },
  ],
  queuers: [
    { at: [2.5, 4.45], dir: -1, step: 0, skin: '#e8b48f', shirt: '#d457a8', pants: 1, hair: '#7a4a2a', hairStyle: 'short', back: true },
    { at: [2.5, 5.3], dir: -1, step: 0, skin: '#f1c27d', shirt: '#f2f2f2', pants: 0, hair: '#c47a2c', hairStyle: 'pony', back: true },
  ],
};

// coaster centreline (grid x, y, z)
function coasterSamples() {
  const pts = [];
  const push = (x, y, z) => pts.push([x, y, z]);
  for (let x = 4.75; x < 6.2; x += 0.08) push(x, 1.5, 12);
  const ease = (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.75;
  for (let x = 6.2; x < 8.6; x += 0.07) push(x, 1.5, 12 + 140 * ease((x - 6.2) / 2.4));
  for (let t = -Math.PI / 2; t < 0; t += 0.08) { const u = (t + Math.PI / 2) / (Math.PI / 2); push(8.6 + Math.cos(t), 2.5 + Math.sin(t), 152 - 4 * u); }
  const sm = (u) => u * u * (3 - 2 * u);
  for (let y = 2.5; y < 5.2; y += 0.07) push(9.6, y, 14 + 134 * (1 - sm((y - 2.5) / 2.7)));
  for (let y = 5.2; y <= 5.85; y += 0.08) push(9.6, y, 14);
  return pts;
}

// ======================================================================
function render(key, opts = {}) {
  const S = STYLES[key], C = S.pal;
  const defs = new Map(); let uid = 0; const nid = (p) => `${p}${++uid}`;
  const o = []; // output buffer
  const ink = S.ink;
  const isA = key === 'a', isB = key === 'b', isC = key === 'c';
  const isD = key === 'd', isE = key === 'e', isF = key === 'f', isG = key === 'g';
  const NEW = isD || isE || isF || isG;
  const NAVY = INKS_F.navy, PAPER = '#fffdf6';
  const GK = 0.011; // G: ground shift per unit of height (sun low on the left -> shadows run to screen right)

  // --- second-round materials (D, E, F, G) ---
  // tone of a face: top / left (lit) / right (shade)
  function tone(base, role) {
    if (isD) return role === 'top' ? light(base, 0.12) : role === 'right' ? mix(shade(base, 0.8), '#6a5a8e', 0.16) : base;
    if (isE) return role === 'top' ? light(base, 0.1) : role === 'right' ? shade(base, 0.84) : base;
    if (isF) return base; // F shades with halftone dots, not with a darker fill
    if (isG) return role === 'top' ? mix(shade(base, 0.86), '#ffa860', 0.3) : role === 'right' ? mix(shade(base, 0.55), '#2e3a8a', 0.45) : mix(base, '#ff9248', 0.3);
    return base;
  }
  const pencil = (base) => mix(shade(base, 0.52), '#6b3a2a', 0.3); // D: coloured pencil line
  const eShadow = (d, extra = '') => `<path d="${d}" transform="translate(2,2.8)" fill="#2b1a0e" fill-opacity="0.3"${extra}/>`;
  const fOutline = (d, w = 1.8) => `<path d="${d}" fill="none" stroke="${NAVY}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" transform="translate(1.5,1.1)"/>`;
  const dots = (d, pat = 'dots') => `<path d="${d}" fill="url(#${pat})"/>`;
  // paint one closed shape in a new material. role: top | left | right | flat
  function paint(d, base, role, fillOverride) {
    const fill = fillOverride || tone(base, role);
    if (isD) o.push(`<path d="${d}" fill="${fill}" stroke="${pencil(base)}" stroke-width="1.3" stroke-opacity="0.85" stroke-linejoin="round"/>`);
    else if (isE) { o.push(eShadow(d)); o.push(`<path d="${d}" fill="${fill}" stroke="${PAPER}" stroke-width="2" paint-order="stroke" stroke-linejoin="round"/>`); }
    else if (isF) { o.push(`<path d="${d}" fill="${fill}"/>`); if (role === 'right') o.push(dots(d)); o.push(fOutline(d)); }
    else if (isG) o.push(`<path d="${d}" fill="${fill}" stroke="${shade(fill, 0.6)}" stroke-width="1.4" stroke-linejoin="round"/>`);
  }

  // --- paint helpers ---
  const strokeOf = (base, w = S.sw) => {
    if (isD) return ` stroke="${pencil(base)}" stroke-width="1.3" stroke-opacity="0.85" stroke-linejoin="round" stroke-linecap="round"`;
    if (isE) return ` stroke="${PAPER}" stroke-width="2" paint-order="stroke" stroke-linejoin="round" stroke-linecap="round"`;
    if (isF) return ` stroke="${NAVY}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
    if (isG) return ` stroke="${shade(tone(base, 'left'), 0.6)}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"`;
    if (isC) return ` stroke="${ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
    if (isA) return ` stroke="${shade(base, 0.66)}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
    return '';
  };
  function grad(kind, base) {
    const k = `${kind}|${base}`; if (defs.has(k)) return `url(#${defs.get(k).id})`;
    const id = nid('g'); let s = '';
    const st = (stops) => stops.map(([o2, c, a]) => `<stop offset="${o2}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
    if (kind === 'top') s = `<linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1">${st([[0, light(base, 0.38)], [1, light(base, 0.08)]])}</linearGradient>`;
    else if (kind === 'left') s = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${st([[0, light(base, 0.06)], [0.7, base], [1, shade(base, 0.8)]])}</linearGradient>`;
    else if (kind === 'right') s = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${st([[0, shade(base, 0.86)], [1, shade(base, 0.66)]])}</linearGradient>`;
    else if (kind === 'cyl') {
      if (isB) s = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${st([[0, shade(base, 0.86)], [0.22, light(base, 0.32)], [0.5, base], [1, shade(base, 0.64)]])}</linearGradient>`;
      else if (NEW) s = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${st([[0, tone(base, 'left')], [0.6, tone(base, 'left')], [0.6, tone(base, 'right')], [1, tone(base, 'right')]])}</linearGradient>`;
      else s = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${st([[0, base], [0.6, base], [0.6, shade(base, isC ? 0.8 : 0.84)], [1, shade(base, isC ? 0.8 : 0.84)]])}</linearGradient>`;
    } else if (kind === 'sphere') s = `<radialGradient id="${id}" cx="0.36" cy="0.3" r="0.78">${st([[0, light(base, 0.45)], [0.45, base], [1, shade(base, 0.68)]])}</radialGradient>`;
    else if (kind === 'hgrad') s = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.3">${st([[0, light(base, 0.3)], [0.55, base], [1, shade(base, 0.72)]])}</linearGradient>`;
    else if (kind === 'glow') s = `<radialGradient id="${id}">${st([[0, base, 0.75], [1, base, 0]])}</radialGradient>`;
    defs.set(k, { id, s }); return `url(#${id})`;
  }

  // a flat polygon face of an iso solid
  function face(pts, base, role, r = S.r) {
    const d = rp(pts, r);
    if (NEW) { paint(d, base, role === 'top' || role === 'right' ? role : 'left'); return; }
    if (isB) {
      const fill = role === 'top' ? grad('top', base) : role === 'left' ? grad('left', base) : role === 'right' ? grad('right', base) : grad('hgrad', base);
      o.push(`<path d="${d}" fill="${fill}"/>`);
    } else {
      const fill = role === 'top' ? (isA ? light(base, 0.14) : base) : role === 'right' ? shade(base, isC ? 0.8 : 0.84) : base;
      o.push(`<path d="${d}" fill="${fill}"${strokeOf(base)}/>`);
    }
  }
  // iso box
  function box(x0, x1, y0, y1, z0, z1, base, r = S.r, cols = {}) {
    const right = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)];
    const left = [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)];
    const top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
    face(right, cols.right || base, 'right', r); face(left, cols.left || base, 'left', r); face(top, cols.top || base, 'top', r);
    if (isB) { // rim light on the front edges of the top: the "moulded" edge
      o.push(`<path d="${line([P(x0 + 0.06, y1, z1 - 1), P(x1, y1, z1 - 1), P(x1, y0 + 0.06, z1 - 1)])}" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="2.5" filter="url(#blur1)" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }
  // vertical cylinder
  function cyl(gx, gy, r, z0, z1, base, topCol) {
    const c0 = P(gx, gy, z0), c1 = P(gx, gy, z1); const rx = R2 * W * r, ry = R2 * H * r;
    const side = `M${pt([c1[0] - rx, c1[1]])}L${pt([c0[0] - rx, c0[1]])}A${f(rx)} ${f(ry)} 0 0 0 ${pt([c0[0] + rx, c0[1]])}L${pt([c1[0] + rx, c1[1]])}Z`;
    const tc = topCol || base;
    if (NEW) {
      paint(side, base, 'left', grad('cyl', base));
      if (isF) { // halftone on the shade side only
        const cid = nid('cp');
        o.push(`<clipPath id="${cid}"><rect x="${f(c0[0] + rx * 0.2)}" y="${f(Math.min(c0[1], c1[1]) - ry - 4)}" width="${f(rx * 0.9)}" height="${f(Math.abs(c0[1] - c1[1]) + ry * 2 + 8)}"/></clipPath>`);
        o.push(`<path d="${side}" fill="url(#dots)" clip-path="url(#${cid})"/>`);
      }
      paint(ellD(c1, rx, ry), tc, 'top');
      return;
    }
    if (isB) o.push(`<path d="${side}" fill="${grad('cyl', base)}"/>`);
    else o.push(`<path d="${side}" fill="${grad('cyl', base)}"${strokeOf(base)}/>`);
    if (isB) {
      o.push(`<ellipse cx="${f(c1[0])}" cy="${f(c1[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="${grad('top', tc)}"/>`);
      o.push(`<path d="M${pt([c1[0] - rx * 0.92, c1[1] + ry * 0.1])}A${f(rx * 0.95)} ${f(ry * 0.95)} 0 0 0 ${pt([c1[0] + rx * 0.4, c1[1] + ry * 0.92])}" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round"/>`);
    } else o.push(`<ellipse cx="${f(c1[0])}" cy="${f(c1[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="${isA ? light(tc, 0.14) : tc}"${strokeOf(tc)}/>`);
  }
  // round blob (foliage, heads, balls). rx/ry in screen px
  function blob(cx, cy, rx, base, ry = rx) {
    if (NEW) {
      const dA = ellD([cx, cy], rx, ry), dL = ellD([cx - rx * 0.13, cy - ry * 0.14], rx * 0.8, ry * 0.8);
      if (isE) o.push(eShadow(dA));
      o.push(`<path d="${dA}" fill="${isF ? base : tone(base, 'right')}"${isE ? ` stroke="${PAPER}" stroke-width="${rx < 4 ? 1.2 : 2}" paint-order="stroke"` : ''}/>`);
      if (isF) o.push(dots(dA));
      o.push(`<path d="${dL}" fill="${isG ? tone(base, 'left') : isD ? light(base, 0.06) : base}"/>`);
      if (isD) o.push(`<path d="${dA}" fill="none" stroke="${pencil(base)}" stroke-width="1.2" stroke-opacity="0.85"/>`);
      if (isF) o.push(fOutline(dA, rx < 4 ? 1.2 : 1.8));
      if (isG) o.push(`<path d="${dA}" fill="none" stroke="${shade(tone(base, 'left'), 0.6)}" stroke-width="1.3"/>`);
      return;
    }
    if (isB) {
      o.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${grad('sphere', base)}"/>`);
      o.push(`<ellipse cx="${f(cx - rx * 0.36)}" cy="${f(cy - ry * 0.42)}" rx="${f(rx * 0.26)}" ry="${f(ry * 0.15)}" transform="rotate(-28 ${f(cx - rx * 0.36)} ${f(cy - ry * 0.42)})" fill="#fff" fill-opacity="0.6"/>`);
    } else {
      const dk = shade(base, isC ? 0.8 : 0.84);
      o.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${dk}"/>`);
      o.push(`<ellipse cx="${f(cx - rx * 0.13)}" cy="${f(cy - ry * 0.14)}" rx="${f(rx * 0.8)}" ry="${f(ry * 0.8)}" fill="${isA ? light(base, 0.06) : base}"/>`);
      o.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="none"${strokeOf(base)}/>`);
    }
  }
  // tube along a polyline (rails, posts, legs)
  function tube(pts, w, base, smooth = false, extra = '') {
    const d = smooth ? smoothPath(pts) : line(pts);
    const cap = ` fill="none" stroke-linecap="round" stroke-linejoin="round"${extra}`;
    if (isD) { o.push(`<path d="${d}"${cap} stroke="${pencil(base)}" stroke-opacity="0.9" stroke-width="${f(w + 2)}"/>`); o.push(`<path d="${d}"${cap} stroke="${base}" stroke-width="${f(w)}"/>`); }
    else if (isE) { o.push(`<path d="${d}"${cap} stroke="#2b1a0e" stroke-opacity="0.3" stroke-width="${f(w + 2)}" transform="translate(2,2.8)"/>`); o.push(`<path d="${d}"${cap} stroke="${PAPER}" stroke-width="${f(w + 2.2)}"/>`); o.push(`<path d="${d}"${cap} stroke="${base}" stroke-width="${f(w)}"/>`); }
    else if (isF) { o.push(`<path d="${d}"${cap} stroke="${NAVY}" stroke-width="${f(w + 2.6)}" transform="translate(1.5,1.1)"/>`); o.push(`<path d="${d}"${cap} stroke="${base}" stroke-width="${f(w)}"/>`); }
    else if (isG) { const lit = tone(base, 'left'); o.push(`<path d="${d}"${cap} stroke="${mix(shade(base, 0.5), '#2a3480', 0.35)}" stroke-width="${f(w + 2.2)}"/>`); o.push(`<path d="${d}"${cap} stroke="${lit}" stroke-width="${f(w)}"/>`); }
    else if (isC) { o.push(`<path d="${d}"${cap} stroke="${ink}" stroke-width="${f(w + S.sw * 2)}"/>`); o.push(`<path d="${d}"${cap} stroke="${base}" stroke-width="${f(w)}"/>`); }
    else if (isA) { o.push(`<path d="${d}"${cap} stroke="${shade(base, 0.66)}" stroke-width="${f(w + 2.4)}"/>`); o.push(`<path d="${d}"${cap} stroke="${base}" stroke-width="${f(w)}"/>`); }
    else {
      o.push(`<path d="${d}"${cap} stroke="${shade(base, 0.62)}" stroke-width="${f(w + 1.6)}"/>`);
      o.push(`<path d="${d}"${cap} stroke="${base}" stroke-width="${f(w)}"/>`);
      o.push(`<path d="${d}"${cap} stroke="#fff" stroke-opacity="0.55" stroke-width="${f(Math.max(1, w * 0.3))}" transform="translate(${f(-w * 0.18)},${f(-w * 0.22)})"/>`);
    }
  }
  // a generic small shape (guest parts, icons)
  function shape(d, base, round = false) {
    if (NEW) { paint(d, base, 'left'); return; }
    if (isB) o.push(`<path d="${d}" fill="${round ? grad('sphere', base) : grad('hgrad', base)}"/>`);
    else o.push(`<path d="${d}" fill="${isA ? light(base, 0.04) : base}"${strokeOf(base, isC ? S.sw : 1.3)}/>`);
  }
  // soft ground shadow
  function shadow(d, k = 1) {
    if (isD) { o.push(`<path d="${d}" fill="#5b4a78" fill-opacity="${f(0.2 * k)}" filter="url(#soft)"/>`); return; }
    if (isE) { o.push(`<path d="${d}" fill="#2b1a0e" fill-opacity="${f(0.2 * k)}" filter="url(#softE)" transform="translate(2,1.5)"/>`); return; }
    if (isF) { o.push(`<path d="${d}" fill="url(#dotsShadow)"/>`); return; }
    if (isG) { // stretched away from the low sun (to the right)
      const prs = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]; const xs = prs.map((m) => +m[1]), ys = prs.map((m) => +m[2]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), cy = (Math.min(...ys) + Math.max(...ys)) / 2, ax = x0 + (x1 - x0) * 0.3;
      o.push(`<path d="${d}" fill="#262a6e" fill-opacity="${f(0.3 * k)}" filter="url(#soft)" transform="translate(${f(ax)},${f(cy)}) matrix(2.1,0.12,0,1,0,0) translate(${f(-ax)},${f(-cy)})"/>`);
      return;
    }
    if (isB) {
      o.push(`<path d="${d}" fill="#3b2a2a" fill-opacity="${f(0.2 * k)}" filter="url(#aoWide)"/>`);
      o.push(`<path d="${d}" fill="#2a1d24" fill-opacity="${f(0.22 * k)}" filter="url(#aoTight)" transform="scale(1)"/>`);
    } else if (isA) o.push(`<path d="${d}" fill="#2d5d46" fill-opacity="${f(0.2 * k)}" filter="url(#soft)"/>`);
    else o.push(`<path d="${d}" fill="#1f2340" fill-opacity="${f(0.17 * k)}" filter="url(#softC)"/>`);
  }
  const ellD = (c, rx, ry) => `M${pt([c[0] - rx, c[1]])}A${f(rx)} ${f(ry)} 0 1 0 ${pt([c[0] + rx, c[1]])}A${f(rx)} ${f(ry)} 0 1 0 ${pt([c[0] - rx, c[1]])}Z`;
  const groundEll = (gx, gy, r, dx = 0.12, dy = 0.06) => ellD(P(gx + dx, gy + dy), R2 * W * r, R2 * H * r);

  // ================= background + title =================
  o.push(`<rect width="1600" height="1000" fill="url(#bg)"/>`);
  if (isC) { // flat backdrop with soft dots
    for (const [x, y, w] of [[260, 300, 120], [1350, 250, 150], [1460, 640, 110], [150, 640, 90]]) o.push(`<path d="M${x - w / 2},${y}a${w / 4},${w / 4} 0 0 1 ${w / 4},-${w / 5}a${w / 3.2},${w / 3.2} 0 0 1 ${w / 2},0a${w / 4},${w / 4} 0 0 1 ${w / 4},${w / 5}z" fill="#ffffff" stroke="#1f2340" stroke-width="2.6" stroke-linejoin="round" opacity="0.9"/>`);
  }
  if (isB) o.push(`<ellipse cx="800" cy="905" rx="660" ry="70" fill="#5a3b2a" fill-opacity="0.16" filter="url(#aoWide2)"/>`);
  if (isA) o.push(`<ellipse cx="800" cy="890" rx="640" ry="48" fill="#5b7aa8" fill-opacity="0.13" filter="url(#soft2)"/>`);
  if (isC) o.push(`<ellipse cx="800" cy="884" rx="600" ry="36" fill="#1f2340" fill-opacity="0.1" filter="url(#soft2)"/>`);
  if (isD) { // loose watercolour washes on the paper
    o.push(`<rect width="1600" height="1000" fill="#000" filter="url(#paperD)" opacity="0.5"/>`);
    o.push(`<g filter="url(#paint)">`);
    o.push(`<path d="M120,520C140,330 420,250 620,300C820,190 1180,200 1350,330C1520,430 1520,640 1360,760C1150,900 500,930 300,820C160,760 105,650 120,520Z" fill="#bcdcc8" fill-opacity="0.6"/>`);
    o.push(`<path d="M980,170C1080,120 1250,140 1300,210C1260,260 1080,270 990,240Z" fill="#f6c39a" fill-opacity="0.6"/>`);
    o.push(`<ellipse cx="800" cy="890" rx="620" ry="44" fill="#6a5a8e" fill-opacity="0.16" filter="url(#soft2)"/>`);
    o.push(`</g>`);
  }
  if (isE) { // card clouds and a sun, each a cut piece with its own little shadow
    for (const [x, y, w] of [[250, 300, 130], [1360, 250, 160], [1470, 630, 110], [140, 650, 90]]) {
      const d = `M${x - w / 2},${y}a${w / 4},${w / 4} 0 0 1 ${w / 4},-${w / 5}a${w / 3.2},${w / 3.2} 0 0 1 ${w / 2},0a${w / 4},${w / 4} 0 0 1 ${w / 4},${w / 5}z`;
      o.push(eShadow(d)); o.push(`<path d="${d}" fill="#ffffff"/>`);
    }
    o.push(`<ellipse cx="800" cy="888" rx="610" ry="34" fill="#2b1a0e" fill-opacity="0.13" filter="url(#soft2)"/>`);
  }
  if (isF) { // sunburst printed in a mustard halftone
    for (let i = 0; i < 24; i += 2) {
      const a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2, R = 1400;
      o.push(`<path d="M800,560L${f(800 + Math.cos(a0) * R)},${f(560 + Math.sin(a0) * R)}L${f(800 + Math.cos(a1) * R)},${f(560 + Math.sin(a1) * R)}Z" fill="url(#dotsSun)"/>`);
    }
    o.push(`<rect x="22" y="22" width="1556" height="956" rx="6" fill="none" stroke="${NAVY}" stroke-width="3"/>`);
    o.push(`<rect x="31" y="31" width="1538" height="938" rx="4" fill="none" stroke="${INKS_F.red}" stroke-width="1.5"/>`);
    o.push(`<path d="${ellD([800, 884], 600, 34)}" fill="url(#dotsFaint)"/>`);
  }
  if (isG) { // low sun on the left, haze, first stars
    o.push(`<rect width="1600" height="1000" fill="url(#skyG)"/>`);
    o.push(`<circle cx="150" cy="470" r="150" fill="url(#sunHalo)"/>`);
    o.push(`<circle cx="150" cy="470" r="44" fill="#fff0c4"/>`);
    const rr = rng(21); for (let i = 0; i < 40; i++) { const x = 300 + rr() * 1280, y = 20 + rr() * 220; o.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.6 + rr() * 1.1)}" fill="#fff6e0" fill-opacity="${f(0.35 + rr() * 0.5)}"/>`); }
    o.push(`<ellipse cx="900" cy="892" rx="700" ry="46" fill="#1c1d4a" fill-opacity="0.35" filter="url(#soft2)"/>`);
  }
  if (isD) o.push(`<g filter="url(#paint)">`); // everything in the scene gets the wobbly edge + pigment grain

  // ================= island =================
  const T = 12, slab = 40;
  {
    const top = [P(0, 0), P(T, 0), P(T, T), P(0, T)];
    const leftF = [P(0, T), P(T, T), P(T, T, -slab), P(0, T, -slab)];
    const rightF = [P(T, 0), P(T, T), P(T, T, -slab), P(T, 0, -slab)];
    if (isB) {
      o.push(`<path d="${rp(leftF, 16)}" fill="${grad('left', C.earth)}"/>`);
      o.push(`<path d="${rp(rightF, 16)}" fill="${grad('right', C.earth)}"/>`);
      // a fat grass lip
      o.push(`<path d="${rp([P(0, T, 0), P(T, T, 0), P(T, 0, 0), P(T, 0, -10), P(T, T, -10), P(0, T, -10)], 10)}" fill="${shade(C.grass, 0.86)}"/>`);
      o.push(`<path d="${rp(top, 18)}" fill="${C.grass}"/>`);
      o.push(`<path d="${line([P(0.3, T, 1), P(T, T, 1), P(T, 0.3, 1)])}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#blur2)"/>`);
    } else {
      face(leftF, C.earth, 'left', 14); face(rightF, C.earth, 'right', 14);
      if (isE) for (const [k, t] of [[0.68, 0.12], [0.34, 0.24]]) {
        paint(rp([P(0, T), P(T, T), P(T, T, -slab * k), P(0, T, -slab * k)], 8), C.earth, 'left', light(C.earth, t));
        paint(rp([P(T, 0), P(T, T), P(T, T, -slab * k), P(T, 0, -slab * k)], 8), C.earth, 'right', shade(light(C.earth, t), 0.84));
      }
      const lipD = rp([P(0, T, 0), P(T, T, 0), P(T, 0, 0), P(T, 0, -8), P(T, T, -8), P(0, T, -8)], 8);
      if (NEW) { paint(lipD, C.grass, 'right', isF ? C.grass : undefined); paint(rp(top, 16), C.grass, 'top'); }
      else {
      o.push(`<path d="${lipD}" fill="${shade(C.grass, 0.82)}"${strokeOf(C.grass)}/>`);
      o.push(`<path d="${rp(top, 16)}" fill="${C.grass}"${strokeOf(C.grass)}/>`);
      }
      // earth strata
      for (const k of [0.45]) {
        o.push(`<path d="${line([P(0.3, T, -slab * k), P(T, T, -slab * k), P(T, 0.3, -slab * k)])}" fill="none" stroke="${shade(C.earth, 0.78)}" stroke-width="${isC ? 2 : 1.4}" stroke-opacity="0.6" stroke-linecap="round" stroke-dasharray="18 10"/>`);
      }
    }
    // grass texture
    o.push(`<clipPath id="islandClip"><path d="${rp(top, 16)}"/></clipPath>`);
    o.push(`<g clip-path="url(#islandClip)">`);
    if (isA) for (let x = 0; x < T; x++) for (let y = 0; y < T; y++) if ((x + y) % 2) o.push(`<path d="${poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)])}" fill="${C.grassAlt}"/>`);
    if (isB) {
      const rr = rng(3); for (let i = 0; i < 26; i++) { const p = P(rr() * 12, rr() * 12); o.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${f(40 + rr() * 60)}" ry="${f(20 + rr() * 26)}" fill="${grad('glow', rr() > 0.5 ? light(C.grass, 0.25) : shade(C.grass, 0.88))}" fill-opacity="0.7"/>`); }
    }
    if (isD) { const rr = rng(3); for (let i = 0; i < 14; i++) { const p = P(0.5 + rr() * 11, 0.5 + rr() * 11); o.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${f(36 + rr() * 50)}" ry="${f(16 + rr() * 18)}" fill="${rr() > 0.5 ? '#c3d48c' : '#8fb070'}" fill-opacity="0.45"/>`); } }
    if (isE) { const rr = rng(3); for (let i = 0; i < 9; i++) { const p = P(0.5 + rr() * 11, 0.5 + rr() * 11); const d = ellD(p, 30 + rr() * 40, 14 + rr() * 16); o.push(eShadow(d)); o.push(`<path d="${d}" fill="${C.patch}"/>`); } }
    if (isF) { const rr = rng(3); for (let i = 0; i < 9; i++) { const p = P(0.5 + rr() * 11, 0.5 + rr() * 11); o.push(`<path d="${ellD(p, 30 + rr() * 40, 14 + rr() * 16)}" fill="url(#dotsLight)"/>`); } }
    if (isG) { const rr = rng(3); for (let i = 0; i < 9; i++) { const p = P(0.5 + rr() * 11, 0.5 + rr() * 11); o.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${f(30 + rr() * 40)}" ry="${f(14 + rr() * 16)}" fill="${tone(C.patch, 'top')}"/>`); } }
    if (isC) {
      const rr = rng(3); for (let i = 0; i < 9; i++) { const p = P(0.5 + rr() * 11, 0.5 + rr() * 11); o.push(`<ellipse cx="${f(p[0])}" cy="${f(p[1])}" rx="${f(30 + rr() * 40)}" ry="${f(14 + rr() * 16)}" fill="${C.patch}"/>`); }
    }
    o.push(`</g>`);
  }

  // ================= paths =================
  const tileD = (x, y, z = 0, inset = 0) => poly([P(x + inset, y + inset, z), P(x + 1 - inset, y + inset, z), P(x + 1 - inset, y + 1 - inset, z), P(x + inset, y + 1 - inset, z)]);
  function pavement(tiles, base, curb, raise) {
    if (isG) { base = tone(base, 'top'); curb = tone(curb, 'left'); }
    const all = tiles.map(([x, y]) => tileD(x, y, raise)).join('');
    const side = tiles.map(([x, y]) => tileD(x, y, 0)).join('');
    if (isB) {
      o.push(`<path d="${side}" fill="${shade(curb, 0.82)}" stroke="${shade(curb, 0.82)}" stroke-width="10" stroke-linejoin="round" filter="url(#aoTight)" opacity="0.6"/>`);
      o.push(`<path d="${side}" fill="${shade(curb, 0.9)}" stroke="${shade(curb, 0.9)}" stroke-width="9" stroke-linejoin="round"/>`);
      o.push(`<path d="${all}" fill="${curb}" stroke="${curb}" stroke-width="9" stroke-linejoin="round"/>`);
      o.push(`<path d="${all}" fill="${base}"/>`);
    } else {
      const edge = isC ? ink : isF ? NAVY : isD ? pencil(curb) : shade(curb, 0.78);
      if (isE) o.push(`<path d="${side}" fill="#2b1a0e" fill-opacity="0.22" stroke="#2b1a0e" stroke-opacity="0.22" stroke-width="9" stroke-linejoin="round" transform="translate(1.4,2.5)"/>`);
      const wE = isC ? 7 + S.sw * 2 : 8.6;
      o.push(`<path d="${side}" fill="${edge}" stroke="${edge}" stroke-width="${wE}" stroke-linejoin="round"/>`);
      o.push(`<path d="${side}" fill="${shade(curb, 0.92)}" stroke="${shade(curb, 0.92)}" stroke-width="7" stroke-linejoin="round"/>`);
      o.push(`<path d="${all}" fill="${edge}" stroke="${edge}" stroke-width="${wE}" stroke-linejoin="round"/>`);
      o.push(`<path d="${all}" fill="${curb}" stroke="${curb}" stroke-width="7" stroke-linejoin="round"/>`);
      o.push(`<path d="${all}" fill="${base}"/>`);
    }
    // paving joints: rounded slab per tile
    for (const [x, y] of tiles) {
      const q = [P(x + 0.06, y + 0.06, raise), P(x + 0.94, y + 0.06, raise), P(x + 0.94, y + 0.94, raise), P(x + 0.06, y + 0.94, raise)];
      if (isB) { const q2 = [P(x + 0.07, y + 0.07, raise), P(x + 0.93, y + 0.07, raise), P(x + 0.93, y + 0.93, raise), P(x + 0.07, y + 0.93, raise)]; o.push(`<path d="${rp(q2, 14)}" fill="${shade(base, 0.8)}" transform="translate(0,2.5)" filter="url(#aoTight)" opacity="0.7"/>`); o.push(`<path d="${rp(q2, 14)}" fill="${grad('top', base)}" stroke="${shade(base, 0.86)}" stroke-width="1.2" stroke-opacity="0.6"/>`); }
      else if (isA) o.push(`<path d="${rp(q, 8)}" fill="${light(base, 0.25)}" stroke="${C.joint}" stroke-width="1.3"/>`);
      else if (isE) { const q2 = [P(x + 0.1, y + 0.1, raise), P(x + 0.9, y + 0.1, raise), P(x + 0.9, y + 0.9, raise), P(x + 0.1, y + 0.9, raise)]; o.push(eShadow(rp(q2, 7))); o.push(`<path d="${rp(q2, 7)}" fill="${light(base, 0.35)}" stroke="${PAPER}" stroke-width="1.6" paint-order="stroke"/>`); }
      else o.push(`<path d="${rp(q, 7)}" fill="none" stroke="${C.joint}" stroke-width="2"/>`);
    }
  }
  pavement(SCENE.path, C.path, C.curb, 3);
  pavement(SCENE.queue, isC ? '#dfe4ff' : isA ? '#e3e6fb' : '#e2e4fa', isC ? '#b8c1f5' : '#c3c8ee', 3);

  // ================= decorations in grass =================
  {
    const rr = rng(11); const occupied = (x, y) => {
      if (Math.hypot(x - 2.5, y - 2.5) < 1.7) return true;
      if (x > 4.4 && x < 10.4 && y > 0.6 && y < 3.4) return true;
      if (x > 8.9 && x < 10.4 && y < 6.3 && y > 2) return true;
      if (y > 5.6 && y < 7.4) return true; if (x > 6.6 && x < 8.4 && y > 6.6) return true;
      if (x > 1.6 && x < 3.4 && y > 3.6 && y < 6.4) return true;
      if (x > 6.6 && x < 8.4 && y > 4.6 && y < 6.4) return true;
      if (Math.hypot(x - SCENE.tree1[0], y - SCENE.tree1[1]) < 0.9 || Math.hypot(x - SCENE.tree2[0], y - SCENE.tree2[1]) < 0.9) return true;
      if (Math.hypot(x - SCENE.bush[0], y - SCENE.bush[1]) < 0.7) return true;
      return x < 0.3 || y < 0.3 || x > 11.7 || y > 11.7;
    };
    let n = 0;
    while (n < 34) {
      const x = rr() * 12, y = rr() * 12, kind = rr(); if (occupied(x, y)) continue; n++;
      const p = P(x, y);
      if (kind < 0.72) { // tuft
        const d = `M${pt([p[0] - 6, p[1]])}Q${pt([p[0] - 5, p[1] - 7])} ${pt([p[0] - 2, p[1] - 9])}Q${pt([p[0] - 2, p[1] - 4])} ${pt([p[0], p[1] - 2])}Q${pt([p[0] + 1, p[1] - 9])} ${pt([p[0] + 4, p[1] - 10])}Q${pt([p[0] + 3, p[1] - 4])} ${pt([p[0] + 6, p[1]])}Z`;
        if (isC) o.push(`<path d="${d}" fill="${C.tuft}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>`);
        else if (isA) o.push(`<path d="${d}" fill="${C.tuft}"/>`);
        else if (isD) o.push(`<path d="${d}" fill="${C.tuft}" stroke="${pencil(C.tuft)}" stroke-width="0.9"/>`);
        else if (isE) { o.push(eShadow(d)); o.push(`<path d="${d}" fill="${C.tuft}"/>`); }
        else if (isF) o.push(`<path d="${d}" fill="${C.tuft}" stroke="${NAVY}" stroke-width="1" transform="translate(0.8,0.6)"/>`);
        else if (isG) o.push(`<path d="${d}" fill="${tone(C.tuft, 'left')}"/>`);
        else o.push(`<path d="${d}" fill="${grad('hgrad', C.tuft)}"/>`);
      } else { // tiny flower
        const col = kind < 0.86 ? '#ffffff' : C.flower2;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; blobSmall(p[0] + Math.cos(a) * 2.6, p[1] - 3 + Math.sin(a) * 1.6, 2.2, col); }
        blobSmall(p[0], p[1] - 3, 1.5, '#ffb52e');
      }
    }
    function blobSmall(cx, cy, r, col) {
      if (isC) o.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${col}" stroke="${ink}" stroke-width="1.2"/>`);
      else if (isA) o.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${col}" stroke="${shade(col, 0.75)}" stroke-width="0.8"/>`);
      else if (NEW) o.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${isG ? tone(col, 'left') : col}"${isD ? ` stroke="${pencil(col)}" stroke-width="0.7"` : isF ? ` stroke="${NAVY}" stroke-width="0.8"` : ''}/>`);
      else o.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${grad('sphere', col)}"/>`);
    }
  }

  // ================= shadows (all on the ground layer) =================
  const track = coasterSamples();
  {
    const cz = SCENE.carousel;
    shadow(groundEll(cz.x, cz.y, 1.5, 0.22, 0.12), 1.15);
    const shPts = track.map(([x, y, z]) => isG ? P(x + z * GK, y - z * GK) : P(x + z * 0.0035, y + z * 0.0016));
    if (isD) o.push(`<path d="${smoothPath(shPts)}" fill="none" stroke="#5b4a78" stroke-opacity="0.17" stroke-width="14" stroke-linecap="round" filter="url(#soft)"/>`);
    else if (isE) o.push(`<path d="${smoothPath(shPts)}" fill="none" stroke="#2b1a0e" stroke-opacity="0.18" stroke-width="12" stroke-linecap="round" filter="url(#softE)" transform="translate(2,1.5)"/>`);
    else if (isF) o.push(`<path d="${smoothPath(shPts)}" fill="none" stroke="url(#dotsShadow)" stroke-width="13" stroke-linecap="round"/>`);
    else if (isG) {
      o.push(`<path d="${smoothPath(shPts)}" fill="none" stroke="#262a6e" stroke-opacity="0.22" stroke-width="10" stroke-linecap="round" filter="url(#soft)"/>`);
      // long cast shadows of the tall things: hull of the footprint and the top, slid along the ground away from the sun
      const castG = (pts3, k = 1) => { const g = hull(pts3.map(([x, y, z]) => P(x + z * GK, y - z * GK))); o.push(`<path d="${rp(g, 10)}" fill="#262a6e" fill-opacity="${f(0.26 * k)}" filter="url(#softG)"/>`); };
      const ring = (x, y, r, z, n = 16) => Array.from({ length: n }, (_, i) => [x + Math.cos(i / n * 6.283) * r, y + Math.sin(i / n * 6.283) * r, z]);
      castG([...ring(cz.x, cz.y, 1.34, 0), ...ring(cz.x, cz.y, 1.4, 104), [cz.x, cz.y, 166]]);
      const st = SCENE.stall; castG([[st.x0, st.y0, 0], [st.x1, st.y0, 0], [st.x1, st.y1, 0], [st.x0, st.y1, 0], [st.x0, st.y0, 112], [st.x1, st.y0, 112], [st.x1, st.y1, 60], [st.x0, st.y1, 60]]);
      castG([...ring(SCENE.tree1[0], SCENE.tree1[1], 0.1, 0, 6), ...ring(SCENE.tree1[0] + 0.25, SCENE.tree1[1] - 0.25, 0.55, 75)], 0.9);
      castG([...ring(SCENE.tree2[0], SCENE.tree2[1], 0.1, 0, 6), ...ring(SCENE.tree2[0], SCENE.tree2[1], 0.4, 55), [SCENE.tree2[0], SCENE.tree2[1], 105]], 0.9);
      castG([[SCENE.lamp[0], SCENE.lamp[1], 0], [SCENE.lamp[0] + 0.03, SCENE.lamp[1] - 0.03, 0], [SCENE.lamp[0], SCENE.lamp[1], 92]], 0.8);
      castG([...ring(SCENE.bush[0], SCENE.bush[1], 0.4, 0, 8), ...ring(SCENE.bush[0], SCENE.bush[1], 0.35, 28, 8)], 0.8);
      castG([[1.82, 5.92, 0], [1.84, 5.9, 0], [1.82, 5.92, 70]], 0.7);
    }
    else if (isB) {
      o.push(`<path d="${smoothPath(shPts)}" fill="none" stroke="#3b2a2a" stroke-opacity="0.16" stroke-width="16" stroke-linecap="round" filter="url(#aoWide)"/>`);
    } else o.push(`<path d="${smoothPath(shPts)}" fill="none" stroke="${isA ? '#2d5d46' : '#1f2340'}" stroke-opacity="${isA ? 0.15 : 0.13}" stroke-width="14" stroke-linecap="round" filter="url(#${isA ? 'soft' : 'softC'})"/>`);
    const s = SCENE.stall; shadow(rp([P(s.x0 + 0.05, s.y0 + 0.05), P(s.x1 + 0.3, s.y0 + 0.05), P(s.x1 + 0.3, s.y1 + 0.4), P(s.x0 + 0.05, s.y1 + 0.4)], 14), 1.1);
    shadow(groundEll(SCENE.tree1[0], SCENE.tree1[1], 0.62, 0.3, 0.15));
    shadow(groundEll(SCENE.tree2[0], SCENE.tree2[1], 0.5, 0.3, 0.15));
    shadow(groundEll(SCENE.bush[0], SCENE.bush[1], 0.42, 0.1, 0.05));
    const b = SCENE.bench; shadow(rp([P(b.x0, b.y0), P(b.x1 + 0.1, b.y0), P(b.x1 + 0.1, b.y1 + 0.1), P(b.x0, b.y1 + 0.1)], 8), 0.9);
    shadow(groundEll(SCENE.lamp[0], SCENE.lamp[1], 0.14, 0.05, 0.02));
  }

  // ================= objects (painter's order by depth) =================
  const items = [];
  const add = (depth, fn) => items.push({ depth, fn });

  // ---- coaster ----
  add(3.5, () => drawCoaster());
  function drawCoaster() {
    // cumulative distance
    const dist = [0]; for (let i = 1; i < track.length; i++) { const a = track[i - 1], b = track[i]; dist.push(dist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    // supports
    const posts = []; let next = 0.25;
    for (let i = 0; i < track.length; i++) if (dist[i] >= next) { posts.push(track[i]); next += 0.5; }
    posts.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    const pw = isB ? 9 : isC ? 5 : 5.5;
    for (const [x, y, z] of posts) {
      if (isB) { o.push(`<path d="${ellD(P(x, y), 9, 4.5)}" fill="#2a1d24" fill-opacity="0.28" filter="url(#aoTight)"/>`); }
      cyl(x, y, 0.075, 0, 4, isC ? '#c9cde6' : shade(C.support, 0.9));
      tube([P(x, y, 3), P(x, y, z - 6)], pw, C.support);
    }
    // braces under the curve top
    // rails
    const N = (i) => { const a = track[Math.max(0, i - 1)], b = track[Math.min(track.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    const off = (i, s, dz = 0) => { const [nx, ny] = N(i); const [x, y, z] = track[i]; return P(x + nx * s, y + ny * s, z + dz); };
    const centre = track.map(([x, y, z]) => P(x, y, z - 6));
    tube(centre, isB ? 10 : 6, C.spine, true);
    // ties
    for (let i = 0; i < track.length; i += 2) {
      const a = off(i, 0.15, -1), b = off(i, -0.15, -1);
      if (isC) o.push(`<path d="${line([a, b])}" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>`);
      else o.push(`<path d="${line([a, b])}" stroke="${C.tie}" stroke-width="${isB ? 3.2 : 2.6}" stroke-linecap="round"/>`);
    }
    // lift chain
    const liftIdx = track.map((p, i) => i).filter((i) => track[i][0] >= 6.3 && track[i][0] <= 8.5 && track[i][1] === 1.5);
    o.push(`<path d="${line(liftIdx.map((i) => P(track[i][0], track[i][1], track[i][2] + 0.5)))}" fill="none" stroke="${isC ? ink : shade(C.tie, 0.7)}" stroke-width="2.2" stroke-dasharray="2.5 3"/>`);
    const railA = track.map((_, i) => off(i, -0.15)), railB = track.map((_, i) => off(i, 0.15));
    tube(railA, isB ? 6 : 4, C.rail, true);
    tube(railB, isB ? 6 : 4, C.rail, true);
    // end caps (buffers)
    for (const i of [0, track.length - 1]) { const p = P(track[i][0], track[i][1], track[i][2] - 1); blob(p[0], p[1], 6.5, C.carTrim); }
    // train car on the lift
    const ci = track.findIndex((p) => p[0] >= 5.55);
    if (isG) for (let i = 4; i < track.length; i += 6) { const p = off(i, 0.15, 2); o.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="6" fill="url(#bulbHalo)"/><circle cx="${f(p[0])}" cy="${f(p[1])}" r="1.7" fill="#fff6d0"/>`); }
    drawCar(ci);
  }
  function drawCar(ci) {
    const a = track[ci - 3], b = track[ci + 3], c = track[ci];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] - a[2]) / 52);
    const t = [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl, (b[2] - a[2]) / 52 / tl]; // z in "tile" units
    const hl2 = Math.hypot(t[0], t[1]); const n = [-t[1] / hl2, t[0] / hl2];
    const hl = 0.42, hw = 0.2, z0 = 1, z1 = 21;
    const corner = (s, w, h) => P(c[0] + t[0] * s + n[0] * w, c[1] + t[1] * s + n[1] * w, c[2] + t[2] * 52 * s + h);
    // which side faces the viewer? (outward normal with +x+y component)
    const sideW = (n[0] + n[1]) > 0 ? hw : -hw;
    const sideF = [corner(-hl, sideW, z1), corner(hl, sideW, z1), corner(hl, sideW, z0), corner(-hl, sideW, z0)];
    const front = [corner(hl, -hw, z1), corner(hl, hw, z1), corner(hl, hw, z0), corner(hl, -hw, z0)];
    const top = [corner(-hl, -hw, z1), corner(hl, -hw, z1), corner(hl, hw, z1), corner(-hl, hw, z1)];
    // wheels (behind body bottom)
    for (const s of [-0.26, 0.26]) { const p = corner(s, sideW, z0 + 1); blob(p[0], p[1], 4.2, '#4a4e6e'); }
    face(front, C.car, 'right', isB ? 8 : 6);
    face(sideF, C.car, 'left', isB ? 8 : 6);
    // trim stripe on the side
    const st = [corner(-hl + 0.04, sideW, 13), corner(hl - 0.04, sideW, 13), corner(hl - 0.04, sideW, 9), corner(-hl + 0.04, sideW, 9)];
    if (isB) o.push(`<path d="${rp(st, 2)}" fill="${grad('hgrad', C.carTrim)}"/>`); else if (NEW) paint(rp(st, 2), C.carTrim, 'left'); else o.push(`<path d="${rp(st, 2)}" fill="${C.carTrim}"${isC ? ` stroke="${ink}" stroke-width="1.6"` : ''}/>`);
    face(top, C.car, 'top', isB ? 8 : 6);
    // open tub: dark interior + two riders
    const inner = [corner(-hl + 0.07, -hw + 0.06, z1), corner(hl - 0.1, -hw + 0.06, z1), corner(hl - 0.1, hw - 0.06, z1), corner(-hl + 0.07, hw - 0.06, z1)];
    o.push(`<path d="${rp(inner, 5)}" fill="${C.seat}"${isC ? ` stroke="${ink}" stroke-width="${S.sw}"` : ''}/>`);
    const riders = [['#f3c9a3', '#ffd23f', '#3b2a20'], ['#8d5a3b', '#3d9be0', '#1f1a1a']];
    [-0.17, 0.17].forEach((s, k) => {
      const p = corner(s, 0, z1 + 2);
      shape(rp([[p[0] - 6, p[1] - 9], [p[0] + 6, p[1] - 9], [p[0] + 6, p[1] + 2], [p[0] - 6, p[1] + 2]], 4), riders[k][1]);
      blob(p[0] + 0.5, p[1] - 14, 5.8, riders[k][0]);
      hairCap(p[0] + 0.5, p[1] - 14, 5.8, riders[k][2], 1);
      // a raised arm on the front rider
      if (k === 1) tube([[p[0] + 4, p[1] - 7], [p[0] + 9, p[1] - 17], [p[0] + 10, p[1] - 24]], 3.2, riders[k][0]);
    });
    // lap bar
    const lb = [corner(-0.36, sideW * 0.9, z1 + 5), corner(0.33, sideW * 0.9, z1 + 5)];
    tube(lb, 2.4, '#e9ecf8');
  }
  function hairCap(cx, cy, r, col, dir) {
    const d = `M${pt([cx - r * 1.02, cy + r * 0.05])}A${f(r * 1.03)} ${f(r * 1.03)} 0 0 1 ${pt([cx + r * 1.02, cy + r * 0.05])}Q${pt([cx + r * 0.2 * dir, cy - r * 0.45])} ${pt([cx - r * 1.02, cy + r * 0.05])}Z`;
    shape(d, col, true);
  }

  // ---- carousel ----
  add(5.2, () => drawCarousel());
  function drawCarousel() {
    const { x: cx, y: cy } = SCENE.carousel;
    cyl(cx, cy, 1.34, 0, 10, C.base, C.base);
    cyl(cx, cy, 1.24, 10, 15, C.deck, C.deck);
    // deck ring detail
    const dc = P(cx, cy, 15);
    o.push(`<ellipse cx="${f(dc[0])}" cy="${f(dc[1])}" rx="${f(R2 * W * 0.98)}" ry="${f(R2 * H * 0.98)}" fill="none" stroke="${shade(C.deck, isC ? 0.8 : 0.84)}" stroke-width="${isC ? 2 : 1.4}" stroke-dasharray="${isC ? 'none' : '7 5'}"/>`);
    // horses on poles
    const nH = 8; const hs = [];
    for (let i = 0; i < nH; i++) { const a = i / nH * Math.PI * 2 + 0.2; hs.push({ a, i, gx: cx + Math.cos(a) * 0.92, gy: cy + Math.sin(a) * 0.92 }); }
    hs.sort((p, q) => (p.gx + p.gy) - (q.gx + q.gy));
    const drawHorse = (h) => {
      const bob = Math.sin(h.i * 1.7) * 7;
      const pTop = P(h.gx, h.gy, 100), pBot = P(h.gx, h.gy, 15);
      tube([pBot, pTop], 2.6, C.column);
      const tx = -Math.sin(h.a), ty = Math.cos(h.a); const dir = (tx - ty) > 0 ? 1 : -1;
      const hp = P(h.gx, h.gy, 40 + bob);
      horse(hp[0], hp[1], dir, C.horses[h.i % 4]);
    };
    const back = hs.filter((h) => h.gx + h.gy < cx + cy), frontH = hs.filter((h) => h.gx + h.gy >= cx + cy);
    back.forEach(drawHorse);
    cyl(cx, cy, 0.25, 15, 102, C.column, C.column);
    // mirror panels on the column
    for (const a of [-0.6, 0.2]) { const p = P(cx, cy, 58); const px = p[0] + a * 14; o.push(`<path d="${rp([[px - 4, p[1] - 22], [px + 4, p[1] - 22], [px + 4, p[1] + 14], [px - 4, p[1] + 14]], 3)}" fill="${isB ? '#ffffff' : light(C.column, 0.6)}" fill-opacity="${isB ? 0.55 : 1}"${isC ? ` stroke="${ink}" stroke-width="1.8"` : ''}/>`); }
    frontH.forEach(drawHorse);
    // roof
    const rb = P(cx, cy, 104), apex = P(cx, cy, 166), rx = R2 * W * 1.4, ry = R2 * H * 1.4;
    const nW = 16; const wedges = [];
    for (let i = 0; i < nW; i++) {
      const t0 = i / nW * Math.PI * 2, t1 = (i + 1) / nW * Math.PI * 2, tm = (t0 + t1) / 2;
      const pts = [apex]; for (let k = 0; k <= 6; k++) pts.push(ell(rb, rx, ry, t0 + (t1 - t0) * k / 6));
      wedges.push({ pts, tm, col: i % 2 ? C.stripeB : C.stripeA });
    }
    wedges.sort((p, q) => Math.sin(p.tm) - Math.sin(q.tm));
    // valance (behind part first is hidden by roof anyway)
    const cone = hull([apex, ...Array.from({ length: 48 }, (_, k) => ell(rb, rx, ry, k / 48 * Math.PI * 2))]);
    for (const w of wedges) {
      if (isB) {
        const k = 1 - 0.2 * (Math.cos(w.tm) + 1) / 2 + 0.06 * Math.max(0, -Math.cos(w.tm + 0.6));
        o.push(`<path d="${poly(w.pts)}" fill="${shade(w.col, k)}" stroke="${shade(w.col, k)}" stroke-width="0.6"/>`);
      } else {
        const lit = Math.cos(w.tm) < 0.2;
        if (NEW) { const c2 = tone(w.col, lit ? 'left' : 'right'); o.push(`<path d="${poly(w.pts)}" fill="${c2}" stroke="${c2}" stroke-width="0.6"/>`); if (isF && !lit) o.push(dots(poly(w.pts))); continue; }
        o.push(`<path d="${poly(w.pts)}" fill="${lit ? (isA ? light(w.col, 0.05) : w.col) : shade(w.col, isC ? 0.82 : 0.86)}" stroke="${lit ? w.col : shade(w.col, isC ? 0.82 : 0.86)}" stroke-width="0.6"/>`);
      }
    }
    if (isB) {
      o.push(`<path d="${poly(cone)}" fill="url(#roofShade)"/>`);
      o.push(`<path d="${line([[apex[0] - 6, apex[1] + 10], [rb[0] - rx * 0.55, rb[1] + ry * 0.1]])}" stroke="#fff" stroke-opacity="0.45" stroke-width="7" stroke-linecap="round" filter="url(#blur2)"/>`);
    }
    if (isF) o.push(fOutline(poly(cone)));
    else if (isE) o.push(`<path d="${poly(cone)}" fill="none" stroke="${PAPER}" stroke-width="2.2" stroke-linejoin="round"/>`);
    else if (!isB) o.push(`<path d="${poly(cone)}" fill="none"${strokeOf(C.stripeA)}/>`);
    // scalloped valance + trim
    const nS = 18; const t0s = -0.12, t1s = Math.PI + 0.12;
    for (let i = 0; i < nS; i++) {
      const ta = t0s + (t1s - t0s) * i / nS, tb = t0s + (t1s - t0s) * (i + 1) / nS;
      const a = ell(rb, rx, ry, ta), b = ell(rb, rx, ry, tb), m = ell(rb, rx, ry, (ta + tb) / 2);
      const col = i % 2 ? C.stripeB : C.stripeA;
      const d = `M${pt(a)}L${pt([a[0], a[1] + 6])}Q${pt([m[0], m[1] + 22])} ${pt([b[0], b[1] + 6])}L${pt(b)}Z`;
      if (NEW) paint(d, col, Math.cos((ta + tb) / 2) > 0.2 ? 'right' : 'left');
      else if (isB) o.push(`<path d="${d}" fill="${grad('left', col)}"/>`);
      else o.push(`<path d="${d}" fill="${Math.cos((ta + tb) / 2) > 0.2 ? shade(col, isC ? 0.82 : 0.86) : col}"${strokeOf(col, isC ? S.sw : 1.3)}/>`);
    }
    const band = `M${pt(ell(rb, rx, ry, t0s))}A${f(rx)} ${f(ry)} 0 0 1 ${pt(ell(rb, rx, ry, t1s))}`;
    if (isC) { o.push(`<path d="${band}" fill="none" stroke="${ink}" stroke-width="${7 + S.sw * 2}" stroke-linecap="round"/>`); }
    else o.push(`<path d="${band}" fill="none" stroke="${shade(C.trim, isB ? 0.75 : 0.7)}" stroke-width="${isB ? 9 : 8.5}" stroke-linecap="round"/>`);
    o.push(`<path d="${band}" fill="none" stroke="${isG ? tone(C.trim, 'left') : C.trim}" stroke-width="${isB ? 7.5 : 7}" stroke-linecap="round"/>`);
    if (isB) o.push(`<path d="${band}" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round" transform="translate(0,-2)"/>`);
    // light bulbs on the band
    if (isG) { // lit bulbs: a soft halo each, then a hot core
      for (let i = 0; i <= 12; i++) { const p = ell(rb, rx, ry, t0s + (t1s - t0s) * i / 12); o.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="9" fill="url(#bulbHalo)"/><circle cx="${f(p[0])}" cy="${f(p[1])}" r="2.6" fill="#fffbe0"/>`); }
    } else
    for (let i = 0; i <= 12; i++) { const p = ell(rb, rx, ry, t0s + (t1s - t0s) * i / 12); if (isB) o.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="2.3" fill="#fffbe6"/>`); else o.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="2.2" fill="#fffbe6"${isC ? ` stroke="${ink}" stroke-width="1"` : ''}/>`); }
    // finial + flag
    tube([apex, [apex[0], apex[1] - 26]], 2.4, C.metal);
    const fl = `M${pt([apex[0] + 1, apex[1] - 26])}Q${pt([apex[0] + 12, apex[1] - 30])} ${pt([apex[0] + 22, apex[1] - 22])}Q${pt([apex[0] + 12, apex[1] - 18])} ${pt([apex[0] + 1, apex[1] - 15])}Z`;
    shape(fl, C.stripeA);
    blob(apex[0], apex[1] - 3, 6, C.trim);
  }
  function horse(x, y, dir, col) {
    o.push(`<g transform="translate(${f(x)},${f(y)}) scale(${dir},1)">`);
    const legs = isC ? '#ffffff' : col;
    // legs (gallop pose)
    tube([[-8, 3], [-12, 11], [-15, 13]], 3, shade(col, 0.92));
    tube([[7, 3], [12, 9], [16, 7]], 3, shade(col, 0.92));
    tube([[-5, 4], [-6, 12], [-9, 15]], 3, legs);
    tube([[9, 3], [11, 11], [13, 14]], 3, legs);
    // tail
    tube([[-12, -2], [-18, 0], [-20, 6]], 3.4, C.mane, true);
    // body
    shape(`M-13,-1C-13,-8 -6,-9 0,-9C7,-9 13,-8 13,-2C13,4 7,6 0,6C-7,6 -13,5 -13,-1Z`, col, true);
    // neck + head
    shape(`M7,-6C8,-12 9,-17 12,-20C14,-23 19,-23 21,-19C22,-17 22,-15 20,-14L15,-12C14,-9 13,-5 12,-2Z`, col, true);
    // mane
    tube([[9, -8], [10, -15], [13, -21]], 2.6, C.mane, true);
    // saddle
    shape(`M-5,-9C-4,-12 4,-12 5,-9L4,-3C1,-2 -2,-2 -4,-3Z`, C.saddle);
    // eye
    o.push(`<circle cx="17" cy="-18.5" r="1.1" fill="${C.seat}"/>`);
    o.push(`</g>`);
  }

  // ---- queue line ----
  function rail(xr) {
    const ys = [4.08, 4.7, 5.35, 5.95];
    for (const y of ys) { const p = P(xr, y); cyl(xr, y, 0.045, 0, 4, shade(C.queueRail, 0.9)); tube([p, P(xr, y, 20)], 3, C.queueRail); }
    tube([P(xr, 4.08, 18), P(xr, 5.95, 18)], 3, C.queueRail);
    tube([P(xr, 4.08, 10), P(xr, 5.95, 10)], 2.2, light(C.queueRail, 0.3));
  }
  add(6.0, () => rail(2.1));
  add(8.2, () => rail(2.9));
  // a ride sign at the queue mouth
  add(7.6, () => {
    const p = P(1.82, 5.92); tube([p, P(1.82, 5.92, 46)], 3, C.metal);
    const s = P(1.82, 5.92, 58);
    shape(rp([[s[0] - 15, s[1] - 13], [s[0] + 15, s[1] - 13], [s[0] + 15, s[1] + 11], [s[0] - 15, s[1] + 11]], 8), C.base);
    // tiny horse icon
    o.push(`<path d="M${f(s[0] - 7)},${f(s[1] + 5)}L${f(s[0] - 7)},${f(s[1] - 1)}C${f(s[0] - 7)},${f(s[1] - 4)} ${f(s[0] + 2)},${f(s[1] - 4)} ${f(s[0] + 3)},${f(s[1] - 3)}L${f(s[0] + 5)},${f(s[1] - 8)}L${f(s[0] + 8)},${f(s[1] - 6)}L${f(s[0] + 5)},${f(s[1] - 1)}L${f(s[0] + 5)},${f(s[1] + 5)}" fill="none" stroke="${isC ? ink : '#ffffff'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
  });

  // ---- stall ----
  add(12.6, () => {
    const s = SCENE.stall, ym = 5.4;
    box(s.x0, s.x1, s.y0, ym, 0, 56, C.wall);
    box(s.x0, s.x1, s.y0, ym, 56, 68, C.awnA);
    // serving window with the vendor inside
    const win = [P(s.x0 + 0.1, ym, 52), P(s.x1 - 0.1, ym, 52), P(s.x1 - 0.1, ym, 16), P(s.x0 + 0.1, ym, 16)];
    if (isG) o.push(`<path d="${rp(win, 5)}" fill="#ffbf5e"/><path d="${rp(win, 5)}" fill="url(#bulbHalo)" transform="translate(${f(P(7.5, ym, 34)[0])},${f(P(7.5, ym, 34)[1])}) scale(1.9) translate(${f(-P(7.5, ym, 34)[0])},${f(-P(7.5, ym, 34)[1])})" opacity="0.7"/>`);
    else o.push(`<path d="${rp(win, 5)}" fill="${shade(C.wall, 0.45)}"${isC ? ` stroke="${ink}" stroke-width="${S.sw}"` : ''}/>`);
    const vp = P(7.45, 5.3, 6);
    shape(rp([[vp[0] - 7, vp[1] - 12], [vp[0] + 7, vp[1] - 12], [vp[0] + 7, vp[1] + 4], [vp[0] - 7, vp[1] + 4]], 4), '#ffffff');
    blob(vp[0], vp[1] - 18, 6, '#e8b48f'); hairCap(vp[0], vp[1] - 18, 6, '#ff6f7d', 1);
    o.push(`<circle cx="${f(vp[0] + 1)}" cy="${f(vp[1] - 17.5)}" r="1" fill="#2b2540"/><circle cx="${f(vp[0] + 4.5)}" cy="${f(vp[1] - 17.5)}" r="1" fill="#2b2540"/>`);
    box(s.x0, s.x1, ym, s.y1, 0, 17, C.wood, S.r, { top: light(C.wall, 0.2) });
    if (!isB) for (const z of [6, 11.5]) o.push(`<path d="${line([P(s.x0 + 0.05, s.y1, z), P(s.x1 - 0.05, s.y1, z)])}" stroke="${shade(C.wood, 0.78)}" stroke-width="${isC ? 2 : 1.3}" stroke-linecap="round"/>`);
    for (const [x, col] of [[7.26, '#ffffff'], [7.74, C.scoop]]) cyl(x, 5.7, 0.06, 17, 26, col, light(col, 0.2));
    // roof cap
    box(s.x0 - 0.05, s.x1 + 0.05, s.y0 - 0.05, ym + 0.04, 68, 74, light(C.awnA, 0.55));
    // awning: stripes along x, sloping toward the path
    const n = 6; const xs = (i) => s.x0 - 0.06 + (s.x1 - s.x0 + 0.12) * i / n; const yf = 5.92, zf = 60;
    for (let i = 0; i < n; i++) {
      const col = i % 2 ? C.awnB : C.awnA;
      const q = [P(xs(i), ym, 68), P(xs(i + 1), ym, 68), P(xs(i + 1), yf, zf), P(xs(i), yf, zf)];
      if (isB) o.push(`<path d="${poly(q)}" fill="${grad('top', col)}" stroke="${light(col, 0.1)}" stroke-width="0.5"/>`);
      else if (NEW) { const c2 = tone(col, 'top'); o.push(`<path d="${poly(q)}" fill="${c2}" stroke="${c2}" stroke-width="0.5"/>`); }
      else o.push(`<path d="${poly(q)}" fill="${isA ? light(col, 0.08) : col}" stroke="${col}" stroke-width="0.5"/>`);
    }
    if (isF) o.push(fOutline(rp([P(xs(0), ym, 68), P(xs(n), ym, 68), P(xs(n), yf, zf), P(xs(0), yf, zf)], 3)));
    else if (!isB) o.push(`<path d="${rp([P(xs(0), ym, 68), P(xs(n), ym, 68), P(xs(n), yf, zf), P(xs(0), yf, zf)], 3)}" fill="none"${strokeOf(C.awnA)}/>`);
    for (let i = 0; i < n; i++) {
      const col = i % 2 ? C.awnB : C.awnA; const a = P(xs(i), yf, zf), b = P(xs(i + 1), yf, zf);
      const dd = `M${pt(a)}C${pt([a[0] + 2, a[1] + 12])} ${pt([b[0] - 2, b[1] + 12])} ${pt(b)}Z`;
      if (NEW) paint(dd, col, 'left'); else if (isB) o.push(`<path d="${dd}" fill="${grad('left', col)}"/>`); else o.push(`<path d="${dd}" fill="${col}"${strokeOf(col === C.awnB ? C.awnA : col, isC ? S.sw : 1.3)}/>`);
    }
    // sign board on the roof with an ice-cream icon
    const sb = [P(7.2, 5.22, 112), P(7.8, 5.22, 112), P(7.8, 5.22, 76), P(7.2, 5.22, 76)];
    face(sb, C.sign, 'left', 10);
    const c = P(7.5, 5.22, 94);
    shape(`M${f(c[0] - 6)},${f(c[1] - 2)}L${f(c[0] + 6)},${f(c[1] - 2)}L${f(c[0])},${f(c[1] + 13)}Z`, C.cone);
    blob(c[0], c[1] - 6, 7, C.scoop);
    blob(c[0] + 1, c[1] - 14, 3, '#ff5a5f');
  });

  // ---- bench ----
  add(10.0, () => {
    const b = SCENE.bench;
    for (const x of [b.x0 + 0.08, b.x1 - 0.12]) box(x, x + 0.05, b.y0 + 0.02, b.y1 - 0.02, 0, 11, C.metal, 1.5);
    box(b.x0, b.x1, b.y0, b.y0 + 0.07, 11, 27, C.bench, 3);
    box(b.x0, b.x1, b.y0 + 0.08, b.y1, 9, 13, C.bench, 3);
  });
  // ---- lamp ----
  add(11.6, () => {
    const [x, y] = SCENE.lamp;
    cyl(x, y, 0.08, 0, 7, C.metal);
    tube([P(x, y, 6), P(x, y, 70)], 3.6, C.metal);
    const h = P(x, y, 78);
    if (isG) { // light pool on the ground + big halo
      const g0 = P(x, y); o.push(`<ellipse cx="${f(g0[0])}" cy="${f(g0[1])}" rx="64" ry="30" fill="url(#poolG)"/>`);
      o.push(`<circle cx="${f(h[0])}" cy="${f(h[1])}" r="46" fill="url(#bulbHalo)"/>`);
    } else if (isE) { const d = ellD(h, 20, 20); o.push(`<path d="${d}" fill="${C.glow}" fill-opacity="0.55"/>`); }
    else if (isF) o.push(`<path d="${ellD(h, 22, 22)}" fill="url(#dotsSun)"/>`);
    else o.push(`<circle cx="${f(h[0])}" cy="${f(h[1])}" r="22" fill="${grad('glow', C.glow)}"/>`);
    if (isG) o.push(`<path d="${rp([[h[0] - 6, h[1] - 8], [h[0] + 6, h[1] - 8], [h[0] + 5, h[1] + 8], [h[0] - 5, h[1] + 8]], 4)}" fill="#fff4c8" stroke="#ffd36b" stroke-width="1.4"/>`);
    else shape(rp([[h[0] - 6, h[1] - 8], [h[0] + 6, h[1] - 8], [h[0] + 5, h[1] + 8], [h[0] - 5, h[1] + 8]], 4), C.glow, true);
    shape(`M${f(h[0] - 9)},${f(h[1] - 8)}Q${f(h[0])},${f(h[1] - 19)} ${f(h[0] + 9)},${f(h[1] - 8)}Z`, C.metal);
    blob(h[0], h[1] - 17, 2.6, C.metal);
  });
  // ---- bush ----
  add(SCENE.bush[0] + SCENE.bush[1], () => {
    const p = P(...SCENE.bush);
    blob(p[0] - 11, p[1] - 9, 11, C.bush); blob(p[0] + 11, p[1] - 9, 11, C.bush); blob(p[0], p[1] - 16, 13, C.bush); blob(p[0] + 1, p[1] - 5, 11, C.bush);
    for (const [dx, dy] of [[-10, -12], [6, -20], [12, -7], [-2, -5]]) { if (isB) o.push(`<circle cx="${f(p[0] + dx)}" cy="${f(p[1] + dy)}" r="2.8" fill="${grad('sphere', C.flower)}"/>`); else o.push(`<circle cx="${f(p[0] + dx)}" cy="${f(p[1] + dy)}" r="2.6" fill="${C.flower}"${isC ? ` stroke="${ink}" stroke-width="1.4"` : ` stroke="${shade(C.flower, 0.7)}" stroke-width="0.8"`}/>`); }
  });
  // ---- trees ----
  add(SCENE.tree1[0] + SCENE.tree1[1], () => {
    const [x, y] = SCENE.tree1; const p = P(x, y);
    cyl(x, y, 0.09, 0, 34, C.trunk);
    tube([P(x, y, 26), [p[0] + 12, p[1] - 40]], 3, C.trunk);
    blob(p[0] + 2, p[1] - 84, 23, C.leaf); blob(p[0] - 19, p[1] - 64, 21, C.leaf); blob(p[0] + 20, p[1] - 62, 21, C.leaf); blob(p[0] - 1, p[1] - 52, 20, C.leaf);
    if (!isB) for (const [dx, dy] of [[-16, -66], [12, -88], [18, -56]]) o.push(`<circle cx="${f(p[0] + dx)}" cy="${f(p[1] + dy)}" r="2.4" fill="#ff8a7a"${isC ? ` stroke="${ink}" stroke-width="1.2"` : ''}/>`);
    else for (const [dx, dy] of [[-16, -66], [12, -88], [18, -56]]) o.push(`<circle cx="${f(p[0] + dx)}" cy="${f(p[1] + dy)}" r="3" fill="${grad('sphere', '#ff7a6a')}"/>`);
  });
  add(SCENE.tree2[0] + SCENE.tree2[1], () => {
    const [x, y] = SCENE.tree2; const p = P(x, y);
    cyl(x, y, 0.08, 0, 22, C.trunk);
    blob(p[0], p[1] - 40, 20, C.leaf2, 25); blob(p[0], p[1] - 70, 16, C.leaf2, 21); blob(p[0], p[1] - 95, 11, C.leaf2, 15);
  });

  // ---- guests ----
  function guest(bx, by, g, scale = 1, withShadow = true) {
    const pantsCol = C.pants[g.pants];
    const s = g.kid ? 0.78 * scale : scale;
    if (withShadow) { const d = ellD([bx + 2, by + 1], 10 * s, 4 * s); shadow(d, 1.2); }
    o.push(`<g transform="translate(${f(bx)},${f(by)}) scale(${f(s)})">`);
    const dir = g.dir, st = g.step;
    // backpack / balloon string behind
    if (g.pack) shape(rp([[-dir * 11, -30], [-dir * 3, -30], [-dir * 3, -14], [-dir * 11, -14]], 4), g.pack);
    // legs
    const legL = st * 2.2, legR = -st * 2.2;
    shape(rp([[-5 + legL, -16], [-0.5 + legL, -16], [-0.5 + legL, 0], [-5 + legL, 0]], 2.2), pantsCol);
    shape(rp([[0.5 + legR, -16], [5 + legR, -16], [5 + legR, 0], [0.5 + legR, 0]], 2.2), pantsCol);
    shape(rp([[-5.5 + legL, -2.5], [0.5 + legL + dir, -2.5], [0.5 + legL + dir, 1.2], [-5.5 + legL, 1.2]], 1.6), '#3a3a4e');
    shape(rp([[-0.5 + legR, -2.5], [5.5 + legR + dir, -2.5], [5.5 + legR + dir, 1.2], [-0.5 + legR, 1.2]], 1.6), '#3a3a4e');
    // back arm
    tube([[-dir * 6.5, -25], [-dir * (7.5 - st * 2), -15]], 3.4, g.shirt === '#f2f2f2' ? '#e4e4ec' : shade(g.shirt, 0.9));
    // torso / dress
    if (g.dress) shape(`M-6,-28C-6,-30 6,-30 6,-28L8.5,-10C8.5,-8 -8.5,-8 -8.5,-10Z`, g.dress);
    const TW = isB ? 7.6 : 6.5; shape(rp([[-TW, -29], [TW, -29], [TW, g.dress ? -19 : -14], [-TW, g.dress ? -19 : -14]], isB ? 7 : 5), g.shirt);
    if (g.pack) tube([[-dir * 2, -28], [dir * 1, -18]], 2, shade(g.pack, 0.85));
    // front arm
    tube([[dir * 6.5, -25], [dir * (7.5 + st * 2), -15]], 3.4, g.shirt);
    blob(dir * (7.5 + st * 2), -14, 2.1, g.skin);
    // head
    const hx = dir * 0.6, hy = isB ? -36.5 : -35.5, HR = isB ? 7.8 : 6.8;
    if (g.hairStyle === 'pony') shape(`M${-dir * 3},${hy - 4}C${-dir * 12},${hy - 2} ${-dir * 12},${hy + 9} ${-dir * 8},${hy + 10}C${-dir * 7},${hy + 5} ${-dir * 6},${hy + 1} ${-dir * 3},${hy}Z`, g.hair, true);
    if (g.hairStyle === 'bun') blob(hx - dir * 1, hy - 8, 3.8, g.hair);
    blob(hx, hy, HR, g.skin);
    if (g.hairStyle === 'curly') { for (const [dx, dy] of [[-5, -2], [-3, -6], [1, -7.5], [5, -5], [6, -1]]) blob(hx + dx * dir, hy + dy, 3.4, g.hair); }
    else if (g.back) shape(`M${hx - 7},${hy + 2}A7 7 0 0 1 ${hx + 7},${hy + 2}C${hx + 6},${hy + 6} ${hx - 6},${hy + 6} ${hx - 7},${hy + 2}Z`, g.hair, true);
    else hairCap(hx, hy, HR, g.hair, dir);
    if (g.hat) { // cap with brim pointing to dir
      shape(`M${hx - 7},${hy - 2}A7 6.5 0 0 1 ${hx + 7},${hy - 2}Z`, g.hat, true);
      shape(rp([[hx + dir * 4, hy - 3.5], [hx + dir * 12, hy - 3], [hx + dir * 12, hy - 1], [hx + dir * 4, hy - 1]], 1.2), shade(g.hat, 0.85));
    }
    if (!g.back) { // eyes
      const ex = hx + dir * 2; const eyeC = isC ? ink : '#2b2540';
      o.push(`<circle cx="${f(ex - 2)}" cy="${f(hy + 0.5)}" r="1.05" fill="${eyeC}"/><circle cx="${f(ex + 2)}" cy="${f(hy + 0.5)}" r="1.05" fill="${eyeC}"/>`);
      o.push(`<circle cx="${f(ex - 4)}" cy="${f(hy + 3)}" r="1.4" fill="#ff8a8a" fill-opacity="0.45"/>`);
    }
    if (g.balloon) {
      const hxh = dir * (7.5 + st * 2), hyh = -14;
      o.push(`<path d="M${f(hxh)},${f(hyh)}C${f(hxh + 4)},${f(hyh - 14)} ${f(hxh - 3)},${f(hyh - 26)} ${f(hxh + 3)},${f(hyh - 38)}" fill="none" stroke="${isC ? ink : '#6a6f8f'}" stroke-width="1.2"/>`);
      blob(hxh + 3, hyh - 46, 8.5, g.balloon, 10);
      shape(`M${f(hxh + 1)},${f(hyh - 35)}L${f(hxh + 5)},${f(hyh - 35)}L${f(hxh + 3)},${f(hyh - 38)}Z`, g.balloon);
    }
    o.push(`</g>`);
  }
  for (const g of SCENE.walkers) add(g.at[0] + g.at[1] + 0.2, () => { const p = P(...g.at, 0); guest(p[0], p[1] - 3, g); });
  for (const g of SCENE.queuers) add(g.at[0] + g.at[1], () => { const p = P(...g.at, 0); guest(p[0], p[1] - 3, g); });

  items.sort((a, b) => a.depth - b.depth).forEach((it) => it.fn());
  if (isD) o.push(`</g>`);
  if (isD) o.push(`<rect width="1600" height="1000" fill="#000" filter="url(#paperD)" opacity="0.35" pointer-events="none"/>`);
  if (isE) o.push(`<rect width="1600" height="1000" fill="#000" filter="url(#paperE)" opacity="0.5" pointer-events="none"/>`);
  if (isF) o.push(`<rect width="1600" height="1000" fill="#000" filter="url(#grainF)" pointer-events="none"/>`);
  if (isG) o.push(`<rect width="1600" height="1000" fill="url(#gradeG)" style="mix-blend-mode:soft-light" pointer-events="none"/>`);

  if (isB) o.push(`<rect width="1600" height="1000" fill="url(#studio)" pointer-events="none"/>`);
  // ================= sheet furniture =================
  const T1 = S.titleInk;
  o.push(`<g font-family="${FONT}">`);
  o.push(`<text x="56" y="70" font-size="15" font-weight="700" letter-spacing="3" fill="${S.sub}">THRILLS &amp; CHILLS · CURVED ART CONCEPT</text>`);
  o.push(`<text x="54" y="118" font-size="44" font-weight="800" fill="${T1}">${S.letter} — ${S.name}</text>`);
  S.blurb.forEach((l, i) => o.push(`<text x="56" y="${152 + i * 24}" font-size="17" font-weight="500" fill="${S.sub}">${l.replace(/&/g, '&amp;')}</text>`));
  o.push(`</g>`);

  // palette chips (top right)
  {
    const chips = isF ? Object.values(INKS_F).slice(1).concat(INKS_F.paper) : [C.grass, C.path, C.stripeA, C.base, C.rail, C.awnA, C.leaf, C.trim];
    o.push(`<text x="1180" y="70" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="3" fill="${S.sub}">PALETTE</text>`);
    chips.forEach((c, i) => {
      const x = 1196 + i * 46, y = 104;
      if (isD) { o.push(`<g filter="url(#paint)">`); blob(x, y, 16, c); o.push(`</g>`); }
      else if (isG) { o.push(`<circle cx="${x}" cy="${y}" r="21" fill="url(#bulbHalo)" opacity="0.5"/>`); blob(x, y, 15, c); }
      else if (isE || isF) paint(rp([[x - 16, y - 16], [x + 16, y - 16], [x + 16, y + 16], [x - 16, y + 16]], isE ? 8 : 3), c, 'left');
      else if (isB) { blob(x, y, 17, c); }
      else if (isA) { o.push(`<rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="10" fill="${c}" stroke="${shade(c, 0.66)}" stroke-width="1.6"/><path d="M${x - 17},${y + 4}L${x + 17},${y + 4}L${x + 17},${y + 7}A10 10 0 0 1 ${x + 7},${y + 17}L${x - 7},${y + 17}A10 10 0 0 1 ${x - 17},${y + 7}Z" fill="${shade(c, 0.84)}"/><rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="10" fill="none" stroke="${shade(c, 0.66)}" stroke-width="1.6"/>`); }
      else { o.push(`<rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="9" fill="${c}"/><path d="M${x - 17},${y + 4}L${x + 17},${y + 4}L${x + 17},${y + 8}A9 9 0 0 1 ${x + 8},${y + 17}L${x - 8},${y + 17}A9 9 0 0 1 ${x - 17},${y + 8}Z" fill="${shade(c, 0.8)}"/><rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="9" fill="none" stroke="${ink}" stroke-width="${S.sw}"/>`); }
    });
  }

  // guest line-up (bottom left), at 2x
  {
    o.push(`<text x="56" y="782" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="3" fill="${S.sub}">GUESTS · 2×</text>`);
    if (isD) o.push(`<g filter="url(#paint)">`);
    SCENE.walkers.forEach((g, i) => guest(84 + i * 82, 960, { ...g, dir: 1 }, 2, true));
    if (isD) o.push(`</g>`);
  }
  // shading rules (bottom right): box, cylinder, ball at 1.6x
  {
    o.push(`<text x="1180" y="782" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="3" fill="${S.sub}">SHADING RULE · 1.6×</text>`);
    const at = (gx, gy, tx, ty, fn) => { const p = P(gx, gy); o.push(`<g transform="translate(${tx},${ty}) scale(1.6) translate(${f(-p[0])},${f(-p[1])})">`); fn(); o.push(`</g>`); };
    const ex = isF ? INKS_F.mustard : isD ? '#e3a959' : '#ffb347';
    if (isD) o.push(`<g filter="url(#paint)">`);
    at(20, 20, 1240, 950, () => { shadow(rp([P(20.05, 19.6), P(20.9, 19.6), P(20.9, 20.6), P(20.05, 20.6)], 8)); box(19.6, 20.4, 19.6, 20.4, 0, 34, ex); });
    at(30, 30, 1385, 950, () => { shadow(groundEll(30, 30, 0.42)); cyl(30, 30, 0.38, 0, 38, isF ? INKS_F.teal : isD ? '#6aa6c4' : '#56b4e9'); });
    at(40, 40, 1515, 948, () => { const p = P(40, 40); shadow(ellD([p[0] + 3, p[1] + 1], 22, 9)); blob(p[0], p[1] - 22, 22, isF ? INKS_F.red : isD ? '#e3909f' : '#ff7f9e'); });
    if (isD) o.push(`</g>`);
  }

  const defsStr = [...defs.values()].map((d) => d.s).join('');
  function extraDefs() {
    const full = `x="0" y="0" width="1600" height="1000" filterUnits="userSpaceOnUse"`;
    let s2 = `<filter id="softE" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.8"/></filter>`;
    if (isD) s2 += `
<filter id="paint" ${full}>
  <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="4.5" xChannelSelector="R" yChannelSelector="G" result="wob"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.018 0.03" numOctaves="3" seed="9" result="blot"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="2" result="tooth"/>
  <feColorMatrix in="blot" type="matrix" values="0.4 0 0 0 0.72  0.4 0 0 0 0.72  0.4 0 0 0 0.72  0 0 0 0 1" result="blotG"/>
  <feColorMatrix in="tooth" type="matrix" values="0.26 0 0 0 0.84  0.26 0 0 0 0.84  0.26 0 0 0 0.84  0 0 0 0 1" result="toothG"/>
  <feBlend in="blotG" in2="toothG" mode="multiply" result="tex"/>
  <feBlend in="wob" in2="tex" mode="multiply" result="painted"/>
  <feComposite in="painted" in2="wob" operator="in"/>
</filter>
<filter id="paperD" ${full}><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.22  0 0 0 -1.4 0.82"/></filter>`;
    if (isE) s2 += `
<filter id="paperE" ${full}><feTurbulence type="fractalNoise" baseFrequency="0.9 0.25" numOctaves="2" seed="5"/><feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 -1.6 0.8"/></filter>`;
    if (isF) s2 += `
<pattern id="dots" width="4.4" height="4.4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.2" cy="2.2" r="1.15" fill="${NAVY}"/></pattern>
<pattern id="dotsShadow" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2" cy="2" r="1.35" fill="${NAVY}"/></pattern>
<pattern id="dotsLight" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3" cy="3" r="1.2" fill="${INKS_F.teal}"/></pattern>
<pattern id="dotsSun" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><circle cx="3.5" cy="3.5" r="1.6" fill="${INKS_F.mustard}"/></pattern>
<filter id="grainF" ${full}><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 0.953  0 0 0 0 0.902  0 0 0 0 0.784  0 0 0 -30 10.2"/></filter>
<pattern id="dotsFaint" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3" cy="3" r="1.25" fill="${NAVY}"/></pattern>`;
    if (isG) s2 += `
<filter id="softG" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3268"/><stop offset="0.28" stop-color="#6a4a8c"/><stop offset="0.44" stop-color="#d9756e"/><stop offset="0.52" stop-color="#f6a965"/><stop offset="0.6" stop-color="#e88c6a"/><stop offset="0.75" stop-color="#8a4f78"/><stop offset="1" stop-color="#3a2f5c"/></linearGradient>
<radialGradient id="sunHalo"><stop offset="0" stop-color="#fff2c0" stop-opacity="0.9"/><stop offset="0.35" stop-color="#ffc77a" stop-opacity="0.45"/><stop offset="1" stop-color="#ff9a5a" stop-opacity="0"/></radialGradient>
<radialGradient id="bulbHalo"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.95"/><stop offset="0.3" stop-color="#ffd36b" stop-opacity="0.55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<radialGradient id="poolG"><stop offset="0" stop-color="#ffd98a" stop-opacity="0.55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<linearGradient id="gradeG" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#ffb060" stop-opacity="0.55"/><stop offset="0.5" stop-color="#ff9a6a" stop-opacity="0.12"/><stop offset="1" stop-color="#3a3f9a" stop-opacity="0.5"/></linearGradient>`;
    return s2;
  }
  const filters = `
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.bg[0]}"/><stop offset="1" stop-color="${S.bg[1]}"/></linearGradient>
<radialGradient id="roofShade" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#3a1020" stop-opacity="0.25"/></radialGradient>
<radialGradient id="studio" cx="0.32" cy="0.2" r="0.95"><stop offset="0" stop-color="#fff6e0" stop-opacity="0.16"/><stop offset="0.55" stop-color="#fff6e0" stop-opacity="0"/><stop offset="1" stop-color="#5a3050" stop-opacity="0.12"/></radialGradient>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
<filter id="softC" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
<filter id="aoWide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="aoWide2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
<filter id="aoTight" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.9"/></filter>
<filter id="blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>${NEW ? extraDefs() : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
<title>Thrills &amp; Chills — curved concept ${S.letter}: ${S.name}</title>
<defs>${filters}${defsStr}</defs>
${o.join('\n')}
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
// F: snap every colour to the nearest of the six inks (or the paper). Shading is dots, so nothing needs a tint.
function snapInks(svg) {
  const inks = Object.values(INKS_F).map((h) => [h, hex2rgb(h)]);
  const skin = { '#8d5a3b': INKS_F.red, '#c68642': INKS_F.mustard, '#d9a27a': INKS_F.mustard };
  return svg.replace(/#[0-9a-fA-F]{6}\b/g, (m) => {
    const lc = m.toLowerCase(); if (skin[lc]) return skin[lc];
    const [r, g, b] = hex2rgb(lc); let best = null, bd = 1e9;
    for (const [h, [R, G, B]] of inks) { const d = 2 * (r - R) ** 2 + 4 * (g - G) ** 2 + 3 * (b - B) ** 2; if (d < bd) { bd = d; best = h; } }
    return best;
  });
}
const only = process.argv.slice(2);
for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
  if (only.length && !only.includes(k)) continue;
  let svg = render(k);
  if (k === 'f') svg = snapInks(svg);
  fs.writeFileSync(`${OUT}/${STYLES[k].file}.svg`, svg);
  console.log(k, (svg.length / 1024).toFixed(0) + ' KB');
}
