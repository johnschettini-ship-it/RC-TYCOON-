// Haunted Manor (walk-through attraction, 4 x 4 tiles, 14.5 m): a crooked two-storey Victorian house in faded
// lavender clapboard with a steep slate roof, a round corner tower with a witch's-hat roof at the back right
// (today's look), a porch with an arched, softly glowing door at the front (+z) on the entrance gate column
// (arenaKeys.GATE_X), shuttered windows lit amber, green
// and violet, an iron fence with a gate gap, a gnarled bare tree, grinning jack-o'-lanterns on the steps and a
// friendly sheet ghost bobbing by the tower. Spooky but family-friendly: no gore, nothing that hurts. No riders.
// Light change in 4 steps (arenaKeys.manorKeys, repeating every 8 angle slots): windows flicker, the lanterns
// glow brighter and dimmer, and the ghost bobs and sways. Front at +z: rots [0, 1, 2, 3].
import { THREE, placeOnFootprint, bakeObject, kit } from './common.js';
import { M, V, rod, std, rep } from '../kit.js';
import { painted, glow, slab, canvasTex, hash01 } from './arenaKit.js';
import { manorKeys, LIGHT_STEPS, GATE_X } from './arenaKeys.js';

const HX = 5.4; // house half-width
const Z0 = -4.6, Z1 = 2.4; // house depth
const FLOOR = 3.2; // storey height
const EAVE = 0.6 + FLOOR * 2; // wall top
const TOWER = { x: 4.4, z: -3.7, r: 1.75, h: 9.0 };
const TAU = Math.PI * 2;
const GX = GATE_X.haunted_manor; // the entrance gate column: path, gate, porch and door are centred on it

function pumpkinTex() {
  return canvasTex(256, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f08a24'); grd.addColorStop(1, '#c95a12');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,50,10,0.45)'; g.lineWidth = 3;
    for (let k = 0; k < 16; k++) { g.beginPath(); g.moveTo((k / 16) * w, 0); g.lineTo((k / 16) * w, h); g.stroke(); }
  });
}
function faceTex() {
  // the carved face as an emissive map (black elsewhere), centred on u = 0.25 (the pumpkin's front)
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd86a';
    const cx = w * 0.25, cy = h * 0.5;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 10, cy - 6); g.lineTo(cx + s * 22, cy - 6); g.lineTo(cx + s * 16, cy - 20); g.fill(); }
    g.beginPath(); g.moveTo(cx - 26, cy + 4); g.quadraticCurveTo(cx, cy + 34, cx + 26, cy + 4); g.quadraticCurveTo(cx, cy + 16, cx - 26, cy + 4); g.fill();
  }, { srgb: true });
}

function pumpkin(r, lit) {
  const g = new THREE.Group();
  const m = std({ map: pumpkinTex(), roughness: 0.6, emissive: '#ffffff', emissiveMap: lit ? faceTex() : null, emissiveIntensity: lit ? 1.4 : 0 });
  const geo = new THREE.SphereGeometry(r, 24, 14);
  // ribs
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 - 0.06 * Math.abs(Math.sin(a * 6)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const b = M(geo, m);
  b.scale.set(1, 0.78, 1);
  b.rotation.y = Math.PI / 2; // face (u = 0.25) towards +z
  g.add(b);
  g.add(M(new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.4, 8), std({ color: '#4a6a2a', roughness: 0.8 })).translateY(r * 0.85));
  g.userData.mat = m;
  return g;
}

