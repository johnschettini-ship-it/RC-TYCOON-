// Ground pieces (stage 1): every set is rot 'all' (slope masks and joins are given in view terms, and the sun turns
// with the camera, so a view turn only changes which piece a tile uses). Anchor: the tile's top corner (N corner,
// map (x, y)) at its base height, as iso.ts tileToScreen. Pieces overlap their neighbours by 6 cm so edges do not
// show the background; textures repeat every 4 m, a whole tile, so they run on across tile edges.
//   ground:grass  [`s<slope mask 0-15>`, `v<variant 0-3>`]   (mask bits N 1, E 2, S 4, W 8 = corner raised 1 m)
//   ground:water  [`s0`, `v<0-3>`]                          (the water surface of one tile at the water level)
//   ground:cliff  [`e1` | `e2`, `h1`]                        (a 1 m face on the E or S edge, rising from the anchor
//                                                            height; the game stacks one per height step)
//   ground:path   [`j<join mask 0-15>`]                      (paving; a kerb on each side without a join), and
//                 [`s0`, `v<0-3>`] = j15 (what the renderer asks for today: flat, no joins)
//   ground:queue  as path                                    (queue paving; rails on each side without a join)
// Join bits as render/paths.ts: N 1, E 2, S 4, W 8.
import { THREE, TILE, kit, frameKey } from './common.js';
import { M, planarUV, rod, V } from '../kit.js';
import { rng } from '../textures.js';

const OV = 0.06; // overlap in metres
const SEG = 16;

/** Tile surface with corner heights [N, E, S, W] (metres), grown by OV on every side. */
function surface(h, mat, { colours = null, uv = TILE } = {}) {
  const g = new THREE.PlaneGeometry(TILE + 2 * OV, TILE + 2 * OV, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  g.translate(TILE / 2, 0, TILE / 2);
  const p = g.attributes.position;
  const col = colours ? new Float32Array(p.count * 3) : null;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / TILE, v = p.getZ(i) / TILE;
    const y = (1 - u) * (1 - v) * h[0] + u * (1 - v) * h[1] + u * v * h[2] + (1 - u) * v * h[3];
    p.setY(i, y);
    if (col) { const k = colours(u, v); col[i * 3] = k * 1.02; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.96; }
  }
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  planarUV(g, uv);
  return M(g, mat, false, true);
}

/** Variant tint: a few soft blotches inside the tile, 1.0 at the edges so neighbours match. */
function blotches(seed) {
  const r = rng(seed);
  const pts = Array.from({ length: 6 }, () => [0.15 + r() * 0.7, 0.15 + r() * 0.7, 0.12 + r() * 0.2, (r() - 0.5) * 0.35]);
  return (u, v) => {
    const edge = Math.min(1, 6 * Math.min(u, v, 1 - u, 1 - v));
    let k = 0;
    for (const [px, py, rad, s] of pts) { const d = Math.hypot(u - px, v - py); if (d < rad) k += s * (1 - d / rad) ** 2; }
    return 1 + k * Math.max(0, edge);
  };
}

export default {
  bake(B) {
    const K = kit();
    const { mat, tx } = K;
    const bs = B.newScene();
    const shot = (obj, keys, set) => {
      bs.world.add(obj);
      B.setEnv(obj);
      set.add(keys, B.shoot(bs, { target: obj, margin: 1 }));
      bs.world.remove(obj);
    };
    const grassMat = new THREE.MeshStandardMaterial({ map: tx.grass.map, bumpMap: tx.grass.bump, bumpScale: 1.2, roughness: 0.95, vertexColors: true });

    const grass = B.set('ground', 'grass', 'all');
    for (let m = 0; m < 16; m++) {
      const h = [m & 1 ? 1 : 0, m & 2 ? 1 : 0, m & 4 ? 1 : 0, m & 8 ? 1 : 0];
      for (let v = 0; v < 4; v++) shot(surface(h, grassMat, { colours: blotches(31 + v * 7) }), [frameKey([`s${m}`, `v${v}`])], grass);
    }
    B.log('ground: grass done');

    const water = B.set('ground', 'water', 'all');
    for (let v = 0; v < 4; v++) {
      const wm = mat.water.clone();
      wm.normalMap = tx.water.normal.clone();
      wm.normalMap.offset.set(v * 0.25, v * 0.37);
      wm.normalMap.repeat.set(1, 1);
      wm.normalMap.needsUpdate = true;
      shot(surface([0, 0, 0, 0], wm), [frameKey(['s0', `v${v}`])], water);
    }

    const cliff = B.set('ground', 'cliff', 'all');
    for (const e of [1, 2]) {
      const g = new THREE.PlaneGeometry(TILE + 2 * OV, 1 + OV);
      const face = M(g, mat.soil, false, true);
      // e1: the E edge (x = 4 m) facing +x; e2: the S edge (y = 4 m, three z) facing +z
      if (e === 1) { face.rotation.y = Math.PI / 2; face.position.set(TILE, 0.5 - OV / 2, TILE / 2); } else face.position.set(TILE / 2, 0.5 - OV / 2, TILE);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 0.5);
      const grp = new THREE.Group(); grp.add(face);
      shot(grp, [frameKey([`e${e}`, 'h1'])], cliff);
    }

    for (const kind of ['path', 'queue']) {
      const set = B.set('ground', kind, 'all');
      const top = kind === 'path' ? mat.pavers : mat.paversGrey;
      for (let j = 0; j < 16; j++) {
        const grp = new THREE.Group();
        const s = surface([0, 0, 0, 0], top, { uv: TILE / 2 });
        s.position.y = 0.04;
        grp.add(s);
        // sides without a join: N (z = 0), E (x = 4), S (z = 4), W (x = 0)
        const sides = [[1, TILE / 2, 0.08, true], [2, TILE - 0.08, TILE / 2, false], [4, TILE / 2, TILE - 0.08, true], [8, 0.08, TILE / 2, false]];
        for (const [bit, x, z, alongX] of sides) {
          if (j & bit) continue;
          if (kind === 'path') {
            const kerb = M(new THREE.BoxGeometry(alongX ? TILE : 0.16, 0.14, alongX ? 0.16 : TILE), mat.kerb);
            kerb.position.set(x, 0.07, z);
            grp.add(kerb);
          } else {
            const a = alongX ? V(0.15, 0, z) : V(x, 0, 0.15), b = alongX ? V(TILE - 0.15, 0, z) : V(x, 0, TILE - 0.15);
            for (const t of [0, 0.5, 1]) { const p = a.clone().lerp(b, t); grp.add(rod(p.clone().setY(0.04), p.clone().setY(1.0), 0.03, mat.stainless, 8)); }
            for (const y of [0.55, 0.98]) grp.add(rod(a.clone().setY(y), b.clone().setY(y), 0.025, mat.stainless, 8));
          }
        }
        // the renderer (Task 8) asks for [`s<slope>`, `v<variant>`] with no joins yet: flat path = the all-joined piece
        shot(grp, [frameKey([`j${j}`]), ...(j === 15 ? [0, 1, 2, 3].map((v) => frameKey(['s0', `v${v}`])) : [])], set);
      }
    }
    B.log('ground: water, cliff, path, queue done');
  },
};
