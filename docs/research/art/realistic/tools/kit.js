// Round 7 shared kit: textures, materials, street furniture, trees, the carousel and its horses, guests and a
// paving grid with kerbs. Every scene (park.js = T/U/V/W, scenes.js = X/Y/Z/AA) builds from this, so a fix here
// shows up everywhere. All lengths in metres, y up.
import * as THREE from 'three';
import * as T from './textures.js';
import { person, randomLook } from './people.js';

export const TILE = 3;
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function rep(t, sx, sy = sx) { const c = t.clone(); c.repeat.set(sx, sy); c.needsUpdate = true; return c; }
export function std(o) { return new THREE.MeshStandardMaterial(o); }
export function M(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
// world-space UVs on the xz plane (so paving and lawn run continuously across meshes)
export function planarUV(geo, scale) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); uv[i * 2] = v.x / scale; uv[i * 2 + 1] = -v.z / scale; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// make a flat (rotated) shape geometry face up: reverse the winding if it came out facing down
export function faceUp(geo) {
  const n = geo.attributes.normal;
  if (n.getY(0) < 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  }
  return geo;
}
const _up = new THREE.Vector3(0, 1, 0);
const rodGeo = new Map();
export function rod(a, b, r, mat, seg = 10) {
  const len = a.distanceTo(b);
  const k = r.toFixed(3) + '_' + seg;
  if (!rodGeo.has(k)) rodGeo.set(k, new THREE.CylinderGeometry(r, r, 1, seg));
  const m = M(rodGeo.get(k), mat);
  m.scale.y = Math.max(1e-4, len);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, b.clone().sub(a).normalize());
  return m;
}

// ---------------------------------------------------------------- textures: built lazily, once per page
const TXB = {
  grass: () => T.grass(), pavers: () => T.pavers(21, 'warm'), paversGrey: () => T.pavers(23, 'grey'), slabs: () => T.slabs(), asphalt: () => T.asphalt(),
  wood: () => T.wood(), deck: () => T.wood(57, [120, 112, 100]), boards: () => T.wood(59, [150, 128, 98]), paint: () => T.paint(), stone: () => T.stone(),
  concrete: () => T.stone(77, [186, 182, 174]), rock: () => T.stone(79, [128, 124, 116]), soil: () => T.soil(), bark: () => T.bark(), water: () => T.waterNormal(),
  leaves: () => T.leaves(), leaves2: () => T.leaves(119), foliage: () => T.leaves(131, '#3d5a2c'),
  needles: () => T.needles(), needles2: () => T.needles(143, [44, 72, 50]), snowCard: () => T.snowCard(),
  snow: () => T.snow(), sand: () => T.sand(), sea: () => T.sea(), ice: () => T.ice(), shingles: () => T.shingles(), logs: () => T.logs(),
  valance: () => T.stripes('#b8202a', '#f4efe2', 24), awning: () => T.stripes('#1f6f5c', '#f4efe2', 10, true),
  roofStripes: () => T.stripes('#a8232b', '#efe6d2', 48, false),
  corr: () => T.corrugated(), siding: () => T.siding(),
};
const TX = {};
export const tx = new Proxy(TX, { get: (o, k) => o[k] || (TXB[k] ? (o[k] = TXB[k]()) : undefined) });

