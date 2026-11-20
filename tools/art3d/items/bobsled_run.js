// Bobsled Run (track ride, batch 5 Task 7): every piece the type builds, on the track kit (trackKit.js). Today's look
// draws it as an ice trough (src/render/track/paint.ts LOOKS.bobsled: a channel 0.85 m either side of the line, walls
// 0.65 m over it, a pale ice surface) on round columns, with low two-seat sleds (paintCar `bobsled`). Here: a painted
// steel trough shell on a box spine, cradled every metre, lined with ice; sleds with two riders in tandem.
// The trough takes the track colour, the ice never does: every rail frame is shot with a mask of the shell
// (`maskedRails`) and sits on a masked sheet. Original design: built from the game's own channel numbers.
import { THREE } from './common.js';
import { M, tx, rep } from '../kit.js';
import { sweep, boxProfile, Beams, rider } from '../rides.js';
import { bakeTrackType } from './trackKit.js';
import { CHAIN_LINE_M } from '../../../src/render/real/trackChain';

// The cross-section (metres across the track `l`, up from the rail line `u`; the rail line is the game's sample line,
// where the car is anchored). The ice floor sits just over the line, where the sled's runners ride: a piece on the
// ground has its rail line at ground height, and the bake holds out everything under the ground (a floor under the
// line lost its middle on every ground-level piece). A lift's chain runs in a slot down the floor.
const ICE = 0.01; // the ice floor, on the centre line
const IN = 0.8; // the ice wall's half width
const WALL = 0.62; // the wall top over the rail line
const SHELL = 0.07; // shell thickness
const R = 0.3; // the floor's corner radius

/** The U of the trough, offset `o` outward (0: the ice face), as a polyline from the left wall top to the right one. */
function uProfile(o) {
  const pts = [];
  const w = IN + o, f = ICE - o, r = R + o;
  pts.push([-w - 0.02, WALL]);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * (Math.PI / 2); // left corner: from the wall down to the floor
    pts.push([-w + r + Math.cos(a) * r, f + r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= 8; i++) {
    const a = 1.5 * Math.PI + (i / 8) * (Math.PI / 2); // right corner
    pts.push([w - r + Math.cos(a) * r, f + r + Math.sin(a) * r]);
  }
  pts.push([w + 0.02, WALL]);
  return pts;
}
const ICE_FACE = uProfile(0);
// The shell's outer face is the ice's own surface wound the other way: the ice faces in, the shell out, each drawn
// front side only, so every pixel sees exactly one of them. Two surfaces a few cm apart fought in the bake's mask pass
// (its render target has a 16-bit depth buffer, the colour pass a float one): the mask lost the shell under the ice.
const SHELL_FACE = [...ICE_FACE].reverse();
const HALF = IN + SHELL + 0.04; // the lip's outer edge

let iceMat = null;
const ICE_MAT = () => (iceMat ??= new THREE.MeshPhysicalMaterial({ color: '#f3f9fd', map: rep(tx.ice.map, 1), roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }));
let slotMat = null;
const SLOT_MAT = () => (slotMat ??= new THREE.MeshStandardMaterial({ color: '#23272c', roughness: 0.6, metalness: 0.6 }));
let chainMat = null;
const CHAIN_MAT = () => (chainMat ??= new THREE.MeshPhysicalMaterial({ color: '#34383e', roughness: 0.35, metalness: 0.85 }));

/** The ice trough: shell, lips, spine and cradles in the track colour (`mats.rail`), the ice lining untinted. */
export const ICE_TROUGH = {
  gauge: IN, // the runners ride on the floor either side of the line (the kit passes it back; the trough uses its own numbers)
  material: (colour) => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.35, metalness: 0.25, clearcoat: 0.6 }),
  build(K, F, FX, special, mats) {
    const g = new THREE.Group();
    g.add(sweep(FX, [ICE_FACE], ICE_MAT(), { uvLen: 8 }));
    g.add(sweep(FX, [SHELL_FACE], mats.rail, { uvLen: 2 }));
    // the lips: a rolled edge along each wall top, joining ice and shell
    for (const s of [-1, 1]) g.add(sweep(FX, boxProfile(s * (IN + 0.02 + SHELL / 2), WALL, SHELL + 0.04, 0.07), mats.rail, { uvLen: 2 }));
    // the spine the columns carry, under the trough's floor (its bottom 0.57 m under the rail line, as the steel spine's:
    // the column's post ends just inside it)
    g.add(sweep(FX, boxProfile(0, -0.29, 0.34, 0.58), mats.rail, { uvLen: 2 }));
    // cradles every metre: a strut from the spine up each side of the shell to the lip
    const cr = new Beams();
    for (let i = (4 - ((F.i0 ?? 0) % 4)) % 4; i <= F.NS; i += 4) {
      const p = F.P[i], l = F.Lt[i], u = F.Up[i];
      const at = (a, b) => p.clone().addScaledVector(l, a).addScaledVector(u, b);
      for (const s of [-1, 1]) {
        cr.add(at(s * 0.15, -0.5), at(s * (IN + 0.03), ICE + 0.15), 0.06, 0.08, F.Tn[i]);
        cr.add(at(s * (IN + 0.03), ICE + 0.1), at(s * (IN + 0.03), WALL), 0.06, 0.08, F.Tn[i]);
      }
    }
    g.add(cr.mesh(mats.rail));
    if (special === 'brakes' || special === 'blockBrake') {
      // brake fins rising from a slot in the ice floor
      g.add(sweep(FX, boxProfile(0, ICE + 0.06, 0.05, 0.14), K.mat.darkSteel, { uvLen: 2 }));
      for (const s of [-1, 1]) g.add(sweep(FX, boxProfile(s * 0.07, ICE + 0.005, 0.06, 0.012), SLOT_MAT(), { uvLen: 2 }));
    }
    if (special === 'station') {
      // a boarding deck either side, level with the lips
      for (const s of [-1, 1]) g.add(sweep(FX, boxProfile(s * (HALF + 0.65), WALL - 0.08, 1.3, 0.2), K.mat.boards, { uvLen: 2 }));
    }
    return g;
  },
  // The chain lift (Task 5): a slot down the middle of the ice floor, the chain under it with its top at CHAIN_LINE_M
  // (the game draws the moving dashes there, over the picture). Untinted.
  trough(K, F) {
    const g = new THREE.Group();
    g.add(sweep(F, boxProfile(0, ICE + 0.004, 0.2, 0.006), SLOT_MAT(), { uvLen: 2 }));
    g.add(sweep(F, boxProfile(0, CHAIN_LINE_M - 0.02, 0.05, 0.04), CHAIN_MAT(), { uvLen: 2 }));
    const links = new Beams();
    for (let i = 0; i <= F.NS; i++) {
      const p = F.P[i], t = F.Tn[i], u = F.Up[i];
      const c = p.clone().addScaledVector(u, CHAIN_LINE_M - 0.015);
      links.add(c.clone().addScaledVector(t, -0.07), c.clone().addScaledVector(t, 0.07), 0.08, 0.03, u);
    }
    g.add(links.mesh(CHAIN_MAT()));
    return g;
  },
};

