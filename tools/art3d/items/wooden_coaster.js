// Wooden Coaster (track ride, batch 5 Task 6): on the track kit (trackKit.js bakeTrackType). Today's look draws it as
// the `wood` rail style (gauge 1.2, timber ties every half metre, no spine: src/render/track/paint.ts LOOKS.wood) on
// `lattice` supports (two legs across the track with cross braces), with the two-row coaster car. Here: laminated timber
// running rails on timber ties and two ledger stringers, lattice bents of 1 m segments whose X bracing runs leg to leg
// within its metre (so stacked segments draw one continuous lattice), and an open two-row car with brass trim. Sets,
// frames and anchors: trackKit.js header.
import { THREE } from './common.js';
import { M, std, tx } from '../kit.js';
import * as T from '../textures.js';
import { sweep, boxProfile, Beams, sitCar } from '../rides.js';
import { RAIL_STYLES, SEG_H, bakeTrackType } from './trackKit.js';

const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

/** Today's wood gauge (1.2 m, as steel) at the kit's steel scale. */
const GAUGE = (RAIL_STYLES.steel.gauge * 1.2) / 1.2;
/** Ties: half length (today's wood tieHalf), spacing in samples (0.25 m each: every 0.5 m, as today). */
const TIE_HALF = 0.95, TIE_EVERY = 2;
/** The lattice legs and the ledger stringers above them, off the track centre (today's lattice legs: 0.75 m). */
const LEG = 0.75;
/** Laminated rail stack: width, depth under the rail line. Ties and stringers below it. */
const STACK_W = 0.2, STACK_D = 0.24, TIE_D = 0.1, LEDGER = [0.14, 0.12];
const LEDGER_BOTTOM = -(STACK_D + TIE_D + LEDGER[1]); // the stringers' bottom face (they hang under the ties)

// Pale wood grain painted light (the game tints it with the ride's track colour): the plank texture's gaps fall every
// 0.1 m across the swept profile, which on the rail stack's sides reads as glued laminations.
let woodTex = null;
const lightWood = () => (woodTex ??= T.wood(63, [238, 230, 218]));

export const RAIL = {
  gauge: GAUGE,
  material: (colour) => { const w = lightWood(); return std({ map: w.map, bumpMap: w.bump, bumpScale: 0.6, roughness: 0.82, color: colour }); },
  build(K, F, FX, special, mats, g) {
    const out = new THREE.Group();
    for (const s of [-1, 1]) {
      out.add(sweep(FX, boxProfile(s * g, -STACK_D / 2, STACK_W, STACK_D), mats.rail, { uvLen: 3 }));
      out.add(sweep(FX, boxProfile(s * LEG, LEDGER_BOTTOM + LEDGER[1] / 2, LEDGER[0], LEDGER[1]), mats.rail, { uvLen: 3 }));
    }
    const ties = new Beams();
    for (let i = (TIE_EVERY - ((F.i0 ?? 0) % TIE_EVERY)) % TIE_EVERY; i <= F.NS; i += TIE_EVERY) {
      const p = F.P[i], l = F.Lt[i], u = F.Up[i];
      const at = (a, b) => p.clone().addScaledVector(l, a).addScaledVector(u, b);
      ties.add(at(-TIE_HALF, -STACK_D - TIE_D / 2), at(TIE_HALF, -STACK_D - TIE_D / 2), 0.14, TIE_D, u);
    }
    out.add(ties.mesh(mats.rail));
    if (special === 'brakes' || special === 'blockBrake') out.add(sweep(FX, boxProfile(0, -0.16, 0.05, 0.2), K.mat.darkSteel, { uvLen: 2 }));
    if (special === 'station') for (const side of [-1, 1]) out.add(sweep(FX, boxProfile(side * 1.5, 0.05, 1.6, 0.2), K.mat.boards, { uvLen: 2 }));
    return out;
  },
  // the steel chain trough, bedded on a timber sill between the rails (the trough floor is 0.105 m under the rail line,
  // the ties 0.24 m: without the sill it would float)
  trough(K, F) {
    const g = RAIL_STYLES.steel.trough(K, F);
    g.add(sweep(F, boxProfile(0, -0.175, 0.3, 0.14), K.mat.timber, { uvLen: 3 }));
    return g;
  },
};

