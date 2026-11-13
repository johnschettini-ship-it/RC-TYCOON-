// Round 7 scene registry: X pier, Y forest, Z city, AA winter, and G (guest line-up close-up).
import * as THREE from 'three';
import { makeKit, M, V, std } from './kit.js';
import { buildPier } from './scene-pier.js';
import { buildForest } from './scene-forest.js';
import { buildCity } from './scene-city.js';
import { buildWinter } from './scene-winter.js';

// 12 guests in a row on a pale floor, plus one carousel horse with its rider, for judging the people up close
function buildLineup(variant) {
  const K = makeKit(variant);
  const { root, mat } = K;
  const floor = M(new THREE.PlaneGeometry(40, 40), std({ color: '#d9dcd8', roughness: 0.9 }), false, true);
  floor.rotation.x = -Math.PI / 2; root.add(floor);
  // the camera looks from +x+z; line the guests up across the screen (along x - z), facing the camera
  const face = Math.PI / 4;
  const ax = V(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const at = (t) => ax.clone().multiplyScalar(t);
  const list = [
    [11, { kind: 'stand' }, { female: false, hairStyle: 'short', hat: 'cap', bottomType: 'shorts', backpack: '#2b3a55' }],
    [12, { kind: 'wave' }, { female: true, hairStyle: 'long', bottomType: 'dress', top: '#e98fb0', hat: 'sunhat', hatColor: '#e8d9b0' }],
    [13, { kind: 'stand' }, { child: true, female: true, hairStyle: 'pigtails', bottomType: 'skirt', h: 1.12, balloon: '#e2312b' }],
    [14, { kind: 'eat', item: 'cone' }, { female: false, hairStyle: 'afro', bottomType: 'trousers', skin: '#5c3a26' }],
    [15, { kind: 'stand', phase: 0.15 }, { female: true, hairStyle: 'bun', age: 2, hair: '#c9c4bd', bottomType: 'trousers', bag: '#7b5a3c' }],
    [16, { kind: 'walk', phase: 1.2 }, { child: true, female: false, hairStyle: 'curly', bottomType: 'shorts', hat: 'bucket', h: 1.3 }],
    [17, { kind: 'stand' }, { female: false, hairStyle: 'bald', age: 2, bottomType: 'trousers', sleeves: 'long' }],
    [18, { kind: 'point' }, { female: true, hairStyle: 'pony', bottomType: 'shorts', top: '#2f5fa5', sleeves: 'none' }],
    [19, { kind: 'stand', phase: 0.15 }, { season: 'winter', female: true, hairStyle: 'long', scarf: '#c8372d', hat: 'beanie' }],
    [20, { kind: 'stand' }, { season: 'winter', female: false, hairStyle: 'short', hat: 'beanie', gloves: '#2a2a2a', child: false }],
    [21, { kind: 'stand' }, { child: true, female: false, hairStyle: 'crop', bottomType: 'trousers', h: 1.02, season: 'winter', hat: 'beanie' }],
    [22, { kind: 'eat', item: 'floss' }, { female: true, hairStyle: 'curly', bottomType: 'skirt', skin: '#8e5a3a', hat: null }],
  ];
  // two rows: six behind (2.8 m further from the camera), six in front plus the horse
  const dep = V(-Math.SQRT1_2, 0, -Math.SQRT1_2);
  const place = (t, d) => at(t).addScaledVector(dep, d);
  list.forEach(([seed, pose, look], i) => {
    const p = K.guest(seed, 0, 0, face, pose, look, 0);
    p.position.copy(i < 6 ? place(-2.75 + i * 0.95, 2.8) : place(-3.25 + (i - 6) * 0.86, 0));
  });
  const hg = K.horse('#f4f1ea', '#2f5fa5', 3);
  const hp = place(2.3, 0); hg.position.set(hp.x, 0.95, hp.z); root.add(hg);
  hg.rotation.y = Math.PI / 2 + Math.PI / 4 - 0.35; // nearly side-on to the camera, nose to screen right
  root.add(rodY(hg.position.x, hg.position.z, 0, 2.6, mat.brass));
  const rider = K.guest(31, 0, 0, 0, { kind: 'horse' }, { child: true, female: true, hairStyle: 'pony', balloon: null }, 0);
  root.remove(rider); rider.position.set(0, hg.userData.seatY, -0.06); hg.add(rider);
  const base = M(new THREE.CylinderGeometry(0.3, 0.35, 0.08, 24), mat.brass); base.position.set(hg.position.x, 0.04, hg.position.z); root.add(base);
  return { root, lights: K.lights, lightMats: K.lightMats, guests: K.guests, extent: 8 };
}
function rodY(x, z, y0, y1, m) { const r = M(new THREE.CylinderGeometry(0.035, 0.035, y1 - y0, 10), m); r.position.set(x, (y0 + y1) / 2, z); return r; }

export const SCENES = { pier: buildPier, forest: buildForest, city: buildCity, winter: buildWinter, lineup: buildLineup };
