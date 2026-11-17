// Train Station Show (walk-through attraction, 4 x 3 tiles = 16 x 12 m, 9 m): an old-time country station that guests
// walk through. A red-brick booking hall with cream stone quoins, arched windows and a slate roof; a clock tower over
// the arched entrance with the name board (front, +z, on the sim's entrance column, STATION_GATES); the exit door at the
// back on the same column. Beside the hall, a raised platform under a cast-iron canopy with a fretted valance and four
// lamps, and at it a green tank engine and a teak carriage standing on a short length of track (scenery: they do not
// move). No riders. Light change in 4 steps (items/ridesB.js stationKeys, repeating every 8 angle slots, as the mirror
// maze): the platform lamps chase, two of the four arched windows glow in turn, and the clock's minute hand moves on a
// quarter. Front at +z: rots [0, 1, 2, 3].
// Colour part: the slate roof of the hall and the tower cap (brick, stone, ironwork and the engine keep theirs); base #4a5568.
import { THREE, placeOnFootprint, bakeObject, kit, colourPart, partMask } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { signMat } from '../rides.js';
import { stationKeys, STATION_GATES, STATION_LIGHT_STEPS } from './ridesB.js';

/** The roof slate (#4a5568): a chosen colour paints it, keeping its shading. */
const BASE_COLOUR = '#4a5568';
const HX0 = -6.8, HX1 = 3.0; // hall, along x
const HZ0 = -3.2, HZ1 = 2.6; // hall, along z
const WALL = 4.4;
const Y0 = 0.3;

const box = (w, h, d, x, y, z, mat) => M(new THREE.BoxGeometry(w, h, d), mat).translateX(x).translateY(y + h / 2).translateZ(z);

