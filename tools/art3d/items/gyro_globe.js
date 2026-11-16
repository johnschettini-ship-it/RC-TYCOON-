// Gyro Globe (thrill flat ride, 3 x 3 tiles, 14 m): a three-axis gimbal on a short turntable pedestal. The red
// outer ring stands upright and turns about the vertical axis (1x per turn); the orange middle ring turns inside it
// on the outer ring's level axle (2x); the rider pod - a ball with 8 open seats round its waist, riders facing out -
// spins inside the middle ring about the ring's own axis, hung from hubs above and below on four struts (3x). The
// angles follow today's look (st.angle x 1, 2, 3), so the pictures repeat only after a whole turn: period 32 angle
// slots, 16 pictures full and one at rest empty (the game runs a ride only with riders; towerMotion.js cycleKeys),
// and the game's 2 turns per run (REVOLUTIONS default) end where they started. Round, with no entrance (a ring of bollards): one set serves every view turn.
// Colour part: the outer gimbal, its red ring, yoke and arms (the red plinth keeps its colour); base #c3322a.
import { THREE, kit, placeOnFootprint, bakeObject, colourMesh, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { rider } from '../rides.js';
import { gyroAngles, towerKeys } from './towerMotion.js';

const C = 7.5; // gimbal centre height
const R1 = 5.3; // outer ring
const R2 = 4.4; // middle ring
const HUB = 2.3; // pod hubs above and below the centre
const SEATS = 8;
/** The outer gimbal's red (the same paint as the plinth, which keeps its own). */
const BASE_COLOUR = '#c3322a';

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#c3322a', metalness: 0.35, roughness: 0.4, clearcoat: 0.6 });
  const orange = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#ee8f2a', metalness: 0.3, roughness: 0.4, clearcoat: 0.6 });
  const yellow = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#f6c33a', metalness: 0.3, roughness: 0.4, clearcoat: 0.6 });
  const podShell = new THREE.MeshPhysicalMaterial({ color: '#a8261f', roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  // round pad, slab deck, 16 bollards with a chain (no entrance: the ride is round)
  root.add(M(new THREE.CylinderGeometry(5.95, 5.95, 0.25, 96), mat.concrete).translateY(0.125));
  root.add(M(new THREE.CylinderGeometry(5.7, 5.7, 0.06, 96), mat.slabs).translateY(0.28));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    const p = V(Math.cos(a) * 5.75, 0.3, Math.sin(a) * 5.75), p1 = V(Math.cos(a1) * 5.75, 0.3, Math.sin(a1) * 5.75);
    root.add(M(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 10), mat.darkSteel).translateX(p.x).translateY(0.7).translateZ(p.z));
    const sag = p.clone().add(p1).multiplyScalar(0.5).setY(0.85);
    root.add(rod(p.clone().setY(1.0), sag, 0.018, mat.chain, 4));
    root.add(rod(sag, p1.clone().setY(1.0), 0.018, mat.chain, 4));
  }
  // pedestal, bulb ring, turntable
  root.add(M(new THREE.CylinderGeometry(0.85, 1.35, 1.5, 40), red).translateY(0.31 + 0.75));
  root.add(M(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 40), yellow).translateY(1.87));
  const bulbsP = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), K.ringBulb, 20);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * 1.18, 0.65, Math.sin(a) * 1.18); bulbsP.setMatrixAt(i, m4); }
  root.add(bulbsP);
  // outer ring (turns about y): upright ring in its local x-y plane, on a yoke over the turntable
  const outer = new THREE.Group();
  root.add(outer);
  outer.add(M(new THREE.CylinderGeometry(0.75, 0.8, 0.35, 32), mat.darkSteel).translateY(2.1));
  const ringO = colourMesh(M(new THREE.TorusGeometry(R1, 0.2, 10, 128), red));
  ringO.position.y = C;
  outer.add(ringO);
  const yokeTop = V(0, 2.3, 0);
  outer.add(colourMesh(rod(yokeTop, V(0, C - R1, 0), 0.22, red, 12)));
  for (const s of [-1, 1]) {
    const a = -Math.PI / 2 + s * 0.62;
    outer.add(colourMesh(rod(V(s * 0.5, 2.25, 0), V(Math.cos(a) * R1, C + Math.sin(a) * R1, 0), 0.13, red, 10)));
  }
  for (const s of [-1, 1]) {
    // axle bearings of the middle ring, at the outer ring's level points
    const b = M(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 20), yellow);
    b.rotation.z = Math.PI / 2;
    b.position.set(s * R1, C, 0);
    outer.add(b);
  }
  const bulbsO = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), K.ringBulb, 64);
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * R1, C + Math.sin(a) * R1, 0.21); bulbsO.setMatrixAt(i, m4); }
  outer.add(bulbsO);
  // the crown light on top of the outer ring: a gold star and a lamp
  const crown = new THREE.Group();
  crown.position.y = C + R1 + 0.2;
  outer.add(crown);
  crown.add(M(new THREE.SphereGeometry(0.18, 14, 10), K.bulb('#fff1b0', 1.2, 9)).translateY(0.1));
  const st = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.17 : 0.4; if (i) st.lineTo(Math.cos(a) * r, Math.sin(a) * r); else st.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const sg = new THREE.ExtrudeGeometry(st, { depth: 0.08, bevelEnabled: false });
  sg.translate(0, 0, -0.04);
  crown.add(M(sg, mat.gold).translateY(0.55));
  // middle ring (turns about the outer ring's axle, local x): flat in its local x-z plane
  const middle = new THREE.Group();
  middle.position.y = C;
  outer.add(middle);
  middle.add(M(new THREE.TorusGeometry(R2, 0.16, 10, 112), orange).rotateX(Math.PI / 2));
  for (const s of [-1, 1]) middle.add(rod(V(s * (R2 - 0.1), 0, 0), V(s * (R1 - 0.2), 0, 0), 0.11, mat.stainless, 12));
  // pod hangers: struts from the ring's z points to hubs on the ring's axis (local y), above and below
  for (const y of [-HUB, HUB]) {
    for (const z of [-R2, R2]) middle.add(rod(V(0, 0, z * 0.98), V(0, y, 0), 0.1, orange, 10));
    middle.add(M(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 20), yellow).translateY(y));
  }
  // the pod (spins about local y)
  const pod = new THREE.Group();
  middle.add(pod);
  pod.add(rod(V(0, -HUB, 0), V(0, HUB, 0), 0.09, mat.stainless, 12));
  const ball = M(new THREE.SphereGeometry(1.0, 40, 24), podShell);
  ball.scale.y = 0.92;
  pod.add(ball);
  pod.add(M(new THREE.TorusGeometry(1.02, 0.07, 8, 64), yellow).rotateX(Math.PI / 2));
  pod.add(M(new THREE.CylinderGeometry(1.32, 1.32, 0.12, 48), mat.darkSteel).translateY(-0.42));
  const seatMat = std({ color: '#262626', roughness: 0.6 });
  const riders = [];
  for (let i = 0; i < SEATS; i++) {
    const a = (i / SEATS) * Math.PI * 2;
    const s = new THREE.Group();
    s.rotation.y = Math.PI / 2 - a; // local +z points out
    pod.add(s);
    const shellC = i % 2 ? yellow : orange;
    s.add(M(new THREE.BoxGeometry(0.5, 0.95, 0.1), shellC).translateY(0.05).translateZ(1.02));
    s.add(M(new THREE.BoxGeometry(0.48, 0.1, 0.42), seatMat).translateY(-0.36).translateZ(1.27));
    for (const sd of [-1, 1]) {
      const bar = M(new THREE.BoxGeometry(0.06, 0.55, 0.07), mat.darkSteel);
      bar.position.set(sd * 0.14, 0.02, 1.38);
      bar.rotation.x = 0.2;
      s.add(bar);
    }
    const p = rider(K, 1500 + i, { kind: 'dangle', armsUp: i % 3 === 0 });
    p.position.set(0, -0.31, 1.2);
    s.add(p);
    riders.push(p);
  }
  const pose = (slot, full) => {
    const [al, be, ga] = gyroAngles(slot);
    outer.rotation.y = al;
    middle.rotation.x = be;
    pod.rotation.y = ga;
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = towerKeys('gyro_globe');
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, keys2: g.keys2, pose: () => m.pose(g.angle, g.full) }));
    B.log(`gyro_globe: ${pictures.length} pictures`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'gyro_globe', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