/** Lattice bents: two timber legs across the track, X bracing per metre, concrete pads; painted light to tint. */
export const LATTICE = {
  material: (colour) => std({ map: tx.paint.map, color: colour, roughness: 0.85 }),
  piece(K, part, t, mat) {
    const g = new THREE.Group();
    const bent = new THREE.Group(); // built across three z (the track runs along three x at t = 0), turned to t
    bent.rotation.y = (-t * Math.PI) / 2;
    g.add(bent);
    const leg = (y0, h) => { for (const s of [-1, 1]) bent.add(M(new THREE.BoxGeometry(0.16, h, 0.16), mat).translateY(y0 + h / 2).translateZ(s * LEG)); };
    // a plank from (z0, y0) to (z1, y1) on the bent's face at x
    const plank = (x, z0, y0, z1, y1, w = 0.11, d = 0.04) => {
      const len = Math.hypot(z1 - z0, y1 - y0);
      const b = M(new THREE.BoxGeometry(d, len, w), mat);
      b.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
      b.rotation.x = Math.atan2(z1 - z0, y1 - y0);
      b.userData.brace = true;
      bent.add(b);
      return b;
    };
    if (part === 'foot') {
      for (const s of [-1, 1]) bent.add(M(new THREE.BoxGeometry(0.42, 0.25, 0.42), K.mat.concrete).translateY(0.125).translateZ(s * LEG));
    } else if (part === 'seg') {
      leg(0, SEG_H);
      // one X per metre, on the two faces, leg foot to leg head within [0, 1] m (the 0.1 m overlap above is legs only);
      // a planks' ends are pulled in by its half width so its corners stay inside the metre
      const e = 0.06;
      plank(0.1, -LEG, e, LEG, 1 - e);
      plank(-0.1, LEG, e, -LEG, 1 - e);
      // and a girt across at the foot of the metre
      plank(0.1, -LEG, 0.05, LEG, 0.05, 0.08);
    } else {
      // the cap: a beam across under the ties, short legs up to the ledger stringers (whose bottom is LEDGER_BOTTOM
      // under the rail line; the game puts this anchor SUPPORT_TOP_BELOW_RAIL = 1.2 m under it), knee braces
      const reach = 1.2 + LEDGER_BOTTOM + 0.06;
      const cap = M(new THREE.BoxGeometry(0.2, 0.16, 2 * LEG + 0.4), mat);
      cap.position.y = 0.08;
      bent.add(cap);
      leg(0.16, reach - 0.16);
      plank(0.1, -LEG, 0.16, -0.1, Math.min(reach - 0.05, 0.6));
      plank(0.1, LEG, 0.16, 0.1, Math.min(reach - 0.05, 0.6));
    }
    return g;
  },
};

/** A classic open two-row car with brass trim (today's `coaster` car shape, as the steel coaster's). */
export const CAR = {
  build(K, colour, i = 0) {
    const car = sitCar(K, { seed: 1900 + i, color: colour, trim: '#c9a14a', rows: 2 });
    const riders = [];
    car.traverse((o) => { if (o.isGroup && o !== car && o.parent === car) riders.push(o); });
    return { car, riders };
  },
  masked: (m, colour) => hex(m.material) === colour,
};

/** The style spec (trackKit.js bakeTrackType; the numbers explained in steel_coaster.js SPEC). */
export const SPEC = {
  item: 'wooden_coaster',
  rail: RAIL,
  supports: LATTICE,
  car: CAR,
  colours: { track: '#ececec', supports: '#e6e6e6', cars: '#ececec' },
  straddleHalfM: 1.0, // the ties reach 0.95 m off the rail line
  supportTopBelowRail: 1.2,
};

export default {
  bake(B) {
    bakeTrackType(B, SPEC);
  },
};
