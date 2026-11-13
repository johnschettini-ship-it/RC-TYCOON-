// Weeping Willow (scenery, 1 x 1, 6 m): a low wide leaf-card crown with hanging strands of leaf cards.
import { sceneryItem, rootOf } from './scenery.js';
import { THREE } from './common.js';
import { rng } from '../textures.js';

export default sceneryItem('willow', (K) => {
  K.tree(0, 0, 5.4, 41, 1.9);
  const r = rng(43);
  const card = new THREE.PlaneGeometry(0.28, 1.7);
  card.translate(0, -0.85, 0);
  const mat = new THREE.MeshStandardMaterial({ map: K.tx.leaves.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, color: '#dfe8b8' });
  const n = 150;
  const im = new THREE.InstancedMesh(card, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = 1.2 + r() * 0.75, top = 4.3 + r() * 0.9;
    q.setFromEuler(new THREE.Euler(0, -a + Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.15));
    m4.compose(new THREE.Vector3(Math.cos(a) * rad, top, Math.sin(a) * rad), q, new THREE.Vector3(1, 0.8 + r() * 0.7, 1));
    im.setMatrixAt(i, m4);
    const k = 0.85 + r() * 0.3;
    im.setColorAt(i, col.setRGB(k, k * 1.04, k * 0.8));
  }
  im.castShadow = true; im.receiveShadow = true;
  K.root.add(im);
  return rootOf(K);
});
