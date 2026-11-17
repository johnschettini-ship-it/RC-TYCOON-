// Carousel Deluxe (chill flat ride, 4 x 4 tiles = 16 x 16 m, 14 m): a two-level carousel. On the lower deck an outer
// ring of 6 horses and 6 gilded two-seat carriages in turn and an inner ring of 6 horses; a mirrored drum (with the
// stair inside) carries the upper deck at 4.6 m, gilt-edged and railed, with 12 horses in two coats; brass poles
// everywhere, bulb rings under both eaves, a royal-blue and cream striped canopy with a scalloped valance, a gilded
// cupola and a finial. Every ring, stripe, rail and bulb count repeats every 60 degrees and the horses rise and fall
// 6 times a turn (items/ridesB.js deluxeStep), so 8 pictures 7.5 degrees apart show every angle the game asks for
// (the game's even slots are 22.5 degrees apart: 3 steps), and an empty ride rests on one picture. Round: rot 'all'.
// Colour part: the canopy, the blue stripes of its cone, valance and cupola (the cream stripes keep theirs); base #2f6fb5.
import { THREE, kit, placeOnFootprint, fitScale, bakeObject, colourPart, partMask } from './common.js';
import { d2Api } from './flatRides.js';
import { M, V, rod, std } from '../kit.js';
import { person, randomLook } from '../people.js';
import { stripes, stripesMask } from '../textures.js';
import { deluxeKeys, DELUXE } from './ridesB.js';

