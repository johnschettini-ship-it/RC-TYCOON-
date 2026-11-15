// Rocket Rounds (round flat ride, 3 x 3 tiles, 10.5 m): six two-seat rockets on lifting arms round a turning drum,
// under a static banded mast with a ringed planet on top. Each arm is a parallelogram (the rocket stays level) raised
// by a hydraulic ram; the riders work their own lever, so each rocket rides at its own height.
// Motion, as a function of the game's ride angle a (0-1 per revolution; REVOLUTIONS default 2): the drum turns +a
// turns; the arms rise twice per revolution, sin^2(2 pi a) (down at a = 0, so a stopped ride stands loaded at the
// deck), with a per-rocket share cos(2 pi (2a + i/3)). Rockets are coloured i % 3 (opposite rockets alike) and their
// riders copied the same way, so the state at a + 1/2 is the state at a turned 180 degrees: period 16 angle slots,
// 8 pictures per occupancy. Round, static parts 90-degree symmetric (8 stars, 16 bulbs): one set for every view turn.
import { THREE, kit, placeOnFootprint, bakeObject } from './common.js';
import { cycleKeys } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { person, randomLook } from '../people.js';

/** Angle slots per repeat (half a turn). */
export const PERIOD = 16;
const TAU = Math.PI * 2;
const N = 6;
const PIVOT_R = 1.2;
const PIVOT_Y = 1.55;
const ARM = 3.25;
const A_MIN = (-12 * Math.PI) / 180;
const A_MAX = (32 * Math.PI) / 180;
const LINK = 0.32; // height of the parallelogram

const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });

function lathe(pts, seg, mat, phiStart, phiLength) {
  return M(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLength), mat);
}

