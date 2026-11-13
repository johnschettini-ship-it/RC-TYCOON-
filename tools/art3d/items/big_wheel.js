// Big Wheel (large flat ride, 3 x 3 tiles): the round 7 Ferris wheel, 10.2 m across so it fits its 12 m footprint
// with the gondolas. The wheel turns by the game's ride angle (32 steps per turn); 16 gondolas in 4 colours, and
// the riders of gondola i copied from gondola i mod 4, so the wheel repeats every 90 degrees: the phone's 16 even
// angles need 4 pictures per occupancy. Not round, so one set per sprite rotation (boarding steps at the front).
import { THREE, kit, placeOnFootprint, bakeObject, rideKeys } from './common.js';
import { ferrisWheel } from '../rides.js';

const N = 16;
const PERIOD_STEPS = 8; // 90 degrees in game angle steps (32 per turn)

function build() {
  const K = kit();
  const { group, hubY, R } = ferrisWheel(K, { x: 0, z: 0, D: 10.2, n: N, seed: 700 });
  const kids = group.children;
  const wheel = kids.find((c) => c.isGroup && Math.abs(c.position.y - hubY) < 1e-6 && c.position.z === 0 && c.children.length > N);
  const gondolas = kids.filter((c) => c.isGroup && c !== wheel);
  if (!wheel || gondolas.length !== N) throw new Error(`big_wheel: found ${gondolas.length} gondolas`);
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
    const groups = rideKeys('big_wheel', [0], (a, _s, full) => `${a % PERIOD_STEPS}:${full ? 1 : 0}`);
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, pose: () => m.pose(((g.angle % PERIOD_STEPS) / 32) * Math.PI * 2, g.full) }));
    B.log(`big_wheel: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'big_wheel', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
