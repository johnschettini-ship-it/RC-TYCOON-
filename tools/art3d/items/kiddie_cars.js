// Kiddie Cars (round flat ride, 3 x 3 tiles, 7 m): six little two-seat vehicles (a roadster, an open-sided bus and a
// jeep, each twice) driven round a painted ring road on sweep arms from a turning drum, under a static striped canopy
// on a banded pole, inside a picket fence. Motion, as a function of the game's ride angle a (0-1 per revolution;
// REVOLUTIONS default 2): the drum and its vehicles turn +a turns. The vehicles repeat every half turn (designs i % 3,
// riders copied the same way), so the state at a + 1/2 is the state at a turned 180 degrees: period 16 angle slots,
// 8 pictures per occupancy. Round, static parts 90-degree symmetric (16 canopy stripes in a 4-colour cycle, 16
// pennants, 64 pickets, 8 lane dashes): one set serves every view turn.
import { THREE, kit, placeOnFootprint, bakeObject } from './common.js';
import { cycleD2, cycleKeys, d2Api } from './flatRides.js';
import { M, V, rod, std, rep } from '../kit.js';
import { person, randomLook } from '../people.js';
import { KIDDIE, kiddieAngles } from './spinnerMotion.js';

/** Angle slots per repeat (half a turn). */
export const PERIOD = KIDDIE.period;
const TAU = Math.PI * 2;
const N = KIDDIE.n;
const ROAD_IN = 2.85;
const ROAD_OUT = 4.95;
const LANE = KIDDIE.lane; // vehicle centres
const ROAD_Y = 0.4;

const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
const box = (w, h, d, mat, x, y, z) => M(new THREE.BoxGeometry(w, h, d), mat).translateX(x).translateY(y).translateZ(z);

