// Scenery and path-item bake helpers (stage 1). Scenery: anchor = the top corner of the item's view footprint origin
// tile at its base height (src/render/scenery/layer.ts); one set per sprite rotation (iv.f = rotation + view turn),
// frame [item, `f<sceneryFrame>`] (the wilted frame shows the same picture: no stage 1 item needs water).
// Path items (bench, bin): anchor = the item's base centre on its path tile (management/layer.ts collectPathItems),
// one rot 'all' set whose frames are [item, `f<side>`], the side (0 N, 1 E, 2 S, 3 W) already in view terms (Task 8
// management/layer.ts passes it as the frame; bin fill and broken looks are not baked). Their shadows are sets per
// side (shadow:<item>:r<side>): Task 8 asks for them by view turn instead, see the stage 1 report.
import { THREE, kit, placeOnFootprint, bakeObject, frameKey } from './common.js';
import { sceneryFrame } from '../../../src/render/scenery/sprites';

/** A 1-tile (or w x d) scenery item; `build(K)` returns the model centred on its own origin, front +z. */
export function sceneryItem(id, build) {
  return {
    bake(B) {
      const [w, d] = B.input.spec.footprintTiles;
      const K = kit();
      const model = build(K);
      const keys = [...new Set([sceneryFrame(false, 0, null), sceneryFrame(true, 0, null)])].map((f) => frameKey([id, `f${f}`]));
      bakeObject(B, { kind: 'scenery', item: id, model, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures: [{ keys }] });
    },
  };
}

/** A path item; `build(K)` returns the model centred on its base point, its back to -z (a bench faces +z). */
export function pathItem(id, build) {
  return {
    bake(B) {
      const K = kit();
      const model = build(K);
      const bs = B.newScene();
      const holder = new THREE.Group();
      holder.add(model);
      bs.world.add(holder);
      B.setEnv(holder);
      const set = B.set('scenery', id, 'all');
      for (let side = 0; side < 4; side++) {
        // the item stands at tile edge `side` and faces away from it: side 0 (N) faces S = +z, k = side
        holder.rotation.set(0, (-side * Math.PI) / 2, 0);
        set.add([frameKey([id, `f${side}`])], B.shoot(bs, { target: holder }));
        B.set('shadow', id, side).add([frameKey([id])], B.shootShadow(bs, holder));
      }
      B.log(`scenery:${id} done`);
    },
  };
}

/** Stack a model's root group so callers can return `K.root` after using the kit builders. */
export function rootOf(K) {
  const g = K.root;
  g.position.set(0, 0, 0);
  return g;
}
