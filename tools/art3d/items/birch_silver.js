// Silver Birch (scenery, 1 x 1, 6 m): the leaf-card tree with a pale, dark-flecked trunk and a light crown.
import { sceneryItem, rootOf } from './scenery.js';
import { THREE } from './common.js';

function birchBark() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e7e3da'; g.fillRect(0, 0, 64, 256);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#2b2622';
  for (let i = 0; i < 40; i++) g.fillRect(r() * 64, r() * 256, 4 + r() * 18, 1 + r() * 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
}

export default sceneryItem('birch_silver', (K) => {
  const tree = K.tree(0, 0, 6, 32, 1.7);
  const bark = birchBark();
  tree.traverse((o) => { if (o.isMesh && o.material === K.mat.bark) o.material = bark; });
  return rootOf(K);
});