// ---------------------------------------------------------------- the kit for one scene
export function makeKit(variant) {
  const night = !!variant.night;
  const root = new THREE.Group();
  const lights = [], lightMats = [];
  const MB = {
    lawn: () => std({ map: rep(tx.grass.map, 7), bumpMap: rep(tx.grass.bump, 7), bumpScale: 1.2, roughness: 0.95, vertexColors: true }),
    pavers: () => std({ map: tx.pavers.map, bumpMap: tx.pavers.bump, bumpScale: 1.5, roughness: 0.82 }),
    paversGrey: () => std({ map: tx.paversGrey.map, bumpMap: tx.paversGrey.bump, bumpScale: 1.5, roughness: 0.8 }),
    slabs: () => std({ map: tx.slabs.map, bumpMap: tx.slabs.bump, bumpScale: 1.2, roughness: 0.78 }),
    asphalt: () => std({ map: tx.asphalt.map, bumpMap: tx.asphalt.bump, bumpScale: 0.8, roughness: 0.9 }),
    kerb: () => std({ map: tx.concrete.map, bumpMap: tx.concrete.bump, bumpScale: 0.6, roughness: 0.75, color: '#d8d6d0' }),
    soil: () => std({ map: tx.soil.map, roughness: 1 }),
    wood: () => std({ map: tx.wood.map, bumpMap: tx.wood.bump, bumpScale: 0.8, roughness: 0.7 }),
    deck: () => std({ map: tx.deck.map, bumpMap: tx.deck.bump, bumpScale: 0.8, roughness: 0.8 }),
    boards: () => std({ map: tx.boards.map, bumpMap: tx.boards.bump, bumpScale: 1, roughness: 0.85 }),
    timber: () => std({ map: tx.wood.map, color: '#c9b49a', roughness: 0.8 }),
    whiteTimber: () => std({ map: tx.paint.map, color: '#f1ede4', roughness: 0.6 }),
    concrete: () => std({ map: tx.concrete.map, bumpMap: tx.concrete.bump, bumpScale: 0.5, roughness: 0.85 }),
    stone: () => std({ map: tx.stone.map, bumpMap: tx.stone.bump, bumpScale: 1.5, roughness: 0.9 }),
    rock: () => std({ map: tx.rock.map, bumpMap: tx.rock.bump, bumpScale: 3, roughness: 0.95, flatShading: true }),
    steelBlue: () => new THREE.MeshPhysicalMaterial({ map: tx.paint.map, roughnessMap: tx.paint.rough, color: '#2f6fb5', metalness: 0.35, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    steelWhite: () => new THREE.MeshPhysicalMaterial({ map: tx.paint.map, roughnessMap: tx.paint.rough, color: '#e9e6df', metalness: 0.3, roughness: 0.5, clearcoat: 0.3 }),
    steelYellow: () => new THREE.MeshPhysicalMaterial({ map: tx.paint.map, roughnessMap: tx.paint.rough, color: '#f0b323', metalness: 0.3, roughness: 0.45, clearcoat: 0.4 }),
    darkSteel: () => std({ map: tx.paint.map, roughnessMap: tx.paint.rough, color: '#2c3133', metalness: 0.5, roughness: 0.5 }),
    green: () => std({ map: tx.paint.map, roughnessMap: tx.paint.rough, color: '#1f3b2e', metalness: 0.4, roughness: 0.5 }),
    stainless: () => std({ color: '#c9ccd0', metalness: 1, roughness: 0.28 }),
    brass: () => std({ color: '#d6a84a', metalness: 1, roughness: 0.25 }),
    gold: () => std({ color: '#e0b250', metalness: 1, roughness: 0.3 }),
    chain: () => std({ color: '#2a2a2a', metalness: 0.8, roughness: 0.45 }),
    roofSheet: () => std({ color: '#9aa3a8', metalness: 0.6, roughness: 0.4, bumpMap: rep(tx.corr.bump, 10), bumpScale: 2 }),
    carRed: () => new THREE.MeshPhysicalMaterial({ color: '#c8231e', roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }),
    seat: () => std({ color: '#262626', roughness: 0.6 }),
    bark: () => std({ map: tx.bark.map, bumpMap: tx.bark.bump, bumpScale: 2, roughness: 0.95 }),
    siding: () => std({ map: tx.siding.map, bumpMap: tx.siding.bump, bumpScale: 1, roughness: 0.75 }),
    valance: () => std({ map: tx.valance.map, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide }),
    awning: () => std({ map: tx.awning.map, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide }),
    roofStripes: () => std({ map: tx.roofStripes.map, roughness: 0.6, side: THREE.DoubleSide }),
    cream: () => std({ color: '#efe6cf', roughness: 0.55, map: tx.paint.map }),
    glass: () => new THREE.MeshPhysicalMaterial({ color: '#c8d8e0', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35 }),
    water: () => new THREE.MeshPhysicalMaterial({ color: '#1d4a4f', roughness: 0.06, metalness: 0, normalMap: rep(tx.water.normal, 3), normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.05 }),
    spray: () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false }),
    foam: () => new THREE.MeshStandardMaterial({ color: '#f4f8f8', roughness: 0.6, transparent: true, opacity: 0.85 }),
    snowM: () => std({ map: rep(tx.snow.map, 1), bumpMap: tx.snow.bump, bumpScale: 0.6, roughness: 0.85, color: '#ffffff' }),
    snowFlat: () => std({ color: '#f4f7fb', roughness: 0.8 }),
    shingles: () => std({ map: tx.shingles.map, bumpMap: tx.shingles.bump, bumpScale: 1.5, roughness: 0.9 }),
    logs: () => std({ map: tx.logs.map, bumpMap: tx.logs.bump, bumpScale: 2, roughness: 0.85 }),
  };
  const mat = new Proxy({}, { get: (o, k) => o[k] || (MB[k] ? (o[k] = MB[k]()) : undefined), set: (o, k, v) => { o[k] = v; return true; } });

  const bulb = (color = '#ffd9a0', day = 0.25, nightI = 6) => {
    const m = std({ color: '#fff4e0', emissive: color, emissiveIntensity: night ? nightI : day, roughness: 0.3 });
    lightMats.push(m); return m;
  };
  const lampGlass = bulb('#ffcf8a', 0.05, 5);
  const led = bulb('#ffe9c0', 0, 7);
  const ringBulb = bulb('#ffe2a8', 0.35, 9);
  const festoon = bulb('#ffd27a', 1.4, 9); // fairy lights that read in daylight (winter festival)
  const windowGlow = std({ color: night ? '#ffd7a0' : '#8fa6b0', emissive: '#ffbf70', emissiveIntensity: night ? 2.2 : 0, roughness: 0.15, metalness: 0.1 });
  const addLight = (pos, color = '#ffc98a', intensity = 30, dist = 14) => {
    if (!night) return;
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.copy(pos); root.add(l); lights.push(l);
  };
  const K = { night, root, lights, lightMats, mat, tx, bulb, lampGlass, led, ringBulb, festoon, windowGlow, addLight, guests: [] };

  // ---------------------------------------------------------------- street furniture
  K.lamp = (x, z, y = 0, pole = mat.green) => {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 12), pole).translateY(0.175));
    g.add(M(new THREE.CylinderGeometry(0.055, 0.075, 3.6, 10), pole).translateY(2.0));
    g.add(M(new THREE.CylinderGeometry(0.13, 0.09, 0.12, 8), pole).translateY(3.82));
    const glass = M(new THREE.CylinderGeometry(0.2, 0.12, 0.42, 8), lampGlass, false, false); glass.position.y = 4.07; g.add(glass);
    g.add(M(new THREE.ConeGeometry(0.3, 0.26, 8), pole).translateY(4.4));
    g.add(M(new THREE.SphereGeometry(0.05, 8, 6), pole).translateY(4.56));
    g.position.set(x, y, z);
    root.add(g);
    addLight(V(x, y + 3.9, z), '#ffc98a', 26, 13);
    return g;
  };
  K.bench = (x, z, rot, y = 0.05) => {
    const g = new THREE.Group();
    for (const sx of [-0.7, 0.7]) {
      g.add(M(new THREE.BoxGeometry(0.06, 0.44, 0.5), mat.darkSteel).translateX(sx).translateY(0.22));
      const back = M(new THREE.BoxGeometry(0.06, 0.5, 0.06), mat.darkSteel); back.position.set(sx, 0.66, -0.24); back.rotation.x = -0.18; g.add(back);
    }
    for (let i = 0; i < 4; i++) g.add(M(new THREE.BoxGeometry(1.7, 0.035, 0.1), mat.wood).translateY(0.45).translateZ(-0.18 + i * 0.12));
    for (let i = 0; i < 3; i++) { const s = M(new THREE.BoxGeometry(1.7, 0.1, 0.03), mat.wood); s.position.set(0, 0.6 + i * 0.13, -0.27 - i * 0.025); s.rotation.x = -0.18; g.add(s); }
    g.position.set(x, y, z); g.rotation.y = rot;
    root.add(g);
    return g;
  };
  K.bin = (x, z, y = 0.05, m = mat.green) => {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(0.26, 0.24, 0.85, 16), m).translateY(0.43));
    g.add(M(new THREE.CylinderGeometry(0.29, 0.29, 0.06, 16), m).translateY(0.88));
    g.add(M(new THREE.CylinderGeometry(0.12, 0.29, 0.12, 16), m).translateY(0.96));
    g.position.set(x, y, z);
    root.add(g);
    return g;
  };
  K.planter = (x, z, w, d, y = 0.05, seed = 1) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(M(new THREE.BoxGeometry(w, 0.55, d), mat.concrete).translateY(0.275));
    const soil = M(new THREE.BoxGeometry(w - 0.16, 0.02, d - 0.16), std({ color: '#4a3826', roughness: 1 })); soil.position.y = 0.53; g.add(soil);
    root.add(g);
    const r = T.rng(seed);
    for (let i = 0; i < Math.max(2, Math.round(w * d * 1.2)); i++) K.shrub(x + (r() - 0.5) * (w - 0.6), z + (r() - 0.5) * (d - 0.6), 0.4 + r() * 0.25, seed * 13 + i, y + 0.5, ['#e2546a', '#f2c14e', '#f4f1ea', null][i % 4]);
    return g;
  };

  // ---------------------------------------------------------------- trees
  // Round 7: the crown core is small and mid-green (no dark balls), leaf cards fill the whole volume at many depths,
  // and every card gets its own tint (yellow-green to blue-green, lighter on the outside and top).
  const card = new THREE.PlaneGeometry(1, 1);
  const leafMat = std({ map: tx.leaves.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  const leafMat2 = std({ map: tx.leaves2.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, color: '#eef2dc' });
  const coreMat = std({ color: '#7f9a5a', roughness: 1, map: rep(tx.foliage.map, 2) });
  const TINTS = [[1.08, 1.1, 0.72], [0.98, 1.04, 0.86], [0.86, 1.0, 0.92], [1.0, 0.98, 0.78], [0.9, 1.06, 0.8]];
  K.tree = (x, z, H, seed, crownR = 3.2, y = 0) => {
    const r = T.rng(seed);
    const g = new THREE.Group(); g.position.set(x, y, z);
    const trunkH = H * 0.42;
    const trunk = M(new THREE.CylinderGeometry(0.16 * H / 9, 0.3 * H / 9, trunkH + 0.4, 10), mat.bark); trunk.position.y = trunkH / 2; g.add(trunk);
    g.add(M(new THREE.CylinderGeometry(0.42 * H / 9, 0.5 * H / 9, 0.18, 10), mat.bark).translateY(0.05));
    const top = V(0, trunkH, 0);
    const crownC = V(0, H - crownR * 0.95, 0);
    const clusters = [];
    const nC = 13 + ((r() * 6) | 0);
    for (let i = 0; i < nC; i++) {
      const a = r() * Math.PI * 2, el = (r() * 1.4 - 0.4);
      const d = crownR * (0.45 + r() * 0.5);
      clusters.push({ c: V(Math.cos(a) * d * Math.cos(el * 0.6), crownC.y + Math.sin(el) * crownR * 0.6, Math.sin(a) * d * Math.cos(el * 0.6)), s: crownR * (0.38 + r() * 0.22) });
    }
    clusters.push({ c: V(0, H - crownR * 0.45, 0), s: crownR * 0.55 });
    for (let i = 0; i < 7; i++) {
      const tgt = clusters[i].c.clone().multiplyScalar(0.75); tgt.y = clusters[i].c.y * 0.92;
      g.add(rod(top.clone().add(V(0, -0.3, 0)), tgt, 0.1 * H / 9, mat.bark, 6));
    }
    const cards = [];
    for (const { c, s } of clusters) {
      const b = M(new THREE.IcosahedronGeometry(s * 0.42, 1), coreMat); b.position.copy(c); b.scale.set(1, 0.8, 1); g.add(b);
      for (let k = 0; k < 64; k++) {
        const dir = V(r() * 2 - 1, r() * 1.6 - 0.5, r() * 2 - 1).normalize();
        const depth = 0.3 + Math.pow(r(), 0.6) * 0.78; // many cards near the surface, some deep inside
        const p = c.clone().addScaledVector(dir, s * depth);
        cards.push({ p, dir, depth, size: 0.9 + r() * 0.8, tint: TINTS[(r() * TINTS.length) | 0], k: 0.85 + r() * 0.3 });
      }
    }
    const im = new THREE.InstancedMesh(card, seed % 2 ? leafMat : leafMat2, cards.length);
    const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), col = new THREE.Color();
    cards.forEach((cd, k) => {
      q.setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI));
      m4.compose(cd.p, q, V(cd.size, cd.size, cd.size));
      im.setMatrixAt(k, m4);
      const world = cd.p.clone().sub(crownC);
      const outer = Math.min(1, world.length() / (crownR * 1.2));
      const sh = cd.k * (0.78 + outer * 0.3 + Math.max(0, world.y / crownR) * 0.18) * (0.85 + cd.depth * 0.2);
      im.setColorAt(k, col.setRGB(sh * cd.tint[0], sh * cd.tint[1], sh * cd.tint[2]));
    });
    im.castShadow = true; im.receiveShadow = true;
    g.add(im);
    g.rotation.y = r() * 6.28;
    root.add(g);
    return g;
  };
  const flowerMats = new Map();
  K.shrub = (x, z, s, seed, y = 0, flowers = null) => {
    const r = T.rng(seed);
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (let i = 0; i < 3; i++) {
      const b = M(new THREE.IcosahedronGeometry(s * (0.45 + r() * 0.2), 1), std({ color: ['#5d7a3c', '#66843f', '#55703a'][i % 3], roughness: 0.95 }));
      b.position.set((r() - 0.5) * s * 0.8, s * 0.42, (r() - 0.5) * s * 0.8); b.scale.y = 0.72; g.add(b);
    }
    const n = 46, cards = new THREE.InstancedMesh(card, leafMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const dir = V(r() * 2 - 1, r() * 1.2, r() * 2 - 1).normalize();
      q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      m4.compose(V(dir.x * s * 0.8, s * 0.4 + dir.y * s * 0.6, dir.z * s * 0.8), q, V(0.6 * s / 1.1, 0.6 * s / 1.1, 0.6 * s / 1.1)); cards.setMatrixAt(k, m4);
      const t = TINTS[k % TINTS.length], sh = 0.85 + r() * 0.3 + dir.y * 0.15; cards.setColorAt(k, col.setRGB(sh * t[0], sh * t[1], sh * t[2]));
    }
    cards.castShadow = true; cards.receiveShadow = true; g.add(cards);
    if (flowers) {
      if (!flowerMats.has(flowers)) flowerMats.set(flowers, std({ color: flowers, roughness: 0.7 }));
      const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), flowerMats.get(flowers), 18);
      for (let k = 0; k < 18; k++) { const dir = V(r() * 2 - 1, 0.4 + r(), r() * 2 - 1).normalize(); m4.makeTranslation(dir.x * s * 0.75, s * 0.42 + dir.y * s * 0.5, dir.z * s * 0.75); fl.setMatrixAt(k, m4); }
      g.add(fl);
    }
    root.add(g);
    return g;
  };
  // conifer: trunk + tiers of drooping needle-branch cards round a dark core; snow = white cards on top of each branch
  const needleMat = std({ map: tx.needles.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  const needleMat2 = std({ map: tx.needles2.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  const snowCardMat = std({ map: tx.snowCard.map, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75 });
  const pineCore = std({ color: '#2e4a2e', roughness: 1 });
  const branchCard = new THREE.PlaneGeometry(1, 1); branchCard.translate(0.5, 0, 0); branchCard.rotateX(-Math.PI / 2); // lies flat, base at origin, points +x
  K.pine = (x, z, H, seed, { y = 0, snow = false, R = H * 0.23 } = {}) => {
    const r = T.rng(seed);
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(M(new THREE.CylinderGeometry(0.05, H * 0.022, H * 0.98, 8), mat.bark).translateY(H * 0.49));
    const base = H * (0.14 + r() * 0.06);
    const core = M(new THREE.ConeGeometry(R * 0.55, H - base, 10), snow ? std({ color: '#3d5540', roughness: 1 }) : pineCore); core.position.y = base + (H - base) / 2; g.add(core);
    const items = [], snows = [];
    const tiers = Math.round((H - base) / 0.42);
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers, yy = base + f * (H - base);
      const rad = R * Math.pow(1 - f, 0.95) + 0.25;
      const nb = Math.max(4, Math.round(5 + rad * 3.2));
      for (let b = 0; b < nb; b++) {
        const a = (b / nb) * Math.PI * 2 + r() * 0.6 + t * 0.9;
        const len = rad * (0.8 + r() * 0.35), wdt = Math.min(1.1, 0.45 + len * 0.45);
        const droop = 0.18 + r() * 0.2 + (1 - f) * 0.12, roll = (r() - 0.5) * 0.8;
        items.push({ yy, a, len, wdt, droop, roll, k: 0.8 + r() * 0.35 + f * 0.15 });
        if (snow && r() < 0.85) snows.push({ yy: yy + 0.06, a, len: len * (0.7 + r() * 0.2), wdt: wdt * 0.85, droop: droop * 0.75, roll: roll * 0.3, k: 1 });
      }
    }
    const fill = (list, m) => {
      const im = new THREE.InstancedMesh(branchCard, m, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
      list.forEach((it, i) => {
        q.setFromEuler(new THREE.Euler(it.roll, -it.a, -it.droop, 'YZX'));
        m4.compose(V(Math.cos(it.a) * 0.08, it.yy, Math.sin(it.a) * 0.08), q, V(it.len, 1, it.wdt));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, col.setRGB(it.k, it.k, it.k));
      });
      im.castShadow = true; im.receiveShadow = true;
      g.add(im);
    };
    fill(items, seed % 2 ? needleMat : needleMat2);
    if (snow) { fill(snows, snowCardMat); const cap = M(new THREE.ConeGeometry(0.28, 0.5, 8), mat.snowFlat); cap.position.y = H - 0.15; g.add(cap); }
    g.rotation.y = r() * 6.28;
    root.add(g);
    return g;
  };
  K.rock = (x, z, s, seed, y = 0, snow = false) => {
    const r = T.rng(seed);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.75 + r() * 0.45; p.setXYZ(i, p.getX(i) * k, Math.max(-0.3, p.getY(i)) * k * 0.7, p.getZ(i) * k); }
    geo.computeVertexNormals();
    const m = M(geo, mat.rock); m.scale.set(s * (1 + r() * 0.4), s, s * (0.9 + r() * 0.3)); m.position.set(x, y + s * 0.1, z); m.rotation.y = r() * 6;
    root.add(m);
    if (snow) { const c = M(new THREE.SphereGeometry(s * 0.95, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), mat.snowFlat); c.position.set(x, y + s * 0.05, z); c.scale.set(1.05, 0.8, 1); root.add(c); }
    return m;
  };

  // ---------------------------------------------------------------- guests
  K.guest = (seed, x, z, rotY, pose = { kind: 'stand' }, look = {}, y = 0.05) => {
    const p = person(randomLook(seed, { ...K.look, ...look }), pose);
    p.position.set(x, y, z); p.rotation.y = rotY;
    root.add(p); K.guests.push(p);
    return p;
  };
  K.look = {}; // scene-wide look defaults (e.g. { season: 'winter' })
  K.sitOn = (seed, x, z, rot, y = 0.05, look = {}) => { const p = K.guest(seed, x, z, rot, { kind: 'sit' }, look); p.position.y = y + 0.47; return p; };
  // a bench with one or two sitters
  K.benchWith = (x, z, rot, seeds = [], y = 0.05) => {
    K.bench(x, z, rot, y);
    const dx = Math.cos(rot), dz = -Math.sin(rot);
    seeds.forEach((s, i) => { const o = seeds.length === 1 ? 0.2 : (i ? 0.38 : -0.38); K.sitOn(s, x + dx * o, z + dz * o, rot, y); });
  };
  // a walking crowd along a line (x0,z0)->(x1,z1), spread across the path width w
  K.crowd = (seed, n, x0, z0, x1, z1, w, y = 0.05, look = {}) => {
    const r = T.rng(seed);
    const dir = Math.atan2(x1 - x0, z1 - z0);
    const nx = (z1 - z0), nz = -(x1 - x0), nl = Math.hypot(nx, nz) || 1;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.2 + r() * 0.6) / n, off = (r() - 0.5) * w;
      const back = r() < 0.5;
      const kind = r() < 0.82 ? 'walk' : 'stand';
      K.guest(seed * 100 + i, x0 + (x1 - x0) * t + nx / nl * off, z0 + (z1 - z0) * t + nz / nl * off, (back ? dir + Math.PI : dir) + (kind === 'stand' ? (r() - 0.5) * 2 : (r() - 0.5) * 0.3), { kind, phase: r() * 6.28, item: kind === 'stand' && r() < 0.2 ? ['cone', 'cup', 'floss'][(r() * 3) | 0] : undefined }, look, y);
    }
  };

  // ---------------------------------------------------------------- paving: cell grid with kerbs where paving meets anything else
  // opts: { half, cell, y, regions: [[x0, x1, z0, z1, kind]], mats: { kind: material }, uv: { kind: metres }, kerb = true, edge = true }
  K.paving = (opts) => {
    const { half, cell = 1.5, y = 0.05, regions, kerb = true, edge = true, kerbMat = mat.kerb, kerbH = 0.13, between = false } = opts;
    const N = Math.round((2 * half) / cell);
    const kind = Array.from({ length: N }, () => new Array(N).fill(null));
    const cellOf = (v) => Math.round((v + half) / cell);
    for (const [x0, x1, z0, z1, k] of regions) for (let i = cellOf(x0); i < cellOf(x1); i++) for (let j = cellOf(z0); j < cellOf(z1); j++) if (i >= 0 && j >= 0 && i < N && j < N) kind[i][j] = k;
    const kinds = new Set(regions.map((r) => r[4]).filter(Boolean));
    for (const k of kinds) {
      const pos = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (kind[i][j] === k) {
        const x0 = -half + i * cell, z0 = -half + j * cell, x1 = x0 + cell, z1 = z0 + cell;
        pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      planarUV(g, (opts.uv && opts.uv[k]) || 3);
      root.add(M(g, (opts.mats && opts.mats[k]) || mat[k], false, true));
    }
    if (kerb) {
      const kerbs = [];
      const paved = (i, j) => i >= 0 && j >= 0 && i < N && j < N && kind[i][j];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (!paved(i, j)) continue;
        const x0 = -half + i * cell, z0 = -half + j * cell;
        const e = (c) => (edge || c);
        if (!paved(i - 1, j) && e(i > 0)) kerbs.push([x0 + 0.075, z0 + cell / 2, 0.15, cell]);
        if (!paved(i + 1, j) && e(i < N - 1)) kerbs.push([x0 + cell - 0.075, z0 + cell / 2, 0.15, cell]);
        if (!paved(i, j - 1) && e(j > 0)) kerbs.push([x0 + cell / 2, z0 + 0.075, cell, 0.15]);
        if (!paved(i, j + 1) && e(j < N - 1)) kerbs.push([x0 + cell / 2, z0 + cell - 0.075, cell, 0.15]);
        if (between && paved(i + 1, j) && kind[i + 1][j] !== kind[i][j]) kerbs.push([x0 + cell, z0 + cell / 2, 0.15, cell]);
        if (between && paved(i, j + 1) && kind[i][j + 1] !== kind[i][j]) kerbs.push([x0 + cell / 2, z0 + cell, cell, 0.15]);
      }
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, kerbH, 1), kerbMat, kerbs.length);
      const m4 = new THREE.Matrix4();
      kerbs.forEach(([x, z, sx, sz], n) => { m4.makeScale(sx, 1, sz).setPosition(x, y - 0.05 + kerbH / 2 + 0.01, z); im.setMatrixAt(n, m4); });
      im.castShadow = true; im.receiveShadow = true;
      root.add(im);
    }
    return { kind, N, cell, half, isPaved: (x, z) => { const i = Math.floor((x + half) / cell), j = Math.floor((z + half) / cell); return i >= 0 && j >= 0 && i < N && j < N && !!kind[i][j]; } };
  };

  // ---------------------------------------------------------------- ground slab: displaced top (heightFn), soil sides
  K.ground = ({ half, seg = 96, top, side = mat.soil, depth = 1.6, height = null, tint = 0.22, seed = 5, uvScale = null }) => {
    const g = new THREE.PlaneGeometry(2 * half, 2 * half, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const r = T.rng(seed);
    const pts = Array.from({ length: 50 }, () => [(r() * 2 - 1) * half, (r() * 2 - 1) * half, 2 + r() * 6, r() - 0.5]);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (height) pos.setY(i, height(x, z));
      let k = 1;
      for (const [px, pz, rad, s] of pts) { const d = Math.hypot(x - px, z - pz); if (d < rad) k += s * tint * (1 - d / rad) ** 2; }
      col[i * 3] = k * 1.02; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.96;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    if (uvScale) planarUV(g, uvScale);
    const m = M(g, top, false, true);
    root.add(m);
    if (side) {
      const noTop = new THREE.MeshBasicMaterial({ visible: false }); // the top would hide anything below y = 0 (lakes)
      const sb = M(new THREE.BoxGeometry(2 * half, depth, 2 * half), [side, side, noTop, side, side, side], false, true);
      sb.position.y = -depth / 2 - 0.01;
      const uv = sb.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * half / 2.1, uv.getY(i) * 0.4);
      root.add(sb);
    }
    return m;
  };

  // ---------------------------------------------------------------- carousel (centre cx,cz on a floor at y)
  K.carousel = ({ cx, cz, y = 0, R = 5.8, festive = false, riderSeeds = [1, 3, 6, 8, 12, 15], fenceGapAt = Math.PI / 2, roofMat = mat.roofStripes, valMat = mat.valance, look = {} }) => {
    const carousel = new THREE.Group();
    carousel.position.set(cx, y, cz);
    carousel.add(M(new THREE.CylinderGeometry(R + 0.45, R + 0.55, 0.3, 64), mat.concrete).translateY(0.15));
    const floor = M(new THREE.CylinderGeometry(R, R, 0.22, 64), [mat.cream, mat.deck, mat.cream]); floor.position.y = 0.41; carousel.add(floor);
    {
      const ug = floor.geometry, uv = ug.attributes.uv, p = ug.attributes.position;
      for (let i = 0; i < uv.count; i++) if (p.getY(i) > 0.1) uv.setXY(i, p.getX(i) / 1.5, p.getZ(i) / 1.5);
    }
    const FY = 0.52;
    carousel.add(M(new THREE.CylinderGeometry(1.25, 1.25, 3.7, 24), mat.cream).translateY(FY + 1.85));
    const panels = M(new THREE.CylinderGeometry(1.27, 1.27, 1.8, 12, 1, true), std({ color: '#7a1c22', roughness: 0.4, metalness: 0.2 })); panels.position.y = FY + 1.9; carousel.add(panels);
    carousel.add(M(new THREE.CylinderGeometry(1.32, 1.32, 0.12, 24), mat.brass).translateY(FY + 1.0));
    carousel.add(M(new THREE.CylinderGeometry(1.32, 1.32, 0.12, 24), mat.brass).translateY(FY + 2.85));
    // canopy: Round 7 = one smooth 96-segment cone with the stripes in its texture (no faceted second cone)
    const roofY = FY + 3.75;
    const coneG = new THREE.ConeGeometry(R + 0.36, 2.4, 96, 4, true);
    const cone = M(coneG, roofMat); cone.position.y = roofY + 1.2; carousel.add(cone);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      carousel.add(rod(V(Math.cos(a) * (R + 0.4), roofY, Math.sin(a) * (R + 0.4)), V(0, roofY + 2.42, 0), 0.035, mat.brass, 6));
    }
    const val = M(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 0.75, 96, 1, true), valMat);
    val.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * 3; });
    val.position.y = roofY - 0.3; carousel.add(val);
    carousel.add(M(new THREE.TorusGeometry(R + 0.42, 0.06, 8, 96), mat.brass).rotateX(Math.PI / 2).translateZ(-(roofY + 0.06)));
    carousel.add(M(new THREE.SphereGeometry(0.28, 16, 12), mat.brass).translateY(roofY + 2.55));
    carousel.add(M(new THREE.ConeGeometry(0.12, 0.6, 12), mat.brass).translateY(roofY + 3.0));
    const ceil = M(new THREE.CylinderGeometry(R + 0.38, R + 0.38, 0.06, 64), mat.cream); ceil.position.y = roofY; carousel.add(ceil);
    const bm = festive ? festoon : ringBulb;
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), bm, 72);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * (R + 0.47), roofY + 0.08, Math.sin(a) * (R + 0.47)); bulbs.setMatrixAt(i, m4); }
    carousel.add(bulbs);
    const bulbs2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), bm, 48);
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * 1.34, FY + 2.95, Math.sin(a) * 1.34); bulbs2.setMatrixAt(i, m4); }
    carousel.add(bulbs2);
    if (festive) { // bulbs along every rib too
      const rb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), festoon, 24 * 8);
      let n = 0;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; for (let k = 1; k <= 8; k++) { const t = k / 9; m4.makeTranslation(Math.cos(a) * (R + 0.42) * (1 - t), roofY + 0.05 + 2.42 * t, Math.sin(a) * (R + 0.42) * (1 - t)); rb.setMatrixAt(n++, m4); } }
      carousel.add(rb);
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; addLight(V(cx + Math.cos(a) * 3.6, y + roofY - 0.3, cz + Math.sin(a) * 3.6), '#ffd49a', 10, 7); }
    const horseCols = ['#f4f1ea', '#2b2522', '#8a5a36', '#c9c3b8', '#d9b77a', '#5d4030', '#f4f1ea', '#9a9a9a'];
    const saddleCols = ['#b8202a', '#1f6f5c', '#2f5fa5', '#d8a32c', '#7a2a6a'];
    let hn = 0;
    const riders = [];
    for (const [ring, count, off] of [[4.6, 10, 0], [3.1, 7, 0.4]]) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + off;
        const px = Math.cos(a) * ring, pz = Math.sin(a) * ring;
        carousel.add(rod(V(px, FY, pz), V(px, roofY, pz), 0.035, mat.brass, 8));
        const lift = 0.95 + 0.35 * Math.sin(a * 3 + ring);
        const hg = K.horse(horseCols[hn % horseCols.length], saddleCols[hn % saddleCols.length], hn);
        hg.position.set(px, FY + lift, pz);
        hg.rotation.y = -a; // nose along the direction of travel (counter-clockwise seen from above)
        carousel.add(hg);
        if (riderSeeds.includes(hn)) riders.push({ hg, hn });
        hn++;
      }
    }
    riders.forEach(({ hg, hn: s }) => {
      const p = person(randomLook(400 + s, { ...K.look, child: s % 2 === 0, balloon: null, backpack: null, bag: null, ...look }), { kind: 'horse' });
      p.position.set(0, hg.userData.seatY, -0.06);
      hg.add(p);
    });
    const fenceR = R + 1.2;
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      if (Math.abs(((mid - fenceGapAt + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.28) continue;
      const p0 = V(Math.cos(a0) * fenceR, 0, Math.sin(a0) * fenceR), p1 = V(Math.cos(a1) * fenceR, 0, Math.sin(a1) * fenceR);
      carousel.add(rod(p0.clone().setY(0.0), p0.clone().setY(1.0), 0.03, mat.green, 6));
      carousel.add(rod(p0.clone().setY(1.0), p1.clone().setY(1.0), 0.025, mat.green, 6));
      carousel.add(rod(p0.clone().setY(0.55), p1.clone().setY(0.55), 0.02, mat.green, 6));
    }
    root.add(carousel);
    return carousel;
  };

  // ---------------------------------------------------------------- carousel horse, Round 7: a carved jumper
  // local: nose to +z, pole through the origin (saddle). Barrel, chest and rump volumes, an arched neck,
  // a wedge head with muzzle, ears, eyes and bridle, a carved mane, a flowing tail, legs in a gallop pose with hooves,
  // a saddle with cantle, blanket and stirrups. Height to the poll about 1.15 m above the hooves.
  K.horse = (coat, saddle, seed = 0) => {
    const g = new THREE.Group();
    const cm = new THREE.MeshPhysicalMaterial({ color: coat, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const sm = new THREE.MeshPhysicalMaterial({ color: saddle, roughness: 0.35, clearcoat: 0.6 });
    const light = new THREE.Color(coat).getHSL({}).l > 0.5;
    const maneM = new THREE.MeshPhysicalMaterial({ color: light ? (seed % 3 === 0 ? '#d6a84a' : '#6b4a32') : '#1b1512', roughness: 0.4, clearcoat: 0.6, metalness: seed % 3 === 0 && light ? 0.6 : 0 });
    const dark = std({ color: '#1a1410', roughness: 0.4 });
    // body volumes
    const body = M(new THREE.CapsuleGeometry(0.2, 0.52, 6, 16), cm); body.rotation.x = Math.PI / 2; body.scale.set(0.82, 1, 1.05); g.add(body);
    const chest = M(new THREE.SphereGeometry(0.235, 16, 12), cm); chest.position.set(0, 0.02, 0.36); chest.scale.set(0.82, 1.0, 0.95); g.add(chest);
    const rump = M(new THREE.SphereGeometry(0.24, 16, 12), cm); rump.position.set(0, 0.03, -0.36); rump.scale.set(0.86, 0.98, 1); g.add(rump);
    // neck: lathe-free tapered cylinder, arched up and forward
    const neckG = new THREE.CylinderGeometry(0.085, 0.16, 0.6, 14); neckG.translate(0, 0.3, 0);
    const neck = M(neckG, cm); neck.position.set(0, 0.1, 0.42); neck.rotation.x = 0.55; neck.scale.set(0.72, 1, 1); g.add(neck);
    const poll = V(0, 0.1 + Math.cos(0.55) * 0.6, 0.42 + Math.sin(0.55) * 0.6);
    // head: tapered, angled nose-down
    const headG = new THREE.CylinderGeometry(0.05, 0.085, 0.42, 12); headG.translate(0, -0.21, 0);
    const HA = -0.7, hdir = V(0, -Math.cos(HA), -Math.sin(HA)); // nose forward and down
    const head = M(headG, cm); head.position.copy(poll); head.rotation.x = HA; head.scale.set(0.8, 1, 1.15); g.add(head);
    const muzzleP = poll.clone().addScaledVector(hdir, 0.42);
    const muzzle = M(new THREE.SphereGeometry(0.065, 10, 8), cm); muzzle.position.copy(muzzleP); muzzle.scale.set(0.85, 0.9, 1.1); g.add(muzzle);
    const jowl = M(new THREE.SphereGeometry(0.085, 10, 8), cm); jowl.position.copy(poll).add(V(0, -0.06, 0.04)); jowl.scale.set(0.8, 1, 1); g.add(jowl);
    for (const s of [-1, 1]) {
      const ear = M(new THREE.ConeGeometry(0.03, 0.12, 6), cm); ear.position.copy(poll).add(V(s * 0.045, 0.07, -0.02)); ear.rotation.x = -0.3; ear.rotation.z = -s * 0.2; g.add(ear);
      const eye = M(new THREE.SphereGeometry(0.018, 6, 4), dark); eye.position.copy(poll).addScaledVector(hdir, 0.12).add(V(s * 0.062, 0.01, 0)); g.add(eye);
      const nost = M(new THREE.SphereGeometry(0.012, 6, 4), dark); nost.position.copy(muzzleP).add(V(s * 0.035, 0.0, 0.05)); g.add(nost);
    }
    // bridle: a brow band and a noseband in the saddle colour, reins back to the neck
    const band = (p, r) => { const t = M(new THREE.TorusGeometry(r, 0.008, 6, 16), sm); t.position.copy(p); t.quaternion.setFromUnitVectors(V(0, 0, 1), hdir); g.add(t); };
    band(poll.clone().addScaledVector(hdir, 0.08), 0.08); band(poll.clone().addScaledVector(hdir, 0.33), 0.06);
    // mane: carved locks along the crest, falling to one side
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const p = V(0.03, 0.1 + Math.cos(0.55) * 0.6 * t + 0.1, 0.42 + Math.sin(0.55) * 0.6 * t - 0.06);
      const lock = M(new THREE.CapsuleGeometry(0.038 - i * 0.002, 0.12, 3, 6), maneM); lock.position.copy(p); lock.rotation.set(0.9, 0, -0.35 - Math.sin(i * 1.7) * 0.2); lock.scale.set(0.6, 1, 1); g.add(lock);
    }
    const forelock = M(new THREE.CapsuleGeometry(0.03, 0.08, 3, 6), maneM); forelock.position.copy(poll).add(V(0, 0.02, 0.07)); forelock.rotation.x = 2.0; g.add(forelock);
    // tail: tapering segments sweeping back and down
    const tpts = [V(0, 0.14, -0.55), V(0, 0.02, -0.76), V(0, -0.22, -0.86), V(0, -0.46, -0.82)];
    for (let i = 0; i < 3; i++) { g.add(rod(tpts[i], tpts[i + 1], 0.055 - i * 0.012, maneM, 8)); const j = M(new THREE.SphereGeometry(0.055 - i * 0.012, 8, 6), maneM); j.position.copy(tpts[i + 1]); g.add(j); }
    // legs (pivot at the body, rotation.x > 0 swings the hoof backwards)
    const legs = [
      // [x, y, z, upper, lower] front legs curled (jumper), hind legs pushing off
      [0.1, -0.08, 0.36, -1.15, 1.75], [-0.1, -0.08, 0.32, -0.75, 1.45],
      [0.11, -0.06, -0.36, 0.55, 0.15], [-0.11, -0.06, -0.4, 0.2, 0.35],
    ];
    const hoofM = std({ color: '#2a2420', roughness: 0.5 });
    for (const [x, y, z, a1, a2] of legs) {
      const up = new THREE.Group(); up.position.set(x, y, z); up.rotation.x = a1; g.add(up);
      const uG = new THREE.CylinderGeometry(0.045, 0.075, 0.34, 10); uG.translate(0, -0.17, 0);
      up.add(M(uG, cm));
      const low = new THREE.Group(); low.position.y = -0.34; low.rotation.x = a2; up.add(low);
      const knee = M(new THREE.SphereGeometry(0.048, 8, 6), cm); low.add(knee);
      const lG = new THREE.CylinderGeometry(0.03, 0.04, 0.3, 8); lG.translate(0, -0.15, 0);
      low.add(M(lG, cm));
      const hoof = M(new THREE.CylinderGeometry(0.04, 0.05, 0.07, 10), hoofM); hoof.position.y = -0.32; low.add(hoof);
    }
    // saddle: seat, raised cantle and pommel, blanket, girth, stirrups
    const seatY = 0.22;
    const blG = new THREE.CylinderGeometry(0.235, 0.235, 0.46, 18, 1, true, Math.PI - 1.2, 2.4); blG.rotateX(Math.PI / 2);
    const blanket = M(blG, std({ color: '#f1e6c8', roughness: 0.8, side: THREE.DoubleSide })); blanket.scale.set(0.86, 1.02, 1); g.add(blanket);
    const seat = M(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), sm); seat.scale.set(1.0, 0.35, 1.3); seat.position.y = 0.17; g.add(seat);
    const cantle = M(new THREE.TorusGeometry(0.09, 0.03, 6, 12, Math.PI), sm); cantle.position.set(0, 0.2, -0.17); g.add(cantle);
    const pommel = M(new THREE.SphereGeometry(0.045, 8, 6), sm); pommel.position.set(0, 0.24, 0.18); g.add(pommel);
    for (const s of [-1, 1]) {
      g.add(rod(V(s * 0.19, 0.12, 0.02), V(s * 0.23, -0.3, 0.05), 0.008, dark, 4));
      const st = M(new THREE.TorusGeometry(0.035, 0.008, 4, 10), mat.brass); st.position.set(s * 0.23, -0.33, 0.05); st.rotation.y = Math.PI / 2; g.add(st);
    }
    g.userData.seatY = seatY;
    return g;
  };

  return K;
}
