// Y Lakeside forest: a park cut into pine forest on a lake shore. A log flume climbs a wooded hill, runs along the
// crest and drops down the hillside into a splash pool by the lake, returning along the shore to a log-built lodge
// station. Wooden footbridges, rocks, reeds, a jetty with a canoe. Plot 18 x 18 tiles = 54 m (HALF 27).
import * as THREE from 'three';
import * as T from './textures.js';
import { makeKit, M, V, rod, std, rep, planarUV, faceUp } from './kit.js';
import { frames, sweep, Beams, onTrack, logBoat, trestle, signMat, boxProfile } from './rides.js';

const HALF = 27;
const HILL = { x: -16.5, z: -14, h: 9.5, s: 7.5 };
const LAKE = { x: -12.5, z: 15.5, rx: 11.5, rz: 7.5 };
const WATER_Y = -0.3;

const lakeR = (a) => 1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5 + 2);
function lakeT(x, z) { // < 1 inside the lake outline
  const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
  return Math.hypot(dx, dz) / lakeR(Math.atan2(dz, dx));
}
const BROOK = [[13, 26.8], [8.5, 21.5], [4.5, 18.6], [0.5, 16.2], [-2.6, 13.6]];
function brookDist(x, z) {
  let d = 1e9;
  for (let i = 0; i < BROOK.length - 1; i++) {
    const [ax, az] = BROOK[i], [bx, bz] = BROOK[i + 1];
    const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return d;
}
export function height(x, z) {
  const d2 = (x - HILL.x) ** 2 + (z - HILL.z) ** 2;
  let h = HILL.h * Math.exp(-d2 / (2 * HILL.s * HILL.s));
  const bd = brookDist(x, z);
  if (bd < 1.6) h -= 0.42 * (1 - bd / 1.6) ** 1.5; // the brook's bed
  const t = lakeT(x, z);
  if (t < 1.25) { const k = Math.max(0, Math.min(1, (1.25 - t) / 0.3)); h = h * (1 - k) + (-1.6) * k; }
  return h;
}

export function buildForest(variant) {
  const K = makeKit(variant);
  const { root, mat } = K;
  const H = (x, z) => height(x, z);

  // ---------------------------------------------------------------- terrain: lawn with darker forest floor on the hill, sandy shore
  {
    const ground = K.ground({ half: HALF, seg: 128, top: mat.lawn, height: (x, z) => H(x, z), seed: 17, tint: 0.2 });
    const g = ground.geometry, p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i), t = lakeT(x, z);
      let r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
      const forest = Math.max(0, Math.min(1, (y - 1.0) / 3)) + Math.max(0, Math.min(1, (-x - z - 26) / 10)) * 0.7;
      const f = Math.min(1, forest);
      r = r * (1 - f) + r * 0.82 * f; gg = gg * (1 - f) + gg * 0.7 * f; b = b * (1 - f) + b * 0.55 * f; // needle litter: browner, darker
      if (t < 1.3 && t > 0.9) { const k = 1 - Math.abs(t - 1.08) / 0.22; if (k > 0) { r += k * 0.55; gg += k * 0.3; b += k * 0.1; } } // shore sand/mud band
      c.setXYZ(i, r, gg, b);
    }
    c.needsUpdate = true;
    // lake: wobbly ellipse of water
    const sh = new THREE.Shape(); const pts = [];
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, r = lakeR(a) * 1.13; pts.push(new THREE.Vector2(LAKE.x + Math.cos(a) * LAKE.rx * r, -(LAKE.z + Math.sin(a) * LAKE.rz * r))); }
    sh.setFromPoints(pts);
    const wg = new THREE.ShapeGeometry(sh, 2); wg.rotateX(-Math.PI / 2); faceUp(wg); planarUV(wg, 6);
    const lakeMat = new THREE.MeshPhysicalMaterial({ color: '#2d5a5a', roughness: 0.05, normalMap: rep(K.tx.water.normal, 1), normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 1, clearcoatRoughness: 0.05 });
    const lake = M(wg, lakeMat, false, true); lake.position.y = WATER_Y; root.add(lake);
  }

  // ---------------------------------------------------------------- log flume
  const S = 0.75; // water level in the trough above the ground at the station
  const ctrl = [
    [6.5, S, -0.2], [2, S, -0.2], [-2.5, S, -0.2],
    [-6.5, S, -1.0], [-8.6, S + 0.2, -4.0], [-10.2, 4.6, -8.2], [-11.8, 9.6, -12.6], [-13.4, 10.6, -15.4],
    [-17.5, 10.6, -17.4], [-21.6, 10.5, -14.6], [-22.4, 10.4, -9.8],
    [-22.2, 9.8, -6.6], [-21.9, 1.4, 0.4], [-21.4, 0.55, 3.8],
    [-17.5, 0.6, 5.0], [-11, 0.65, 3.6], [-4, 0.7, 4.0], [4, 0.72, 4.2], [10.8, 0.74, 3.6], [12.6, S, 1.2], [10.6, S, -0.2],
  ].map(([x, y, z]) => V(x, y, z));
  const F = frames(ctrl, { closed: true, step: 0.25, bankMax: 0 });
  const wood = std({ map: K.tx.wood.map, color: '#c4a27a', roughness: 0.75 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d8e6ee', roughness: 0.2, clearcoat: 0.6 });
  const flumeIn = std({ color: '#e8ecea', roughness: 0.35, map: K.tx.paint.map });
  // trough: timber outside, pale fibreglass inside, timber lips; water ribbon, conveyor on the lift
  K.root.add(sweep(F, [[[-0.65, 0.4], [-0.65, -0.35], [-0.5, -0.45], [0.5, -0.45], [0.65, -0.35], [0.65, 0.4]]], flumeIn));
  K.root.add(sweep(F, [[[0.78, 0.45], [0.78, -0.58], [-0.78, -0.58], [-0.78, 0.45]]], wood, { uvLen: 2 }));
  K.root.add(sweep(F, [[[-0.8, 0.45], [-0.62, 0.45]], [[0.62, 0.45], [0.8, 0.45]]], wood));
  const liftI = [F.P.findIndex((p, i) => F.Tn[i].y > 0.25 && p.z < -3), 0]; liftI[1] = F.P.findIndex((p, i) => i > liftI[0] && F.Tn[i].y < 0.1);
  const dropI = [F.P.findIndex((p, i) => F.Tn[i].y < -0.3), 0]; dropI[1] = F.P.findIndex((p, i) => i > dropI[0] && F.Tn[i].y > -0.12);
  const waterM = new THREE.MeshPhysicalMaterial({ color: '#3f8a8f', roughness: 0.05, normalMap: rep(K.tx.water.normal, 1), normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 1 });
  K.root.add(sweep(F, [[[-0.6, -0.1], [0.6, -0.1]]], waterM, { i0: 0, i1: liftI[0], cast: false }));
  K.root.add(sweep(F, [[[-0.6, -0.1], [0.6, -0.1]]], waterM, { i0: liftI[1], i1: F.NS, cast: false }));
  K.root.add(sweep(F, [[[-0.45, -0.38], [0.45, -0.38]]], std({ color: '#2a2a2a', roughness: 0.7 }), { i0: liftI[0], i1: liftI[1] }));
  // ribs every 1.2 m round the trough (the posts of the timber flume walls)
  {
    const b = new Beams();
    for (let i = 0; i < F.NS; i += 5) { const p = F.P[i], l = F.Lt[i], u = F.Up[i]; for (const s of [-1, 1]) b.add(p.clone().addScaledVector(l, s * 0.82).addScaledVector(u, -0.6), p.clone().addScaledVector(l, s * 0.82).addScaledVector(u, 0.47), 0.09, 0.12); }
    K.root.add(b.mesh(std({ map: K.tx.wood.map, color: '#8a6a4a', roughness: 0.85 })));
  }
  // trestle under the raised parts, footings on the terrain
  const stationI = (p) => p.x > -3.5 && p.x < 7.5 && Math.abs(p.z) < 1.2;
  K.root.add(trestle(F, new Beams(), { ground: H, every: 1.6, half: 0.95, under: 0.6, skip: (i, p) => stationI(p) }).mesh(std({ map: K.tx.wood.map, color: '#9a7a58', roughness: 0.85 })));
  // lift: catwalk + handrail on one side
  {
    const [a, b] = liftI;
    K.root.add(sweep(F, [[[1.0, -0.5], [1.6, -0.5]]], std({ color: '#7a6a58', roughness: 0.9, side: THREE.DoubleSide }), { i0: a, i1: b }));
    K.root.add(sweep(F, boxProfile(1.55, 0.5, 0.05, 0.05), wood, { i0: a, i1: b }));
  }
  // splash pool: wide concrete basin at the foot of the drop, spray fan, mist
  const footI = dropI[1] > 0 ? dropI[1] : Math.round(F.NS * 0.62);
  {
    const p = F.P[footI];
    const basin = M(new THREE.BoxGeometry(4.2, 0.5, 5.2), mat.concrete); basin.position.set(p.x, p.y - 0.55, p.z + 1.0); basin.rotation.y = Math.atan2(F.Tn[footI].x, F.Tn[footI].z); root.add(basin);
    const spray = std({ color: '#ffffff', roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false });
    const mist = std({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.22, depthWrite: false });
    const r = T.rng(77);
    const fwd = F.Tn[footI].clone().setY(0).normalize(), side = V(-fwd.z, 0, fwd.x);
    for (let k = 0; k < 160; k++) {
      const s = (r() - 0.5) * 2, t = r();
      const h = Math.sin(t * Math.PI) * (2.8 + (1 - Math.abs(s)) * 1.6);
      const q = p.clone().addScaledVector(side, s * (1.2 + t * 1.6)).addScaledVector(fwd, t * 3.2 - 0.6).add(V(0, h, 0));
      const d = M(new THREE.SphereGeometry(0.08 + r() * 0.22, 8, 6), spray, false, false); d.position.copy(q); root.add(d);
    }
    for (let k = 0; k < 10; k++) { const m = M(new THREE.SphereGeometry(0.9 + r() * 0.8, 12, 8), mist, false, false); m.position.copy(p).addScaledVector(side, (r() - 0.5) * 3).addScaledVector(fwd, r() * 2.4).add(V(0, 0.8 + r() * 1.6, 0)); root.add(m); }
    K.addLight(p.clone().add(V(0, 1, 0)), '#bfe0ff', 10, 8);
  }
  // logs: in the station, on the lift, plunging down the drop, running out of the splash, on the return
  const boat = (i, seed, n = 3) => { const b = logBoat(K, { seed, riders: n }); onTrack(F, i, b); b.position.addScaledVector(F.Up[F.idx(Math.round(i))], -0.62); root.add(b); };
  const stIdx = F.P.findIndex((p) => stationI(p) && p.x < 4.6);
  boat(stIdx, 1500); boat(stIdx + 15, 1510, 2);
  boat(Math.round((liftI[0] + liftI[1]) / 2), 1520);
  boat(dropI[0] + Math.round((footI - dropI[0]) * 0.55), 1530);
  boat(footI + 16, 1540);
  boat(F.P.findIndex((p, i) => i > footI && p.x > -6), 1550);

  // ---------------------------------------------------------------- lodge station: log walls, shingle gable roof over track + platform
  {
    const x0 = -3.5, x1 = 7.5, zT = -0.2;
    const plat = M(new THREE.BoxGeometry(x1 - x0, 0.75, 2.6), mat.boards); plat.position.set((x0 + x1) / 2, 0.37, zT - 2.2); root.add(plat);
    const logsM = std({ map: K.tx.logs.map, bumpMap: K.tx.logs.bump, bumpScale: 2, roughness: 0.85 });
    const back = M(new THREE.BoxGeometry(x1 - x0 - 3.5, 3.3, 2.2), logsM); back.position.set((x0 + x1) / 2 - 1.5, 1.65, zT - 4.6); root.add(back);
    const win = M(new THREE.BoxGeometry(2.4, 1.0, 0.05), K.windowGlow); win.position.set((x0 + x1) / 2 - 1.5, 1.9, zT - 3.48); root.add(win);
    const posts = new Beams();
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 4) { posts.add(V(x, 0.75, zT - 3.3), V(x, 4.0, zT - 3.3), 0.26); posts.add(V(x, 0, zT + 1.25), V(x, 3.6, zT + 1.25), 0.26); }
    root.add(posts.mesh(std({ map: K.tx.bark.map, color: '#c9a77a', roughness: 0.9 })));
    const roofG = new THREE.Group(); roofG.position.set((x0 + x1) / 2, 4.35, zT - 1.6); root.add(roofG);
    const shM = std({ map: rep(K.tx.shingles.map, 4, 2), bumpMap: rep(K.tx.shingles.bump, 4, 2), bumpScale: 1.5, roughness: 0.9, color: '#9a8070' });
    for (const s of [-1, 1]) { const sl = M(new THREE.BoxGeometry(x1 - x0 + 1.6, 0.18, 4.4), shM); sl.position.set(0, 0.85, s * 1.95); sl.rotation.x = s * 0.48; roofG.add(sl); }
    const ridge = M(new THREE.BoxGeometry(x1 - x0 + 1.7, 0.2, 0.3), std({ map: K.tx.wood.map, color: '#6a4a32' })); ridge.position.y = 1.85; roofG.add(ridge);
    const gable = new THREE.Shape([new THREE.Vector2(-3.4, 0), new THREE.Vector2(3.4, 0), new THREE.Vector2(0, 1.7)]);
    for (const sx of [x0 - 0.5, x1 + 0.5]) { const gm = M(new THREE.ShapeGeometry(gable), std({ map: K.tx.logs.map, side: THREE.DoubleSide, roughness: 0.85 })); gm.position.set(sx, 4.25, zT - 1.6); gm.rotation.y = Math.PI / 2; root.add(gm); }
    const board = M(new THREE.BoxGeometry(4.6, 0.8, 0.12), [wood, wood, wood, wood, signMat('TIMBER RUN', { bg: '#3a2a1c', accent: '#f2d9a0', frame: '#8a6a4a' }), wood]);
    board.position.set((x0 + x1) / 2, 4.1, zT + 1.45); root.add(board);
    for (let k = 0; k < 5; k++) { const st = M(new THREE.BoxGeometry(1.4, 0.15 * (k + 1), 0.3), mat.boards); st.position.set(x1 + 0.7, 0.075 * (k + 1), zT - 1.5 - k * 0.0); st.position.x = x1 + 0.5 + (4 - k) * 0.3; root.add(st); }
    K.addLight(V(2, 3.6, -1.5), '#ffd49a', 20, 9);
  }

  // ---------------------------------------------------------------- paths (packed gravel pavers with timber edging) and bridges
  const pav = K.paving({
    half: HALF, cell: 1.5, y: 0.05, kerbMat: std({ map: K.tx.wood.map, color: '#8a6a4a', roughness: 0.9 }), kerbH: 0.16,
    regions: [
      [-1.5, 27, 7.5, 10.5, 'paversGrey'],       // shore walk from the gate to the lake
      [9, 12, -6, 7.5, 'paversGrey'],            // to the lodge (bridge over the flume return)
      [7.5, 12, -6, -3, 'paversGrey'],           // queue yard by the lodge stair
      [16.5, 19.5, -24, 7.5, 'paversGrey'],      // forest walk to the picnic glade
      [12, 25.5, -24, -18, 'paversGrey'],        // picnic glade
      [-4.5, -1.5, 10.5, 13.5, 'paversGrey'],    // jetty landing
      [3, 6, 10.5, 16.5, 'paversGrey'], [3, 6, 21, 27, 'paversGrey'], // walk to the front gate, bridged over the brook
    ],
    mats: { paversGrey: std({ map: K.tx.paversGrey.map, bumpMap: K.tx.paversGrey.bump, bumpScale: 1.2, roughness: 0.9, color: '#d9d0c0' }) },
  });
  // footbridge over the flume return (the path crosses at x 9..12, z ~3.6)
  const footbridge = (cx, cz, len, wdt, rise, rotY = 0) => {
    const g = new THREE.Group(); g.position.set(cx, 0.05, cz); g.rotation.y = rotY;
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V(0, Math.sin(t * Math.PI) * rise, -len / 2 + t * len)); }
    const Fb = frames(pts, { closed: false, step: 0.2, bankMax: 0 });
    g.add(sweep(Fb, boxProfile(0, -0.1, wdt, 0.2), mat.boards, { uvLen: 1.5 }));
    const bb = new Beams();
    for (let i = 0; i <= Fb.NS; i += 4) for (const s of [-1, 1]) { const p = Fb.P[i].clone().add(V(s * (wdt / 2 - 0.05), 0, 0)); bb.add(p, p.clone().add(V(0, 1.0, 0)), 0.09); }
    g.add(bb.mesh(std({ map: K.tx.wood.map, color: '#a07a52', roughness: 0.85 })));
    for (const s of [-1, 1]) for (const h of [1.0, 0.55]) g.add(sweep(Fb, boxProfile(s * (wdt / 2 - 0.05), h, 0.08, 0.08), std({ map: K.tx.wood.map, color: '#a07a52', roughness: 0.85 })));
    root.add(g);
    return g;
  };
  footbridge(10.5, 3.9, 6.5, 2.6, 1.5);
  footbridge(-14.2, 4.3, 5.0, 2.0, 0.9, Math.PI / 2 + 0.2); // crossing the run-out by the splash pool (wet seats)
  // stream from the hill into the lake, with a small arched bridge on the shore walk
  {
    const pts = BROOK.map(([x, z], i) => V(x, -0.2 - i * 0.03, z));
    const Fs = frames(pts, { closed: false, step: 0.3, bankMax: 0 });
    root.add(sweep(Fs, [[[-0.85, 0.0], [0.85, 0.0]]], new THREE.MeshPhysicalMaterial({ color: '#3f6f6f', roughness: 0.05, clearcoat: 1, normalMap: rep(K.tx.water.normal, 1), normalScale: new THREE.Vector2(0.3, 0.3) }), { cast: false }));
    const r = T.rng(5);
    for (let i = 0; i < Fs.NS; i += 7) for (const s of [-1, 1]) { if (r() < 0.4) continue; const p = Fs.P[i]; K.rock(p.x + Fs.Lt[i].x * s * (0.95 + r() * 0.3), p.z + Fs.Lt[i].z * s * (0.95 + r() * 0.3), 0.18 + r() * 0.2, 300 + i * 2 + (s > 0), H(p.x, p.z) - 0.05); }
    footbridge(4.5, 18.6, 4.0, 3.0, 0.6, 0);
  }
  // jetty into the lake and a canoe
  {
    const deck = M(new THREE.BoxGeometry(2.0, 0.16, 6.5), mat.boards); deck.position.set(-3.0, 0.3, 16.5); root.add(deck);
    const legs = new Beams(); for (const z of [14, 16, 18, 19.6]) for (const x of [-3.8, -2.2]) legs.add(V(x, -1.4, z), V(x, 0.25, z), 0.16);
    root.add(legs.mesh(mat.timber));
    const c = new THREE.Group(); c.position.set(-8.5, WATER_Y, 17.5); c.rotation.y = 0.9; root.add(c);
    const hullG = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); hullG.scale(0.42, 0.35, 2.4);
    c.add(M(hullG, new THREE.MeshPhysicalMaterial({ color: '#c8372d', roughness: 0.35, clearcoat: 0.8 })).translateY(0.18));
    for (const [z, sd] of [[0.9, 1], [-0.9, 2]]) { const p = K.guest(1600 + sd, 0, 0, 0, { kind: 'ride', legsHidden: true }, {}, 0); root.remove(p); p.position.set(0, 0.05, z); c.add(p); }
    c.add(rod(V(-0.9, 0.55, 0.6), V(0.9, 0.75, 1.1), 0.025, mat.timber, 6));
  }

  // ---------------------------------------------------------------- forest: pines dense on the hill and the back edges, a few broadleaf trees by the paths
  const flumeDist = (x, z) => { let d = 1e9; for (let i = 0; i < F.NS; i += 4) { const p = F.P[i]; d = Math.min(d, Math.hypot(p.x - x, p.z - z)); } return d; };
  const r = T.rng(91);
  const placed = [];
  const nearPath = (x, z, d) => { for (const [dx, dz] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d * 0.7, d * 0.7], [-d * 0.7, d * 0.7], [d * 0.7, -d * 0.7], [-d * 0.7, -d * 0.7]]) if (pav.isPaved(x + dx, z + dz)) return true; return false; };
  const free = (x, z, rad) => brookDist(x, z) > 2.6 + rad * 0.5 && !nearPath(x, z, Math.max(1.2, rad * 0.8)) && lakeT(x, z) > 1.25 && flumeDist(x, z) > 2.6 + rad * 0.4 && placed.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) > (pr + rad) * 0.62)
    && !(x > -5 && x < 9 && z > -7.5 && z < 2.5) && Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1;
  let tries = 0, n = 0;
  while (n < 44 && tries < 4000) {
    tries++;
    const x = (r() * 2 - 1) * (HALF - 1.2), z = (r() * 2 - 1) * (HALF - 1.2);
    // the forest stands behind the rides (back corner and the two back edges); the front stays open
    const back = x + z < -8 || x < -21 || z < -19 || (x > 21 && z < 6);
    if (!back) continue;
    if (x + z > -20 && flumeDist(x, z) < 6) continue; // keep the flume's front face clear
    const Ht = 8 + r() * 6, rad = Ht * 0.23;
    if (!free(x, z, rad)) continue;
    placed.push([x, z, rad]);
    K.pine(x, z, Ht, 2000 + n, { y: H(x, z) - 0.1 });
    n++;
  }
  [[23, 14, 9, 3.0], [15, 21, 8, 2.6], [23, -8, 8.5, 2.8], [-3, 24.5, 7.5, 2.4], [20.5, 24.5, 7, 2.3]].forEach(([x, z, h, cr], k) => { if (free(x, z, cr)) { K.tree(x, z, h, 50 + k, cr, H(x, z)); placed.push([x, z, cr]); } });
  // rocks on the hill and the shore, reeds at the lake edge, shrubs
  for (let k = 0; k < 26; k++) { const x = (r() * 2 - 1) * 24, z = (r() * 2 - 1) * 24; if (!free(x, z, 1)) continue; K.rock(x, z, 0.4 + r() * 0.9, 400 + k, H(x, z) - 0.15); }
  for (let k = 0; k < 18; k++) { const a = r() * Math.PI * 2, t = 1.02 + r() * 0.06; const x = LAKE.x + Math.cos(a) * LAKE.rx * lakeR(a) * t * 1.1, z = LAKE.z + Math.sin(a) * LAKE.rz * lakeR(a) * t * 1.1; if (pav.isPaved(x, z) || z > HALF - 1 || x < -HALF + 1) continue; K.rock(x, z, 0.3 + r() * 0.5, 500 + k, H(x, z) - 0.1); }
  {
    const reedM = std({ color: '#7a8a46', roughness: 0.8 }), headM = std({ color: '#5a3a22', roughness: 0.8 });
    for (let k = 0; k < 14; k++) {
      const a = 0.4 + r() * 2.2, x = LAKE.x + Math.cos(a) * LAKE.rx * 1.02, z = LAKE.z + Math.sin(a) * LAKE.rz * 1.02;
      if (z > HALF - 1.5) continue;
      for (let j = 0; j < 9; j++) { const px = x + (r() - 0.5) * 1.2, pz = z + (r() - 0.5) * 1.2, h = 1 + r() * 0.8; root.add(rod(V(px, WATER_Y, pz), V(px + (r() - 0.5) * 0.2, WATER_Y + h, pz), 0.015, reedM, 4)); if (r() < 0.4) { const hd = M(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), headM); hd.position.set(px, WATER_Y + h - 0.1, pz); root.add(hd); } }
    }
  }
  for (const [x, z, s] of [[13, 6.2, 0.9], [8, 6.3, 0.8], [20.8, 6.2, 1.0], [15, -4, 0.9], [20.6, -12, 1.1], [-0.2, 6.3, 0.8]]) K.shrub(x, z, s, Math.round(x * 7 + z), H(x, z));

  // ---------------------------------------------------------------- furniture: lamps (timber posts), benches, bins, picnic tables
  for (const x of [-0.5, 6, 13, 20.5, 26]) K.lamp(x, 7.1, 0, std({ map: K.tx.wood.map, color: '#6a4a32', roughness: 0.8 }));
  for (const z of [-20, -12, -4]) K.lamp(16.1, z, 0, std({ map: K.tx.wood.map, color: '#6a4a32', roughness: 0.8 }));
  K.benchWith(3, 10.9, Math.PI, [1, 2]); K.benchWith(15, 10.9, Math.PI, [3]); K.bench(22, 10.9, Math.PI);
  K.benchWith(20, -9, -Math.PI / 2, [4]); K.bin(8.6, 7.0); K.bin(20, 7.0); K.bin(15.9, -16);
  const picnic = (x, z, seeds) => {
    const g = new THREE.Group(); g.position.set(x, 0.05, z);
    g.add(M(new THREE.BoxGeometry(2.0, 0.07, 0.8), mat.wood).translateY(0.76));
    for (const s of [-1, 1]) { g.add(M(new THREE.BoxGeometry(2.0, 0.06, 0.3), mat.wood).translateY(0.45).translateZ(s * 0.68)); for (const sx of [-0.8, 0.8]) { const l = M(new THREE.BoxGeometry(0.08, 0.8, 0.08), mat.wood); l.position.set(sx, 0.38, s * 0.3); l.rotation.x = s * 0.35; g.add(l); } }
    root.add(g);
    seeds.forEach((sd, i) => { const s = i % 2 ? 1 : -1; const p = K.guest(sd, x + (i < 2 ? -0.45 : 0.45), z + s * 0.72, s > 0 ? Math.PI : 0, { kind: 'sit' }); p.position.y = 0.05 + 0.48; });
  };
  picnic(15, -21, [10, 11, 12]); picnic(21.5, -21, [13, 14]); picnic(22, -19.4 + 3.5, []);

  // ---------------------------------------------------------------- the lakeside lawn: picnic blankets, sitters, a kite, flower beds
  {
    const blanket = (x, z, col, rot) => { const b = M(new THREE.BoxGeometry(1.6, 0.02, 1.3), std({ color: col, roughness: 0.95 }), false, true); b.position.set(x, H(x, z) + 0.02, z); b.rotation.y = rot; root.add(b); };
    blanket(11, 15.5, '#c8372d', 0.3); blanket(16.5, 13.4, '#2f6fb5', -0.2); blanket(8.5, 20.5, '#e2a92c', 0.6); blanket(19.5, 18, '#3b7d4f', 0.1);
    const sitG = (seed, x, z, rot, look = {}) => { const p = K.guest(seed, x, z, rot, { kind: 'sit' }, look, 0); p.position.y = H(x, z) + 0.12; };
    sitG(110, 10.6, 15.2, 0.4); sitG(111, 11.5, 15.9, Math.PI + 0.3, { child: true }); sitG(112, 16.2, 13.1, -0.3); sitG(113, 16.9, 13.8, Math.PI); sitG(114, 8.2, 20.2, 0.7, { child: true }); sitG(115, 19.2, 17.8, 0.2);
    K.guest(116, 13.8, 17.8, 2.6, { kind: 'stand' }, { child: true }, H(13.8, 17.8)); K.guest(117, 14.6, 18.4, -2.4, { kind: 'walk', phase: 1.6 }, { child: true }, H(14.6, 18.4));
    // kite flyer: string up to a diamond kite
    const kf = K.guest(118, 21.5, 21, -2.2, { kind: 'point' }, {}, H(21.5, 21));
    const kp = V(16.5, 11, 16), hand = V(21.15, 1.75, 20.7);
    root.add(rod(hand, kp, 0.006, std({ color: '#eeeeee', roughness: 0.5 }), 3));
    const kite = M(new THREE.OctahedronGeometry(0.6, 0), std({ color: '#e8402e', roughness: 0.6 })); kite.scale.set(1, 1.4, 0.06); kite.position.copy(kp); kite.rotation.y = 0.8; root.add(kite);
    void kf;
    for (const [x, z, c] of [[12.5, 10.9, '#e2546a'], [18.5, 10.9, '#f2c14e'], [24, 10.9, '#f4f1ea'], [6.6, 11.2, '#9a63b5']]) for (let k = 0; k < 4; k++) K.shrub(x + k * 0.8 - 1.2, z + 0.3, 0.45, Math.round(x * 13 + k), H(x, z), c);
  }

  // ---------------------------------------------------------------- guests
  K.crowd(20, 16, 26.5, 9, -1, 9, 2.4);              // shore walk
  K.crowd(21, 7, 18, 7, 18, -23, 2.2);               // forest walk
  K.crowd(22, 4, 10.5, 7, 10.5, -2.5, 2.0);          // to the lodge
  // queue on the lodge stair and platform, riders waiting
  [[9.2, -4.0], [9.8, -4.6], [10.6, -4.2], [11.2, -4.8], [8.4, -3.4]].forEach(([x, z], i) => K.guest(30 + i, x, z, -Math.PI / 2, { kind: 'stand', phase: i * 0.13 }));
  [[0.5, -2.2], [-0.4, -2.5], [4.6, -2.0]].forEach(([x, z], i) => K.guest(36 + i, x, z, Math.PI, { kind: 'stand', phase: i * 0.21 }, {}, 0.75));
  // watchers on the splash bridge and the jetty, a family by the lake, people on the stream bridge
  const sb = footI > 0 ? F.P[footI] : V(-14, 0, 4);
  K.guest(40, -14.6, 3.3, 0.3, { kind: 'point' }, { child: true }, 0.95); K.guest(41, -13.6, 3.6, 0.2, { kind: 'stand' }, {}, 0.95); K.guest(42, -14.0, 5.0, Math.PI, { kind: 'wave' }, {}, 0.95);
  K.guest(43, -3.1, 18.8, Math.PI, { kind: 'stand' }, {}, 0.38); K.guest(44, -2.7, 15.4, -0.4, { kind: 'point' }, { child: true }, 0.38);
  K.guest(45, 4.0, 18.2, 0, { kind: 'stand' }, {}, 0.6); K.guest(46, 5.0, 18.9, Math.PI, { kind: 'walk', phase: 1 }, { child: true }, 0.6);
  K.crowd(23, 4, 4.5, 11, 4.5, 26, 2.0);
  K.guest(47, 5, 12.4, 2.6, { kind: 'stand' }, { child: true }, H(5, 12.4)); K.guest(48, 5.8, 12.9, -2.2, { kind: 'eat', item: 'cone' }, {}, H(5.8, 12.9));
  void sb;
  return { root, lights: K.lights, lightMats: K.lightMats, guests: K.guests, extent: 44, shadowTarget: V(0, 3, 0) };
}
