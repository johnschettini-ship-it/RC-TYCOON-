// Loop Swing (thrill flat ride, 3 x 4 tiles = 12 x 16 m, 16 m): two red A-frame towers carry an 8.3 m axle across the
// footprint; from it a long steel arm swings a gondola in the footprint's long (z) plane: two rows of eight seats back
// to back across the arm's end (16 riders, the catalogue's capacity), facing front and back, with yellow shoulder
// bars, and on the arm's short end a counterweight drum. At rest the gondola hangs just above an open boarding deck;
// a low entrance gate on the front row and an exit gate on the back row of the centre column (LOOP_GATES).
// Motion (items/ridesB.js loopKeys, today's LOOP_STEPS): 16 time steps per turn: three swings, each higher than the
// last, then the arm goes all the way over the top; 9 arm angles full and one at rest. The arm turns in one plane:
// rots [0, 1, 2, 3] (NON_ROUND).
// Colour part: the gondola, its orange shell (floor pan and end plates; the seats, bars and arm keep theirs); base #e2582c.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { rider } from '../rides.js';
import { loopKeys, loopAngle, LOOP_GATES } from './ridesB.js';

/** The gondola shell's orange (#e2582c). */
const BASE_COLOUR = '#e2582c';
const AXLE_Y = 8.3;
const ARM = 6.0;
const TOWER_X = 3.1;
const SEATS = 8;

