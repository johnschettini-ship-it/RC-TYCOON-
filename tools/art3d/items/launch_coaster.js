// Launch Coaster (track ride, batch 5 Task 7): every piece the type builds, on the track kit (trackKit.js). Its game row
// (src/data/track/trackTypes.ts, rides batch C) draws it with the steel rail and round columns and its own `launch`
// cars; today's look adds a row of linear motor plates on the launch piece, with lit stator lines every metre
// (src/render/track/paint.ts paintLaunchMotors), and draws the cars as low wedges with a dark seat band and a white side
// stripe (paintCar `launch`). Here: the steel coaster's rail and columns, the launch piece carrying a run of linear
// motor stators between the rails (untinted, so the piece sits on a masked sheet: its group `Ln` is in UNTINTED_GROUPS),
// and low wedge-nosed cars with two rows of riders. Original design, from the game's own numbers.
import { THREE } from './common.js';
import { M, V, rod } from '../kit.js';
import { sweep, boxProfile, Beams, rider } from '../rides.js';
import { bakeTrackType, RAIL_STYLES } from './trackKit.js';

let statorMat = null;
const STATOR_MAT = () => (statorMat ??= new THREE.MeshPhysicalMaterial({ color: '#3a414c', roughness: 0.45, metalness: 0.7, clearcoat: 0.3 }));
let coilMat = null;
// the stator faces: a cool blue sheen (today's lit lines), lit a little so it reads in shade
const COIL_MAT = () => (coilMat ??= new THREE.MeshStandardMaterial({ color: '#4fb4ec', emissive: '#2a8fd0', emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.6 }));
let trayMat = null;
const TRAY_MAT = () => (trayMat ??= new THREE.MeshStandardMaterial({ color: '#8d949c', roughness: 0.5, metalness: 0.7 }));

/**
 * Linear motor stators along a launch piece: on each side of the line, a row of stator blocks 0.8 m long with a
 * 0.2 m gap (a launch is 4 m: four pairs), standing on the spine's top face between the rails, their inner faces
 * blue; a cable tray along the spine's side. The train's reaction fin runs between the rows.
 */
function launchMotors(F) {
  const g = new THREE.Group();
  const blocks = new Beams(), coils = new Beams();
  for (let i = 0; i + 3 <= F.NS; i += 4) {
    const a = F.P[i], b = F.P[i + 3], l = F.Lt[i], u = F.Up[i];
    for (const s of [-1, 1]) {
      const at = (p, x, y) => p.clone().addScaledVector(l, x).addScaledVector(u, y);
      blocks.add(at(a, s * 0.13, -0.16), at(b, s * 0.13, -0.16), 0.12, 0.22, u);
      coils.add(at(a, s * 0.065, -0.14), at(b, s * 0.065, -0.14), 0.014, 0.16, u);
    }
  }
  g.add(blocks.mesh(STATOR_MAT()));
  g.add(coils.mesh(COIL_MAT()));
  g.add(sweep(F, boxProfile(-0.21, -0.36, 0.06, 0.1), TRAY_MAT(), { uvLen: 2 }));
  return g;
}

/** The steel rail (stage 1 model), with the launch piece's motors. */
export const LAUNCH_RAIL = {
  ...RAIL_STYLES.steel,
  build(K, F, FX, special, mats, gauge) {
    const g = RAIL_STYLES.steel.build(K, F, FX, special, mats, gauge);
    if (special === 'launch') g.add(launchMotors(F));
    return g;
  },
};

const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

/**
 * A launch car (2.5 m apart in the train: 2.3 m long): a low tub on a steel chassis with road wheels on the rails, a
 * wedge nose falling to the front, a white stripe along each side, two rows of two riders with high headrests and lap
 * bars. The tub and nose take the car colour.
 */
export const LAUNCH_CAR = {
  build(K, colour, i = 0) {
    const car = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.25, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 });
    const stripe = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.35, metalness: 0.1 });
    const L = 2.3, W = 1.25, by = 0.18;
    // chassis and wheel assemblies on the rails (rails 0.5 m either side of the line)
    car.add(M(new THREE.BoxGeometry(0.46, 0.14, L * 0.86), K.mat.darkSteel));
    for (const s of [-1, 1]) for (const z of [-0.75, 0.75]) car.add(M(new THREE.BoxGeometry(0.16, 0.26, 0.38), K.mat.darkSteel).translateX(s * 0.5).translateZ(z));
    // the tub: floor, low sides, back
    car.add(M(new THREE.BoxGeometry(W, 0.1, L - 0.6), paint).translateY(by).translateZ(-0.3));
    for (const s of [-1, 1]) {
      const side = M(new THREE.BoxGeometry(0.08, 0.42, L - 0.6), paint);
      side.position.set(s * (W / 2 - 0.04), by + 0.21, -0.3);
      car.add(side);
      const st = M(new THREE.BoxGeometry(0.02, 0.07, L - 0.62), stripe);
      st.position.set(s * (W / 2 + 0.005), by + 0.24, -0.3);
      car.add(st);
    }
    car.add(M(new THREE.BoxGeometry(W, 0.46, 0.08), paint).translateY(by + 0.23).translateZ(-L / 2 + 0.04));
    // the wedge nose: a side profile extruded across the car, falling from the tub's front edge to the chassis
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(0.62, 0); sh.lineTo(0.62, 0.08); sh.lineTo(0, 0.46); sh.closePath();
    const noseG = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false });
    noseG.translate(0, 0, -W / 2);
    noseG.rotateY(-Math.PI / 2); // the profile's x runs forward (+z)
    const nose = M(noseG, paint);
    nose.position.set(0, by - 0.05, L / 2 - 0.62);
    car.add(nose);
    const riders = [];
    let n = 0;
    for (const z of [0.15, -0.65]) {
      car.add(M(new THREE.BoxGeometry(W - 0.22, 0.1, 0.46), K.mat.seat).translateY(by + 0.14).translateZ(z - 0.04));
      const back = M(new THREE.BoxGeometry(W - 0.22, 0.78, 0.1), K.mat.seat);
      back.position.set(0, by + 0.5, z - 0.3);
      back.rotation.x = -0.12;
      car.add(back);
      for (const x of [-0.28, 0.28]) {
        const p = rider(K, 1700 + i * 11 + n++, { kind: 'ride', legsHidden: true });
        p.position.set(x, by + 0.22, z - 0.12);
        car.add(p);
        riders.push(p);
      }
      car.add(rod(V(-(W / 2 - 0.15), by + 0.52, z + 0.22), V(W / 2 - 0.15, by + 0.52, z + 0.22), 0.03, K.mat.stainless, 8)); // lap bar
    }
    return { car, riders };
  },
  masked: (m, colour) => hex(m.material) === colour,
};

/**
 * The style spec, painted light (the game tints track, columns and cars).
 *   look   the game's render row this module draws.
 */
export const SPEC = {
  item: 'launch_coaster',
  look: { rail: 'steel', supports: 'round', car: 'launch' },
  rail: LAUNCH_RAIL,
  supports: 'round',
  car: LAUNCH_CAR,
  colours: { track: '#e2e2e2', supports: '#dedede', cars: '#ececec' },
  // the steel rail's numbers (the same rail model): half the track's width, and the game's column top under the line
  straddleHalfM: 0.6,
  supportTopBelowRail: 1.2,
  groundHoldOut: false, // trackKit.js: the hold-out ground cut descending pieces and pitched cars
};

export default {
  bake(B) {
    bakeTrackType(B, SPEC);
  },
};
