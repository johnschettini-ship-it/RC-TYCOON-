// Round 7 ride and building kit: track frames + profile sweeps (wooden, inverted, bobsled and flume tracks),
// timber trestles, ride cars with seated riders, Ferris wheel, slide tower, drop tower, monorail, food stalls,
// market huts, a log lodge, city buildings, gulls. Everything takes the scene kit K (kit.js) and adds to K.root.
import * as THREE from 'three';
import * as TX from './textures.js';
import { M, V, rod, std, rep } from './kit.js';
import { person, randomLook } from './people.js';

// ---------------------------------------------------------------- track frames: points, tangents, lateral and up with banking
export function frames(ctrl, { closed = true, step = 0.25, top = null, flat = () => false, bankMax = 1.0, smooth = 10, bankScale = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(ctrl, closed, 'centripetal');
  const L = curve.getLength();
  const NS = Math.ceil(L / step);
  const P = [], Tn = [], Lt = [], Up = [];
  for (let i = 0; i <= NS; i++) { const u = i / NS; P.push(curve.getPointAt(u)); Tn.push(curve.getTangentAt(u)); }
  const idx = (i) => closed ? ((i % NS) + NS) % NS : Math.max(0, Math.min(NS, i));
  const peak = top ?? Math.max(...P.map((p) => p.y)) + 0.3;
  const raw = [];
  for (let i = 0; i <= NS; i++) {
    const a = Tn[idx(i - 2)], b = Tn[idx(i + 2)];
    const dT = b.clone().sub(a).divideScalar(4 * L / NS);
    const lat = V(0, 1, 0).cross(Tn[i]).normalize();
    const kappa = dT.dot(lat);
    const v2 = Math.max(6, 2 * 9.81 * (peak - P[i].y));
    raw.push(Math.max(-bankMax, Math.min(bankMax, Math.atan(v2 * kappa / 9.81) * bankScale)));
  }
  const bank = raw.map((_, i) => { let s = 0, n = 0; for (let k = -smooth; k <= smooth; k++) { s += raw[idx(i + k)]; n++; } return s / n; });
  for (let i = 0; i <= NS; i++) {
    const t = Tn[i], lat = V(0, 1, 0).cross(t).normalize(), up = t.clone().cross(lat).normalize();
    const b = flat(P[i], i) ? 0 : bank[i];
    const q = new THREE.Quaternion().setFromAxisAngle(t, -b);
    Lt.push(lat.applyQuaternion(q)); Up.push(up.applyQuaternion(q));
  }
  return { curve, P, Tn, Lt, Up, NS, L, closed, idx, step: L / NS };
}

// sweep a set of open polylines (in the track's lateral/up plane) along the frames -> one mesh
// profile: [[ [l,u], [l,u], ... ], ...]; each polyline gets its own vertices so edges stay crisp
export function sweep(F, profile, mat, { i0 = 0, i1 = F.NS, uvLen = 2, cast = true } = {}) {
  const pos = [], uv = [], index = [];
  let base = 0;
  for (const line of profile) {
    let across = 0;
    const acc = [0];
    for (let k = 1; k < line.length; k++) { across += Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]); acc.push(across); }
    for (let i = i0; i <= i1; i++) {
      const p = F.P[i], l = F.Lt[i], u = F.Up[i];
      line.forEach(([a, b], k) => { pos.push(p.x + l.x * a + u.x * b, p.y + l.y * a + u.y * b, p.z + l.z * a + u.z * b); uv.push((i * F.step) / uvLen, acc[k]); });
    }
    const n = line.length;
    for (let i = 0; i < i1 - i0; i++) for (let k = 0; k < n - 1; k++) {
      const a = base + i * n + k, b = a + n;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
    base += (i1 - i0 + 1) * n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return M(g, mat, cast, true);
}
// box cross-section centred at (l,u), size w x h -> four polylines (outward faces)
export const boxProfile = (l, u, w, h) => {
  const a = [l - w / 2, u - h / 2], b = [l + w / 2, u - h / 2], c = [l + w / 2, u + h / 2], d = [l - w / 2, u + h / 2];
  return [[d, c], [c, b], [b, a], [a, d]];
};

// ---------------------------------------------------------------- instanced beams (timber trestles, steel lattices, piles)
export class Beams {
  constructor() { this.list = []; }
  add(a, b, w, h = w, upRef = null) { this.list.push([a.clone(), b.clone(), w, h, upRef]); return this; }
  mesh(mat) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, this.list.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), mx = new THREE.Matrix4();
    this.list.forEach(([a, b, w, h, upRef], n) => {
      const d = b.clone().sub(a), len = d.length(); d.normalize();
      let ref = upRef || (Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0));
      const x = ref.clone().cross(d).normalize(), z = x.clone().cross(d).normalize(); // right-handed basis (x, d, z)
      mx.makeBasis(x, d, z); q.setFromRotationMatrix(mx);
      m4.compose(a.clone().add(b).multiplyScalar(0.5), q, V(w, len, h));
      im.setMatrixAt(n, m4);
    });
    im.count = this.list.length;
    im.castShadow = true; im.receiveShadow = true;
    return im;
  }
}

// place an object on the track at sample i (car's local: x lateral, y up, z forward)
export function onTrack(F, i, obj) {
  i = F.idx(Math.round(i));
  const mx = new THREE.Matrix4().makeBasis(F.Lt[i], F.Up[i], F.Tn[i]);
  obj.quaternion.setFromRotationMatrix(mx);
  obj.position.copy(F.P[i]);
  return obj;
}

// ---------------------------------------------------------------- seated riders
export function rider(K, seed, pose, look = {}) {
  return person(randomLook(seed, { ...K.look, balloon: null, backpack: null, bag: null, ...look }), pose);
}

