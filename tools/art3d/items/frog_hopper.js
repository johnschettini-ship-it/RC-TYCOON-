// Frog Hopper (family flat ride, 2 x 2 tiles = 8 m, 7.5 m): a small bounce tower dressed as a lily-pad stalk: a
// green stem with leaves standing in a little lily pond, a lily pad on top with a friendly frog sitting on it (big
// round eyes, a smile; an original character, no likeness of any). A square seat ring of 8 seats (two a side, riders
// facing out, legs dangling, lap bars) hops up the stem in four short bounces per turn and settles back: today's
// `frogShare` (familyMotion.ts), the 16 time steps at 1/FROG_Q of the 2.75 m travel (familyKeys.js frogKeys); the
// empty ride is one rest picture. A railing round the pond with the entrance on the front row and the exit on the back
// row of the sim's gate column (familyKeys.js FAMILY_GATES): rots [0, 1, 2, 3].
// Colour part: the seat ring, its orange frame, seat shells and lap bars; base #ee8a24.
import { THREE, kit, placeOnFootprint, bakeObject, colourMesh, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, std } from '../kit.js';
import { rider } from '../rides.js';
import { paint, tube, boxAt, peakHeight, gate } from './swingParts.js';
import { frogKeys, frogLevel, FROG_Q, FAMILY_GATES } from './familyKeys.js';

