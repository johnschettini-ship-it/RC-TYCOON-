// The title pictures (realistic build): an original park at golden hour seen from slightly above, from a free
// perspective camera (not the game's projection), and the name "Thrills & Chills" on a painted wood sign.
// Written by bake.mjs to dist-art/real/title/ with its own index.json (format and checks: tools/art3d/titleIndex.ts).
//
// Scene (three.js metres, x right, y up, z towards the camera): a lake in front, a winding paved path with guests
// along its far shore, and behind it the batch 1 rides: the big wheel (items/big_wheel.js), the swing tower
// (items/swing_tower.js), the kit's carousel, and a steel coaster hill (items/steel_coaster.js rails and supports,
// rides.js cars) with a train climbing the lift; trees, low hills and a warm evening sky. Light is code only: a low
// warm sun from the left behind the park (long shadows towards the viewer's right), a sky dome shader and its PMREM.
//
// Two framings (wide 1920 x 800, tall 900 x 1300), three layers each, drawn back to front by the title:
//   sky    the sky dome, the far land and the hills (opaque)
//   park   the park ground, path, rides (the wheel without its turning part), trees and guests (transparent sky)
//   front  the lake (with the park mirrored in it) and the foreground trees and reeds (transparent elsewhere)
// Each layer is rendered alone with the other layers' meshes still casting shadows (ghosts: no colour, no depth); a
// nearer layer's meshes hold the depth out where the layer must stay clear of them (the front pass holds the park
// out, so the water ends exactly at its shore). The wheel's turning part (rim, spokes, gondolas and riders) is an
// 8-frame strip, rendered over the park held out: one frame per 1/32 turn, and 8 frames make the 90 degrees after
// which its 4 gondola colours repeat, so the strip loops.
//
// Index numbers per framing: nameRow = the highest ride pixel row (the name sits above it), menuAnchorX = the wheel
// ride's leftmost pixel column (the menu stays left of it), both from the models' vertices projected by the camera.
import { THREE, kit } from './common.js';
import { M, V, rep, std, tx, planarUV } from '../kit.js';
import { rng } from '../textures.js';
import { sitCar, stall } from '../rides.js';
import { railModel, supportPiece, SEG_H } from './steel_coaster.js';
import { build as buildWheel } from './big_wheel.js';
import { build as buildSwing } from './swing_tower.js';
import { mirrorWorld } from './titleMirror.js';

const WATER_Y = -0.35;
/** Towards the sun: low (13 degrees) in the west, behind the park on the left. */
const SUN = new THREE.Vector3(-0.8, 0.23, -0.55).normalize();
const SUN_COL = '#ffbf86';
const GRADE = { exposure: 0.95, saturation: 1.04, contrast: 1.05, lift: [0.012, 0.004, 0.02], gain: [1.04, 1.0, 0.92] };
const FOG = { color: '#e6c3a4', near: 90, far: 1300 };

/** The framings: layer size and camera. */
export const FRAMINGS = {
  wide: { w: 1920, h: 800, fov: 34, pos: [0, 22, 70], at: [0, 10.2, -14] },
  tall: { w: 900, h: 1300, fov: 50, pos: [8, 26, 100], at: [6, 11.2, -14] },
};

// ------------------------------------------------------------------ the land
const LAKE = { x: 8, z: 18, rx: 46, rz: 11 };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function lakeD(x, z) { return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz); }
/** Ground height (m): gentle swells, a knoll at the left front, the lake bowl. */
function ground(x, z) {
  const ride = smooth(-60, -40, z) * (1 - smooth(-8, 6, z)); // flatter where the rides stand
  let y = (0.45 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.06) + 0.3 * Math.sin(x * 0.11 + z * 0.07)) * (1 - 0.8 * ride);
  y += 3.2 * Math.exp(-(((x + 52) / 26) ** 2 + ((z - 18) / 20) ** 2)); // the knoll the wide menu stands on
  y += 1.6 * Math.exp(-(((x - 62) / 22) ** 2 + ((z - 10) / 16) ** 2));
  const d = lakeD(x, z);
  y = y * smooth(0.82, 1.15, d) + -1.7 * (1 - smooth(0.7, 1.02, d));
  return y;
}

function lawnMat() {
  return std({ map: rep(tx.grass.map, 1), bumpMap: rep(tx.grass.bump, 1), bumpScale: 1.1, roughness: 0.95, vertexColors: true });
}

/** A ground sheet over [x0, x1] x [z0, z1] following `height`, tinted in soft blotches, with a sandy shore band. */
function groundSheet(x0, x1, z0, z1, sx, sz, height, mat, seed) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const r = rng(seed);
  const blots = Array.from({ length: 90 }, () => [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0), 4 + r() * 14, r() - 0.5]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = height(x, z);
    p.setY(i, y);
    let k = 1;
    for (const [bx, bz, rad, s] of blots) { const d = Math.hypot(x - bx, z - bz); if (d < rad) k += s * 0.3 * (1 - d / rad) ** 2; }
    let c = [k * 1.08, k * 1.0, k * 0.78];
    const shore = 1 - smooth(WATER_Y + 0.05, WATER_Y + 0.45, y); // sandy bank at the waterline
    const bed = 1 - smooth(WATER_Y - 0.6, WATER_Y, y);
    c = c.map((v, j) => v * (1 + shore * [0.35, 0.18, -0.12][j]) * (1 - bed * [0.45, 0.4, 0.35][j]));
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  planarUV(g, 5);
  return M(g, mat, false, true);
}

