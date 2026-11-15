// Spiral Slide (gentle flat ride, 2 x 2 tiles, 14.5 m): a round white tower with blue bands, a violet hut on top
// under a blue-and-white striped cone roof with a pennant, and a slide chute (blue-and-white lining, violet shell)
// winding 2.25 turns round the tower, held by brackets, to a run-out at the back-left where riders land on the sim's
// exit tile (the back-row tile of the gate column; the queue and door are on its front-row tile, towerMotion.js
// TOWER_GATES). Riders sit on coir mats, four on
// the slide a quarter of its length apart in two alternating looks; they slide the whole length once per turn, so
// the picture repeats every half turn (period 16 angle slots, 8 pictures; towerMotion.js), and the game's 2 turns
// per run (REVOLUTIONS default) end where they started. Empty, the ride is at rest (the game runs a ride only with riders): one picture. Front (door, run-out):
// one set per view turn.
import { THREE, kit, placeOnFootprint, bakeObject } from './common.js';
import { M, V, rod, std, rep } from '../kit.js';
import * as T from '../textures.js';
import { frames, sweep, onTrack, rider } from '../rides.js';
import { SLIDE_RIDERS, SLIDE_RUNOUT, TOWER_GATES, slideAt, towerKeys } from './towerMotion.js';

const G = TOWER_GATES.spiral_slide;