const box = (w, h, d, x, y, z, mat) => M(new THREE.BoxGeometry(w, h, d), mat).translateX(x).translateY(y).translateZ(z);

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const paint = (color) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const red = paint('#b8352a');
  const grey = paint('#3a3f45');
  const yellow = paint('#f5c518');
  const shell = colourPart(paint('#e2582c'));
  const seatMat = std({ color: '#262626', roughness: 0.6 });
  const plate = std({ color: '#8f8a82', roughness: 0.85, metalness: 0.15 });
  // ground: a slab under the towers, the boarding deck with front steps, a walkway to each gate, the gates
  root.add(box(11.8, 0.2, 9.0, 0, 0.1, 0, mat.concrete));
  root.add(box(5.8, 0.08, 3.0, 0, 1.0, 0, plate));
  for (const [x, z] of [[-2.8, -1.4], [2.8, -1.4], [-2.8, 1.4], [2.8, 1.4]]) root.add(rod(V(x, 0.2, z), V(x, 0.96, z), 0.06, mat.darkSteel, 8));
  for (let i = 0; i < 3; i++) root.add(box(1.6, 0.06, 0.32, 0, 0.25 + i * 0.25, 1.6 + (2 - i) * 0.32, plate));
  root.add(box(1.6, 0.04, 5.6, 0, 0.04, 4.9, mat.paversGrey));
  root.add(box(1.6, 0.04, 3.4, 0, 0.04, -5.9, mat.paversGrey));
  for (const s of [-1, 1]) root.add(rod(V(s * 2.9, 1.04, -1.45), V(s * 2.9, 1.04, 1.45), 0.03, mat.stainless, 6));
  const signIn = paint('#2f7d3a'), signOut = paint('#7a2a1c');
  for (const [[gx, gz], sign] of [[LOOP_GATES.entrance, signIn], [LOOP_GATES.exit, signOut]]) {
    for (const s of [-1, 1]) root.add(rod(V(gx + s * 0.75, 0, gz), V(gx + s * 0.75, 1.15, gz), 0.05, mat.stainless, 8));
    root.add(rod(V(gx - 0.75, 1.05, gz), V(gx + 0.75, 1.05, gz), 0.035, mat.stainless, 8));
    root.add(box(1.0, 0.3, 0.05, gx, 1.25, gz, sign));
  }
  // the towers: A-frames on footings, a cross brace, bearing housings and the axle
  for (const s of [-1, 1]) {
    const top = V(s * TOWER_X, AXLE_Y, 0);
    for (const z of [-3.6, 3.6]) {
      root.add(rod(V(s * (TOWER_X + 0.5), 0.2, z), top, 0.24, red, 14));
      root.add(box(1.0, 0.4, 1.0, s * (TOWER_X + 0.5), 0.2, z, mat.concrete));
    }
    root.add(rod(V(s * (TOWER_X + 0.3), 3.2, -2.25), V(s * (TOWER_X + 0.3), 3.2, 2.25), 0.12, red, 10));
    const bearing = M(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 24), grey);
    bearing.rotation.z = Math.PI / 2;
    bearing.position.copy(top);
    root.add(bearing);
    root.add(M(new THREE.SphereGeometry(0.2, 14, 10), K.bulb('#fff1b0', 1.2, 9)).translateX(s * TOWER_X).translateY(AXLE_Y + 0.65));
  }
  root.add(rod(V(-TOWER_X, AXLE_Y, 0), V(TOWER_X, AXLE_Y, 0), 0.28, mat.darkSteel, 20));
  // the arm (turns about x through the axle)
  const arm = new THREE.Group();
  arm.position.y = AXLE_Y;
  root.add(arm);
  for (const s of [-1, 1]) arm.add(box(0.22, ARM + 2.4, 0.5, s * 0.4, (2.4 - ARM) / 2, 0, grey));
  for (let k = 0; k < 6; k++) arm.add(box(0.6, 0.12, 0.42, 0, 2.0 - k * 1.5, 0, mat.darkSteel));
  const drum = M(new THREE.CylinderGeometry(0.95, 0.95, 1.1, 32), yellow);
  drum.rotation.z = Math.PI / 2;
  drum.position.y = 2.4;
  arm.add(drum);
  const hub = M(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 28), red);
  hub.rotation.z = Math.PI / 2;
  arm.add(hub);
  // the gondola at the arm's end: a spine across x, seats both sides (facing +z and -z), the orange shell
  const g = new THREE.Group();
  g.position.y = -ARM;
  arm.add(g);
  g.add(box(5.0, 0.5, 0.5, 0, 0, 0, mat.darkSteel));
  g.add(box(5.2, 0.12, 2.1, 0, -0.62, 0, shell)); // floor pan
  for (const s of [-1, 1]) g.add(box(0.12, 1.5, 2.1, s * 2.62, -0.05, 0, shell)); // end plates
  g.add(box(1.0, 0.9, 0.7, 0, 0.6, 0, red)); // the joint to the arm
  const riders = [];
  const xs = Array.from({ length: SEATS }, (_, i) => -2.1 + (i * 4.2) / (SEATS - 1));
  let seed = 2100;
  for (const side of [-1, 1]) {
    for (const x of xs) {
      g.add(box(0.46, 0.08, 0.5, x, -0.35, side * 0.55, seatMat));
      g.add(box(0.44, 0.85, 0.08, x, 0.05, side * 0.3, seatMat));
      for (const dx of [-0.15, 0.15]) g.add(rod(V(x + dx, 0.45, side * 0.32), V(x + dx, -0.15, side * 0.85), 0.04, yellow, 6));
      const p = rider(K, seed++, { kind: 'ride' });
      p.position.set(x, -0.32, side * 0.5);
      p.rotation.y = side > 0 ? 0 : Math.PI; // faces out of the arm's plane (+z or -z)
      g.add(p);
      riders.push(p);
    }
  }
  const pose = (deg, full) => {
    arm.rotation.x = (-deg * Math.PI) / 180; // + swings the gondola towards +z (the front)
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = loopKeys();
    const pictures = [...groups.entries()].map(([id, gr]) => ({ keys: gr.keys, keys2: gr.keys2, pose: () => m.pose(id === 'rest' ? 0 : Number(id.slice(1)), gr.full) }));
    B.log(`loop_swing: ${pictures.length} pictures per rotation`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'loop_swing', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