// open-top coaster car (wooden or steel sit-down): rows x 2 seats, riders with lap bars, painted body
export function sitCar(K, { seed, color = '#c8231e', trim = '#f0b323', lead = false, rows = 2, armsUp = false, len = 2.1, w = 1.3 }) {
  const { mat } = K;
  const body = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 });
  const trimM = std({ color: trim, roughness: 0.35, metalness: 0.6 });
  const car = new THREE.Group();
  car.add(M(new THREE.BoxGeometry(0.5, 0.16, len * 0.9), mat.darkSteel));
  for (const s of [-1, 1]) for (const z of [-len * 0.34, len * 0.34]) { const wb = M(new THREE.BoxGeometry(0.16, 0.28, 0.36), mat.darkSteel); wb.position.set(s * 0.52, 0, z); car.add(wb); }
  const by = 0.2;
  car.add(M(new THREE.BoxGeometry(w, 0.1, len), body).translateY(by));
  for (const s of [-1, 1]) {
    const sd = M(new THREE.BoxGeometry(0.08, 0.58, len), body); sd.position.set(s * (w / 2 - 0.04), by + 0.29, 0); car.add(sd);
    const t = M(new THREE.BoxGeometry(0.1, 0.05, len), trimM); t.position.set(s * (w / 2 - 0.04), by + 0.6, 0); car.add(t);
  }
  const back = M(new THREE.BoxGeometry(w, 0.85, 0.1), body); back.position.set(0, by + 0.42, -len / 2 + 0.05); car.add(back);
  const front = M(new THREE.BoxGeometry(w, 0.58, 0.1), body); front.position.set(0, by + 0.29, len / 2 - 0.05); car.add(front);
  if (lead) { const nose = M(new THREE.CylinderGeometry(w / 2, w / 2, 0.6, 16, 1, false, 0, Math.PI), body); nose.rotation.z = Math.PI / 2; nose.rotation.y = Math.PI / 2; nose.position.set(0, by + 0.3, len / 2); nose.scale.set(1, 1, 0.55); car.add(nose); }
  let n = 0;
  const rowZ = rows === 1 ? [0] : Array.from({ length: rows }, (_, r) => len / 2 - 0.55 - r * (len - 0.9) / (rows - 1));
  for (const z of rowZ) {
    const seat = M(new THREE.BoxGeometry(w - 0.2, 0.12, 0.48), mat.seat); seat.position.set(0, by + 0.19, z - 0.05); car.add(seat);
    const sb = M(new THREE.BoxGeometry(w - 0.2, 0.55, 0.1), mat.seat); sb.position.set(0, by + 0.48, z - 0.32); sb.rotation.x = -0.15; car.add(sb);
    for (const x of [-0.29, 0.29]) {
      const p = rider(K, seed + n++, { kind: 'ride', armsUp: armsUp && n % 3 !== 0, legsHidden: true });
      p.position.set(x, by + 0.26, z - 0.16);
      car.add(p);
    }
    car.add(rod(V(-0.55, by + 0.6, z + 0.2), V(0.55, by + 0.6, z + 0.2), 0.03, trimM, 8));
  }
  return car;
}

// inverted coaster car: bogie on the rails, a seat frame hanging below, 4 seats across, legs dangling, shoulder bars
export function invertedCar(K, { seed, color = '#f0b323', lead = false, armsUp = false }) {
  const { mat } = K;
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.2, clearcoat: 0.8 });
  const car = new THREE.Group();
  car.add(M(new THREE.BoxGeometry(0.5, 0.18, 1.7), mat.darkSteel).translateY(-0.05));
  for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) { const wb = M(new THREE.BoxGeometry(0.16, 0.3, 0.34), mat.darkSteel); wb.position.set(s * 0.5, 0.0, z); car.add(wb); }
  car.add(M(new THREE.BoxGeometry(0.22, 0.85, 0.3), mat.darkSteel).translateY(-0.55)); // hanger
  const frame = M(new THREE.BoxGeometry(2.7, 0.14, 0.45), paint); frame.position.set(0, -0.98, -0.1); car.add(frame);
  if (lead) { const nose = M(new THREE.ConeGeometry(0.5, 1.0, 16), paint); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.95, 0.75); nose.scale.set(2.2, 1, 0.5); car.add(nose); }
  const seats = [-1.0, -0.33, 0.33, 1.0];
  seats.forEach((x, k) => {
    const back = M(new THREE.BoxGeometry(0.5, 0.75, 0.12), mat.seat); back.position.set(x, -1.4, -0.28); car.add(back);
    const seat = M(new THREE.BoxGeometry(0.5, 0.1, 0.42), mat.seat); seat.position.set(x, -1.8, -0.05); car.add(seat);
    const p = rider(K, seed + k, { kind: 'dangle', armsUp: armsUp && k % 2 === 0 });
    p.position.set(x, -1.72, -0.12);
    car.add(p);
    // over-the-shoulder restraint: two padded bars
    for (const s of [-1, 1]) { const b = M(new THREE.BoxGeometry(0.07, 0.5, 0.08), paint); b.position.set(x + s * 0.13, -1.38, 0.0); b.rotation.x = 0.25; car.add(b); }
  });
  return car;
}

// hollow-log boat for the flume: bark outside, pale wood inside, riders one behind another
export function logBoat(K, { seed, riders = 3 }) {
  const { mat } = K;
  const g = new THREE.Group();
  const shellG = new THREE.CylinderGeometry(0.62, 0.62, 3.0, 20, 1, false, Math.PI / 2, Math.PI); shellG.rotateX(Math.PI / 2);
  const shell = M(shellG, [mat.bark, mat.timber]); shell.material = mat.bark; shell.position.y = 0.6; g.add(shell);
  const inner = M(shellG.clone(), mat.timber); inner.scale.set(0.9, 0.9, 0.98); inner.position.y = 0.6; inner.material = std({ color: '#c9a77a', roughness: 0.8, side: THREE.BackSide }); g.add(inner);
  const nose = M(new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat.bark); nose.position.set(0, 0.6, 1.5); nose.scale.set(1, 1, 0.7); g.add(nose);
  const tail = M(new THREE.CircleGeometry(0.62, 16, Math.PI, Math.PI), std({ color: '#b48a5a', roughness: 0.9, side: THREE.DoubleSide })); tail.position.set(0, 0.6, -1.5); g.add(tail);
  for (let r = 0; r < riders; r++) {
    const z = 0.9 - r * 0.85;
    const seat = M(new THREE.BoxGeometry(0.9, 0.08, 0.3), mat.timber); seat.position.set(0, 0.35, z - 0.15); g.add(seat);
    const p = rider(K, seed + r, { kind: 'ride', legsHidden: true, armsUp: r === 0 });
    p.position.set(0, 0.42, z - 0.18); g.add(p);
  }
  return g;
}

