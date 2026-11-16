// Drop Tower (thrill flat ride, 2 x 2 tiles, 26 m): a square red steel column with yellow bands, chase lights and
// magnetic brake fins, a winch head with a gold star on top, and a square yellow carriage round the column with 12
// open seats (three a side, riders facing out, legs hanging, shoulder bars). Once per turn the carriage climbs
// slowly, holds at the top, drops and brakes at the bottom: today's `dropProfile(angle)`. The motion is not a
// rotation, so the 16 even angle slots are 16 time steps (towerMotion.js timeKeys); the game turns 2 turns per run
// (REVOLUTIONS default), so the carriage drops twice per run and ends at the bottom. Steps at the same height share
// a picture (11 heights, towerMotion.js DROP_SNAP); empty, the ride is at rest (the game runs a ride only with riders): one picture. Front
// (entrance at the front, exit at the back, both on the sim's gate column, towerMotion.js TOWER_GATES): one set per view turn.
// Colour part: the carriage, its orange top band (what shows above the seats) with its yellow sides and restraint bars as a lighter shade; base #e4652f.
import { THREE, kit, placeOnFootprint, bakeObject, colourMesh, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { rider } from '../rides.js';
import { HEIGHT_Q, heightStep, towerKeys, TOWER_GATES } from './towerMotion.js';

const G = TOWER_GATES.drop_tower;

const COL = 1.1; // column side
const COL_TOP = 23.6;
const SEAT_REST = 1.55; // seat pan height at rest (feet clear the deck)
/**
 * The carriage's orange: its top band is most of what shows of the carriage (the seats cover its yellow sides), so a
 * first mask of the yellow alone covered 2% of the picture. The yellow (#f4b92e, luma 188 of the orange's 124) takes
 * the chosen colour 1.5x lighter. The plinth's orange and the column's yellow are other copies and keep theirs.
 */
const BASE_COLOUR = '#e4652f';
const SEAT_TRAVEL = 19.9; // seat pan at 21.45 m at the top; the carriage stays under the head

function starGeometry(r0, r1, depth) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 ? r1 : r0;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  // plain paint (no texture) on the tall parts: the column is in every picture, and texture noise costs bytes
  const red = new THREE.MeshPhysicalMaterial({ color: '#c3302a', metalness: 0.35, roughness: 0.42, clearcoat: 0.6 });
  const orange = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#e4652f', metalness: 0.3, roughness: 0.45, clearcoat: 0.5 });
  const yellow = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#f4b92e', metalness: 0.3, roughness: 0.4, clearcoat: 0.6 });
  const copper = std({ color: '#b5713f', metalness: 0.9, roughness: 0.35 });
  // pad, deck, railing with the entrance at the front (+z) and the exit at the back
  root.add(M(new THREE.BoxGeometry(7.7, 0.25, 7.7), mat.concrete).translateY(0.125));
  root.add(M(new THREE.BoxGeometry(6.9, 0.1, 6.9), mat.deck).translateY(0.3));
  const H = 3.3;
  const railSeg = (a, b) => {
    root.add(rod(a, a.clone().setY(1.4), 0.03, mat.stainless, 6));
    root.add(rod(b, b.clone().setY(1.4), 0.03, mat.stainless, 6));
    root.add(rod(a.clone().setY(1.4), b.clone().setY(1.4), 0.032, mat.stainless, 6));
    root.add(rod(a.clone().setY(0.88), b.clone().setY(0.88), 0.02, mat.stainless, 6));
  };
  // the square's sides, corner to corner; the front (+z) and back sides open on the sim's gate column (TOWER_GATES)
  // with a GAP-wide entrance and exit, the rest in posts about 1.3 m apart
  const GAP = 1.32;
  const run = (p, q) => {
    const n = Math.max(1, Math.round(p.distanceTo(q) / 1.32));
    for (let k = 0; k < n; k++) railSeg(p.clone().lerp(q, k / n), p.clone().lerp(q, (k + 1) / n));
  };
  run(V(-H, 0.35, H), V(-H, 0.35, -H));
  run(V(H, 0.35, H), V(H, 0.35, -H));
  for (const [gx, gz] of [G.entrance, G.exit]) {
    run(V(-H, 0.35, gz), V(gx - GAP / 2, 0.35, gz));
    run(V(gx + GAP / 2, 0.35, gz), V(H, 0.35, gz));
  }
  // entrance and exit arches over the gaps, with a sign board (the exit's is smaller, white)
  for (const [k, [gx, gz]] of [G.entrance, G.exit].entries()) {
    for (const s of [-1, 1]) root.add(M(new THREE.BoxGeometry(0.16, 2.6, 0.16), red).translateX(gx + s * 0.66).translateY(1.6).translateZ(gz));
    root.add(k === 0 ? M(new THREE.BoxGeometry(1.7, 0.4, 0.12), yellow).translateX(gx).translateY(2.8).translateZ(gz) : M(new THREE.BoxGeometry(1.4, 0.3, 0.1), mat.steelWhite).translateX(gx).translateY(2.75).translateZ(gz));
  }
  // machine housing at the foot of the column
  root.add(M(new THREE.BoxGeometry(2.3, 1.05, 2.3), orange).translateY(0.35 + 0.525));
  root.add(M(new THREE.BoxGeometry(2.4, 0.08, 2.4), mat.darkSteel).translateY(1.44));
  // column, bands, corner guide rails, brake fins, chase lights
  root.add(M(new THREE.BoxGeometry(COL, COL_TOP - 1.4, COL), red).translateY(1.4 + (COL_TOP - 1.4) / 2));
  for (let y = 4.4; y < COL_TOP - 1; y += 3.3) root.add(M(new THREE.BoxGeometry(COL + 0.05, 0.4, COL + 0.05), yellow).translateY(y));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    root.add(M(new THREE.BoxGeometry(0.12, COL_TOP - 1.6, 0.12), mat.darkSteel).translateX(x * (COL / 2 + 0.03)).translateY(1.5 + (COL_TOP - 1.6) / 2).translateZ(z * (COL / 2 + 0.03)));
  }
  for (let f = 0; f < 4; f++) {
    const face = new THREE.Group();
    face.rotation.y = (f * Math.PI) / 2;
    root.add(face);
    for (const x of [-0.24, 0.24]) face.add(M(new THREE.BoxGeometry(0.04, 4.8, 0.2), copper).translateX(x).translateY(1.6 + 2.4).translateZ(COL / 2 + 0.1));
  }
  const chase = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), K.bulb('#ffe9a8', 0.8, 8), 4 * 16);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  let ci = 0;
  for (let f = 0; f < 4; f++) {
    q.setFromAxisAngle(V(0, 1, 0), (f * Math.PI) / 2);
    for (let k = 0; k < 16; k++) {
      const p = V(0, 2.2 + k * 1.32, COL / 2 + 0.04).applyQuaternion(q);
      m4.makeTranslation(p.x, p.y, p.z);
      chase.setMatrixAt(ci++, m4);
    }
  }
  root.add(chase);
  // winch head, beacon and the gold star
  root.add(M(new THREE.BoxGeometry(2.1, 1.3, 2.1), yellow).translateY(COL_TOP + 0.65));
  root.add(M(new THREE.BoxGeometry(2.25, 0.14, 2.25), red).translateY(COL_TOP + 1.37));
  root.add(M(new THREE.BoxGeometry(2.25, 0.14, 2.25), red).translateY(COL_TOP + 0.05));
  root.add(rod(V(0, COL_TOP + 1.44, 0), V(0, COL_TOP + 1.6, 0), 0.07, mat.darkSteel, 8));
  const star = M(starGeometry(0.45, 0.2, 0.12), mat.gold);
  star.position.y = COL_TOP + 1.9; // top at 26 m
  root.add(star);
  for (const [x, z] of [[-1, -1], [1, 1]]) root.add(M(new THREE.SphereGeometry(0.1, 10, 8), K.bulb('#ff3b2e', 1.4, 8)).translateX(x * 0.95).translateY(COL_TOP + 1.55).translateZ(z * 0.95));
  // the carriage: a square frame round the column, three open seats a side facing out
  const car = new THREE.Group();
  root.add(car);
  const IN = COL / 2 + 0.22, OUT = 1.75;
  const mid = (IN + OUT) / 2, wid = OUT - IN;
  for (let f = 0; f < 4; f++) {
    const side = new THREE.Group();
    side.rotation.y = (f * Math.PI) / 2;
    car.add(side);
    side.add(colourMesh(M(new THREE.BoxGeometry(2 * OUT, 0.55, wid), yellow)).translateY(0.62).translateZ(mid - 0.0001 * f));
    side.add(colourMesh(M(new THREE.BoxGeometry(2 * OUT + 0.04, 0.12, wid + 0.04), orange)).translateY(0.95).translateZ(mid));
    side.add(M(new THREE.BoxGeometry(0.5, 0.5, 0.22), mat.darkSteel).translateY(0.62).translateZ(IN - 0.1)); // guide shoe
  }
  const seatMat = std({ color: '#262626', roughness: 0.6 });
  const riders = [];
  let n = 0;
  for (let f = 0; f < 4; f++) {
    const side = new THREE.Group();
    side.rotation.y = (f * Math.PI) / 2;
    car.add(side);
    for (const x of [-1.1, 0, 1.1]) {
      const s = new THREE.Group();
      s.position.set(x, 0, OUT);
      side.add(s);
      s.add(M(new THREE.BoxGeometry(0.52, 1.05, 0.12), seatMat).translateY(0.62).translateZ(0.06));
      s.add(M(new THREE.BoxGeometry(0.5, 0.1, 0.4), seatMat).translateZ(0.3));
      s.add(M(new THREE.BoxGeometry(0.34, 0.2, 0.14), seatMat).translateY(1.2).translateZ(0.12)); // headrest
      for (const sd of [-1, 1]) {
        const bar = colourMesh(M(new THREE.BoxGeometry(0.06, 0.6, 0.07), yellow));
        bar.position.set(sd * 0.14, 0.5, 0.42);
        bar.rotation.x = 0.18;
        s.add(bar);
      }
      s.add(colourMesh(rod(V(-0.14, 0.22, 0.48), V(0.14, 0.22, 0.48), 0.035, yellow, 6)));
      const p = rider(K, 1400 + n, { kind: 'dangle', armsUp: n % 4 === 1 });
      p.position.set(0, 0.05, 0.22);
      s.add(p);
      riders.push(p);
      n++;
    }
  }
  const pose = (share, full) => {
    car.position.y = SEAT_REST + SEAT_TRAVEL * share;
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = towerKeys('drop_tower');
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, keys2: g.keys2, pose: () => m.pose(heightStep('drop_tower', g.angle >> 1) / HEIGHT_Q, g.full) }));
    B.log(`drop_tower: ${pictures.length} pictures per rotation`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'drop_tower', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
