// Spinning Wheel Drop (thrill flat ride, 3 x 3 tiles = 12 x 12 m, 12 m): a turret on a round pad turns slowly while a
// telescopic arm carries a 9.6 m wheel of 16 outward-facing seats (20 riders max in the catalogue: 16 seats, the
// riders sit facing out with shoulder bars). Running (items/ridesB.js wheelPose, today's drawSpinWheelDrop): the wheel
// spins flat at boarding height, then the arm rises 3.9 m while a hydraulic ram tilts the wheel up to 75 degrees, holds
// it near vertical, and lowers it flat again; the turret turns once per turn so the wheel tilts towards every side in
// turn. Period 32 slots: 16 pictures full, one at rest. Round (a ring fence with four gaps, no front): rot 'all'.
// Colour part: the wheel, its raspberry rim and skirt (the seats, spokes and turret keep theirs); base #d6336c.
import { THREE, kit, placeOnFootprint, bakeObject, colourMesh, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { rider } from '../rides.js';
import { wheelKeys, wheelPose, WHEEL } from './ridesB.js';

/** The wheel's raspberry (rim and skirt, #d6336c). */
const BASE_COLOUR = '#d6336c';
const R = 4.4; // rim radius
const HUB0 = 1.5; // hub height with the wheel flat
const RISE = 3.9;
const UP = new THREE.Vector3(0, 1, 0);

/** Put a unit cylinder (height 1 along y) between a and b. */
function aim(mesh, a, b) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(1, a.distanceTo(b), 1);
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const paint = (color) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const rasp = paint('#d6336c');
  const grey = paint('#3a3f45');
  const yellow = paint('#f5c518');
  const blue = paint('#2e86de');
  // ground: pad, deck, a ring fence with four gaps
  root.add(M(new THREE.CylinderGeometry(5.95, 5.95, 0.25, 96), mat.concrete).translateY(0.125));
  root.add(M(new THREE.CylinderGeometry(5.6, 5.6, 0.06, 96), mat.slabs).translateY(0.28));
  for (let q = 0; q < 4; q++) {
    for (let i = 0; i < 4; i++) {
      const a0 = (q / 4) * Math.PI * 2 + 0.22 + i * 0.27, a1 = a0 + 0.27;
      const p0 = V(Math.cos(a0) * 5.75, 0.3, Math.sin(a0) * 5.75), p1 = V(Math.cos(a1) * 5.75, 0.3, Math.sin(a1) * 5.75);
      root.add(rod(p0, p0.clone().setY(1.2), 0.04, mat.stainless, 6));
      if (i === 3) root.add(rod(p1, p1.clone().setY(1.2), 0.04, mat.stainless, 6));
      root.add(rod(p0.clone().setY(1.15), p1.clone().setY(1.15), 0.03, mat.stainless, 6));
    }
  }
  // turret (turns): a drum with a yellow band, the telescopic arm and the tilt ram
  const turret = new THREE.Group();
  root.add(turret);
  turret.add(M(new THREE.CylinderGeometry(1.3, 1.45, 0.7, 40), grey).translateY(0.65));
  turret.add(M(new THREE.CylinderGeometry(1.32, 1.32, 0.12, 40), yellow).translateY(0.9));
  turret.add(M(new THREE.CylinderGeometry(0.42, 0.48, 0.5, 24), mat.darkSteel).translateY(1.2));
  const inner = M(new THREE.CylinderGeometry(0.26, 0.26, 1, 20), mat.stainless);
  turret.add(inner);
  const ramA = M(new THREE.CylinderGeometry(0.12, 0.12, 1, 12), grey);
  const ramB = M(new THREE.CylinderGeometry(0.07, 0.07, 1, 12), mat.stainless);
  turret.add(ramA, ramB);
  const hub = new THREE.Group();
  turret.add(hub);
  const lean = new THREE.Group();
  hub.add(lean);
  lean.add(M(new THREE.SphereGeometry(0.42, 20, 14), grey));
  const ramPin = new THREE.Object3D();
  ramPin.position.set(1.6, -0.2, 0);
  lean.add(ramPin);
  lean.add(rod(V(0, 0, 0), V(1.6, -0.2, 0), 0.1, grey, 10));
  const wheel = new THREE.Group();
  lean.add(wheel);
  wheel.add(M(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 32), yellow));
  wheel.add(M(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 24), mat.darkSteel));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    wheel.add(rod(V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6), V(Math.cos(a) * (R - 0.1), -0.05, Math.sin(a) * (R - 0.1)), 0.09, mat.steelWhite, 10));
  }
  wheel.add(M(new THREE.TorusGeometry(R - 0.8, 0.08, 8, 96), mat.steelWhite).rotateX(Math.PI / 2));
  // the deck ring the seats stand on, the raspberry rim and skirt (the colour part), a bulb ring
  const ringFloor = M(new THREE.RingGeometry(R - 0.85, R + 0.05, 96, 1), std({ color: '#5a6068', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }));
  ringFloor.rotation.x = -Math.PI / 2;
  ringFloor.position.y = -0.12;
  wheel.add(ringFloor);
  wheel.add(colourMesh(M(new THREE.TorusGeometry(R, 0.16, 10, 128), rasp).rotateX(Math.PI / 2)));
  const skirt = colourMesh(M(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.42, 128, 1, true), rasp));
  skirt.position.y = -0.3;
  wheel.add(skirt);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), K.ringBulb, 64);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * (R + 0.04), -0.32, Math.sin(a) * (R + 0.04)); bulbs.setMatrixAt(i, m4); }
  wheel.add(bulbs);
  // 16 seats facing out: a tall back panel, a seat pan, shoulder bars; the riders sit facing out
  const seatMat = std({ color: '#262626', roughness: 0.6 });
  const riders = [];
  for (let i = 0; i < WHEEL.seats; i++) {
    const a = (i / WHEEL.seats) * Math.PI * 2;
    const s = new THREE.Group();
    s.position.set(Math.cos(a) * (R - 0.45), 0, Math.sin(a) * (R - 0.45));
    s.rotation.y = -a; // local +x points out
    wheel.add(s);
    s.add(M(new THREE.BoxGeometry(0.1, 1.25, 0.56), i % 2 ? blue : yellow).translateX(-0.18).translateY(0.6));
    s.add(M(new THREE.BoxGeometry(0.46, 0.08, 0.5), seatMat).translateX(0.06).translateY(0.42));
    for (const z of [-0.17, 0.17]) s.add(rod(V(-0.1, 1.15, z), V(0.32, 0.72, z), 0.035, mat.darkSteel, 6));
    const p = rider(K, 1900 + i, { kind: 'sit' });
    p.position.set(-0.08, 0.46, 0);
    p.rotation.y = Math.PI / 2; // faces out
    s.add(p);
    riders.push(p);
  }
  const foot = V(1.0, 1.0, 0); // the ram's foot on the turret, under the side of the wheel that rises
  const pose = (slot, full) => {
    const p = wheelPose(slot);
    turret.rotation.y = p.heading;
    const hy = HUB0 + RISE * p.lift;
    hub.position.y = hy;
    lean.rotation.z = p.tilt; // the +x side (the ram's lever) goes up
    wheel.rotation.y = p.spin;
    aim(inner, V(0, 1.3, 0), V(0, hy, 0));
    turret.updateWorldMatrix(true, true);
    const pin = turret.worldToLocal(ramPin.getWorldPosition(new THREE.Vector3()));
    const mid = foot.clone().lerp(pin, 0.55);
    aim(ramA, foot, mid);
    aim(ramB, mid, pin);
    for (const r of riders) r.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = wheelKeys();
    const pictures = [...groups.values()].map((gr) => ({ keys: gr.keys, keys2: gr.keys2, pose: () => m.pose(gr.angle, gr.full) }));
    B.log(`spin_wheel_drop: ${pictures.length} pictures`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'spin_wheel_drop', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
