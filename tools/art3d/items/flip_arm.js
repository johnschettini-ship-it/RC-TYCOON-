// Flip Arm (thrill flat ride, 3 x 3 tiles = 12 x 12 m): a red column with yellow bands carries a drive housing
// 7 m up; from it an orange arm turns right over in one vertical plane, a red counterweight drum with yellow faces
// on its short end and, on its long end, a gondola cantilevered to one side: two back-to-back rows of eight seats (16 riders,
// the catalogue's capacity) with yellow over-the-shoulder restraints, the riders upright at rest and upside down at
// the top. At rest the gondola hangs just above an open boarding deck; steps and gates at the sim's entrance
// (front) and exit (back) tiles; no ground pad.
// Motion (items/swingers.js): today's arm angle phi = TAU * slot / 32, one turn per 32 angle slots (cycleKeys,
// period 32: the arm is one-sided); 8 arm angles 45 degrees apart (size rule). Not round (the arm turns in one
// plane beside the column), so one set per sprite rotation (rots [0,1,2,3]); see NON_ROUND in items/flatRides.js.
// Model frame: the arm turns about the z axis; the column stands behind it (-z), the gondola reaches out to +z.
// Colour part: the gondola, its red seat-back panels (the yellow restraints and orange joint keep theirs); base #c43a24.
import { THREE, kit, placeOnFootprint, bakeObject, colourMesh, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V } from '../kit.js';
import { person, randomLook } from '../people.js';
import { flipKeys, flipPhi, GATES } from './swingers.js';
import { paint, plastic, tube, boxBeam, boxAt, stairs, deck, railing, peakHeight, deckPlate, gate } from './swingParts.js';

