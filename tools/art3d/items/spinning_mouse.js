// Spinning Mouse (track ride, batch 5 Task 6): on the track kit (trackKit.js bakeTrackType). Today's look draws it on
// the steel style with a round car (paintCar `mouse`: 1.7 m across, two round ears on top) that spins as it runs. Here:
// narrow steel, two small rails on a ladder frame (a stringer under each rail, cross ties every half metre, struts
// down to a slim spine), slim round columns, and a round tub car on a centre pivot: four riders back to back in two
// pairs, a rubber bumper ring, two round ear fins on the seat divider. The car is round about its pivot, so the whole
// car turns with the spin (the game draws a spinning car at its track yaw plus the spin: track/layer.ts addCar), and
// every reached tilt is baked at all 32 yaws (trackGeometry `spins`). Sets, frames and anchors: trackKit.js header.
import { THREE } from './common.js';
import { M, std } from '../kit.js';
import { rider } from '../rides.js';
import { bakeTrackType } from './trackKit.js';
import { roundSupport, tubeRail } from './tubeTrack.js';

const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

export const RAIL = tubeRail({
  gauge: 0.36, // narrower than the junior's 0.42 (the kit's scale): 0.72 m between the rails
  railR: 0.04,
  spine: [-0.3, 0.16, 0.16], // 0.22-0.38 m under the rail line
  ladder: [-0.075, 0.06, 0.07], // a stringer under each rail
  tieEvery: 2,
  tie: [0.05, 0.04],
  platform: 1.25,
  material: (colour) => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.4, metalness: 0.3, clearcoat: 0.4 }),
});

// slim columns; the top's post ends 0.34 m under the rail line, 0.04 m into the spine's bottom face
export const SUPPORTS = roundSupport({ r: 0.13, footR: 0.28, saddle: 0.95, postR: 0.08, reach: 0.86 });

/** The round car: tub 1.72 m across (today's 0.85 m radius), rim 0.9 m over the rail line, four seats. */
function mouseCar(K, colour, i = 0) {
  const { mat } = K;
  const body = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  const rubber = std({ color: '#2a2a2c', roughness: 0.75 });
  const chrome = std({ color: '#cfd3d8', roughness: 0.25, metalness: 0.9 });
  const car = new THREE.Group();
  // running gear under the tub: a round chassis plate (round, so it reads the same at any spin) and the pivot
  car.add(M(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 28), mat.darkSteel).translateY(0.08));
  car.add(M(new THREE.CylinderGeometry(0.17, 0.2, 0.16, 18), chrome).translateY(0.22));
  // the tub: floor, wall, a rolled lip and a bumper ring round its foot
  car.add(M(new THREE.CylinderGeometry(0.82, 0.76, 0.1, 36), body).translateY(0.33));
  car.add(M(new THREE.CylinderGeometry(0.86, 0.82, 0.52, 36, 1, true), body).translateY(0.6));
  const lip = M(new THREE.TorusGeometry(0.86, 0.04, 8, 40), body); lip.rotation.x = Math.PI / 2; lip.position.y = 0.86; car.add(lip);
  const bumper = M(new THREE.TorusGeometry(0.84, 0.07, 10, 40), rubber); bumper.rotation.x = Math.PI / 2; bumper.position.y = 0.36; car.add(bumper);
  // the seat divider across the middle, two benches back to back, a grab bar along each
  car.add(M(new THREE.BoxGeometry(1.5, 0.5, 0.1), mat.seat).translateY(0.62));
  const riders = [];
  for (const side of [1, -1]) {
    car.add(M(new THREE.BoxGeometry(1.36, 0.1, 0.42), mat.seat).translateY(0.44).translateZ(side * 0.3));
    const bar = M(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), chrome); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.78, side * 0.56); car.add(bar);
    [-0.3, 0.3].forEach((x, k) => {
      const p = rider(K, 2100 + i * 5 + (side > 0 ? 0 : 2) + k, { kind: 'ride', legsHidden: true }, { child: (k + (side > 0 ? 0 : 1)) % 2 === 0 });
      p.position.set(x, 0.5, side * 0.2);
      if (side < 0) p.rotation.y = Math.PI;
      car.add(p);
      riders.push(p);
    });
  }
  // the ears: two round fins on the divider's ends, in the car colour
  for (const x of [-0.55, 0.55]) {
    const ear = M(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 28), body);
    ear.rotation.x = Math.PI / 2;
    ear.position.set(x, 1.08, 0);
    car.add(ear);
  }
  return { car, riders };
}

export const CAR = {
  build: (K, colour, i = 0) => mouseCar(K, colour, i),
  masked: (m, colour) => hex(m.material) === colour,
};

/** The style spec (trackKit.js bakeTrackType; the numbers explained in steel_coaster.js SPEC). */
export const SPEC = {
  item: 'spinning_mouse',
  rail: RAIL,
  supports: SUPPORTS,
  car: CAR,
  colours: { track: '#e2e2e2', supports: '#dedede', cars: '#ececec' },
  straddleHalfM: 0.45, // rails 0.36 m off the rail line, 0.04 m thick
  supportTopBelowRail: 1.2,
};

export default {
  bake(B) {
    bakeTrackType(B, SPEC);
  },
};