// ------------------------------------------------------------------ the sky
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FS = `
varying vec3 vDir;
uniform vec3 sunDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec2 hz = normalize(d.xz + 1e-5);
  float toSun = dot(hz, normalize(sunDir.xz)) * 0.5 + 0.5;          // 1 under the sun, 0 opposite
  vec3 zen = vec3(0.14, 0.27, 0.6);
  vec3 mid = vec3(0.44, 0.52, 0.8);
  vec3 horSun = vec3(1.7, 0.8, 0.33);
  vec3 horAway = vec3(1.1, 0.6, 0.56);
  vec3 hor = mix(horAway, horSun, pow(toSun, 1.6));
  float t = clamp(y, 0.0, 1.0);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.28, pow(t, 0.8)));
  c = mix(c, zen, smoothstep(0.22, 0.95, t));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += vec3(1.0, 0.55, 0.22) * (pow(s, 6.0) * 0.9 + pow(s, 40.0) * 1.2) + vec3(1.0, 0.85, 0.6) * pow(s, 900.0) * 30.0;
  // clouds: soft streaks low in the sky, lit gold towards the sun, rose and lilac away from it
  if (y > 0.0) {
    vec2 p = d.xz / (y + 0.12) * vec2(0.9, 2.6);
    float n = fbm(p * 1.3 + vec2(3.0, 0.0));
    float band = smoothstep(0.015, 0.09, y) * (1.0 - smoothstep(0.25, 0.5, y));
    float cl = smoothstep(0.52, 0.78, n) * band;
    vec3 lit = mix(vec3(1.25, 0.72, 0.62), vec3(1.7, 1.05, 0.55), pow(toSun, 1.4));
    vec3 dark = mix(vec3(0.62, 0.52, 0.66), vec3(0.86, 0.6, 0.52), toSun);
    vec3 cc = mix(dark, lit, smoothstep(0.5, 0.95, n + 0.15 * toSun));
    c = mix(c, cc, cl * 0.85);
  } else {
    c = hor * 0.92;
  }
  c += (hash(gl_FragCoord.xy) - 0.5) * 0.006;                       // dither: no banding in the WebP
  gl_FragColor = vec4(c, 1.0);
}`;
function skyMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: SUN.clone() } } });
}

/** Far land: a flat plain beyond the park and three ranges of low hills, hazed by the fog. */
function farLand() {
  const g = new THREE.Group();
  const plainMat = std({ color: '#6d7c45', roughness: 1, vertexColors: true });
  g.add(groundSheet(-1600, 1600, -1600, -76, 64, 40, () => -0.04, plainMat, 77));
  const ranges = [
    { z: -170, depth: 230, hmax: 24, col: '#62783f', n: 10, seed: 3 },
    { z: -400, depth: 330, hmax: 58, col: '#5a6f48', n: 7, seed: 5 },
    { z: -780, depth: 420, hmax: 105, col: '#61705a', n: 6, seed: 9 },
  ];
  for (const R of ranges) {
    const rr = rng(R.seed);
    const bumps = Array.from({ length: R.n }, () => [(rr() * 2 - 1) * 1300, 160 + rr() * 260, R.hmax * (0.45 + rr() * 0.55)]);
    const prof = (x) => bumps.reduce((a, [bx, w, h]) => Math.max(a, h * Math.exp(-(((x - bx) / w) ** 2))), 0) + R.hmax * 0.12;
    const mat = std({ color: R.col, roughness: 1, vertexColors: true });
    g.add(groundSheet(-1700, 1700, R.z - R.depth, R.z, 170, 12, (x, z) => prof(x) * Math.sin(Math.PI * Math.min(1, Math.max(0, (R.z - z) / R.depth))) ** 0.6, mat, R.seed));
    // woods on the two nearer ranges and hedgerow trees on the plain: small dark crowns, in patches
    if (R.seed !== 9) {
      const blob = new THREE.IcosahedronGeometry(1, 1);
      const N = R.seed === 3 ? 9000 : 6000;
      const im = new THREE.InstancedMesh(blob, std({ color: '#ffffff', roughness: 1 }), N);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      const patch = (x, z) => Math.sin(x * 0.011 + R.seed) * Math.cos(z * 0.019 + x * 0.004) + 0.6 * Math.sin(x * 0.031 - z * 0.023);
      let n = 0;
      for (let i = 0; i < N * 4 && n < N; i++) {
        const x = (rr() * 2 - 1) * 1100, z = R.z + 80 - rr() * (R.depth * 0.75 + 80);
        if (patch(x, z) < 0.35) continue;
        const y = z > R.z ? 0 : prof(x) * Math.sin(Math.PI * Math.min(1, Math.max(0, (R.z - z) / R.depth))) ** 0.6;
        const sz = (R.seed === 3 ? 2.6 : 4) * (0.7 + rr() * 0.7);
        m4.makeScale(sz, sz * 0.85, sz).setPosition(x, y + sz * 0.5, z);
        im.setMatrixAt(n, m4);
        const k = 0.75 + rr() * 0.4;
        im.setColorAt(n, col.set('#4a6234').multiplyScalar(k));
        n++;
      }
      im.count = n;
      g.add(im);
    }
  }
  return g;
}

// ------------------------------------------------------------------ the park
/** A centre line through control points [x, z] as evenly spaced samples (0.5 m), with tangents. */
function pathLine(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
  const n = Math.ceil(curve.getLength() / 0.5);
  const P = curve.getSpacedPoints(n);
  return { curve, P, T: P.map((_, i) => P[Math.min(n, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize()) };
}

/** A paved path ribbon `w` wide along the ground, with low kerbs on both sides. */
function pathRibbon(K, line, w) {
  const { P, T } = line;
  const pos = [], uv = [], idx = [];
  const kerb = [];
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    if (i) s += P[i].distanceTo(P[i - 1]);
    const nx = -T[i].z, nz = T[i].x;
    for (const k of [-1, 1]) {
      const x = P[i].x + nx * k * w / 2, z = P[i].z + nz * k * w / 2;
      pos.push(x, ground(x, z) + 0.06, z);
      uv.push((k * w / 2) / 3, s / 3);
    }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); }
  const mesh = M(g, K.mat.pavers, false, true);
  // kerbs: short boxes along both edges
  for (let i = 0; i < P.length; i += 2) {
    const nx = -T[i].z, nz = T[i].x;
    for (const k of [-1, 1]) kerb.push([P[i].x + nx * k * (w / 2 + 0.05), P[i].z + nz * k * (w / 2 + 0.05), Math.atan2(T[i].x, T[i].z)]);
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.12, 1.05), K.mat.kerb, kerb.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  kerb.forEach(([x, z, a], i) => { q.setFromAxisAngle(V(0, 1, 0), a); m4.compose(V(x, ground(x, z) + 0.08, z), q, V(1, 1, 1)); im.setMatrixAt(i, m4); });
  im.castShadow = true; im.receiveShadow = true;
  const g2 = new THREE.Group();
  g2.add(mesh, im);
  return g2;
}

