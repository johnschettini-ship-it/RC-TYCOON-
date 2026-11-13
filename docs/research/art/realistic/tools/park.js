// The park scene in real-world metres. 1 tile = 3 m; the island is 14 x 14 tiles (42 m), centred on the origin.
// World axes: x east, z south, y up. The default camera looks from +x +z (south-east), so the back of the
// island (-x -z) is the top of the screen.
import * as THREE from 'three';
import * as T from './textures.js';
import { person, randomLook } from './people.js';
import { makeKit } from './kit.js';

export const TILE = 3;
export const HALF = 21;

function rep(t, sx, sy = sx) { const c = t.clone(); c.repeat.set(sx, sy); c.needsUpdate = true; return c; }
function std(o) { return new THREE.MeshStandardMaterial(o); }
function M(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
function planarUV(geo, scale) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); uv[i * 2] = v.x / scale; uv[i * 2 + 1] = -v.z / scale; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
const _up = new THREE.Vector3(0, 1, 0);
function rod(a, b, r, mat, seg = 10) {
  const len = a.distanceTo(b);
  const m = M(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, b.clone().sub(a).normalize());
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let BOARDS;

export function buildPark(variant) {
  const night = variant.night;
  // Round 7: materials, furniture, trees, carousel and horses come from the shared kit (kit.js)
  const K = makeKit(variant);
  const { root, lights, lightMats, mat, ringBulb, led, windowGlow, addLight } = K;
  BOARDS = BOARDS || {
    menu: T.board(['SNACKS', ['Pretzel', '3.50'], ['Hot corn cob', '3.00'], ['Lemonade', '2.50'], ['Ice tea', '2.50'], ['Soft serve', '3.00']], { w: 512, h: 300 }),
    sign: T.board(['FRESH SNACKS'], { w: 512, h: 96, bg: '#1f6f5c', title: 52, frame: '#f4efe2', accent: '#ffffff' }),
    coasterSign: T.board(['COMET RUN'], { w: 512, h: 96, bg: '#1d2b44', title: 54, frame: '#e9e4d6', accent: '#f5c542' }),
  };
  mat.menu = std({ map: BOARDS.menu.map, roughness: 0.5 });
  mat.sign = std({ map: BOARDS.sign.map, roughness: 0.5 });
  mat.coasterSign = std({ map: BOARDS.coasterSign.map, roughness: 0.5 });

  // ---------------------------------------------------------------- island: lawn + soil sides
  {
    const g = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, 84, 84);
    g.rotateX(-Math.PI / 2);
    const col = new Float32Array(g.attributes.position.count * 3);
    const r = T.rng(5);
    const pts = Array.from({ length: 40 }, () => [r() * 42 - 21, r() * 42 - 21, 2 + r() * 5, r() - 0.5]);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i);
      let k = 1;
      for (const [px, pz, rad, s] of pts) { const d = Math.hypot(x - px, z - pz); if (d < rad) k += s * 0.22 * (1 - d / rad) ** 2; }
      col[i * 3] = k * 1.02; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.96;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lawn = M(g, mat.lawn, false, true);
    root.add(lawn);
    const depth = 1.6;
    const side = M(new THREE.BoxGeometry(2 * HALF, depth, 2 * HALF), [mat.soil, mat.soil, mat.soil, mat.soil, mat.soil, mat.soil], false, true);
    side.position.y = -depth / 2 - 0.01;
    side.material.forEach?.(() => {});
    const sg = side.geometry, uv = sg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 10, uv.getY(i) * 0.4);
    root.add(side);
  }

  // ---------------------------------------------------------------- paving on a 1.5 m grid, kerbs where paving meets lawn
  const CELL = 1.5, N = (2 * HALF) / CELL; // 28 cells
  const kind = Array.from({ length: N }, () => new Array(N).fill(null));
  const cellOf = (v) => Math.round((v + HALF) / CELL);
  const pave = (x0, x1, z0, z1, k) => {
    for (let i = cellOf(x0); i < cellOf(x1); i++) for (let j = cellOf(z0); j < cellOf(z1); j++) if (i >= 0 && j >= 0 && i < N && j < N) kind[i][j] = k;
  };
  pave(-21, 21, -1.5, 1.5, 'pavers');        // east-west avenue
  pave(-1.5, 1.5, 1.5, 21, 'pavers');        // south path
  pave(-4.5, 4.5, -1.5, 4.5, 'slabs');       // plaza at the junction
  pave(-7.5, -1.5, 4.5, 10.5, 'slabs');      // kiosk terrace
  pave(9, 12, -4.5, -1.5, 'slabs');          // carousel entry
  pave(-16.5, -3, -4.5, -1.5, 'asphalt');    // coaster queue pad
  pave(1.5, 4.5, 7.5, 10.5, 'slabs');        // pond overlook
  const PAVE_Y = 0.05;
  for (const k of ['pavers', 'slabs', 'asphalt']) {
    const pos = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (kind[i][j] === k) {
      const x0 = -HALF + i * CELL, z0 = -HALF + j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
      pos.push(x0, PAVE_Y, z0, x0, PAVE_Y, z1, x1, PAVE_Y, z1, x0, PAVE_Y, z0, x1, PAVE_Y, z1, x1, PAVE_Y, z0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    planarUV(g, k === 'asphalt' ? 4 : 3);
    root.add(M(g, mat[k], false, true));
  }
  {
    // kerbs: instanced boxes along every paved/lawn cell edge (0.15 m granite strip, 0.11 m high)
    const kerbs = [];
    const paved = (i, j) => i >= 0 && j >= 0 && i < N && j < N && kind[i][j];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (!paved(i, j)) continue;
      const x0 = -HALF + i * CELL, z0 = -HALF + j * CELL;
      if (!paved(i - 1, j) && i > 0) kerbs.push([x0 + 0.075, z0 + CELL / 2, 0.15, CELL]);
      if (!paved(i + 1, j) && i < N - 1) kerbs.push([x0 + CELL - 0.075, z0 + CELL / 2, 0.15, CELL]);
      if (!paved(i, j - 1) && j > 0) kerbs.push([x0 + CELL / 2, z0 + 0.075, CELL, 0.15]);
      if (!paved(i, j + 1) && j < N - 1) kerbs.push([x0 + CELL / 2, z0 + CELL - 0.075, CELL, 0.15]);
      // island edge: a kerb too
      if (i === 0) kerbs.push([x0 + 0.075, z0 + CELL / 2, 0.15, CELL]);
      if (i === N - 1) kerbs.push([x0 + CELL - 0.075, z0 + CELL / 2, 0.15, CELL]);
      if (j === 0) kerbs.push([x0 + CELL / 2, z0 + 0.075, CELL, 0.15]);
      if (j === N - 1) kerbs.push([x0 + CELL / 2, z0 + CELL - 0.075, CELL, 0.15]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.13, 1), mat.kerb, kerbs.length);
    const m4 = new THREE.Matrix4();
    kerbs.forEach(([x, z, sx, sz], n) => { m4.makeScale(sx, 1, sz).setPosition(x, 0.065, z); im.setMatrixAt(n, m4); });
    im.castShadow = true; im.receiveShadow = true;
    root.add(im);
  }

  // ---------------------------------------------------------------- street furniture
  const lampAt = (x, z) => K.lamp(x, z);
  const benchAt = (x, z, rot) => K.bench(x, z, rot, PAVE_Y);
  const binAt = (x, z) => K.bin(x, z, PAVE_Y);

  // avenue lamps both sides, benches and bins facing the path
  for (const x of [-18, -10.5, 6, 13.5, 19.5]) lampAt(x, -1.9);
  for (const x of [-15, -7.5, 9, 16.5]) lampAt(x, 1.9);
  lampAt(1.9, 13.5); lampAt(-1.9, 18); lampAt(4.2, 4.2); lampAt(-4.2, 4.2);
  benchAt(-12, 2.15, Math.PI); binAt(-10.6, 2.0);
  benchAt(13, 2.15, Math.PI); binAt(11.6, 2.0);
  benchAt(2.15, 15.5, -Math.PI / 2);
  benchAt(3.0, 4.15, Math.PI); benchAt(-3.0, 4.15, Math.PI);
  binAt(4.2, 9.9); binAt(-2.0, 10.0);

  // ---------------------------------------------------------------- pond with fountain (front quadrant)
  {
    const cx = 10.5, cz = 10.5;
    const shape = new THREE.Shape();
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rr = 5.2 + Math.sin(a * 2 + 0.6) * 0.8 + Math.sin(a * 3 + 1.7) * 0.4;
      pts.push(new THREE.Vector2(Math.cos(a) * rr * 1.1, Math.sin(a) * rr * 0.92));
    }
    shape.setFromPoints(pts);
    const water = M(new THREE.ShapeGeometry(shape, 1), mat.water, false, true);
    water.rotation.x = -Math.PI / 2; water.position.set(cx, 0.07, cz);
    planarUV(water.geometry, 4);
    root.add(water);
    // dark pond floor visible at the edge + stone coping ring (extruded outline)
    const ring = new THREE.Shape(); const outer = pts.map((p) => p.clone().multiplyScalar(1 + 0.5 / p.length()));
    ring.setFromPoints(outer); ring.holes.push(new THREE.Path(pts.slice().reverse()));
    const cg = new THREE.ExtrudeGeometry(ring, { depth: 0.32, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, steps: 1, curveSegments: 4 });
    const cop = M(cg, mat.stone); cop.rotation.x = -Math.PI / 2; cop.position.set(cx, -0.2, cz); root.add(cop);
    // fountain: small basin, column, falling spray
    const f = new THREE.Group(); f.position.set(cx, 0, cz);
    f.add(M(new THREE.CylinderGeometry(1.1, 1.25, 0.35, 32), mat.stone).translateY(0.05));
    const inner = M(new THREE.CylinderGeometry(0.98, 0.98, 0.02, 32), mat.water, false, true); inner.position.y = 0.2; f.add(inner);
    f.add(M(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 16), mat.stone).translateY(0.6));
    f.add(M(new THREE.CylinderGeometry(0.5, 0.25, 0.14, 24), mat.stone).translateY(1.1));
    const jet = M(new THREE.CylinderGeometry(0.03, 0.06, 1.3, 8), mat.spray, false, false); jet.position.y = 1.8; f.add(jet);
    const r = T.rng(9);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, t = r();
      const rad = 0.25 + t * 0.85, y = 2.45 - t * t * 2.1;
      const d = M(new THREE.SphereGeometry(0.025 + r() * 0.03, 6, 4), mat.spray, false, false);
      d.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); f.add(d);
    }
    root.add(f);
    addLight(V(cx, 0.6, cz), '#bfe0ff', 8, 6);
    // reeds / bushes at the pond edge
  }

  // ---------------------------------------------------------------- trees: trunk + branches + layered leaf clusters
  const treeAt = (x, z, H, seed, crownR) => K.tree(x, z, H, seed, crownR);
  const shrubAt = (x, z, s, seed) => K.shrub(x, z, s, seed);
  treeAt(-18, 6, 10, 3, 3.3);
  treeAt(-12.5, 16, 11, 4, 3.6);
  treeAt(-4.5, 17.5, 8, 7, 2.8);
  shrubAt(19, -8, 1.3, 8); shrubAt(17.6, -6.4, 1.0, 9);
  treeAt(18.5, -18, 9, 10, 3.0);
  treeAt(4.5, -17.5, 10, 11, 3.2);
  treeAt(-19, 17.5, 9, 12, 3.0);
  treeAt(7, 17.5, 7.5, 13, 2.6);
  treeAt(18.5, 11.5, 7, 14, 2.5);
  treeAt(-11, -12.5, 8, 15, 2.6);
  shrubAt(5.2, 6.4, 1.2, 1); shrubAt(16, 15.5, 1.4, 2); shrubAt(-10.5, 12, 1.1, 3); shrubAt(14.8, 6.4, 1.0, 4);
  shrubAt(-1, -3.6, 0.9, 5); shrubAt(3.5, -3.4, 1.0, 6); shrubAt(-19.5, 3.0, 1.0, 7);

  // ---------------------------------------------------------------- food kiosk (faces +x onto the south path)
  {
    const g = new THREE.Group(); g.position.set(-9.0, PAVE_Y, 7.5);
    const w = 3.0, d = 3.6, h = 2.7; // x by z
    const body = M(new THREE.BoxGeometry(w, h, d), mat.siding); body.position.y = h / 2; g.add(body);
    // base plinth and corner posts
    g.add(M(new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1), mat.green).translateY(0.12));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = M(new THREE.BoxGeometry(0.12, h, 0.12), mat.green); p.position.set(sx * w / 2, h / 2, sz * d / 2); g.add(p); }
    // serving hatch on the +x face, lit inside at night
    const hatch = M(new THREE.BoxGeometry(0.05, 1.0, 2.6), windowGlow, false, true); hatch.position.set(w / 2 + 0.01, 1.65, 0); g.add(hatch);
    const counter = M(new THREE.BoxGeometry(0.45, 0.07, 2.8), mat.wood); counter.position.set(w / 2 + 0.2, 1.12, 0); g.add(counter);
    // jars on the counter
    for (let i = 0; i < 3; i++) { const j = M(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10), mat.glass); j.position.set(w / 2 + 0.2, 1.27, -0.8 + i * 0.35); g.add(j); }
    // awning: sloped striped canvas with scalloped front edge
    const aw = M(new THREE.PlaneGeometry(3.2, 1.3), mat.awning); aw.rotation.set(0, Math.PI / 2, 0); aw.rotateX(-1.0); aw.position.set(w / 2 + 0.55, 2.55, 0); g.add(aw);
    const fr = M(new THREE.PlaneGeometry(3.2, 0.32), mat.awning); fr.rotation.y = Math.PI / 2; fr.position.set(w / 2 + 1.1, 2.08, 0); g.add(fr);
    // roof: shallow pitched, overhanging
    const roof = M(new THREE.BoxGeometry(w + 0.6, 0.16, d + 0.6), mat.roofSheet); roof.position.y = h + 0.08; g.add(roof);
    const ridge = M(new THREE.ConeGeometry((d + 0.7) / Math.SQRT2, 0.9, 4, 1), mat.roofSheet); ridge.position.y = h + 0.6; ridge.rotation.y = Math.PI / 4; ridge.scale.set((w + 0.7) / (d + 0.7), 1, 1); g.add(ridge);
    // fascia sign above the hatch
    const sign = M(new THREE.BoxGeometry(0.06, 0.45, 2.6), [mat.green, mat.sign, mat.green, mat.green, mat.green, mat.green]);
    sign.position.set(w / 2 + 0.33, h + 0.45, 0); g.add(sign);
    // menu board on a post beside the hatch, facing the path
    const mb = new THREE.Group(); mb.position.set(w / 2 + 0.9, 0, d / 2 + 0.3);
    mb.add(M(new THREE.BoxGeometry(0.08, 1.15, 0.08), mat.green).translateY(0.6));
    const board = M(new THREE.BoxGeometry(0.06, 0.62, 1.05), [mat.menu, mat.green, mat.green, mat.green, mat.green, mat.green]); board.position.y = 1.45; mb.add(board);
    mb.rotation.y = -0.3;
    g.add(mb);
    // side window lit at night
    const win = M(new THREE.BoxGeometry(1.4, 0.7, 0.04), windowGlow, false, true); win.position.set(0, 1.75, d / 2 + 0.01); g.add(win);
    root.add(g);
    addLight(V(-9 + w / 2 + 0.6, 2.1, 7.5), '#ffcf96', 22, 8);
    // terrace tables with parasols
    for (const [x, z, c] of [[-4.2, 6.5, '#f4efe2'], [-4.2, 9.4, '#1f6f5c']]) {
      const t = new THREE.Group(); t.position.set(x, PAVE_Y, z);
      t.add(M(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), mat.cream).translateY(0.74));
      t.add(M(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 8), mat.stainless).translateY(1.15));
      t.add(M(new THREE.CylinderGeometry(0.22, 0.25, 0.05, 16), mat.darkSteel).translateY(0.03));
      const um = M(new THREE.ConeGeometry(1.25, 0.42, 12, 1, true), std({ color: c, roughness: 0.85, side: THREE.DoubleSide })); um.position.y = 2.2; t.add(um);
      for (const a of [0, Math.PI]) { const ch = new THREE.Group(); ch.add(M(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat.darkSteel).translateY(0.45)); ch.add(M(new THREE.BoxGeometry(0.42, 0.42, 0.04), mat.darkSteel).translateY(0.66).translateZ(-0.2)); for (const sx of [-0.18, 0.18]) for (const sz of [-0.18, 0.18]) ch.add(M(new THREE.CylinderGeometry(0.015, 0.015, 0.45), mat.darkSteel).translateX(sx).translateY(0.22).translateZ(sz)); ch.position.set(Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75); ch.rotation.y = a + Math.PI; t.add(ch); }
      root.add(t);
    }
  }

  // ---------------------------------------------------------------- carousel
  const carousel = K.carousel({ cx: 10.5, cz: -10.5, R: 5.8 });

  // ---------------------------------------------------------------- coaster
  const coaster = buildCoaster(mat, root, { led, bulb: ringBulb, addLight, night, signMat: mat.coasterSign, windowGlow });

  // ---------------------------------------------------------------- queue railings on the asphalt pad
  {
    const posts = [];
    const lanes = [-1.9, -2.75, -3.6, -4.4];
    const x0 = -16.2, x1 = -3.4;
    lanes.forEach((z, li) => {
      // alternate the open end so the line snakes
      const a = li === 0 ? x0 + 1.2 : (li % 2 ? x0 : x0 + 1.2), b = li === 0 ? x1 - 1.4 : (li % 2 ? x1 - 1.2 : x1);
      if (li === 3) return;
      for (let x = a; x <= b + 0.01; x += (b - a) / Math.round((b - a) / 1.6)) posts.push([x, z]);
      root.add(rod(V(a, 0.95, z), V(b, 0.95, z), 0.025, mat.stainless, 8));
      root.add(rod(V(a, 0.5, z), V(b, 0.5, z), 0.02, mat.stainless, 8));
    });
    posts.forEach(([x, z]) => { root.add(rod(V(x, 0, z), V(x, 1.0, z), 0.03, mat.stainless, 8)); root.add(M(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), mat.stainless).translateX(x).translateZ(z).translateY(PAVE_Y + 0.015)); });
  }

  // ---------------------------------------------------------------- guests
  const guests = [];
  const put = (seed, x, z, rotY, pose, look = {}) => {
    const p = person(randomLook(seed, look), pose);
    p.position.set(x, PAVE_Y, z); p.rotation.y = rotY;
    root.add(p); guests.push(p);
    return p;
  };
  const E = Math.PI / 2, W = -Math.PI / 2, S = 0, Nn = Math.PI;
  // avenue walkers
  put(1, -17, -0.6, E, { kind: 'walk', phase: 0.3 });
  put(2, -13.5, 0.7, W, { kind: 'walk', phase: 1.9 });
  put(3, -8, -0.4, E, { kind: 'walk', phase: 2.8 });
  put(4, -7.2, 0.5, E, { kind: 'walk', phase: 0.9 }, { child: true });
  put(5, -2.5, -0.8, W, { kind: 'walk', phase: 2.2 });
  put(6, 2.6, 0.6, E, { kind: 'walk', phase: 0.4 });
  put(7, 5.5, -0.5, W, { kind: 'walk', phase: 1.3 });
  put(8, 6.3, -0.9, W, { kind: 'walk', phase: 2.9 }, { child: true, balloon: '#e2312b' });
  put(9, 14.5, 0.4, E, { kind: 'walk', phase: 0.1 });
  put(10, 17.5, -0.6, W, { kind: 'walk', phase: 1.7 });
  put(11, 9.8, 0.9, S, { kind: 'walk', phase: 2.4 });
  // south path + plaza
  put(12, -0.6, 7, Nn, { kind: 'walk', phase: 0.7 });
  put(13, 0.6, 11.5, S, { kind: 'walk', phase: 2.0 });
  put(14, 0.4, 12.2, S, { kind: 'walk', phase: 0.2 }, { child: true, balloon: '#f2c22e' });
  put(15, -0.5, 17, Nn, { kind: 'walk', phase: 1.1 });
  put(16, 1.6, 2.6, -2.4, { kind: 'stand' });
  put(17, 2.4, 2.1, 0.9, { kind: 'stand' });
  put(18, 2.1, 3.0, 2.8, { kind: 'wave' }, { child: true });
  put(32, 3.0, 8.6, E, { kind: 'stand' });
  put(33, 3.6, 9.4, 0.8, { kind: 'stand' }, { child: true });
  // kiosk: two in line, one served, one walking off with food
  put(19, -5.4, 7.2, W, { kind: 'stand' });
  put(20, -4.6, 7.9, W, { kind: 'stand' }, { child: true });
  put(21, -3.0, 8.2, E, { kind: 'walk', phase: 1.5 });
  // sitting on benches (bench seat height 0.45)
  const sitOn = (seed, x, z, rot) => { const p = put(seed, x, z, rot, { kind: 'sit' }); p.position.y = PAVE_Y + 0.47; };
  sitOn(22, -12.4, 2.05, Nn); sitOn(23, -11.6, 2.05, Nn); sitOn(24, 3.3, 4.05, Nn);
  // carousel entry
  put(25, 10.2, -2.2, Nn, { kind: 'stand' }); put(26, 11.0, -2.5, Nn, { kind: 'stand' }, { child: true });
  // coaster queue
  [[-4.6, -2.3], [-5.6, -2.35], [-6.5, -2.3], [-8.0, -2.32], [-9.2, -2.3], [-11.4, -3.15], [-12.3, -3.2], [-14.0, -3.15], [-15.4, -4.0]]
    .forEach(([x, z], i) => put(40 + i, x, z, i < 5 ? W : (i < 8 ? W : W), { kind: 'stand' }));
  put(50, -3.2, -1.2, Nn, { kind: 'walk', phase: 0.6 });
  // a family heading for the carousel, a parent waiting at the fence, someone resting
  put(51, 8.0, 0.2, -2.3, { kind: 'walk', phase: 1.0 });
  put(52, 8.6, 0.6, -2.3, { kind: 'walk', phase: 2.6 }, { child: true, balloon: '#2e7fe0' });
  put(53, 12.6, -3.6, Nn, { kind: 'wave' });
  sitOn(54, 13.4, 2.05, Nn);

  return { root, lights, lightMats, guests, coaster, carousel };
}

