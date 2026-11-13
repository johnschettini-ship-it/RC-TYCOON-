// Procedural textures for the realistic concept (round 6). Every texture is painted on a canvas in code:
// no downloaded images. All noise is seeded so every render of the same scene is identical.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise: lattice of `period` cells that wraps, smooth interpolation.
function lattice(period, seed) {
  const r = rng(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return g;
}
function makeNoise(seed) {
  const cache = {};
  return (x, y, period) => {
    const g = cache[period] || (cache[period] = lattice(period, seed + period * 131));
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const m = (v) => ((v % period) + period) % period;
    const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
// fbm over [0,1)^2 that tiles: u,v in [0,1)
function fbm(noise, u, v, base, oct, gain = 0.5) {
  let amp = 1, sum = 0, norm = 0, p = base;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise(u * p, v * p, p);
    norm += amp; amp *= gain; p *= 2;
  }
  return sum / norm;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function fieldImage(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b, a = 255] = fn(x / size, y / size, x, y);
    const i = (y * size + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));

function tex(c, { srgb = true, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// draw a shape at x,y and its wrapped copies so the texture tiles
function wrapDraw(size, x, y, pad, fn) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const X = x + dx, Y = y + dy;
    if (X < -pad || X > size + pad || Y < -pad || Y > size + pad) continue;
    fn(X, Y);
  }
}

// ---------------------------------------------------------------- grass with clover (1 texture = 6 m)
export function grass(seed = 11) {
  const S = 1024, n = makeNoise(seed), r = rng(seed);
  const dark = [62, 96, 34], mid = [92, 128, 48], light = [128, 150, 66], dry = [150, 150, 84];
  const c = fieldImage(S, (u, v) => {
    const a = fbm(n, u, v, 4, 5), b = fbm(n, u + 0.37, v + 0.71, 16, 3), f = fbm(n, u, v, 64, 2);
    let col = mixc(dark, mid, clamp((a - 0.3) * 2.2, 0, 1));
    col = mixc(col, light, clamp((b - 0.55) * 2.5, 0, 1) * 0.6);
    col = mixc(col, dry, clamp((a - 0.66) * 3, 0, 1) * 0.35);
    const k = 0.82 + f * 0.36;
    return [col[0] * k, col[1] * k, col[2] * k];
  });
  const ctx = c.getContext('2d');
  const bump = canvas(S), bx = bump.getContext('2d');
  bx.fillStyle = '#606060'; bx.fillRect(0, 0, S, S);
  // blades: short strokes, mostly upright in texture space (reads as a mown lawn)
  for (let i = 0; i < 52000; i++) {
    const x = r() * S, y = r() * S, len = 3 + r() * 7, ang = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const g = 90 + r() * 80;
    const col = `rgb(${(g * 0.62) | 0},${(g * 1.02) | 0},${(g * 0.38) | 0})`;
    const lum = (60 + r() * 140) | 0;
    wrapDraw(S, x, y, 12, (X, Y) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1 + r() * 0.8; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(ang) * len, Y + Math.sin(ang) * len); ctx.stroke();
      bx.strokeStyle = `rgb(${lum},${lum},${lum})`; bx.lineWidth = 1.2; bx.globalAlpha = 0.6;
      bx.beginPath(); bx.moveTo(X, Y); bx.lineTo(X + Math.cos(ang) * len, Y + Math.sin(ang) * len); bx.stroke();
    });
  }
  ctx.globalAlpha = 1; bx.globalAlpha = 1;
  // clover patches: clusters of three-lobed leaves, a few white flower heads
  for (let p = 0; p < 26; p++) {
    const cx = r() * S, cy = r() * S, rad = 18 + r() * 40;
    for (let i = 0; i < 26 + r() * 30; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, s = 2.2 + r() * 1.6, rot = r() * 6.28;
      const g = 0.85 + r() * 0.3;
      wrapDraw(S, x, y, 10, (X, Y) => {
        for (let k = 0; k < 3; k++) {
          const aa = rot + k * 2.094;
          ctx.fillStyle = `rgb(${(58 * g) | 0},${(112 * g) | 0},${(52 * g) | 0})`;
          ctx.beginPath(); ctx.ellipse(X + Math.cos(aa) * s, Y + Math.sin(aa) * s, s, s * 0.85, aa, 0, 6.28); ctx.fill();
          bx.fillStyle = '#b0b0b0';
          bx.beginPath(); bx.arc(X + Math.cos(aa) * s, Y + Math.sin(aa) * s, s, 0, 6.28); bx.fill();
        }
      });
    }
    for (let i = 0; i < (r() < 0.5 ? 1 : 0); i++) {
      const a = r() * 6.28, d = r() * rad;
      wrapDraw(S, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 6, (X, Y) => {
        ctx.fillStyle = '#ece9dc'; ctx.beginPath(); ctx.arc(X, Y, 2.6, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#d9c9d0'; ctx.beginPath(); ctx.arc(X + 0.6, Y + 0.6, 1.3, 0, 6.28); ctx.fill();
      });
    }
  }
  return { map: tex(c), bump: tex(bump, { srgb: false }) };
}

// ---------------------------------------------------------------- clay pavers, running bond (1 texture = 3 m)
export function pavers(seed = 21, tone = 'warm') {
  const S = 1024, n = makeNoise(seed), r = rng(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const b = canvas(S), bx = b.getContext('2d');
  const joint = tone === 'warm' ? '#8d8270' : '#8a8a86';
  ctx.fillStyle = joint; ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#202020'; bx.fillRect(0, 0, S, S);
  const pw = S / 10, ph = S / 20, gap = 3; // 30 x 15 cm pavers
  const pal = tone === 'warm'
    ? [[176, 152, 128], [160, 132, 110], [188, 168, 142], [150, 124, 104], [170, 150, 132], [140, 118, 100]]
    : [[168, 166, 160], [150, 148, 144], [182, 180, 174], [140, 138, 134], [160, 156, 150]];
  for (let row = 0; row < 20; row++) {
    const off = (row % 2) * pw / 2;
    for (let col = -1; col < 11; col++) {
      const x = col * pw + off, y = row * ph;
      const base = pal[(r() * pal.length) | 0], k = 0.92 + r() * 0.14;
      ctx.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      ctx.beginPath(); ctx.roundRect(x + gap / 2, y + gap / 2, pw - gap, ph - gap, 4); ctx.fill();
      const gr = bx.createLinearGradient(x, y, x, y + ph);
      gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.12, '#d0d0d0'); gr.addColorStop(0.88, '#d0d0d0'); gr.addColorStop(1, '#8a8a8a');
      bx.fillStyle = gr; bx.beginPath(); bx.roundRect(x + gap / 2, y + gap / 2, pw - gap, ph - gap, 5); bx.fill();
    }
  }
  // grime + speckle multiplied over everything
  const g = fieldImage(S, (u, v) => {
    const a = fbm(n, u, v, 8, 5), s = n(u * 512, v * 512, 512);
    const k = 200 + (a - 0.5) * 90 + (s - 0.5) * 40;
    return [k, k * 0.98, k * 0.95];
  });
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55; ctx.drawImage(g, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

// ---------------------------------------------------------------- large concrete slabs (1 texture = 3 m, 60 cm slabs)
export function slabs(seed = 31) {
  const S = 1024, n = makeNoise(seed), r = rng(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const b = canvas(S), bx = b.getContext('2d');
  ctx.fillStyle = '#7d7a74'; ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#303030'; bx.fillRect(0, 0, S, S);
  const s = S / 5;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const k = 0.94 + r() * 0.1, t = r();
    const base = t < 0.5 ? [196, 192, 182] : [184, 180, 172];
    ctx.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    bx.fillStyle = '#c8c8c8'; bx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
  }
  const g = fieldImage(S, (u, v) => {
    const a = fbm(n, u, v, 6, 6), sp = n(u * 700, v * 700, 700);
    const k = 205 + (a - 0.5) * 70 + (sp > 0.82 ? -40 : 0) + (sp < 0.1 ? 25 : 0);
    return [k, k, k * 0.98];
  });
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.6; ctx.drawImage(g, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

// ---------------------------------------------------------------- asphalt (1 texture = 4 m)
export function asphalt(seed = 41) {
  const S = 1024, n = makeNoise(seed);
  const c = fieldImage(S, (u, v) => {
    const a = fbm(n, u, v, 6, 4), s = n(u * 600, v * 600, 600), s2 = n(u * 300 + 7, v * 300 + 3, 300);
    let k = 70 + (a - 0.5) * 26 + (s - 0.5) * 38;
    if (s2 > 0.86) k += 46; if (s2 < 0.08) k -= 20;
    return [k, k * 1.0, k * 1.02];
  });
  const b = fieldImage(S, (u, v) => { const s = n(u * 600, v * 600, 600); const k = 128 + (s - 0.5) * 180; return [k, k, k]; });
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

// ---------------------------------------------------------------- wood planks (1 texture = 1.5 m, planks along u)
export function wood(seed = 51, tint = [150, 104, 66]) {
  const S = 512, n = makeNoise(seed), r = rng(seed);
  const planks = 10, ph = S / planks;
  const ptone = Array.from({ length: planks }, () => 0.8 + r() * 0.35);
  const poff = Array.from({ length: planks }, () => r());
  const c = fieldImage(S, (u, v, x, y) => {
    const p = Math.floor(y / ph), local = (y % ph) / ph;
    const grain = fbm(n, u * 0.25 + poff[p], v * 4 + p * 0.1, 8, 4);
    const ring = 0.5 + 0.5 * Math.sin((grain * 14 + v * 60) * 1.0);
    let k = ptone[p] * (0.78 + ring * 0.22 + (grain - 0.5) * 0.3);
    if (local < 0.06 || local > 0.94) k *= 0.45; // gap between planks
    return [tint[0] * k, tint[1] * k, tint[2] * k];
  });
  const b = fieldImage(S, (u, v, x, y) => { const local = (y % ph) / ph; const k = local < 0.06 || local > 0.94 ? 40 : 200; return [k, k, k]; });
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

// ---------------------------------------------------------------- painted steel: near-white albedo to tint + roughness
export function paint(seed = 61) {
  const S = 512, n = makeNoise(seed);
  const c = fieldImage(S, (u, v) => { const a = fbm(n, u, v, 8, 5); const k = 236 + (a - 0.5) * 30; return [k, k, k]; });
  const rgh = fieldImage(S, (u, v) => { const a = fbm(n, u + 0.3, v, 16, 4), s = n(u * 256, v * 256, 256); const k = 90 + (a - 0.5) * 70 + (s > 0.9 ? 60 : 0); return [k, k, k]; });
  return { map: tex(c), rough: tex(rgh, { srgb: false }) };
}

// ---------------------------------------------------------------- stone / concrete (1 texture = 2 m)
export function stone(seed = 71, base = [168, 164, 156]) {
  const S = 512, n = makeNoise(seed);
  const c = fieldImage(S, (u, v) => {
    const a = fbm(n, u, v, 4, 6), s = n(u * 256, v * 256, 256);
    const k = 0.86 + (a - 0.5) * 0.35 + (s - 0.5) * 0.18;
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  const b = fieldImage(S, (u, v) => { const a = fbm(n, u, v, 16, 4); const k = 128 + (a - 0.5) * 200; return [k, k, k]; });
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

// ---------------------------------------------------------------- soil cross-section for the island edge
export function soil(seed = 81) {
  const S = 512, n = makeNoise(seed);
  const c = fieldImage(S, (u, v) => {
    const a = fbm(n, u, v, 4, 5), s = n(u * 128, v * 128, 128);
    let col = mixc([92, 66, 44], [118, 90, 62], a);
    if (v < 0.08) col = mixc([60, 84, 34], col, v / 0.08);
    if (s > 0.86) col = mixc(col, [150, 140, 128], 0.7);
    return col;
  });
  return { map: tex(c) };
}

// ---------------------------------------------------------------- bark
export function bark(seed = 91) {
  const S = 256, n = makeNoise(seed);
  const c = fieldImage(S, (u, v) => {
    const a = fbm(n, u * 6, v * 0.6, 8, 4), s = n(u * 64, v * 16, 64);
    const k = 0.7 + a * 0.45 - (s > 0.7 ? 0.25 : 0);
    return [104 * k, 92 * k, 78 * k];
  });
  return { map: tex(c), bump: tex(c, { srgb: false }) };
}

// ---------------------------------------------------------------- water normal map (tileable)
export function waterNormal(seed = 101) {
  const S = 512, n = makeNoise(seed);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    H[y * S + x] = fbm(n, u, v, 8, 4, 0.55) + 0.35 * Math.sin((u * 3 + v * 5) * Math.PI * 2) * 0.1;
  }
  const c = fieldImage(S, (u, v, x, y) => {
    const h = (xx, yy) => H[((yy + S) % S) * S + ((xx + S) % S)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * 9, dy = (h(x, y + 1) - h(x, y - 1)) * 9;
    const len = Math.hypot(dx, dy, 1);
    return [(-dx / len * 0.5 + 0.5) * 255, (-dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
  });
  return { normal: tex(c, { srgb: false }) };
}

// ---------------------------------------------------------------- leaf cluster card (alpha)
export function leaves(seed = 111, bg = null) {
  const S = 256, r = rng(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S); }
  for (let i = 0; i < (bg ? 140 : 46); i++) {
    const a = r() * Math.PI * 2, d = bg ? Math.sqrt(r()) * S * 0.75 : Math.sqrt(r()) * S * 0.36;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const L = 22 + r() * 16, W = L * 0.5, rot = r() * Math.PI * 2;
    const g = 0.75 + r() * 0.5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const gr = ctx.createLinearGradient(0, -W, 0, W);
    gr.addColorStop(0, `rgb(${150 * g | 0},${178 * g | 0},${92 * g | 0})`);
    gr.addColorStop(1, `rgb(${96 * g | 0},${128 * g | 0},${56 * g | 0})`);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, -W, L / 2, 0); ctx.quadraticCurveTo(0, W, -L / 2, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(210,225,170,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
    ctx.restore();
  }
  const t = tex(c, { aniso: 4 });
  if (!bg) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t };
}

// ---------------------------------------------------------------- striped canvas (awning / carousel valance, scalloped edge)
export function stripes(colA, colB, n = 16, scallop = true) {
  const W = 1024, H = 128;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const sw = W / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? colB : colA;
    ctx.beginPath();
    ctx.moveTo(i * sw, 0); ctx.lineTo((i + 1) * sw, 0);
    if (scallop) { ctx.lineTo((i + 1) * sw, H * 0.72); ctx.quadraticCurveTo((i + 0.5) * sw, H * 1.25, i * sw, H * 0.72); }
    else { ctx.lineTo((i + 1) * sw, H); ctx.lineTo(i * sw, H); }
    ctx.fill();
  }
  // fabric weave + soft fold shading
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const k = 0.94 + 0.06 * ((x + y) % 3 === 0 ? 1 : 0) - 0.08 * Math.pow(Math.sin((x / sw) * Math.PI), 8);
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  const t = tex(c, { aniso: 8 });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t };
}

// ---------------------------------------------------------------- sign / menu boards (system sans-serif only)
export function board(lines, { w = 512, h = 256, bg = '#20302a', fg = '#f3eedc', accent = '#f2b541', title = 40, body = 26, frame = '#d8d2c0' } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = frame; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bg; ctx.fillRect(10, 10, w - 20, h - 20);
  let y = 20;
  lines.forEach((ln, i) => {
    const big = i === 0;
    ctx.font = `${big ? 700 : 500} ${big ? title : body}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = big ? accent : fg;
    ctx.textBaseline = 'top';
    if (Array.isArray(ln)) {
      ctx.textAlign = 'left'; ctx.fillText(ln[0], 28, y);
      ctx.textAlign = 'right'; ctx.fillText(ln[1], w - 28, y);
    } else { ctx.textAlign = big ? 'center' : 'left'; ctx.fillText(ln, big ? w / 2 : 28, y); }
    y += (big ? title : body) * 1.32;
  });
  const t = tex(c, { aniso: 8 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t };
}

// ---------------------------------------------------------------- corrugated sheet (bump only)
export function corrugated() {
  const S = 256;
  const c = fieldImage(S, (u) => { const k = 128 + 110 * Math.sin(u * Math.PI * 2 * 16); return [k, k, k]; });
  return { bump: tex(c, { srgb: false }) };
}

// ---------------------------------------------------------------- painted timber siding (kiosk walls)
export function siding(seed = 121) {
  const S = 512, n = makeNoise(seed);
  const c = fieldImage(S, (u, v, x, y) => {
    const local = (y % 64) / 64, a = fbm(n, u * 0.5, v * 4, 8, 3);
    let k = 0.93 + (a - 0.5) * 0.12;
    if (local > 0.9) k *= 0.6;
    return [240 * k, 236 * k, 226 * k];
  });
  const b = fieldImage(S, (u, v, x, y) => { const local = (y % 64) / 64; const k = local > 0.9 ? 30 : 140 + local * 80; return [k, k, k]; });
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}