/** Coaster samples (steel_coaster.js railModel input) along control points [x, height, z]. */
function coasterSamples(ctrl) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, y, z]) => V(x, y, z)), false, 'centripetal');
  const n = Math.ceil(curve.getLength() / 0.25);
  const P = curve.getSpacedPoints(n);
  const s = { n: P.length, x: [], y: [], z: [], yaw: [], pitch: [], bankSin: [], bankCos: [] };
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    s.x.push(P[i].x); s.y.push(P[i].z); s.z.push(P[i].y);
    s.yaw.push(Math.atan2(dz, dx)); s.pitch.push(Math.atan2(dy, Math.hypot(dx, dz)));
    s.bankSin.push(0); s.bankCos.push(1);
  }
  return s;
}

function coaster(K) {
  const g = new THREE.Group();
  const railMat = new THREE.MeshPhysicalMaterial({ color: '#c8322a', roughness: 0.38, metalness: 0.3, clearcoat: 0.5 });
  const supMat = new THREE.MeshPhysicalMaterial({ color: '#d9d4c8', roughness: 0.5, metalness: 0.3, clearcoat: 0.3 });
  const Z = -60;
  const ctrl = [
    [-128, 1.4, Z + 5], [-108, 1.4, Z + 4], [-88, 1.4, Z + 2], [-74, 1.6, Z], [-63, 4, Z], [-49, 13.5, Z], [-38, 19.4, Z], [-33.5, 20.3, Z],
    [-29, 19.2, Z], [-24.5, 12, Z], [-20, 4.5, Z], [-15, 2.6, Z - 0.5], [-10, 3.4, Z - 1.5], [-5, 9.6, Z - 3], [-1.5, 11, Z - 4.5],
    [2, 9.4, Z - 6.5], [6, 4.6, Z - 10], [9, 3.2, Z - 16], [7, 3.8, Z - 23], [0, 4.6, Z - 27], [-9, 4.2, Z - 28], [-24, 4, Z - 26],
  ];
  const s = coasterSamples(ctrl);
  g.add(railModel(K, s, null, { rail: railMat }));
  // supports every 6 m where the rail is over 1.6 m up: footing, 1 m segments, the saddle turned with the track.
  // No supports at the far end of the turn back (past x = 3 after the second hill): that track runs low behind the
  // trees and does not show, so its short supports read as stray posts. The return run that shows keeps them.
  const hill2 = s.x.findIndex((x, i) => x > -5 && s.z[i] > 10);
  for (let i = 8; i < s.n - 4; i += 24) {
    if (i > hill2 && s.x[i] > 3) continue;
    const x = s.x[i], z = s.y[i], top = s.z[i];
    const gy = ground(x, z);
    if (top - gy < 1.6) continue;
    const at = (o, y) => { o.position.set(x, y, z); g.add(o); return o; };
    at(supportPiece(K, 'foot', 0, supMat), gy);
    const sTop = top - 1.2;
    for (let y = gy + 0.25; y + 0.2 < sTop; y += 1) {
      const seg = at(supportPiece(K, 'seg', 0, supMat), y);
      seg.scale.y = Math.min(1, (sTop - y) / SEG_H);
    }
    at(supportPiece(K, 'top', 0, supMat), sTop).rotation.y = -s.yaw[i];
  }
  // the station at the start (left of both framings: a cut-off box at the picture's edge read as floating), and a
  // three-car train on the lift near the crest
  const st = M(new THREE.BoxGeometry(14, 3.2, 5.5), std({ color: '#f1ede4', map: tx.siding.map, roughness: 0.7 }));
  st.position.set(-118, ground(-118, Z + 5) + 1.6, Z + 5); g.add(st);
  const roof = M(new THREE.BoxGeometry(15, 0.4, 6.6), std({ color: '#b5332c', roughness: 0.6 }));
  roof.position.set(-118, ground(-118, Z + 5) + 3.4, Z + 5); g.add(roof);
  const lift = s.x.findIndex((x) => x > -47);
  for (let c = 0; c < 3; c++) {
    const k = lift - c * 10;
    const car = sitCar(K, { seed: 1400 + c, color: '#f0b323', trim: '#2f6fb5', rows: 2, lead: c === 0 });
    const yaw = s.yaw[k], pitch = s.pitch[k];
    const tn = V(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)).normalize();
    const lat = V(0, 1, 0).cross(tn).normalize();
    const up = tn.clone().cross(lat).normalize();
    car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lat, up, tn));
    car.position.set(s.x[k], s.z[k], s.y[k]);
    g.add(car);
  }
  return g;
}

