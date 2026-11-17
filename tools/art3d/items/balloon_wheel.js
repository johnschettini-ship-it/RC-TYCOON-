// Balloon Wheel (family flat ride, 2 x 2 tiles = 8 m, 9 m): a small wheel, 5.2 m across on a 6 m hub, on two green
// A-frames. Each of its 8 cars is a wicker basket for two hanging level under a hot-air balloon envelope (2.2 m from pin to basket floor) in one of
// four colours, from a pin on the rim. The wheel turns by the game's ride angle, today's direction (familyMotion.ts:
// today's rimPt, u = model x, so the wheel stands in the model's x-y plane, the axle along z). Balloon i has the
// colour and the riders of balloon i mod 4, so the wheel repeats every quarter turn: 4 full pictures (familyKeys.js
// balloonKeys, period 8 slots); the empty ride is one rest picture. A low boarding deck under the wheel, the entrance
// on the front row and the exit on the back row of the sim's gate column (familyKeys.js FAMILY_GATES): rots [0, 1, 2, 3].
// Colour part: the balloon envelopes, all four designed colours; the others become lighter or darker shades of the chosen colour; base #22a38a.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, std } from '../kit.js';
import { rider } from '../rides.js';
import { gloss } from './arenaKit.js';
import { paint, tube, boxAt, railing, peakHeight, deckPlate, gate, walkway } from './swingParts.js';
import { balloonKeys, BALLOON_PERIOD, FAMILY_GATES } from './familyKeys.js';
import { BALLOON_CARS } from '../../../src/render/sprites/content/familyMotion';

const G = FAMILY_GATES.balloon_wheel;
const HUB_Y = 6.0;
const R = 2.6; // rim pin radius
const RIM_Z = 0.95; // the two rims either side of the cars' pins (clear of the 1.24 m balloons)
/** Balloon colours (red, lemon, blue, teal). The teal is of middle lightness (luma 122 of red 104, lemon 194, blue 105). */
const BALLOON_COLOURS = ['#d93a2f', '#f2c230', '#2f74c8', '#22a38a'];
const BASE_COLOUR = '#22a38a';

/** A balloon envelope: a teardrop lathe, its widest 1.24 m, its mouth at y = 0 and its crown at `h`. */
function envelope(h = 1.2) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16; // 0 mouth .. 1 crown
    const r = t < 0.62 ? 0.14 + 0.48 * Math.sin((t / 0.62) * Math.PI / 2) ** 0.8 : 0.62 * Math.cos(((t - 0.62) / 0.38) * Math.PI / 2) ** 0.7;
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * h));
  }
  return new THREE.LatheGeometry(pts, 24);
}

