// Pendulum Ship (swinging flat ride, 3 x 5 tiles = 12 x 20 m): an open boat hung on two pairs of white swing arms
// from an axle 10 m up, carried by two orange A-frames. The hull is a lofted double-ended boat (red with a yellow
// strake and a varnished gunwale), six tiered rows of four seats facing the middle (24 riders, the catalogue's
// capacity), with lap bars; open boarding decks on both long sides, steps and gates at the sim's entrance (front)
// and exit (back) tiles. No ground pad: a footprint-wide slab would make every picture wider and taller (decoded
// size), and the park's ground shows.
// Motion (items/swingers.js): today's swing SHIP_SWING * sin(TAU * slot / 32) as 16 time steps (timeKeys); 7 swing
// poses serve the 16 steps (size rule; only the 63 and 68 degree steps share one). Non-square, so one set per
// sprite rotation (rots [0,1,2,3]).
// Model frame: long axis along z (the footprint's 5 tiles at rotation 0), axle along x.
// Colour part: the hull, its red topsides and dark red bottom (the yellow strake and cream line keep theirs); base #b8321f.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V } from '../kit.js';
import { person, randomLook } from '../people.js';
import { shipKeys, shipTheta, GATES } from './swingers.js';
import { paint, plastic, tube, boxAt, stairs, deck, railing, canvasTex, peakHeight, deckPlate, gate, walkway } from './swingParts.js';

const PIVOT_Y = 10.0; // axle height
const ARM = 7.4; // axle to the gunwale line at midship
const HALF_L = 5.4; // half the hull length
const HALF_W = 1.45; // half the hull beam
const FRAME_X = 3.6; // A-frames either side of the ship
const LEG_Z = 5.4; // A-frame feet along the ride
const ARM_X = 1.62; // swing arms beside the hull
const SHELL = 0.09; // hull thickness
const SE = 2.6; // superellipse exponent of the hull section (fuller than a circle)

// Hull shape in the ship frame (gunwale at midship = y 0): t in [-1, 1] along the hull.
const sheer = (t) => 0.95 * t ** 4; // the gunwale rises toward bow and stern
const keelY = (t) => -1.75 + 1.2 * t * t; // and so does the keel
const halfW = (t) => HALF_W * Math.max(0, 1 - Math.abs(t) ** 5) ** 0.4;

/** Point of the hull section at t, angle b (0 = right gunwale, PI/2 = keel, PI = left gunwale), `inset` inward. */
function hullPt(t, b, inset) {
  const w = Math.max(0.02, halfW(t) - inset);
  const top = sheer(t);
  const keel = keelY(t) + inset;
  const c = Math.cos(b), s = Math.abs(Math.sin(b));
  return V(Math.sign(c) * w * Math.abs(c) ** (2 / SE), top - (top - keel) * s ** (2 / SE), t * HALF_L);
}

/** Half width of the hull inside the shell at t, height y (ship frame). */
function innerHalfW(t, y) {
  const top = sheer(t), keel = keelY(t) + SHELL;
  const f = Math.min(1, Math.max(0, (top - y) / (top - keel)));
  const s = f ** (SE / 2);
  return Math.max(0, halfW(t) - SHELL) * Math.sqrt(Math.max(0, 1 - s * s)) ** (2 / SE);
}