function parkScene(B) {
  const r = rng(4242);
  const K = kit();
  const park = new THREE.Group();
  park.userData.layer = 'park';
  // ground: the park from the tree belt at the back to the near bank
  park.add(groundSheet(-260, 260, -78, 110, 260, 94, ground, lawnMat(), 11));
  // the path: from the knoll down to the lake shore, past the carousel and the swing tower to the wheel, then away
  const main = pathLine([[-110, 26], [-78, 18], [-56, 8], [-38, 2], [-22, -2], [-6, 0], [8, -2], [20, 1], [32, 0], [46, -8], [62, -18], [90, -26], [130, -30]]);
  park.add(pathRibbon(K, main, 3.4));
  const spur = pathLine([[-6, 0], [-4, -10], [0, -18]]);
  park.add(pathRibbon(K, spur, 2.6));
  const spur2 = pathLine([[-38, 2], [-39, -3], [-40, -5]]);
  park.add(pathRibbon(K, spur2, 2.6));

  // the rides
  const wheel = buildWheel();
  const ferris = wheel.root.children[0];
  for (const c of ferris.children) c.userData.layer = c.isGroup ? 'wheel' : 'park';
  const wheelHolder = new THREE.Group();
  wheelHolder.add(wheel.root);
  const WX = 26, WZ = -8;
  wheelHolder.position.set(WX, ground(WX, WZ), WZ);
  wheelHolder.rotation.y = -Math.PI / 2 + 0.42;
  wheelHolder.scale.setScalar(1.35); // the title's wheel: a larger build of the batch 1 wheel (the game's fits 3 x 3 tiles)
  park.add(wheelHolder);

  const swing = buildSwing();
  swing.pose(0.35, 4, true);
  swing.root.position.set(2, ground(2, -26), -26);
  park.add(swing.root);

  K.carousel({ cx: -40, cz: -12, y: ground(-40, -12) });

  const coasterG = coaster(K);
  park.add(coasterG);

  stall(K, { x: -20, z: -9, y: ground(-20, -9) + 0.05, rot: 0.25, name: 'SNACKS' });
  stall(K, { x: 12, z: -10, y: ground(12, -10) + 0.05, rot: -0.2, name: 'ICES', awning: ['#2f6fb5', '#f4efe2'] });

  // trees: a belt along the back hides the edge of the park ground; groups between and round the rides
  for (let x = -250; x <= 250; x += 7 + r() * 5) {
    const z = -70 - r() * 6;
    if (r() < 0.35) K.pine(x, z, 13 + r() * 6, (x * 7) | 0, { y: ground(x, z) });
    else K.tree(x, z, 10 + r() * 4, (x * 13) | 0, 3.6 + r() * 1.2, ground(x, z));
  }
  for (let x = -230; x <= 230; x += 10 + r() * 8) {
    const z = -60 - r() * 5;
    if (Math.abs(x + 10) < 50 && r() < 0.5) continue;
    K.tree(x, z, 8 + r() * 3, (x * 17 + 5) | 0, 3 + r(), ground(x, z));
  }
  const treeAt = [[-62, -30, 9], [-56, -4, 8], [-26, -34, 8.5], [-18, -24, 7], [16, -32, 9], [20, -22, 7.5], [40, -26, 9.5], [46, -12, 8],
    [56, -32, 10], [64, -8, 8.5], [76, -20, 9], [-72, 4, 7.5], [-48, 13, 6.5], [62, 12, 7], [74, 2, 8], [88, -6, 9], [-92, -12, 9],
    [-86, 12, 7], [100, 10, 8], [-60, -44, 10], [32, -44, 9], [-12, -42, 8]];
  treeAt.forEach(([x, z, h], i) => K.tree(x, z, h, 300 + i * 7, h * 0.36, ground(x, z)));
  for (const [x, z] of [[-50, -38], [24, -46], [36, -38], [-22, -50], [70, -40], [-78, -30], [86, -36]]) K.pine(x, z, 11 + r() * 4, (x * 3 + z) | 0, { y: ground(x, z) });

  // along the path: lamps, benches with sitters, flower beds; guests walking and standing
  const { P, T } = main;
  for (let i = 30; i < P.length - 20; i += 26) {
    const nx = -T[i].z, nz = T[i].x;
    const side = (i / 26) % 2 ? 1 : -1;
    const x = P[i].x + nx * side * 2.2, z = P[i].z + nz * side * 2.2;
    if (Math.abs(x - WX) < 9 && Math.abs(z - WZ) < 9) continue;
    K.lamp(x, z, ground(x, z));
  }
  for (const i of [60, 150, 230]) {
    if (!P[i]) continue;
    const nx = -T[i].z, nz = T[i].x;
    const x = P[i].x - nx * 2.6, z = P[i].z - nz * 2.6;
    K.benchWith(x, z, Math.atan2(nx, nz), [500 + i, 501 + i], ground(x, z) + 0.05);
  }
  for (let i = 10; i < P.length - 10; i += 9) {
    const nx = -T[i].z, nz = T[i].x;
    for (const k of [-1, 1]) {
      if (r() < 0.45) continue;
      const d = 2.4 + r() * 1.8, x = P[i].x + nx * k * d, z = P[i].z + nz * k * d;
      if (lakeD(x, z) < 1.05) continue;
      K.shrub(x, z, 0.55 + r() * 0.45, 700 + i * 2 + k, ground(x, z), r() < 0.5 ? ['#e2546a', '#f2c14e', '#f4f1ea', '#c56bd6'][(r() * 4) | 0] : null);
    }
  }
  let gi = 0;
  for (let i = 12; i < P.length - 12; i += 3 + ((r() * 7) | 0)) {
    const nx = -T[i].z, nz = T[i].x;
    const off = (r() - 0.5) * 2.6;
    const x = P[i].x + nx * off, z = P[i].z + nz * off;
    const back = r() < 0.5;
    const walk = r() < 0.8;
    const dir = Math.atan2(T[i].x, T[i].z) + (back ? Math.PI : 0) + (walk ? (r() - 0.5) * 0.3 : (r() - 0.5) * 2.4);
    K.guest(900 + gi++, x, z, dir, walk ? { kind: 'walk', phase: r() * 6.28 } : { kind: 'stand', item: r() < 0.3 ? ['cone', 'cup', 'floss'][(r() * 3) | 0] : undefined }, {}, ground(x, z) + 0.06);
  }
  // a queue of guests at the wheel's steps and a few by the swing tower
  for (let k = 0; k < 5; k++) K.guest(980 + k, WX - 4 - k * 0.8, WZ + 6 + k * 0.5, Math.PI + 0.5, { kind: 'stand' }, {}, ground(WX - 4, WZ + 6) + 0.06);
  for (let k = 0; k < 4; k++) K.guest(990 + k, -2 + k * 0.9, -19.5 + (k % 2) * 0.6, Math.PI, { kind: 'stand' }, {}, ground(0, -19) + 0.06);
  park.add(K.root);
  B.log(`title: park with ${K.guests.length} guests`);
  return { park, wheel, wheelHolder, rides: [wheelHolder, swing.root, coasterG] };
}