/** One car (hangs from its pin at the origin): a balloon over a two-seat wicker basket on four cords. */
function car(K, colour, seed) {
  const { mat } = K;
  const g = new THREE.Group();
  const cord = std({ color: '#3a2e24', roughness: 0.8 });
  const wicker = std({ color: '#b07a3e', roughness: 0.9 });
  const rimMat = std({ color: '#7a5230', roughness: 0.7 });
  g.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), mat.darkSteel).translateY(-0.12)); // hanger
  const env = M(envelope(), colourPart(gloss(colour)));
  env.position.y = -0.2 - 1.2; // the mouth down at the cords, the crown up at the hanger
  g.add(env);
  const mouthY = -0.2 - 1.2;
  const basketTop = mouthY - 0.35;
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) g.add(tube(V(x * 0.5, mouthY, z * 0.5), V(x, basketTop, z), 0.012, 0.012, cord, 4));
  g.add(boxAt(0.66, 0.45, 0.66, 0, basketTop - 0.225, 0, wicker));
  g.add(boxAt(0.72, 0.06, 0.72, 0, basketTop, 0, rimMat));
  const riders = [];
  for (const x of [-0.17, 0.17]) {
    const p = rider(K, seed + (x > 0 ? 1 : 0), { kind: 'ride', legsHidden: true }, { child: x < 0 });
    p.position.set(x, basketTop - 0.38, 0);
    p.rotation.y = x < 0 ? 0.3 : -0.3;
    g.add(p);
    riders.push(p);
  }
  return { g, riders };
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const green = paint(K, '#2f8a43');
  const white = paint(K, '#f4f1ea', { metalness: 0.1 });
  const yellow = paint(K, '#f2c230');
  const plate = deckPlate();
  // ground pad and boarding deck under the bottom car
  root.add(boxAt(7.6, 0.2, 7.6, 0, 0.1, 0, mat.concrete));
  root.add(boxAt(3.2, 0.3, 2.2, 0, 0.35, 0, plate));
  root.add(railing([[-1.6, -1.1], [1.6, -1.1]], 0.5, mat.stainless, 0.9));
  // walkways and gates from the sim's gates to the deck
  root.add(walkway(G.entrance, [-1.2, 1.1], 1.0, plate));
  root.add(walkway(G.exit, [-1.2, -1.1], 1.0, plate));
  root.add(gate(G.entrance, mat.stainless, paint(K, '#2f7d3a')));
  root.add(gate(G.exit, mat.stainless, paint(K, '#7a2a1c')));
  // A-frames either side of the wheel (front and back, along z), the axle along z
  for (const s of [-1, 1]) {
    const top = V(0, HUB_Y, s * (RIM_Z + 0.35));
    for (const sx of [-1, 1]) {
      const foot = V(sx * 2.6, 0.2, s * (RIM_Z + 1.3));
      root.add(tube(foot, top, 0.16, 0.12, green, 12));
      root.add(boxAt(0.6, 0.25, 0.6, foot.x, 0.25, foot.z, mat.concrete));
    }
    root.add(tube(V(-1.4, 2.6, s * (RIM_Z + 0.95)), V(1.4, 2.6, s * (RIM_Z + 0.95)), 0.07, 0.07, green, 8));
  }
  root.add(tube(V(0, HUB_Y, -RIM_Z - 0.45), V(0, HUB_Y, RIM_Z + 0.45), 0.18, 0.18, mat.stainless, 16));
  // the wheel: two yellow rims, white spokes, a cross pin at each car
  const wheel = new THREE.Group();
  wheel.position.y = HUB_Y;
  root.add(wheel);
  for (const s of [-1, 1]) {
    wheel.add(M(new THREE.TorusGeometry(R, 0.08, 8, 64), yellow).translateZ(s * RIM_Z));
    wheel.add(M(new THREE.TorusGeometry(R * 0.55, 0.05, 6, 48), white).translateZ(s * RIM_Z));
    const hub = M(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 18), mat.darkSteel);
    hub.rotation.x = Math.PI / 2; hub.position.z = s * RIM_Z;
    wheel.add(hub);
  }
  for (let i = 0; i < BALLOON_CARS * 2; i++) {
    const a = (i / (BALLOON_CARS * 2)) * Math.PI * 2;
    for (const s of [-1, 1]) wheel.add(tube(V(0.35 * Math.cos(a), 0.35 * Math.sin(a), s * RIM_Z), V(R * Math.cos(a), R * Math.sin(a), s * RIM_Z), 0.03, 0.03, white, 6));
  }
  for (let i = 0; i < BALLOON_CARS; i++) {
    const a = (i / BALLOON_CARS) * Math.PI * 2;
    wheel.add(tube(V(R * Math.cos(a), R * Math.sin(a), -RIM_Z - 0.05), V(R * Math.cos(a), R * Math.sin(a), RIM_Z + 0.05), 0.045, 0.045, mat.darkSteel, 8));
  }
  // the cars: riders of car i copied from car i % 4 (the quarter-turn repeat)
  const cars = [];
  for (let i = 0; i < BALLOON_CARS; i++) cars.push(car(K, BALLOON_COLOURS[i % 4], 720 + (i % 4) * 2));
  for (const c of cars) root.add(c.g);
  const riders = cars.flatMap((c) => c.riders);
  const pose = (theta, full) => {
    wheel.rotation.z = theta;
    cars.forEach((c, i) => {
      const a = (i / BALLOON_CARS) * Math.PI * 2 + theta;
      c.g.position.set(R * Math.cos(a), HUB_Y + R * Math.sin(a), 0);
    });
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = balloonKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const slot = id === 'rest' ? 0 : Number(id.split(':')[0]) % BALLOON_PERIOD;
      return { keys: g.keys, keys2: g.keys2, pose: () => m.pose((slot / 32) * Math.PI * 2, g.full) };
    });
    B.log(`balloon_wheel: ${pictures.length} pictures per rotation, peak ${peakHeight(m.root, pictures).toFixed(2)} m (spec ${B.input.spec.heightM} m)`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'balloon_wheel', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
