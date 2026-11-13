// Z City plaza: an urban park between building facades. An inverted steel coaster swoops over a paved plaza from a
// glass-and-steel station, a drop tower stands in the back corner, a monorail runs above the street in front of the
// buildings, ground jets and a basin fountain, raised planters with trees and benches. Plot 18 x 18 tiles (HALF 27).
import * as THREE from 'three';
import * as T from './textures.js';
import { makeKit, M, V, rod, std, rep, planarUV } from './kit.js';
import { frames, sweep, Beams, onTrack, invertedCar, dropTower, monorail, building, stall, signMat, boxProfile } from './rides.js';

const HALF = 27;

export function buildCity(variant) {
  const K = makeKit(variant);
  const { root, mat } = K;

  // ---------------------------------------------------------------- ground: plaza slabs, street asphalt with kerbs, lawn beds
  K.ground({ half: HALF, seg: 8, top: mat.lawn, side: mat.concrete, seed: 33 });
  const slabsM = std({ map: K.tx.slabs.map, bumpMap: K.tx.slabs.bump, bumpScale: 1.2, roughness: 0.78, color: '#f2efe8' });
  const pav = K.paving({
    half: HALF, cell: 1.5, y: 0.05, between: true,
    regions: [
      [-27, 27, -27, 27, 'slabs'],
      [-19.5, -15, -19.5, 27, 'asphalt'], [-19.5, 27, -19.5, -15, 'asphalt'],   // the street in front of both building rows
      [-12, -4.5, 16.5, 24, null], [19.5, 25.5, 16.5, 24, null], [-12, -6, -12, -4.5, null], // lawn beds (front corners)
      [24, 27, 0, 12, null],
    ],
    mats: { slabs: slabsM }, uv: { slabs: 3, asphalt: 4 },
  });
  // road markings + tram-like monorail shadow line: dashed centre line on the street
  {
    const dash = std({ color: '#f2efe2', roughness: 0.6 });
    for (let z = -14; z < 26; z += 3) { const d = M(new THREE.BoxGeometry(0.15, 0.01, 1.5), dash, false, true); d.position.set(-17.25, 0.06, z); root.add(d); }
    for (let x = -14; x < 26; x += 3) { const d = M(new THREE.BoxGeometry(1.5, 0.01, 0.15), dash, false, true); d.position.set(x, 0.06, -17.25); root.add(d); }
    // zebra crossings
    for (let k = 0; k < 6; k++) { const s = M(new THREE.BoxGeometry(4.2, 0.01, 0.5), dash, false, true); s.position.set(-17.25, 0.06, 5 + k * 1.0); root.add(s); const s2 = M(new THREE.BoxGeometry(0.5, 0.01, 4.2), dash, false, true); s2.position.set(2 + k * 1.0, 0.06, -17.25); root.add(s2); }
  }

  // ---------------------------------------------------------------- buildings at the two back edges (original, simple)
  const B = [
    // left row (x -27..-19.5), facing +x
    { x: -23.2, z: 19.5, w: 7.4, d: 15, floors: 5, wall: [196, 122, 92], seed: 3, shop: '#2f5a3a' },
    { x: -23.2, z: 4.5, w: 7.4, d: 14, floors: 6, wall: [214, 205, 186], brick: false, seed: 4, shop: '#7a2440' },
    { x: -23.2, z: -10, w: 7.4, d: 14, floors: 6, wall: [150, 96, 74], seed: 5, shop: '#1f3557' },
    { x: -23.2, z: -23.2, w: 7.4, d: 7.4, floors: 6, wall: [226, 214, 188], brick: false, seed: 6, shop: '#2b2b2e' },
    // back row (z -27..-19.5), facing +z
    { x: -10.5, z: -23.2, w: 14, d: 7.4, floors: 6, wall: [184, 110, 86], seed: 7, shop: '#a8642a' },
    { x: 4.5, z: -23.2, w: 15, d: 7.4, floors: 5, wall: [232, 226, 212], brick: false, seed: 8, shop: '#1f6f5c' },
    { x: 19.5, z: -23.2, w: 14, d: 7.4, floors: 6, wall: [168, 120, 96], seed: 9, shop: '#33415c' },
  ];
  B.forEach((b) => building(K, { ...b, frame: b.brick === false ? '#4a5560' : '#efe9dc' }));
  // pavement in front of the shops is part of the slabs (x -19.5 / z -19.5 edges have kerbs from the paving grid)

  // ---------------------------------------------------------------- inverted coaster
  const ctrl = [
    [15, 4.4, -10.4], [9.5, 4.4, -10.4], [4, 4.4, -10.4],
    [0, 4.8, -10], [-4, 6.2, -8.2], [-6.6, 8.2, -4], [-7.2, 14.4, 5], [-6.6, 17.4, 9.6],
    [-3, 17.6, 13.4], [2, 13.2, 15.4], [8, 6.2, 15.6], [13, 6.4, 15.2],
    [18.6, 11.6, 13.4], [21.4, 12.6, 8.4], [20.6, 10.6, 3.0], [20.2, 9.2, -2.0],
    [19.4, 6.6, -6.6], [17.4, 5.0, -9.6],
  ].map(([x, y, z]) => V(x, y, z));
  const inStation = (p) => p.z < -9.6 && p.x > 3 && p.x < 16 && p.y < 4.7;
  const F = frames(ctrl, { closed: true, step: 0.25, flat: inStation, bankMax: 1.1, smooth: 12 });
  const yellow = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, roughnessMap: K.tx.paint.rough, color: '#f0b323', metalness: 0.3, roughness: 0.45, clearcoat: 0.4 });
  const teal = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, roughnessMap: K.tx.paint.rough, color: '#1f7f8a', metalness: 0.35, roughness: 0.45, clearcoat: 0.4 });
  {
    const tube = (dl, du, r) => { const c = new THREE.CatmullRomCurve3(F.P.slice(0, F.NS).map((p, i) => p.clone().addScaledVector(F.Lt[i], dl).addScaledVector(F.Up[i], du)), true); return M(new THREE.TubeGeometry(c, F.NS, r, 10, true), yellow); };
    root.add(tube(0.45, 0, 0.09), tube(-0.45, 0, 0.09));
    root.add(sweep(F, boxProfile(0, 0.78, 0.55, 0.55), yellow));
    for (let i = 0; i < F.NS; i += 4) { const sp = F.P[i].clone().addScaledVector(F.Up[i], 0.55); for (const s of [-1, 1]) root.add(rod(F.P[i].clone().addScaledVector(F.Lt[i], s * 0.45), sp, 0.035, yellow, 5)); }
  }
  // supports: column outside the track, a cantilever arm over to the top of the spine
  {
    const cols = new Beams(), arms = new Beams();
    const centre = V(7, 0, 3);
    const footing = new THREE.CylinderGeometry(0.55, 0.7, 0.3, 16);
    for (let i = 10; i < F.NS; i += 25) {
      const p = F.P[i];
      if (inStation(p)) continue;
      const top = p.clone().addScaledVector(F.Up[i], 1.05);
      const out = V(p.x - centre.x, 0, p.z - centre.z).normalize();
      const lat = V(F.Lt[i].x, 0, F.Lt[i].z).normalize();
      const side = lat.dot(out) >= 0 ? 1 : -1;
      const base = p.clone().addScaledVector(lat, side * 2.6).setY(0);
      const colTop = V(base.x, top.y + 0.6, base.z);
      cols.add(base, colTop, 0.5, 0.5);
      arms.add(colTop.clone().add(V(0, -0.05, 0)), top.clone().add(V(0, 0.55, 0)), 0.36, 0.42);
      arms.add(top.clone().add(V(0, 0.55, 0)), top.clone(), 0.3, 0.3);
      root.add(M(footing, mat.concrete).translateX(base.x).translateZ(base.z).translateY(0.2));
    }
    root.add(cols.mesh(teal)); root.add(arms.mesh(teal));
  }
  // station: glass-and-steel hall, platform, stairs, glass roof
  {
    const x0 = 3, x1 = 16.2, z0 = -14.2, z1 = -7.2;
    const steel = mat.darkSteel;
    const frame = new Beams();
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 4) for (const z of [z0, z1]) frame.add(V(x, 0, z), V(x, 7.6, z), 0.26);
    for (const z of [z0, z1]) frame.add(V(x0, 7.6, z), V(x1, 7.6, z), 0.3, 0.45);
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 4) frame.add(V(x, 7.6, z0), V(x, 7.6, z1), 0.24, 0.4);
    root.add(frame.mesh(steel));
    const gm = new THREE.MeshPhysicalMaterial({ map: T.glassGrid(201, { cols: 6, rows: 4 }).map, roughness: 0.08, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.55, color: '#cfe0ea' });
    const back = M(new THREE.BoxGeometry(x1 - x0, 7.6, 0.06), gm); back.position.set((x0 + x1) / 2, 3.8, z0); root.add(back);
    const roofG = M(new THREE.BoxGeometry(x1 - x0 + 1.4, 0.12, z1 - z0 + 1.4), new THREE.MeshPhysicalMaterial({ color: '#9fb6c4', roughness: 0.1, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.7 })); roofG.position.set((x0 + x1) / 2, 7.9, (z0 + z1) / 2); root.add(roofG);
    const plat = M(new THREE.BoxGeometry(x1 - x0 - 1.0, 1.45, 3.0), mat.concrete); plat.position.set((x0 + x1) / 2, 0.72, -12.6); root.add(plat);
    const gates = new Beams(); for (let x = x0 + 1; x < x1 - 1; x += 1.05) gates.add(V(x, 1.45, -11.2), V(x, 2.4, -11.2), 0.05);
    gates.add(V(x0 + 1, 2.4, -11.2), V(x1 - 1.2, 2.4, -11.2), 0.06); root.add(gates.mesh(mat.stainless));
    for (let k = 0; k < 8; k++) { const st = M(new THREE.BoxGeometry(1.8, 0.18 * (k + 1), 0.32), mat.concrete); st.position.set(x1 + 0.4, 0.09 * (k + 1), -12.6 + 0 ); st.position.x = x1 - 0.3 + (7 - k) * 0.32; st.rotation.y = Math.PI / 2; root.add(st); }
    const sign = M(new THREE.BoxGeometry(6.0, 1.0, 0.14), [steel, steel, steel, steel, signMat('SKYLINE', { bg: '#1d2b44', accent: '#f0b323', frame: '#c9ccd0' }), steel]);
    sign.position.set((x0 + x1) / 2, 8.6, z1 + 0.2); root.add(sign);
    for (let x = x0 + 1.5; x < x1; x += 3) K.addLight(V(x, 7, -10.5), '#fff0d8', 14, 8);
  }
  // trains: one in the station, one swooping over the plaza
  const train = (i0, seed, armsUp, colors) => { for (let c = 0; c < 4; c++) root.add(onTrack(F, i0 - c * 9, invertedCar(K, { seed: seed + c * 10, color: colors[c % 2], lead: c === 0, armsUp }))); };
  const st = F.P.findIndex((p) => inStation(p) && p.x < 6.5);
  train(st + 24, 2000, false, ['#e2312b', '#f2f0ea']);
  const sw = F.P.findIndex((p) => p.x > 9 && p.z > 14);
  train(sw + 8, 2100, true, ['#2f6fb5', '#f2f0ea']);

  // ---------------------------------------------------------------- drop tower, monorail
  dropTower(K, { x: 21.5, z: -12.2, H: 30, seatsAt: 0.7, seed: 2200 });
  monorail(K, { pts: [[-17.25, 27.5], [-17.25, 6], [-17.25, -12], [-15.6, -15.6], [-12, -17.25], [6, -17.25], [27.5, -17.25]], y: 7.2, train: { at: 0.28, cars: 3 }, seed: 2300 });

  // ---------------------------------------------------------------- fountains: ground jets on the plaza + a round basin
  const spray = std({ color: '#ffffff', roughness: 0.2, transparent: true, opacity: 0.6, depthWrite: false });
  {
    const r = T.rng(12);
    const grate = std({ color: '#5a5f63', roughness: 0.5, metalness: 0.6 });
    const jetM = std({ color: '#f4fbff', roughness: 0.2, transparent: true, opacity: 0.45, depthWrite: false });
    const wet = M(new THREE.CircleGeometry(4.2, 40), new THREE.MeshPhysicalMaterial({ color: '#8a8a86', roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.55 }), false, true); wet.rotation.x = -Math.PI / 2; wet.position.set(5, 0.065, 4); root.add(wet);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = 2.6 + i * 1.6, z = 2.4 + j * 1.6, h = 1.2 + ((i + j) % 3) * 0.8;
      const gr = M(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12), grate, false, true); gr.position.set(x, 0.07, z); root.add(gr);
      const jet = M(new THREE.CylinderGeometry(0.05, 0.09, h, 8), jetM, false, false); jet.position.set(x, h / 2, z); root.add(jet);
      const cap = M(new THREE.SphereGeometry(0.18, 10, 8), jetM, false, false); cap.position.set(x, h, z); cap.scale.y = 0.7; root.add(cap);
      for (let k = 0; k < 26; k++) { const a = r() * 6.28, t = Math.sqrt(r()); const d = M(new THREE.SphereGeometry(0.035 + r() * 0.04, 6, 4), spray, false, false); d.position.set(x + Math.cos(a) * t * 0.6, Math.max(0.1, h - t * t * h * 0.95), z + Math.sin(a) * t * 0.6); root.add(d); }
    }
    // round basin fountain with a three-tier jet
    const f = new THREE.Group(); f.position.set(14.2, 0.05, -2.2); root.add(f);
    f.add(M(new THREE.CylinderGeometry(3.4, 3.5, 0.55, 48), mat.stone).translateY(0.27));
    const w = M(new THREE.CylinderGeometry(3.05, 3.05, 0.04, 48), new THREE.MeshPhysicalMaterial({ color: '#2d5a62', roughness: 0.05, clearcoat: 1, normalMap: rep(K.tx.water.normal, 2), normalScale: new THREE.Vector2(0.3, 0.3) }), false, true); w.position.y = 0.5; f.add(w);
    f.add(M(new THREE.CylinderGeometry(0.3, 0.45, 1.3, 16), mat.stone).translateY(1.1));
    f.add(M(new THREE.CylinderGeometry(1.2, 0.5, 0.25, 32), mat.stone).translateY(1.8));
    const j = M(new THREE.CylinderGeometry(0.05, 0.1, 2.4, 10), spray, false, false); j.position.y = 3.1; f.add(j);
    for (let k = 0; k < 90; k++) { const a = r() * 6.28, t = r(); const d = M(new THREE.SphereGeometry(0.03 + r() * 0.04, 6, 4), spray, false, false); d.position.set(Math.cos(a) * (0.3 + t * 1.6), 4.2 - t * t * 3.5, Math.sin(a) * (0.3 + t * 1.6)); f.add(d); }
    K.addLight(V(14.2, 1, -2.2), '#bfe0ff', 10, 7);
  }

  // ---------------------------------------------------------------- planters with trees + benches, lamps, bins, a coffee kiosk
  const planterTree = (x, z, w, d, seed, benchRot = null) => {
    const g = new THREE.Group(); g.position.set(x, 0.05, z); root.add(g);
    g.add(M(new THREE.BoxGeometry(w, 0.6, d), mat.concrete).translateY(0.3));
    const soil = M(new THREE.BoxGeometry(w - 0.24, 0.02, d - 0.24), std({ color: '#4a3826', roughness: 1 })); soil.position.y = 0.6; g.add(soil);
    K.tree(x, z, 7 + (seed % 3), seed, 2.4, 0.6);
    K.shrub(x + w * 0.3, z - d * 0.25, 0.5, seed * 3, 0.65, '#e2546a'); K.shrub(x - w * 0.3, z + d * 0.25, 0.5, seed * 3 + 1, 0.65, '#f4f1ea');
    if (benchRot !== null) { const bx = x + Math.sin(benchRot) * (d / 2 + 0.45), bz = z + Math.cos(benchRot) * (d / 2 + 0.45); K.bench(bx, bz, benchRot); return [bx, bz]; }
  };
  const p1 = planterTree(-6, 9, 3.2, 3.2, 61, 0); K.sitOn(1, p1[0] + 0.35, p1[1], 0);
  const p2 = planterTree(0, 20, 3.2, 3.2, 62, 0); K.sitOn(2, p2[0] - 0.4, p2[1], 0); K.sitOn(3, p2[0] + 0.4, p2[1], 0);
  K.planter(12, 21, 3.2, 3.2, 0.05, 63); K.bench(12, 22.95, Math.PI); // low flower planter: a tree here would hide the fountain
  const p4 = planterTree(-9, -1, 3.2, 3.2, 64, Math.PI / 2); K.sitOn(4, p4[0], p4[1] + 0.3, Math.PI / 2);
  K.planter(24, 15, 2.6, 2.6, 0.05, 65);
  // lawn bed trees
  K.tree(-8.5, 20.5, 9, 66, 3.0); K.tree(22.5, 20, 8, 67, 2.6); K.shrub(-10.5, 17.6, 1.0, 68); K.shrub(-6, 22.8, 1.1, 69); K.shrub(25.2, 4, 1.0, 70); K.shrub(25.4, 9, 1.0, 71);
  K.tree(-9, -8.3, 7, 72, 2.4);
  const modern = mat.darkSteel;
  for (const [x, z] of [[-13.6, -12], [-13.6, 0], [-13.6, 12], [-13.6, 24], [-2, -13.6], [8, 24.5], [18, 24.5], [25.8, -2], [2, 10], [-2, 0]]) K.lamp(x, z, 0.05, modern);
  for (const [x, z] of [[-13.4, 6], [3, -13.4], [16, 24.3], [26, 13]]) K.bin(x, z, 0.05, modern);
  K.benchWith(-13.4, 17, Math.PI / 2, [5, 6]); K.benchWith(25.9, 18.5, -Math.PI / 2, [7]); K.bench(7, 9.6, Math.PI);
  stall(K, { x: 22.5, z: 4, rot: -Math.PI / 2, name: 'COFFEE', awning: ['#2b2b2e', '#f4efe2'], body: '#3a4046' });
  stall(K, { x: -11.5, z: 12.5, rot: Math.PI / 2, name: 'PRETZELS', awning: ['#a8642a', '#f4efe2'] });
  // cafe tables with parasols outside the corner building
  for (const [x, z, c] of [[-12.5, -12.5, '#f4efe2'], [-12.4, -9.4, '#1f3557'], [-9.6, -12.4, '#f4efe2']]) {
    const t = new THREE.Group(); t.position.set(x, 0.05, z);
    t.add(M(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), mat.cream).translateY(0.74));
    t.add(M(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 8), mat.stainless).translateY(1.15));
    const um = M(new THREE.ConeGeometry(1.25, 0.42, 12, 1, true), std({ color: c, roughness: 0.85, side: THREE.DoubleSide })); um.position.y = 2.2; t.add(um);
    root.add(t);
  }
  K.guest(8, -12.0, -12.9, Math.PI * 0.75, { kind: 'sit' }).position.y = 0.5; K.guest(9, -11.7, -9.0, -2.4, { kind: 'sit' }).position.y = 0.5;

  // ---------------------------------------------------------------- guests
  K.crowd(10, 12, -13, -11, -13, 26, 3.0);          // pavement along the left row
  K.crowd(11, 9, -12, -13.2, 26, -13.2, 2.4);       // pavement along the back row
  K.crowd(12, 14, -3, 12, 26, 11, 9);               // across the plaza
  K.crowd(13, 6, 0, -4, 10, 0, 3);
  // children in the fountain jets
  [[3.4, 3.2, 0.4, 'wave'], [6.0, 5.4, 2.2, 'stand'], [4.6, 6.6, -1.2, 'wave']].forEach(([x, z, r, k], i) => K.guest(80 + i, x, z, r, { kind: k }, { child: true, bottomType: 'shorts' }));
  K.guest(83, 7.6, 7.4, -2.5, { kind: 'point' }, {});
  // queue at the station stair, people on the platform, watchers at the drop tower
  [[17.6, -9.4], [18.4, -9.0], [19.0, -8.2], [19.4, -7.3], [20.2, -6.6]].forEach(([x, z], i) => K.guest(90 + i, x, z, Math.PI * 1.25, { kind: 'stand', phase: i * 0.17 }));
  [[6, -12.2], [8.5, -12.4], [12, -12.1]].forEach(([x, z], i) => K.guest(96 + i, x, z, 0, { kind: 'stand' }, {}, 1.45));
  K.guest(99, 16.4, -8.0, -0.8, { kind: 'point' }, { child: true }); K.guest(100, 17, -7.4, -0.8, { kind: 'stand' });
  K.guest(101, 14.6, 1.8, Math.PI, { kind: 'eat', item: 'cup' }); K.guest(103, 10.6, -1.6, Math.PI / 2, { kind: 'stand' }, { child: true }); K.guest(104, 17.6, -2.0, -Math.PI / 2, { kind: 'point' }); K.guest(102, 10.2, 8.4, 0.8, { kind: 'stand' }, { child: true, balloon: '#e2312b' });

  return { root, lights: K.lights, lightMats: K.lightMats, guests: K.guests, extent: 46, shadowTarget: V(0, 6, 0) };
}
