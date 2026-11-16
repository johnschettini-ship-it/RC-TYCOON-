// Big Wheel (large flat ride, 3 x 3 tiles): the round 7 Ferris wheel, 10.2 m across so it fits its 12 m footprint
// with the gondolas. The wheel turns by the game's ride angle (32 steps per turn); 16 gondolas in 4 colours, and
// the riders of gondola i copied from gondola i mod 4, so the wheel repeats every 90 degrees: the phone's 16 even
// angles need 4 pictures per occupancy. Not round, so one set per sprite rotation (boarding steps at the front).
// Colour part: the gondolas, tub and canopy, all four designed colours; the others become lighter or darker shades of the chosen colour; base #3b7d4f.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { BIG_WHEEL_PERIOD, bigWheelKeys, d2Api } from './flatRides.js';
import { ferrisWheel } from '../rides.js';

const N = 16;
const PERIOD_STEPS = BIG_WHEEL_PERIOD; // 90 degrees in game angle steps (32 per turn)
/**
 * The gondolas' colours (rides.js ferrisWheel: red, blue, yellow, green). The base is the green, of middle lightness
 * (luma 108 of red 85, blue 102, yellow 182), so a chosen colour keeps them as shades of it (0.8x to 1.7x).
 */
const GONDOLA_COLOURS = ['#c8372d', '#2f6fb5', '#f0b323', '#3b7d4f'];
const BASE_COLOUR = '#3b7d4f';
/**
 * Mask weights 0 and 1 only: with 8 levels the 16 gondolas' masks (riders and rims cut into them) took the wheel to
 * 2.58 MB, over its 2.5 MB size rule. The gondolas' outer edges stay soft through the picture's own alpha; only where a
 * gondola meets its rim or riders is the edge hard (one pixel).
 */
const MASK_LEVELS = 2;

export function build() {
  const K = kit();
  const { group, hubY, R } = ferrisWheel(K, { x: 0, z: 0, D: 10.2, n: N, seed: 700 });
  const kids = group.children;
  const wheel = kids.find((c) => c.isGroup && Math.abs(c.position.y - hubY) < 1e-6 && c.position.z === 0 && c.children.length > N);
  const gondolas = kids.filter((c) => c.isGroup && c !== wheel);
  if (!wheel || gondolas.length !== N) throw new Error(`big_wheel: found ${gondolas.length} gondolas`);
  // colour part: each gondola's own painted meshes (tub and canopy) in one of the gondola colours, not its riders
  let parts = 0;
  for (const g of gondolas) {
    for (const c of g.children) if (c.isMesh && GONDOLA_COLOURS.includes(`#${c.material.color.getHexString()}`)) { colourPart(c.material); parts++; }
  }
  if (parts !== 2 * N) throw new Error(`big_wheel: ${parts} gondola colour meshes, expected tub and canopy of ${N}`);
  // riders: persons are the gondola children with their own children (Groups); copy from gondola i % 4
  const ridersOf = (g) => g.children.filter((c) => c.isGroup);
  for (let i = 4; i < N; i++) {
    for (const p of ridersOf(gondolas[i])) gondolas[i].remove(p);
    for (const p of ridersOf(gondolas[i % 4])) gondolas[i].add(p.clone(true));
  }
  const riders = gondolas.flatMap(ridersOf);
  const pose = (theta, full) => {
    wheel.rotation.x = theta;
    gondolas.forEach((g, i) => {
      const a = (i / N) * Math.PI * 2 + theta;
      g.position.set(0, hubY + Math.cos(a) * R, Math.sin(a) * R);
    });
    for (const p of riders) p.visible = full;
  };
  return { root: K.root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = bigWheelKeys(); // flatRides.js: the pictures, and density 2's
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, keys2: g.keys2, pose: () => m.pose(((g.angle % PERIOD_STEPS) / 32) * Math.PI * 2, g.full) }));
    B.log(`big_wheel: ${pictures.length} pictures per rotation`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'big_wheel', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR, maskLevels: MASK_LEVELS });
  },
};