// ------------------------------------------------------------------ the front: lake and foreground
const WATER_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const WATER_FS = `
uniform sampler2D tRefl, tNorm; uniform vec2 res; uniform vec3 deep, sunDir, sunCol;
varying vec3 vW;
void main(){
  vec3 n1 = texture2D(tNorm, vW.xz * 0.06).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tNorm, vW.xz * vec2(0.21, 0.5) + 0.37).xyz * 2.0 - 1.0;
  vec2 nn = (n1.xy * 0.6 + n2.xy * 0.4);
  vec3 N = normalize(vec3(nn.x * 0.12, 1.0, nn.y * 0.12));
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW);
  vec2 uv = gl_FragCoord.xy / res + vec2(nn.x * 0.006, nn.y * 0.02) * (40.0 / dist);
  vec3 refl = texture2D(tRefl, clamp(uv, 0.001, 0.999)).rgb;
  float f = 0.02 + 0.98 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
  f = mix(0.62, 0.97, f);
  vec3 c = mix(deep, refl * 0.92, f);
  vec3 H = normalize(V + sunDir);
  c += sunCol * pow(max(dot(N, H), 0.0), 300.0) * 4.0;
  gl_FragColor = vec4(c, 1.0);
}`;

function frontScene() {
  const r = rng(77);
  const K = kit();
  const front = new THREE.Group();
  front.userData.layer = 'front';
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, LAKE.rx * 1.12, LAKE.rz * 1.25, 0, Math.PI * 2, false, 0);
  const wg = new THREE.ShapeGeometry(shape, 96);
  wg.rotateX(-Math.PI / 2);
  const nrm = tx.water.normal.clone();
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.needsUpdate = true;
  const water = new THREE.Mesh(wg, new THREE.ShaderMaterial({
    vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: false,
    uniforms: { tRefl: { value: null }, tNorm: { value: nrm }, res: { value: new THREE.Vector2(1, 1) }, deep: { value: new THREE.Color('#1c3a3c') }, sunDir: { value: SUN.clone() }, sunCol: { value: new THREE.Color(SUN_COL) } },
  }));
  water.position.set(LAKE.x, WATER_Y, LAKE.z);
  water.userData.layer = 'water';
  front.add(water);
  // reeds and lilies along the near shore
  const reedGeo = new THREE.ConeGeometry(0.035, 1, 4);
  reedGeo.translate(0, 0.5, 0);
  const reeds = new THREE.InstancedMesh(reedGeo, std({ color: '#6f7f3a', roughness: 0.9 }), 900);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  let n = 0;
  for (let i = 0; n < 900 && i < 5000; i++) {
    const a = Math.PI * (0.05 + r() * 0.9); // the near half of the shore
    const d = 0.96 + r() * 0.12;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * d, z = LAKE.z + Math.sin(a) * LAKE.rz * d;
    if (r() < 0.55 && Math.abs(Math.cos(a)) < 0.6) continue; // clumps, not a hedge
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4));
    m4.compose(V(x, Math.max(WATER_Y, ground(x, z)) - 0.1, z), q, V(1, 0.8 + r() * 1.1, 1));
    reeds.setMatrixAt(n++, m4);
  }
  reeds.count = n;
  reeds.castShadow = true;
  front.add(reeds);
  const padMat = std({ color: '#4f7a3a', roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 0.4 + r() * 0.5;
    const pad = M(new THREE.CircleGeometry(0.45 + r() * 0.35, 12, 0.3, Math.PI * 2 - 0.4), padMat, false, true);
    pad.rotation.x = -Math.PI / 2; pad.rotation.z = r() * 6;
    pad.position.set(LAKE.x + Math.cos(a) * LAKE.rx * d * 0.8 - 14, WATER_Y + 0.02, LAKE.z + Math.sin(a) * LAKE.rz * d * 0.5 + 3);
    front.add(pad);
  }
  // foreground trees at both sides of each framing, their trunks below the picture
  for (const [x, z, h, s] of [[-26, 38, 11, 1], [31, 40, 12, 2]]) K.tree(x, z, h, 1200 + s, h * 0.36, ground(x, z));
  // flowering shrubs along the near bank
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * (0.12 + 0.76 * (i / 40) + (r() - 0.5) * 0.02), d = 1.1 + r() * 0.1;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * d, z = LAKE.z + Math.sin(a) * LAKE.rz * d;
    if (r() < 0.4) continue;
    K.shrub(x, z, 0.7 + r() * 0.6, 1300 + i, ground(x, z), r() < 0.6 ? ['#e2546a', '#f2c14e', '#f4f1ea', '#c56bd6'][(r() * 4) | 0] : null);
  }
  front.add(K.root);
  return { front, water, waterMat: water.material };
}

// ------------------------------------------------------------------ layers: modes per pass
function layerMeshes(scene) {
  const out = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let p = o, layer = null;
    while (p && !layer) { layer = p.userData.layer ?? null; p = p.parent; }
    if (!layer) return;
    if (!out.has(layer)) out.set(layer, []);
    out.get(layer).push({ mesh: o, mat: o.material, visible: o.visible, cast: o.castShadow });
  });
  return out;
}
const variants = new Map();
function variant(m, mode) {
  if (mode === 'normal' || mode === 'hidden') return m;
  if (Array.isArray(m)) return m.map((x) => variant(x, mode));
  const key = m.uuid + mode;
  let v = variants.get(key);
  if (!v) {
    v = m.clone();
    v.colorWrite = false;
    v.depthWrite = mode === 'hold';
    variants.set(key, v);
  }
  return v;
}
/** modes: { layer: 'normal' | 'ghost' (casts shadows only) | 'hold' (depth only, casts) | 'hidden' } */
function applyModes(meshes, modes) {
  for (const [layer, list] of meshes) {
    const mode = modes[layer] ?? 'hidden';
    for (const e of list) {
      e.mesh.visible = mode !== 'hidden' && e.visible;
      e.mesh.material = variant(e.mat, mode);
    }
  }
}

