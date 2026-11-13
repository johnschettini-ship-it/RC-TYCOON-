// Swing Tower (swinging flat ride, 3 x 3 tiles, 18 m): a lattice-free steel column with a turning canopy at 6.2 m,
// 16 chair swings on 5.2 m chains, two rider looks alternating (so the ride repeats every 45 degrees: the phone's
// 16 even angles need 2 pictures per swing level and occupancy), and a round base, so one set serves every view
// turn (rot 'all'). Swing levels 0-4 (anim.ts rideFrameFor) throw the chairs out 0 to 45 degrees.
import { THREE, kit, placeOnFootprint, bakeObject, rideKeys } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { person, randomLook } from '../people.js';

const N = 16;
const RING = 2.3;
const CHAIN = 5.2;
const CANOPY_Y = 6.2;
const MAX_SWING = Math.PI / 4;

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  root.add(M(new THREE.CylinderGeometry(5.7, 5.85, 0.3, 72), mat.concrete).translateY(0.15));
  root.add(M(new THREE.CylinderGeometry(5.4, 5.4, 0.08, 72), mat.deck).translateY(0.34));
  root.add(M(new THREE.CylinderGeometry(0.75, 0.95, 1.2, 32), mat.steelBlue).translateY(0.9));
  root.add(M(new THREE.CylinderGeometry(0.42, 0.5, 16.5, 32), mat.steelWhite).translateY(9.5));
  root.add(M(new THREE.CylinderGeometry(0.8, 0.5, 0.6, 32), mat.steelBlue).translateY(17.3));
  root.add(M(new THREE.SphereGeometry(0.35, 20, 12), mat.gold).translateY(17.9));
  const spin = new THREE.Group();
  root.add(spin);
  // canopy: a striped cone with a valance and bulbs (all counts multiples of 16)
  const cone = M(new THREE.ConeGeometry(RING + 0.6, 1.6, 64, 2, true), mat.roofStripes);
  cone.position.y = CANOPY_Y + 1.1;
  spin.add(cone);
  const val = M(new THREE.CylinderGeometry(RING + 0.6, RING + 0.6, 0.45, 64, 1, true), mat.valance);
  val.position.y = CANOPY_Y + 0.1;
  spin.add(val);
  spin.add(M(new THREE.CylinderGeometry(RING + 0.58, RING + 0.58, 0.05, 64), mat.cream).translateY(CANOPY_Y + 0.3));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), K.ringBulb, 64);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * (RING + 0.66), CANOPY_Y + 0.33, Math.sin(a) * (RING + 0.66)); bulbs.setMatrixAt(i, m4); }
  spin.add(bulbs);
  const seatMats = [std({ color: '#d8382c', roughness: 0.4, metalness: 0.2 }), std({ color: '#f0b323', roughness: 0.4, metalness: 0.2 })];
  const looks = [randomLook(812, { balloon: null, backpack: null, bag: null, child: false }), randomLook(815, { balloon: null, backpack: null, bag: null, child: true })];
  const swings = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const arm = new THREE.Group(); // pivot on the canopy rim, turned to face outward
    arm.position.set(Math.cos(a) * RING, CANOPY_Y, Math.sin(a) * RING);
    arm.rotation.y = -a;
    spin.add(arm);
    const hang = new THREE.Group(); // tilts outward (about local z) by the swing angle
    arm.add(hang);
    for (const s of [-1, 1]) hang.add(rod(V(0, 0, s * 0.22), V(0, -CHAIN, s * 0.22), 0.012, mat.chain, 4));
    const seat = new THREE.Group();
    seat.position.y = -CHAIN;
    seat.add(M(new THREE.BoxGeometry(0.5, 0.06, 0.5), seatMats[i % 2]));
    const back = M(new THREE.BoxGeometry(0.06, 0.5, 0.5), seatMats[i % 2]);
    back.position.set(-0.24, 0.25, 0);
    seat.add(back);
    hang.add(seat);
    const p = person(looks[i % 2], { kind: 'sit' });
    p.position.set(0.02, 0.03, 0);
    p.rotation.y = Math.PI / 2; // faces outward (+x of the arm)
    seat.add(p);
    swings.push({ hang, rider: p });
  }
  const pose = (theta, swing, full) => {
    spin.rotation.y = theta;
    for (const s of swings) { s.hang.rotation.z = (swing / 4) * MAX_SWING; s.rider.visible = full; }
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const period = 32 / (N / 2); // game angle steps per repeat (45 degrees = 4 steps)
    const groups = rideKeys('swing_tower', [0, 1, 2, 3, 4], (a, s, full) => `${a % period}:${s}:${full ? 1 : 0}`);
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, pose: () => m.pose(((g.angle % period) / 32) * Math.PI * 2, g.swing, g.full) }));
    B.log(`swing_tower: ${pictures.length} pictures`);
    bakeObject(B, { kind: 'ride', item: 'swing_tower', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
