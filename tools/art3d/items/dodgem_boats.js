// Dodgem Boats (family flat ride, 3 x 3 tiles = 12 m, 6.5 m): a round pond with a dressed-stone rim inside a low white
// picket fence, a little red-and-white lighthouse on a rock in the middle, and six round dodgem boats (a fibreglass
// tub in a fat rubber bumper ring, two riders and a centre wheel) that drift round the lighthouse and nose in and out
// to each other. Motion: src/render/sprites/content/familyMotion.ts boatPose, today's own (8 pictures per turn,
// familyKeys.js dodgemKeys); the empty ride is one rest picture. A wooden landing at the entrance gap in the front
// fence and the exit gap at the back, both on the sim's gate column (familyKeys.js FAMILY_GATES): rots [0, 1, 2, 3].
// Colour part: the six boats' fibreglass tubs, all six designed colours; the others become lighter or darker shades of the chosen colour; base #22a38a.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, std } from '../kit.js';
import { person, randomLook } from '../people.js';
import { gloss, glow, slab } from './arenaKit.js';
import { paint, tube, peakHeight } from './swingParts.js';
import { dodgemKeys, dodgemTime, FAMILY_GATES } from './familyKeys.js';
import { BOATS, boatPose } from '../../../src/render/sprites/content/familyMotion';

const G = FAMILY_GATES.dodgem_boats;
const POND_R = 5.0; // water radius
const FENCE = 5.75; // fence line (square)
const BOAT_R0 = 2.35, BOAT_R1 = 3.75; // boat ring round the lighthouse (centre of a boat), metres
const BOAT_COLOURS = ['#d7322b', '#2f74c8', '#f2c230', '#22a38a', '#ee8a24', '#d0509a'];
/** The boats' teal, of middle lightness among them (luma 134 of red 85, blue 107, lemon 194, orange 152, pink 118). */
const BASE_COLOUR = '#22a38a';

