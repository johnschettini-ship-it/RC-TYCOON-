// AA Winter festival: snow on the ground and the trees, a frozen pond with skaters, a covered bobsled coaster that
// twists down from a lift hill, a carousel strung with lights, a market street of timber huts, a decorated festival
// tree, low warm winter sun. Plot 18 x 18 tiles = 54 m (HALF 27).
import * as THREE from 'three';
import * as T from './textures.js';
import { makeKit, M, V, rod, std, rep, planarUV, faceUp } from './kit.js';
import { frames, sweep, Beams, onTrack, sled, hut, signMat, trestle, boxProfile } from './rides.js';

const HALF = 27;
const POND = { x: -11, z: 14, rx: 9, rz: 6.5 };

export function buildWinter(variant) {
  const K = makeKit(variant);
  K.look = { season: 'winter' };
  const { root, mat } = K;

  // ---------------------------------------------------------------- snow ground (gentle drifts), soil sides with a snow lip
  const knoll = (x, z) => 2.2 * Math.exp(-((x - 18.5) ** 2 + (z - 21) ** 2) / (2 * 3.2 * 3.2)); // sledging knoll in the front corner
  const drift = (x, z) => 0.12 * Math.sin(x * 0.4 + 1) * Math.sin(z * 0.33) + 0.06 * Math.sin(x * 1.1 - z * 0.7) + knoll(x, z);
  const snowGround = std({ map: rep(K.tx.snow.map, 9), bumpMap: rep(K.tx.snow.bump, 9), bumpScale: 0.8, roughness: 0.82, vertexColors: true });
  K.ground({ half: HALF, seg: 120, top: snowGround, height: (x, z) => Math.max(0, drift(x, z)) , tint: 0.06, seed: 23 });
  const lip = M(new THREE.BoxGeometry(2 * HALF + 0.04, 0.14, 2 * HALF + 0.04), mat.snowFlat, false, true); lip.position.y = -0.06; root.add(lip);

  // ---------------------------------------------------------------- cleared paths with granite kerbs and snow banks beside them
  const pav = K.paving({
    half: HALF, cell: 1.5, y: 0.2, kerbH: 0.2,
    regions: [
      [-27, 27, -1.5, 1.5, 'pavers'],             // festival street
      [4.5, 7.5, 1.5, 27, 'pavers'],              // south walk
      [-1.5, 4.5, 1.5, 9, 'slabs'],               // tree plaza
      [12, 15, 1.5, 7.5, 'pavers'],               // carousel entry
      [-9, -6, 1.5, 7.5, 'pavers'],               // to the pond
      [-16.5, -7.5, -4.5, -1.5, 'asphalt'],       // bobsled queue yard
    ],
  });
  {
    // banks: squashed white mounds along every path edge (instanced), stopping at junctions
    const bankG = new THREE.SphereGeometry(1, 12, 8); bankG.scale(1, 0.3, 1);
    const pts = [];
    const r = T.rng(8);
    const N = pav.N, c = pav.cell;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (!pav.kind[i][j]) continue;
      const x0 = -HALF + i * c, z0 = -HALF + j * c;
      const nb = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [di, dj] of nb) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N || pav.kind[ii][jj]) continue;
        const cx = x0 + c / 2 + di * (c / 2 + 0.45), cz = z0 + c / 2 + dj * (c / 2 + 0.45);
        pts.push([cx + (dj ? (r() - 0.5) * 0.4 : 0), cz + (di ? (r() - 0.5) * 0.4 : 0), 0.8 + r() * 0.35]);
      }
    }
    const im = new THREE.InstancedMesh(bankG, mat.snowFlat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z, s], k) => { m4.makeScale(s, s * (0.9 + (k % 3) * 0.1), s).setPosition(x, 0.0, z); im.setMatrixAt(k, m4); });
    im.castShadow = true; im.receiveShadow = true; root.add(im);
  }

  // ---------------------------------------------------------------- frozen pond: ice with blade marks, snowy rim, skaters
  {
    const sh = new THREE.Shape(); const pts = [];
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, rr = 1 + 0.06 * Math.sin(a * 3 + 0.5); pts.push(new THREE.Vector2(POND.x + Math.cos(a) * POND.rx * rr, -(POND.z + Math.sin(a) * POND.rz * rr))); }
    sh.setFromPoints(pts);
    const g = new THREE.ShapeGeometry(sh, 2); g.rotateX(-Math.PI / 2); faceUp(g); planarUV(g, 8);
    const ice = M(g, new THREE.MeshPhysicalMaterial({ map: K.tx.ice.map, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, color: '#ffffff' }), false, true);
    ice.position.y = 0.04; root.add(ice);
    const bank = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat.snowFlat, 64);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, rr = 1.03 + 0.06 * Math.sin(a * 3 + 0.5); m4.makeScale(1.1, 0.32, 1.1).setPosition(POND.x + Math.cos(a) * POND.rx * rr, 0.02, POND.z + Math.sin(a) * POND.rz * rr); bank.setMatrixAt(i, m4); }
    bank.castShadow = true; bank.receiveShadow = true; root.add(bank);
    // skaters: gliding, a pair holding hands, a child learning with a parent
    const r = T.rng(4);
    const sk = [[-15, 12, 0.6], [-12.5, 10, 2.2], [-9, 11.5, -1.0], [-6.5, 14.5, 3.4], [-8.5, 17, 1.9], [-14, 16.5, -2.4], [-17, 14.5, 0.2], [-11, 15, 1.1], [-4.5, 12.5, -0.6], [-10.2, 18.2, 2.8]];
    sk.forEach(([x, z, rot], i) => K.guest(300 + i, x, z, rot, { kind: i === 7 || i === 9 ? 'stand' : 'skate', phase: r() * 6.28 }, { child: i === 9 || i === 3 }, 0.06));
    // skate hut on the shore
    hut(K, { x: -4.2, z: 21.5, rot: -Math.PI / 2 - 0.4, name: 'SKATE HIRE', color: '#2f4a6a' });
  }

  // ---------------------------------------------------------------- bobsled coaster: half-pipe trough, lift, covered sections
  const Y0 = 1.25;
  const ctrl = [
    [-16, Y0, -6.8], [-12, Y0, -6.8], [-8, Y0, -6.8],
    [-4, Y0 + 0.2, -7.0], [-1.6, Y0 + 0.8, -9.8], [-1.0, Y0 + 2.5, -12.0], [-1.0, 12.4, -21.6], [-2.6, 13.0, -24.4],
    [-6.0, 12.5, -25.0], [-10.0, 11.6, -23.6], [-12.2, 10.9, -20.2], [-9.6, 10.2, -16.6], [-6.0, 9.4, -15.6],
    [-4.8, 8.6, -12.6], [-8.0, 7.7, -10.4], [-13.0, 6.9, -11.4], [-16.0, 6.1, -15.0], [-18.0, 5.4, -19.6],
    [-22.0, 4.6, -21.2], [-24.6, 3.9, -17.6], [-23.2, 3.0, -12.4], [-21.0, 2.2, -9.4], [-18.6, Y0 + 0.2, -7.4],
  ].map(([x, y, z]) => V(x, y, z));
  const inStation = (p) => p.z > -7.5 && p.x > -17 && p.x < -7.4 && p.y < Y0 + 0.2;
  const F = frames(ctrl, { closed: true, step: 0.25, flat: inStation, bankMax: 1.2, bankScale: 1.4, smooth: 10 });
  {
    const inner = [], outer = [];
    for (let k = 0; k <= 16; k++) { const t = -1.95 + (k / 16) * 3.9; inner.push([Math.sin(t) * 1.0, 1.0 - Math.cos(t) * 1.0]); outer.push([Math.sin(t) * 1.1, 1.0 - Math.cos(t) * 1.1]); }
    root.add(sweep(F, [inner], std({ color: '#e8eef4', roughness: 0.25, metalness: 0.0, side: THREE.DoubleSide, map: K.tx.paint.map })));
    root.add(sweep(F, [outer.slice().reverse()], new THREE.MeshPhysicalMaterial({ color: '#1f5fa0', roughness: 0.4, clearcoat: 0.7, map: K.tx.paint.map })));
    root.add(sweep(F, [[inner[0], outer[0]], [outer[16], inner[16]]], std({ color: '#d8dde4', roughness: 0.4 })));
    // snow lying on the outer lips
    root.add(sweep(F, boxProfile(outer[0][0] + 0.02, outer[0][1] + 0.05, 0.2, 0.08), mat.snowFlat));
    root.add(sweep(F, boxProfile(outer[16][0] - 0.02, outer[16][1] + 0.05, 0.2, 0.08), mat.snowFlat));
  }
  const steel = std({ color: '#e7e9ec', roughness: 0.5, metalness: 0.3, map: K.tx.paint.map });
  root.add(trestle(F, new Beams(), { ground: () => 0, every: 2.2, half: 1.0, under: 0.15, post: 0.14, brace: 0.06, ledger: 3, skip: (i, p) => inStation(p) }).mesh(steel));
  // covered sections: timber snow sheds over parts of the descent (posts + pitched roof following the track, snow on top)
  const liftA = F.P.findIndex((p, i) => F.Tn[i].y > 0.3), liftB = F.P.findIndex((p, i) => i > liftA && F.Tn[i].y < 0.1);
  const sheds = [[0.36, 0.47], [0.62, 0.72]].map(([a, b]) => [Math.round(a * F.NS), Math.round(b * F.NS)]);
  {
    const posts = new Beams();
    const roofM = std({ map: rep(K.tx.shingles.map, 1, 1), color: '#7a4a3a', roughness: 0.9, side: THREE.DoubleSide });
    for (const [a, b] of sheds) {
      root.add(sweep(F, [[[-1.85, 2.15], [0, 3.0], [1.85, 2.15]]], roofM, { i0: a, i1: b, uvLen: 2 }));
      root.add(sweep(F, [[[-1.9, 2.3], [0, 3.15], [1.9, 2.3]]], mat.snowFlat, { i0: a, i1: b }));
      root.add(sweep(F, boxProfile(-1.6, 2.0, 0.12, 0.2), mat.timber, { i0: a, i1: b }));
      root.add(sweep(F, boxProfile(1.6, 2.0, 0.12, 0.2), mat.timber, { i0: a, i1: b }));
      for (let i = a; i <= b; i += 8) for (const s of [-1, 1]) posts.add(F.P[i].clone().addScaledVector(F.Lt[i], s * 1.6).addScaledVector(F.Up[i], -0.1), F.P[i].clone().addScaledVector(F.Lt[i], s * 1.6).addScaledVector(F.Up[i], 2.1), 0.14);
    }
    root.add(posts.mesh(mat.timber));
  }
  // lift chain
  if (liftA > 0) root.add(sweep(F, boxProfile(0, 0.02, 0.14, 0.06), mat.chain, { i0: liftA, i1: liftB }));
  // station: timber hall with a snowy roof, platform on the street side, name board
  {
    const x0 = -16.8, x1 = -7.4, zt = -6.8;
    const plat = M(new THREE.BoxGeometry(x1 - x0, 0.85, 2.4), mat.boards); plat.position.set((x0 + x1) / 2, 0.42, zt + 2.3); root.add(plat);
    const posts = new Beams();
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) { posts.add(V(x, 0, zt - 1.5), V(x, 4.2, zt - 1.5), 0.24); posts.add(V(x, 0.85, zt + 3.4), V(x, 4.2, zt + 3.4), 0.24); }
    root.add(posts.mesh(mat.timber));
    const roofG = new THREE.Group(); roofG.position.set((x0 + x1) / 2, 4.3, zt + 0.95); root.add(roofG);
    for (const s of [-1, 1]) {
      const sl = M(new THREE.BoxGeometry(x1 - x0 + 1.2, 0.16, 3.2), std({ map: K.tx.shingles.map, color: '#8a4a3a', roughness: 0.9 })); sl.position.set(0, 0.6, s * 1.4); sl.rotation.x = s * 0.42; roofG.add(sl);
      const sn = M(new THREE.BoxGeometry(x1 - x0 + 1.25, 0.16, 3.1), mat.snowFlat); sn.position.set(0, 0.76, s * 1.38); sn.rotation.x = s * 0.42; roofG.add(sn);
    }
    const board = M(new THREE.BoxGeometry(5.0, 0.8, 0.12), [mat.timber, mat.timber, mat.timber, mat.timber, signMat('ICE RUNNER', { bg: '#1f3557', accent: '#f6e2b0', frame: '#e9e4da' }), mat.timber]);
    board.position.set((x0 + x1) / 2, 4.1, zt + 3.5); root.add(board);
    for (let k = 0; k < 5; k++) { const st = M(new THREE.BoxGeometry(1.3, 0.17 * (k + 1), 0.3), mat.boards); st.position.set(x1 + 0.4 + (4 - k) * 0.3, 0.085 * (k + 1), zt + 2.6); root.add(st); }
    const garland = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), K.festoon, 40);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) { const t = i / 39; m4.makeTranslation(x0 - 0.5 + t * (x1 - x0 + 1), 3.75 - Math.sin(t * Math.PI * 4) ** 2 * 0.25, zt + 3.55); garland.setMatrixAt(i, m4); }
    root.add(garland);
  }
  // sleds: two in the station, one cresting the lift, three on the descent (one under a shed roof)
  const sledAt = (i, seed, color, n = 2) => root.add(onTrack(F, i, sled(K, { seed, color, riders: n })));
  const st = F.P.findIndex((p) => inStation(p) && p.x > -11);
  sledAt(st, 400, '#c8231e', 3); sledAt(st - 13, 410, '#e2a92c', 2);
  sledAt(liftB - 6, 420, '#3b7d4f', 2);
  sledAt(Math.round(F.NS * 0.31), 430, '#c8231e', 3);
  sledAt(Math.round(F.NS * 0.55), 440, '#6c4f9a', 2);
  sledAt(Math.round(F.NS * 0.82), 450, '#e2a92c', 3);

  // ---------------------------------------------------------------- carousel with lights
  K.carousel({ cx: 14.2, cz: 13.6, R: 5.8, festive: true, fenceGapAt: -Math.PI / 2, riderSeeds: [0, 2, 3, 5, 7, 10, 12, 14] });
  // snow on the carousel canopy: a thin white cone just above the stripes, broken by the ribs
  { const sc = M(new THREE.ConeGeometry(4.2, 1.7, 48, 1, true), mat.snowFlat); sc.position.set(14.2, 0.52 + 3.75 + 1.2 + 0.42 + 0.33, 13.6); root.add(sc); }

  // ---------------------------------------------------------------- market street: huts both sides, string lights over the street
  const names = ['HOT DRINKS', 'ROAST NUTS', 'WAFFLES', 'SOUP', 'CANDLES', 'GINGER BISCUITS', 'WOOL MITTENS', 'CHESTNUTS'];
  const cols = ['#7a2440', '#2f4a6a', '#3b5e3a', '#8a4a2a'];
  [[9.5, -4.4, 0], [13.5, -4.4, 0], [17.5, -4.4, 0], [21.5, -4.4, 0], [-3.5, -4.4, 0], [19.5, 4.4, Math.PI], [23.5, 4.4, Math.PI], [-12.5, 4.4, Math.PI]]
    .forEach(([x, z, rot], i) => hut(K, { x, z, rot, name: names[i], seed: i, color: cols[i % 4] }));
  {
    const n = 8, wire = [];
    for (let k = 0; k < n; k++) { const x = -4 + k * 4; K.lamp(x, -2.2, 0.2, mat.green); K.lamp(x + 2, 2.2, 0.2, mat.green); wire.push([x, x + 2]); }
    const bl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), K.festoon, n * 14);
    const m4 = new THREE.Matrix4(); let c = 0;
    for (const [xa, xb] of wire) for (let i = 0; i < 14; i++) { const t = i / 13; m4.makeTranslation(xa + (xb - xa) * t, 4.25 - Math.sin(t * Math.PI) * 0.7, -2.2 + 4.4 * t); bl.setMatrixAt(c++, m4); }
    root.add(bl);
    for (const [xa, xb] of wire) { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V(xa + (xb - xa) * t, 4.3 - Math.sin(t * Math.PI) * 0.7, -2.2 + 4.4 * t)); } root.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 4), mat.chain)); }
  }
  for (const [x, z] of [[-20, -2.2], [-14, 2.2], [-24, 2.2], [6, 12], [6, 20], [-6, 4.8], [4.2, 26]]) K.lamp(x, z, 0.2, mat.green);

  // ---------------------------------------------------------------- festival tree on the plaza: snowy fir, baubles, light strands, star
  {
    const x = 1.5, z = 5.2;
    root.add(M(new THREE.CylinderGeometry(1.4, 1.5, 0.5, 24), mat.stone).translateX(x).translateZ(z).translateY(0.45));
    K.pine(x, z, 11, 777, { y: 0.6, snow: true, R: 2.8 });
    const r = T.rng(5);
    const bcol = ['#c8231e', '#e0b250', '#f2f0ea', '#2f6fb5'];
    for (let c = 0; c < 4; c++) {
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshPhysicalMaterial({ color: bcol[c], roughness: 0.2, metalness: 0.5, clearcoat: 1 }), 16);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 16; i++) { const t = 0.12 + r() * 0.75, a = r() * Math.PI * 2, rad = 2.8 * (1 - t) * 0.92 + 0.2; m4.makeTranslation(x + Math.cos(a) * rad, 0.6 + 11 * 0.16 + t * 11 * 0.8 - 0.3, z + Math.sin(a) * rad); im.setMatrixAt(i, m4); }
      im.castShadow = true; root.add(im);
    }
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), K.festoon, 140);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 140; i++) { const t = i / 140, a = t * Math.PI * 2 * 6, y = 2.2 + t * 8.2, rad = 2.8 * (1 - (y - 0.6) / 11) + 0.3; m4.makeTranslation(x + Math.cos(a) * rad, y, z + Math.sin(a) * rad); lights.setMatrixAt(i, m4); }
    root.add(lights);
    const star = M(new THREE.OctahedronGeometry(0.4, 0), K.bulb('#ffd27a', 2.0, 10)); star.position.set(x, 11.9, z); star.scale.set(1, 1.3, 0.4); root.add(star);
    // gift boxes at the foot
    [[0.9, 0.2, '#c8231e'], [-0.9, 0.5, '#2f6fb5'], [0.2, -1.0, '#e0b250']].forEach(([dx, dz, c]) => { const b = M(new THREE.BoxGeometry(0.5, 0.4, 0.5), std({ color: c, roughness: 0.6 })); b.position.set(x + dx * 1.6, 0.9, z + dz * 1.6); b.rotation.y = dx; root.add(b); });
  }

  // ---------------------------------------------------------------- snowy pines at the back and the edges, snowman, benches, bins, rocks
  const r = T.rng(19);
  const placed = [];
  const nearPath = (x, z, d) => [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]].some(([dx, dz]) => pav.isPaved(x + dx, z + dz));
  const coasterNear = (x, z) => { for (let i = 0; i < F.NS; i += 4) if (Math.hypot(F.P[i].x - x, F.P[i].z - z) < 3.2) return true; return false; };
  const inPond = (x, z) => Math.hypot((x - POND.x) / (POND.rx + 2), (z - POND.z) / (POND.rz + 2)) < 1;
  const inCarousel = (x, z) => Math.hypot(x - 14.2, z - 13.6) < 9;
  let n = 0, tries = 0;
  while (n < 40 && tries < 4000) {
    tries++;
    const x = (r() * 2 - 1) * (HALF - 1.2), z = (r() * 2 - 1) * (HALF - 1.2);
    const back = x + z < -10 || z < -20 || x < -23.5 || (x > 22 && z < 10);
    if (!back) continue;
    const H = 6 + r() * 6, rad = H * 0.24;
    if (nearPath(x, z, Math.max(1.3, rad * 0.8)) || coasterNear(x, z) || inPond(x, z) || inCarousel(x, z) || (x > -18 && x < -6 && z > -8 && z < -1)) continue;
    if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < (pr + rad) * 0.7)) continue;
    placed.push([x, z, rad]);
    K.pine(x, z, H, 3000 + n, { snow: true, y: -0.05 });
    n++;
  }
  // snowman by the pond
  {
    const g = new THREE.Group(); g.position.set(-2.6, 0, 9.4); g.rotation.y = 0.8; root.add(g);
    for (const [y, rr] of [[0.45, 0.5], [1.15, 0.36], [1.65, 0.25]]) g.add(M(new THREE.SphereGeometry(rr, 18, 14), mat.snowFlat).translateY(y));
    const nose = M(new THREE.ConeGeometry(0.05, 0.25, 8), std({ color: '#e2742c', roughness: 0.6 })); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.65, 0.33); g.add(nose);
    for (const s of [-1, 1]) { const e = M(new THREE.SphereGeometry(0.035, 6, 4), std({ color: '#111', roughness: 0.5 })); e.position.set(s * 0.09, 1.73, 0.21); g.add(e); g.add(rod(V(s * 0.3, 1.2, 0), V(s * 0.75, 1.5, 0.05), 0.02, mat.bark, 4)); }
    const sc = M(new THREE.TorusGeometry(0.27, 0.06, 8, 18), std({ color: '#c8231e', roughness: 0.9 })); sc.rotation.x = Math.PI / 2; sc.position.y = 1.42; g.add(sc);
    const hat = M(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 14), std({ color: '#1d1d1d', roughness: 0.6 })); hat.position.y = 1.98; g.add(hat);
    g.add(M(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 14), hat.material).translateY(1.84));
  }
  const snowBench = (x, z, rot, seeds = []) => { K.benchWith(x, z, rot, seeds, 0.2); const sn = M(new THREE.BoxGeometry(1.5, 0.06, 0.35), mat.snowFlat); sn.position.set(x, 0.72, z); sn.rotation.y = rot; if (!seeds.length) root.add(sn); };
  snowBench(-4.5, 2.15, Math.PI, [1, 2]); snowBench(10.5, 2.15, Math.PI); snowBench(8.1, 15, -Math.PI / 2, [3]); snowBench(-9.6, 8.1, Math.PI, [4]);
  snowBench(-15.5, 8.4, Math.PI * 0.85, [5, 6]); snowBench(26, 0, -Math.PI / 2);
  for (const [x, z] of [[3.9, -2.1], [16, 2.1], [8.1, 22], [-10.5, 2.1]]) K.bin(x, z, 0.2);
  for (const [x, z, s] of [[24, 23, 0.9], [-24, 23, 1.0], [10, 23, 0.7], [-24.5, -2.6, 0.8], [25.5, -10, 0.9]]) K.rock(x, z, s, Math.round(x * 3 + z), -0.05, true);

  // ---------------------------------------------------------------- guests (all in winter clothes)
  K.crowd(50, 18, -26, 0, 26, 0, 2.6, 0.2);          // festival street
  K.crowd(51, 7, 6, 3, 6, 26, 2.4, 0.2);              // south walk
  [[9.2, -2.4, 0], [9.8, -2.2, 0.4], [13.2, -2.4, -0.2], [17.6, -2.3, 0], [21.4, -2.5, 0.3], [-3.4, -2.4, 0], [19.4, 2.5, Math.PI], [23.8, 2.4, Math.PI + 0.3]]
    .forEach(([x, z, rot], i) => K.guest(60 + i, x, z, rot + Math.PI, { kind: i % 3 === 1 ? 'eat' : 'stand', item: i % 3 === 1 ? 'cup' : undefined, phase: i * 0.1 }, {}, 0.2));
  // around the festival tree
  [[0, 2.6, 0.2, 'point'], [3.4, 3.0, -0.6, 'stand'], [-0.6, 7.8, 2.6, 'stand'], [3.6, 8.0, -2.8, 'wave']].forEach(([x, z, rot, k], i) => K.guest(70 + i, x, z, rot + Math.PI, { kind: k }, { child: i % 2 === 0 }, 0.2));
  // carousel queue at the gate, bobsled queue in the yard, people on the bobsled platform
  [[13.3, 6.6], [13.9, 5.9], [13.2, 5.1], [14.0, 4.3]].forEach(([x, z], i) => K.guest(80 + i, x, z, 0, { kind: 'stand' }, { child: i % 2 === 1 }, 0.2));
  [[-15.6, -3.0], [-14.6, -3.4], [-13.6, -2.8], [-12.6, -3.2], [-11.6, -2.9], [-10.4, -3.3]].forEach(([x, z], i) => K.guest(90 + i, x, z, -Math.PI / 2, { kind: 'stand', phase: i * 0.13 }, {}, 0.2));
  [[-14, -4.4], [-10, -4.6]].forEach(([x, z], i) => K.guest(97 + i, x, z, Math.PI, { kind: 'stand' }, {}, 0.85));
  // by the pond edge: watchers, a parent with a child
  K.guest(100, -7.4, 7.2, Math.PI, { kind: 'point' }, { child: true }, 0.2); K.guest(101, -6.4, 7.0, Math.PI, { kind: 'stand' }, {}, 0.2);
  K.guest(102, -2.0, 10.4, -2.2, { kind: 'wave' }, { child: true });

  // kids sledging down the knoll, a parent at the top, toboggan tracks
  {
    const gy = (x, z) => Math.max(0, drift(x, z));
    const toboggan = (x, z, rot, seeds) => {
      const g = new THREE.Group(); g.position.set(x, gy(x, z) + 0.05, z); g.rotation.y = rot;
      const slope = Math.atan2(gy(x - Math.sin(rot) * 0.6, z - Math.cos(rot) * 0.6) - gy(x + Math.sin(rot) * 0.6, z + Math.cos(rot) * 0.6), 1.2); g.rotation.x = slope * 0.9; root.add(g);
      g.add(M(new THREE.BoxGeometry(0.5, 0.05, 1.3), mat.wood).translateY(0.18));
      for (const s of [-1, 1]) { g.add(M(new THREE.BoxGeometry(0.04, 0.12, 1.3), mat.timber).translateX(s * 0.22).translateY(0.08)); const curl = M(new THREE.TorusGeometry(0.12, 0.02, 6, 10, Math.PI), mat.timber); curl.rotation.y = Math.PI / 2; curl.position.set(s * 0.22, 0.14, 0.62); g.add(curl); }
      seeds.forEach((sd, i) => { const p = K.guest(sd, 0, 0, 0, { kind: 'slide' }, { child: true }, 0); root.remove(p); p.position.set(0, 0.22, 0.25 - i * 0.5); g.add(p); });
    };
    toboggan(20.6, 19.0, -2.4, [500]); toboggan(16.4, 23.2, 0.9, [501, 502]); toboggan(21.4, 23.6, 2.3, [503]);
    K.guest(504, 18.6, 21.1, 0.4, { kind: 'wave' }, {}, gy(18.6, 21.1)); K.guest(505, 18.1, 20.5, -0.9, { kind: 'stand' }, { child: true }, gy(18.1, 20.5));
    K.guest(506, 23.2, 18, -2.6, { kind: 'walk', phase: 1.1 }, { child: true }, gy(23.2, 18)); K.guest(507, 14.6, 24.6, 0.6, { kind: 'stand' }, {}, gy(14.6, 24.6));
  }

  return { root, lights: K.lights, lightMats: K.lightMats, guests: K.guests, extent: 48, shadowTarget: V(0, 3, 0) };
}
