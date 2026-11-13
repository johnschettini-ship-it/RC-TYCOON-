// X Seaside pier: a timber pier on cast-iron piles over the sea, a sand beach and promenade along the back-left edge,
// a wooden out-and-back coaster on trestles, a Ferris wheel, a striped slide tower, food stalls, gulls.
// Plot 18 x 18 tiles = 54 m (HALF 27). Deck top at y = 3.2 m above the water.
import * as THREE from 'three';
import * as T from './textures.js';
import { makeKit, M, V, rod, std, rep, planarUV } from './kit.js';
import { frames, sweep, Beams, onTrack, sitCar, ferrisWheel, slideTower, stall, gull, trestle, woodTrack, signMat } from './rides.js';

const HALF = 27, DECK = 3.2;

function seaColumnTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2f7f8c'); g.addColorStop(0.08, '#1f5f75'); g.addColorStop(0.75, '#123a55'); g.addColorStop(0.8, '#b9a27c'); g.addColorStop(1, '#8a7656');
  x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildPier(variant) {
  const K = makeKit(variant);
  const { root, mat } = K;

  // ---------------------------------------------------------------- sea: swell-displaced surface, colour + normal map
  {
    const g = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, 160, 160); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 0.09 * Math.sin(x * 0.55 + z * 0.12) + 0.05 * Math.sin(x * 1.3 - z * 0.7 + 1) + 0.03 * Math.sin(z * 1.9 + x * 0.4)); }
    g.computeVertexNormals();
    planarUV(g, 12);
    const seaMat = new THREE.MeshPhysicalMaterial({ map: K.tx.sea.map, normalMap: rep(K.tx.water.normal, 1), normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.12, color: '#ffffff' });
    seaMat.normalMap.repeat.set(3.5, 3.5); // ripples about 3.4 m across on top of the 12 m swell bands in the colour map
    const sea = M(g, seaMat, false, true); root.add(sea);
    // the plot edge: a cut through the water column down to the sea bed
    const colM = std({ map: seaColumnTex(), roughness: 0.4 }), topM = std({ color: '#1d5568', roughness: 0.4 });
    const side = M(new THREE.BoxGeometry(2 * HALF, 3.4, 2 * HALF), [colM, colM, topM, colM, colM, colM], false, false);
    side.position.y = -1.72; root.add(side);
  }
  // ---------------------------------------------------------------- beach: sand slope from the sea wall into the water, foam lines
  const beachY = (x, z) => {
    if (x < -21.6) return DECK - 0.02;
    const t = (x + 21.6) / 13; // 0 at the wall foot, 1 at x = -8.6
    return 1.5 - t * 2.3 + 0.12 * Math.sin(z * 0.35) * (1 - t);
  };
  {
    const g = new THREE.PlaneGeometry(14, 2 * HALF, 60, 120); g.rotateX(-Math.PI / 2); g.translate(-HALF + 7 + 5.4 - 0.0, 0, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.min(beachY(Math.max(-21.5, p.getX(i)), p.getZ(i)), 1.6));
    g.computeVertexNormals(); planarUV(g, 4);
    const sand = M(g, std({ map: K.tx.sand.map, bumpMap: K.tx.sand.bump, bumpScale: 1.2, roughness: 0.95 }), false, true);
    root.add(sand);
    // sea wall under the promenade
    const wall = M(new THREE.BoxGeometry(5.4, DECK + 2, 2 * HALF), mat.stone); wall.position.set(-HALF + 2.7, (DECK - 2) / 2, 0);
    wall.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 6; });
    root.add(wall);
    // foam where the waves break: wavy ribbons parallel to the shore
    const foamMat = std({ color: '#f6fafa', roughness: 0.6, transparent: true, opacity: 0.8 });
    [[-12.6, 0.4, 0.5], [-10.4, 0.22, 0.45], [-7.6, 0.16, 0.3]].forEach(([x0, w, op], k) => {
      const pts = []; for (let z = -HALF; z <= HALF; z += 0.6) pts.push(V(x0 + Math.sin(z * 0.45 + k) * 0.6 + Math.sin(z * 1.7) * 0.15, 0.13, z));
      const F = frames(pts, { closed: false, step: 0.4, bankMax: 0 });
      const m = sweep(F, [[[-w, 0], [w, 0]]], foamMat.clone(), { cast: false }); m.material.opacity = op; root.add(m);
    });
  }
  // ---------------------------------------------------------------- promenade, pier deck (two plank tones), kerbs between them
  const pav = K.paving({
    half: HALF, cell: 1.5, y: DECK, edge: true, between: true, kerbMat: mat.timber, kerbH: 0.12,
    regions: [
      [-27, -21.5, -27, 27, 'pavers'],
      [-21.5, -12, -4.5, 4.5, 'boards'],
      [-12, 22.5, -22.5, 16.5, 'deck'],
      [-12, 22.5, -3, 3, 'boards'],            // main walk along the pier
      [4.5, 9, 3, 16.5, 'boards'],             // walk to the slide tower and wheel
      [15, 22.5, -6, 9, 'boards'],             // end plaza
      [-9, 1.5, -6, -3, 'boards'],             // coaster queue apron
    ],
    mats: { boards: mat.boards, deck: mat.deck, pavers: mat.pavers }, uv: { boards: 3, deck: 3, pavers: 3 },
  });
  // deck structure: joists under the boards, then piles on a 3 m grid with braces
  {
    const beams = new Beams();
    const deckBox = (x0, x1, z0, z1) => { const b = M(new THREE.BoxGeometry(x1 - x0, 0.45, z1 - z0), mat.timber); b.position.set((x0 + x1) / 2, DECK - 0.24, (z0 + z1) / 2); root.add(b); };
    deckBox(-21.5, -12, -4.5, 4.5); deckBox(-12, 22.5, -22.5, 16.5);
    const piles = [];
    for (let x = -20; x <= -12; x += 3.6) for (const z of [-4, 0, 4]) piles.push([x, z]);
    for (let x = -11.5; x <= 22; x += 3.5) for (let z = -22; z <= 16; z += 3.8) piles.push([x, z]);
    const pm = std({ color: '#3d4a44', roughness: 0.55, metalness: 0.4, map: K.tx.paint.map });
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.24, 1, 12), pm, piles.length);
    const m4 = new THREE.Matrix4();
    piles.forEach(([x, z], k) => { m4.makeScale(1, DECK + 3, 1).setPosition(x, (DECK - 0.45 - 3) / 2, z); im.setMatrixAt(k, m4); });
    im.castShadow = true; im.receiveShadow = true; root.add(im);
    // diagonal braces along the outer pile rows (what you see from the beach)
    for (const z of [-22, 16]) for (let x = -11.5; x < 21; x += 3.5) { beams.add(V(x, -0.2, z), V(x + 3.5, DECK - 0.5, z), 0.1); beams.add(V(x + 3.5, -0.2, z), V(x, DECK - 0.5, z), 0.1); }
    for (const x of [22]) for (let z = -22; z < 15; z += 3.8) { beams.add(V(x, -0.2, z), V(x, DECK - 0.5, z + 3.8), 0.1); beams.add(V(x, -0.2, z + 3.8), V(x, DECK - 0.5, z), 0.1); }
    for (let x = -20; x < -12; x += 3.6) for (const z of [-4, 4]) beams.add(V(x, -0.2, z), V(x + 3.6, DECK - 0.5, z), 0.1);
    root.add(beams.mesh(pm));
    // foam rings round the piles in the surf
    const ring = std({ color: '#f2f6f6', roughness: 0.6, transparent: true, opacity: 0.6 });
    piles.forEach(([x, z]) => { const r = M(new THREE.RingGeometry(0.26, 0.5, 16), ring, false, false); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.14, z); root.add(r); });
    // railing round the deck edge: white posts, top rail and two mid rails (one instanced mesh)
    const rail = new Beams();
    const edge = [
      [V(-21.5, 0, -4.5), V(-12, 0, -4.5)], [V(-12, 0, -4.5), V(-12, 0, -22.5)], [V(-12, 0, -22.5), V(22.5, 0, -22.5)],
      [V(22.5, 0, -22.5), V(22.5, 0, 16.5)], [V(22.5, 0, 16.5), V(-12, 0, 16.5)], [V(-12, 0, 16.5), V(-12, 0, 4.5)], [V(-12, 0, 4.5), V(-21.5, 0, 4.5)],
    ];
    for (const [a, b] of edge) {
      const inward = V(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(-0.15);
      const A = a.clone().add(inward), B = b.clone().add(inward);
      const n = Math.round(A.distanceTo(B) / 1.5);
      for (let k = 0; k <= n; k++) { const p = A.clone().lerp(B, k / n); rail.add(V(p.x, DECK, p.z), V(p.x, DECK + 1.1, p.z), 0.09); }
      for (const h of [1.1, 0.72, 0.36]) rail.add(V(A.x, DECK + h, A.z), V(B.x, DECK + h, B.z), h === 1.1 ? 0.12 : 0.05, h === 1.1 ? 0.07 : 0.05);
    }
    // promenade railing along the sea wall
    for (let z = -27; z < 27; z += 1.5) rail.add(V(-21.75, DECK, z), V(-21.75, DECK + 1.0, z), 0.07);
    rail.add(V(-21.75, DECK + 1.0, -27), V(-21.75, DECK + 1.0, -4.6), 0.08); rail.add(V(-21.75, DECK + 1.0, 4.6), V(-21.75, DECK + 1.0, 27), 0.08);
    root.add(rail.mesh(mat.whiteTimber));
  }

  // ---------------------------------------------------------------- wooden coaster, out and back on trestles
  const Y0 = DECK + 1.05;
  const ctrl = [
    [-8, Y0, -9.6], [-3, Y0, -9.6], [1, Y0, -9.6],
    [5, Y0 + 1.2, -9.6], [14, Y0 + 10.0, -9.6], [17.6, Y0 + 11.2, -10.6],
    [19.6, Y0 + 9.6, -14.4], [17.6, Y0 + 8.0, -19.2], [13, Y0 + 3.5, -20.0], [9, Y0 + 0.8, -20.0],
    [3, Y0 + 6.2, -20.0], [-2, Y0 + 1.2, -20.0], [-6.5, Y0 + 3.2, -19.8],
    [-10.4, Y0 + 2.0, -17.0], [-10.6, Y0 + 0.9, -12.4], [-10, Y0 + 0.2, -10.2],
  ].map(([x, y, z]) => V(x, y, z));
  const inStation = (p) => p.z > -10.2 && p.x > -9.5 && p.x < 2.5 && p.y < Y0 + 0.3;
  const F = frames(ctrl, { closed: true, step: 0.25, flat: inStation, bankMax: 0.75, smooth: 12 });
  const red = std({ color: '#b03a2e', roughness: 0.7, map: K.tx.paint.map });
  const timberTrack = std({ map: K.tx.wood.map, color: '#d8c3a5', roughness: 0.8 });
  const liftA = F.P.findIndex((p, i) => p.x > 5.5 && p.z > -10.5 && F.Tn[i].y > 0.3), liftB = F.P.findIndex((p) => p.x > 13.6 && p.y > Y0 + 9.5);
  woodTrack(K, F, { railMat: timberTrack, tieMat: std({ map: K.tx.wood.map, color: '#a58d70', roughness: 0.85 }), steelMat: mat.stainless, lift: liftA > 0 && liftB > liftA ? [liftA, liftB] : null });
  {
    const beams = trestle(F, new Beams(), { ground: () => DECK, every: 1.9, half: 1.15, under: 0.45, skip: (i, p) => inStation(p) || p.y < Y0 + 0.4 });
    root.add(beams.mesh(std({ map: K.tx.wood.map, color: '#efe4d2', roughness: 0.85 })));
    // low track in and out of the station rests on short sleepers
    const low = new Beams();
    for (let i = 0; i < F.NS; i += 6) { const p = F.P[i]; if (p.y < Y0 + 0.4 && !inStation(p)) { const t = F.Tn[i], lat = V(-t.z, 0, t.x).normalize(); for (const s of [-1, 1]) { const q = p.clone().addScaledVector(lat, s * 0.6); low.add(V(q.x, DECK, q.z), V(q.x, p.y - 0.4, q.z), 0.14); } } }
    root.add(low.mesh(mat.timber));
  }
  // station: platform on the walk side, gable roof on posts, name board, exit stair
  {
    const x0 = -8.6, x1 = 1.6, zt = -9.6;
    const plat = M(new THREE.BoxGeometry(x1 - x0, 0.95, 2.4), mat.boards); plat.position.set((x0 + x1) / 2, DECK + 0.47, zt + 2.0); root.add(plat);
    const fence = new Beams();
    for (let x = x0 + 0.3; x <= x1; x += 1.0) fence.add(V(x, DECK + 0.95, zt + 0.95), V(x, DECK + 1.85, zt + 0.95), 0.05);
    fence.add(V(x0, DECK + 1.85, zt + 0.95), V(x1, DECK + 1.85, zt + 0.95), 0.06);
    for (let x = x0; x <= x1 + 0.1; x += 2.55) { fence.add(V(x, DECK, zt + 3.1), V(x, DECK + 5.2, zt + 3.1), 0.2); fence.add(V(x, DECK, zt - 1.4), V(x, DECK + 4.6, zt - 1.4), 0.2); }
    root.add(fence.mesh(mat.whiteTimber));
    const roofG = new THREE.Group(); roofG.position.set((x0 + x1) / 2, DECK + 4.9, zt + 0.85); root.add(roofG);
    for (const s of [-1, 1]) { const sl = M(new THREE.BoxGeometry(x1 - x0 + 1.2, 0.14, 3.3), std({ color: '#2f6d6a', roughness: 0.6, map: K.tx.shingles.map })); sl.position.set(0, 0.55, s * 1.45); sl.rotation.x = s * 0.36; roofG.add(sl); }
    const board = M(new THREE.BoxGeometry(5.2, 0.9, 0.12), [mat.whiteTimber, mat.whiteTimber, mat.whiteTimber, mat.whiteTimber, signMat('SHOREBIRD', { bg: '#2f6d6a', accent: '#f6e8c0', frame: '#f1ede4' }), mat.whiteTimber]);
    board.position.set((x0 + x1) / 2, DECK + 6.15, zt + 3.25); root.add(board);
    for (let k = 0; k < 6; k++) { const st = M(new THREE.BoxGeometry(1.3, 0.16 * (k + 1), 0.3), mat.boards); st.position.set(x0 - 0.7, DECK + 0.08 * (k + 1), zt + 3.0 - k * 0.3 - 0.15); root.add(st); }
  }
  // two trains: one in the station loading, one on the first drop
  const train = (i0, seed, armsUp, n = 4) => { for (let c = 0; c < n; c++) root.add(onTrack(F, i0 - c * 9, sitCar(K, { seed: seed + c * 10, color: '#1f4f8a', trim: '#f2e3b3', lead: c === 0, armsUp, len: 2.0 }))); };
  const stIdx = F.P.findIndex((p) => p.x > -0.5 && inStation(p));
  train(stIdx, 1000, false);
  const dropIdx = F.P.findIndex((p) => p.x < 15.5 && p.z < -19.5);
  train(dropIdx + 22, 1100, true);

  // ---------------------------------------------------------------- Ferris wheel and slide tower
  ferrisWheel(K, { x: -3.2, z: 10.5, y: DECK, D: 16, n: 16, yaw: Math.PI / 2, seed: 1200 });
  slideTower(K, { x: 14.5, z: 11.2, y: DECK, H: 11, seed: 1300 });
  // ---------------------------------------------------------------- food stalls, furniture, lights
  stall(K, { x: 6.2, z: -4.7, y: DECK, rot: 0, name: 'FISH & CHIPS', awning: ['#1f4f8a', '#f4efe2'] });
  stall(K, { x: 10.4, z: -4.7, y: DECK, rot: 0, name: 'DOUGHNUTS', awning: ['#d9536f', '#f4efe2'] });
  stall(K, { x: 13.8, z: 4.7, y: DECK, rot: Math.PI, name: 'ICE CREAM', awning: ['#3b9a8a', '#f4efe2'] });
  stall(K, { x: -7.6, z: 4.7, y: DECK, rot: Math.PI, name: 'ROCK CANDY', awning: ['#e2a92c', '#f4efe2'] });
  for (const x of [-18, -12.5, -6, 0, 6, 12, 18]) { K.lamp(x, -3.3, DECK, mat.whiteTimber); K.lamp(x + 3, 3.3, DECK, mat.whiteTimber); }
  for (const z of [-22, -12, 0, 12, 22]) K.lamp(-22.6, z, DECK, mat.whiteTimber);
  K.benchWith(-16, 3.7, Math.PI, [1, 2], DECK); K.bench(-9.5, 3.7, Math.PI, DECK); K.benchWith(2.5, 3.7, Math.PI, [3], DECK);
  K.benchWith(21.6, 0, -Math.PI / 2, [4, 5], DECK); K.bench(21.6, 5, -Math.PI / 2, DECK); K.benchWith(17, -5.6, 0, [6], DECK);
  K.benchWith(-25.5, -10, Math.PI / 2, [7], DECK); K.bench(-25.5, 12, Math.PI / 2, DECK);
  K.bin(-14, -3.5, DECK); K.bin(4, 3.5, DECK); K.bin(16, -3.5, DECK); K.bin(-24.5, 4, DECK);
  // telescope at the end of the pier
  { const g = new THREE.Group(); g.position.set(21.3, DECK, -3.5); g.add(M(new THREE.CylinderGeometry(0.08, 0.12, 1.1, 10), mat.green).translateY(0.55)); const tb = M(new THREE.CylinderGeometry(0.11, 0.08, 0.7, 12), mat.brass); tb.rotation.x = Math.PI / 2 - 0.2; tb.rotation.y = -Math.PI / 2; tb.position.y = 1.25; g.add(tb); root.add(g); }
  // flag poles on the promenade
  for (const z of [-7, 7]) { root.add(rod(V(-24.5, DECK, z), V(-24.5, DECK + 8, z), 0.06, mat.whiteTimber, 8)); const f = M(new THREE.PlaneGeometry(1.6, 1.0), std({ color: z < 0 ? '#2f6fb5' : '#e2a92c', roughness: 0.8, side: THREE.DoubleSide })); f.position.set(-24.5, DECK + 7.4, z + 0.8); f.rotation.y = Math.PI / 2; root.add(f); }

  // ---------------------------------------------------------------- beach life: towels, parasols, sitters, a sandcastle
  const towel = (x, z, col, rot) => { const t = M(new THREE.BoxGeometry(0.9, 0.02, 1.8), std({ color: col, roughness: 0.95 }), false, true); t.position.set(x, beachY(x, z) + 0.02, z); t.rotation.y = rot; root.add(t); };
  const parasol = (x, z, col) => { const y = beachY(x, z); root.add(rod(V(x, y - 0.3, z), V(x - 0.3, y + 2.1, z), 0.025, mat.stainless, 6)); const c = M(new THREE.ConeGeometry(1.2, 0.45, 12, 1, true), std({ color: col, roughness: 0.8, side: THREE.DoubleSide })); c.position.set(x - 0.3, y + 2.15, z); c.rotation.z = 0.12; root.add(c); };
  [[-18.5, -14, '#e2a92c', 0.2], [-17.2, -9, '#2f6fb5', -0.3], [-18.8, 9, '#d9536f', 0.1], [-16.5, 15, '#3b9a8a', 0.4], [-19, 21, '#f4efe2', -0.2]].forEach(([x, z, c, r]) => towel(x, z, c, r));
  parasol(-19.5, -12.5, '#c8372d'); parasol(-19.6, 10.5, '#f2c14e'); parasol(-18, 20, '#2f6fb5');
  const sitBeach = (seed, x, z, rot, look = {}) => { const p = K.guest(seed, x, z, rot, { kind: 'sit' }, { bottomType: 'shorts', sleeves: 'none', hat: seed % 3 ? null : 'sunhat', ...look }, 0); p.position.y = beachY(x, z) + 0.12; };
  sitBeach(30, -18.4, -13.4, Math.PI / 2); sitBeach(31, -18.6, 8.6, Math.PI / 2 + 0.3); sitBeach(32, -16.4, 15.4, Math.PI / 2 - 0.4, { child: true });
  K.guest(33, -15.5, -6.5, 0.6, { kind: 'stand' }, { child: true, bottomType: 'shorts' }, beachY(-15.5, -6.5));
  K.guest(34, -14.8, -5.6, -2.2, { kind: 'stand' }, { child: true, bottomType: 'shorts', hat: 'bucket' }, beachY(-14.8, -5.6));
  K.guest(35, -13.6, 19, Math.PI / 2, { kind: 'walk', phase: 1 }, { bottomType: 'shorts' }, beachY(-13.6, 19));
  K.guest(36, -12.4, 20.5, Math.PI / 2, { kind: 'walk', phase: 2.4 }, { child: true, bottomType: 'shorts' }, beachY(-12.4, 20.5));
  { const y = beachY(-15.1, -7.2); const c = M(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8), std({ map: K.tx.sand.map, roughness: 1 })); c.position.set(-15.1, y + 0.2, -7.2); root.add(c); const c2 = M(new THREE.CylinderGeometry(0.2, 0.28, 0.3, 8), c.material); c2.position.set(-15.1, y + 0.55, -7.2); root.add(c2); }

  // ---------------------------------------------------------------- guests on the deck
  const D = DECK;
  K.crowd(40, 14, -21, -1.6, 12, 1.6, 4.2, D);   // main walk
  K.crowd(41, 6, -26.5, -20, -26.5, 22, 2.6, D);  // promenade
  K.crowd(42, 5, 6.8, 4, 6.8, 15, 2.6, D);        // walk to the slide tower
  K.crowd(43, 5, 16, -4, 22, 7, 4, D);            // end plaza
  // queues: coaster stairs, stalls, slide tower door, wheel platform
  [[-9.3, -5.2], [-9.2, -4.4], [-8.4, -4.0], [-7.6, -4.2], [-6.8, -4.1], [-5.9, -4.3]].forEach(([x, z], i) => K.guest(60 + i, x, z, i ? -Math.PI / 2 : Math.PI, { kind: 'stand', phase: i * 0.13 }, {}, D));
  [[6.0, -3.4], [6.4, -2.6], [10.2, -3.4]].forEach(([x, z], i) => K.guest(70 + i, x, z, Math.PI, { kind: 'stand', phase: i * 0.2 }, {}, D));
  K.guest(73, 13.6, 3.4, 0, { kind: 'stand' }, { child: true }, D); K.guest(74, 14.3, 3.2, -0.3, { kind: 'eat', item: 'cone' }, {}, D);
  K.guest(75, 14.5, 8.4, Math.PI / 2, { kind: 'stand' }, { child: true }, D); K.guest(76, 13.6, 8.0, Math.PI / 2, { kind: 'stand' }, {}, D);
  K.guest(77, -3.2, 6.6, 0, { kind: 'stand' }, {}, D); K.guest(78, -2.4, 6.2, 0.2, { kind: 'point' }, { child: true }, D);
  K.guest(79, -7.0, 3.6, Math.PI, { kind: 'eat', item: 'floss' }, { child: true }, D);
  K.guest(80, 20.6, -2.6, Math.PI / 2, { kind: 'stand' }, {}, D); // at the telescope
  K.guest(81, 21.0, 12, Math.PI / 2, { kind: 'stand' }, {}, D); K.guest(82, 21.1, 12.8, Math.PI / 2 + 0.3, { kind: 'wave' }, { child: true }, D);
  // the station platform: riders boarding
  K.guest(83, -1.5, -7.9, Math.PI, { kind: 'stand' }, {}, D + 0.95); K.guest(84, -2.4, -7.7, Math.PI, { kind: 'stand' }, { child: true }, D + 0.95);
  K.guest(85, 0.6, -7.6, 0.4, { kind: 'stand' }, { top: '#1f4f8a', bottomType: 'trousers' }, D + 0.95); // operator

  // ---------------------------------------------------------------- gulls: flying over the beach and the pier, perched on the railing
  [[-14, 9, -2, 0.5, 0.5], [-10, 11, 6, 2.2, -0.2], [2, 14, -14, -0.8, 0.6], [8, 9.5, 20, 1.5, 0.1], [20, 12, -20, 2.8, 0.4], [-20, 7.5, 18, -0.4, -0.3], [25, 6.5, 6, 0.2, 0.5]]
    .forEach(([x, y, z, rot, flap]) => gull(K, { x, y, z, rot, flap }));
  [[22.35, 4.6, 1.0], [22.35, 10, 1.4], [-21.75, -16, 0.2], [-12.15, 12, 2.0]].forEach(([x, z, rot]) => gull(K, { x, y: DECK + 1.15, z, rot, perched: true }));

  // ---------------------------------------------------------------- a moored motor launch and buoys in the foreground water
  {
    const b = new THREE.Group(); b.position.set(24.6, 0.05, 8.5); b.rotation.y = 0.15; root.add(b);
    const hullG = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); hullG.scale(1.1, 0.7, 3.4);
    b.add(M(hullG, new THREE.MeshPhysicalMaterial({ color: '#f2f0ea', roughness: 0.3, clearcoat: 1 })).translateY(0.35));
    const deckG = new THREE.CircleGeometry(1, 24); deckG.rotateX(-Math.PI / 2); deckG.scale(1.05, 1, 3.3);
    b.add(M(deckG, mat.boards).translateY(0.34));
    const stripe = M(new THREE.TorusGeometry(1, 0.05, 6, 32), std({ color: '#2f6fb5', roughness: 0.4 })); stripe.rotation.x = Math.PI / 2; stripe.scale.set(1.08, 3.38, 1); stripe.position.y = 0.3; b.add(stripe);
    const cab = M(new THREE.BoxGeometry(1.3, 0.8, 1.4), mat.whiteTimber); cab.position.set(0, 0.75, 0.3); b.add(cab);
    const ws = M(new THREE.BoxGeometry(1.25, 0.45, 0.05), new THREE.MeshPhysicalMaterial({ color: '#2a3b48', roughness: 0.05, clearcoat: 1 })); ws.position.set(0, 0.95, 1.02); ws.rotation.x = -0.3; b.add(ws);
    const skipper = K.guest(1400, 0, 0, 0, { kind: 'stand' }, { hat: 'cap', top: '#1f3557' }, 0); root.remove(skipper); skipper.position.set(0.2, 0.36, -1.3); b.add(skipper);
    root.add(rod(V(23.6, 0.4, 6.1), V(22.4, DECK - 0.4, 5.0), 0.015, std({ color: '#d9cfae', roughness: 0.9 }), 4)); // mooring line to the pier
    for (const [x, z, c] of [[25.5, 22, '#e8402e'], [18, 24.5, '#f2c14e'], [10, 23.5, '#e8402e']]) { const buoy = M(new THREE.SphereGeometry(0.35, 16, 10), std({ color: c, roughness: 0.4 })); buoy.position.set(x, 0.12, z); root.add(buoy); root.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), mat.darkSteel).translateX(x).translateY(0.6).translateZ(z)); }
  }

  return { root, lights: K.lights, lightMats: K.lightMats, guests: K.guests, extent: 44, shadowTarget: V(0, 4, -2) };
}