// ------------------------------------------------------------------ projection helpers
/** Screen rect (layer px) of every vertex of `obj` seen by `camera` in a w x h picture. */
function screenBox(obj, camera, w, h, box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) {
  obj.updateMatrixWorld(true);
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const p = o.geometry.attributes.position;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m).project(camera);
        const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
        if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      }
    }
  });
  return box;
}

// ------------------------------------------------------------------ the sign
const SIGN_FONT = 'FredokaTitle';
/** Painted plank texture: horizontal boards, a little worn, grain and grooves. */
function plankTexture(W, H, boards, base) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(31);
  const bh = H / boards;
  const col = new THREE.Color(base);
  for (let b = 0; b < boards; b++) {
    const k = 0.92 + r() * 0.14;
    g.fillStyle = `rgb(${Math.round(col.r * 255 * k)},${Math.round(col.g * 255 * k)},${Math.round(col.b * 255 * k)})`;
    g.fillRect(0, b * bh, W, bh);
    for (let i = 0; i < 70; i++) { // grain
      const y = b * bh + r() * bh, x = r() * W, len = 60 + r() * 400;
      g.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.05})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len, y + (r() - 0.5) * 4); g.stroke();
    }
    for (let i = 0; i < 18; i++) { // worn paint: lighter wood showing through
      g.fillStyle = `rgba(196,160,112,${0.08 + r() * 0.12})`;
      const x = r() * W, y = b * bh + (r() < 0.5 ? r() * 6 : bh - r() * 6);
      g.beginPath(); g.ellipse(x, y, 6 + r() * 30, 1.5 + r() * 3, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, b * bh - 2, W, 4); // groove
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, b * bh + 2, W, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function roundRect(w, h, rad) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + rad, -h / 2);
  s.lineTo(w / 2 - rad, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rad);
  s.lineTo(w / 2, h / 2 - rad); s.quadraticCurveTo(w / 2, h / 2, w / 2 - rad, h / 2);
  s.lineTo(-w / 2 + rad, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rad);
  s.lineTo(-w / 2, -h / 2 + rad); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rad, -h / 2);
  return s;
}

/**
 * The name sign: lines [{ text, size (m), colour }] centred on a painted plank board with a cream trim and a ring of
 * bulbs. Letters are lit (emissive faces) with a short dark return behind them; the board is lit by a warm key light.
 */
function signScene(B, lines, board) {
  const scene = new THREE.Scene();
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial()));
  scene.environment = B.pmrem(env);
  const key = new THREE.DirectionalLight('#ffe2b8', 3.4); key.position.set(-3, 4, 6); scene.add(key);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.004; key.shadow.radius = 3;
  const kc = key.shadow.camera; kc.left = -board.w / 2 - 0.6; kc.right = board.w / 2 + 0.6; kc.top = board.h / 2 + 0.6; kc.bottom = -board.h / 2 - 0.6; kc.near = 1; kc.far = 20;
  const fill = new THREE.DirectionalLight('#a8c4ff', 0.6); fill.position.set(4, -1, 5); scene.add(fill);
  scene.add(new THREE.HemisphereLight('#ffe3c0', '#40302a', 0.6));
  const g = new THREE.Group();
  scene.add(g);
  const { w: BW, h: BH } = board;
  // board: painted planks; a cream trim proud of it; a dark outer edge
  const outer = M(new THREE.ExtrudeGeometry(roundRect(BW + 0.16, BH + 0.16, 0.2), { depth: 0.1, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 12 }), std({ color: '#3a2618', roughness: 0.7, map: tx.wood.map }));
  outer.position.z = -0.14; g.add(outer);
  const trimShape = roundRect(BW, BH, 0.16);
  trimShape.holes.push(roundRect(BW - 0.18, BH - 0.18, 0.1));
  const trim = M(new THREE.ExtrudeGeometry(trimShape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 12 }), std({ color: '#efe3c4', roughness: 0.55, map: tx.paint.map }));
  trim.position.z = -0.02; g.add(trim);
  const pt = plankTexture(2048, Math.round(2048 * (BH / BW)), Math.max(3, Math.round(BH / 0.32)), '#3f8794');
  pt.repeat.set(1 / (BW - 0.18), 1 / (BH - 0.18)); pt.offset.set(0.5, 0.5);
  const face = M(new THREE.ExtrudeGeometry(roundRect(BW - 0.18, BH - 0.18, 0.1), { depth: 0.04, bevelEnabled: false, curveSegments: 12 }), std({ map: pt, roughness: 0.62, metalness: 0 }));
  face.position.z = -0.03; g.add(face);
  // bulbs round the board, between trim and face
  const iw = BW - 0.36, ih = BH - 0.36; // on the planks, just inside the trim
  const nb = 4 * Math.round((2 * (iw + ih)) / 0.3 / 4);
  const bulbMat = std({ color: '#fff1d0', emissive: '#ffc560', emissiveIntensity: 3.2, roughness: 0.25 });
  const sockMat = std({ color: '#c8a050', metalness: 1, roughness: 0.35 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 14, 10), bulbMat, nb);
  const socks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10).rotateX(Math.PI / 2), sockMat, nb);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nb; i++) {
    let d = (i / nb) * (2 * (iw + ih));
    let x, y;
    if (d < iw) { x = -iw / 2 + d; y = ih / 2; } else if ((d -= iw) < ih) { x = iw / 2; y = ih / 2 - d; } else if ((d -= ih) < iw) { x = iw / 2 - d; y = -ih / 2; } else { d -= iw; x = -iw / 2; y = -ih / 2 + d; }
    m4.makeTranslation(x, y, 0.06); bulbs.setMatrixAt(i, m4);
    m4.makeTranslation(x, y, 0.025); socks.setMatrixAt(i, m4);
  }
  g.add(bulbs, socks);
  // letters: per line, one canvas per coloured run (white text), each a lit face with a stack of dark returns behind
  const PX = 512;
  const font = `700 ${PX}px ${SIGN_FONT}`;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  const total = lines.reduce((a, l) => a + l.size * l.lead, 0);
  let y = total / 2;
  for (const l of lines) {
    y -= (l.size * l.lead) / 2;
    const runs = l.runs ?? [{ text: l.text, colour: l.colour }];
    const k = l.size / PX; // metres per canvas px
    const widths = runs.map((r) => meas.measureText(r.text).width);
    let x = -widths.reduce((a, b) => a + b, 0) * k / 2;
    runs.forEach((run, i) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(widths[i]) + 96; c.height = Math.round(PX * 1.3);
      const g3 = c.getContext('2d');
      g3.font = font; g3.textAlign = 'center'; g3.textBaseline = 'middle'; g3.fillStyle = '#fff';
      g3.fillText(run.text, c.width / 2, c.height * 0.53);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(c.width * k, c.height * k);
      const cx = x + (widths[i] * k) / 2;
      const ret = std({ color: '#2a1d14', roughness: 0.6, map: tex, alphaTest: 0.5 });
      for (let j = 0; j < 18; j++) {
        const m = new THREE.Mesh(geo, ret);
        m.position.set(cx, y, 0.02 + j * 0.01);
        m.castShadow = true;
        g.add(m);
      }
      const lit = std({ color: run.colour, emissive: run.colour, emissiveIntensity: 0.6, roughness: 0.3, map: tex, alphaTest: 0.5 });
      const fm = new THREE.Mesh(geo, lit);
      fm.castShadow = true;
      fm.position.set(cx, y, 0.205);
      g.add(fm);
      x += widths[i] * k;
    });
    y -= (l.size * l.lead) / 2;
  }
  g.rotation.set(0.12, -0.1, 0);
  g.traverse((o) => { if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = 0.35; });
  return { scene, group: g };
}

