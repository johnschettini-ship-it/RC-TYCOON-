// Thunder Disc (thrill ride, 4 x 4 tiles, 10.5 m): a steel U-track 13.2 m long on A-frame trestles, rising from the
// boarding platform at its low middle to 8 m at both ends, and a round disc of twelve outward-facing seats (red and
// yellow, over-the-shoulder restraints) that rolls along the U and spins: as today's look, the disc swings out and
// back once per cycle (l = 5.2 m * sin) and turns three times; it rides on the track, so it tilts with the slope.
// Lightning-bolt signs on masts at both ends. Frames: arenaKeys.thunderKeys (16 time steps per cycle, 2 per picture;
// the empty ride is one rest picture at the bottom). The track runs along x, the platform steps face +z: rots [0..3].
import { THREE, placeOnFootprint, bakeObject, kit } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { person, randomLook } from '../people.js';
import { painted, gloss, slab, bulbs } from './arenaKit.js';
import { thunderKeys, THUNDER_PICS, stepOf } from './arenaKeys.js';

const END = 6.6; // track half-length (today: 1.65 tiles)
const RISE = 6.9; // track rise from the middle to the ends
const BASE_Y = 1.15; // track surface at the middle
const GAUGE = 1.8; // rail half-spacing
const SWING = 5.2; // the disc's travel each way (today: 1.3 tiles)
const DISC_R = 2.3;
const SEATS = 12;
const TAU = Math.PI * 2;

