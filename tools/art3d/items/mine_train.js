// Mine Train (track ride, batch 5 Task 7): every piece the type builds, on the track kit (trackKit.js). Its game row
// (src/data/track/trackTypes.ts, rides batch C) says rail `wood`, supports `lattice`, cars `ore`; today's look draws it
// with its own look (src/render/track/paint.ts MINE_LOOK: dark steel rails 1 m apart on rough wooden sleepers every
// 0.75 m), on lattice timber bents (paintSupport `lattice`: two legs 0.75 m either side, cross braced) and as riveted ore
// carts on a dark chassis with a rim band and two ribs (paintCar `ore`). Here: flat-bottom steel rails in the track
// colour on untinted timber sleepers and stringers (so every rail frame sits on a masked sheet), a timber trestle in
// the support colour, and ore carts carrying four riders. Original design, from the game's own numbers.
import { THREE } from './common.js';
import { M, V, tx, rep, rod } from '../kit.js';
import { sweep, boxProfile, Beams, rider } from '../rides.js';
import { bakeTrackType, SEG_H } from './trackKit.js';
import { CHAIN_LINE_M } from '../../../src/render/real/trackChain';

const GAUGE = 0.45; // half the rail spacing (today's look: 1 m between rails, drawn at the kit's 0.83 scale as the steel)
const TIE_TOP = -0.095; // the sleepers' top, just under the rails' foot (-0.09): touching faces fight in the mask pass
const TIE_H = 0.14;
const STRINGER_BOTTOM = -0.58; // the stringers' bottom: the column top's posts end 0.53 m under the line, inside it

let tieMat = null;
const TIE_MAT = () => (tieMat ??= new THREE.MeshStandardMaterial({ color: '#8a6a4a', map: rep(tx.wood.map, 1), roughness: 0.9 }));
let ironMat = null;
const IRON_MAT = () => (ironMat ??= new THREE.MeshStandardMaterial({ color: '#3a3430', roughness: 0.7, metalness: 0.6 }));
let chainMat = null;
const CHAIN_MAT = () => (chainMat ??= new THREE.MeshPhysicalMaterial({ color: '#34383e', roughness: 0.35, metalness: 0.85 }));

/** A flat-bottom rail's section at lateral `l`: head, web and foot, its head's top 0.03 m over the line. */
function railSection(l) {
  return [...boxProfile(l, 0.0, 0.07, 0.06), ...boxProfile(l, -0.05, 0.02, 0.05), ...boxProfile(l, -0.08, 0.13, 0.02)];
}

