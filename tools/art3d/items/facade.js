// One building from pieces (spec §5.6 item 2, stage 1 "one building from pieces"): a brick shop building made of
// tiling pieces baked once and placed per tile and storey. Set facade:brick, rot 'all' (pieces are given per view
// edge), frames:
//   [`wall` | `window` | `door`, `e<edge 0-3>`]  one storey (3.5 m) of wall on tile edge 0 N, 1 E, 2 S, 3 W
//   [`parapet`, `e<edge>`]                       the low wall on the roof edge
//   [`roof`]                                     the flat roof of one tile
// Anchor: the tile's top corner at the storey's base height (stack storeys by adding 3.5 m). The game does not place
// buildings yet (no reader in Task 7/8); these pieces exist so the stage 1 bake prices them.
import { THREE, TILE, kit, frameKey } from './common.js';
import { M } from '../kit.js';
import { facade as facadeTex } from '../textures.js';

const STOREY = 3.5;

/** Plain brick wall, one texture per tile edge (4 m × 3.5 m), courses as the window texture's. */
function brickTex() {
  const W = 1024, H = 896;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row * 10 < H; row++) {
    const off = (row % 2) * 16;
    for (let x = -off; x < W; x += 32) {
      const k = 0.86 + r() * 0.16;
      g.fillStyle = `rgb(${(176 * k) | 0},${(92 * k) | 0},${(70 * k) | 0})`;
      g.fillRect(x, row * 10, 30.5, 8.5);
    }
  }
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#8a7a6c'; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const T = 0.3; // wall thickness

export default {
  bake(B) {
    const K = kit();
    const { mat } = K;
    const brick = new THREE.MeshStandardMaterial({ map: facadeTex(191, { floors: 1, bays: 1, wall: [176, 92, 70] }).map, roughness: 0.85 });
    const plain = new THREE.MeshStandardMaterial({ map: brickTex(), roughness: 0.85 });
    const bs = B.newScene();
    const set = B.set('facade', 'brick', 'all');
    // a wall slab along edge e of the tile, its outer face on the edge
    const slab = (e, h, m) => {
      const along = e % 2 === 0;
      const g = new THREE.Group();
      const s = M(new THREE.BoxGeometry(along ? TILE : T, h, along ? T : TILE), m);
      const off = T / 2;
      const pos = [[TILE / 2, off], [TILE - off, TILE / 2], [TILE / 2, TILE - off], [off, TILE / 2]][e];
      s.position.set(pos[0], h / 2, pos[1]);
      g.add(s);
      return { g, s, pos, along };
    };
    const shot = (obj, keys) => { bs.world.add(obj); B.setEnv(obj); set.add(keys, B.shoot(bs, { target: obj })); bs.world.remove(obj); };
    for (let e = 0; e < 4; e++) {
      shot(slab(e, STOREY, plain).g, [frameKey(['wall', `e${e}`])]);
      shot(slab(e, STOREY, brick).g, [frameKey(['window', `e${e}`])]);
      const d = slab(e, STOREY, plain);
      const door = M(new THREE.BoxGeometry(d.along ? 1.8 : T + 0.04, 2.5, d.along ? T + 0.04 : 1.8), K.windowGlow);
      door.position.set(d.pos[0], 1.25, d.pos[1]);
      d.g.add(door);
      const awn = M(new THREE.BoxGeometry(d.along ? 2.4 : 0.9, 0.08, d.along ? 0.9 : 2.4), mat.awning);
      const out = [[0, -0.45], [0.45, 0], [0, 0.45], [-0.45, 0]][e];
      awn.position.set(d.pos[0] + out[0], 2.8, d.pos[1] + out[1]);
      d.g.add(awn);
      shot(d.g, [frameKey(['door', `e${e}`])]);
      shot(slab(e, 0.6, mat.concrete).g, [frameKey(['parapet', `e${e}`])]);
    }
    const roof = M(new THREE.BoxGeometry(TILE, 0.15, TILE), mat.roofSheet);
    roof.position.set(TILE / 2, 0.075, TILE / 2);
    const rg = new THREE.Group(); rg.add(roof);
    shot(rg, [frameKey(['roof'])]);
    B.log('facade: brick done');
  },
};
