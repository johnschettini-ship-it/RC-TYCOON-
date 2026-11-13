// Snack Shack (stall, 1 x 1): the round 7 food stall (counter, striped awning, roof sign without lettering, since
// player-visible words come from src/data/strings). Anchor: the stall tile's top corner (sprites/stalls.ts).
// One set per view service direction s (0 N, 1 E, 2 S, 3 W); the model's counter faces +z (S), so it turns
// k = (s + 2) mod 4 quarter turns. Frame [item].
import { THREE, kit, placeOnFootprint, bakeObject, frameKey } from './common.js';
import { stall } from '../rides.js';

export default {
  bake(B) {
    const K = kit();
    stall(K, { x: 0, z: 0, y: 0, name: '', w: 2.8, d: 2.2 });
    const model = K.root;
    model.position.set(0, 0, -0.35); // centre the stall and its awning on the tile
    const wrap = new THREE.Group();
    wrap.add(model);
    bakeObject(B, { kind: 'stall', item: 'snack_shack', model: wrap, rots: [0, 1, 2, 3], place: (h, s) => placeOnFootprint(h, 1, 1, (s + 2) % 4), pictures: [{ keys: [frameKey(['snack_shack'])] }] });
  },
};