// bobsled: a rounded sled body, riders in tandem
export function sled(K, { seed, color = '#c8231e', riders = 2 }) {
  const { mat } = K;
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const g = new THREE.Group();
  const bodyG = new THREE.CapsuleGeometry(0.42, 1.6, 6, 16); bodyG.rotateX(Math.PI / 2); bodyG.scale(1, 0.62, 1);
  const body = M(bodyG, paint); body.position.y = 0.35; g.add(body);
  const cut = M(new THREE.BoxGeometry(0.62, 0.05, 1.6), mat.seat); cut.position.set(0, 0.62, -0.15); g.add(cut);
  for (const s of [-1, 1]) g.add(rod(V(s * 0.3, 0.05, -1.1), V(s * 0.3, 0.05, 1.1), 0.03, mat.stainless, 6));
  for (let r = 0; r < riders; r++) {
    const p = rider(K, seed + r, { kind: 'ride', legsHidden: true, armsUp: r === riders - 1 && seed % 2 === 0 });
    p.position.set(0, 0.5, 0.45 - r * 0.75); g.add(p);
  }
  return g;
}

// ---------------------------------------------------------------- Ferris wheel (axle along the local x axis)
export function ferrisWheel(K, { x, z, y = 0, D = 16, n = 16, yaw = 0, colors = ['#c8372d', '#2f6fb5', '#f0b323', '#3b7d4f'], seed = 700, look = {} }) {
  const { mat, root } = K;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const R = D / 2, hubY = R + 2.4, W = 1.0;
  const white = mat.steelWhite;
  // A-frame legs both sides of the wheel, footings, a boarding platform with steps
  for (const s of [-1, 1]) {
    const top = V(s * (W + 0.35), hubY, 0);
    for (const d of [-1, 1]) {
      const foot = V(s * (W + 1.5), 0, d * R * 0.62);
      g.add(rod(foot, top, 0.2, white, 12));
      g.add(M(new THREE.BoxGeometry(1.0, 0.4, 1.0), mat.concrete).translateX(foot.x).translateY(0.2).translateZ(foot.z));
    }
    g.add(rod(V(s * (W + 1.2), hubY * 0.35, -R * 0.42), V(s * (W + 1.2), hubY * 0.35, R * 0.42), 0.1, white, 8));
  }
  g.add(rod(V(-(W + 0.6), hubY, 0), V(W + 0.6, hubY, 0), 0.32, mat.darkSteel, 16));
  const wheel = new THREE.Group(); wheel.position.y = hubY; g.add(wheel);
  for (const s of [-1, 1]) {
    const ring = M(new THREE.TorusGeometry(R, 0.11, 8, 96), white); ring.rotation.y = Math.PI / 2; ring.position.x = s * W; wheel.add(ring);
    const ring2 = M(new THREE.TorusGeometry(R * 0.86, 0.07, 8, 96), white); ring2.rotation.y = Math.PI / 2; ring2.position.x = s * W; wheel.add(ring2);
    const hub = M(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 20), mat.darkSteel); hub.rotation.z = Math.PI / 2; hub.position.x = s * W; wheel.add(hub);
  }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), K.ringBulb, n * 2 * 10);
  const m4 = new THREE.Matrix4(); let bn = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = (r) => V(0, Math.cos(a) * r, Math.sin(a) * r);
    for (const s of [-1, 1]) {
      wheel.add(rod(p(0.7).setX(s * W), p(R).setX(s * W), 0.05, white, 6));
      for (let k = 1; k <= 10; k++) { const q = p(0.7 + (R - 0.7) * k / 10.5); m4.makeTranslation(s * (W + 0.07), q.y, q.z); bulbs.setMatrixAt(bn++, m4); }
    }
    // zig-zag bracing between the rims and a cross bar carrying the gondola
    const a2 = ((i + 0.5) / n) * Math.PI * 2;
    wheel.add(rod(p(R).setX(-W), V(W, Math.cos(a2) * R * 0.86, Math.sin(a2) * R * 0.86), 0.035, white, 6));
    wheel.add(rod(p(R).setX(-W - 0.2), p(R).setX(W + 0.2), 0.06, mat.darkSteel, 8));
  }
  wheel.add(bulbs);
  // gondolas: open tubs hanging straight down from the rim cross bars, two or three riders each, canopy above
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const py = Math.cos(a) * R, pz = Math.sin(a) * R;
    const gd = new THREE.Group(); gd.position.set(0, hubY + py, pz); g.add(gd);
    const col = colors[i % colors.length];
    const paint = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, clearcoat: 0.8 });
    for (const s of [-1, 1]) gd.add(rod(V(s * 0.75, 0, 0), V(s * 0.75, -1.0, 0), 0.03, mat.darkSteel, 6));
    const tub = M(new THREE.CylinderGeometry(0.8, 0.7, 0.75, 20, 1, true), std({ color: col, roughness: 0.4, side: THREE.DoubleSide })); tub.position.y = -1.55; gd.add(tub);
    const floor = M(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20), mat.darkSteel); floor.position.y = -1.9; gd.add(floor);
    const rim = M(new THREE.TorusGeometry(0.8, 0.04, 6, 24), mat.stainless); rim.rotation.x = Math.PI / 2; rim.position.y = -1.17; gd.add(rim);
    const can = M(new THREE.ConeGeometry(0.95, 0.4, 20), paint); can.position.y = 0.25; gd.add(can);
    gd.add(M(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), mat.darkSteel).translateY(0.0));
    const bench = M(new THREE.BoxGeometry(1.2, 0.08, 0.32), mat.timber); bench.position.set(0, -1.55, -0.4); gd.add(bench);
    const bench2 = M(new THREE.BoxGeometry(1.2, 0.08, 0.32), mat.timber); bench2.position.set(0, -1.55, 0.4); gd.add(bench2);
    const nr = 2 + (i % 2);
    for (let k = 0; k < nr; k++) {
      const front = k === 2;
      const p = rider(K, seed + i * 3 + k, { kind: 'sit' }, look);
      p.position.set(front ? 0 : (k ? 0.3 : -0.3), -1.5, front ? 0.4 : -0.38); p.rotation.y = front ? Math.PI : 0;
      gd.add(p);
    }
  }
  // boarding platform with railing and steps
  const plat = M(new THREE.BoxGeometry(3.4, 0.5, 3.2), mat.boards); plat.position.set(0, 0.25, hubY - R - 2.0 > 0 ? R : 0); plat.position.z = 0; g.add(plat);
  for (let k = 0; k < 3; k++) { const st = M(new THREE.BoxGeometry(1.6, 0.16, 0.34), mat.boards); st.position.set(0, 0.08 + k * 0.16 - 0.08 * 0 , 1.6 + 0.34 * (2 - k) + 0.17); st.scale.y = 1; st.position.y = (k + 1) * 0.16 / 2; st.scale.y = k + 1; g.add(st); }
  root.add(g);
  K.addLight(V(x, y + hubY, z), '#ffd49a', 30, 20);
  return { group: g, hubY, R };
}