/** Render a sign at 2x and scale it down (crisp letters); adds a soft glow round the lit letters and bulbs. */
function bakeSign(B, lines, board, wPx) {
  const { scene, group } = signScene(B, lines, board);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(V(0, 0, 0)), mid = box.getCenter(V(0, 0, 0));
  const pad = 0.12;
  const aw = size.x + 2 * pad, ah = size.y + 2 * pad;
  const hPx = Math.round(wPx * (ah / aw));
  const cam = new THREE.OrthographicCamera(-aw / 2, aw / 2, ah / 2, -ah / 2, 0.1, 50);
  cam.position.set(mid.x, mid.y, 10); cam.lookAt(mid.x, mid.y, 0);
  const big = B.renderView(scene, cam, wPx * 2, hPx * 2, { ...GRADE, exposure: 1.0, saturation: 1.05 });
  const c = document.createElement('canvas'); c.width = wPx; c.height = hPx;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(big, 0, 0, wPx, hPx);
  // glow: the bright pixels, blurred, added back inside the board
  const src = g.getImageData(0, 0, wPx, hPx);
  const hi = new ImageData(wPx, hPx);
  for (let i = 0; i < src.data.length; i += 4) {
    const l = Math.max(src.data[i], src.data[i + 1], src.data[i + 2]);
    const k = Math.max(0, (l - 185) / 70);
    hi.data[i] = src.data[i]; hi.data[i + 1] = src.data[i + 1]; hi.data[i + 2] = src.data[i + 2]; hi.data[i + 3] = Math.round(255 * Math.min(1, k) * (src.data[i + 3] / 255));
  }
  const hc = document.createElement('canvas'); hc.width = wPx; hc.height = hPx;
  hc.getContext('2d').putImageData(hi, 0, 0);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.55;
  g.filter = `blur(${(wPx / 260).toFixed(1)}px)`;
  g.drawImage(hc, 0, 0);
  g.globalAlpha = 0.35;
  g.filter = `blur(${(wPx / 90).toFixed(1)}px)`;
  g.drawImage(hc, 0, 0);
  g.restore();
  return c;
}

