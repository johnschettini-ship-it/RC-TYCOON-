// Small building helpers shared by the Task 5 ride modules (bumper_cars, mirror_maze, haunted_manor, thunder_disc).
import { THREE } from './common.js';
import { M, std } from '../kit.js';
import { paint } from '../textures.js';

let paintTex = null;
/** Painted steel (a clear-coated paint with a little wear), any colour. */
export function painted(color, { metalness = 0.3, roughness = 0.45, clearcoat = 0.35 } = {}) {
  paintTex ??= paint();
  return new THREE.MeshPhysicalMaterial({ map: paintTex.map, roughnessMap: paintTex.rough, color, metalness, roughness, clearcoat, clearcoatRoughness: 0.3 });
}

/** A glossy fibreglass body colour. */
export function gloss(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
}

/** A self-lit material that reads in daylight (bulbs, windows, signs). */
export function glow(color, intensity = 1.2, base = '#ffffff') {
  return std({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.35 });
}

/** Box with its base at y0 (x, z centred). */
export function slab(w, h, d, mat, x = 0, y0 = 0, z = 0) {
  const m = M(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y0 + h / 2, z);
  return m;
}

/** Rounded rectangle shape (centred), for extrusions. */
export function roundRect(w, d, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2, z0 = -d / 2;
  s.moveTo(x0 + r, z0);
  s.lineTo(x0 + w - r, z0); s.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r);
  s.lineTo(x0 + w, z0 + d - r); s.quadraticCurveTo(x0 + w, z0 + d, x0 + w - r, z0 + d);
  s.lineTo(x0 + r, z0 + d); s.quadraticCurveTo(x0, z0 + d, x0, z0 + d - r);
  s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
  return s;
}

/** Extrude a flat shape (x, z plan) up by h from y0, with a soft bevel. */
export function extrudeUp(shape, h, mat, y0 = 0, bevel = 0.03) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(Math.PI / 2); // shape (x, y) -> plan (x, z = y), extrusion along -y
  g.translate(0, y0 + h - bevel, 0);
  return M(g, mat);
}

/** Bulbs as one instanced mesh at the given points. */
export function bulbs(points, mat, r = 0.06) {
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), mat, points.length);
  const m4 = new THREE.Matrix4();
  points.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, m4); });
  im.castShadow = false;
  return im;
}

/** A canvas texture drawn by `draw(ctx, w, h)`. */
export function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Deterministic 0..1 hash of an integer. */
export function hash01(n) {
  let x = (n | 0) * 374761393 + 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
