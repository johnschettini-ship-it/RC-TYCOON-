// Bumper Cars (covered family ride, 4 x 4 tiles, 7 m): an open-sided steel pavilion over a steel-plate arena. Green
// columns carry a perimeter fascia with a striped valance and bulbs and light open roof trusses (open from above, as
// today's thin ceiling grid, so the cars stay in view; the cars take power from the steel floor, so no ceiling
// mesh), a crown sign on the front, a boarding deck along the front with the entry gap. Twelve one-seat cars with rubber bumper
// rings and antenna pennants jostle on the floor, each round its own spot once per cycle, some spinning on the spot
// (whole frequencies, so the loop closes). Frames: arenaKeys.bumperKeys (16 time steps per
// cycle folded into 4 pictures by the size rule; the empty ride is one rest picture). Front (deck, sign) at +z: rots [0, 1, 2, 3].
import { THREE, placeOnFootprint, bakeObject, kit } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { stripes } from '../textures.js';
import { signMat } from '../rides.js';
import { person, randomLook } from '../people.js';
import { painted, gloss, glow, slab, roundRect, extrudeUp, bulbs, hash01 } from './arenaKit.js';
import { bumperKeys, BUMPER_PICS, stepOf } from './arenaKeys.js';

const HALF = 7.75; // base half-width (15.5 m of the 16 m footprint)
const AX = 6.9; // arena half-width in x
const AZ0 = -7.0, AZ1 = 5.2; // arena z range (the front deck is beyond AZ1)
const ACZ = (AZ0 + AZ1) / 2; // arena centre z
const COL = 7.35; // column line
const FASCIA_Y = 4.7; // underside of the fascia
const MESH_Y = 4.45; // lower chord of the roof trusses
const CAR_COLOURS = ['#d7322b', '#2f74c8', '#f2c230', '#7d4fc0', '#22a38a', '#ee8a24'];