// ---------------------------------------------------------------- slide tower (spiral mat slide round a striped tower)
export function slideTower(K, { x, z, y = 0, H = 12, seed = 800 }) {
  const { mat, root } = K;
  const g = new THREE.Group(); g.position.set(x, y, z);
  const r0 = 2.1, r1 = 1.5;
  const stripes = std({ map: rep(TX_stripes(), 3, 1), roughness: 0.55 });
  const tower = M(new THREE.CylinderGeometry(r1, r0, H, 48, 1, false), [stripes, mat.cream, mat.cream]); tower.position.y = H / 2; g.add(tower);
  const band = M(new THREE.CylinderGeometry(r1 + 0.08, r1 + 0.08, 0.3, 48), mat.cream); band.position.y = H; g.add(band);
  // balcony + railings at the top, conical roof with a pennant
  const bal = M(new THREE.CylinderGeometry(r1 + 0.9, r1 + 0.9, 0.18, 48), mat.boards); bal.position.y = H - 0.1; g.add(bal);
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, a1 = (i + 1) / 28 * Math.PI * 2; const p0 = V(Math.cos(a) * (r1 + 0.85), H, Math.sin(a) * (r1 + 0.85)), p1 = V(Math.cos(a1) * (r1 + 0.85), H, Math.sin(a1) * (r1 + 0.85)); g.add(rod(p0, p0.clone().setY(H + 1.0), 0.025, mat.whiteTimber, 5)); g.add(rod(p0.clone().setY(H + 1.0), p1.clone().setY(H + 1.0), 0.03, mat.whiteTimber, 5)); }
  const roofC = M(new THREE.ConeGeometry(r1 + 1.1, 2.6, 48, 1, true), std({ map: rep(TX_stripes(), 2, 1), roughness: 0.6, side: THREE.DoubleSide })); roofC.position.y = H + 2.6; g.add(roofC);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.add(rod(V(Math.cos(a) * (r1 + 0.85), H, Math.sin(a) * (r1 + 0.85)), V(Math.cos(a) * (r1 + 0.85), H + 1.3, Math.sin(a) * (r1 + 0.85)), 0.05, mat.whiteTimber, 6)); }
  g.add(rod(V(0, H + 3.9, 0), V(0, H + 5.4, 0), 0.03, mat.darkSteel, 6));
  const flag = M(new THREE.PlaneGeometry(0.9, 0.5), std({ color: '#2f6fb5', roughness: 0.8, side: THREE.DoubleSide })); flag.position.set(0.45, H + 5.1, 0); g.add(flag);
  // door at the base with a small porch, lit window slits up the tower
  const door = M(new THREE.BoxGeometry(1.0, 2.0, 0.2), std({ color: '#3a2a20', roughness: 0.6 })); door.position.set(0, 1.0, r0 - 0.02); g.add(door);
  for (let k = 1; k < 5; k++) { const w = M(new THREE.BoxGeometry(0.3, 0.6, 0.1), K.windowGlow); const rr = r0 - (r0 - r1) * (k * 2.4 / H); w.position.set(Math.sin(k * 1.9) * rr, k * 2.4, Math.cos(k * 1.9) * rr); w.lookAt(0, k * 2.4, 0); g.add(w); }
  // the slide: helix sweep of a shallow U section, 3.3 turns, exiting onto a run-out with a mat
  const turns = 3.3, rr = r0 + 1.0, yTop = H - 0.6, yBot = 0.7;
  const pts = [];
  const NSP = 260;
  for (let i = 0; i <= NSP; i++) {
    const t = i / NSP, a = Math.PI * 0.5 - t * turns * Math.PI * 2;
    const rad = rr - (r0 - r1) * (1 - t) * 0.7 - 0 + t * 0.0;
    pts.push(V(Math.cos(a) * (rad + (1 - t) * -0.5), yTop - (yTop - yBot) * t, Math.sin(a) * (rad + (1 - t) * -0.5)));
  }
  const endA = Math.PI * 0.5 - turns * Math.PI * 2;
  const endP = pts[pts.length - 1], dirOut = V(-Math.sin(endA), 0, Math.cos(endA)).multiplyScalar(-1);
  pts.push(endP.clone().addScaledVector(dirOut, 1.6).setY(0.45), endP.clone().addScaledVector(dirOut, 3.2).setY(0.35));
  const F = frames(pts, { closed: false, step: 0.15, bankMax: 0.5, bankScale: 0.4, smooth: 6 });
  const prof = [[[-0.62, 0.42], [-0.6, 0.05], [-0.45, -0.05], [0.45, -0.05], [0.6, 0.05], [0.62, 0.42]]];
  const chute = std({ color: '#f1ede4', roughness: 0.35, side: THREE.DoubleSide, map: K.tx.paint.map });
  g.add(sweep(F, prof, chute));
  g.add(sweep(F, [[[0.62, 0.42], [0.7, 0.3], [0.7, -0.15], [-0.7, -0.15], [-0.7, 0.3], [-0.62, 0.42]]], std({ color: '#c8372d', roughness: 0.45 })));
  // supports: brackets from the tower to the outer edge every ~1.5 m of slide
  for (let i = 4; i < F.NS - 16; i += 10) { const p = F.P[i]; const inner = V(p.x, p.y - 0.15, p.z).multiplyScalar(1); const toward = V(p.x, 0, p.z).normalize(); g.add(rod(p.clone().add(V(0, -0.2, 0)), V(toward.x * (r0 - 0.1 - (r0 - r1) * p.y / H), p.y - 0.8, toward.z * (r0 - 0.1 - (r0 - r1) * p.y / H)), 0.04, mat.whiteTimber, 5)); void inner; }
  for (const k of [F.NS - 12, F.NS - 2]) { const p = F.P[k]; g.add(rod(V(p.x, 0, p.z), p.clone().add(V(0, -0.15, 0)), 0.05, mat.whiteTimber, 6)); }
  // riders on mats at three points on the way down
  [Math.floor(F.NS * 0.18), Math.floor(F.NS * 0.52), Math.floor(F.NS * 0.83)].forEach((i, k) => {
    const holder = new THREE.Group(); onTrack(F, i, holder); g.add(holder);
    const mt = M(new THREE.BoxGeometry(0.55, 0.04, 1.3), std({ color: ['#e2a92c', '#2f5fa5', '#3b7d4f'][k], roughness: 0.8 })); mt.position.y = 0.0; holder.add(mt);
    const p = rider(K, seed + k, { kind: 'slide' }, { child: k !== 1 }); p.position.set(0, 0.04, -0.3); holder.add(p);
  });
  root.add(g);
  return g;
}
let _stripesTex;
function TX_stripes() { return _stripesTex || (_stripesTex = TX.stripes('#c8372d', '#f4efe2', 16, false).map); }

