// Chair Swing Twist (thrill flat ride, 3 x 3 tiles = 12 x 12 m, 14 m): a white steel column with red bands and a
// beacon on top; a sleeve slides up it carrying a gimballed top that tilts while it spins: a teal-and-cream striped
// cone with a scalloped valance and a bulb ring, and 12 double chair swings on 5 m chains (24 riders, the catalogue's
// capacity), yellow and orange in turn. At rest the top sits low so the chairs hang just above the round boarding
// deck. Running (items/ridesB.js twistPose, today's drawChairSwingTwist): the top climbs 4.5 m and leans up to 18
// degrees by the same share, sin² of the turn; the lean's heading goes round once per turn and the chairs spin 3
// times, thrown out 35 degrees, each chain hanging from its rim point towards the ground (not along the tilted top),
// so the ring of swings wobbles. Period 32 slots: 16 pictures full, one at rest. Round (a ring fence with four gaps,
// no front): one set serves every view turn (rot 'all').
// Colour part: the canopy, the teal stripes of its cone and valance (the cream stripes keep theirs); base #1e8f9c.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { rider } from '../rides.js';
import { stripes, stripesMask } from '../textures.js';
import { twistKeys, twistPose, TWIST } from './ridesB.js';

/** The canopy's teal (its stripes texture and valance). */
const BASE_COLOUR = '#1e8f9c'; // teal: the stripes are drawn in #1e8f9c and cream
const COLUMN_H = 13.2;
const REST_Y = 6.0; // the top's pivot at rest: chairs hang 1 m above the deck
const RISE = 4.5; // the climb at the peak
const RIM = 2.6; // chain points
const CHAIN = 5.0;
const N = TWIST.chairs;

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const paint = (color) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const white = paint('#eeebe4');
  const red = paint('#c4452c');
  const brown = paint('#5b4a3e');
  // ground: a round pad, the boarding deck and a low ring fence with four gaps (round: no front)
  root.add(M(new THREE.CylinderGeometry(5.95, 5.95, 0.25, 96), mat.concrete).translateY(0.125));
  root.add(M(new THREE.CylinderGeometry(5.6, 5.6, 0.06, 96), mat.deck).translateY(0.28));
  for (let q = 0; q < 4; q++) {
    for (let i = 0; i < 4; i++) {
      const a0 = (q / 4) * Math.PI * 2 + 0.22 + i * 0.27, a1 = a0 + 0.27;
      const p0 = V(Math.cos(a0) * 5.75, 0.3, Math.sin(a0) * 5.75), p1 = V(Math.cos(a1) * 5.75, 0.3, Math.sin(a1) * 5.75);
      root.add(rod(p0, p0.clone().setY(1.2), 0.04, mat.stainless, 6));
      if (i === 3) root.add(rod(p1, p1.clone().setY(1.2), 0.04, mat.stainless, 6));
      root.add(rod(p0.clone().setY(1.15), p1.clone().setY(1.15), 0.03, mat.stainless, 6));
    }
  }
  // the column: a drive housing at its foot, red bands, a beacon on top
  root.add(M(new THREE.CylinderGeometry(1.0, 1.25, 1.0, 40), red).translateY(0.8));
  root.add(M(new THREE.CylinderGeometry(0.38, 0.45, COLUMN_H - 1.3, 32), white).translateY(1.3 + (COLUMN_H - 1.3) / 2));
  for (let k = 0; k < 4; k++) root.add(M(new THREE.CylinderGeometry(0.47, 0.47, 0.35, 32), red).translateY(2.4 + k * 0.9));
  root.add(M(new THREE.CylinderGeometry(0.5, 0.42, 0.3, 32), red).translateY(COLUMN_H));
  root.add(M(new THREE.SphereGeometry(0.28, 20, 12), K.bulb('#fff1b0', 1.2, 9)).translateY(COLUMN_H + 0.4));
  // the lift: a sleeve that slides on the column (stays upright)
  const lift = new THREE.Group();
  root.add(lift);
  lift.add(M(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 32), brown).translateY(1.5));
  lift.add(M(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 32), mat.brass).translateY(2.1));
  // the gimbal: heading, lean, and the spinning top
  const head = new THREE.Group();
  lift.add(head);
  const lean = new THREE.Group();
  head.add(lean);
  const unhead = new THREE.Group();
  lean.add(unhead);
  const spin = new THREE.Group();
  unhead.add(spin);
  const coneTex = stripes(BASE_COLOUR, '#f2ead6', 24, false).map;
  const valTex = stripes(BASE_COLOUR, '#f2ead6', 24, true).map;
  const coneMat = colourPart(std({ map: coneTex, roughness: 0.6, side: THREE.DoubleSide }), stripesMask(24, false));
  const valMat = colourPart(std({ map: valTex, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide }), stripesMask(24, true));
  const cone = M(new THREE.CylinderGeometry(0.8, RIM + 0.35, 1.3, 72, 1, true), coneMat);
  cone.position.y = 0.75;
  spin.add(cone);
  spin.add(M(new THREE.CylinderGeometry(RIM + 0.33, RIM + 0.33, 0.05, 72), mat.cream).translateY(0.1));
  const val = M(new THREE.CylinderGeometry(RIM + 0.38, RIM + 0.38, 0.5, 72, 1, true), valMat);
  val.position.y = -0.1;
  spin.add(val);
  spin.add(M(new THREE.TorusGeometry(RIM + 0.4, 0.05, 8, 72), mat.brass).rotateX(Math.PI / 2).translateZ(-0.15));
  spin.add(M(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 32), mat.brass).translateY(1.42));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), K.ringBulb, 48);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * (RIM + 0.45), 0.13, Math.sin(a) * (RIM + 0.45)); bulbs.setMatrixAt(i, m4); }
  spin.add(bulbs);
  // chain points on the spinning top (markers), and the chairs, which hang from them towards the ground
  const seatMats = [new THREE.MeshPhysicalMaterial({ color: '#f0b323', roughness: 0.38, metalness: 0.15, clearcoat: 0.6 }), new THREE.MeshPhysicalMaterial({ color: '#e5672a', roughness: 0.38, metalness: 0.15, clearcoat: 0.6 })];
  const chairs = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const mark = new THREE.Object3D();
    mark.position.set(Math.cos(a) * RIM, -0.3, Math.sin(a) * RIM);
    spin.add(mark);
    spin.add(M(new THREE.SphereGeometry(0.09, 10, 8), mat.darkSteel).translateX(Math.cos(a) * RIM).translateY(-0.3).translateZ(Math.sin(a) * RIM));
    const at = new THREE.Group(); // at the chain point, turned to face outward (+x)
    lift.add(at);
    const hang = new THREE.Group(); // thrown out about local z
    at.add(hang);
    for (const s of [-1, 1]) hang.add(rod(V(0, 0, s * 0.42), V(0, -CHAIN, s * 0.42), 0.014, mat.chain, 4));
    const seat = new THREE.Group();
    seat.position.y = -CHAIN;
    hang.add(seat);
    seat.add(M(new THREE.BoxGeometry(0.52, 0.07, 1.0), seatMats[i % 2]));
    const back = M(new THREE.BoxGeometry(0.07, 0.55, 1.0), seatMats[i % 2]);
    back.position.set(-0.24, 0.27, 0);
    seat.add(back);
    seat.add(rod(V(0.3, 0.32, -0.48), V(0.3, 0.32, 0.48), 0.025, mat.stainless, 6)); // lap bar
    const riders = [];
    for (const s of [-1, 1]) {
      const p = rider(K, 1700 + i * 2 + (s > 0 ? 1 : 0), { kind: 'sit' });
      p.position.set(0.02, 0.04, s * 0.24);
      p.rotation.y = Math.PI / 2; // faces outward (+x of the chair)
      seat.add(p);
      riders.push(p);
    }
    chairs.push({ mark, at, hang, riders });
  }
  const w = new THREE.Vector3();
  const pose = (slot, full) => {
    const p = twistPose(slot);
    lift.position.y = REST_Y - 1.5 + RISE * p.lift;
    head.position.y = 1.5;
    head.rotation.y = p.heading;
    lean.rotation.z = -p.tilt;
    unhead.rotation.y = -p.heading;
    spin.rotation.y = p.spin;
    lift.updateWorldMatrix(true, true);
    for (const c of chairs) {
      c.mark.getWorldPosition(w);
      lift.worldToLocal(w);
      c.at.position.copy(w);
      c.at.rotation.y = -Math.atan2(w.z, w.x); // local +x points outward, level
      c.hang.rotation.z = full ? TWIST.throw : 0;
      for (const r of c.riders) r.visible = full;
    }
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = twistKeys();
    const pictures = [...groups.values()].map((gr) => ({ keys: gr.keys, keys2: gr.keys2, pose: () => m.pose(gr.angle, gr.full) }));
    B.log(`chair_swing_twist: ${pictures.length} pictures`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'chair_swing_twist', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