const G = FAMILY_GATES.frog_hopper;
const STALK_TOP = 5.6;
const SEAT_REST = 1.1; // seat pan height at rest (dangling feet clear the boarding deck)
const TRAVEL = 2.75; // today's HOP_TRAVEL 22 px
const BASE_COLOUR = '#ee8a24';

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const leaf = new THREE.MeshPhysicalMaterial({ color: '#3f9a3c', roughness: 0.5, clearcoat: 0.4 });
  const stem = new THREE.MeshPhysicalMaterial({ color: '#4caf50', roughness: 0.45, clearcoat: 0.5 });
  const frogSkin = new THREE.MeshPhysicalMaterial({ color: '#6fcf5a', roughness: 0.4, clearcoat: 0.6 });
  const belly = std({ color: '#e8f3b0', roughness: 0.6 });
  const orange = new THREE.MeshPhysicalMaterial({ color: '#ee8a24', metalness: 0.25, roughness: 0.42, clearcoat: 0.5 });
  // pad, the lily pond round the stem, lily leaves on the water
  root.add(boxAt(7.6, 0.2, 7.6, 0, 0.1, 0, mat.concrete));
  root.add(M(new THREE.CylinderGeometry(2.7, 2.75, 0.3, 48), std({ color: '#b9b2a0', roughness: 0.85 })).translateY(0.35));
  const water = M(new THREE.CircleGeometry(2.5, 48), new THREE.MeshPhysicalMaterial({ color: '#3d8fb8', roughness: 0.08, clearcoat: 1 }), false, true);
  water.rotation.x = -Math.PI / 2; water.position.y = 0.52; // over the basin's top (0.5 m)
  root.add(water);
  const lilyGeo = new THREE.CircleGeometry(0.42, 20, 0.35, Math.PI * 2 - 0.7);
  for (const [a, r] of [[0.5, 1.9], [2.2, 2.0], [3.9, 1.85], [5.3, 2.05]]) {
    const l = M(lilyGeo, leaf, false, true);
    l.rotation.x = -Math.PI / 2; l.rotation.z = a * 2; l.position.set(r * Math.cos(a), 0.54, r * Math.sin(a));
    root.add(l);
  }
  // a low deck ring the riders board from, over the pond edge
  const deck = M(new THREE.RingGeometry(1.25, 2.1, 40), std({ color: '#9a6e48', roughness: 0.8 }), false, true);
  deck.rotation.x = -Math.PI / 2; deck.position.y = 0.58;
  root.add(deck);
  // the stem, guide rails, leaves
  root.add(M(new THREE.CylinderGeometry(0.3, 0.38, STALK_TOP - 0.4, 24), stem).translateY(0.4 + (STALK_TOP - 0.4) / 2));
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) root.add(boxAt(0.08, STALK_TOP - 1.2, 0.08, x * 0.36, 0.6 + (STALK_TOP - 1.2) / 2, z * 0.36, mat.darkSteel));
  for (const [y, a] of [[4.3, 0.6], [4.9, 2.8], [3.9, 4.6]]) {
    const l = M(new THREE.SphereGeometry(0.5, 16, 8), leaf);
    l.scale.set(1, 0.12, 0.45); l.position.set(0.6 * Math.cos(a), y, 0.6 * Math.sin(a)); l.rotation.y = -a; l.rotation.z = 0.35;
    root.add(l);
  }
  // the lily pad on top, a notch cut out, and the frog
  const pad = M(new THREE.CylinderGeometry(1.35, 1.25, 0.16, 40, 1, false, 0.3, Math.PI * 2 - 0.6), leaf);
  pad.position.y = STALK_TOP + 0.08;
  root.add(pad);
  const frog = new THREE.Group();
  frog.position.y = STALK_TOP + 0.16;
  frog.rotation.y = 0; // facing the front (+z)
  root.add(frog);
  const body = M(new THREE.SphereGeometry(0.75, 28, 18), frogSkin);
  body.scale.set(1, 0.72, 0.95); body.position.y = 0.5;
  frog.add(body);
  const tummy = M(new THREE.SphereGeometry(0.55, 20, 14), belly);
  tummy.scale.set(1, 0.75, 0.6); tummy.position.set(0, 0.42, 0.42);
  frog.add(tummy);
  for (const s of [-1, 1]) {
    const bump = M(new THREE.SphereGeometry(0.3, 18, 14), frogSkin);
    bump.position.set(s * 0.36, 1.0, 0.25);
    frog.add(bump);
    const eye = M(new THREE.SphereGeometry(0.22, 16, 12), std({ color: '#ffffff', roughness: 0.25 }));
    eye.position.set(s * 0.38, 1.05, 0.42);
    frog.add(eye);
    const pupil = M(new THREE.SphereGeometry(0.1, 12, 8), std({ color: '#1f1f24', roughness: 0.2 }));
    pupil.position.set(s * 0.38, 1.07, 0.6);
    frog.add(pupil);
    const foot = M(new THREE.SphereGeometry(0.22, 12, 8), frogSkin);
    foot.scale.set(1.2, 0.35, 1.4); foot.position.set(s * 0.55, 0.06, 0.55);
    frog.add(foot);
  }
  const smile = M(new THREE.TorusGeometry(0.3, 0.035, 6, 20, Math.PI * 0.8), std({ color: '#2a6a2a', roughness: 0.5 }));
  smile.rotation.z = Math.PI + Math.PI * 0.1; smile.position.set(0, 0.78, 0.7);
  frog.add(smile);
  // railing round the pad with gaps and gates on the sim's gate column
  const H = 3.5;
  const rail = (a, b) => {
    const n = Math.max(1, Math.round(a.distanceTo(b) / 1.3));
    for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); root.add(tube(p, p.clone().setY(1.25), 0.03, 0.03, mat.stainless, 6)); }
    for (const y of [0.8, 1.25]) root.add(tube(a.clone().setY(y), b.clone().setY(y), 0.025, 0.025, mat.stainless, 6));
  };
  rail(V(-H, 0.2, -H), V(-H, 0.2, H));
  rail(V(H, 0.2, -H), V(H, 0.2, H));
  for (const [gx, gz] of [G.entrance, G.exit]) {
    rail(V(-H, 0.2, gz), V(gx - 0.8, 0.2, gz));
    rail(V(gx + 0.8, 0.2, gz), V(H, 0.2, gz));
  }
  root.add(gate(G.entrance, mat.stainless, paint(K, '#2f7d3a')));
  root.add(gate(G.exit, mat.stainless, paint(K, '#7a2a1c')));
  // the seat ring: a square orange frame round the stem, two seats a side facing out
  const ring = new THREE.Group();
  root.add(ring);
  const IN = 0.5, OUT = 1.2, mid = (IN + OUT) / 2;
  const seatMat = std({ color: '#2b2523', roughness: 0.6 });
  const riders = [];
  let n = 0;
  for (let f = 0; f < 4; f++) {
    const side = new THREE.Group();
    side.rotation.y = (f * Math.PI) / 2;
    ring.add(side);
    side.add(colourMesh(M(new THREE.BoxGeometry(2 * OUT, 0.18, OUT - IN), orange)).translateY(-0.06).translateZ(mid + 0.0001 * f));
    side.add(M(new THREE.BoxGeometry(0.3, 0.4, 0.16), mat.darkSteel).translateY(0.05).translateZ(IN - 0.08)); // guide shoe
    for (const x of [-0.42, 0.42]) {
      const s = new THREE.Group();
      s.position.set(x, 0, OUT - 0.05);
      side.add(s);
      // the seat shell is the ring's colour (what shows of the ring round the riders); the cushion is dark
      s.add(colourMesh(M(new THREE.BoxGeometry(0.5, 0.78, 0.08), orange)).translateY(0.4).translateZ(-0.1));
      s.add(M(new THREE.BoxGeometry(0.42, 0.62, 0.05), seatMat).translateY(0.4).translateZ(-0.04));
      s.add(M(new THREE.BoxGeometry(0.44, 0.08, 0.36), seatMat).translateY(0.04).translateZ(0.14));
      s.add(colourMesh(tube(V(-0.2, 0.32, 0.38), V(0.2, 0.32, 0.38), 0.03, 0.03, orange, 6)));
      for (const sd of [-1, 1]) s.add(colourMesh(tube(V(sd * 0.2, 0.32, 0.38), V(sd * 0.2, 0.62, 0.0), 0.025, 0.025, orange, 6)));
      const p = rider(K, 1500 + n, { kind: 'dangle', armsUp: n % 3 === 1 }, { child: n % 4 !== 3 });
      p.position.set(0, 0.06, 0.16);
      s.add(p);
      riders.push(p);
      n++;
    }
  }
  const pose = (share, full) => {
    ring.position.y = SEAT_REST + TRAVEL * share;
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = frogKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const share = id === 'rest' ? 0 : Number(id.slice(1)) / FROG_Q;
      return { keys: g.keys, keys2: g.keys2, pose: () => m.pose(share, g.full) };
    });
    B.log(`frog_hopper: ${pictures.length} pictures per rotation (levels ${[...new Set(Array.from({ length: 16 }, (_, t) => frogLevel(t)))].join(',')}), peak ${peakHeight(m.root, pictures).toFixed(2)} m (spec ${B.input.spec.heightM} m)`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'frog_hopper', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