/** A canvas texture (sRGB), repeated. */
function canvasTex(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8;
  return t;
}

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const brickTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d8cfbf'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 16; r++) for (let c = 0; c < 9; c++) {
      const x = c * 32 - (r % 2 ? 16 : 0), y = r * 16;
      const t = ((r * 7 + c * 13) % 5) / 5;
      g.fillStyle = `rgb(${150 + t * 25},${62 + t * 14},${44 + t * 8})`;
      g.fillRect(x + 1, y + 1, 30, 14);
    }
  }, [4, 2]);
  const brick = std({ map: brickTex, roughness: 0.85 });
  const stone = std({ color: '#e6dcc4', roughness: 0.8, map: mat.cream.map });
  const slate = colourPart(std({ color: '#4a5568', roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }));
  const green = new THREE.MeshPhysicalMaterial({ color: '#2f6d4a', roughness: 0.4, metalness: 0.2, clearcoat: 0.6 });
  const iron = std({ color: '#2a2f2c', roughness: 0.5, metalness: 0.5 });
  const cream = std({ color: '#efe6cf', roughness: 0.6 });
  const teak = std({ color: '#8a4a26', roughness: 0.45, metalness: 0.05 });
  const glassOff = std({ color: '#3a4250', roughness: 0.15, metalness: 0.3 });
  const glassOn = std({ color: '#ffe0a0', emissive: '#ffbf60', emissiveIntensity: 1.1, roughness: 0.2 });
  const lampOff = std({ color: '#efe3c0', emissive: '#ffd27a', emissiveIntensity: 0.12, roughness: 0.3 });
  const lampOn = std({ color: '#fff1b8', emissive: '#ffe08a', emissiveIntensity: 2.2, roughness: 0.3 });

  // ground: paving over the footprint, a forecourt path to each door
  root.add(box(15.8, 0.3, 11.8, 0, 0, 0, mat.paversGrey));
  // the hall: brick walls, a stone plinth and quoins, a cornice, a pitched slate roof (ridge along x)
  const cx = (HX0 + HX1) / 2, cz = (HZ0 + HZ1) / 2, W = HX1 - HX0, D = HZ1 - HZ0;
  root.add(box(W, WALL, D, cx, Y0, cz, brick));
  root.add(box(W + 0.12, 0.5, D + 0.12, cx, Y0, cz, stone));
  root.add(box(W + 0.3, 0.25, D + 0.3, cx, Y0 + WALL, cz, stone));
  for (const x of [HX0, HX1]) for (const z of [HZ0, HZ1]) root.add(box(0.5, WALL, 0.5, x, Y0, z, stone));
  const roofShape = new THREE.Shape();
  const rw = D / 2 + 0.5, rh = 2.2;
  roofShape.moveTo(-rw, 0); roofShape.lineTo(rw, 0); roofShape.lineTo(0, rh); roofShape.closePath();
  const roofG = new THREE.ExtrudeGeometry(roofShape, { depth: W + 0.6, bevelEnabled: false });
  roofG.translate(0, 0, -(W + 0.6) / 2);
  const roof = M(roofG, slate);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(cx, Y0 + WALL + 0.25, cz);
  root.add(roof);
  for (let i = 0; i < 3; i++) root.add(box(0.5, 1.2, 0.5, HX0 + 1.5 + i * 3.6, Y0 + WALL + 1.6, cz - 0.6, brick)); // chimneys
  // windows: four arched on the front, four on the back; they glow in pairs by step
  const windows = [];
  const arch = (x, z, out) => {
    const g = new THREE.Group();
    g.position.set(x, Y0 + 1.3, z);
    const pane = box(1.0, 1.7, 0.06, 0, 0, 0, glassOff);
    const top = M(new THREE.CircleGeometry(0.5, 20, 0, Math.PI), glassOff);
    top.position.y = 1.7;
    if (out < 0) { top.rotation.y = Math.PI; }
    g.add(pane, top);
    g.add(box(1.2, 0.15, 0.2, 0, -0.15, 0, stone));
    const ring = M(new THREE.TorusGeometry(0.58, 0.08, 6, 20, Math.PI), stone);
    ring.position.y = 1.7;
    g.add(ring);
    root.add(g);
    return [pane, top];
  };
  const wx = [-6.0, -4.0, 0.0, 2.0];
  wx.forEach((x, i) => windows.push({ i, parts: arch(x, HZ1 + 0.04, 1) }));
  wx.forEach((x, i) => windows.push({ i: i + 1, parts: arch(x, HZ0 - 0.04, -1) }));
  // the entrance (front) and exit (back) doors on the gate column, each under a stone arch with a green door frame
  const door = (z, out) => {
    const g = new THREE.Group();
    g.position.set(STATION_GATES.entrance[0], Y0, z);
    g.add(box(1.8, 2.5, 0.12, 0, 0, 0, std({ color: '#3a2a1c', roughness: 0.7 })));
    const top = M(new THREE.CircleGeometry(0.9, 24, 0, Math.PI), std({ color: '#ffe0a0', emissive: '#ffbf60', emissiveIntensity: 0.5 }));
    top.position.set(0, 2.5, out * 0.07);
    if (out < 0) top.rotation.y = Math.PI;
    g.add(top);
    for (const s of [-1, 1]) g.add(box(0.2, 2.6, 0.2, s * 1.0, 0, out * 0.08, green));
    const ring = M(new THREE.TorusGeometry(1.0, 0.12, 8, 24, Math.PI), green);
    ring.position.set(0, 2.55, out * 0.08);
    g.add(ring);
    root.add(g);
  };
  door(HZ1 + 0.05, 1);
  door(HZ0 - 0.05, -1);
  // the clock tower over the entrance: brick shaft, stone bands, clock faces on all four sides, a slate cap
  const TX = STATION_GATES.entrance[0], TZ = 1.9, TW = 1.9;
  root.add(box(TW, 3.0, TW, TX, Y0 + WALL, TZ, brick));
  root.add(box(TW + 0.2, 0.2, TW + 0.2, TX, Y0 + WALL + 1.0, TZ, stone));
  root.add(box(TW + 0.3, 0.25, TW + 0.3, TX, Y0 + WALL + 3.0, TZ, stone));
  const cap = M(new THREE.ConeGeometry(1.55, 1.8, 4, 1), slate);
  cap.rotation.y = Math.PI / 4;
  cap.position.set(TX, Y0 + WALL + 3.25 + 0.9, TZ);
  root.add(cap);
  root.add(rod(V(TX, Y0 + WALL + 5.0, TZ), V(TX, Y0 + WALL + 5.9, TZ), 0.04, iron, 6));
  root.add(M(new THREE.SphereGeometry(0.12, 10, 8), mat.gold).translateX(TX).translateY(Y0 + WALL + 5.0).translateZ(TZ));
  const hands = [];
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2;
    const g = new THREE.Group();
    g.position.set(TX + Math.sin(a) * (TW / 2 + 0.03), Y0 + WALL + 2.0, TZ + Math.cos(a) * (TW / 2 + 0.03));
    g.rotation.y = a;
    root.add(g);
    g.add(M(new THREE.CircleGeometry(0.62, 32), std({ color: '#fff8e0', emissive: '#fff1c8', emissiveIntensity: 0.25, roughness: 0.4 })));
    g.add(M(new THREE.TorusGeometry(0.64, 0.05, 6, 32), mat.gold));
    for (let h = 0; h < 12; h++) { const b = h * Math.PI / 6; g.add(box(0.04, 0.1, 0.02, Math.sin(b) * 0.52, Math.cos(b) * 0.52 - 0.05, 0.02, iron)); }
    g.add(box(0.05, 0.32, 0.03, 0, 0, 0.03, iron)); // hour hand at 12
    const mh = new THREE.Group();
    mh.position.z = 0.05;
    mh.add(box(0.035, 0.5, 0.02, 0, 0, 0, iron));
    g.add(mh);
    hands.push(mh);
  }
  // the name board over the entrance
  const board = M(new THREE.BoxGeometry(3.6, 0.7, 0.12), [cream, cream, cream, cream, signMat('JUNCTION HALL', { bg: '#2f6d4a', accent: '#f2d27a', frame: '#e6dcc4', title: 58 }), cream]);
  board.position.set(TX, Y0 + 3.35, HZ1 + 0.15);
  root.add(board);
  // the platform (x 3.2..5.4) under its canopy, and the track (x 5.6..7.6) with the engine and the carriage
  const PY = 1.0;
  root.add(box(2.2, PY - 0.3, 11.2, 4.3, 0.3, 0, stone));
  root.add(box(2.2, 0.06, 11.2, 4.3, PY, 0, mat.slabs));
  root.add(box(0.15, 0.02, 11.2, 5.3, PY + 0.06, 0, std({ color: '#e8c840', roughness: 0.6 })));
  for (const z of [-4.8, -1.6, 1.6, 4.8]) root.add(rod(V(3.5, PY, z), V(3.5, 3.6, z), 0.08, green, 10));
  const canopy = M(new THREE.BoxGeometry(2.6, 0.12, 11.0), iron);
  canopy.position.set(4.35, 3.75, 0);
  canopy.rotation.z = -0.12;
  root.add(canopy);
  root.add(box(0.05, 0.45, 11.0, 5.65, 3.2, 0, cream)); // fretted valance (plain board)
  for (let i = 0; i < 22; i++) { const t = M(new THREE.ConeGeometry(0.12, 0.25, 4), cream); t.rotation.x = Math.PI; t.position.set(5.65, 3.08, -5.25 + i * 0.5); root.add(t); }
  const lamps = [];
  for (let i = 0; i < 4; i++) {
    const z = -4.8 + i * 3.2;
    root.add(rod(V(3.5, 3.4, z), V(3.9, 3.4, z), 0.03, iron, 6));
    const l = M(new THREE.SphereGeometry(0.16, 12, 8), lampOff);
    l.position.set(3.95, 3.2, z);
    root.add(l);
    lamps.push(l);
  }
  for (const x of [6.05, 7.15]) root.add(box(0.08, 0.12, 11.6, x, 0.3, 0, mat.stainless));
  for (let i = 0; i < 20; i++) root.add(box(1.8, 0.08, 0.25, 6.6, 0.3, -5.6 + i * 0.6, mat.timber));
  // the tank engine (facing +z): frame, boiler, smokebox, chimney, dome, cab, side tanks, wheels
  const eng = new THREE.Group();
  eng.position.set(6.6, 0.42, -2.6);
  root.add(eng);
  eng.add(box(1.5, 0.35, 5.2, 0, 0.35, 0, iron));
  const boiler = M(new THREE.CylinderGeometry(0.7, 0.7, 3.2, 24), green);
  boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 1.55, 0.6);
  eng.add(boiler);
  const smoke = M(new THREE.CylinderGeometry(0.74, 0.74, 0.5, 24), iron);
  smoke.rotation.x = Math.PI / 2; smoke.position.set(0, 1.55, 2.3);
  eng.add(smoke);
  eng.add(M(new THREE.CylinderGeometry(0.2, 0.16, 0.8, 14), iron).translateY(2.5).translateZ(2.2));
  eng.add(M(new THREE.SphereGeometry(0.3, 14, 10), mat.brass).translateY(2.25).translateZ(0.6));
  for (const s of [-1, 1]) eng.add(box(0.4, 1.0, 2.6, s * 0.75, 0.7, 0.6, green));
  eng.add(box(1.6, 2.2, 1.4, 0, 0.7, -1.6, green));
  eng.add(box(1.8, 0.12, 1.6, 0, 2.9, -1.6, iron));
  for (const z of [-1.4, 0.2, 1.6]) for (const s of [-1, 1]) {
    const wh = M(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), std({ color: '#7a1c18', roughness: 0.5 }));
    wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.62, 0.5, z);
    eng.add(wh);
  }
  eng.add(box(1.6, 0.4, 0.15, 0, 0.35, 2.7, std({ color: '#b8202a', roughness: 0.5 }))); // buffer beam
  // the teak carriage behind the engine
  const car = new THREE.Group();
  car.position.set(6.6, 0.42, 2.9);
  root.add(car);
  car.add(box(1.5, 0.3, 4.6, 0, 0.3, 0, iron));
  car.add(box(1.7, 1.9, 4.6, 0, 0.6, 0, teak));
  car.add(box(1.8, 0.18, 4.8, 0, 2.5, 0, std({ color: '#d8d0c0', roughness: 0.7 })));
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) car.add(box(0.03, 0.7, 0.7, s * 0.86, 1.4, -1.6 + i * 1.07, glassOff));
  for (const z of [-1.6, 1.6]) for (const s of [-1, 1]) {
    const wh = M(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 18), iron);
    wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.62, 0.4, z);
    car.add(wh);
  }
  // the gates on the gate column, front and back (the paths to them)
  root.add(box(1.8, 0.04, 6 - HZ1, STATION_GATES.entrance[0], 0.3, (HZ1 + 6) / 2, mat.pavers));
  root.add(box(1.8, 0.04, 6 + HZ0, STATION_GATES.exit[0], 0.3, (HZ0 - 6) / 2, mat.pavers));
  const pose = (step) => {
    lamps.forEach((l, i) => { l.material = i === step ? lampOn : lampOff; });
    for (const w of windows) for (const p of w.parts) p.material = (w.i + step) % 4 < 2 ? glassOn : glassOff;
    for (const h of hands) h.rotation.z = -(step / STATION_LIGHT_STEPS) * Math.PI * 2;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const pictures = [...stationKeys().entries()].map(([id, g]) => ({ keys: g.keys, pose: () => m.pose(Number(id.slice(1))) }));
    B.log(`station_show: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'station_show', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