/** A friendly sheet ghost: round head, flaring wavy hem, two dark eyes and a little round mouth. */
function ghost() {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.sin(a) * 0.55 + 0.001, 1.6 + Math.cos(a) * 0.55)); }
  prof.push(new THREE.Vector2(0.6, 1.0), new THREE.Vector2(0.72, 0.4), new THREE.Vector2(0.82, 0.0));
  const geo = new THREE.LatheGeometry(prof, 40);
  const p = geo.attributes.position;
  // wavy hem
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.5) p.setY(i, y + 0.12 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 8) * (1 - y / 0.5)); }
  geo.computeVertexNormals();
  const sheet = new THREE.MeshPhysicalMaterial({ color: '#f6f4ff', roughness: 0.6, emissive: '#d8d4ff', emissiveIntensity: 0.25, transparent: true, opacity: 0.9, side: THREE.DoubleSide, sheen: 1, sheenColor: '#ffffff' });
  g.add(M(geo, sheet, true, false));
  const eye = std({ color: '#231c33', roughness: 0.4 });
  for (const s of [-1, 1]) { const e = M(new THREE.SphereGeometry(0.075, 12, 8), eye); e.scale.set(1, 1.5, 0.6); e.position.set(s * 0.18, 1.72, 0.5); g.add(e); }
  const mouth = M(new THREE.SphereGeometry(0.06, 12, 8), std({ color: '#7a4d9a', roughness: 0.5 }));
  mouth.scale.set(1, 1.2, 0.5); mouth.position.set(0, 1.52, 0.54);
  g.add(mouth);
  // little waving arms
  for (const s of [-1, 1]) { const a = M(new THREE.SphereGeometry(0.16, 12, 8), sheet); a.scale.set(1.6, 0.7, 0.8); a.position.set(s * 0.62, 1.2, 0.1); a.rotation.z = s * 0.5; g.add(a); }
  return g;
}

/** Gnarled bare tree from rods (deterministic). */
function bareTree(mat, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const grow = (a, dir, len, r, depth, seed) => {
    const b = a.clone().addScaledVector(dir, len);
    g.add(rod(a, b, r, mat, 7));
    if (depth === 0) return;
    for (let k = 0; k < 2 + (depth > 2 ? 1 : 0); k++) {
      const h1 = hash01(seed * 7 + k), h2 = hash01(seed * 13 + k + 5);
      const d = dir.clone().add(V((h1 - 0.5) * 1.6, 0.25 + h2 * 0.3, (h2 - 0.5) * 1.6)).normalize();
      grow(b, d, len * (0.62 + h1 * 0.15), r * 0.62, depth - 1, seed * 3 + k + 1);
    }
  };
  grow(V(0, 0, 0), V(0.08, 1, -0.05).normalize(), 2.4, 0.2, 4, 3);
  return g;
}