/** Steel rails (the track colour) on timber sleepers every 0.75 m and two timber stringers (untinted). */
export const MINE_RAIL = {
  gauge: GAUGE,
  material: (colour) => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.42, metalness: 0.55, clearcoat: 0.15 }),
  build(K, F, FX, special, mats, gauge) {
    const g = new THREE.Group();
    g.add(sweep(FX, [...railSection(-gauge), ...railSection(gauge)], mats.rail, { uvLen: 2 }));
    // stringers under the sleepers, carried by the trestle bents
    for (const s of [-1, 1]) g.add(sweep(FX, boxProfile(s * gauge, (TIE_TOP - TIE_H + STRINGER_BOTTOM) / 2, 0.22, TIE_TOP - TIE_H - STRINGER_BOTTOM), TIE_MAT(), { uvLen: 3 }));
    // sleepers every 3 samples of the whole piece (0.75 m), a little uneven as hewn timber is
    const ties = new Beams();
    const i0 = F.i0 ?? 0;
    for (let i = (3 - (i0 % 3)) % 3; i <= F.NS; i += 3) {
      const p = F.P[i], l = F.Lt[i], u = F.Up[i];
      const k = i + i0, half = 0.74 + ((k * 37) % 7) * 0.012;
      const at = (a, b) => p.clone().addScaledVector(l, a).addScaledVector(u, b);
      ties.add(at(-half, TIE_TOP - TIE_H / 2), at(half, TIE_TOP - TIE_H / 2), 0.2, TIE_H, F.Tn[i]);
    }
    g.add(ties.mesh(TIE_MAT()));
    if (special === 'brakes' || special === 'blockBrake') {
      // brake skids between the rails on the sleepers
      for (const s of [-1, 1]) g.add(sweep(FX, boxProfile(s * 0.12, TIE_TOP + 0.05, 0.05, 0.1), K.mat.darkSteel, { uvLen: 2 }));
    }
    if (special === 'station') {
      // a plank platform either side, its deck 0.15 m over the line (a station stands on the ground)
      for (const s of [-1, 1]) g.add(sweep(FX, boxProfile(s * 1.45, 0.05, 1.5, 0.2), K.mat.boards, { uvLen: 2 }));
    }
    return g;
  },
  // The chain lift (Task 5): a steel channel on the sleepers between the rails, the chain in it, its top at CHAIN_LINE_M.
  trough(K, F) {
    const g = new THREE.Group();
    g.add(sweep(F, boxProfile(0, TIE_TOP + 0.01, 0.24, 0.02), IRON_MAT(), { uvLen: 2 }));
    for (const s of [-1, 1]) g.add(sweep(F, boxProfile(s * 0.11, TIE_TOP + 0.035, 0.02, 0.05), IRON_MAT(), { uvLen: 2 }));
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

/**
 * A timber trestle bent (support colour), stacked by the game like any column (supportStack.ts): two legs 0.75 m either
 * side of the axis, across the track at heading t (today's lattice). Each 1 m segment holds an X brace from leg foot to
 * leg top, so stacked segments brace the whole height; the top is a cap beam with two short posts under the stringers.
 * The footings are concrete (untinted).
 */
const LEG = 0.75;
export const MINE_TRESTLE = {
  material: (colour) => new THREE.MeshStandardMaterial({ color: colour, map: rep(tx.wood.map, 1), roughness: 0.85 }),
  piece(K, part, t, mat) {
    const g = new THREE.Group();
    const b = new Beams();
    // built across +z (the track runs along +x at t = 0, three x), turned to the heading
    if (part === 'foot') {
      for (const s of [-1, 1]) g.add(M(new THREE.BoxGeometry(0.5, 0.25, 0.5), K.mat.concrete).translateY(0.125).translateZ(s * LEG));
    } else if (part === 'seg') {
      for (const s of [-1, 1]) b.add(V(0, 0, s * LEG), V(0, SEG_H, s * LEG), 0.2, 0.2);
      b.add(V(0, 0.05, -LEG), V(0, 0.95, LEG), 0.07, 0.1, V(1, 0, 0));
      b.add(V(0, 0.05, LEG), V(0, 0.95, -LEG), 0.07, 0.1, V(1, 0, 0));
      b.add(V(0.06, 0.98, -LEG - 0.1), V(0.06, 0.98, LEG + 0.1), 0.06, 0.12, V(1, 0, 0)); // a ledger every metre
    } else {
      b.add(V(0, 0.11, -LEG - 0.15), V(0, 0.11, LEG + 0.15), 0.24, 0.22, V(1, 0, 0)); // cap beam
      for (const s of [-1, 1]) b.add(V(0, 0.22, s * GAUGE), V(0, 0.71, s * GAUGE), 0.18, 0.18); // posts to the stringers
    }
    if (b.list.length) g.add(b.mesh(mat));
    g.rotation.y = (-t * Math.PI) / 2;
    const w = new THREE.Group();
    w.add(g);
    return w;
  },
};

const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

/**
 * An ore cart (2.2 m apart in the train: 1.9 m long): a riveted steel tub, wider at the top, with a timber rim, two
 * strap ribs each side, on a dark chassis with four flanged wheels on the rails; two benches of two riders. The tub,
 * its ribs and rivets take the car colour.
 */
export const ORE_CART = {
  build(K, colour, i = 0) {
    const car = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.55, metalness: 0.35, clearcoat: 0.2, side: THREE.DoubleSide });
    const rim = new THREE.MeshStandardMaterial({ color: '#5a4430', map: rep(tx.wood.map, 1), roughness: 0.85 });
    const L = 1.9, Wt = 1.36, Wb = 1.16, H = 0.68, by = 0.2;
    // chassis and wheels
    car.add(M(new THREE.BoxGeometry(0.9, 0.12, L - 0.2), K.mat.darkSteel).translateY(0.1));
    for (const s of [-1, 1]) for (const z of [-0.58, 0.58]) {
      const wh = M(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14), IRON_MAT());
      wh.rotation.z = Math.PI / 2;
      wh.position.set(s * GAUGE, 0.1, z);
      car.add(wh);
    }
    // the tub: a tapered open box (4-sided open cylinder turned square), its floor, the rim
    const tubG = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * (Wb / Wt), H, 4, 1, true);
    tubG.rotateY(Math.PI / 4);
    tubG.scale(Wt, 1, L);
    const tub = M(tubG, paint);
    tub.position.y = by + H / 2;
    car.add(tub);
    car.add(M(new THREE.BoxGeometry(Wb, 0.06, L * (Wb / Wt)), paint).translateY(by + 0.03));
    for (const s of [-1, 1]) {
      car.add(M(new THREE.BoxGeometry(0.09, 0.09, L + 0.08), rim).translateX(s * (Wt / 2)).translateY(by + H));
      car.add(M(new THREE.BoxGeometry(Wt + 0.08, 0.09, 0.09), rim).translateZ(s * (L / 2)).translateY(by + H));
      // strap ribs and rivets on each long side
      for (const z of [-0.45, 0.45]) {
        const rib = M(new THREE.BoxGeometry(0.03, H - 0.08, 0.1), paint);
        rib.position.set(s * ((Wt + Wb) / 4 + 0.02), by + (H - 0.08) / 2, z);
        rib.rotation.z = s * Math.atan((Wt - Wb) / 2 / H);
        car.add(rib);
      }
      for (let k = 0; k < 7; k++) {
        const z = -L / 2 + 0.15 + k * ((L - 0.3) / 6);
        car.add(M(new THREE.SphereGeometry(0.022, 6, 4), paint).translateX(s * (Wt / 2 - 0.01)).translateY(by + H - 0.1).translateZ(z));
      }
    }
    const riders = [];
    let n = 0;
    for (const z of [0.35, -0.45]) {
      car.add(M(new THREE.BoxGeometry(Wb - 0.12, 0.08, 0.4), rim).translateY(by + 0.3).translateZ(z - 0.05));
      for (const x of [-0.28, 0.28]) {
        const p = rider(K, 1900 + i * 13 + n++, { kind: 'ride', legsHidden: true });
        p.position.set(x, by + 0.36, z - 0.12);
        car.add(p);
        riders.push(p);
      }
      car.add(rod(V(-0.5, by + 0.72, z + 0.2), V(0.5, by + 0.72, z + 0.2), 0.025, K.mat.darkSteel, 8)); // grab bar
    }
    return { car, riders };
  },
  masked: (m, colour) => hex(m.material) === colour,
};

/**
 * The style spec, painted light (the game tints rails, trestles and carts).
 *   look                 the game's render row (rail `wood` is drawn with the mine train's own look, as today's).
 *   straddleHalfM        the sleepers' half length (bakeNode.ts trackRuns).
 *   maskedRails          every rail frame has untinted timber: masked sheets.
 */
export const SPEC = {
  item: 'mine_train',
  look: { rail: 'wood', supports: 'lattice', car: 'ore' },
  rail: MINE_RAIL,
  supports: MINE_TRESTLE,
  car: ORE_CART,
  colours: { track: '#e2e2e2', supports: '#e8dccb', cars: '#ececec' },
  straddleHalfM: 0.8,
  supportTopBelowRail: 1.2,
  groundHoldOut: false, // trackKit.js: the hold-out ground cut descending pieces and pitched cars
  maskedRails: true,
  // its helix rail sets in two halves (trackClasses.ts railSplitClass): masked, one set per heading was 9-11 MiB at d4
  splitRailClasses: ['helix'],
};

export default {
  bake(B) {
    bakeTrackType(B, SPEC);
  },
};