const trackY = (l) => BASE_Y + RISE * (l / END) ** 2;
const slope = (l) => (2 * RISE * l) / (END * END);

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const red = painted('#c8321f');
  const orange = painted('#ee7a22');
  const yellow = painted('#f5c530');
  const dark = mat.darkSteel;
  // plinth under the track and the boarding platform
  root.add(slab(15.2, 0.25, 6.6, mat.concrete, 0, 0, 0));
  root.add(slab(5.2, 0.55, 7.4, mat.concrete, 0, 0, 0.2));
  root.add(slab(5.0, 0.06, 7.2, painted('#8a8d90', { metalness: 0.1, roughness: 0.8, clearcoat: 0 }), 0, 0.55, 0.2));
  // steps down to the entrance side (+z)
  for (let k = 0; k < 3; k++) root.add(slab(2.2, 0.18 * (k + 1), 0.35, mat.concrete, 0, 0, 3.9 + (2 - k) * 0.35));
  // platform railings, open at the steps and at the disc's path
  const rail = painted('#e9e6df');
  for (const sz of [-1, 1]) {
    const z = sz * 3.6 + 0.2;
    for (const sx of [-1, 1]) {
      if (sz > 0) {
        root.add(rod(V(sx * 1.2, 1.6, z), V(sx * 2.5, 1.6, z), 0.035, rail, 8));
        for (const x of [1.2, 1.85, 2.5]) root.add(rod(V(sx * x, 0.6, z), V(sx * x, 1.6, z), 0.03, rail, 6));
      } else {
        root.add(rod(V(-2.5, 1.6, z), V(2.5, 1.6, z), 0.035, rail, 8));
        for (let k = 0; k <= 4; k++) root.add(rod(V(-2.5 + k * 1.25, 0.6, z), V(-2.5 + k * 1.25, 1.6, z), 0.03, rail, 6));
      }
    }
  }
  // the U-track: two box-girder rails, cross ties, and trestles
  const N = 48;
  const pts = (c) => Array.from({ length: N + 1 }, (_, i) => { const l = -END + (2 * END * i) / N; return V(l, trackY(l), c); });
  for (const c of [-GAUGE, GAUGE]) {
    const curve = new THREE.CatmullRomCurve3(pts(c));
    const shape = new THREE.Shape();
    shape.moveTo(-0.16, -0.26); shape.lineTo(0.16, -0.26); shape.lineTo(0.16, 0); shape.lineTo(-0.16, 0); shape.lineTo(-0.16, -0.26);
    const g = new THREE.ExtrudeGeometry(shape, { steps: 96, bevelEnabled: false, extrudePath: curve });
    root.add(M(g, red));
    // running rail on top
    root.add(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts(c).map((p) => p.clone().setY(p.y + 0.05))), 96, 0.06, 8), mat.stainless));
  }
  for (let i = 0; i <= 12; i++) {
    const l = -END + (2 * END * i) / 12;
    const y = trackY(l) - 0.16;
    root.add(rod(V(l, y, -GAUGE), V(l, y, GAUGE), 0.07, orange, 8));
  }
  // trestles: A-frames under both rails, braced across
  for (const l of [-6.2, -4.6, -3.0, 3.0, 4.6, 6.2]) {
    const y = trackY(l) - 0.26;
    for (const c of [-GAUGE, GAUGE]) {
      const out = Math.sign(c) * 0.9;
      root.add(rod(V(l - 0.5, 0.25, c + out), V(l, y, c), 0.13, yellow, 10));
      root.add(rod(V(l + 0.5, 0.25, c + out), V(l, y, c), 0.13, yellow, 10));
      root.add(slab(1.6, 0.06, 0.6, dark, l, 0.25, c + out));
    }
    root.add(rod(V(l, y * 0.55, -GAUGE - 0.45), V(l, y * 0.55, GAUGE + 0.45), 0.07, yellow, 8));
  }
  // end buffers and the lightning signs on masts
  const bolt = new THREE.Shape();
  [[-0.25, 1.1], [0.55, 1.1], [0.12, 0.25], [0.6, 0.25], [-0.45, -1.1], [-0.08, -0.1], [-0.6, -0.1]].forEach(([x, y], i) => (i ? bolt.lineTo(x, y) : bolt.moveTo(x, y)));
  const boltGeo = new THREE.ExtrudeGeometry(bolt, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  const boltMat = std({ color: '#ffd84a', emissive: '#ffb020', emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const l = s * (END + 0.05);
    const y = trackY(END);
    root.add(slab(0.5, 0.8, GAUGE * 2 + 0.5, dark, l + s * 0.15, y - 0.5, 0));
    root.add(rod(V(l + s * 0.35, 0.25, 0), V(l + s * 0.35, y + 1.2, 0), 0.1, red, 10));
    const b = M(boltGeo, boltMat);
    b.position.set(l + s * 0.35, y + 1.85, -0.09);
    b.scale.setScalar(1.05);
    root.add(b);
  }
  // control booth on the platform's far side
  const booth = new THREE.Group();
  booth.add(slab(1.4, 1.1, 1.2, painted('#f4efe2'), 0, 0, 0));
  booth.add(slab(1.4, 1.0, 1.2, mat.glass, 0, 1.1, 0));
  for (const [x, z] of [[-0.68, -0.58], [0.68, -0.58], [-0.68, 0.58], [0.68, 0.58]]) booth.add(slab(0.06, 1.0, 0.06, red, x, 1.1, z));
  booth.add(slab(1.6, 0.12, 1.4, red, 0, 2.1, 0));
  booth.position.set(-2.0, 0.61, -2.9);
  root.add(booth);

  // the disc: a carriage (bogie on the rails) under a turning seat ring
  const disc = new THREE.Group(); // along the track: position + tilt
  root.add(disc);
  disc.add(slab(1.3, 0.3, GAUGE * 2 + 0.3, dark, 0, 0.0, 0));
  for (const c of [-GAUGE, GAUGE]) for (const dx of [-0.5, 0.5]) {
    const w = M(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 16), std({ color: '#222', roughness: 0.6 }));
    w.rotation.x = Math.PI / 2; w.position.set(dx, 0.15, c); disc.add(w);
  }
  disc.add(M(new THREE.CylinderGeometry(0.55, 0.7, 0.55, 24), red).translateY(0.55));
  const spin = new THREE.Group();
  spin.position.y = 0.85;
  disc.add(spin);
  spin.add(M(new THREE.CylinderGeometry(DISC_R, DISC_R - 0.1, 0.22, 48), orange));
  spin.add(M(new THREE.CylinderGeometry(DISC_R - 0.15, DISC_R - 0.15, 0.03, 48), std({ color: '#3a3d42', roughness: 0.8 })).translateY(0.12));
  spin.add(M(new THREE.TorusGeometry(DISC_R, 0.06, 8, 64), yellow).rotateX(Math.PI / 2).translateZ(-0.05));
  // centre crown: a drum with bulbs and a lightning finial
  spin.add(M(new THREE.CylinderGeometry(0.75, 0.9, 0.9, 32), red).translateY(0.55));
  spin.add(M(new THREE.CylinderGeometry(0.55, 0.75, 0.35, 32), yellow).translateY(1.15));
  const cp = [];
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; cp.push([Math.cos(a) * 0.86, 0.75, Math.sin(a) * 0.86]); }
  spin.add(bulbs(cp, K.ringBulb, 0.05));
  const fin = M(boltGeo, boltMat);
  fin.scale.setScalar(0.45); fin.position.set(0, 1.85, -0.03);
  spin.add(fin);
  const seatMats = [gloss('#d7322b'), gloss('#f2c230')];
  const looks = Array.from({ length: SEATS }, (_, i) => randomLook(930 + i * 5, { balloon: null, backpack: null, bag: null, child: false }));
  const riders = [];
  for (let i = 0; i < SEATS; i++) {
    const a = (i / SEATS) * TAU;
    const seat = new THREE.Group();
    seat.position.set(Math.cos(a) * (DISC_R - 0.55), 0.11, Math.sin(a) * (DISC_R - 0.55));
    seat.rotation.y = Math.PI / 2 - a; // local +z faces outward
    spin.add(seat);
    const sm = seatMats[i % 2];
    seat.add(slab(0.55, 0.42, 0.5, sm, 0, 0, 0));
    const back = slab(0.55, 0.95, 0.14, sm, 0, 0.3, -0.27);
    seat.add(back);
    seat.add(M(new THREE.SphereGeometry(0.16, 12, 8), sm).translateY(1.25).translateZ(-0.27));
    // over-the-shoulder restraint (a dark padded U), down when riding
    const bar = new THREE.Group();
    bar.position.set(0, 1.15, -0.2);
    for (const s of [-1, 1]) bar.add(rod(V(s * 0.2, 0, 0), V(s * 0.2, -0.45, 0.32), 0.05, mat.seat, 8));
    bar.add(rod(V(-0.2, -0.45, 0.32), V(0.2, -0.45, 0.32), 0.06, mat.seat, 8));
    seat.add(bar);
    seat.add(slab(0.5, 0.2, 0.08, dark, 0, 0.05, 0.3));
    const p = person(looks[i], { kind: 'sit' });
    p.position.set(0, 0.42, -0.08);
    seat.add(p);
    riders.push(p);
  }
  const pose = (t, full) => {
    const l = SWING * Math.sin(TAU * t);
    disc.position.set(l, trackY(l) + 0.15, 0);
    disc.rotation.z = Math.atan(slope(l));
    spin.rotation.y = -TAU * 3 * t;
    for (const r of riders) r.visible = full;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const groups = thunderKeys();
    const pictures = [...groups.entries()].map(([id, g]) => {
      const s = stepOf(id, THUNDER_PICS);
      return { keys: g.keys, pose: () => m.pose(s.t, s.full) };
    });
    B.log(`thunder_disc: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'thunder_disc', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures });
  },
};