function build() {
  const K = kit();
  const { mat, tx } = K;
  const root = new THREE.Group();
  const siding = std({ map: rep(tx.siding.map, 4, 2.5), bumpMap: rep(tx.siding.bump, 4, 2.5), bumpScale: 1, color: '#9a8cb8', roughness: 0.8 });
  const trim = painted('#3a2f52', { metalness: 0, roughness: 0.7, clearcoat: 0 });
  const slate = std({ map: rep(tx.shingles.map, 3, 2), bumpMap: rep(tx.shingles.bump, 3, 2), bumpScale: 1.5, color: '#6d6290', roughness: 0.85 });
  const iron = std({ color: '#1e1a26', metalness: 0.6, roughness: 0.5 });
  // garden: dull lawn, a gravel path to the porch, a stone plinth under the house
  root.add(slab(15.6, 0.18, 15.6, std({ map: rep(tx.grass.map, 3), color: '#8f9a76', roughness: 0.95 }), 0, 0, 0));
  root.add(slab(2.0, 0.05, 7.8 - Z1 - 0.6, std({ map: rep(tx.slabs.map, 1, 2), color: '#b8ad9a', roughness: 0.9 }), GX, 0.18, (Z1 + 7.8) / 2));
  root.add(slab(HX * 2 + 0.3, 0.6, Z1 - Z0 + 0.3, mat.stone, 0, 0, (Z0 + Z1) / 2));
  // walls, slightly crooked
  const house = new THREE.Group();
  house.rotation.z = 0.006;
  root.add(house);
  house.add(slab(HX * 2, FLOOR * 2, Z1 - Z0, siding, 0, 0.6, (Z0 + Z1) / 2));
  house.add(slab(HX * 2 + 0.12, 0.18, Z1 - Z0 + 0.12, trim, 0, 0.6 + FLOOR, (Z0 + Z1) / 2));
  for (const sx of [-1, 1]) for (const sz of [Z0, Z1]) house.add(slab(0.22, FLOOR * 2, 0.22, trim, sx * HX, 0.6, sz));
  // roof: a steep gable along x (two slate planes over siding gable ends) and a front cross-gable over the porch
  const roofH = 3.6;
  const D = Z1 - Z0;
  const tri = (w, h) => { const t = new THREE.Shape(); t.moveTo(-w / 2, 0); t.lineTo(w / 2, 0); t.lineTo(0, h); t.lineTo(-w / 2, 0); return t; };
  /** Two roof planes, ridge along x, eaves `span` apart, `rise` high, overhang `ov` past the eaves. */
  const pitched = (len, span, rise, ov) => {
    const g = new THREE.Group();
    const half = span / 2, th = Math.atan2(rise, half), L = Math.hypot(half, rise) + ov;
    for (const s of [-1, 1]) {
      const pl = M(new THREE.BoxGeometry(len, 0.14, L), slate);
      pl.rotation.x = s * th;
      pl.position.set(0, rise / 2 - (ov / 2) * Math.sin(th), s * (half / 2 + (ov / 2) * Math.cos(th)));
      g.add(pl);
    }
    return g;
  };
  const gableWall = (w, h, depth) => { const geo = new THREE.ExtrudeGeometry(tri(w, h), { depth, bevelEnabled: false }); geo.translate(0, 0, -depth / 2); return M(geo, siding); };
  const roof = pitched(HX * 2 + 0.8, D, roofH, 0.45);
  roof.position.set(0, EAVE, (Z0 + Z1) / 2);
  house.add(roof);
  const gw = gableWall(D, roofH, HX * 2);
  gw.rotation.y = Math.PI / 2; gw.position.set(0, EAVE, (Z0 + Z1) / 2);
  house.add(gw);
  const cross = pitched(3.4, 3.8, 2.8, 0.3);
  cross.rotation.y = Math.PI / 2; cross.position.set(GX, EAVE - 0.2, Z1 - 1.2);
  house.add(cross);
  const crossWall = gableWall(3.8, 2.8, 3.0);
  crossWall.position.set(GX, EAVE - 0.2, Z1 - 1.35);
  house.add(crossWall);
  // ridge cresting and a chimney
  house.add(slab(HX * 2 + 0.8, 0.12, 0.12, iron, 0, EAVE + roofH, (Z0 + Z1) / 2));
  for (let k = 0; k <= 10; k++) house.add(rod(V(-HX - 0.4 + k * ((HX * 2 + 0.8) / 10), EAVE + roofH, (Z0 + Z1) / 2), V(-HX - 0.4 + k * ((HX * 2 + 0.8) / 10), EAVE + roofH + 0.35, (Z0 + Z1) / 2), 0.025, iron, 4));
  house.add(slab(0.9, 2.4, 0.9, std({ map: tx.stone.map, color: '#8a7d78', roughness: 0.9 }), -3.4, EAVE + 1.4, (Z0 + Z1) / 2 - 1.0));
  // windows: frame, glowing pane, crooked shutters; lit colour per step
  const lit = [glow('#ff9a1a', 1.1, '#ffb347'), glow('#5cf03a', 0.9, '#7ae05a'), glow('#a85cff', 1.1, '#b07ae8')];
  const dark = std({ color: '#241d33', roughness: 0.2, metalness: 0.2 });
  const panes = [];
  const shutter = painted('#2c4a3e', { metalness: 0, roughness: 0.7, clearcoat: 0 });
  const addWindow = (x, y, z, ry, w = 0.9, h = 1.5) => {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = ry;
    g.rotation.z = (hash01(Math.round(x * 10 + y * 7 + z * 3)) - 0.5) * 0.1;
    g.add(slab(w + 0.2, h + 0.2, 0.1, trim, 0, -0.1, 0));
    const pane = M(new THREE.PlaneGeometry(w, h), dark);
    pane.position.set(0, h / 2 - 0.0, 0.06);
    g.add(pane);
    g.add(slab(0.05, h, 0.04, trim, 0, 0, 0.08));
    g.add(slab(w, 0.05, 0.04, trim, 0, h * 0.55, 0.08));
    for (const s of [-1, 1]) {
      const sh = slab(w * 0.5, h + 0.1, 0.05, shutter, s * (w * 0.75 + 0.1), -0.05, 0.08);
      sh.rotation.z = s * (hash01(panes.length * 5 + s + 9) - 0.3) * 0.18;
      g.add(sh);
    }
    g.add(slab(w + 0.4, 0.1, 0.25, trim, 0, h + 0.1, 0.08));
    house.add(g);
    panes.push(pane);
  };
  for (const fl of [0, 1]) {
    const y = 0.6 + fl * FLOOR + 0.9;
    for (const x of fl ? [-4.3, -0.4, 1.9, 4.0] : [1.1, 3.4]) addWindow(x, y, Z1 + 0.01, 0);
    for (const z of [Z0 + 1.6, Z1 - 1.6]) { addWindow(HX + 0.01, y, z, Math.PI / 2); addWindow(-HX - 0.01, y, z, -Math.PI / 2); }
    for (const x of [-3.0, 0, 3.0]) addWindow(x, y, Z0 - 0.01, Math.PI);
  }
  addWindow(GX, EAVE + 0.5, Z1 + 0.16, 0, 0.7, 0.9); // attic window in the cross gable
  // porch: deck, posts, a small roof, the arched glowing door, steps
  root.add(slab(4.2, 0.55, 1.8, mat.boards, GX, 0.05, Z1 + 0.9));
  for (let k = 0; k < 3; k++) root.add(slab(2.0, 0.15 * (k + 1), 0.32, mat.stone, GX, 0.05, Z1 + 1.8 + (3 - k) * 0.32 - 0.16));
  for (const s of [-1, 1]) root.add(slab(0.16, 2.9, 0.16, trim, GX + s * 1.9, 0.6, Z1 + 1.6));
  const pr = M(new THREE.BoxGeometry(4.6, 0.12, 2.1), slate);
  pr.position.set(GX, 3.55, Z1 + 0.95); pr.rotation.x = 0.18;
  root.add(pr);
  root.add(slab(4.4, 0.25, 0.12, trim, GX, 3.3, Z1 + 1.65));
  const doorGlow = glow('#b88cff', 1.6, '#e8dcff');
  const arch = new THREE.Shape();
  arch.moveTo(-0.65, 0); arch.lineTo(0.65, 0); arch.lineTo(0.65, 1.8); arch.absarc(0, 1.8, 0.65, 0, Math.PI, false); arch.lineTo(-0.65, 0);
  const dg = M(new THREE.ShapeGeometry(arch, 16), doorGlow);
  dg.position.set(GX, 0.6, Z1 + 0.02);
  house.add(dg);
  const door = M(new THREE.ExtrudeGeometry(arch, { depth: 0.06, bevelEnabled: false }), std({ color: '#3b2a24', roughness: 0.7 }));
  door.scale.set(0.5, 1, 1); door.position.set(GX - 0.33, 0.6, Z1 + 0.05); door.rotation.y = -0.6; // ajar
  house.add(door);
  // round tower at the back right with a witch's-hat roof and a weather vane
  const tw = M(new THREE.CylinderGeometry(TOWER.r, TOWER.r + 0.1, TOWER.h, 32), siding);
  tw.position.set(TOWER.x, 0.6 + TOWER.h / 2, TOWER.z);
  root.add(tw);
  root.add(M(new THREE.CylinderGeometry(TOWER.r + 0.18, TOWER.r + 0.18, 0.25, 32), trim).translateX(TOWER.x).translateY(0.6 + TOWER.h).translateZ(TOWER.z));
  const hat = M(new THREE.ConeGeometry(TOWER.r + 0.55, 4.3, 32, 4), slate);
  hat.position.set(TOWER.x, 0.6 + TOWER.h + 2.15 + 0.1, TOWER.z);
  hat.rotation.z = 0.06; // a little bent
  root.add(hat);
  const vaneY = 0.6 + TOWER.h + 4.3;
  root.add(rod(V(TOWER.x + 0.13, vaneY - 0.2, TOWER.z), V(TOWER.x + 0.13, vaneY + 0.4, TOWER.z), 0.03, iron, 6));
  root.add(slab(0.7, 0.04, 0.04, iron, TOWER.x + 0.13, vaneY + 0.2, TOWER.z));
  root.add(M(new THREE.SphereGeometry(0.09, 10, 8), iron).translateX(TOWER.x + 0.13).translateY(vaneY + 0.45).translateZ(TOWER.z));
  for (const [a, y] of [[0.35, 4.5], [1.0, 4.5], [0.35, 7.6], [1.0, 7.6], [-0.6, 7.6]]) {
    const x = TOWER.x + Math.sin(a) * (TOWER.r + 0.02), z = TOWER.z + Math.cos(a) * (TOWER.r + 0.02);
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = a;
    g.add(slab(0.8, 1.3, 0.08, trim, 0, -0.08, 0));
    const pane = M(new THREE.PlaneGeometry(0.6, 1.1), dark);
    pane.position.set(0, 0.57, 0.05);
    g.add(pane);
    root.add(g);
    panes.push(pane);
  }
  // iron fence along the front, a gate gap at the path, lanterns on the gate posts
  const FZ = 7.5;
  for (const s of [-1, 1]) {
    const x0 = GX + s * 1.3, x1 = s * 7.66;
    const n = Math.round(Math.abs(x1 - x0) / 0.53);
    for (let k = 0; k <= n; k++) {
      const x = x0 + (k / n) * (x1 - x0);
      root.add(rod(V(x, 0.18, FZ), V(x, 1.3, FZ), 0.025, iron, 5));
      root.add(M(new THREE.ConeGeometry(0.05, 0.16, 6), iron).translateX(x).translateY(1.36).translateZ(FZ));
    }
    for (const y of [0.45, 1.15]) root.add(rod(V(x0, y, FZ), V(x1, y, FZ), 0.025, iron, 5));
    root.add(slab(0.4, 1.6, 0.4, mat.stone, GX + s * 1.15, 0.18, FZ));
    root.add(slab(0.24, 0.32, 0.24, glow('#ffc35a', 1.6, '#ffe7b0'), GX + s * 1.15, 1.85, FZ));
    root.add(M(new THREE.ConeGeometry(0.22, 0.24, 4), iron).translateX(GX + s * 1.15).translateY(2.29).translateZ(FZ).rotateY(Math.PI / 4));
  }
  // garden: bare tree, pumpkins, a crooked lamp
  root.add(bareTree(std({ map: tx.bark.map, color: '#5a4a44', roughness: 0.95 }), -5.6, 5.0));
  const pumpkins = [];
  for (const [dx, z, r, l] of [[-0.75, Z1 + 2.9, 0.32, true], [0.8, Z1 + 2.9, 0.28, true], [1.6, Z1 + 1.4, 0.24, false], [-1.55, Z1 + 1.5, 0.34, true], [6.0, 5.6, 0.4, true], [5.4, 6.0, 0.22, false], [-3.4, 6.3, 0.3, true]]) {
    const x = GX + dx; // near the porch and path; dx is from the gate column
    const p = pumpkin(r, l);
    const y = Math.abs(z - (Z1 + 0.9)) < 1 && Math.abs(dx) < 2.1 ? 0.6 : (z > Z1 + 1.7 && z < Z1 + 3.0 && Math.abs(dx) < 1.1 ? 0.2 : 0.18);
    p.position.set(x, y + r * 0.7, z);
    p.rotation.y = (hash01(Math.round(x * 10)) - 0.5) * 0.8;
    root.add(p);
    if (l) pumpkins.push(p.userData.mat);
  }
  const boo = ghost();
  root.add(boo);
  const pose = (step) => {
    panes.forEach((p, i) => { const h = hash01(i * 37 + step * 101); p.material = h < 0.68 ? lit[(i + (h < 0.2 ? 1 : 0)) % 3] : dark; });
    pumpkins.forEach((m, i) => { m.emissiveIntensity = 1.0 + 0.8 * hash01(i * 11 + step * 3); });
    const a = (step / LIGHT_STEPS) * TAU;
    boo.position.set(TOWER.x - 2.6 + 0.35 * Math.sin(a), EAVE + roofH + 0.6 + 0.45 * Math.sin(a + 0.6), TOWER.z + 1.6);
    boo.rotation.set(0, 0.5 + 0.2 * Math.sin(a), 0.12 * Math.cos(a));
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const pictures = [...manorKeys().entries()].map(([id, g]) => ({ keys: g.keys, pose: () => m.pose(Number(id.slice(1))) }));
    B.log(`haunted_manor: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'haunted_manor', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