const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

/**
 * A two-seat sled 2 m long (the train's cars are 2.2 m apart): a glossy shell with a pointed nose, an open cockpit, two
 * riders in tandem, steel runners on the ice floor and a bumper rail along each side. The shell takes the car colour.
 */
export const SLED = {
  build(K, colour, i = 0) {
    const car = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
    const y0 = ICE + 0.07; // the shell's keel, over the runners
    const bodyG = new THREE.CapsuleGeometry(0.42, 1.0, 6, 18);
    bodyG.rotateX(Math.PI / 2);
    bodyG.scale(1.12, 0.62, 1);
    const body = M(bodyG, paint);
    body.position.set(0, y0 + 0.26, -0.08);
    car.add(body);
    // the nose: a cowl tapering to a point over the front runners
    const noseG = new THREE.ConeGeometry(0.4, 0.62, 18);
    noseG.rotateX(Math.PI / 2);
    noseG.scale(1.12, 0.55, 1);
    const nose = M(noseG, paint);
    nose.position.set(0, y0 + 0.24, 0.78);
    car.add(nose);
    // the cockpit opening and the tail fin
    car.add(M(new THREE.BoxGeometry(0.54, 0.05, 1.1), K.mat.seat).translateY(y0 + 0.47).translateZ(-0.22));
    const fin = M(new THREE.BoxGeometry(0.05, 0.18, 0.36), paint);
    fin.position.set(0, y0 + 0.58, -0.86);
    car.add(fin);
    for (const s of [-1, 1]) {
      // runners on the ice, struts up to the shell, and a bumper rail along the side
      const runner = M(new THREE.BoxGeometry(0.05, 0.04, 1.7), K.mat.stainless);
      runner.position.set(s * 0.3, ICE + 0.02, 0);
      car.add(runner);
      for (const z of [-0.6, 0.6]) car.add(M(new THREE.BoxGeometry(0.04, 0.08, 0.06), K.mat.darkSteel).translateX(s * 0.3).translateY(ICE + 0.07).translateZ(z));
      const bumper = M(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), K.mat.stainless);
      bumper.rotation.x = Math.PI / 2;
      bumper.position.set(s * 0.5, y0 + 0.28, -0.1);
      car.add(bumper);
    }
    const riders = [];
    for (let r = 0; r < 2; r++) {
      const p = rider(K, 1500 + i * 7 + r, { kind: 'ride', legsHidden: true, armsUp: false });
      p.position.set(0, y0 + 0.36, 0.22 - r * 0.72);
      car.add(p);
      riders.push(p);
    }
    return { car, riders };
  },
  masked: (m, colour) => hex(m.material) === colour,
};

/**
 * The style spec (trackKit.js bakeTrackType): painted light, the game tints the trough, the columns and the sleds.
 *   look                 the game's render row this module draws (src/data/track/trackTypes.ts);
 *   straddleHalfM        the trough's half width with its lips and cradles (bakeNode.ts trackRuns);
 *   supportTopBelowRail  the game's column top under the rail line (src/render/real/supportStack.ts);
 *   maskedRails          every rail frame has ice in it: masked sheets.
 */
export const SPEC = {
  item: 'bobsled_run',
  look: { rail: 'bobsled', supports: 'round', car: 'bobsled' },
  rail: ICE_TROUGH,
  supports: 'round',
  car: SLED,
  colours: { track: '#e2e2e2', supports: '#dedede', cars: '#ececec' },
  straddleHalfM: 0.9,
  supportTopBelowRail: 1.2,
  groundHoldOut: false, // trackKit.js: the hold-out ground cut descending pieces and pitched cars
  maskedRails: true,
};

export default {
  bake(B) {
    bakeTrackType(B, SPEC);
  },
};