function ringMesh(r0, r1, y, mat, seg = 96, start = 0, len = TAU) {
  const m = M(new THREE.RingGeometry(r0, r1, seg, 1, start, len), mat, false, true);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

/** A vehicle, nose towards +z, origin on the road under its middle. kind 0 roadster, 1 bus, 2 jeep. */
function vehicle(K, kind, color, looks) {
  const { mat } = K;
  const g = new THREE.Group();
  const body = paint(color);
  const white = paint('#f4f2ec');
  const chrome = mat.stainless;
  const tyre = std({ color: '#1e1f22', roughness: 0.85 });
  const W = 1.04, L = 1.75;
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 20);
  const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.15, 14);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = M(wheelGeo, tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * (W / 2 - 0.02), 0.2, sz * 0.56);
    g.add(w);
    const c = M(capGeo, chrome);
    c.rotation.z = Math.PI / 2;
    c.position.copy(w.position);
    g.add(c);
  }
  // chassis and the lower body
  g.add(box(W - 0.2, 0.12, L - 0.2, mat.darkSteel, 0, 0.24, 0));
  const lowH = kind === 1 ? 0.42 : 0.36;
  g.add(box(W, lowH, L, body, 0, 0.3 + lowH / 2, 0));
  // mudguards over the wheels
  const guardGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 16, 1, true, -Math.PI / 2, Math.PI);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const gd = M(guardGeo, kind === 1 ? white : body);
    gd.rotation.z = Math.PI / 2;
    gd.position.set(sx * (W / 2 - 0.02), 0.32, sz * 0.56);
    g.add(gd);
  }
  // headlights and a grille at the front, a bumper at each end
  for (const sx of [-1, 1]) {
    const hl = M(new THREE.SphereGeometry(0.07, 12, 8), std({ color: '#fff3c4', emissive: '#ffe9a0', emissiveIntensity: 0.25, roughness: 0.2 }));
    hl.position.set(sx * 0.3, 0.56, L / 2 + 0.02);
    g.add(hl);
  }
  g.add(box(0.36, 0.2, 0.03, chrome, 0, 0.5, L / 2 + 0.01));
  for (const sz of [-1, 1]) g.add(box(W + 0.04, 0.06, 0.06, chrome, 0, 0.32, sz * (L / 2 + 0.03)));
  const seatM = std({ color: kind === 2 ? '#3a2a20' : '#f2ead8', roughness: 0.7 });
  const top = 0.3 + lowH;
  if (kind === 0) {
    // roadster: a long bonnet, a raked windscreen, a bench seat with a rolled back
    g.add(box(W - 0.06, 0.12, 0.62, body, 0, top + 0.06, 0.52));
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe3ec', roughness: 0.05, transparent: true, opacity: 0.45 });
    const ws = box(W - 0.2, 0.28, 0.02, glass, 0, top + 0.26, 0.2);
    ws.rotation.x = -0.35;
    g.add(ws);
    g.add(box(W - 0.2, 0.03, 0.03, chrome, 0, top + 0.4, 0.16));
    g.add(box(W - 0.16, 0.3, 0.12, seatM, 0, top + 0.12, -0.58));
  } else if (kind === 1) {
    // open-sided bus: four posts, a white roof with a sign board, two rows of benches
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rod(V(sx * 0.44, top, sz * 0.78), V(sx * 0.44, top + 0.78, sz * 0.78), 0.025, chrome, 6));
    g.add(box(W + 0.06, 0.07, L + 0.06, white, 0, top + 0.81, 0));
    g.add(box(W - 0.1, 0.16, 0.04, std({ color: '#f5d03b', roughness: 0.5 }), 0, top + 0.92, L / 2 - 0.04));
    g.add(box(W - 0.1, 0.34, 0.04, body, 0, top + 0.17, L / 2 - 0.02));
    g.add(box(W - 0.16, 0.26, 0.1, seatM, 0, top + 0.12, -0.55));
  } else {
    // jeep: a flat bonnet with a spare wheel on the back and a roll bar
    g.add(box(W - 0.06, 0.08, 0.56, body, 0, top + 0.04, 0.55));
    const spare = M(wheelGeo, tyre);
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, top + 0.05, -L / 2 - 0.08);
    g.add(spare);
    for (const sx of [-1, 1]) g.add(rod(V(sx * 0.44, top, -0.38), V(sx * 0.44, top + 0.62, -0.38), 0.03, mat.darkSteel, 8));
    g.add(rod(V(-0.44, top + 0.62, -0.38), V(0.44, top + 0.62, -0.38), 0.03, mat.darkSteel, 8));
    g.add(box(W - 0.16, 0.28, 0.1, seatM, 0, top + 0.12, -0.6));
  }
  // steering wheel
  const sw = M(new THREE.TorusGeometry(0.11, 0.018, 6, 18), mat.darkSteel);
  sw.position.set(0.22, top + 0.22, 0.12);
  sw.rotation.x = -0.9;
  g.add(sw);
  g.add(rod(V(0.22, top + 0.02, 0.24), V(0.22, top + 0.2, 0.13), 0.015, mat.darkSteel, 6));
  // two children side by side
  const riders = [];
  for (let k = 0; k < 2; k++) {
    const p = person(looks[k], { kind: 'ride', legsHidden: true });
    p.position.set(k ? -0.22 : 0.22, top - 0.02, -0.34);
    g.add(p);
    riders.push(p);
  }
  return { g, riders };
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  // static ground: plinth, lawn apron, ring road with edge lines and lane dashes, grassy island
  root.add(M(new THREE.CylinderGeometry(5.8, 5.9, 0.24, 72), mat.concrete).translateY(0.12));
  const lawn = std({ map: rep(K.tx.grass.map, 3), bumpMap: rep(K.tx.grass.bump, 3), bumpScale: 1.2, roughness: 0.95 });
  root.add(M(new THREE.CylinderGeometry(5.7, 5.7, 0.1, 72), lawn).translateY(0.29));
  const road = M(new THREE.CylinderGeometry(ROAD_OUT, ROAD_OUT, 0.08, 96), std({ map: rep(K.tx.asphalt.map, 4), bumpMap: rep(K.tx.asphalt.bump, 4), bumpScale: 0.8, roughness: 0.9 }));
  road.position.y = ROAD_Y - 0.04;
  root.add(road);
  const line = std({ color: '#f2f2ee', roughness: 0.6 });
  root.add(ringMesh(ROAD_OUT - 0.18, ROAD_OUT - 0.1, ROAD_Y + 0.003, line));
  root.add(ringMesh(ROAD_IN + 0.12, ROAD_IN + 0.2, ROAD_Y + 0.003, line));
  for (let k = 0; k < 16; k += 2) root.add(ringMesh(LANE - 0.05, LANE + 0.05, ROAD_Y + 0.003, line, 12, (k / 16) * TAU + TAU / 64, TAU / 32));
  root.add(M(new THREE.CylinderGeometry(ROAD_IN + 0.05, ROAD_IN + 0.05, 0.16, 72), mat.kerb).translateY(ROAD_Y + 0.0));
  root.add(M(new THREE.CylinderGeometry(ROAD_IN - 0.05, ROAD_IN - 0.05, 0.18, 72), lawn).translateY(ROAD_Y + 0.02));
  root.add(M(new THREE.TorusGeometry(ROAD_OUT + 0.04, 0.07, 6, 96), mat.kerb).rotateX(Math.PI / 2).translateZ(-ROAD_Y));
  // picket fence (64 pickets, two rails)
  const fenceM = std({ color: '#f7f5ef', roughness: 0.6, map: K.tx.paint.map });
  const picket = new THREE.BoxGeometry(0.07, 0.62, 0.025);
  const pk = new THREE.InstancedMesh(picket, fenceM, 64);
  pk.castShadow = true; pk.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU;
    q.setFromAxisAngle(V(0, 1, 0), -a + Math.PI / 2);
    m4.compose(V(Math.cos(a) * 5.5, 0.34 + 0.31, Math.sin(a) * 5.5), q, V(1, 1, 1));
    pk.setMatrixAt(i, m4);
  }
  root.add(pk);
  for (const y of [0.5, 0.82]) root.add(M(new THREE.TorusGeometry(5.48, 0.022, 4, 128), fenceM).rotateX(Math.PI / 2).translateZ(-y));

  // turning drum, sweep arms and vehicles
  const spin = new THREE.Group();
  root.add(spin);
  spin.add(M(new THREE.CylinderGeometry(0.75, 0.82, 0.5, 40), paint('#2fb39a')).translateY(ROAD_Y + 0.27));
  spin.add(M(new THREE.CylinderGeometry(0.78, 0.78, 0.06, 40), mat.stainless).translateY(ROAD_Y + 0.54));
  const designs = [[0, '#e8503a'], [1, '#3d9be0'], [2, '#f5d03b']];
  const looks = [0, 1, 2].map((c) => [
    randomLook(1301 + c * 5, { child: true, balloon: null, backpack: null, bag: null }),
    randomLook(1303 + c * 5, { child: true, balloon: null, backpack: null, bag: null }),
  ]);
  const armM = paint('#f4f2ec');
  const riders = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU;
    const holder = new THREE.Group(); // local x points out from the centre
    holder.rotation.y = -th;
    spin.add(holder);
    const [kind, color] = designs[i % 3];
    const v = vehicle(K, kind, color, looks[i % 3]);
    v.g.position.set(LANE, ROAD_Y, 0);
    v.g.rotation.y = Math.PI; // nose along the travel (toward decreasing angle, the holder's -z)
    holder.add(v.g);
    riders.push(...v.riders);
    // sweep: a tube from the drum to the vehicle's inner side, with a brace
    holder.add(rod(V(0.78, ROAD_Y + 0.42, 0), V(LANE - 0.55, ROAD_Y + 0.5, 0), 0.05, armM, 10));
    holder.add(rod(V(0.8, ROAD_Y + 0.18, 0), V(1.9, ROAD_Y + 0.46, 0), 0.03, mat.stainless, 8));
    holder.add(box(0.12, 0.2, 0.3, mat.darkSteel, LANE - 0.52, ROAD_Y + 0.46, 0));
  }

  // static centre: banded pole, striped canopy with a valance, bulbs and pennants, a gold ball on a short mast
  root.add(M(new THREE.CylinderGeometry(0.16, 0.18, 4.6, 24), paint('#f4f4f4')).translateY(ROAD_Y + 2.3));
  const teal = paint('#2fb39a');
  for (let k = 0; k < 4; k++) root.add(M(new THREE.CylinderGeometry(0.185, 0.185, 0.32, 24), teal).translateY(ROAD_Y + 1.1 + k * 0.85));
  const stripeCols = ['#4fbf63', '#f7f5ef', '#f5d03b', '#f7f5ef'].map((c) => std({ color: c, roughness: 0.65, side: THREE.DoubleSide }));
  const CANOPY_Y = 4.75;
  for (let k = 0; k < 16; k++) {
    const cone = M(new THREE.ConeGeometry(2.6, 1.15, 4, 1, true, (k / 16) * TAU, TAU / 16), stripeCols[k % 4]);
    cone.position.y = CANOPY_Y + 0.575;
    root.add(cone);
    const val = M(new THREE.CylinderGeometry(2.6, 2.6, 0.32, 4, 1, true, (k / 16) * TAU, TAU / 16), stripeCols[(k + 2) % 4]);
    val.position.y = CANOPY_Y - 0.16;
    root.add(val);
  }
  root.add(M(new THREE.TorusGeometry(2.6, 0.03, 6, 96), mat.brass).rotateX(Math.PI / 2).translateZ(-CANOPY_Y));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), K.ringBulb, 32);
  for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; m4.makeTranslation(Math.cos(a) * 2.64, CANOPY_Y - 0.33, Math.sin(a) * 2.64); bulbs.setMatrixAt(i, m4); }
  root.add(bulbs);
  const pennCols = ['#e8503a', '#3d9be0', '#f5d03b', '#8d5ad8'].map((c) => std({ color: c, roughness: 0.7, side: THREE.DoubleSide }));
  const penn = new THREE.BufferGeometry().setFromPoints([V(-0.14, 0, 0), V(0.14, 0, 0), V(0, -0.3, 0)]);
  penn.computeVertexNormals();
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.5) / 16) * TAU;
    const p = M(penn, pennCols[i % 4], true, false);
    p.position.set(Math.cos(a) * 2.63, CANOPY_Y - 0.33, Math.sin(a) * 2.63);
    p.rotation.y = -a + Math.PI / 2;
    root.add(p);
  }
  root.add(M(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 10), mat.brass).translateY(CANOPY_Y + 1.15 + 0.45));
  root.add(M(new THREE.SphereGeometry(0.17, 20, 14), mat.gold).translateY(CANOPY_Y + 1.15 + 0.9 - 0.02));

  const pose = (a, full) => {
    spin.rotation.y = kiddieAngles(a).spin;
    for (const r of riders) r.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = cycleKeys('kiddie_cars', { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`);
    cycleD2('kiddie_cars', groups, { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`, KIDDIE.d2Step);
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, keys2: g.keys2, pose: () => m.pose(g.angle / 32, g.full) }));
    B.log(`kiddie_cars: ${pictures.length} pictures`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'kiddie_cars', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
