// Magic Carpet (flat ride, 4 x 3 tiles = 16 x 12 m): a long platform dressed as a woven rug, carried round a
// horizontal circle by two yellow arms, one on each of two orange A-frame towers; the platform stays level the whole
// way round. Twenty riders sit back to back along a padded spine, facing out over the long sides, behind a lap bar.
// At rest the carpet sits just above two low open boarding decks on the long sides, with steps and gates at the
// sim's entrance (front) and exit (back) tiles; no ground pad (a footprint-wide slab makes every picture larger,
// and the park's ground shows).
// Motion (items/swingers.js): today's arm angle phi = TAU * slot / 32 as 16 time steps (timeKeys), no symmetry;
// 8 positions 45 degrees apart serve the 16 steps (every other step; size rule).
// Non-square, so one set per sprite rotation (rots [0,1,2,3]).
// Model frame: long axis along x (the footprint's 4 tiles at rotation 0); the carpet orbits in the y-z plane.
// Colour part: the carpet deck, its woven rug (the cream medallion and diamonds keep theirs) and rug edges, all its warm colours; the others become lighter or darker shades of the chosen colour; base #f39a2b.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V } from '../kit.js';
import { person, randomLook } from '../people.js';
import { carpetKeys, carpetPhi, GATES } from './swingers.js';
import { paint, plastic, tube, boxBeam, boxAt, stairs, deck, canvasTex, peakHeight, deckPlate, gate } from './swingParts.js';

const PIVOT_Y = 5.4; // arm hubs
const ARM = 4.4; // hub to the carpet's bearing
const TOWER_X = 6.55; // towers at the two short ends
const ARM_X = 5.95; // arms just inside the towers
const LEG_Z = 3.6; // tower feet across the ride
const HALF_L = 4.7; // rug half length
const HALF_W = 1.4; // rug half width
const FRAME_H = 0.3; // carpet frame depth under the rug
const SEATS = 10; // per side

/**
 * The rug's orange, of middle lightness among its stripes (luma 165 of red 86, red-orange 98, yellow 211; borders and
 * edges 41 to 58), so a chosen colour keeps the stripes and borders as shades of it (0.25x to 1.3x).
 */