/** One bumper car (forward +z): rubber ring, fibreglass body, seat, wheel, the pole to the ceiling mesh. */
function car(K, colour, seed) {
  const { mat } = K;
  const g = new THREE.Group();
  const rubber = std({ color: '#1d1d1f', roughness: 0.85 });
  const body = gloss(colour);
  const trim = std({ color: '#d9dadc', metalness: 1, roughness: 0.3 });
  g.add(extrudeUp(roundRect(1.3, 2.0, 0.5), 0.14, mat.darkSteel, 0.06, 0.02));
  // rubber bumper ring round the chassis
  const ring = roundRect(1.42, 2.12, 0.58);
  ring.holes.push(roundRect(1.16, 1.86, 0.45));
  g.add(extrudeUp(ring, 0.24, rubber, 0.1, 0.04));
  // body shell: a low tub, a raised rear cowl round the pole, a sloped front
  g.add(extrudeUp(roundRect(1.14, 1.84, 0.42), 0.36, body, 0.18, 0.05));
  const cowl = extrudeUp(roundRect(1.0, 0.55, 0.22), 0.5, body, 0.5, 0.06);
  cowl.position.z = -0.6;
  g.add(cowl);
  const nose = M(new THREE.CylinderGeometry(0.5, 0.56, 0.2, 24, 1, false, -Math.PI / 2, Math.PI), body);
  nose.scale.set(1.05, 1, 0.75); nose.position.set(0, 0.62, 0.46);
  g.add(nose);
  g.add(slab(1.1, 0.035, 0.05, trim, 0, 0.535, 0.88));
  // seat and back
  g.add(slab(0.62, 0.12, 0.5, mat.seat, 0, 0.52, -0.12));
  const back = slab(0.62, 0.5, 0.1, mat.seat, 0, 0.55, -0.38);
  back.rotation.x = -0.12;
  g.add(back);
  // steering column and wheel
  g.add(rod(V(0, 0.55, 0.42), V(0, 0.9, 0.2), 0.025, mat.darkSteel, 8));
  const wheel = M(new THREE.TorusGeometry(0.16, 0.022, 8, 24), std({ color: '#222', roughness: 0.5 }));
  wheel.position.set(0, 0.9, 0.2); wheel.rotation.x = Math.PI / 2 - 0.5;
  g.add(wheel);
  // floor-pickup car: no ceiling pole, a whip antenna with a pennant and a lamp at its tip
  g.add(rod(V(0, 1.0, -0.66), V(0, 2.2, -0.7), 0.015, mat.darkSteel, 6));
  const flag = M(new THREE.PlaneGeometry(0.3, 0.2), std({ color: colour, roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(0, 2.05, -0.85); flag.rotation.y = Math.PI / 2;
  g.add(flag);
  const spark = M(new THREE.SphereGeometry(0.06, 10, 8), glow('#fff2b0', 3.0), false, false);
  spark.position.set(0, 2.22, -0.7);
  g.add(spark);
  const look = randomLook(seed, { balloon: null, backpack: null, bag: null });
  const rider = person(look, { kind: 'ride', legsHidden: true });
  rider.position.set(0, 0.65, -0.2);
  g.add(rider);
  return { g, rider, spark };
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const green = painted('#2a7a3e');
  const yellow = painted('#f2c230');
  // base, arena floor and the boarding deck
  root.add(slab(HALF * 2, 0.25, HALF * 2, mat.concrete, 0, 0));
  root.add(slab(AX * 2, 0.05, AZ1 - AZ0, std({ color: '#9aa0a6', metalness: 0.35, roughness: 0.5 }), 0, 0.25, ACZ));
  root.add(slab(HALF * 2 - 0.2, 0.12, HALF - AZ1 - 0.15, painted('#9a6e48', { metalness: 0, roughness: 0.8, clearcoat: 0 }), 0, 0.25, (AZ1 + HALF) / 2 + 0.05));
  // arena barrier: low wall with a rubber strip and a yellow cap, a gap at the front entry
  const rubber = std({ color: '#1d1d1f', roughness: 0.85 });
  const wall = (x0, z0, x1, z1) => {
    const w = Math.abs(x1 - x0) || 0.2, d = Math.abs(z1 - z0) || 0.2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    root.add(slab(w, 0.5, d, painted('#ecebe6'), cx, 0.25, cz));
    root.add(slab(w + 0.06, 0.18, d + 0.06, rubber, cx, 0.36, cz));
    root.add(slab(w + 0.04, 0.05, d + 0.04, yellow, cx, 0.75, cz));
  };
  wall(-AX - 0.1, AZ0 - 0.1, AX + 0.1, AZ0 - 0.1);
  wall(-AX - 0.1, AZ0 - 0.1, -AX - 0.1, AZ1 + 0.1);
  wall(AX + 0.1, AZ0 - 0.1, AX + 0.1, AZ1 + 0.1);
  wall(-AX - 0.1, AZ1 + 0.1, -1.0, AZ1 + 0.1);
  wall(1.0, AZ1 + 0.1, AX + 0.1, AZ1 + 0.1);
  // deck railing along the front edge, open in the middle
  for (const s of [-1, 1]) {
    for (let k = 0; k <= 3; k++) {
      const x = s * (1.4 + k * ((HALF - 1.7) / 3));
      root.add(rod(V(x, 0.37, HALF - 0.2), V(x, 1.35, HALF - 0.2), 0.03, green, 6));
    }
    root.add(rod(V(s * 1.4, 1.35, HALF - 0.2), V(s * (HALF - 0.3), 1.35, HALF - 0.2), 0.035, green, 8));
    root.add(rod(V(s * 1.4, 0.85, HALF - 0.2), V(s * (HALF - 0.3), 0.85, HALF - 0.2), 0.025, green, 8));
  }
  // columns (square steel tubes on base plates)
  const cols = [];
  for (const x of [-COL, 0, COL]) for (const z of [-COL, 0, COL]) if (x !== 0 || z !== 0) cols.push([x, z]);
  for (const [x, z] of cols) {
    root.add(slab(0.5, 0.04, 0.5, mat.darkSteel, x, 0.25, z));
    root.add(slab(0.24, FASCIA_Y + 0.6 - 0.29, 0.24, green, x, 0.29, z));
  }
  // fascia beam all round, the valance below it, bulbs on its face
  const fasciaH = 0.75;
  const val = std({ map: stripes('#3fae55', '#fbf4e4', 16).map, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide });
  const cream = painted('#f4efe2');
  for (let e = 0; e < 4; e++) {
    const along = e % 2 === 0;
    const s = e < 2 ? 1 : -1;
    const holder = new THREE.Group();
    holder.add(slab(COL * 2 + 0.3, fasciaH, 0.24, cream, 0, FASCIA_Y, 0));
    holder.add(slab(COL * 2 + 0.34, 0.1, 0.28, green, 0, FASCIA_Y + fasciaH, 0));
    holder.add(slab(COL * 2 + 0.34, 0.1, 0.28, green, 0, FASCIA_Y - 0.02, 0));
    const v = M(new THREE.PlaneGeometry(COL * 2 + 0.2, 0.55), val, false, true);
    v.geometry.attributes.uv.array.forEach((u, i, a) => { if (i % 2 === 0) a[i] = u * 2; });
    v.position.set(0, FASCIA_Y - 0.3, 0.13);
    holder.add(v);
    const pts = [];
    for (let k = 0; k <= 14; k++) pts.push([-COL + (k / 14) * COL * 2, FASCIA_Y + fasciaH / 2, 0.14]);
    holder.add(bulbs(pts, K.ringBulb, 0.055));
    holder.position.set(along ? 0 : s * COL, 0, along ? s * COL : 0);
    holder.rotation.y = along ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
    root.add(holder);
  }
  // roof trusses across x, purlins along z, and the conductive mesh under them
  const trussTop = FASCIA_Y + fasciaH + 0.05;
  for (const z of [-COL, 0, COL]) {
    root.add(rod(V(-COL, trussTop, z), V(COL, trussTop, z), 0.06, green, 8));
    root.add(rod(V(-COL, MESH_Y + 0.2, z), V(COL, MESH_Y + 0.2, z), 0.045, green, 8));
    for (let k = 0; k < 6; k++) {
      const x0 = -COL + (k / 6) * COL * 2, x1 = -COL + ((k + 1) / 6) * COL * 2;
      root.add(rod(V(k % 2 ? x0 : x1, MESH_Y + 0.2, z), V(k % 2 ? x1 : x0, trussTop, z), 0.025, green, 6));
    }
  }
  for (const x of [-COL / 2, 0, COL / 2]) root.add(rod(V(x, trussTop, -COL), V(x, trussTop, COL), 0.045, green, 8));
  // crown sign over the front: a board in a bulb-lit frame on two posts
  const signY = trussTop + 0.15;
  const sign = M(new THREE.BoxGeometry(5.6, 1.2, 0.12), [cream, cream, cream, cream, signMat('BUMPER CARS', { bg: '#1f6f3a', accent: '#ffe08a', frame: '#f2c230', title: 64 }), cream]);
  sign.position.set(0, signY + 0.55 + 0.6, COL + 0.05);
  root.add(sign);
  for (const s of [-1, 1]) root.add(slab(0.14, 0.7, 0.14, green, s * 2.4, signY - 0.1, COL + 0.05));
  const sp = [];
  for (let k = 0; k <= 20; k++) { const x = -2.8 + (k / 20) * 5.6; sp.push([x, signY + 0.55, COL + 0.13], [x, signY + 1.75, COL + 0.13]); }
  root.add(bulbs(sp, K.ringBulb, 0.06));
  root.add(slab(5.8, 0.1, 0.24, yellow, 0, signY + 1.75, COL + 0.05));
  // cars
  const cars = [];
  for (let i = 0; i < 12; i++) {
    const c = car(K, CAR_COLOURS[i % CAR_COLOURS.length], 600 + i * 7);
    c.g.position.y = 0.3;
    root.add(c.g);
    cars.push(c);
  }
  // Car i jostles round its own spot once per cycle (a 0.55 m circle, its own phase and direction) and steers or
  // spins as it goes: four pictures per cycle show four moments of a busy floor, and the cycle closes on itself.
  const homes = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) homes.push([-4.65 + c * 3.1 + (r % 2 ? 0.4 : -0.4), ACZ - 4.0 + r * 4.0]);
  const place = (i, t) => {
    const TAU = Math.PI * 2;
    const ph = hash01(i * 13 + 5), dir = i % 3 === 0 ? -1 : 1;
    const a = TAU * (dir * t + ph);
    const x = homes[i][0] + 0.55 * Math.cos(a), z = homes[i][1] + 0.55 * Math.sin(a);
    const spinner = i % 4 === 1; // these turn a full circle on the spot each cycle
    const head = spinner ? TAU * (t + ph) : Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) + 0.4 * Math.sin(TAU * (t + i * 0.37));
    return { x, z, head };
  };
  const pose = (t, full) => {
    cars.forEach((c, i) => {
      const p = place(i, t);
      c.g.position.x = p.x; c.g.position.z = p.z; c.g.rotation.y = p.head;
      c.rider.visible = full;
      // antenna lamps blink while the cars drive
      c.spark.visible = full && hash01(i * 31 + Math.round(t * 64)) < 0.5;
    });
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = bumperKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const s = stepOf(id, BUMPER_PICS);
      return { keys: g.keys, pose: () => m.pose(s.t, s.full) };
    });
    B.log(`bumper_cars: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'bumper_cars', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