/** The hull shell as a grid (nt along, nb round), outward normals; `inset` > 0 builds the inner skin. */
function hullGeometry(inset, nt = 48, nb = 24) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nt; i++) {
    const t = -1 + (2 * i) / nt;
    for (let j = 0; j <= nb; j++) {
      const b = (Math.PI * j) / nb;
      const p = hullPt(t, b, inset);
      pos.push(p.x, p.y, p.z);
      // u along the hull (3 m per texture), v = depth below the gunwale (0 top .. 1 keel): bands follow the sheer
      uv.push((t * HALF_L) / 3, 1 - Math.abs(Math.sin(b)) ** (2 / SE));
    }
  }
  for (let i = 0; i < nt; i++) for (let j = 0; j < nb; j++) {
    const a = i * (nb + 1) + j, b = a + nb + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Midship keel vertex: its normal must point down (outward); flip the winding if not.
  const k = (nt / 2) * (nb + 1) + nb / 2;
  if (g.attributes.normal.getY(k) > 0) {
    for (let i = 0; i < idx.length; i += 3) { const s = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = s; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/** The varnished cap along both gunwales (between the outer and inner skins). */
function gunwaleGeometry(nt = 48) {
  const pos = [], idx = [];
  for (const b of [0, Math.PI]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nt; i++) {
      const t = -1 + (2 * i) / nt;
      const o = hullPt(t, b, -0.03), n = hullPt(t, b, SHELL + 0.03);
      pos.push(o.x, o.y + 0.06, o.z, n.x, n.y + 0.06, n.z);
    }
    for (let i = 0; i < nt; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The hull's red topsides (the dark red bottom #6e1f17 is of its family: a darker shade of a chosen colour). */
const BASE_COLOUR = '#b8321f';
/** Hull paint: red topsides, a yellow strake with a thin cream line, dark red bottom. `ink` maps each paint (masks). */
function hullTexture(ink = (col) => col) {
  return canvasTex(256, 256, (c, w, h) => {
    const band = (v0, v1, col) => { c.fillStyle = ink(col); c.fillRect(0, v0 * h, w, (v1 - v0) * h); };
    band(0, 1, '#b8321f');
    band(0.07, 0.19, '#f2c230');
    band(0.19, 0.215, '#f4ead2');
    band(0.72, 1, '#6e1f17');
  });
}
/** Tint mask of the hull paint: white on the red family (topsides, bottom), black on the strake and the cream line. */
const hullMask = () => hullTexture((col) => (col === '#b8321f' || col === '#6e1f17' ? '#ffffff' : '#000000'));

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const plate = deckPlate();
  const frameMat = paint(K, '#e2672b');
  const armMat = paint(K, '#efeae0');
  const hullMat = colourPart(new THREE.MeshPhysicalMaterial({ map: hullTexture(), color: '#ffffff', roughness: 0.35, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15 }), hullMask());
  // varnished timber in plain colour (no grain texture: grain costs picture size under the size rule)
  const varnish = new THREE.MeshPhysicalMaterial({ color: '#b97f45', roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const inner = new THREE.MeshStandardMaterial({ color: '#c99e6e', roughness: 0.7, side: THREE.BackSide });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#a8835a', roughness: 0.8 });
  const seatMat = plastic('#2b2523', 0.55);

  // ---- ground (no pad: the park's ground shows round the ride): open boarding decks either side of the hull.
  // Guests come in through the entrance gate on the front row (GATES, the sim's entrance tile), walk up to the +x
  // deck by its front steps, and leave the -x deck by its back steps to the exit gate on the back row.
  const steel = mat.darkSteel;
  const deckTop = PIVOT_Y - ARM - 1.05;
  const signIn = paint(K, '#2f7d3a'), signOut = paint(K, '#7a2a1c');
  for (const s of [-1, 1]) {
    const x0 = s * 1.95, x1 = s * 3.05, xm = s * 2.5;
    root.add(deck(K, { x0, x1, z0: -3.8, z1: 3.8, top: deckTop, boards: plate, steel }));
    root.add(stairs(K, { axis: 'z', dir: s, at: [xm, s * 3.8], top: deckTop, width: 1.2, n: 4, run: 0.3, tread: plate, steel }));
    root.add(railing([[x1, s * 3.8], [x1, -s * 3.8], [x0, -s * 3.8]], deckTop, mat.stainless));
    const g = s > 0 ? GATES.pendulum_ship.entrance : GATES.pendulum_ship.exit;
    root.add(walkway([xm, s * 5.2], g, 1.2, plate));
    root.add(gate(g, mat.stainless, s > 0 ? signIn : signOut));
  }

  // ---- A-frames and the axle (static)
  const legTop = (s, sz) => V(s * FRAME_X, PIVOT_Y - 0.25, sz * 0.25);
  const legFoot = (s, sz) => V(s * FRAME_X, 0.45, sz * LEG_Z);
  for (const s of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(tube(legFoot(s, sz), legTop(s, sz), 0.34, 0.22, frameMat, 16));
      root.add(boxAt(1.0, 0.5, 1.2, s * FRAME_X, 0.2, sz * LEG_Z, mat.concrete));
      root.add(boxAt(0.8, 0.06, 0.8, s * FRAME_X, 0.47, sz * LEG_Z, mat.darkSteel));
    }
    for (const y of [3.4, 6.6]) {
      const f = (y - 0.45) / (PIVOT_Y - 0.25 - 0.45);
      const z = LEG_Z + (0.25 - LEG_Z) * f;
      root.add(tube(V(s * FRAME_X, y, -z), V(s * FRAME_X, y, z), 0.13, 0.13, frameMat, 10));
    }
    root.add(boxAt(1.0, 1.1, 1.3, s * FRAME_X, PIVOT_Y, 0, frameMat)); // bearing housing
  }
  root.add(tube(V(-FRAME_X, PIVOT_Y, 0), V(FRAME_X, PIVOT_Y, 0), 0.26, 0.26, mat.stainless, 20));

  // ---- the swinging ship: pivot group at the axle
  const swing = new THREE.Group();
  swing.position.y = PIVOT_Y;
  root.add(swing);
  // hub sleeve with end plates, swing arms down to the hull, braces
  swing.add(tube(V(-ARM_X - 0.3, 0, 0), V(ARM_X + 0.3, 0, 0), 0.45, 0.45, armMat, 24));
  for (const s of [-1, 1]) {
    const plate = M(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 28), armMat);
    plate.rotation.z = Math.PI / 2;
    plate.position.x = s * ARM_X;
    swing.add(plate);
    const foot = (sz) => V(s * ARM_X, -ARM + 0.15, sz * 2.5);
    for (const sz of [-1, 1]) swing.add(tube(V(s * ARM_X, 0, sz * 0.35), foot(sz), 0.2, 0.16, armMat, 14));
    swing.add(tube(foot(-1), foot(1), 0.14, 0.14, armMat, 12)); // stringer along the gunwale
    for (const f of [0.35, 0.68]) {
      const y = -ARM * f, z = 0.35 + (2.5 - 0.35) * f;
      swing.add(tube(V(s * ARM_X, y, -z), V(s * ARM_X, y, z), 0.09, 0.09, armMat, 10));
    }
    swing.add(tube(V(s * ARM_X, -ARM * 0.35, -1.1), V(s * ARM_X, -ARM * 0.68, 1.8), 0.07, 0.07, armMat, 8));
    swing.add(tube(V(s * ARM_X, -ARM * 0.35, 1.1), V(s * ARM_X, -ARM * 0.68, -1.8), 0.07, 0.07, armMat, 8));
    for (const sz of [-1, 1]) swing.add(boxAt(0.22, 0.5, 0.5, s * (ARM_X - 0.1), -ARM - 0.05, sz * 2.5, armMat)); // hull brackets
  }

  // hull
  const ship = new THREE.Group();
  ship.position.y = -ARM;
  swing.add(ship);
  ship.add(M(hullGeometry(0), hullMat));
  ship.add(M(hullGeometry(SHELL), inner, false, true));
  ship.add(M(gunwaleGeometry(), varnish));
  // bow and stern: a carved stem post with a gilded flame finial
  for (const sz of [-1, 1]) {
    const top = V(0, sheer(1) + 0.55, sz * (HALF_L + 0.12));
    ship.add(tube(V(0, keelY(1) + 0.1, sz * (HALF_L - 0.05)), top, 0.11, 0.09, varnish, 10));
    const flame = M(new THREE.ConeGeometry(0.16, 0.6, 14), mat.gold);
    flame.position.set(0, top.y + 0.32, top.z);
    ship.add(flame);
    ship.add(M(new THREE.SphereGeometry(0.17, 14, 10), mat.gold).translateY(top.y + 0.02).translateZ(top.z));
  }
  // tiers, benches, lap bars and riders: three rows each half, facing the middle
  const ROWS = [1.25, 2.65, 3.95];
  const riders = [];
  let seed = 600;
  for (const sz of [-1, 1]) {
    ROWS.forEach((rz, r) => {
      const z = sz * rz, t = z / HALF_L;
      const fy = -1.05 + 0.3 * r + 0.05 * r * r; // floor of the tier
      const zOut = z + sz * 0.7, tOut = zOut / HALF_L;
      const wFloor = Math.max(0.3, innerHalfW(Math.min(1, Math.abs(tOut)) * Math.sign(tOut), fy) - 0.02);
      ship.add(boxAt(wFloor * 2, 0.08, 1.4, 0, fy - 0.04, z, floorMat));
      const seatY = fy + 0.45;
      const wSeat = innerHalfW(t, seatY) - 0.06;
      const seat = boxAt(wSeat * 2, 0.1, 0.46, 0, seatY - 0.05, z + sz * 0.12, seatMat);
      ship.add(seat);
      ship.add(boxAt(wSeat * 2, seatY - 0.1 - fy, 0.42, 0, fy + (seatY - 0.1 - fy) / 2, z + sz * 0.12, varnish)); // seat box
      const back = boxAt(innerHalfW(t + sz * 0.06, seatY + 0.35) * 2 - 0.1, 0.72, 0.08, 0, seatY + 0.33, z + sz * 0.38, seatMat);
      back.rotation.x = sz * 0.12;
      ship.add(back);
      const barY = seatY + 0.42, barZ = z - sz * 0.26;
      ship.add(tube(V(-wSeat + 0.05, barY, barZ), V(wSeat - 0.05, barY, barZ), 0.03, 0.03, mat.stainless, 8));
      for (const x of [-wSeat + 0.05, 0, wSeat - 0.05]) ship.add(tube(V(x, seatY, z + sz * 0.05), V(x, barY, barZ), 0.025, 0.025, mat.stainless, 6));
      for (const x of [-0.82, -0.28, 0.28, 0.82]) {
        const p = person(randomLook(seed++, { balloon: null, backpack: null, bag: null }), { kind: 'ride', legsHidden: false });
        p.position.set(x, seatY, z + sz * 0.1);
        p.rotation.y = sz > 0 ? Math.PI : 0; // face the middle of the ship
        ship.add(p);
        riders.push(p);
      }
    });
  }
  const pose = (p, full) => {
    swing.rotation.x = shipTheta(p);
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = shipKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const p = Number(id.split(':')[0]);
      return { keys: g.keys, keys2: g.keys2, pose: () => m.pose(p, g.full) };
    });
    B.log(`pendulum_ship: ${pictures.length} pictures per rotation, peak ${peakHeight(m.root, pictures).toFixed(2)} m (spec ${B.input.spec.heightM} m)`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'pendulum_ship', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
