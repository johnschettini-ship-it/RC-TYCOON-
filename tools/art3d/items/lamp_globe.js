// Globe Lamp Post (scenery, 1 x 1, 3 m): a dark green post with a frosted globe.
import { sceneryItem, rootOf } from './scenery.js';
import { THREE } from './common.js';
import { M } from '../kit.js';

export default sceneryItem('lamp_globe', (K) => {
  const pole = K.mat.green;
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(0.15, 0.19, 0.3, 14), pole).translateY(0.15));
  g.add(M(new THREE.CylinderGeometry(0.045, 0.06, 2.35, 12), pole).translateY(1.45));
  g.add(M(new THREE.CylinderGeometry(0.09, 0.07, 0.1, 12), pole).translateY(2.65));
  g.add(M(new THREE.SphereGeometry(0.22, 24, 16), K.lampGlass, false, false).translateY(2.86));
  g.add(M(new THREE.SphereGeometry(0.035, 8, 6), pole).translateY(3.09));
  K.root.add(g);
  return rootOf(K);
});