// ---------------------------------------------------------------- drop tower: lattice-free column, seat ring with dangling riders
export function dropTower(K, { x, z, y = 0, H = 30, seatsAt = 0.62, seed = 900 }) {
  const { mat, root } = K;
  const g = new THREE.Group(); g.position.set(x, y, z);
  const col = new THREE.MeshPhysicalMaterial({ map: K.tx.paint.map, color: '#d7dde2', metalness: 0.4, roughness: 0.4, clearcoat: 0.5 });
  g.add(M(new THREE.CylinderGeometry(3.4, 3.8, 0.6, 32), mat.concrete).translateY(0.3));
  const shaft = M(new THREE.CylinderGeometry(0.9, 1.15, H, 24), col); shaft.position.y = H / 2; g.add(shaft);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const rail = M(new THREE.BoxGeometry(0.16, H - 1.5, 0.16), mat.darkSteel); rail.position.set(Math.cos(a) * 1.05, H / 2, Math.sin(a) * 1.05); g.add(rail); }
  const crown = M(new THREE.CylinderGeometry(1.6, 1.2, 1.6, 24), new THREE.MeshPhysicalMaterial({ color: '#e2312b', roughness: 0.35, clearcoat: 1 })); crown.position.y = H + 0.5; g.add(crown);
  g.add(M(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), mat.darkSteel).translateY(H + 2.4));
  const beacon = M(new THREE.SphereGeometry(0.16, 10, 8), K.bulb('#ff4a3a', 1.5, 8)); beacon.position.y = H + 3.7; g.add(beacon);
  // seat ring: carriage + 12 seats facing out, riders legs hanging
  const cy = H * seatsAt;
  const car = new THREE.Group(); car.position.y = cy; g.add(car);
  car.add(M(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: '#2f6fb5', roughness: 0.35, clearcoat: 1, side: THREE.DoubleSide })));
  car.add(M(new THREE.CylinderGeometry(2.3, 2.3, 0.16, 32), mat.darkSteel).translateY(-0.6));
  const ns = 12;
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * Math.PI * 2;
    const s = new THREE.Group(); s.position.set(Math.cos(a) * 1.95, 0, Math.sin(a) * 1.95); s.rotation.y = Math.PI / 2 - a; car.add(s);
    s.add(M(new THREE.BoxGeometry(0.5, 0.9, 0.12), mat.seat).translateY(0.05).translateZ(-0.25));
    s.add(M(new THREE.BoxGeometry(0.5, 0.1, 0.38), mat.seat).translateY(-0.45).translateZ(-0.05));
    const p = rider(K, seed + i, { kind: 'dangle', armsUp: i % 3 === 0 });
    p.position.set(0, -0.4, -0.12); s.add(p);
    for (const sd of [-1, 1]) { const b = M(new THREE.BoxGeometry(0.06, 0.55, 0.08), mat.steelYellow); b.position.set(sd * 0.13, 0.05, 0.06); b.rotation.x = 0.2; s.add(b); }
  }
  // queue fence ring
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, a1 = (i + 1) / 36 * Math.PI * 2; if (i > 31) continue; const R = 4.6; const p0 = V(Math.cos(a) * R, 0, Math.sin(a) * R), p1 = V(Math.cos(a1) * R, 0, Math.sin(a1) * R); g.add(rod(p0, p0.clone().setY(1.05), 0.03, mat.stainless, 6)); g.add(rod(p0.clone().setY(1.05), p1.clone().setY(1.05), 0.025, mat.stainless, 6)); }
  root.add(g);
  return g;
}