// ---------------------------------------------------------------- tubular steel coaster: closed circuit
function buildCoaster(mat, root, { led, bulb, addLight, night, signMat, windowGlow }) {
  const g = new THREE.Group();
  const RAIL_Y = 1.25; // rail top height in the station
  const ctrl = [
    [-3.0, RAIL_Y, -7.2], [-8.5, RAIL_Y, -7.2], [-14.5, RAIL_Y, -7.2],
    [-18.0, 1.5, -8.6], [-19.2, 2.4, -11.0],
    [-19.2, 7.6, -16.4], [-18.7, 10.2, -19.2], [-16.6, 10.6, -20.0], [-14.0, 10.2, -19.6],
    [-11.6, 8.4, -19.1], [-8.4, 3.6, -18.4], [-5.4, 1.4, -17.4],
    [-1.8, 3.6, -16.6], [1.0, 5.6, -14.4], [1.6, 5.4, -11.2], [0.4, 3.4, -8.4], [-1.0, RAIL_Y + 0.1, -7.3],
  ].map(([x, y, z]) => V(x, y, z));
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  const L = curve.getLength();
  const NS = Math.ceil(L / 0.25);
  // frames with banking from curvature and speed (energy from the crest)
  const P = [], Tn = [], Lt = [], Up = [];
  const top = 10.8;
  const bankRaw = [];
  for (let i = 0; i <= NS; i++) {
    const u = i / NS;
    P.push(curve.getPointAt(u));
    Tn.push(curve.getTangentAt(u));
  }
  for (let i = 0; i <= NS; i++) {
    const a = Tn[(i - 2 + NS) % NS], b = Tn[(i + 2) % NS];
    const dT = b.clone().sub(a).divideScalar(1.0); // per metre (4 samples x 0.25 m)
    const lat = V(0, 1, 0).cross(Tn[i]).normalize();
    const kappa = dT.dot(lat); // turning toward +lat
    const v2 = Math.max(6, 2 * 9.81 * (top - P[i].y));
    let bank = Math.atan(v2 * kappa / 9.81);
    bank = Math.max(-1.05, Math.min(1.05, bank));
    bankRaw.push(bank);
  }
  // smooth the bank and keep the station flat
  const bank = bankRaw.map((_, i) => { let s = 0; for (let k = -10; k <= 10; k++) s += bankRaw[(i + k + NS) % NS]; return s / 21; });
  for (let i = 0; i <= NS; i++) {
    const t = Tn[i], lat = V(0, 1, 0).cross(t).normalize(), up = t.clone().cross(lat).normalize();
    const flat = P[i].y < RAIL_Y + 0.15 && P[i].z > -7.6 && P[i].x < -1.5 && P[i].x > -15.5;
    const b = flat ? 0 : bank[i];
    // rotate up toward +lat for a positive bank (turn toward +lat)
    const q = new THREE.Quaternion().setFromAxisAngle(t, -b);
    Lt.push(lat.applyQuaternion(q)); Up.push(up.applyQuaternion(q));
  }
  const offsetCurve = (dl, du) => new THREE.CatmullRomCurve3(P.slice(0, NS).map((p, i) => p.clone().addScaledVector(Lt[i], dl).addScaledVector(Up[i], du)), true);
  const GAUGE = 0.52;
  const railMat = mat.steelBlue;
  const tube = (c, r) => M(new THREE.TubeGeometry(c, NS, r, 10, true), railMat);
  g.add(tube(offsetCurve(GAUGE, 0), 0.065));
  g.add(tube(offsetCurve(-GAUGE, 0), 0.065));
  g.add(tube(offsetCurve(0, -0.48), 0.16)); // spine
  // LED points along both sides of the spine (dark in daylight, the ride's night outline)
  if (night) {
    const n = Math.floor(NS / 6), leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), led, n * 2);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++) for (const sd of [-1, 1]) { const i = k * 6; m4.makeTranslation(...P[i].clone().addScaledVector(Up[i], -0.48).addScaledVector(Lt[i], sd * 0.2).toArray()); leds.setMatrixAt(k * 2 + (sd > 0), m4); }
    g.add(leds);
  }
  // cross ties every 1 m: rail - spine - rail
  for (let i = 0; i < NS; i += 4) {
    const sp = P[i].clone().addScaledVector(Up[i], -0.48);
    g.add(rod(P[i].clone().addScaledVector(Lt[i], GAUGE), sp, 0.035, railMat, 6));
    g.add(rod(P[i].clone().addScaledVector(Lt[i], -GAUGE), sp, 0.035, railMat, 6));
  }
  // lift: chain + catwalk on the lift section (where the track climbs steeply)
  const liftIdx = [];
  for (let i = 0; i < NS; i++) if (Tn[i].y > 0.45 && P[i].x < -17) liftIdx.push(i);
  if (liftIdx.length) {
    const links = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.05, 0.11), mat.chain, liftIdx.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), mx = new THREE.Matrix4();
    let n = 0;
    for (const i of liftIdx) for (const h of [0, 0.5]) {
      const j = Math.min(NS - 1, i);
      const p = P[j].clone().lerp(P[j + 1], h).addScaledVector(Up[j], -0.08);
      mx.makeBasis(Lt[j], Up[j], Tn[j]); q.setFromRotationMatrix(mx);
      m4.compose(p, q, V(1, 1, 1)); links.setMatrixAt(n++, m4);
    }
    links.castShadow = true; g.add(links);
    // catwalk (grating) with handrail on the outer side
    const a = liftIdx[0], b = liftIdx[liftIdx.length - 1];
    const side = -1;
    {
      // one continuous grating ribbon (no overlapping boxes -> no z-fighting)
      const pos = [], idx = [];
      for (let i = a; i <= b; i++) {
        const c = P[i].clone().addScaledVector(Up[i], -0.2);
        const e0 = c.clone().addScaledVector(Lt[i], side * 0.72), e1 = c.clone().addScaledVector(Lt[i], side * 1.28);
        pos.push(e0.x, e0.y, e0.z, e1.x, e1.y, e1.z);
        if (i < b) { const k = (i - a) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
      g.add(M(rg, std({ color: '#3a3f42', metalness: 0.6, roughness: 0.55, side: THREE.DoubleSide })));
    }
    for (let i = a; i < b; i += 8) {
      const base = P[i].clone().addScaledVector(Lt[i], side * 1.25).addScaledVector(Up[i], -0.2);
      g.add(rod(base, base.clone().add(V(0, 1.0, 0)), 0.02, mat.steelYellow, 6));
    }
    const hr = new THREE.CatmullRomCurve3(liftIdx.filter((_, k) => k % 4 === 0).map((i) => P[i].clone().addScaledVector(Lt[i], side * 1.25).addScaledVector(Up[i], -0.2).add(V(0, 1.0, 0))));
    g.add(M(new THREE.TubeGeometry(hr, 60, 0.022, 6, false), mat.steelYellow));
  }
  // supports: a column every ~3.5 m outside the station, footing + cross-arm to the spine
  const footing = new THREE.CylinderGeometry(0.42, 0.5, 0.45, 16);
  for (let i = 6; i < NS; i += 14) {
    const p = P[i];
    const inStation = p.z > -7.9 && p.x < -1.5 && p.x > -15.6 && p.y < RAIL_Y + 0.3;
    if (inStation) continue;
    const sp = p.clone().addScaledVector(Up[i], -0.48);
    const bottom = V(sp.x, 0, sp.z);
    const colTop = V(sp.x, sp.y - 0.12, sp.z);
    if (colTop.y < 0.5) continue;
    g.add(rod(bottom, colTop, colTop.y > 6 ? 0.2 : 0.16, mat.steelWhite, 12));
    g.add(rod(colTop, sp, 0.12, mat.steelWhite, 10));
    g.add(M(footing, mat.concrete).translateX(sp.x).translateZ(sp.z).translateY(0.12));
    // bracing for tall columns: a second leg splayed outward
    if (colTop.y > 5.5) {
      const out = V(Lt[i].x, 0, Lt[i].z).normalize().multiplyScalar(2.2);
      const b2 = bottom.clone().add(out);
      g.add(rod(b2, V(sp.x, colTop.y * 0.72, sp.z), 0.12, mat.steelWhite, 10));
      g.add(M(footing, mat.concrete).translateX(b2.x).translateZ(b2.z).translateY(0.12));
    }
  }
  // station: platform, roof on columns, sign, stairs, rail-side gates
  {
    const x0 = -15.2, x1 = -2.6, zp0 = -6.55, zp1 = -4.5, platY = 1.05;
    const plat = M(new THREE.BoxGeometry(x1 - x0, platY, zp1 - zp0), mat.concrete); plat.position.set((x0 + x1) / 2, platY / 2, (zp0 + zp1) / 2); g.add(plat);
    const deck = M(new THREE.BoxGeometry(x1 - x0, 0.04, zp1 - zp0), mat.deck); deck.position.set((x0 + x1) / 2, platY + 0.02, (zp0 + zp1) / 2);
    deck.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? 1.3 : 8); });
    g.add(deck);
    // track bed under the station: a low concrete channel
    const bed = M(new THREE.BoxGeometry(x1 - x0, 0.3, 1.6), mat.concrete); bed.position.set((x0 + x1) / 2, 0.15, -7.2); g.add(bed);
    for (let x = x0 + 1; x < x1; x += 2.2) g.add(rod(V(x, 0.3, -7.2), V(x, RAIL_Y - 0.6, -7.2), 0.13, mat.steelWhite, 10));
    // yellow edge strip
    const edge = M(new THREE.BoxGeometry(x1 - x0, 0.045, 0.12), mat.steelYellow); edge.position.set((x0 + x1) / 2, platY + 0.03, zp0 + 0.06); g.add(edge);
    // air gates along the edge
    for (let x = x0 + 1.4; x < x1 - 1; x += 1.25) {
      g.add(rod(V(x, platY, zp0 + 0.3), V(x, platY + 0.9, zp0 + 0.3), 0.025, mat.stainless, 6));
      g.add(rod(V(x, platY + 0.9, zp0 + 0.3), V(x + 0.9, platY + 0.9, zp0 + 0.3), 0.02, mat.stainless, 6));
    }
    // roof: columns at front and back, steel beams, corrugated sheet sloping back
    const roofY = 4.4;
    for (let x = x0 + 0.3; x <= x1; x += 3.1) {
      g.add(rod(V(x, platY, zp1 - 0.2), V(x, roofY + 0.3, zp1 - 0.2), 0.09, mat.darkSteel, 10));
      g.add(rod(V(x, 0, -8.3), V(x, roofY, -8.3), 0.09, mat.darkSteel, 10));
      g.add(rod(V(x, roofY + 0.3, zp1 - 0.2), V(x, roofY, -8.3), 0.07, mat.darkSteel, 8));
    }
    const roof = M(new THREE.BoxGeometry(x1 - x0 + 1.2, 0.08, 4.8), mat.roofSheet);
    roof.position.set((x0 + x1) / 2, roofY + 0.2, -6.4); roof.rotation.x = Math.atan2(0.3, 3.8); g.add(roof);
    const fascia = M(new THREE.BoxGeometry(x1 - x0 + 1.2, 0.5, 0.08), mat.steelWhite); fascia.position.set((x0 + x1) / 2, roofY + 0.32, -3.98); g.add(fascia);
    const sign = M(new THREE.BoxGeometry(4.2, 0.8, 0.1), [mat.steelWhite, mat.steelWhite, mat.steelWhite, mat.steelWhite, signMat, mat.steelWhite]);
    sign.position.set((x0 + x1) / 2 + 2.5, roofY + 0.95, -3.95); g.add(sign);
    // strip lights under the roof
    for (let x = x0 + 1.5; x < x1; x += 3.1) { const s = M(new THREE.BoxGeometry(1.2, 0.05, 0.12), bulb, false, false); s.position.set(x, roofY - 0.02, -5.6); g.add(s); addLight(V(x, roofY - 0.3, -5.6), '#fff0d8', 12, 7); }
    // stairs from the queue (west end) up to the platform
    for (let k = 0; k < 6; k++) {
      const st = M(new THREE.BoxGeometry(1.4, 0.175, 0.32), mat.concrete);
      st.position.set(-15.2 - 0.7 + 1.4 / 2 + 0.7 - 0.7, (k + 0.5) * 0.175, -4.5 + 1.92 - k * 0.32);
      st.position.x = -14.4; st.scale.y = (k + 1); st.position.y = (k + 1) * 0.175 / 2;
      g.add(st);
    }
    g.add(rod(V(-15.1, 1.0, -2.6), V(-15.1, 2.05, -4.5), 0.025, mat.stainless, 6));
    g.add(rod(V(-13.7, 1.0, -2.6), V(-13.7, 2.05, -4.5), 0.025, mat.stainless, 6));
    // operator booth at the east end
    const booth = M(new THREE.BoxGeometry(1.4, 2.2, 1.3), mat.steelWhite); booth.position.set(-3.4, platY + 1.1, -5.4); g.add(booth);
    const bw = M(new THREE.BoxGeometry(1.2, 0.7, 0.04), windowGlow, false, false); bw.position.set(-3.4, platY + 1.5, -4.74); g.add(bw);
  }
  // train of 3 cars on the drop, riders seated
  const train = new THREE.Group();
  const dropStart = (() => { let best = 0, bi = 0; for (let i = 0; i < NS; i++) if (P[i].y > best) { best = P[i].y; bi = i; } return bi; })();
  for (let c = 0; c < 3; c++) {
    // place cars by arclength just past the crest, so the train is pitched over the drop
    const i = (dropStart + 9 - c * 10 + NS) % NS;
    const car = coasterCar(mat, c === 0, 900 + c * 10, c < 2);
    const mx = new THREE.Matrix4().makeBasis(Lt[i], Up[i], Tn[i]);
    car.quaternion.setFromRotationMatrix(mx);
    car.position.copy(P[i]);
    train.add(car);
  }
  g.add(train);
  root.add(g);
  return { group: g, curve, P, Up, Lt, Tn, NS };
}