const TOWER_R0 = 1.6; // at the foot
const TOWER_R1 = 1.4; // under the top deck
const TOP = 10.2; // top deck
const RR = 2.75; // slide centreline radius
const TURNS = 2.25;
const Y_START = 9.75;
const Y_END = 0.95;

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const blue = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#2f8fc8', metalness: 0.15, roughness: 0.45, clearcoat: 0.4 });
  const violet = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#6d47b8', metalness: 0.1, roughness: 0.45, clearcoat: 0.5 });
  const render = std({ map: K.tx.paint.map, color: '#f3f1ea', roughness: 0.7 });
  const bandsTex = T.stripes('#2f8fc8', '#eef6fb', 16, false).map;
  // pad and deck
  root.add(M(new THREE.BoxGeometry(7.7, 0.22, 7.7), mat.concrete).translateY(0.11));
  root.add(M(new THREE.CylinderGeometry(3.7, 3.7, 0.08, 64), mat.slabs).translateY(0.26));
  // tower with bands, door at the front-left, little windows up the stair
  root.add(M(new THREE.CylinderGeometry(TOWER_R1, TOWER_R0, TOP - 0.3, 48), render).translateY(0.3 + (TOP - 0.3) / 2));
  const rAt = (y) => TOWER_R0 + (TOWER_R1 - TOWER_R0) * ((y - 0.3) / (TOP - 0.3));
  for (const y of [1.0, 3.4, 5.8, 8.2]) root.add(M(new THREE.CylinderGeometry(rAt(y + 0.3) + 0.02, rAt(y - 0.3) + 0.02, 0.6, 48), blue).translateY(y));
  const doorA = (Math.PI * 2) / 3;
  const door = new THREE.Group();
  door.position.set(Math.cos(doorA) * (TOWER_R0 - 0.02), 0.3, Math.sin(doorA) * (TOWER_R0 - 0.02));
  door.rotation.y = Math.PI / 2 - doorA;
  root.add(door);
  door.add(M(new THREE.BoxGeometry(1.05, 2.15, 0.12), blue).translateY(1.08));
  door.add(M(new THREE.BoxGeometry(0.85, 1.95, 0.08), std({ color: '#2c3d52', roughness: 0.55 })).translateY(1.0).translateZ(0.05));
  for (let k = 0; k < 4; k++) {
    const y = 2.4 + k * 2.1, a = doorA + 0.9 + k * 1.6;
    const wdw = M(new THREE.BoxGeometry(0.32, 0.55, 0.08), K.windowGlow);
    wdw.position.set(Math.cos(a) * rAt(y), y, Math.sin(a) * rAt(y));
    wdw.rotation.y = Math.PI / 2 - a;
    root.add(wdw);
  }
  // top deck with a railing, hut, striped cone roof, pennant
  root.add(M(new THREE.CylinderGeometry(2.0, 2.0, 0.2, 48), mat.boards).translateY(TOP));
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    if (Math.abs(Math.cos((a0 + a1) / 2) - 1) < 0.03) continue; // the slide start on the right (+x)
    const p0 = V(Math.cos(a0) * 1.92, TOP + 0.1, Math.sin(a0) * 1.92), p1 = V(Math.cos(a1) * 1.92, TOP + 0.1, Math.sin(a1) * 1.92);
    root.add(rod(p0, p0.clone().setY(TOP + 1.05), 0.025, mat.whiteTimber, 5));
    root.add(rod(p0.clone().setY(TOP + 1.05), p1.clone().setY(TOP + 1.05), 0.03, mat.whiteTimber, 5));
  }
  const hutMat = violet.clone();
  hutMat.side = THREE.DoubleSide;
  const hut = M(new THREE.CylinderGeometry(1.45, 1.5, 1.5, 32, 1, true, 0, Math.PI * 1.75), hutMat);
  hut.rotation.y = Math.PI / 2 - Math.PI * 1.875; // the opening (theta 1.75..2 pi) turned to face the slide start (+x)
  hut.position.y = TOP + 0.85;
  root.add(hut);
  root.add(M(new THREE.CylinderGeometry(1.55, 1.55, 0.14, 32), mat.whiteTimber).translateY(TOP + 1.65));
  const roof = M(new THREE.ConeGeometry(2.05, 2.25, 32, 1, true), std({ map: rep(bandsTex, 1, 1), roughness: 0.6, side: THREE.DoubleSide }));
  roof.position.y = TOP + 1.72 + 1.12;
  root.add(roof);
  root.add(rod(V(0, TOP + 3.9, 0), V(0, 14.45, 0), 0.03, mat.darkSteel, 6));
  const flag = M(new THREE.PlaneGeometry(0.75, 0.4), std({ color: '#7fd0f0', roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(0.38, 14.2, 0);
  root.add(flag);
  // the chute: a helix from the right of the top deck, 2.25 turns down (the angle decreases: right, back, left, front;
  // its low last turn passes the door 3.2 m up) to the back, then a straight run-out to the left along the back row:
  // riders land at the exit (G.exit) and the chute ends SLIDE_RUNOUT further on, inside the exit tile
  const A_END = -Math.PI / 2;
  const pts = [];
  const NSP = 200;
  for (let i = 0; i <= NSP; i++) {
    const t = i / NSP, a = A_END + TURNS * Math.PI * 2 * (1 - t);
    pts.push(V(Math.cos(a) * RR, Y_START - (Y_START - Y_END) * t, Math.sin(a) * RR));
  }
  const [gx, gz] = G.exit;
  pts.push(V(-1.6, 0.72, gz), V(gx - SLIDE_RUNOUT, 0.6, gz));
  const F = frames(pts, { closed: false, step: 0.14, bankMax: 0.35, bankScale: 0.4, smooth: 6 });
  const lining = std({ map: rep(bandsTex, 1, 1), roughness: 0.3, side: THREE.DoubleSide });
  const inner = [[[-0.6, 0.4], [-0.58, 0.06], [-0.44, -0.04], [0.44, -0.04], [0.58, 0.06], [0.6, 0.4]]];
  root.add(sweep(F, inner, lining, { uvLen: 16 }));
  root.add(sweep(F, [[[0.6, 0.4], [0.68, 0.36], [0.69, -0.14], [-0.69, -0.14], [-0.68, 0.36], [-0.6, 0.4]]], violet));
  // brackets from under the chute to the tower, and legs under the run-out
  for (let i = 10; i < F.NS - 20; i += 9) {
    const p = F.P[i];
    if (p.y < 0.9) continue;
    const toward = V(p.x, 0, p.z).normalize();
    const r = rAt(p.y - 0.7) - 0.05;
    root.add(rod(p.clone().add(V(0, -0.15, 0)), V(toward.x * r, p.y - 0.75, toward.z * r), 0.04, mat.stainless, 6));
  }
  for (const k of [F.NS - 14, F.NS - 2]) { const p = F.P[k]; root.add(rod(V(p.x, 0.28, p.z), p.clone().add(V(0, -0.15, 0)), 0.05, mat.stainless, 6)); }
  // mat stack beside the run-out's end, and a queue rail from the entrance (G.entrance, the pad's front edge) to the door
  const matCols = ['#a07a4a', '#8e6a3e', '#b38a56'];
  for (let k = 0; k < 6; k++) root.add(M(new THREE.BoxGeometry(0.6, 0.04, 1.25), std({ color: matCols[k % 3], roughness: 0.95 })).translateX(gx - 1.3).translateY(0.32 + k * 0.045).translateZ(gz + 1.45));
  const [ex, ez] = G.entrance;
  for (const z of [1.9, ez]) root.add(rod(V(ex + 0.3, 0.3, z), V(ex + 0.3, 1.25, z), 0.03, mat.stainless, 6));
  root.add(rod(V(ex + 0.3, 1.25, 1.9), V(ex + 0.3, 1.25, ez), 0.03, mat.stainless, 6));
  // riders on mats, two looks alternating
  const looks = [{ child: true }, { child: false }];
  const slots = [];
  // riders slide down to the landing: the first run-out point at or past the exit's x
  let land = F.NS;
  while (land > 0 && F.P[land - 1].x <= gx) land--;
  for (let i = 0; i < SLIDE_RIDERS; i++) {
    const holder = new THREE.Group();
    root.add(holder);
    holder.add(M(new THREE.BoxGeometry(0.55, 0.035, 1.25), std({ color: matCols[i % 2], roughness: 0.95 })));
    const p = rider(K, 1600 + (i % 2), { kind: 'slide' }, looks[i % 2]);
    p.position.set(0, 0.03, -0.3);
    holder.add(p);
    slots.push(holder);
  }
  const pose = (slot, full) => {
    slots.forEach((h, i) => {
      h.visible = full;
      onTrack(F, 3 + slideAt(i, slot) * (land - 3), h);
    });
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = towerKeys('spiral_slide');
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, pose: () => m.pose(g.angle, g.full) }));
    B.log(`spiral_slide: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'spiral_slide', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