// ------------------------------------------------------------------ the bake
export default {
  async bake(B) {
    // development aid: input { quick: true } bakes half-size layers, one wheel frame, and a picture of the reflection
    const quick = !!(B.input && B.input.quick);
    const only = (B.input && B.input.only) || null; // development aid: ['wide'], ['sign'], ...
    const t0 = performance.now();
    const tick = (what) => { if (quick) B.log(`title: ${what} at ${((performance.now() - t0) / 1000).toFixed(1)} s`); };
    await B.font(SIGN_FONT, 'fonts/fredoka.woff2');
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMaterial()));
    scene.environment = B.pmrem(envScene);
    const sun = new THREE.DirectionalLight(SUN_COL, 3.1);
    sun.position.copy(SUN).multiplyScalar(420);
    sun.target.position.set(0, 0, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    const sc = sun.shadow.camera;
    sc.left = -150; sc.right = 150; sc.top = 110; sc.bottom = -110; sc.near = 200; sc.far = 700;
    sc.updateProjectionMatrix();
    scene.add(sun, sun.target, new THREE.HemisphereLight('#a9bfe6', '#86704c', 0.55));

    const sky = new THREE.Group();
    sky.userData.layer = 'sky';
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 96, 48), skyMaterial());
    dome.position.y = WATER_Y;
    sky.add(dome, farLand());
    scene.add(sky);
    const P = parkScene(B);
    scene.add(P.park);
    // the mirror world for the lake's reflection: the sky and the park turned over the water plane
    // (without the wheel's turning part: titleMirror.js)
    const mirror = mirrorWorld(THREE, [sky, P.park], WATER_Y);
    scene.add(mirror);
    const F = frontScene();
    scene.add(F.front);
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) if ('envMapIntensity' in m) m.envMapIntensity = 0.55;
    });
    const meshes = layerMeshes(scene);
    const waterPlane = new THREE.Plane(V(0, -1, 0), WATER_Y + 0.02);
    const meta = {};
    const wheelParts = P.wheel.root.children[0].children.filter((c) => c.isGroup);

    tick('scene built');
    for (const [name, f0] of Object.entries(FRAMINGS)) {
      if (only && !only.includes(name)) continue;
      const f = quick ? { ...f0, w: f0.w / 2, h: f0.h / 2 } : f0;
      const cam = new THREE.PerspectiveCamera(f.fov, f.w / f.h, 1, 9000);
      cam.position.set(...f.pos);
      cam.lookAt(...f.at);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      P.wheel.pose(0, true);
      // sky
      applyModes(meshes, { sky: 'normal' });
      const skyC = B.renderView(scene, cam, f.w, f.h, GRADE);
      tick('sky');
      // the reflection, then the park, the front
      applyModes(meshes, { mirror: 'normal', park: 'ghost', wheel: 'ghost', front: 'ghost' });
      B.clipPlanes([waterPlane]);
      const refl = B.renderTexture(scene, cam, f.w, f.h);
      tick('reflection');
      if (quick) B.emit(`${name}-debug-refl.png`, B.renderView(scene, cam, f.w, f.h, GRADE));
      B.clipPlanes(null);
      applyModes(meshes, { park: 'normal', wheel: 'ghost', front: 'ghost' });
      const parkC = B.renderView(scene, cam, f.w, f.h, GRADE);
      tick('park');
      const wu = F.waterMat.uniforms; // the water's own material (a pass may have swapped the mesh's)
      wu.tRefl.value = refl; wu.res.value.set(f.w * B.viewSS, f.h * B.viewSS);
      applyModes(meshes, { park: 'hold', wheel: 'hold', front: 'normal', water: 'normal' });
      const frontC = B.renderView(scene, cam, f.w, f.h, GRADE);
      tick('front');
      // the wheel's turning part: its box over all 8 poses, then one frame per pose over the park held out
      let wb;
      for (let k = 0; k < 8; k++) { P.wheel.pose((k / 32) * Math.PI * 2, true); for (const g of wheelParts) wb = screenBox(g, cam, f.w, f.h, wb); }
      const m = 4;
      const wx = Math.max(0, Math.floor(wb.x0) - m), wy = Math.max(0, Math.floor(wb.y0) - m);
      const fw = Math.min(f.w, Math.ceil(wb.x1) + m) - wx, fh = Math.min(f.h, Math.ceil(wb.y1) + m) - wy;
      const strip = document.createElement('canvas'); strip.width = fw * 8; strip.height = fh;
      const sg = strip.getContext('2d');
      applyModes(meshes, { park: 'hold', wheel: 'normal', front: 'ghost' });
      for (let k = 0; k < (quick ? 1 : 8); k++) {
        P.wheel.pose((k / 32) * Math.PI * 2, true);
        cam.setViewOffset(f.w, f.h, wx, wy, fw, fh);
        sg.drawImage(B.renderView(scene, cam, fw, fh, GRADE), k * fw, 0);
        cam.clearViewOffset();
      }
      P.wheel.pose(0, true);
      // index numbers: the highest ride pixel, the wheel ride's leftmost pixel (all 8 poses)
      let top = wb.y0;
      for (const r of P.rides) top = Math.min(top, screenBox(r, cam, f.w, f.h).y0);
      let left = wb.x0;
      left = Math.min(left, screenBox(P.wheelHolder, cam, f.w, f.h).x0);
      B.emit(`${name}-sky.webp`, skyC, 0.8);
      B.emit(`${name}-park.webp`, parkC, 0.8);
      B.emit(`${name}-front.webp`, frontC, 0.8);
      B.emit(`${name}-wheel.webp`, strip, 0.84);
      meta[name] = {
        w: f.w, h: f.h,
        layers: { sky: `${name}-sky.webp`, park: `${name}-park.webp`, front: `${name}-front.webp` },
        wheel: { file: `${name}-wheel.webp`, frames: 8, fw, fh, x: wx, y: wy },
        nameRow: Math.max(1, Math.floor(top)),
        menuAnchorX: Math.max(0, Math.floor(left)),
      };
      B.log(`title ${name}: wheel ${fw}x${fh} at ${wx},${wy}; nameRow ${meta[name].nameRow}, menuAnchorX ${meta[name].menuAnchorX}`);
    }

    if (only && !only.includes('sign')) { B.meta(meta); return; }
    // the name signs
    const WARM = '#ffc23d', COOL = '#4fd4ff', AMP = '#ff6f4f';
    // "Thrills" warm, "&" coral, "Chills" cool
    const line = bakeSign(B, [{ size: 0.82, lead: 1, runs: [{ text: 'Thrills ', colour: WARM }, { text: '&', colour: AMP }, { text: ' Chills', colour: COOL }] }], { w: 6.2, h: 1.32 }, 1100);
    B.emit('sign-line.webp', line, 0.9);
    const stack = bakeSign(B, [
      { text: 'Thrills', size: 0.82, lead: 0.98, colour: WARM },
      { text: '&', size: 0.5, lead: 0.62, colour: AMP },
      { text: 'Chills', size: 0.82, lead: 0.98, colour: COOL },
    ], { w: 3.5, h: 3.15 }, 600);
    B.emit('sign-stack.webp', stack, 0.9);
    meta.sign = { line: { file: 'sign-line.webp', w: line.width, h: line.height }, stack: { file: 'sign-stack.webp', w: stack.width, h: stack.height } };
    B.meta(meta);
  },
};