function coasterCar(mat, lead, seed, armsUp) {
  const car = new THREE.Group();
  const len = 2.2, w = 1.32;
  // chassis + wheels on the rails
  car.add(M(new THREE.BoxGeometry(0.5, 0.18, len * 0.9), mat.darkSteel).translateY(0.0));
  for (const s of [-1, 1]) for (const z of [-0.75, 0.75]) {
    const wb = M(new THREE.BoxGeometry(0.16, 0.3, 0.38), mat.darkSteel); wb.position.set(s * 0.52, -0.02, z); car.add(wb);
    const wh = M(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), mat.seat); wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.52, 0.09, z); car.add(wh);
  }
  // body shell: floor, sides, back, rounded nose on the lead car
  const bodyY = 0.22;
  car.add(M(new THREE.BoxGeometry(w, 0.1, len), mat.carRed).translateY(bodyY));
  for (const s of [-1, 1]) { const side = M(new THREE.BoxGeometry(0.08, 0.62, len), mat.carRed); side.position.set(s * (w / 2 - 0.04), bodyY + 0.3, 0); car.add(side); }
  const back = M(new THREE.BoxGeometry(w, 0.9, 0.1), mat.carRed); back.position.set(0, bodyY + 0.45, -len / 2 + 0.05); car.add(back);
  if (lead) {
    const nose = M(new THREE.BoxGeometry(w, 0.62, 0.7), mat.carRed); nose.position.set(0, bodyY + 0.22, len / 2 + 0.2); nose.rotation.x = 0.45; nose.scale.set(1, 0.8, 1); car.add(nose);
    const front = M(new THREE.BoxGeometry(w, 0.62, 0.1), mat.carRed); front.position.set(0, bodyY + 0.3, len / 2 - 0.05); car.add(front);
    for (const s of [-1, 1]) { const hl = M(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), mat.steelYellow); hl.rotation.x = Math.PI / 2 + 0.45; hl.position.set(s * 0.42, bodyY + 0.33, len / 2 + 0.47); car.add(hl); }
  } else {
    const front = M(new THREE.BoxGeometry(w, 0.62, 0.1), mat.carRed); front.position.set(0, bodyY + 0.3, len / 2 - 0.05); car.add(front);
  }
  // trim
  for (const s of [-1, 1]) { const t = M(new THREE.BoxGeometry(0.1, 0.05, len), mat.steelYellow); t.position.set(s * (w / 2 - 0.04), bodyY + 0.62, 0); car.add(t); }
  // two rows x two seats, seated riders, lap bars
  let n = 0;
  for (const z of [0.45, -0.5]) {
    const seat = M(new THREE.BoxGeometry(w - 0.2, 0.12, 0.5), mat.seat); seat.position.set(0, bodyY + 0.2, z); car.add(seat);
    const sb = M(new THREE.BoxGeometry(w - 0.2, 0.6, 0.1), mat.seat); sb.position.set(0, bodyY + 0.5, z - 0.28); sb.rotation.x = -0.15; car.add(sb);
    for (const x of [-0.3, 0.3]) {
      const p = person(randomLook(seed + n++, { balloon: null, backpack: null }), { kind: 'ride', armsUp: armsUp && (n % 3 !== 0), legsHidden: true });
      p.position.set(x, bodyY + 0.27, z - 0.12);
      car.add(p);
    }
    car.add(rod(V(-0.55, bodyY + 0.62, z + 0.24), V(0.55, bodyY + 0.62, z + 0.24), 0.03, mat.steelYellow, 8));
  }
  return car;
}
