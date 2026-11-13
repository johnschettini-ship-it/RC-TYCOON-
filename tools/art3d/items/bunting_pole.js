// Bunting Pole (scenery, 1 x 1, 6 m): a white pole with four strings of pennants falling to the tile corners.
import { sceneryItem, rootOf } from './scenery.js';
import { THREE } from './common.js';
import { M, V, rod } from '../kit.js';

export default sceneryItem('bunting_pole', (K) => {
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(0.14, 0.18, 0.25, 12), K.mat.concrete).translateY(0.125));
  g.add(M(new THREE.CylinderGeometry(0.05, 0.07, 5.9, 12), K.mat.steelWhite).translateY(3.0));
  g.add(M(new THREE.SphereGeometry(0.1, 12, 8), K.mat.gold).translateY(6.0));
  const cols = ['#c8372d', '#f2c14e', '#2f6fb5', '#3b7d4f', '#f4f1ea'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }));
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0], 3));
  tri.computeVertexNormals();
  const line = new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.6 });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const top = V(0, 5.7, 0), end = V(Math.cos(a) * 1.85, 2.3, Math.sin(a) * 1.85);
    g.add(rod(top, end, 0.008, line, 4));
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const p = top.clone().lerp(end, t);
      p.y -= Math.sin(t * Math.PI) * 0.25;
      const f = M(tri, cols[(i + k) % cols.length]);
      f.position.copy(p);
      f.rotation.y = -a + Math.PI / 2;
      g.add(f);
    }
  }
  K.root.add(g);
  return rootOf(K);
});