// ---------------------------------------------------------------- food stall (faces +z locally): counter, striped awning, sign
const boardCache = new Map();
export function signMat(text, opts = {}) {
  const key = text + JSON.stringify(opts);
  if (!boardCache.has(key)) boardCache.set(key, std({ map: TX.board([text], { w: 512, h: 112, title: 54, ...opts }).map, roughness: 0.5 }));
  return boardCache.get(key);
}
export function stall(K, { x, z, y = 0.05, rot = 0, name = 'SNACKS', awning = ['#c8372d', '#f4efe2'], body = '#f1ede4', sign = {}, w = 2.8, d = 2.2, snowRoof = false }) {
  const { mat, root } = K;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  const bm = std({ color: body, map: K.tx.siding.map, bumpMap: K.tx.siding.bump, bumpScale: 1, roughness: 0.7 });
  const h = 2.5;
  const box = M(new THREE.BoxGeometry(w, h, d), bm); box.position.y = h / 2; g.add(box);
  const hatch = M(new THREE.BoxGeometry(w - 0.5, 1.0, 0.05), K.windowGlow, false, true); hatch.position.set(0, 1.6, d / 2 + 0.01); g.add(hatch);
  const shelf = M(new THREE.BoxGeometry(w - 0.3, 0.06, 0.4), mat.timber); shelf.position.set(0, 1.08, d / 2 + 0.2); g.add(shelf);
  const aw = std({ map: TX.stripes(awning[0], awning[1], 12, true).map, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide });
  const a1 = M(new THREE.PlaneGeometry(w + 0.3, 1.1), aw); a1.rotation.x = -1.05; a1.position.set(0, 2.45, d / 2 + 0.45); g.add(a1);
  const a2 = M(new THREE.PlaneGeometry(w + 0.3, 0.3), aw); a2.position.set(0, 2.08, d / 2 + 0.92); g.add(a2);
  const roof = M(new THREE.BoxGeometry(w + 0.3, 0.14, d + 0.3), snowRoof ? mat.snowFlat : mat.roofSheet); roof.position.y = h + 0.07; g.add(roof);
  const sg = M(new THREE.BoxGeometry(w - 0.2, 0.5, 0.06), [bm, bm, bm, bm, signMat(name, sign), bm]); sg.position.set(0, h + 0.45, d / 2 - 0.15); g.add(sg);
  for (let i = 0; i < 4; i++) { const it = M(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10), std({ color: ['#e8402e', '#f2c14e', '#f4f1e8', '#3b7d4f'][i], roughness: 0.5 })); it.position.set(-w / 2 + 0.5 + i * (w - 1) / 3, 1.2, d / 2 + 0.25); g.add(it); }
  root.add(g);
  K.addLight(V(x, y + 2, z).add(V(Math.sin(rot), 0, Math.cos(rot)).multiplyScalar(d / 2 + 0.8)), '#ffcf96', 16, 7);
  return g;
}

// ---------------------------------------------------------------- gull (flying or perched)
export function gull(K, { x, y, z, rot = 0, flap = 0.4, perched = false }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  const white = std({ color: '#f4f4f0', roughness: 0.7 }), grey = std({ color: '#9aa2a8', roughness: 0.7 }), tip = std({ color: '#2a2a2a', roughness: 0.7 }), beak = std({ color: '#f0b323', roughness: 0.5 });
  const body = M(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), white); body.rotation.x = Math.PI / 2; g.add(body);
  const head = M(new THREE.SphereGeometry(0.075, 10, 8), white); head.position.set(0, 0.06, 0.24); g.add(head);
  const bk = M(new THREE.ConeGeometry(0.02, 0.09, 6), beak); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.05, 0.33); g.add(bk);
  const tail = M(new THREE.BoxGeometry(0.12, 0.02, 0.14), grey); tail.position.set(0, 0.0, -0.25); g.add(tail);
  if (perched) {
    for (const s of [-1, 1]) { const w = M(new THREE.BoxGeometry(0.05, 0.08, 0.36), grey); w.position.set(s * 0.09, 0.03, -0.04); g.add(w); }
    for (const s of [-1, 1]) g.add(rod(V(s * 0.04, -0.06, 0), V(s * 0.04, -0.17, 0.01), 0.01, beak, 4));
    g.position.y += 0.17;
  } else {
    for (const s of [-1, 1]) {
      const inner = new THREE.Group(); inner.position.set(s * 0.06, 0.02, 0); inner.rotation.z = s * flap; g.add(inner);
      const w1 = M(new THREE.BoxGeometry(0.42, 0.02, 0.2), grey); w1.position.x = s * 0.21; inner.add(w1);
      const outer = new THREE.Group(); outer.position.x = s * 0.42; outer.rotation.z = -s * flap * 1.4; inner.add(outer);
      const w2 = M(new THREE.BoxGeometry(0.38, 0.018, 0.15), grey); w2.position.set(s * 0.19, 0, -0.03); outer.add(w2);
      const t2 = M(new THREE.BoxGeometry(0.12, 0.02, 0.12), tip); t2.position.set(s * 0.38, 0, -0.05); outer.add(t2);
    }
  }
  K.root.add(g);
  return g;
}

