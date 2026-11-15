// Teacup Twirl (round flat ride, 3 x 3 tiles, 6.5 m): a turning floor carrying four smaller turntables, each with two
// glazed fibreglass teacups that spin on their own, round a static hub topped by a saucer canopy and a sugar-bowl dome.
// Motion, as a function of the game's ride angle a (0-1 per revolution of the main floor; teacups turn 3 revolutions
// per run, anim.ts REVOLUTIONS): floor +a turns, each turntable -2a turns relative to the floor, each cup +2a turns
// relative to its turntable (whole turns, so slot 32 shows slot 0). The turntables alternate two cup pairs (red and
// blue, yellow and violet), so the ride repeats every half turn: the even turn counts of turntables and cups make the
// state at a + 1/2 the state at a turned 180 degrees (turntable j lands where j + 2 was, in the same pose). Period 16
// angle slots: 8 pictures per occupancy. Round, static parts 90-degree symmetric: one set serves every view turn.
import { THREE, kit, placeOnFootprint, bakeObject } from './common.js';
import { cycleD2, cycleKeys, d2Api } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { person, randomLook } from '../people.js';
import { TEACUP, teacupAngles } from './spinnerMotion.js';

/** Angle slots per repeat (half a turn of the floor). */
export const PERIOD = TEACUP.period;
const TAU = Math.PI * 2;
const FLOOR_R = 5.1;
const SUB_RING = TEACUP.subRing; // turntable centres from the ride centre
const SUB_R = 1.85;
const CUP_RING = TEACUP.cupRing; // cup centres from their turntable's centre
const CUP_S = 1.05; // cup scale (outer rim radius 0.82 x 1.05)
const DECK_Y = 0.42; // top of the main floor

const glaze = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });

