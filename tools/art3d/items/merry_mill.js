// Merry Mill (flat ride with a front, 3 x 3 tiles, 11.5 m): a painted smock-mill tower on a round stone base, its four
// lattice sails turning in front of it, each carrying a two-seat gondola that hangs level from the sail tip, so the
// sails work as a small wheel. The mill has a front (the sails, the door), so it bakes one set per view turn
// (rots [0, 1, 2, 3], flatRides.js NON_ROUND): a view turn shows it from another side, as a real windmill.
// Motion, as a function of the game's ride angle a (0-1 per revolution; REVOLUTIONS default 2): the sails turn -a turns
// about the windshaft (spinnerMotion.js millAngles). The four sails and gondolas are alike (one gondola colour, the
// same two rider looks in each), so the sails repeat every quarter turn: period 8 angle slots, 4 pictures per
// occupancy and view turn. (Earlier versions: a mill turning on its base needed 32 pictures, 40 MB per turn at
// density 4; a mill always facing the viewer read wrong after a view turn.)
// Colour part: the four gondolas' tubs (their yokes match the sails and keep theirs); base #8d7ae8.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { cycleD2, cycleKeys, d2Api } from './flatRides.js';
import { M, V, rod, std, rep } from '../kit.js';
import { person, randomLook } from '../people.js';
import { MILL, millAngles } from './spinnerMotion.js';

/** Angle slots per repeat (a quarter turn of the four alike sails). */
export const PERIOD = MILL.period;
const TAU = Math.PI * 2;
const BASE_Y = 0.85; // top of the stone base, where the mill stands
const TOWER_H = 5.55; // tower body from BASE_Y
const R_BOT = 1.42;
const R_TOP = 0.95;
const HUB_Y = MILL.hubY;
const SHAFT_Z = 1.6; // the sail plane, in front of the tower axis
const GZ = 0.9; // gondolas hang this far in front of the sail plane (clear of the sails at the top)
const SAIL = MILL.sail;
/** Turn of the mill on its footprint at sprite rotation 0: the windshaft (+z of the mill) points to the game's south. */
const FACING = 0;
/** The gondola tubs' colour. */
const BASE_COLOUR = '#8d7ae8';

const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 });

function lathe(pts, seg, mat) {
  return M(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
}

/** One sail along local +y from the hub: a stock, a lattice on its leading side and a cloth panel. */
function sail(K) {
  const { mat } = K;
  const g = new THREE.Group();
  const spar = paint('#4a3a8c');
  const frame = paint('#f1ede4');
  g.add(M(new THREE.BoxGeometry(0.16, SAIL - 0.2, 0.16), spar).translateY(0.2 + (SAIL - 0.2) / 2));
  const y0 = 0.9, y1 = SAIL - 0.05, w = 0.95;
  g.add(M(new THREE.BoxGeometry(0.06, y1 - y0, 0.08), frame).translateX(w).translateY((y0 + y1) / 2));
  for (let y = y0; y <= y1 + 1e-6; y += (y1 - y0) / 9) g.add(M(new THREE.BoxGeometry(w, 0.04, 0.06), frame).translateX(w / 2).translateY(y));
  const cloth = M(new THREE.PlaneGeometry(w - 0.08, y1 - y0 - 0.06), std({ color: '#f6f4ee', roughness: 0.9, side: THREE.DoubleSide }));
  cloth.position.set(w / 2, (y0 + y1) / 2, -0.05);
  g.add(cloth);
  // the gondola's hanger axle, from the sail tip forward through the gondola's yoke
  const axle = M(new THREE.CylinderGeometry(0.06, 0.06, GZ + 0.66, 12), mat.stainless);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, SAIL, (GZ + 0.66) / 2);
  g.add(axle);
  return g;
}