// ---------------------------------------------------------------- monorail: beam on T pylons + a three-car train with passengers
export function monorail(K, { pts, closed = false, y = 7, train = { at: 0.3, cars: 3 }, seed = 950, color = '#f2f0ea', stripe = '#2f6fb5' }) {
  const { mat, root } = K;
  const F = frames(pts.map(([x, z]) => V(x, y, z)), { closed, step: 0.3, bankMax: 0 });
  root.add(sweep(F, boxProfile(0, -0.45, 0.7, 0.9), mat.concrete));
  for (let i = 8; i < F.NS; i += Math.round(9 / F.step)) {
    const p = F.P[i];
    root.add(rod(V(p.x, 0, p.z), V(p.x, y - 0.9, p.z), 0.32, mat.concrete, 14));
    root.add(M(new THREE.BoxGeometry(1.2, 0.5, 1.2), mat.concrete).translateX(p.x).translateY(y - 0.95).translateZ(p.z));
    root.add(M(new THREE.CylinderGeometry(0.7, 0.8, 0.3, 14), mat.concrete).translateX(p.x).translateY(0.15).translateZ(p.z));
  }
  const body = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const st = std({ color: stripe, roughness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#2a3b48', roughness: 0.08, metalness: 0.2, clearcoat: 1 });
  const carLen = 5.2;
  for (let c = 0; c < train.cars; c++) {
    const i = Math.round(train.at * F.NS) - c * Math.round((carLen + 0.3) / F.step);
    const car = new THREE.Group(); onTrack(F, i, car); root.add(car);
    const shell = M(new THREE.BoxGeometry(2.4, 2.1, carLen), body); shell.position.y = 0.55; car.add(shell);
    const skirt = M(new THREE.BoxGeometry(2.0, 0.9, carLen - 0.2), body); skirt.position.y = -0.7; car.add(skirt);
    const roofG = new THREE.CylinderGeometry(1.2, 1.2, carLen, 20, 1, false, -Math.PI / 2, Math.PI); roofG.rotateX(Math.PI / 2);
    const roofM = M(roofG, body); roofM.position.y = 1.6; roofM.scale.set(1, 0.32, 1); car.add(roofM);
    for (const s of [-1, 1]) {
      const band = M(new THREE.BoxGeometry(0.02, 0.18, carLen), st); band.position.set(s * 1.21, -0.2, 0); car.add(band);
      const win = M(new THREE.BoxGeometry(0.03, 0.85, carLen - 0.8), glass); win.position.set(s * 1.2, 0.95, 0); car.add(win);
      // passengers visible through the windows (heads and shoulders above the sill)
      for (let k = 0; k < 3; k++) { const p = rider(K, seed + c * 10 + k + (s > 0 ? 5 : 0), { kind: 'sit' }); p.position.set(s * 0.75, -0.05, -1.6 + k * 1.5); p.rotation.y = s * -Math.PI / 2 * 0 + (k % 2 ? Math.PI : 0); car.add(p); }
    }
    if (c === 0 || c === train.cars - 1) {
      const nose = M(new THREE.SphereGeometry(1.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), body); nose.rotation.x = (c === 0 ? 1 : -1) * Math.PI / 2; nose.position.set(0, 0.55, (c === 0 ? 1 : -1) * carLen / 2); nose.scale.set(1, 0.85, 1.1); car.add(nose);
      const ws = M(new THREE.SphereGeometry(1.0, 16, 8, -Math.PI / 2, Math.PI, 0.6, 0.6), glass); ws.position.set(0, 0.6, (c === 0 ? 1 : -1) * (carLen / 2 + 0.1)); ws.rotation.y = c === 0 ? 0 : Math.PI; car.add(ws);
    }
  }
  return F;
}

// ---------------------------------------------------------------- simple original city building: brick or render facade, cornice, shopfront
let facadeCache = new Map();
export function building(K, { x, z, w, d, floors = 5, wall = [196, 120, 90], brick = true, frame = '#efe9dc', shop = '#2b3a55', shopName = null, roof = '#5a5f63', seed = 1, rot = 0 }) {
  const { mat, root } = K;
  const fh = 3.3, H = floors * fh + 1.2;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
  const key = `${wall}${brick}${frame}${seed}`;
  if (!facadeCache.has(key)) facadeCache.set(key, TX.facade(seed, { wall, brick, frame, floors: 4, bays: 4 }).map);
  const ft = facadeCache.get(key);
  const mk = (len) => { const t = ft.clone(); t.repeat.set(len / 12, (floors - 1) / 4); t.offset.set(0, 0); t.needsUpdate = true; return std({ map: t, roughness: 0.85 }); };
  const upper = M(new THREE.BoxGeometry(w, (floors - 1) * fh, d), [mk(d), mk(d), mat.roofSheet, mat.roofSheet, mk(w), mk(w)]);
  upper.position.y = fh + 0.4 + (floors - 1) * fh / 2; g.add(upper);
  // ground floor: shopfront glass, pilasters and a fascia
  const gf = M(new THREE.BoxGeometry(w, fh + 0.4, d), std({ color: '#d9d4c8', roughness: 0.8, map: K.tx.concrete.map })); gf.position.y = (fh + 0.4) / 2; g.add(gf);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#33444f', roughness: 0.06, metalness: 0.3, clearcoat: 1 });
  for (const [fx, fz, len, ry] of [[0, d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, -Math.PI / 2], [0, -d / 2, w, Math.PI]]) {
    const n = Math.max(1, Math.round(len / 3.2));
    for (let k = 0; k < n; k++) {
      const off = -len / 2 + (k + 0.5) * len / n;
      const pane = M(new THREE.BoxGeometry(len / n - 0.7, 2.3, 0.08), glass);
      pane.position.set(fx + Math.cos(ry) * off, 1.4, fz - Math.sin(ry) * off); pane.rotation.y = ry; g.add(pane);
    }
    const fascia = M(new THREE.BoxGeometry(len, 0.55, 0.12), std({ color: shop, roughness: 0.5 })); fascia.position.set(fx, fh - 0.2, fz); fascia.rotation.y = ry; g.add(fascia);
  }
  const cornice = M(new THREE.BoxGeometry(w + 0.5, 0.45, d + 0.5), std({ color: '#e6e0d2', roughness: 0.7, map: K.tx.concrete.map })); cornice.position.y = H - 0.6; g.add(cornice);
  const band = M(new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.2), std({ color: '#e6e0d2', roughness: 0.7 })); band.position.y = fh + 0.4; g.add(band);
  const rf = M(new THREE.BoxGeometry(w, 0.4, d), std({ color: roof, roughness: 0.9 })); rf.position.y = H - 0.25; g.add(rf);
  // rooftop plant box
  const r = TX.rng(seed);
  if (r() < 0.8) { const bx = M(new THREE.BoxGeometry(2.4, 1.6, 2.0), mat.steelWhite); bx.position.set((r() - 0.5) * (w - 3), H + 0.6, (r() - 0.5) * (d - 3)); g.add(bx); }
  root.add(g);
  return { group: g, H };
}

// ---------------------------------------------------------------- timber market hut (winter festival): log walls, steep roof with snow, warm hatch
export function hut(K, { x, z, rot = 0, name = 'HOT DRINKS', seed = 1, snow = true, color = '#7a2440' }) {
  const { mat, root } = K;
  const g = new THREE.Group(); g.position.set(x, 0.05, z); g.rotation.y = rot;
  const w = 3.0, d = 2.4, h = 2.3;
  const walls = std({ map: K.tx.logs.map, bumpMap: K.tx.logs.bump, bumpScale: 2, roughness: 0.85 });
  g.add(M(new THREE.BoxGeometry(w, h, d), walls).translateY(h / 2));
  const hatch = M(new THREE.BoxGeometry(w - 0.6, 1.0, 0.05), K.windowGlow, false, true); hatch.position.set(0, 1.55, d / 2 + 0.01); g.add(hatch);
  const glow = M(new THREE.BoxGeometry(w - 0.7, 0.9, 0.02), K.bulb('#ffb860', 0.9, 3)); glow.position.set(0, 1.55, d / 2 + 0.02); g.add(glow);
  const counter = M(new THREE.BoxGeometry(w - 0.3, 0.08, 0.45), mat.timber); counter.position.set(0, 1.02, d / 2 + 0.22); g.add(counter);
  // gable roof: two sloped planes + snow layer, overhanging
  const pitch = 0.7, rw = d / 2 + 0.5, rl = w + 0.7;
  for (const s of [-1, 1]) {
    const slab = M(new THREE.BoxGeometry(rl, 0.12, rw / Math.cos(pitch)), std({ color, roughness: 0.7, map: K.tx.shingles.map }));
    slab.position.set(0, h + Math.tan(pitch) * rw / 2, s * rw / 2); slab.rotation.x = s * pitch; g.add(slab);
    if (snow) { const sn = M(new THREE.BoxGeometry(rl + 0.05, 0.14, rw / Math.cos(pitch) * 0.98), mat.snowFlat); sn.position.set(0, h + Math.tan(pitch) * rw / 2 + 0.12 / Math.cos(pitch), s * rw / 2); sn.rotation.x = s * pitch; g.add(sn); }
  }
  const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, Math.tan(pitch) * d / 2)]);
  for (const s of [-1, 1]) { const gm = M(new THREE.ShapeGeometry(gable), walls); gm.position.set(s * w / 2, h, 0); gm.rotation.y = Math.PI / 2 * s; g.add(gm); }
  const sg = M(new THREE.BoxGeometry(w - 0.4, 0.42, 0.06), signMat(name, { bg: '#3a2418', accent: '#f6e2b0', frame: '#c9a46a' })); sg.position.set(0, h + 0.1, d / 2 + 0.55); g.add(sg);
  // garland of warm bulbs along the eaves
  const n = 22, bl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), K.festoon, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { const t = i / (n - 1); m4.makeTranslation(-rl / 2 + t * rl, h + 0.02 - Math.sin(t * Math.PI * 3) ** 2 * 0.12, rw + 0.02); bl.setMatrixAt(i, m4); }
  g.add(bl);
  root.add(g);
  K.addLight(V(x, 2, z), '#ffbf70', 14, 6);
  return g;
}