function lathe(pts, seg, mat) {
  return M(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
}

/** One teacup (origin at the centre of its foot), handle towards +x, two riders facing the centre wheel. */
function teacup(K, color, looks) {
  const { mat } = K;
  const g = new THREE.Group();
  const body = glaze(color);
  const inner = glaze('#fbf3e4');
  inner.side = THREE.DoubleSide;
  const trim = std({ color: '#d9ad4f', metalness: 1, roughness: 0.3 });
  // outer shell: foot, belly, rim
  g.add(lathe([[0, 0], [0.42, 0], [0.46, 0.04], [0.43, 0.1], [0.4, 0.14], [0.52, 0.2], [0.66, 0.32], [0.76, 0.52], [0.81, 0.76], [0.83, 0.94], [0.8, 0.98]], 40, body));
  // inside: from the rim down to the floor
  g.add(lathe([[0.8, 0.98], [0.76, 0.93], [0.74, 0.76], [0.66, 0.52], [0.5, 0.34], [0.3, 0.3], [0, 0.3]], 40, inner));
  // gold rim and a cream band round the belly
  g.add(M(new THREE.TorusGeometry(0.815, 0.022, 8, 48), trim).rotateX(Math.PI / 2).translateZ(-0.975));
  g.add(lathe([[0.795, 0.66], [0.808, 0.72], [0.812, 0.78]], 40, glaze('#fbf3e4')));
  g.add(M(new THREE.TorusGeometry(0.44, 0.018, 6, 32), trim).rotateX(Math.PI / 2).translateZ(-0.12));
  // handle: a half ring on the outside
  const handle = M(new THREE.TorusGeometry(0.24, 0.055, 10, 20, Math.PI), body);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.78, 0.62, 0);
  g.add(handle);
  // centre wheel the riders turn, on a post
  g.add(M(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 12), mat.stainless).translateY(0.5));
  g.add(M(new THREE.TorusGeometry(0.2, 0.025, 8, 24), mat.stainless).rotateX(Math.PI / 2).translateZ(-0.72));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    g.add(rod(V(0, 0.72, 0), V(Math.cos(a) * 0.2, 0.72, Math.sin(a) * 0.2), 0.012, mat.stainless, 5));
  }
  // bench round the inside
  const cushion = M(new THREE.TorusGeometry(0.62, 0.07, 8, 40), std({ color: '#e6d6bb', roughness: 0.75 }));
  cushion.rotation.x = Math.PI / 2;
  cushion.position.y = 0.56;
  cushion.scale.z = 0.7;
  g.add(cushion);
  const riders = [];
  for (let k = 0; k < 2; k++) {
    const psi = (k + 0.5) * Math.PI; // seats across the cup, away from the handle
    const x = Math.cos(psi) * 0.56, z = Math.sin(psi) * 0.56;
    const p = person(looks[k], { kind: 'sit' });
    p.position.set(x, 0.62, z);
    p.rotation.y = Math.atan2(-x, -z);
    g.add(p);
    riders.push(p);
  }
  g.scale.setScalar(CUP_S);
  return { g, riders };
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  // static: round plinth, apron and a low white rail (32 posts)
  root.add(M(new THREE.CylinderGeometry(5.75, 5.85, 0.24, 72), mat.concrete).translateY(0.12));
  root.add(M(new THREE.CylinderGeometry(5.7, 5.7, 0.06, 72), mat.slabs).translateY(0.27));
  const railM = std({ color: '#f4efe6', roughness: 0.45, metalness: 0.2 });
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    root.add(rod(V(Math.cos(a) * 5.62, 0.3, Math.sin(a) * 5.62), V(Math.cos(a) * 5.62, 1.0, Math.sin(a) * 5.62), 0.025, railM, 6));
  }
  for (const y of [0.62, 0.98]) root.add(M(new THREE.TorusGeometry(5.62, y > 0.9 ? 0.035 : 0.02, 6, 96), railM).rotateX(Math.PI / 2).translateZ(-y));

  // turning floor: pastel deck with 16 alternating inlays (a 45-degree pattern) and a gold rim
  const spin = new THREE.Group();
  root.add(spin);
  spin.add(M(new THREE.CylinderGeometry(FLOOR_R, FLOOR_R, 0.12, 96), std({ color: '#f3e3ec', roughness: 0.6, map: K.tx.paint.map })).translateY(DECK_Y - 0.06));
  const inlay = std({ color: '#e9a9c6', roughness: 0.6 });
  for (let k = 0; k < 16; k += 2) {
    const w = M(new THREE.RingGeometry(1.1, FLOOR_R - 0.25, 6, 1, (k / 16) * TAU, TAU / 16), inlay, false, true);
    w.rotation.x = -Math.PI / 2;
    w.position.y = DECK_Y + 0.004;
    spin.add(w);
  }
  spin.add(M(new THREE.TorusGeometry(FLOOR_R, 0.05, 8, 96), std({ color: '#d9ad4f', metalness: 1, roughness: 0.3 })).rotateX(Math.PI / 2).translateZ(-DECK_Y));

  // four turntables, two cup pairs alternating (j and j + 2 alike)
  const pairs = [['#d8402e', '#2f86cf'], ['#f1c232', '#8a55cc']];
  const subMats = [std({ color: '#b98bd0', roughness: 0.5, metalness: 0.15 }), std({ color: '#86c2c9', roughness: 0.5, metalness: 0.15 })];
  const looks = [
    [randomLook(1101, { child: true, balloon: null, backpack: null, bag: null }), randomLook(1104, { child: false, female: true, balloon: null, backpack: null, bag: null })],
    [randomLook(1107, { child: false, female: false, balloon: null, backpack: null, bag: null }), randomLook(1110, { child: true, balloon: null, backpack: null, bag: null })],
    [randomLook(1113, { child: true, female: true, balloon: null, backpack: null, bag: null }), randomLook(1116, { child: true, female: false, balloon: null, backpack: null, bag: null })],
    [randomLook(1119, { child: false, female: true, balloon: null, backpack: null, bag: null }), randomLook(1122, { child: false, female: false, balloon: null, backpack: null, bag: null })],
  ];
  const subs = [];
  const riders = [];
  for (let j = 0; j < 4; j++) {
    const th = TEACUP.subAngles[j];
    const sub = new THREE.Group();
    sub.position.set(Math.cos(th) * SUB_RING, DECK_Y, Math.sin(th) * SUB_RING);
    spin.add(sub);
    sub.add(M(new THREE.CylinderGeometry(SUB_R, SUB_R, 0.14, 64), subMats[j % 2]).translateY(0.07));
    sub.add(M(new THREE.TorusGeometry(SUB_R, 0.045, 8, 64), std({ color: '#f4efe6', roughness: 0.4, metalness: 0.3 })).rotateX(Math.PI / 2).translateZ(-0.14));
    sub.add(M(new THREE.CylinderGeometry(0.28, 0.34, 0.12, 24), mat.stainless).translateY(0.2));
    const cups = [];
    for (let k = 0; k < 2; k++) {
      const psi = TEACUP.cupAngles[k];
      const c = teacup(K, pairs[j % 2][k], looks[(j % 2) * 2 + k]);
      c.g.position.set(Math.cos(psi) * CUP_RING, 0.14, Math.sin(psi) * CUP_RING);
      sub.add(c.g);
      cups.push({ g: c.g, base: -psi });
      riders.push(...c.riders);
    }
    subs.push({ sub, base: -th, cups });
  }

  // static hub: fluted green column with gold bands, a saucer canopy with bulbs, a sugar-bowl dome and a yellow knob
  const hubGlaze = glaze('#5fa338');
  root.add(M(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 40), mat.concrete).translateY(0.5));
  root.add(M(new THREE.CylinderGeometry(0.5, 0.56, 3.3, 32), hubGlaze).translateY(2.4));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    root.add(rod(V(Math.cos(a) * 0.53, 0.8, Math.sin(a) * 0.53), V(Math.cos(a) * 0.48, 4.0, Math.sin(a) * 0.48), 0.03, hubGlaze, 6));
  }
  const gold = std({ color: '#d9ad4f', metalness: 1, roughness: 0.3 });
  for (const y of [0.78, 2.4, 4.0]) root.add(M(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 32), gold).translateY(y));
  root.add(lathe([[0.3, 4.05], [0.9, 4.12], [1.5, 4.28], [1.72, 4.44], [1.74, 4.5], [1.6, 4.48], [1.0, 4.4], [0.3, 4.38]], 64, glaze('#fbf3e4')));
  root.add(M(new THREE.TorusGeometry(1.73, 0.03, 6, 64), gold).rotateX(Math.PI / 2).translateZ(-4.47));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), K.ringBulb, 32);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; m4.makeTranslation(Math.cos(a) * 1.68, 4.52, Math.sin(a) * 1.68); bulbs.setMatrixAt(i, m4); }
  root.add(bulbs);
  root.add(lathe([[0, 4.4], [0.55, 4.42], [0.82, 4.62], [0.95, 4.95], [0.92, 5.3], [0.78, 5.55], [0.62, 5.66], [0.66, 5.72], [0.4, 5.86], [0, 5.9]], 48, hubGlaze));
  root.add(M(new THREE.TorusGeometry(0.94, 0.03, 6, 48), gold).rotateX(Math.PI / 2).translateZ(-4.98));
  root.add(M(new THREE.CylinderGeometry(0.08, 0.12, 0.2, 16), gold).translateY(5.98));
  root.add(M(new THREE.SphereGeometry(0.3, 24, 16), glaze('#f2c230')).translateY(6.2));

  const pose = (a, full) => {
    const A = teacupAngles(a);
    spin.rotation.y = A.floor;
    for (const s of subs) {
      s.sub.rotation.y = s.base + A.sub;
      for (const c of s.cups) c.g.rotation.y = c.base + A.cup;
    }
    for (const r of riders) r.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = cycleKeys('teacup_twirl', { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`);
    cycleD2('teacup_twirl', groups, { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`, TEACUP.d2Step);
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, keys2: g.keys2, pose: () => m.pose(g.angle / 32, g.full) }));
    B.log(`teacup_twirl: ${pictures.length} pictures`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'teacup_twirl', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
