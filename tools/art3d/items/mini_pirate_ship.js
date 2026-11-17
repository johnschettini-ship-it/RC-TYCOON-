// Mini Pirate Ship (family flat ride, 3 x 4 tiles = 12 x 16 m): a kid-sized swinging boat. A round-bellied blue hull
// (a yellow strake, a white line, portholes and a varnished gunwale) hangs on two pairs of cream swing arms from an
// axle 6.25 m up, carried by two green A-frames; a short mast at midship carries a plain two-colour pennant (no emblem,
// no skull). Four tiered benches of four face the middle (16 riders, the catalogue's capacity), with lap bars; an
// open boarding deck runs along each long side, the entrance gate on the front row and the exit on the back row of
// the sim's gate column (familyKeys.js FAMILY_GATES). No ground pad: the park's ground shows round the ride.
// Motion: today's gentle swing, MINI_SHIP_SWING (40 degrees) * sin(TAU * slot / 32) (familyMotion.ts), as 16 time
// steps in 9 swing poses (familyKeys.js miniShipKeys); the empty ship is one rest picture. Non-square: rots [0, 1, 2, 3].
// Model frame: the hull's long axis along z (the footprint's 4 tiles at rotation 0), the axle along x.
// Colour part: the hull, its blue topsides and dark blue bottom (the yellow strake and white line keep theirs); base #2a66b8.
import { THREE, kit, placeOnFootprint, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V } from '../kit.js';
import { person, randomLook } from '../people.js';
import { miniShipKeys, miniShipLevelTheta, FAMILY_GATES } from './familyKeys.js';
import { paint, plastic, tube, boxAt, stairs, deck, railing, canvasTex, peakHeight, deckPlate, gate, walkway } from './swingParts.js';

const GATES = FAMILY_GATES.mini_pirate_ship;
const PIVOT_Y = 6.25; // axle height (today's MINI_PIVOT 50 px)
const ARM = 4.2; // axle to the gunwale at midship (today's MINI_ARM 1.05 tiles)
const HALF_L = 3.5; // half the hull length
const HALF_W = 1.15; // half the hull beam
const FRAME_X = 2.7; // A-frames either side
const LEG_Z = 4.6; // A-frame feet along the ride
const ARM_X = 1.3; // swing arms beside the hull
const SHELL = 0.07;
const SE = 2.4; // superellipse exponent of the hull section

const sheer = (t) => 0.7 * t ** 4;
const keelY = (t) => -1.3 + 0.9 * t * t;
const halfW = (t) => HALF_W * Math.max(0, 1 - Math.abs(t) ** 4) ** 0.45;

function hullPt(t, b, inset) {
  const w = Math.max(0.02, halfW(t) - inset);
  const top = sheer(t);
  const keel = keelY(t) + inset;
  const c = Math.cos(b), s = Math.abs(Math.sin(b));
  return V(Math.sign(c) * w * Math.abs(c) ** (2 / SE), top - (top - keel) * s ** (2 / SE), t * HALF_L);
}

function innerHalfW(t, y) {
  const top = sheer(t), keel = keelY(t) + SHELL;
  const f = Math.min(1, Math.max(0, (top - y) / (top - keel)));
  const s = f ** (SE / 2);
  return Math.max(0, halfW(t) - SHELL) * Math.sqrt(Math.max(0, 1 - s * s)) ** (2 / SE);
}