// ---------------------------------------------------------------- timber trestle bents under a track: posts, ledgers, X braces
// ground(x, z) gives the footing height; skip(i) leaves gaps (station, tunnels)
export function trestle(F, beams, { ground = () => 0, every = 1.8, half = 1.1, under = 0.45, skip = () => false, post = 0.16, brace = 0.09, ledger = 2.2 }) {
  const stepN = Math.max(1, Math.round(every / F.step));
  let prev = null;
  for (let i = 0; i <= (F.closed ? F.NS - 1 : F.NS); i += stepN) {
    if (skip(i, F.P[i])) { prev = null; continue; }
    const p = F.P[i], t = F.Tn[i];
    const lat = V(-t.z, 0, t.x).normalize();
    const topY = p.y - under;
    const feet = [-1, 1].map((s) => { const q = p.clone().addScaledVector(lat, s * half); return V(q.x, ground(q.x, q.z), q.z); });
    if (topY - Math.max(feet[0].y, feet[1].y) < 0.4) { prev = null; continue; }
    const tops = feet.map((f) => V(f.x, topY, f.z));
    feet.forEach((f, k) => beams.add(f, tops[k], post));
    beams.add(tops[0], tops[1], post * 0.9, post * 1.2);
    const lev = [];
    for (let y = Math.max(feet[0].y, feet[1].y) + ledger; y < topY - 0.5; y += ledger) { beams.add(V(feet[0].x, y, feet[0].z), V(feet[1].x, y, feet[1].z), brace, brace * 1.4); lev.push(y); }
    // X brace inside the bent
    const lo = Math.max(feet[0].y, feet[1].y) + 0.3;
    if (topY - lo > 1.2) { beams.add(V(feet[0].x, lo, feet[0].z), V(tops[1].x, topY - 0.2, tops[1].z), brace); beams.add(V(feet[1].x, lo, feet[1].z), V(tops[0].x, topY - 0.2, tops[0].z), brace); }
    // diagonals to the previous bent along both sides
    if (prev) for (let s = 0; s < 2; s++) {
      const a = prev.feet[s], b = tops[s];
      const yy = Math.min(prev.topY, topY) - 0.3, y0 = Math.max(a.y, feet[s].y) + 0.3;
      if (yy - y0 > 1) beams.add(V(a.x, y0, a.z), V(feet[s].x, yy, feet[s].z), brace);
      void b;
    }
    prev = { feet, topY };
  }
  return beams;
}

// ---------------------------------------------------------------- wooden coaster track on frames: laminated rails, ties, catwalk on the lift
export function woodTrack(K, F, { railMat, tieMat, steelMat, gauge = 0.55, lift = null }) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(sweep(F, boxProfile(s * gauge, -0.14, 0.24, 0.28), railMat, { uvLen: 3 }));
    g.add(sweep(F, boxProfile(s * gauge, 0.015, 0.12, 0.03), steelMat));
  }
  const n = Math.floor(F.NS * F.step / 0.55);
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.14, 0.2), tieMat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), mx = new THREE.Matrix4();
  for (let k = 0; k < n; k++) {
    const i = Math.min(F.NS, Math.round(k * 0.55 / F.step));
    mx.makeBasis(F.Lt[i], F.Up[i], F.Tn[i]); q.setFromRotationMatrix(mx);
    m4.compose(F.P[i].clone().addScaledVector(F.Up[i], -0.34), q, V(1, 1, 1)); ties.setMatrixAt(k, m4);
  }
  ties.castShadow = true; ties.receiveShadow = true; g.add(ties);
  if (lift) {
    const [a, b] = lift;
    // chain between the rails + catwalk boards with a handrail on one side
    g.add(sweep(F, boxProfile(0, -0.05, 0.12, 0.06), K.mat.chain, { i0: a, i1: b }));
    g.add(sweep(F, [[[-1.45, -0.32], [-0.75, -0.32]]], std({ color: '#7a6a58', roughness: 0.9, side: THREE.DoubleSide }), { i0: a, i1: b }));
    for (let i = a; i < b; i += Math.round(1.5 / F.step)) { const base = F.P[i].clone().addScaledVector(F.Lt[i], -1.4).addScaledVector(F.Up[i], -0.32); g.add(rod(base, base.clone().add(V(0, 1.0, 0)), 0.025, tieMat, 5)); }
    g.add(sweep(F, boxProfile(-1.4, 0.68, 0.05, 0.05), tieMat, { i0: a, i1: b }));
  }
  K.root.add(g);
  return g;
}