const HUB_Y = 7.0;
/** The gondola's red (the same paint as the column and drum, which keep theirs). */
const BASE_COLOUR = '#c43a24';
const R = 5.0; // hub to the gondola spine
const CW = 2.6; // hub to the counterweight
const ARM_Z = -0.95; // plane of the arm
const COL_Z = -2.9; // column
const G_Z0 = -0.95, G_Z1 = 3.8; // gondola spine, along z
const SEATS = 8; // per row

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const plate = deckPlate();
  const red = paint(K, '#c43a24');
  const orange = paint(K, '#f08a28');
  const yellow = plastic('#f5c518', 0.35);
  const seatMat = plastic('#2a2624', 0.55);

  // ---- ground (no pad, the park's ground shows): the open boarding deck under the gondola. Guests come in through
  // the entrance gate on the front row's centre tile (GATES) and up the deck's front steps; they leave by the +x
  // steps and walk round to the exit gate behind the column (the back row's centre tile). Railings only beside the
  // front steps: the gondola sweeps low over the deck's sides.
  const deckTop = 0.95;
  const dz0 = -0.6, dz1 = 3.95;
  const signIn = paint(K, '#2f7d3a'), signOut = paint(K, '#7a2a1c');
  root.add(deck(K, { x0: -1.7, x1: 1.7, z0: dz0, z1: dz1, top: deckTop, boards: plate, steel: mat.darkSteel }));
  root.add(stairs(K, { axis: 'z', dir: 1, at: [GATES.flip_arm.entrance[0], dz1], top: deckTop, width: 1.5, n: 2, run: 0.32, tread: plate, steel: mat.darkSteel }));
  root.add(stairs(K, { axis: 'x', dir: 1, at: [1.7, 1.55], top: deckTop, width: 1.5, n: 2, run: 0.32, tread: plate, steel: mat.darkSteel }));
  for (const s of [-1, 1]) root.add(railing([[s * 1.7, dz1], [s * 0.85, dz1]], deckTop, mat.stainless));
  root.add(gate(GATES.flip_arm.entrance, mat.stainless, signIn));
  root.add(gate(GATES.flip_arm.exit, mat.stainless, signOut));

  // ---- the column: tapered, three yellow bands, two side struts and a back strut, the drive housing on top
  root.add(boxAt(2.0, 0.5, 2.0, 0, 0.25, COL_Z, mat.concrete));
  root.add(tube(V(0, 0.5, COL_Z), V(0, HUB_Y - 0.3, COL_Z), 0.72, 0.5, red, 28));
  for (let k = 0; k < 3; k++) {
    const y = 1.8 + k * 1.5, r = 0.72 + (0.5 - 0.72) * ((y - 0.5) / (HUB_Y - 0.8));
    root.add(M(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.4, 28), yellow).translateY(y).translateZ(COL_Z));
  }
  for (const s of [-1, 1]) {
    root.add(tube(V(s * 2.4, 0.4, COL_Z), V(s * 0.45, HUB_Y - 2.6, COL_Z), 0.17, 0.13, red, 12));
    root.add(boxAt(0.7, 0.4, 0.7, s * 2.4, 0.2, COL_Z, mat.concrete));
  }
  for (const s of [-1, 1]) { // two back struts, clear of the exit gate between their feet
    root.add(tube(V(s * 1.5, 0.4, -4.9), V(s * 0.3, HUB_Y - 3.0, COL_Z - 0.4), 0.15, 0.12, red, 12));
    root.add(boxAt(0.6, 0.4, 0.6, s * 1.5, 0.2, -4.9, mat.concrete));
  }
  root.add(boxAt(1.5, 1.5, 1.6, 0, HUB_Y, -2.6, red)); // drive housing
  root.add(boxAt(1.56, 0.12, 1.66, 0, HUB_Y + 0.8, -2.6, yellow));
  root.add(tube(V(0, HUB_Y, -1.8), V(0, HUB_Y, ARM_Z - 0.2), 0.34, 0.34, mat.darkSteel, 20)); // axle

  // ---- the arm (turns about z through the hub)
  const arm = new THREE.Group();
  arm.position.set(0, HUB_Y, 0);
  root.add(arm);
  const hub = M(new THREE.CylinderGeometry(0.8, 0.8, 0.55, 28), orange);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = ARM_Z;
  arm.add(hub);
  const cap = M(new THREE.CylinderGeometry(0.45, 0.45, 0.62, 24), mat.darkSteel);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = ARM_Z;
  arm.add(cap);
  for (const s of [-1, 1]) arm.add(boxBeam(V(s * 0.22, CW, ARM_Z), V(s * 0.16, -R + 0.1, ARM_Z), 0.18, 0.5, orange));
  for (let k = 0; k < 6; k++) {
    const y = CW - 0.4 - k * ((CW + R - 0.9) / 5);
    arm.add(boxAt(0.5, 0.12, 0.42, 0, y, ARM_Z, mat.darkSteel));
  }
  // counterweight drum: red, yellow faces
  const drum = M(new THREE.CylinderGeometry(0.95, 0.95, 0.8, 32), red);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0, CW, ARM_Z);
  arm.add(drum);
  for (const s of [-1, 1]) {
    const face = M(new THREE.CylinderGeometry(0.8, 0.8, 0.04, 32), yellow);
    face.rotation.x = Math.PI / 2;
    face.position.set(0, CW, ARM_Z + s * 0.42);
    arm.add(face);
  }

  // gondola: spine along z at the arm end, two rows of seats facing +x and -x, restraints, footrests
  const g = new THREE.Group();
  g.position.y = -R;
  arm.add(g);
  g.add(boxAt(0.5, 0.5, G_Z1 - G_Z0, 0, 0, (G_Z0 + G_Z1) / 2, mat.darkSteel));
  g.add(boxAt(0.62, 0.62, 0.7, 0, 0, ARM_Z, orange)); // joint to the arm
  const zs = Array.from({ length: SEATS }, (_, i) => -0.35 + i * 0.55);
  const riders = [];
  let seed = 680;
  for (const s of [-1, 1]) {
    g.add(colourMesh(boxAt(0.3, 1.0, G_Z1 - G_Z0 - 0.4, s * 0.3, 0.05, (G_Z0 + G_Z1) / 2 + 0.2, red))); // seat-back panel (the column's red keeps its own)
    for (const z of zs) {
      g.add(boxAt(0.5, 0.1, 0.46, s * 0.62, -0.38, z, seatMat)); // seat pan
      g.add(boxAt(0.08, 0.85, 0.44, s * 0.48, 0.02, z, seatMat)); // backrest
      // over-the-shoulder restraint: two shoulder bars curving down to a belly pad
      for (const dz of [-0.16, 0.16]) {
        const a = V(s * 0.5, 0.45, z + dz), b = V(s * 0.82, 0.12, z + dz), c = V(s * 0.9, -0.2, z + dz);
        g.add(tube(a, b, 0.04, 0.04, yellow, 8));
        g.add(tube(b, c, 0.04, 0.04, yellow, 8));
      }
      g.add(boxAt(0.14, 0.18, 0.4, s * 0.92, -0.2, z, yellow));
      const p = person(randomLook(seed++, { balloon: null, backpack: null, bag: null }), { kind: 'ride' });
      p.position.set(s * 0.66, -0.33, z);
      p.rotation.y = s * Math.PI / 2; // face out (+x or -x)
      g.add(p);
      riders.push(p);
    }
    g.add(tube(V(s * 0.95, -0.85, G_Z0 + 0.3), V(s * 0.95, -0.85, G_Z1 - 0.1), 0.04, 0.04, mat.stainless, 8)); // footrest
    for (const z of [G_Z0 + 0.3, (G_Z0 + G_Z1) / 2, G_Z1 - 0.1]) g.add(tube(V(s * 0.3, -0.3, z), V(s * 0.95, -0.85, z), 0.035, 0.035, mat.stainless, 6));
  }
  const pose = (phi, full) => {
    arm.rotation.z = phi; // (0, -1) -> (sin, -cos): today's gondola at r sin(phi), hub - r cos(phi)
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = flipKeys();
    const pictures = [...groups.entries()].map(([id, gr]) => {
      const slot = Number(id.split(':')[0]);
      return { keys: gr.keys, keys2: gr.keys2, pose: () => m.pose(flipPhi(slot), gr.full) };
    });
    B.log(`flip_arm: ${pictures.length} pictures per rotation, peak ${peakHeight(m.root, pictures).toFixed(2)} m (spec ${B.input.spec.heightM} m)`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'flip_arm', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