/** A rocket, nose towards +z, origin under its middle where the arm holds it. */
function rocket(K, color, looks) {
  const { mat } = K;
  const g = new THREE.Group();
  const hull = paint(color);
  const white = paint('#f2f1ec');
  const AX = 0.55; // axis height above the arm head
  const body = new THREE.Group();
  body.position.y = AX;
  body.rotation.x = Math.PI / 2; // the lathe's y axis becomes +z (the nose)
  g.add(body);
  // tail and nose closed; the middle open on top (the cockpit, phi round pi)
  body.add(lathe([[0, -1.15], [0.28, -1.15], [0.4, -0.98], [0.47, -0.72]], 32, hull));
  const OPEN = 1.9;
  body.add(lathe([[0.47, -0.72], [0.5, -0.3], [0.5, 0.2], [0.48, 0.55]], 32, hull, Math.PI + OPEN / 2, TAU - OPEN));
  const liner = std({ color: '#2a2d33', roughness: 0.8, side: THREE.BackSide });
  body.add(lathe([[0.45, -0.7], [0.48, -0.3], [0.48, 0.2], [0.46, 0.53]], 32, liner, Math.PI + OPEN / 2, TAU - OPEN));
  body.add(lathe([[0.48, 0.55], [0.4, 0.9], [0.26, 1.18], [0.1, 1.4], [0, 1.47]], 32, white));
  // cockpit rim and seat bench
  const rim = std({ color: '#c9ccd0', metalness: 1, roughness: 0.3 });
  for (const zc of [-0.72, 0.55]) g.add(M(new THREE.BoxGeometry(0.62, 0.05, 0.06), rim).translateY(AX + 0.36).translateZ(zc));
  for (const s of [-1, 1]) g.add(M(new THREE.BoxGeometry(0.05, 0.05, 1.3), rim).translateX(s * 0.31).translateY(AX + 0.36).translateZ(-0.085));
  g.add(M(new THREE.BoxGeometry(0.62, 0.08, 1.2), std({ color: '#1f2226', roughness: 0.7 })).translateY(AX - 0.12).translateZ(-0.1));
  // three tail fins 120 degrees apart, one standing up behind the cockpit
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0.34, -0.3); finShape.lineTo(0.4, -0.62); finShape.lineTo(0, -0.44); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: false });
  finGeo.translate(0, 0, -0.025);
  for (const roll of [Math.PI / 2, Math.PI / 2 + (TAU / 3), Math.PI / 2 - (TAU / 3)]) {
    const f = M(finGeo, hull);
    // shape x = out from the hull, shape y = back along the rocket (-z)
    f.rotation.set(Math.PI / 2, 0, 0); // shape y -> -z
    const holder = new THREE.Group();
    holder.position.set(0, AX, -0.72);
    holder.rotation.z = roll;
    f.position.x = 0.36;
    holder.add(f);
    g.add(holder);
  }
  // nozzle and portholes
  g.add(M(new THREE.CylinderGeometry(0.2, 0.28, 0.24, 20, 1, true), mat.darkSteel).rotateX(Math.PI / 2).translateY(-1.25).translateZ(-AX));
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9ccbe8', roughness: 0.1, metalness: 0.2, clearcoat: 1 });
  for (const s of [-1, 1]) {
    const p = M(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), glass);
    p.rotation.z = Math.PI / 2;
    p.position.set(s * 0.47, AX + 0.05, 0.78);
    g.add(p);
  }
  // the arm head the rocket sits on
  g.add(M(new THREE.BoxGeometry(0.22, 0.22, 0.5), mat.darkSteel).translateY(0.11));
  const riders = [];
  [[0.22, 0], [-0.42, 1]].forEach(([z, k]) => {
    const p = person(looks[k], { kind: 'ride', legsHidden: true });
    p.position.set(0, AX - 0.06, z);
    g.add(p);
    riders.push(p);
  });
  return { g, riders };
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  // static: plinth, deck, a ring of eight stars, a low rail (32 posts)
  root.add(M(new THREE.CylinderGeometry(5.75, 5.85, 0.24, 72), mat.concrete).translateY(0.12));
  root.add(M(new THREE.CylinderGeometry(5.6, 5.6, 0.1, 72), std({ color: '#2a7c3c', roughness: 0.7, map: K.tx.paint.map })).translateY(0.29));
  root.add(M(new THREE.CylinderGeometry(4.95, 4.95, 0.03, 72), std({ color: '#d8f0dc', roughness: 0.75, map: K.tx.paint.map })).translateY(0.355));
  const starShape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.16 : 0.4;
    const a = (k / 10) * TAU + Math.PI / 2;
    if (k === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ShapeGeometry(starShape);
  const starMat = std({ color: '#f6d64a', roughness: 0.5, metalness: 0.2 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const s = M(starGeo, starMat, false, true);
    s.rotation.set(-Math.PI / 2, 0, -a);
    s.position.set(Math.cos(a) * 5.2, 0.346, Math.sin(a) * 5.2);
    root.add(s);
  }
  const railM = std({ color: '#f4f1ea', roughness: 0.45, metalness: 0.2 });
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    root.add(rod(V(Math.cos(a) * 5.62, 0.34, Math.sin(a) * 5.62), V(Math.cos(a) * 5.62, 1.0, Math.sin(a) * 5.62), 0.025, railM, 6));
  }
  root.add(M(new THREE.TorusGeometry(5.62, 0.035, 6, 96), railM).rotateX(Math.PI / 2).translateZ(-1.0));

  // turning drum with the six arms
  const spin = new THREE.Group();
  root.add(spin);
  const teal = paint('#2fb39a');
  spin.add(M(new THREE.CylinderGeometry(1.15, 1.25, 1.25, 48), teal).translateY(0.35 + 0.62));
  spin.add(M(new THREE.CylinderGeometry(1.2, 1.2, 0.1, 48), mat.stainless).translateY(1.62));
  const colors = ['#e8503a', '#3d9be0', '#f5d03b'];
  const looks = [0, 1, 2].map((c) => [
    randomLook(1201 + c * 7, { child: true, balloon: null, backpack: null, bag: null }),
    randomLook(1204 + c * 7, { child: c !== 1, balloon: null, backpack: null, bag: null }),
  ]);
  const armMat = paint('#e9e6df');
  const arms = [];
  const riders = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU;
    const holder = new THREE.Group(); // local x points out along the arm, rotation y = -th
    holder.rotation.y = -th;
    spin.add(holder);
    holder.add(M(new THREE.BoxGeometry(0.3, 0.5, 0.36), mat.darkSteel).translateX(PIVOT_R).translateY(PIVOT_Y + 0.12));
    const r = rocket(K, colors[i % 3], looks[i % 3]);
    // the nose points along the travel, toward decreasing angle (local -z of the holder)
    r.g.rotation.y = Math.PI;
    holder.add(r.g);
    riders.push(...r.riders);
    arms.push({ holder, rocket: r.g, parts: [], i });
  }
  // arm parts are rebuilt per pose (rods between moving points); keep them in a group per arm
  const pose = (a, full) => {
    spin.rotation.y = TAU * a;
    const s = Math.sin(TAU * a) ** 2;
    for (const arm of arms) {
      for (const p of arm.parts) arm.holder.remove(p);
      arm.parts.length = 0;
      const lift = s * (0.78 + 0.22 * Math.cos(TAU * (2 * a + arm.i / 3)));
      const al = A_MIN + (A_MAX - A_MIN) * lift;
      const c = Math.cos(al), sn = Math.sin(al);
      const p0 = V(PIVOT_R, PIVOT_Y, 0);
      const p1 = V(PIVOT_R + ARM * c, PIVOT_Y + ARM * sn, 0);
      const add = (o) => { arm.holder.add(o); arm.parts.push(o); };
      add(rod(p0, p1, 0.075, armMat, 10));
      add(rod(p0.clone().setY(p0.y + LINK), p1.clone().setY(p1.y + LINK), 0.035, mat.stainless, 8));
      add(rod(p1, p1.clone().setY(p1.y + LINK), 0.04, mat.darkSteel, 8));
      // hydraulic ram: barrel from the drum, piston to the arm
      const b0 = V(1.18, 0.62, 0);
      const b1 = V(PIVOT_R + 1.3 * c, PIVOT_Y + 1.3 * sn - 0.08, 0);
      const mid = b0.clone().lerp(b1, 0.55);
      add(rod(b0, mid, 0.07, mat.darkSteel, 10));
      add(rod(b0.clone().lerp(b1, 0.45), b1, 0.035, mat.stainless, 8));
      arm.rocket.position.set(p1.x, p1.y, 0);
    }
    for (const r of riders) r.visible = full;
  };

  // static mast: white column with three red bands, a teal collar, a ringed planet and a little aerial
  root.add(M(new THREE.CylinderGeometry(0.3, 0.34, 6.2, 32), paint('#f2f2f2')).translateY(1.65 + 3.1));
  const red = paint('#e8503a');
  for (const y of [2.6, 3.9, 5.2]) root.add(M(new THREE.CylinderGeometry(0.345, 0.345, 0.45, 32), red).translateY(y));
  root.add(M(new THREE.CylinderGeometry(0.62, 0.5, 0.5, 32), teal).translateY(7.95));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), K.ringBulb, 16);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) { const t = (i / 16) * TAU; m4.makeTranslation(Math.cos(t) * 0.63, 8.15, Math.sin(t) * 0.63); bulbs.setMatrixAt(i, m4); }
  root.add(bulbs);
  root.add(M(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 12), mat.stainless).translateY(8.45));
  const planet = paint('#8d5ad8');
  root.add(M(new THREE.SphereGeometry(0.85, 40, 24), planet).translateY(9.45));
  const band = paint('#b48bea');
  for (const [y, r] of [[9.75, 0.8], [9.15, 0.8]]) root.add(M(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.12, 40), band).translateY(y));
  const ring = M(new THREE.RingGeometry(1.1, 1.6, 64), new THREE.MeshPhysicalMaterial({ color: '#f5d03b', roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 9.45;
  root.add(ring);
  root.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), mat.stainless).translateY(10.45));
  root.add(M(new THREE.SphereGeometry(0.06, 10, 8), K.ringBulb).translateY(10.5));
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = cycleKeys('rocket_rounds', { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`);
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, pose: () => m.pose(g.angle / 32, g.full) }));
    B.log(`rocket_rounds: ${pictures.length} pictures`);
    bakeObject(B, { kind: 'ride', item: 'rocket_rounds', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