/** One round dodgem boat (forward +z): bumper ring, tub, two seats back to back with riders, a wheel in the middle. */
function boat(colour, seed) {
  const g = new THREE.Group();
  const rubber = std({ color: '#26282c', roughness: 0.8 });
  const body = colourPart(gloss(colour));
  const ring = M(new THREE.TorusGeometry(0.9, 0.2, 10, 32), rubber);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
  g.add(ring);
  g.add(M(new THREE.CylinderGeometry(0.88, 0.72, 0.5, 32), body).translateY(0.3));
  const lip = M(new THREE.TorusGeometry(0.8, 0.06, 8, 32), body);
  lip.rotation.x = Math.PI / 2; lip.position.y = 0.56;
  g.add(lip);
  g.add(M(new THREE.CylinderGeometry(0.68, 0.68, 0.04, 28), std({ color: '#d9dadc', roughness: 0.6 })).translateY(0.5));
  const seat = std({ color: '#f4efe2', roughness: 0.55 });
  const riders = [];
  for (const s of [-1, 1]) {
    const bench = new THREE.Group();
    bench.rotation.y = s > 0 ? 0 : Math.PI;
    bench.add(slab(0.9, 0.12, 0.34, seat, 0, 0.5, -0.42));
    const back = slab(0.9, 0.36, 0.08, seat, 0, 0.6, -0.6);
    back.rotation.x = -0.15;
    bench.add(back);
    const p = person(randomLook(seed + (s > 0 ? 0 : 1), { balloon: null, backpack: null, bag: null, hat: null }), { kind: 'ride', legsHidden: true });
    p.position.set(0, 0.58, -0.4);
    bench.add(p);
    riders.push(p);
    g.add(bench);
  }
  // the wheel post between the seats
  g.add(tube(V(0, 0.5, 0), V(0, 0.95, 0.05), 0.04, 0.035, std({ color: '#3a3d45', roughness: 0.5 }), 8));
  const wheel = M(new THREE.TorusGeometry(0.17, 0.03, 8, 20), std({ color: '#f4f4f4', roughness: 0.5 }));
  wheel.position.set(0, 0.97, 0.05); wheel.rotation.x = Math.PI / 2 - 0.3;
  g.add(wheel);
  return { g, riders };
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const white = paint(K, '#f4f1ea', { metalness: 0 });
  const stone = std({ color: '#c9bfa8', roughness: 0.85 });
  const timber = std({ color: '#9a6e48', roughness: 0.8 });
  // ground: a gravel walk round the pond inside the fence
  root.add(slab(FENCE * 2, 0.08, FENCE * 2, std({ color: '#e2d8c0', roughness: 0.95 }), 0, 0));
  // the pond: a stone rim, the water a little below it
  const rim = new THREE.Mesh(new THREE.RingGeometry(POND_R, POND_R + 0.45, 64), stone);
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.42; rim.receiveShadow = true;
  root.add(rim);
  root.add(M(new THREE.CylinderGeometry(POND_R + 0.45, POND_R + 0.45, 0.34, 64, 1, true), stone).translateY(0.25));
  const water = new THREE.MeshPhysicalMaterial({ color: '#3d8fb8', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
  const pond = M(new THREE.CircleGeometry(POND_R, 64), water, false, true);
  pond.rotation.x = -Math.PI / 2; pond.position.y = 0.3;
  root.add(pond);
  // the lighthouse on its rock
  const rock = M(new THREE.DodecahedronGeometry(1.15, 1), std({ color: '#8d867a', roughness: 0.95, flatShading: true }));
  rock.scale.set(1, 0.5, 1); rock.position.y = 0.45;
  root.add(rock);
  const red = paint(K, '#d7322b');
  const H0 = 0.9, H1 = 4.7; // tower foot and top
  for (let k = 0; k < 4; k++) {
    const y0 = H0 + ((H1 - H0) * k) / 4, y1 = H0 + ((H1 - H0) * (k + 1)) / 4;
    const r = (y) => 0.62 - 0.18 * ((y - H0) / (H1 - H0));
    root.add(M(new THREE.CylinderGeometry(r(y1), r(y0), y1 - y0, 24), k % 2 ? white : red).translateY((y0 + y1) / 2));
  }
  root.add(M(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 24), mat.darkSteel).translateY(H1 + 0.05)); // gallery
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    root.add(tube(V(0.68 * Math.cos(a), H1 + 0.1, 0.68 * Math.sin(a)), V(0.68 * Math.cos(a), H1 + 0.55, 0.68 * Math.sin(a)), 0.015, 0.015, mat.darkSteel, 4));
  }
  const rail = M(new THREE.TorusGeometry(0.68, 0.02, 4, 32), mat.darkSteel);
  rail.rotation.x = Math.PI / 2; rail.position.y = H1 + 0.55;
  root.add(rail);
  root.add(M(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 16), glow('#ffe7a0', 1.4)).translateY(H1 + 0.45));
  root.add(M(new THREE.ConeGeometry(0.5, 0.8, 16), paint(K, '#2a7a3e')).translateY(H1 + 1.2));
  root.add(M(new THREE.SphereGeometry(0.08, 10, 8), mat.gold).translateY(H1 + 1.65));
  // picket fence with gaps on the gate column (entrance front, exit back), a landing to the water at each gap
  const fenceRun = (x0, z0, x1, z1) => {
    const a = V(x0, 0, z0), b = V(x1, 0, z1);
    const n = Math.max(1, Math.round(a.distanceTo(b) / 0.35));
    const pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.9, 0.04), white, n + 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2);
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); m4.compose(V(p.x, 0.5, p.z), q, V(1, 1, 1)); pickets.setMatrixAt(i, m4); }
    pickets.castShadow = true;
    root.add(pickets);
    for (const y of [0.35, 0.75]) root.add(tube(V(x0, y, z0), V(x1, y, z1), 0.035, 0.035, white, 6));
  };
  const GAP = 0.85;
  for (const s of [-1, 1]) {
    fenceRun(-FENCE, s * FENCE, G.entrance[0] - GAP, s * FENCE);
    fenceRun(G.entrance[0] + GAP, s * FENCE, FENCE, s * FENCE);
    fenceRun(s * FENCE, -FENCE, s * FENCE, FENCE);
    for (const sx of [-1, 1]) root.add(tube(V(G.entrance[0] + sx * GAP, 0, s * FENCE), V(G.entrance[0] + sx * GAP, 1.3, s * FENCE), 0.06, 0.06, paint(K, '#2a7a3e'), 8));
    root.add(slab(1.7, 0.12, FENCE - POND_R + 0.2, timber, G.entrance[0], 0.3, s * (POND_R + FENCE) / 2));
  }
  // the boats
  const boats = [];
  for (let i = 0; i < BOATS; i++) {
    const b = boat(BOAT_COLOURS[i % BOAT_COLOURS.length], 640 + i * 5);
    b.g.position.y = 0.12;
    root.add(b.g);
    boats.push(b);
  }
  const pose = (t, full) => {
    boats.forEach((b, i) => {
      const p = boatPose(i, t);
      const r = BOAT_R0 + (BOAT_R1 - BOAT_R0) * p.r;
      // today's (u, v) = (x, z) on the map at rotation 0: x = r cos a, z = r sin a
      b.g.position.x = r * Math.cos(p.a); b.g.position.z = r * Math.sin(p.a);
      b.g.rotation.y = -p.spin;
      for (const q of b.riders) q.visible = full;
    });
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = dodgemKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const s = dodgemTime(id);
      return { keys: g.keys, keys2: g.keys2, pose: () => m.pose(s.t, s.full) };
    });
    B.log(`dodgem_boats: ${pictures.length} pictures per rotation, peak ${peakHeight(m.root, pictures).toFixed(2)} m (spec ${B.input.spec.heightM} m)`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'dodgem_boats', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