/** The canopy's royal blue (#2f6fb5, the kit's steel blue). */
const BASE_COLOUR = '#2f6fb5';
const R = 7.3; // lower floor
const FY = 0.55; // lower floor top
const DECK = 4.6; // upper deck top
const ROOF = 8.8; // eaves

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  root.add(M(new THREE.CylinderGeometry(R + 0.45, R + 0.55, 0.3, 96), mat.concrete).translateY(0.15));
  const spin = new THREE.Group();
  root.add(spin);
  // floors: the deck boards laid flat (planar UVs on the top face, as the carousel's floor)
  const floor = (r, h, y) => {
    const m = M(new THREE.CylinderGeometry(r, r, h, 96), [mat.cream, mat.deck, mat.cream]);
    const g = m.geometry, uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) if (p.getY(i) > h / 2 - 1e-6) uv.setXY(i, p.getX(i) / 1.5, p.getZ(i) / 1.5);
    m.position.y = y;
    return m;
  };
  spin.add(floor(R, 0.25, 0.42));
  spin.add(M(new THREE.TorusGeometry(R, 0.06, 8, 96), mat.brass).rotateX(Math.PI / 2).translateZ(-0.55));
  const mirror = new THREE.MeshPhysicalMaterial({ color: '#c8d8e6', metalness: 0.9, roughness: 0.12, clearcoat: 1 });
  const navy = std({ color: '#22345a', roughness: 0.45, metalness: 0.2 });
  // the drum to the upper deck: mirror panels between gilded pilasters (12)
  spin.add(M(new THREE.CylinderGeometry(2.0, 2.0, DECK - FY, 48, 1, true), mirror).translateY((FY + DECK) / 2));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; spin.add(M(new THREE.BoxGeometry(0.16, DECK - FY, 0.16), mat.brass).translateX(Math.cos(a) * 2.02).translateY((FY + DECK) / 2).translateZ(Math.sin(a) * 2.02)); }
  // the upper deck: a floor, its gilt edge and a cream fascia with bulbs, a rail of 48 posts
  spin.add(floor(6.9, 0.3, DECK - 0.15));
  spin.add(M(new THREE.CylinderGeometry(6.95, 6.95, 0.5, 96, 1, true), navy).translateY(DECK - 0.4));
  spin.add(M(new THREE.TorusGeometry(6.95, 0.05, 8, 96), mat.brass).rotateX(Math.PI / 2).translateZ(-(DECK - 0.15)));
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; spin.add(rod(V(Math.cos(a) * 6.75, DECK, Math.sin(a) * 6.75), V(Math.cos(a) * 6.75, DECK + 0.9, Math.sin(a) * 6.75), 0.025, mat.brass, 5)); }
  spin.add(M(new THREE.TorusGeometry(6.75, 0.035, 6, 96), mat.brass).rotateX(Math.PI / 2).translateZ(-(DECK + 0.9)));
  spin.add(M(new THREE.CylinderGeometry(1.6, 1.6, ROOF - DECK, 48), navy).translateY((DECK + ROOF) / 2));
  // the canopy (colour part): a striped cone, a scalloped valance, a cupola and finial
  const coneMat = colourPart(std({ map: stripes(BASE_COLOUR, '#f2ead6', 48, false).map, roughness: 0.6, side: THREE.DoubleSide }), stripesMask(48, false));
  const valMat = colourPart(std({ map: stripes(BASE_COLOUR, '#f2ead6', 24, true).map, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide }), stripesMask(24, true));
  spin.add(M(new THREE.ConeGeometry(R + 0.3, 1.9, 96, 2, true), coneMat).translateY(ROOF + 0.95));
  const val = M(new THREE.CylinderGeometry(R + 0.32, R + 0.32, 0.7, 96, 1, true), valMat);
  val.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * 4; });
  val.position.y = ROOF - 0.3;
  spin.add(val);
  spin.add(M(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.06, 96), mat.cream).translateY(ROOF));
  spin.add(M(new THREE.CylinderGeometry(1.0, 1.1, 0.8, 24), mat.brass).translateY(ROOF + 2.1));
  spin.add(M(new THREE.ConeGeometry(1.2, 0.8, 48, 1, true), coneMat).translateY(ROOF + 2.9));
  spin.add(M(new THREE.SphereGeometry(0.2, 16, 10), mat.gold).translateY(ROOF + 3.4));
  spin.add(M(new THREE.ConeGeometry(0.08, 0.5, 12), mat.gold).translateY(ROOF + 3.75));
  const bulbRing = (r, y, n) => {
    const b = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), K.ringBulb, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r); b.setMatrixAt(i, m4); }
    spin.add(b);
  };
  bulbRing(R + 0.38, ROOF + 0.05, 96);
  bulbRing(6.98, DECK - 0.62, 96);
  // horses, carriages and their riders: one design per place in the 60 degree pattern
  const looks = [401, 408, 415, 422, 429, 436, 443].map((s, i) => randomLook(s, { child: i % 3 === 0, balloon: null, backpack: null, bag: null }));
  const riders = [];
  const horses = []; // { g, a, base }: bobs with its world angle
  const addHorse = (r, a, y0, top, coat, saddle, look) => {
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    spin.add(rod(V(px, y0, pz), V(px, top, pz), 0.035, mat.brass, 8));
    const hg = K.horse(coat, saddle, 1);
    hg.position.set(px, 0, pz);
    hg.rotation.y = -a;
    spin.add(hg);
    horses.push({ g: hg, a, base: y0 + 0.95 });
    const p = person(look, { kind: 'horse' });
    p.position.set(0, hg.userData.seatY, -0.06);
    hg.add(p);
    riders.push(p);
  };
  const carMat = new THREE.MeshPhysicalMaterial({ color: '#7a2a4a', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const addCarriage = (r, a) => {
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, FY, Math.sin(a) * r);
    g.rotation.y = -a;
    spin.add(g);
    g.add(M(new THREE.BoxGeometry(0.9, 0.5, 1.5), carMat).translateY(0.3));
    for (const s of [-1, 1]) g.add(M(new THREE.BoxGeometry(0.9, 0.9, 0.1), carMat).translateY(0.55).translateZ(s * 0.72));
    g.add(M(new THREE.BoxGeometry(0.94, 0.06, 1.54), mat.brass).translateY(0.56));
    g.add(M(new THREE.SphereGeometry(0.12, 12, 8), mat.gold).translateY(1.1).translateZ(0.72));
    for (const [s, li] of [[-1, 3], [1, 4]]) {
      const p = person(looks[li], { kind: 'sit' });
      p.position.set(0, 0.5, s * 0.35);
      p.rotation.y = s > 0 ? Math.PI : 0;
      g.add(p);
      riders.push(p);
    }
  };
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (i % 2 === 0) addHorse(6.3, a, FY, DECK - 0.3, '#f4f1ea', '#b8202a', looks[0]);
    else addCarriage(6.3, a);
  }
  for (let i = 0; i < 6; i++) addHorse(4.2, (i / 6) * Math.PI * 2 + Math.PI / 6, FY, DECK - 0.3, '#c9a46a', '#1f6f5c', looks[1]);
  for (let i = 0; i < 12; i++) {
    const d = i % 2;
    addHorse(5.0, (i / 12) * Math.PI * 2 + Math.PI / 12, DECK, ROOF, d ? '#2b2522' : '#f4f1ea', d ? '#d8a32c' : '#2f6fb5', looks[5 + d]);
  }
  const s = fitScale(R + 0.55, 4, 0.12);
  root.scale.setScalar(s);
  const pose = (step, full) => {
    const th = step * DELUXE.step;
    spin.rotation.y = th;
    for (const h of horses) h.g.position.y = h.base + 0.22 * Math.sin(6 * (h.a - th));
    for (const r of riders) r.visible = full;
  };
  return { root, pose, scale: s };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = deluxeKeys();
    const pictures = [...groups.entries()].map(([id, gr]) => ({ keys: gr.keys, keys2: gr.keys2, pose: () => m.pose(id === 'rest' ? 0 : Number(id.slice(1)), gr.full) }));
    B.log(`carousel_deluxe: scale ${m.scale.toFixed(3)}, ${pictures.length} pictures`);
    bakeObject(d2Api(B, pictures), { kind: 'ride', item: 'carousel_deluxe', model: m.root, rots: 'all', place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