function hullGeometry(inset, nt = 40, nb = 20) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nt; i++) {
    const t = -1 + (2 * i) / nt;
    for (let j = 0; j <= nb; j++) {
      const b = (Math.PI * j) / nb;
      const p = hullPt(t, b, inset);
      pos.push(p.x, p.y, p.z);
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
  const k = (nt / 2) * (nb + 1) + nb / 2;
  if (g.attributes.normal.getY(k) > 0) {
    for (let i = 0; i < idx.length; i += 3) { const s = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = s; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function gunwaleGeometry(nt = 40) {
  const pos = [], idx = [];
  for (const b of [0, Math.PI]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nt; i++) {
      const t = -1 + (2 * i) / nt;
      const o = hullPt(t, b, -0.03), n = hullPt(t, b, SHELL + 0.03);
      pos.push(o.x, o.y + 0.05, o.z, n.x, n.y + 0.05, n.z);
    }
    for (let i = 0; i < nt; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The hull's blue topsides (the dark blue bottom #173e72 is of its family: a darker shade of a chosen colour). */
const BASE_COLOUR = '#2a66b8';
/** Hull paint: blue topsides, a yellow strake, a thin white line, portholes, a dark blue bottom. `ink` maps each paint. */
function hullTexture(ink = (col) => col) {
  return canvasTex(256, 256, (c, w, h) => {
    const band = (v0, v1, col) => { c.fillStyle = ink(col); c.fillRect(0, v0 * h, w, (v1 - v0) * h); };
    band(0, 1, '#2a66b8');
    band(0.06, 0.17, '#f2c230');
    band(0.17, 0.2, '#f4f1ea');
    band(0.7, 1, '#173e72');
    // two portholes per texture repeat (3 m), on the topsides
    for (const u of [0.25, 0.75]) {
      c.fillStyle = ink('#f4f1ea'); c.beginPath(); c.arc(u * w, 0.37 * h, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = ink('#24313f'); c.beginPath(); c.arc(u * w, 0.37 * h, 9, 0, Math.PI * 2); c.fill();
    }
  });
}
const hullMask = () => hullTexture((col) => (col === '#2a66b8' || col === '#173e72' ? '#ffffff' : '#000000'));

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const plate = deckPlate();
  const frameMat = paint(K, '#2f8a43');
  const armMat = paint(K, '#efeae0');
  const hullMat = colourPart(new THREE.MeshPhysicalMaterial({ map: hullTexture(), color: '#ffffff', roughness: 0.35, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15 }), hullMask());
  const varnish = new THREE.MeshPhysicalMaterial({ color: '#b97f45', roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const inner = new THREE.MeshStandardMaterial({ color: '#d8b98e', roughness: 0.7, side: THREE.BackSide });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#a8835a', roughness: 0.8 });
  const seatMat = plastic('#c8372d', 0.5);

  // ---- boarding decks either side of the hull, steps down at the gate ends, gates on the sim's gate column
  const steel = mat.darkSteel;
  const deckTop = PIVOT_Y - ARM - 0.85;
  const signIn = paint(K, '#2f7d3a'), signOut = paint(K, '#7a2a1c');
  for (const s of [-1, 1]) {
    const x0 = s * 1.55, x1 = s * 2.35, xm = s * 1.95;
    root.add(deck(K, { x0, x1, z0: -2.6, z1: 2.6, top: deckTop, boards: plate, steel }));
    root.add(stairs(K, { axis: 'z', dir: s, at: [xm, s * 2.6], top: deckTop, width: 0.8, n: 2, run: 0.3, tread: plate, steel }));
    root.add(railing([[x1, s * 2.6], [x1, -s * 2.6], [x0, -s * 2.6]], deckTop, mat.stainless, 0.9));
    const g = s > 0 ? GATES.entrance : GATES.exit;
    root.add(walkway([xm, s * 3.6], g, 1.0, plate));
    root.add(gate(g, mat.stainless, s > 0 ? signIn : signOut));
  }

  // ---- A-frames and the axle (static)
  for (const s of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(tube(V(s * FRAME_X, 0.35, sz * LEG_Z), V(s * FRAME_X, PIVOT_Y - 0.2, sz * 0.2), 0.22, 0.15, frameMat, 14));
      root.add(boxAt(0.8, 0.4, 0.9, s * FRAME_X, 0.15, sz * LEG_Z, mat.concrete));
    }
    const y = 2.6, f = (y - 0.35) / (PIVOT_Y - 0.55), z = LEG_Z + (0.2 - LEG_Z) * f;
    root.add(tube(V(s * FRAME_X, y, -z), V(s * FRAME_X, y, z), 0.09, 0.09, frameMat, 10));
    root.add(boxAt(0.7, 0.8, 0.9, s * FRAME_X, PIVOT_Y, 0, frameMat)); // bearing housing
  }
  root.add(tube(V(-FRAME_X, PIVOT_Y, 0), V(FRAME_X, PIVOT_Y, 0), 0.18, 0.18, mat.stainless, 18));

  // ---- the swinging ship
  const swing = new THREE.Group();
  swing.position.y = PIVOT_Y;
  root.add(swing);
  swing.add(tube(V(-ARM_X - 0.2, 0, 0), V(ARM_X + 0.2, 0, 0), 0.3, 0.3, armMat, 20));
  for (const s of [-1, 1]) {
    const foot = (sz) => V(s * ARM_X, -ARM + 0.1, sz * 1.7);
    for (const sz of [-1, 1]) swing.add(tube(V(s * ARM_X, 0, sz * 0.25), foot(sz), 0.14, 0.11, armMat, 12));
    swing.add(tube(foot(-1), foot(1), 0.1, 0.1, armMat, 10));
    const y = -ARM * 0.5, z = 0.25 + (1.7 - 0.25) * 0.5;
    swing.add(tube(V(s * ARM_X, y, -z), V(s * ARM_X, y, z), 0.07, 0.07, armMat, 8));
    for (const sz of [-1, 1]) swing.add(boxAt(0.16, 0.36, 0.36, s * (ARM_X - 0.08), -ARM - 0.02, sz * 1.7, armMat));
  }
  const ship = new THREE.Group();
  ship.position.y = -ARM;
  swing.add(ship);
  ship.add(M(hullGeometry(0), hullMat));
  ship.add(M(hullGeometry(SHELL), inner, false, true));
  ship.add(M(gunwaleGeometry(), varnish));
  // bow and stern posts with a gold ball
  for (const sz of [-1, 1]) {
    const top = V(0, sheer(1) + 0.4, sz * (HALF_L + 0.08));
    ship.add(tube(V(0, keelY(1) + 0.1, sz * (HALF_L - 0.05)), top, 0.08, 0.07, varnish, 10));
    ship.add(M(new THREE.SphereGeometry(0.13, 12, 10), mat.gold).translateY(top.y + 0.08).translateZ(top.z));
  }
  // mast at midship with a yard and a plain two-colour pennant (yellow over red, no emblem)
  const mastFoot = -0.9, mastTop = 3.6;
  ship.add(tube(V(0, mastFoot, 0), V(0, mastTop, 0), 0.09, 0.06, varnish, 10));
  ship.add(tube(V(-0.8, mastTop - 0.9, 0), V(0.8, mastTop - 0.9, 0), 0.04, 0.04, varnish, 8));
  ship.add(M(new THREE.SphereGeometry(0.1, 10, 8), mat.gold).translateY(mastTop + 0.05));
  const pennant = new THREE.Shape();
  pennant.moveTo(0, 0); pennant.lineTo(0, -0.6); pennant.lineTo(1.1, -0.3); pennant.closePath();
  const flagMat = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, w, h / 2); c.fillStyle = '#d7322b'; c.fillRect(0, h / 2, w, h / 2); });
  const pg = new THREE.ShapeGeometry(pennant);
  pg.computeBoundingBox();
  const uv = pg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pg.attributes.position.getX(i) / 1.1, 1 + pg.attributes.position.getY(i) / 0.6);
  const flag = M(pg, new THREE.MeshStandardMaterial({ map: flagMat, roughness: 0.8, side: THREE.DoubleSide }));
  flag.rotation.y = -Math.PI / 2; // streams along +z (towards the bow)
  flag.position.set(0, mastTop - 0.05, 0.05);
  ship.add(flag);
  // tiers, benches, lap bars and riders: two rows each half, facing the middle
  const ROWS = [1.05, 2.25];
  const riders = [];
  let seed = 760;
  for (const sz of [-1, 1]) {
    ROWS.forEach((rz, r) => {
      const z = sz * rz, t = z / HALF_L;
      const fy = -0.8 + 0.28 * r;
      const zOut = z + sz * 0.55, tOut = zOut / HALF_L;
      const wFloor = Math.max(0.3, innerHalfW(Math.min(1, Math.abs(tOut)) * Math.sign(tOut), fy) - 0.02);
      ship.add(boxAt(wFloor * 2, 0.07, 1.15, 0, fy - 0.035, z, floorMat));
      const seatY = fy + 0.4;
      const wSeat = innerHalfW(t, seatY) - 0.05;
      ship.add(boxAt(wSeat * 2, 0.09, 0.4, 0, seatY - 0.045, z + sz * 0.1, seatMat));
      ship.add(boxAt(wSeat * 2, seatY - 0.09 - fy, 0.36, 0, fy + (seatY - 0.09 - fy) / 2, z + sz * 0.1, varnish));
      const back = boxAt(innerHalfW(t + sz * 0.06, seatY + 0.3) * 2 - 0.08, 0.6, 0.07, 0, seatY + 0.28, z + sz * 0.32, seatMat);
      back.rotation.x = sz * 0.12;
      ship.add(back);
      const barY = seatY + 0.36, barZ = z - sz * 0.22;
      ship.add(tube(V(-wSeat + 0.05, barY, barZ), V(wSeat - 0.05, barY, barZ), 0.025, 0.025, mat.stainless, 8));
      for (const x of [-wSeat + 0.05, wSeat - 0.05]) ship.add(tube(V(x, seatY, z + sz * 0.04), V(x, barY, barZ), 0.02, 0.02, mat.stainless, 6));
      for (const x of [-0.66, -0.22, 0.22, 0.66]) {
        // a family ride: children and grown-ups mixed
        const p = person(randomLook(seed++, { balloon: null, backpack: null, bag: null, child: seed % 3 !== 0 }), { kind: 'ride', legsHidden: false });
        p.position.set(x, seatY, z + sz * 0.08);
        p.rotation.y = sz > 0 ? Math.PI : 0;
        ship.add(p);
        riders.push(p);
      }
    });
  }
  const pose = (theta, full) => {
    // today's swing raises the bow (+l, model +z) for a positive angle; three.js turns +z down for a positive x turn
    swing.rotation.x = -theta;
    for (const p of riders) p.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = miniShipKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const level = id === 'rest' ? 0 : Number(id.split(':')[0]);
      return { keys: g.keys, keys2: g.keys2, pose: () => m.pose(miniShipLevelTheta(level), g.full) };
    });
    B.log(`mini_pirate_ship: ${pictures.length} pictures per rotation, peak ${peakHeight(m.root, pictures).toFixed(2)} m (spec ${B.input.spec.heightM} m)`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'mini_pirate_ship', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
