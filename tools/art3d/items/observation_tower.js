// Observation Tower (gentle flat ride, 2 x 2 tiles, 32 m): a white steel mast with blue bands and a glazed ring
// cabin for 8 seated riders that climbs the mast and comes back down once per turn (today's `wave(angle)`), on a
// square concrete pad with a timber boarding deck, a railing with the entrance at the front and an operator's booth.
// The motion is not a rotation, so the 16 even angle slots are 16 time steps of the lift (towerMotion.js timeKeys);
// the game turns 2 turns per run (REVOLUTIONS default), so the cabin rises twice per run and ends at the deck.
// Steps at the same height share a picture (9 heights); empty, the ride is at rest (the game runs a ride only with
// riders): one picture. Front (entrance, booth): one set per view turn.
import { THREE, kit, placeOnFootprint, bakeObject } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { rider } from '../rides.js';
import { HEIGHT_Q, heightStep, towerKeys } from './towerMotion.js';

const MAST_R = 0.55;
const MAST_TOP = 29.4;
const CAB_R = 2.3;
const CAB_REST = 0.52; // cabin floor top at rest (boarding level, one step above the deck)
const CAB_TRAVEL = 25.4; // floor top at the top: 25.9 m, the roof stays under the head housing
const SEATS = 8;

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const navy = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#20577f', metalness: 0.35, roughness: 0.45, clearcoat: 0.5 });
  const sky = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#3f9fd2', metalness: 0.3, roughness: 0.4, clearcoat: 0.5 });
  // pad, deck, railing (entrance gap at the front, +z)
  root.add(M(new THREE.BoxGeometry(7.7, 0.25, 7.7), mat.concrete).translateY(0.125));
  root.add(M(new THREE.CylinderGeometry(3.55, 3.6, 0.13, 64), mat.deck).translateY(0.315));
  const RR = 3.45;
  const N_RAIL = 40;
  for (let i = 0; i < N_RAIL; i++) {
    const a0 = (i / N_RAIL) * Math.PI * 2, a1 = ((i + 1) / N_RAIL) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (Math.abs(mid - Math.PI / 2) < 0.32) continue; // the entrance
    const p0 = V(Math.cos(a0) * RR, 0.38, Math.sin(a0) * RR), p1 = V(Math.cos(a1) * RR, 0.38, Math.sin(a1) * RR);
    root.add(rod(p0, p0.clone().setY(1.43), 0.028, mat.stainless, 6));
    root.add(rod(p0.clone().setY(1.43), p1.clone().setY(1.43), 0.03, mat.stainless, 6));
    root.add(rod(p0.clone().setY(0.9), p1.clone().setY(0.9), 0.018, mat.stainless, 6));
  }
  // entrance arch with a sign board
  for (const s of [-1, 1]) root.add(M(new THREE.BoxGeometry(0.14, 2.5, 0.14), navy).translateX(s * 1.15).translateY(1.6).translateZ(RR));
  root.add(M(new THREE.BoxGeometry(2.6, 0.42, 0.12), sky).translateY(2.75).translateZ(RR));
  // operator's booth on the front-left corner of the pad
  const booth = new THREE.Group();
  booth.position.set(-3.05, 0.25, 3.05);
  booth.rotation.y = Math.PI / 4;
  booth.add(M(new THREE.BoxGeometry(1.1, 1.0, 1.1), mat.whiteTimber).translateY(0.5));
  booth.add(M(new THREE.BoxGeometry(1.1, 0.95, 1.1), mat.glass, false).translateY(1.48));
  for (const [x, z] of [[-0.53, -0.53], [0.53, -0.53], [-0.53, 0.53], [0.53, 0.53]]) booth.add(M(new THREE.BoxGeometry(0.06, 0.95, 0.06), navy).translateX(x).translateY(1.48).translateZ(z));
  booth.add(M(new THREE.BoxGeometry(1.3, 0.12, 1.3), navy).translateY(2.0));
  root.add(booth);
  // the mast: flared foot, banded shaft, guide rails, head housing, antenna and beacon
  root.add(M(new THREE.CylinderGeometry(MAST_R + 0.06, 1.0, 2.0, 40), navy).translateY(1.38));
  root.add(M(new THREE.CylinderGeometry(MAST_R, MAST_R, MAST_TOP - 2.3, 40), mat.steelWhite).translateY(2.3 + (MAST_TOP - 2.3) / 2));
  for (let y = 4.5; y < MAST_TOP - 1; y += 3.6) root.add(M(new THREE.CylinderGeometry(MAST_R + 0.012, MAST_R + 0.012, 0.6, 40), sky).translateY(y));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const r = M(new THREE.BoxGeometry(0.1, MAST_TOP - 2.6, 0.08), mat.darkSteel);
    r.position.set(Math.cos(a) * (MAST_R + 0.03), 2.4 + (MAST_TOP - 2.6) / 2, Math.sin(a) * (MAST_R + 0.03));
    r.rotation.y = -a;
    root.add(r);
  }
  root.add(M(new THREE.CylinderGeometry(1.05, 0.9, 1.5, 40), navy).translateY(MAST_TOP + 0.75));
  root.add(M(new THREE.CylinderGeometry(1.12, 1.12, 0.14, 40), mat.steelWhite).translateY(MAST_TOP + 1.55));
  root.add(M(new THREE.ConeGeometry(0.95, 0.6, 40), sky).translateY(MAST_TOP + 1.92));
  root.add(rod(V(0, MAST_TOP + 2.1, 0), V(0, 31.7, 0), 0.04, mat.darkSteel, 8));
  root.add(M(new THREE.SphereGeometry(0.15, 12, 8), K.bulb('#ff3b2e', 1.6, 8)).translateY(31.82));
  // the cabin
  const cab = new THREE.Group();
  root.add(cab);
  cab.add(M(new THREE.CylinderGeometry(CAB_R + 0.05, CAB_R - 0.15, 0.3, 64), navy).translateY(-0.15));
  cab.add(M(new THREE.CylinderGeometry(CAB_R - 0.05, CAB_R - 0.05, 0.03, 64), mat.boards).translateY(0.015));
  cab.add(M(new THREE.CylinderGeometry(0.85, 0.85, 2.5, 32), mat.cream).translateY(1.25)); // drive sleeve round the mast
  const GH = 1.95;
  cab.add(M(new THREE.CylinderGeometry(CAB_R - 0.02, CAB_R - 0.02, GH, 64, 1, true), mat.glass, false).translateY(0.1 + GH / 2));
  cab.add(M(new THREE.CylinderGeometry(CAB_R + 0.01, CAB_R + 0.01, 0.42, 64, 1, true), navy).translateY(0.3));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const p = V(Math.cos(a) * CAB_R, 0, Math.sin(a) * CAB_R);
    cab.add(rod(p.clone().setY(0.1), p.clone().setY(0.1 + GH), 0.035, navy, 6));
  }
  cab.add(M(new THREE.TorusGeometry(CAB_R - 0.12, 0.025, 6, 64), mat.stainless).rotateX(Math.PI / 2).translateZ(-1.05));
  const roofY = 0.1 + GH;
  cab.add(M(new THREE.CylinderGeometry(CAB_R + 0.12, CAB_R + 0.12, 0.34, 64), sky).translateY(roofY + 0.17));
  cab.add(M(new THREE.CylinderGeometry(1.2, CAB_R + 0.05, 0.28, 64), mat.steelWhite).translateY(roofY + 0.48));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), K.ringBulb, 48);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * (CAB_R + 0.14), roofY + 0.05, Math.sin(a) * (CAB_R + 0.14)); bulbs.setMatrixAt(i, m4); }
  cab.add(bulbs);
  // seats round the sleeve, riders facing out through the glass
  const seatMat = std({ color: '#2a4f73', roughness: 0.55 });
  const riders = [];
  for (let i = 0; i < SEATS; i++) {
    const a = ((i + 0.5) / SEATS) * Math.PI * 2;
    const s = new THREE.Group();
    s.rotation.y = Math.PI / 2 - a; // local +z points out
    cab.add(s);
    s.add(M(new THREE.BoxGeometry(0.62, 0.08, 0.46), seatMat).translateY(0.44).translateZ(1.4));
    s.add(M(new THREE.BoxGeometry(0.62, 0.55, 0.07), seatMat).translateY(0.72).translateZ(1.15));
    s.add(M(new THREE.BoxGeometry(0.08, 0.4, 0.08), mat.darkSteel).translateY(0.2).translateZ(1.4));
    const p = rider(K, 1300 + i, { kind: 'sit' });
    p.position.set(0, 0.48, 1.3);
    s.add(p);
    riders.push(p);
  }
  const pose = (share, full) => {
    cab.position.y = CAB_REST + CAB_TRAVEL * share;
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = towerKeys('observation_tower');
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, pose: () => m.pose(heightStep('observation_tower', g.angle >> 1) / HEIGHT_Q, g.full) }));
    B.log(`observation_tower: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'observation_tower', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
