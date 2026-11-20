// Junior Coaster (track ride, batch 5 Task 6): a family coaster on the track kit (trackKit.js bakeTrackType). Today's
// look draws it as the steel style at gauge 1.0 with a thinner spine (src/render/track/paint.ts JUNIOR_LOOK) and short
// rounded cars (paintCar `junior`). Here: two tube rails at today's junior gauge on a slim box spine, slim round
// columns, and short two-row cars with a rounded nose, children and grown-ups aboard. Sets, frames and anchors:
// trackKit.js header.
import { THREE } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { rider } from '../rides.js';
import { RAIL_STYLES, bakeTrackType } from './trackKit.js';
import { roundSupport, tubeRail } from './tubeTrack.js';

const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

/** Today's junior gauge (1.0 m) at the kit's steel scale (its half gauge 0.5 m draws today's 1.2 m). */
const GAUGE = (RAIL_STYLES.steel.gauge * 1.0) / 1.2;

export const RAIL = tubeRail({
  gauge: GAUGE,
  railR: 0.045,
  spine: [-0.36, 0.2, 0.22], // 0.25-0.47 m under the rail line (the steel spine is 0.27-0.57 m, 0.26 wide)
  tie: [0.055, 0.04],
  platform: 1.3,
  material: (colour) => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.4, metalness: 0.3, clearcoat: 0.4 }),
});

// slim columns; the top's post ends 0.43 m under the rail line, 0.04 m into the spine's bottom face
export const SUPPORTS = roundSupport({ r: 0.15, footR: 0.32, saddle: 1.05, postR: 0.09, reach: 0.77 });

/**
 * A junior car: 1.7 m long and 1.16 m wide (today's `junior` car is 1.7 × 1.24), a low open tub with a rounded nose
 * cowl, one row of two (the type seats 2 a car: data/catalog/trackRides.ts) and a lap bar. Riders: a child beside a
 * grown-up.
 */
function juniorCar(K, colour, i = 0) {
  const { mat } = K;
  const body = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 });
  const trim = std({ color: '#cfd3d8', roughness: 0.3, metalness: 0.8 });
  const car = new THREE.Group();
  const len = 1.7, w = 1.16, by = 0.16;
  // running gear: a frame and four wheel blocks on the rails
  car.add(M(new THREE.BoxGeometry(0.4, 0.14, len * 0.8), mat.darkSteel));
  for (const s of [-1, 1]) for (const z of [-len * 0.3, len * 0.3]) { const wb = M(new THREE.BoxGeometry(0.13, 0.24, 0.3), mat.darkSteel); wb.position.set(s * GAUGE, 0, z); car.add(wb); }
  // the tub: floor, sides, back, and the rounded nose cowl
  car.add(M(new THREE.BoxGeometry(w, 0.09, len - 0.3), body).translateY(by).translateZ(-0.15));
  for (const s of [-1, 1]) {
    const sd = M(new THREE.BoxGeometry(0.07, 0.44, len - 0.3), body); sd.position.set(s * (w / 2 - 0.035), by + 0.22, -0.15); car.add(sd);
    car.add(rod(V(s * (w / 2 - 0.035), by + 0.45, -len / 2 + 0.05), V(s * (w / 2 - 0.035), by + 0.45, len / 2 - 0.35), 0.03, trim, 8));
  }
  const back = M(new THREE.BoxGeometry(w, 0.66, 0.08), body); back.position.set(0, by + 0.33, -len / 2 + 0.04); car.add(back);
  const noseG = new THREE.SphereGeometry(0.58, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const nose = M(noseG, body); nose.rotation.x = Math.PI / 2; nose.scale.set(1, 0.62, 0.5); nose.position.set(0, by + 0.24, len / 2 - 0.36); car.add(nose);
  const lamp = M(new THREE.CircleGeometry(0.07, 14), trim); lamp.position.set(0, by + 0.24, len / 2 - 0.02); car.add(lamp);
  const riders = [];
  // a rear deck behind the seat back
  const deck = M(new THREE.BoxGeometry(w - 0.1, 0.3, 0.36), body); deck.position.set(0, by + 0.2, -len / 2 + 0.26); car.add(deck);
  [-0.18].forEach((z, row) => {
    const seat = M(new THREE.BoxGeometry(w - 0.18, 0.1, 0.4), mat.seat); seat.position.set(0, by + 0.15, z - 0.05); car.add(seat);
    const sb = M(new THREE.BoxGeometry(w - 0.18, 0.42, 0.08), mat.seat); sb.position.set(0, by + 0.4, z - 0.28); sb.rotation.x = -0.15; car.add(sb);
    car.add(rod(V(-0.48, by + 0.46, z + 0.18), V(0.48, by + 0.46, z + 0.18), 0.03, trim, 8));
    [-0.26, 0.26].forEach((x, k) => {
      const p = rider(K, 1700 + i * 7 + row * 2 + k, { kind: 'ride', legsHidden: true }, { child: (row + k) % 2 === 0 });
      p.position.set(x, by + 0.22, z - 0.14);
      car.add(p);
      riders.push(p);
    });
  });
  return { car, riders };
}

export const CAR = {
  build: (K, colour, i = 0) => juniorCar(K, colour, i),
  masked: (m, colour) => hex(m.material) === colour,
};

/** The style spec (trackKit.js bakeTrackType; the numbers explained in steel_coaster.js SPEC). */
export const SPEC = {
  item: 'junior_coaster',
  rail: RAIL,
  supports: SUPPORTS,
  car: CAR,
  colours: { track: '#e2e2e2', supports: '#dedede', cars: '#ececec' },
  straddleHalfM: 0.5, // rails 0.42 m off the rail line, 0.045 m thick
  supportTopBelowRail: 1.2,
};

export default {
  bake(B) {
    bakeTrackType(B, SPEC);
  },
};
