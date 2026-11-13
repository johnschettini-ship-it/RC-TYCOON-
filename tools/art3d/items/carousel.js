// Carousel (round flat ride, 3 x 3 tiles): the round 7 carousel rebuilt so it repeats every 72 degrees (10 outer
// horses in two alternating designs, 5 inner horses, every ring, rib, stripe and bulb count a divisor of 72 degrees),
// so 16 pictures 4.5 degrees apart show every angle the game asks for, and, being round, one set serves all four
// view turns (rot 'all'; a turn only shifts the phase). Scaled to fit its 12 m footprint.
import { THREE, kit, placeOnFootprint, fitScale, bakeObject, rideKeys } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { person, randomLook } from '../people.js';

const R = 5.8;
const PERIOD = (Math.PI * 2) / 5; // 72 degrees
const STEPS = 16; // pictures per period (4.5 degrees apart)

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const base = M(new THREE.CylinderGeometry(R + 0.45, R + 0.55, 0.3, 72), mat.concrete);
  base.position.y = 0.15;
  root.add(base);
  const spin = new THREE.Group();
  root.add(spin);
  const floor = M(new THREE.CylinderGeometry(R, R, 0.22, 80), [mat.cream, mat.deck, mat.cream]);
  floor.position.y = 0.41;
  { const ug = floor.geometry, uv = ug.attributes.uv, p = ug.attributes.position; for (let i = 0; i < uv.count; i++) if (p.getY(i) > 0.1) uv.setXY(i, p.getX(i) / 1.5, p.getZ(i) / 1.5); }
  spin.add(floor);
  const FY = 0.52;
  spin.add(M(new THREE.CylinderGeometry(1.25, 1.25, 3.7, 40), mat.cream).translateY(FY + 1.85));
  const panels = M(new THREE.CylinderGeometry(1.27, 1.27, 1.8, 20, 1, true), std({ color: '#7a1c22', roughness: 0.4, metalness: 0.2 }));
  panels.position.y = FY + 1.9;
  spin.add(panels);
  spin.add(M(new THREE.CylinderGeometry(1.32, 1.32, 0.12, 40), mat.brass).translateY(FY + 1.0));
  spin.add(M(new THREE.CylinderGeometry(1.32, 1.32, 0.12, 40), mat.brass).translateY(FY + 2.85));
  const roofY = FY + 3.75;
  const cone = M(new THREE.ConeGeometry(R + 0.36, 2.4, 80, 4, true), mat.roofStripes);
  cone.position.y = roofY + 1.2;
  spin.add(cone);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    spin.add(rod(V(Math.cos(a) * (R + 0.4), roofY, Math.sin(a) * (R + 0.4)), V(0, roofY + 2.42, 0), 0.035, mat.brass, 6));
  }
  const val = M(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 0.75, 80, 1, true), mat.valance);
  val.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * 3; });
  val.position.y = roofY - 0.3;
  spin.add(val);
  spin.add(M(new THREE.TorusGeometry(R + 0.42, 0.06, 8, 80), mat.brass).rotateX(Math.PI / 2).translateZ(-(roofY + 0.06)));
  spin.add(M(new THREE.SphereGeometry(0.28, 20, 12), mat.brass).translateY(roofY + 2.55));
  spin.add(M(new THREE.ConeGeometry(0.12, 0.6, 20), mat.brass).translateY(roofY + 3.0));
  spin.add(M(new THREE.CylinderGeometry(R + 0.38, R + 0.38, 0.06, 80), mat.cream).translateY(roofY));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), K.ringBulb, 80);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 80; i++) { const a = (i / 80) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * (R + 0.47), roofY + 0.08, Math.sin(a) * (R + 0.47)); bulbs.setMatrixAt(i, m4); }
  spin.add(bulbs);
  const bulbs2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), K.ringBulb, 40);
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * 1.34, FY + 2.95, Math.sin(a) * 1.34); bulbs2.setMatrixAt(i, m4); }
  spin.add(bulbs2);

  // horses: [ring radius, count, designs]; the lift follows the horse's angle (period 72 degrees)
  const designs = [['#f4f1ea', '#b8202a'], ['#8a5a36', '#1f6f5c'], ['#2b2522', '#d8a32c']];
  const horses = [];
  const riders = [];
  const riderLooks = [
    randomLook(401, { child: true, female: true, balloon: null, backpack: null, bag: null }),
    randomLook(408, { child: false, female: false, balloon: null, backpack: null, bag: null }),
    randomLook(415, { child: true, female: false, balloon: null, backpack: null, bag: null }),
  ];
  for (const [ring, count, off] of [[4.6, 10, 0], [3.1, 5, PERIOD / 4]]) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + off;
      const px = Math.cos(a) * ring, pz = Math.sin(a) * ring;
      spin.add(rod(V(px, FY, pz), V(px, roofY, pz), 0.035, mat.brass, 8));
      const d = count === 10 ? i % 2 : 2;
      const hg = K.horse(designs[d][0], designs[d][1], d);
      hg.position.set(px, FY + 0.95 + 0.25 * Math.sin(5 * a), pz);
      hg.rotation.y = -a;
      spin.add(hg);
      horses.push(hg);
      const p = person(riderLooks[d], { kind: 'horse' });
      p.position.set(0, hg.userData.seatY, -0.06);
      hg.add(p);
      riders.push(p);
    }
  }
  const s = fitScale(R + 0.55, 3, 0.12);
  root.scale.setScalar(s);
  return { root, spin, riders, scale: s };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    // picture id = index of the angle inside one 72 degree period
    const pick = (a, _s, full) => `${Math.round((((a / 32) * Math.PI * 2) % PERIOD) / (PERIOD / STEPS)) % STEPS}:${full ? 1 : 0}`;
    const groups = rideKeys('carousel', [0], pick);
    const pictures = [...groups.entries()].map(([id, g]) => {
      const p = Number(id.split(':')[0]);
      return { keys: g.keys, pose: () => { m.spin.rotation.y = (p * PERIOD) / STEPS; for (const r of m.riders) r.visible = g.full; } };
    });
    B.log(`carousel: scale ${m.scale.toFixed(3)}, ${pictures.length} pictures`);
    bakeObject(B, { kind: 'ride', item: 'carousel', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
