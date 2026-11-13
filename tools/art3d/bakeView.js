// three.js side of the bake camera (tools/art3d/camera.ts holds the math). THREE is passed in, so this module works
// with the import map of a bake page and with the vendored build imported by path in node tests.
//
// cam: a bakeCamera(rot, density) result. view: { widthPx, heightPx, originPx: [sx, sy] } is the picture size and
// where the game point (0, 0, 0) lands in it (px from the top-left). Returns { camera, modelScale }: render the item
// in a group scaled by modelScale (the 0.02 % height stretch that puts heights on the game's 9.8 px per metre).
// Game (x, y, z) in metres is three.js (x, z, y).
import { threeView } from './camera.ts';

export function makeBakeCamera(THREE, cam, view, distance = 400) {
  const { toCamera, up } = threeView(cam);
  const k = cam.pxPerMetre;
  const [ox, oy] = view.originPx;
  // Frustum in metres in the picture plane, around the camera axis through the game origin.
  const camera = new THREE.OrthographicCamera(-ox / k, (view.widthPx - ox) / k, oy / k, (oy - view.heightPx) / k, 0.1, distance * 2);
  camera.position.set(toCamera[0] * distance, toCamera[1] * distance, toCamera[2] * distance);
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { camera, modelScale: new THREE.Vector3(1, cam.heightScale, 1) };
}