const BASE_COLOUR = '#f39a2b';
const RUG_CREAM = '#fff3b0';
/** The rug: today's stripes (red, orange, yellow, red-orange) woven, a cream diamond medallion and a border. */
function rugTexture(ink = (col) => col) {
  return canvasTex(1024, 320, (c0, w, h) => {
    // every paint goes through `ink` (the tint mask draws the same rug: white on the colour, black on the cream)
    const c = new Proxy(c0, {
      get: (o, k) => (typeof o[k] === 'function' ? o[k].bind(o) : o[k]),
      set: (o, k, v) => { o[k] = k === 'fillStyle' || k === 'strokeStyle' ? ink(v) : v; return true; },
    });
    const cols = ['#c43a2a', '#f39a2b', '#ffd166', '#e8503a'];
    const n = 8;
    for (let k = 0; k < n; k++) { c.fillStyle = cols[k % 4]; c.fillRect((k / n) * w, 0, w / n + 1, h); }
    // border
    c.strokeStyle = '#5b1d12';
    c.lineWidth = 22;
    c.strokeRect(11, 11, w - 22, h - 22);
    c.strokeStyle = '#ffd166';
    c.lineWidth = 6;
    c.strokeRect(30, 30, w - 60, h - 60);
    // medallion
    const dia = (r, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(w / 2 - r * 1.6, h / 2); c.lineTo(w / 2, h / 2 - r); c.lineTo(w / 2 + r * 1.6, h / 2); c.lineTo(w / 2, h / 2 + r); c.closePath(); c.fill(); };
    dia(100, '#5b1d12');
    dia(84, '#fff3b0');
    dia(46, '#c43a2a');
    dia(20, '#ffd166');
    // small diamonds in each stripe
    for (let k = 0; k < n; k++) {
      if (k === 3 || k === 4) continue;
      const x = ((k + 0.5) / n) * w;
      for (const y of [h * 0.3, h * 0.7]) { c.fillStyle = k % 2 ? '#7a1f12' : '#fff3b0'; c.beginPath(); c.moveTo(x - 18, y); c.lineTo(x, y - 14); c.lineTo(x + 18, y); c.lineTo(x, y + 14); c.closePath(); c.fill(); }
    }
  });
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const plate = deckPlate();
  const towerMat = paint(K, '#d9682a');
  const armMat = paint(K, '#f2b630');
  const skirtMat = colourPart(paint(K, '#7a2a1c', { clearcoat: 0.1, roughness: 0.6 })); // rug edges
  const seatMat = plastic('#5b1d12', 0.5);

  // ---- ground (no pad, the park's ground shows): two open boarding decks. Guests come in through the entrance
  // gate on the front row's gate tile (GATES: column 1 of 4, x -2), up the +z deck's steps there, and leave down the
  // -z deck's steps to the exit gate on the back row. No railings along the decks: the carpet's edge and end
  // brackets sweep low over them just after leaving the bottom of the orbit.
  const deckTop = 0.85;
  const signIn = paint(K, '#2f7d3a'), signOut = paint(K, '#7a2a1c');
  for (const s of [-1, 1]) {
    const z0 = s * 1.58, z1 = s * 2.9;
    const g = s > 0 ? GATES.magic_carpet.entrance : GATES.magic_carpet.exit;
    root.add(deck(K, { x0: -4.8, x1: 4.8, z0, z1, top: deckTop, boards: plate, steel: mat.darkSteel }));
    root.add(stairs(K, { axis: 'z', dir: s, at: [g[0], z1], top: deckTop, width: 1.6, n: 2, run: 0.32, tread: plate, steel: mat.darkSteel }));
    root.add(gate(g, mat.stainless, s > 0 ? signIn : signOut));
  }

  // ---- towers: an A-frame of two tapered legs at each short end, a motor housing on top
  for (const s of [-1, 1]) {
    const x = s * TOWER_X;
    for (const sz of [-1, 1]) {
      root.add(tube(V(x, 0.45, sz * LEG_Z), V(x, PIVOT_Y - 0.1, sz * 0.25), 0.3, 0.2, towerMat, 16));
      root.add(boxAt(0.9, 0.5, 1.0, x, 0.2, sz * LEG_Z, mat.concrete));
    }
    for (const y of [2.0, 3.8]) {
      const f = (y - 0.45) / (PIVOT_Y - 0.55), z = LEG_Z + (0.25 - LEG_Z) * f;
      root.add(tube(V(x, y, -z), V(x, y, z), 0.1, 0.1, towerMat, 10));
    }
    root.add(tube(V(x, 2.0, -(LEG_Z + (0.25 - LEG_Z) * (1.55 / 4.85))), V(x, 3.8, LEG_Z + (0.25 - LEG_Z) * (3.35 / 4.85)), 0.07, 0.07, towerMat, 8));
    // motor housing (axis along x) with a gilded cap facing out
    const hous = M(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 28), towerMat);
    hous.rotation.z = Math.PI / 2;
    hous.position.set(x + s * 0.1, PIVOT_Y, 0);
    root.add(hous);
    const cap = M(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.gold);
    cap.rotation.z = -s * Math.PI / 2;
    cap.position.set(x + s * 0.65, PIVOT_Y, 0);
    root.add(cap);
  }

  // ---- arms (turn about x at the hubs)
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * ARM_X, PIVOT_Y, 0);
    root.add(arm);
    const hub = M(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 24), armMat);
    hub.rotation.z = Math.PI / 2;
    arm.add(hub);
    arm.add(boxBeam(V(0, 0.9, 0), V(0, -ARM, 0), 0.42, 0.55, armMat)); // hangs down at rest
    const cw = M(new THREE.CylinderGeometry(0.62, 0.62, 0.46, 20), armMat); // stub counterweight above the hub
    cw.rotation.z = Math.PI / 2;
    cw.position.y = 0.9;
    arm.add(cw);
    const pin = M(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 16), mat.darkSteel);
    pin.rotation.z = Math.PI / 2;
    pin.position.y = -ARM;
    arm.add(pin);
    arms.push(arm);
  }

  // ---- the carpet (translates, stays level): frame, rug, trim, fringe, end brackets, seats, riders
  const carpet = new THREE.Group();
  root.add(carpet);
  const rugMat = colourPart(new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95 }), rugTexture((col) => (col === RUG_CREAM ? '#000000' : '#ffffff'))); // flat weave: no noise (picture size)
  carpet.add(boxAt(HALF_L * 2 - 0.2, FRAME_H, HALF_W * 2 - 0.3, 0, -FRAME_H / 2 - 0.04, 0, mat.darkSteel));
  const rug = boxAt(HALF_L * 2, 0.08, HALF_W * 2, 0, 0, 0, [skirtMat, skirtMat, rugMat, skirtMat, skirtMat, skirtMat]);
  carpet.add(rug);
  for (const s of [-1, 1]) {
    carpet.add(boxAt(HALF_L * 2 + 0.04, 0.05, 0.06, 0, 0.04, s * (HALF_W + 0.01), mat.gold)); // gilded edge
    carpet.add(boxAt(0.12, 0.1, HALF_W * 2, s * (HALF_L + 0.05), -0.04, 0, mat.gold)); // gilded fringe on the short end
    // end bracket out to the arm pin
    carpet.add(boxBeam(V(s * (HALF_L - 0.3), -0.2, 0), V(s * (ARM_X - 0.25), -0.2, 0), 0.3, 0.5, mat.darkSteel));
    const brg = M(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 18), mat.darkSteel);
    brg.rotation.z = Math.PI / 2;
    brg.position.set(s * (ARM_X - 0.3), -0.2, 0);
    carpet.add(brg);
  }
  // padded spine with headrests, seats both sides, lap bars and footrests
  carpet.add(boxAt(HALF_L * 2 - 0.9, 0.95, 0.22, 0, 0.52, 0, seatMat));
  carpet.add(boxAt(HALF_L * 2 - 0.86, 0.06, 0.26, 0, 1.02, 0, mat.gold));
  const riders = [];
  const xs = Array.from({ length: SEATS }, (_, i) => -3.6 + (i * 7.2) / (SEATS - 1));
  let seed = 640;
  for (const sz of [-1, 1]) {
    for (const x of xs) {
      carpet.add(boxAt(0.52, 0.1, 0.48, x, 0.43, sz * 0.38, seatMat));
      carpet.add(boxAt(0.5, 0.38, 0.06, x, 0.22, sz * 0.6, mat.darkSteel)); // seat leg
      const p = person(randomLook(seed++, { balloon: null, backpack: null, bag: null }), { kind: 'ride' });
      p.position.set(x, 0.48, sz * 0.36);
      p.rotation.y = sz > 0 ? 0 : Math.PI; // face out over the long side
      carpet.add(p);
      riders.push(p);
    }
    const barZ = sz * 0.82, barY = 0.98;
    carpet.add(tube(V(-3.95, barY, barZ), V(3.95, barY, barZ), 0.035, 0.035, mat.stainless, 8));
    for (let k = 0; k <= 5; k++) {
      const x = -3.95 + (k * 7.9) / 5;
      carpet.add(tube(V(x, 0.04, barZ + sz * 0.05), V(x, barY, barZ), 0.03, 0.03, mat.stainless, 6));
    }
    carpet.add(tube(V(-4.0, 0.12, sz * 1.18), V(4.0, 0.12, sz * 1.18), 0.04, 0.04, mat.stainless, 8)); // footrest
  }
  const pose = (phi, full) => {
    const y = PIVOT_Y - ARM * Math.cos(phi), z = ARM * Math.sin(phi);
    for (const a of arms) a.rotation.x = -phi; // (0, -1, 0) -> (0, -cos, sin)
    carpet.position.set(0, y + 0.2, z); // the bearing sits 0.2 m under the rug
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = carpetKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const pos = Number(id.split(':')[0]);
      return { keys: g.keys, keys2: g.keys2, pose: () => m.pose(carpetPhi(pos), g.full) };
    });
    B.log(`magic_carpet: ${pictures.length} pictures per rotation, peak ${peakHeight(m.root, pictures).toFixed(2)} m (spec ${B.input.spec.heightM} m)`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'magic_carpet', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
