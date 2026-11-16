// The lake's mirror world for the title (items/title.js), in a module of its own so a unit test can build it without
// the kit (tests/unit/art3d/title.test.ts). THREE is passed in.
//
// mirrorWorld(THREE, groups, waterY): copies of `groups` turned over the plane y = waterY. The copies take the
// mirror's layer: every group's own layer tag is dropped (clone() copies it). Anything tagged `wheel` (the big
// wheel's turning part) is hidden in the copy: the reflection is baked into the still front layer while the wheel
// turns on screen as its 8-frame strip, so a reflected wheel would stand still under a turning one. The lake mirrors
// only the wheel's static legs, axle and platform. The copies cast no shadows.
export function mirrorWorld(THREE, groups, waterY) {
  const mirror = new THREE.Group();
  mirror.userData.layer = 'mirror';
  mirror.scale.y = -1;
  mirror.position.y = 2 * waterY;
  for (const g of groups) mirror.add(g.clone());
  mirror.traverse((o) => {
    if (o === mirror) return;
    if (o.userData.layer === 'wheel') o.visible = false;
    delete o.userData.layer;
    o.castShadow = false;
  });
  return mirror;
}

/** True when `o` and all its ancestors up to `root` are visible (what the renderer draws). */
export function shown(o, root) {
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === root) return true;
  }
  return true;
}
