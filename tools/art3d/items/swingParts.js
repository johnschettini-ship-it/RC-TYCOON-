// Small three.js parts shared by the batch 1 "swinger" rides (pendulum_ship, magic_carpet, flip_arm).
import { THREE } from './common.js';
import { M, std } from '../kit.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Painted steel in `color`: clear-coated, without the kit's paint noise texture (these rides have many pictures per
 * turn, and smooth paint keeps each picture small under the size rule).
 */
export function paint(K, color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25, ...o });
}

/** Seat upholstery / moulded plastic. */
export function plastic(color, roughness = 0.45) {
  return std({ color, roughness, metalness: 0.05 });
}

/** Round tube from a to b, radius r0 at a and r1 at b. */
export function tube(a, b, r0, r1, mat, seg = 12) {
  const len = a.distanceTo(b);
  const m = M(new THREE.CylinderGeometry(r1, r0, len, seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return m;
}

/** Square box beam from a to b (w x d section); `roll` turns the section about the beam's axis. */
export function boxBeam(a, b, w, d, mat, roll = 0) {
  const len = a.distanceTo(b);
  const m = M(new THREE.BoxGeometry(w, len, d), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  if (roll) m.rotateY(roll);
  return m;
}

/** A box of size (w, h, d) with its centre at (x, y, z). */
export function boxAt(w, h, d, x, y, z, mat) {
  const m = M(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Open steel stair: `n` treads from `top` down to the ground, starting at `at` ([x, z]) and running along `axis` in `dir`. */
export function stairs(K, { axis = 'x', dir = 1, at, top, width = 1.4, n = 6, run = 0.3, tread, steel }) {
  const g = new THREE.Group();
  const rise = top / (n + 1);
  const P = (along, across, y) => (axis === 'x' ? new THREE.Vector3(at[0] + dir * along, y, at[1] + across) : new THREE.Vector3(at[0] + across, y, at[1] + dir * along));
  for (let i = 0; i < n; i++) {
    const p = P((i + 0.5) * run, 0, top - (i + 1) * rise);
    g.add(axis === 'x' ? boxAt(run - 0.02, 0.05, width, p.x, p.y, p.z, tread) : boxAt(width, 0.05, run - 0.02, p.x, p.y, p.z, tread));
  }
  for (const s of [-1, 1]) {
    const a = P(0, s * (width / 2 + 0.04), top), b = P(n * run + 0.1, s * (width / 2 + 0.04), 0);
    g.add(boxBeam(a, b, 0.06, 0.22, steel));
  }
  return g;
}

/** Open boarding deck: boards on a steel frame (edge beams, posts, a few braces) from x0..x1, z0..z1 at height `top`. */
export function deck(K, { x0, x1, z0, z1, top, boards, steel }) {
  const g = new THREE.Group();
  const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)], [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
  g.add(boxAt(xb - xa, 0.07, zb - za, (xa + xb) / 2, top - 0.035, (za + zb) / 2, boards));
  for (const z of [za + 0.06, zb - 0.06]) g.add(boxAt(xb - xa, 0.18, 0.1, (xa + xb) / 2, top - 0.16, z, steel));
  for (const x of [xa + 0.06, xb - 0.06]) g.add(boxAt(0.1, 0.18, zb - za, x, top - 0.16, (za + zb) / 2, steel));
  const nx = Math.max(1, Math.round((xb - xa) / 1.8)), nz = Math.max(1, Math.round((zb - za) / 1.8));
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
    if (i > 0 && i < nx && k > 0 && k < nz) continue; // posts round the edge only
    const x = xa + 0.08 + (i * (xb - xa - 0.16)) / nx, z = za + 0.08 + (k * (zb - za - 0.16)) / nz;
    g.add(boxAt(0.09, top - 0.25, 0.09, x, (top - 0.25) / 2, z, steel));
  }
  return g;
}

/** Railing along points (posts every ~2 m and a top rail), standing on height `y`. */
export function railing(pts, y, mat, h = 1.0) {
  const g = new THREE.Group();
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = new THREE.Vector3(pts[k][0], y, pts[k][1]);
    const b = new THREE.Vector3(pts[k + 1][0], y, pts[k + 1][1]);
    const n = Math.max(1, Math.round(a.distanceTo(b) / 2.0));
    for (let i = 0; i <= n; i++) {
      if (k > 0 && i === 0) continue;
      const p = a.clone().lerp(b, i / n);
      g.add(tube(p, p.clone().setY(y + h), 0.03, 0.03, mat, 6));
    }
    for (const hh of [h]) g.add(tube(a.clone().setY(y + hh), b.clone().setY(y + hh), 0.025, 0.025, mat, 6));
  }
  return g;
}

/** Canvas texture drawn by `draw(ctx, w, h)` (sRGB colour). */
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Highest point (metres) of `root` over every picture's pose: the bake logs it to check RIDE_HEIGHT_M. */
export function peakHeight(root, pictures) {
  let top = 0;
  for (const p of pictures) {
    p.pose();
    root.updateMatrixWorld(true);
    top = Math.max(top, new THREE.Box3().setFromObject(root).max.y);
  }
  return top;
}

/** Painted steel deck plate for boarding decks and stair treads: plain, so it costs little in the pictures. */
export function deckPlate() {
  return std({ color: '#8f8a82', roughness: 0.85, metalness: 0.15 });
}

/**
 * A low queue gate on the ground at `at` ([x, z]): two posts 1.5 m apart along x, a bar and a small sign board on
 * top (1.4 m high, below every sweep of the rides' moving parts). `sign` is the board's material.
 */
export function gate(at, post, sign) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(tube(new THREE.Vector3(s * 0.75, 0, 0), new THREE.Vector3(s * 0.75, 1.15, 0), 0.05, 0.05, post, 8));
  g.add(tube(new THREE.Vector3(-0.75, 1.05, 0), new THREE.Vector3(0.75, 1.05, 0), 0.035, 0.035, post, 8));
  g.add(boxAt(1.0, 0.3, 0.05, 0, 1.25, 0, sign));
  g.position.set(at[0], 0, at[1]);
  return g;
}

/** A flat walkway strip on the ground from a to b ([x, z]), `w` wide. */
export function walkway(a, b, w, mat) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const m = boxAt(w, 0.04, Math.hypot(dx, dz) + w * 0.5, (a[0] + b[0]) / 2, 0.02, (a[1] + b[1]) / 2, mat);
  m.rotation.y = Math.atan2(dx, dz);
  return m;
}