/** A gondola hanging from its axle at the origin: a yoke and an oval tub, two riders facing each other. */
function gondola(K, color, looks) {
  const { mat } = K;
  const g = new THREE.Group();
  const yoke = paint('#4a3a8c');
  for (const s of [-1, 1]) {
    g.add(M(new THREE.BoxGeometry(0.08, 0.95, 0.08), yoke).translateY(-0.475).translateZ(s * 0.56));
    const boss = M(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 14), mat.darkSteel);
    boss.rotation.x = Math.PI / 2;
    boss.position.z = s * 0.56;
    g.add(boss);
  }
  const tub = new THREE.Group();
  tub.position.y = -1.55;
  tub.scale.set(0.88, 1, 1);
  g.add(tub);
  const shell = colourPart(paint(color));
  tub.add(lathe([[0, 0], [0.5, 0], [0.58, 0.08], [0.62, 0.3], [0.63, 0.62], [0.6, 0.66], [0.58, 0.6], [0.56, 0.3], [0.48, 0.1], [0, 0.1]], 40, shell));
  tub.add(M(new THREE.TorusGeometry(0.615, 0.03, 8, 40), mat.brass).rotateX(Math.PI / 2).translateZ(-0.65));
  const bench = std({ color: '#f2ead8', roughness: 0.7 });
  for (const s of [-1, 1]) tub.add(M(new THREE.BoxGeometry(0.7, 0.08, 0.26), bench).translateY(0.36).translateZ(s * 0.36));
  const riders = [];
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1;
    const p = person(looks[k], { kind: 'sit' });
    p.position.set(0, -1.55 + 0.42, s * 0.36);
    p.rotation.y = s > 0 ? Math.PI : 0; // face the middle of the tub
    g.add(p);
    riders.push(p);
  }
  return { g, riders };
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  // static: plinth, deck, a stone path ring, a low rail (32 posts), the round stone base with a steel trim ring
  root.add(M(new THREE.CylinderGeometry(5.8, 5.9, 0.24, 72), mat.concrete).translateY(0.12));
  root.add(M(new THREE.CylinderGeometry(5.7, 5.7, 0.1, 72), std({ color: '#dfeaf7', roughness: 0.7, map: K.tx.paint.map })).translateY(0.29));
  const path = M(new THREE.CylinderGeometry(4.95, 4.95, 0.06, 96), mat.slabs);
  { const pg = path.geometry, uv = pg.attributes.uv, p = pg.attributes.position; for (let i = 0; i < uv.count; i++) if (p.getY(i) > 0) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3); }
  path.position.y = 0.36;
  root.add(path);
  const railM = std({ color: '#f4f6fb', roughness: 0.45, metalness: 0.2 });
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    root.add(rod(V(Math.cos(a) * 5.55, 0.34, Math.sin(a) * 5.55), V(Math.cos(a) * 5.55, 1.0, Math.sin(a) * 5.55), 0.025, railM, 6));
  }
  root.add(M(new THREE.TorusGeometry(5.55, 0.035, 6, 96), railM).rotateX(Math.PI / 2).translateZ(-1.0));
  root.add(M(new THREE.TorusGeometry(5.55, 0.02, 6, 96), railM).rotateX(Math.PI / 2).translateZ(-0.66));
  const stone = std({ map: rep(K.tx.stone.map, 3, 1), bumpMap: rep(K.tx.stone.bump, 3, 1), bumpScale: 1.5, roughness: 0.9 });
  root.add(M(new THREE.CylinderGeometry(1.5, 1.6, BASE_Y - 0.39, 48), stone).translateY(0.39 + (BASE_Y - 0.39) / 2));
  root.add(M(new THREE.CylinderGeometry(1.52, 1.52, 0.06, 48), mat.darkSteel).translateY(BASE_Y - 0.02));

  // the mill, its sails to the front (+z, game south) at sprite rotation 0
  const mill = new THREE.Group();
  mill.rotation.y = FACING;
  root.add(mill);
  const boards = std({ map: rep(K.tx.siding.map, 3, 4), bumpMap: rep(K.tx.siding.bump, 3, 4), bumpScale: 1, roughness: 0.7, color: '#56c3d4' });
  // octagonal smock tower, a flat face to the front (+z)
  const tower = M(new THREE.CylinderGeometry(R_TOP, R_BOT, TOWER_H, 8, 1, false, Math.PI / 8), boards);
  tower.position.y = BASE_Y + TOWER_H / 2;
  mill.add(tower);
  const trim = paint('#f4f1ea');
  mill.add(M(new THREE.CylinderGeometry(R_BOT + 0.06, R_BOT + 0.1, 0.22, 8, 1, false, Math.PI / 8), trim).translateY(BASE_Y + 0.11));
  mill.add(M(new THREE.CylinderGeometry(R_TOP + 0.12, R_TOP + 0.08, 0.16, 8, 1, false, Math.PI / 8), trim).translateY(BASE_Y + TOWER_H));
  // windows and a door on the faces: apothem at height y, faces tilted by the taper
  const taper = Math.atan((R_BOT - R_TOP) / TOWER_H);
  const apo = (y) => (R_BOT + ((R_TOP - R_BOT) * (y - BASE_Y)) / TOWER_H) * Math.cos(Math.PI / 8);
  const glass = std({ color: '#28455e', roughness: 0.15, metalness: 0.3 });
  const frameM = paint('#f4f8ff');
  const onFace = (face, y, w, h, m, depth = 0.05) => {
    const a = (face / 8) * TAU; // face direction, 0 = +z
    const g = new THREE.Group();
    g.rotation.y = a;
    const o = M(new THREE.BoxGeometry(w, h, depth), m);
    o.position.set(0, y, apo(y) + depth / 2 - 0.01);
    o.rotation.x = -taper;
    g.add(o);
    mill.add(g);
    return o;
  };
  for (const [face, y] of [[2, 2.6], [6, 2.6], [1, 4.4], [3, 4.4], [5, 4.4], [7, 4.4], [4, 3.3]]) {
    onFace(face, y, 0.62, 0.78, frameM, 0.04);
    onFace(face, y, 0.48, 0.64, glass, 0.06);
  }
  onFace(2, BASE_Y + 0.75, 0.95, 1.5, paint('#28455e'), 0.06);
  onFace(2, BASE_Y + 1.55, 1.1, 0.12, frameM, 0.08);
  // cap: an ogee dome with a finial, violet
  const capM = new THREE.MeshPhysicalMaterial({ color: '#6f5bd6', roughness: 0.5, metalness: 0.1, clearcoat: 0.5, bumpMap: K.tx.shingles.bump, bumpScale: 1.2 });
  const capY = BASE_Y + TOWER_H + 0.08;
  mill.add(lathe([[0, 0], [1.16, 0], [1.18, 0.12], [1.1, 0.5], [0.85, 1.0], [0.5, 1.4], [0.22, 1.66], [0.1, 1.8], [0, 1.82]], 48, capM).translateY(capY));
  mill.add(M(new THREE.TorusGeometry(1.15, 0.05, 8, 48), trim).rotateX(Math.PI / 2).translateZ(-(capY + 0.06)));
  mill.add(M(new THREE.SphereGeometry(0.14, 16, 12), mat.gold).translateY(capY + 1.92));
  // windshaft from the cap to the hub
  mill.add(rod(V(0, HUB_Y, 0.3), V(0, HUB_Y, SHAFT_Z + 0.25), 0.17, mat.darkSteel, 16));
  const hub = M(new THREE.CylinderGeometry(0.36, 0.42, 0.4, 24), paint('#6f5bd6'));
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, HUB_Y, SHAFT_Z + 0.05);
  mill.add(hub);
  mill.add(M(new THREE.SphereGeometry(0.2, 16, 12), mat.brass).translateY(HUB_Y).translateZ(SHAFT_Z + 0.3));

  const wheel = new THREE.Group();
  wheel.position.set(0, HUB_Y, SHAFT_Z);
  mill.add(wheel);
  for (let i = 0; i < 4; i++) {
    const s = sail(K);
    s.rotation.z = (i / 4) * TAU;
    wheel.add(s);
  }
  // all four gondolas alike (the quarter-turn repeat): one colour, the same two rider looks
  const looks = [randomLook(1401, { child: true, balloon: null, backpack: null, bag: null }), randomLook(1403, { child: false, balloon: null, backpack: null, bag: null })];
  const gondolas = [];
  const riders = [];
  for (let i = 0; i < MILL.sails; i++) {
    const gd = gondola(K, '#8d7ae8', looks);
    mill.add(gd.g);
    gondolas.push(gd.g);
    riders.push(...gd.riders);
  }

  const pose = (a, full) => {
    const sig = millAngles(a).sails;
    wheel.rotation.z = sig;
    gondolas.forEach((g, i) => {
      const t = sig + (i / 4) * TAU + Math.PI / 2; // sail i points along local +y turned by its rotation.z
      g.position.set(Math.cos(t) * SAIL, HUB_Y + Math.sin(t) * SAIL, SHAFT_Z + GZ);
    });
    for (const r of riders) r.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = cycleKeys('merry_mill', { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`);
    cycleD2('merry_mill', groups, { period: PERIOD }, (a, full) => `${a}:${full ? 1 : 0}`, MILL.d2Step);
    const pictures = [...groups.values()].map((g) => ({ keys: g.keys, keys2: g.keys2, pose: () => m.pose(g.angle / 32, g.full) }));
    B.log(`merry_mill: ${pictures.length} pictures`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'merry_mill', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
