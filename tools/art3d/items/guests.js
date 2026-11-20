// Guests (stage 1, spec §6 / plan F6 subset): 2 body types (b0 man, b1 woman) x 4 outfits, 4 facings (the game moves
// guests in 4 directions), standing, two opposite strides and a sitting pose. Set guest:b<B>o<O>, rot 'all' (facings
// are view directions), frames [`f<facing 0-3>`, `w0` (stand) | `w1` | `w2` (opposite strides) | `sit`]: only the
// frames the reader (look.ts `guest`) asks for, so no decoded byte is spent on unused pictures. Anchor: the feet point
// (renderer.ts collectGuests: the guest's interpolated map position at its height); a sitter's anchor is the seat's
// ground point, the body sits 0.47 m up (on the bench drawn under it). Shirts are baked light grey and marked in the
// mask so the game tints them to its 12 shirt colours. Each walking or standing picture carries its own soft shadow.
//
// The model (owner feedback 2026-11-20, "too blocky"): a soft, rounded figure of its own, built here rather than with
// people.js `person` (that one stays for the riders baked into ride pictures, and is in every item's cache key).
// Round head with a face hint and rounded hair volumes, a capsule-like lathe torso with sloping shoulders, thick
// tapered limbs whose joints meet at equal radii (no elbow or knee balls), mitten hands and rounded shoes, all smooth
// shaded. The head is a little larger than true proportion so a guest still reads at game zoom 1.
import { THREE, frameKey } from './common.js';
import { randomLook } from '../people.js';

const SHIRT = '#ededed';
const BODIES = [
  // b0: men
  [
    { female: false, child: false, hairStyle: 'short', bottomType: 'trousers', bottom: '#2c3a55', sleeves: 'short', skin: '#eac2a2', hair: '#2c1f17', hat: null },
    { female: false, child: false, hairStyle: 'crop', bottomType: 'shorts', bottom: '#b9ad92', sleeves: 'short', skin: '#8e5a3a', hair: '#1b1512', hat: 'cap', hatColor: '#1f2f4f' },
    { female: false, child: false, hairStyle: 'side', bottomType: 'trousers', bottom: '#1f1f22', sleeves: 'long', skin: '#dcaa84', hair: '#93602f', hat: null, backpack: '#3f4a2a' },
    { female: false, child: false, age: 2, hairStyle: 'short', bottomType: 'trousers', bottom: '#6b6f75', sleeves: 'short', skin: '#ecc9ae', hair: '#c9c4bd', hat: 'bucket', hatColor: '#e8d9b0' },
  ],
  // b1: women
  [
    { female: true, child: false, hairStyle: 'long', bottomType: 'trousers', bottom: '#3c4f74', sleeves: 'short', skin: '#ecc9ae', hair: '#6b4428', hat: null },
    { female: true, child: false, hairStyle: 'pony', bottomType: 'shorts', bottom: '#22324f', sleeves: 'none', skin: '#c99068', hair: '#1b1512', hat: null, bag: '#7b5a3c' },
    { female: true, child: false, hairStyle: 'bun', bottomType: 'skirt', bottom: '#4a5a3a', sleeves: 'short', skin: '#6e4329', hair: '#1b1512', hat: null },
    { female: true, child: false, hairStyle: 'bob', bottomType: 'trousers', bottom: '#5d6f8f', sleeves: 'long', skin: '#eac2a2', hair: '#dcc596', hat: 'sunhat', hatColor: '#d9b46a' },
  ],
];
// facing (view dir: 0 N = -y, 1 E = +x, 2 S = +y, 3 W = -x) -> rotation.y (a guest faces +z at 0)
const YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
const isShirt = (mesh) => !Array.isArray(mesh.material) && mesh.material.color && `#${mesh.material.color.getHexString()}` === SHIRT;

// ---- soft guest model ------------------------------------------------------------------------------------------
const mats = new Map();
function mat(color, rough = 0.8) {
  const key = `${color}/${rough}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return mats.get(key);
}
const geos = new Map();
const cached = (k, fn) => { if (!geos.has(k)) geos.set(k, fn()); return geos.get(k); };
const f4 = (v) => v.toFixed(4);
const sphere = (r, w = 20, hs = 14) => cached(`s${f4(r)}_${w}_${hs}`, () => new THREE.SphereGeometry(r, w, hs));
const capsule = (r, len) => cached(`c${f4(r)}_${f4(len)}`, () => new THREE.CapsuleGeometry(r, len, 6, 16));
// lathe profile [[radius, y], ...] -> a smooth round solid (flattened front-to-back by the caller's scale)
const lathe = (key, pts, seg = 24) => cached(key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0008, r), y)), seg));
// a rounded profile between two radii: smooth caps at both ends, so neighbouring limbs blend at equal radii
function roundLimbGeo(len, r0, r1) {
  return cached(`l${f4(len)}_${f4(r0)}_${f4(r1)}`, () => {
    const pts = [];
    const n = 6;
    for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push([Math.sin(a) * r1, -len + r1 * 0.35 - Math.cos(a) * r1 * 0.9]); }
    for (let i = 1; i <= n; i++) { const a = Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push([Math.sin(a) * r0, -r0 * 0.25 - Math.cos(a) * r0 * 0.9]); }
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0008, r), y)), 16);
  });
}

function mesh(geo, m, cast = true) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = cast; o.receiveShadow = true;
  return o;
}
// a tapered limb hanging from a pivot: { pivot, end } (end is a group at the far joint)
function limb(parent, at, len, r0, r1, m, sleeve) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  parent.add(pivot);
  pivot.add(mesh(roundLimbGeo(len, r0, r1), m));
  if (sleeve) {
    const s = mesh(roundLimbGeo(sleeve.len, sleeve.r, sleeve.r * 0.94), sleeve.m);
    s.position.y = r0 * 0.15;
    pivot.add(s);
  }
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

/** A soft, rounded guest. look: people.js randomLook fields; pose: { kind: 'stand' | 'walk' | 'sit', phase }. */
export function softGuest(L, pose = { kind: 'stand' }) {
  const h = L.h, kid = !!L.child;
  const s = h / 1.75;
  const root = new THREE.Group();
  const skin = mat(L.skin, 0.6), hairM = mat(L.hair, 0.55);
  const topM = mat(L.top, 0.85), botM = mat(L.bottom, 0.85), shoeM = mat(L.shoes, 0.55);
  const k = pose.kind;
  const seated = k === 'sit';
  const fw = L.female ? 1 : 0;
  const bw = L.build ?? 1;

  // proportions: a slightly large head (about 1/6.2 of the height) on a soft, short-necked body
  const R = (kid ? 0.122 * Math.pow(h / 1.2, 0.3) : 0.146 * s) * (L.female ? 0.97 : 1);
  const legLen = (kid ? 0.41 : 0.44) * h;
  const thigh = legLen * 0.5, shin = legLen * 0.45;
  const hipY = legLen + 0.01;
  const headC = h - R * 1.03 - hipY;          // head centre above the hip joints
  const T = headC - R * 0.92 - 0.04 * s;      // shoulder line above the hip joints
  const pr = (v) => v * s;

  const hips = new THREE.Group();
  hips.position.y = hipY;
  root.add(hips);
  const torsoG = new THREE.Group(); // leaning pivot
  hips.add(torsoG);
  if (L.age === 2) torsoG.rotation.x = 0.09;

  // pelvis (bottoms colour) and a soft torso (shirt), both lathe profiles, oval in cross-section
  const pelvis = mesh(lathe(`gp${fw}${f4(s)}`, [[pr(0.03), -0.14 * s], [pr(0.1), -0.125 * s], [pr(0.135 + 0.012 * fw), -0.07 * s], [pr(0.142 + 0.012 * fw), 0], [pr(0.132), 0.08 * s]]),
    L.bottomType === 'dress' ? topM : botM);
  pelvis.scale.set(1.18 * bw, 1, 0.86);
  torsoG.add(pelvis);
  const torsoPts = [[pr(0.141 + 0.01 * fw), -0.05 * s], [pr(0.145 + 0.008 * fw), 0.02], [pr(0.136 - 0.014 * fw), T * 0.36], [pr(0.148 - 0.004 * fw), T * 0.6],
    [pr(0.155 - 0.006 * fw), T * 0.78], [pr(0.146 - 0.006 * fw), T * 0.9], [pr(0.118), T * 0.97], [pr(0.075), T * 1.01], [pr(0.03), T * 1.025]];
  const torso = mesh(lathe(`gt${fw}${f4(s)}${f4(T)}`, torsoPts), topM);
  torso.scale.set(1.22 * bw, 1, 0.82 * bw);
  torsoG.add(torso);
  const shoulderX = pr(0.158 - 0.01 * fw) * 1.22 * bw;
  const shoulderY = T * 0.86;
  // sloping shoulder caps in the shirt colour so the arm grows out of the body
  for (const side of [-1, 1]) { const sh = mesh(sphere(pr(0.072)), topM); sh.position.set(side * (shoulderX - pr(0.012)), shoulderY + pr(0.008), 0); sh.scale.set(1, 0.92, 1); torsoG.add(sh); }
  const neck = mesh(capsule(pr(0.05), pr(0.05)), skin);
  neck.position.y = T + 0.02 * s;
  torsoG.add(neck);

  // ---- head: a round skull with a soft chin, a face hint (eyes, nose, smile) and ears
  const head = new THREE.Group();
  head.position.y = headC;
  torsoG.add(head);
  const skull = mesh(sphere(R, 28, 20), skin);
  skull.scale.set(0.94, 1.03, 0.98);
  head.add(skull);
  const chin = mesh(sphere(R * 0.74, 20, 14), skin); chin.position.set(0, -R * 0.32, R * 0.16); chin.scale.set(1.02, 0.88, 0.98); head.add(chin);
  const nose = mesh(sphere(R * 0.14, 10, 8), skin); nose.position.set(0, -R * 0.14, R * 0.95); head.add(nose);
  const eyeM = mat('#241a14', 0.35), mouthM = mat('#8a4238', 0.6);
  for (const side of [-1, 1]) {
    const ear = mesh(sphere(R * 0.2, 10, 8), skin); ear.position.set(side * R * 0.9, -R * 0.06, -R * 0.02); ear.scale.set(0.5, 1, 0.8); head.add(ear);
    const eye = mesh(sphere(R * 0.12, 10, 8), eyeM, false); eye.position.set(side * R * 0.34, R * 0.03, R * 0.86); eye.scale.set(0.85, 1.15, 0.5); head.add(eye);
  }
  const smile = mesh(cached(`sm${f4(R)}`, () => new THREE.TorusGeometry(R * 0.16, R * 0.035, 6, 12, Math.PI)), mouthM, false);
  smile.rotation.z = Math.PI; smile.position.set(0, -R * 0.36, R * 0.9); smile.rotation.x = -0.25; head.add(smile);

  // ---- hair: rounded volumes. Under a hat big styles are tucked in (they would poke through the crown).
  const hs = L.hat && ['curly', 'afro', 'bun', 'side', 'bob'].includes(L.hairStyle) ? 'short' : L.hairStyle;
  const hairCap = (kk = 1.08, tilt = -0.55, cover = 0.56) => {
    const cap = mesh(cached(`ghc${f4(R)}${kk}${cover}`, () => new THREE.SphereGeometry(R * kk, 24, 12, 0, Math.PI * 2, 0, Math.PI * cover)), hairM);
    cap.scale.set(0.97, 1.04, 1.02);
    cap.rotation.x = tilt;
    cap.position.set(0, R * 0.05, -R * 0.04);
    head.add(cap);
    return cap;
  };
  if (hs !== 'bald') {
    if (hs === 'crop') hairCap(1.04, -0.5, 0.5);
    else if (hs === 'curly' || hs === 'afro') {
      const a = mesh(sphere(R * (hs === 'afro' ? 1.25 : 1.12)), hairM); a.position.set(0, R * 0.35, -R * 0.3); a.scale.set(1.04, 0.92, 1); head.add(a);
    } else {
      hairCap();
      if (hs === 'short' || hs === 'side') { // a soft fringe so the hairline is not a hard rim
        const fr = mesh(sphere(R * 0.55), hairM); fr.position.set(hs === 'side' ? R * 0.28 : 0, R * 0.62, R * 0.42); fr.scale.set(hs === 'side' ? 1.4 : 1.25, 0.45, 0.7); head.add(fr);
      }
      if (hs === 'long') {
        const back = mesh(capsule(R * 0.85, R * 1.1), hairM); back.scale.set(1.08, 1, 0.5); back.position.set(0, -R * 0.7, -R * 0.52); head.add(back);
        for (const side of [-1, 1]) { const lock = mesh(capsule(R * 0.27, R * 0.95), hairM); lock.position.set(side * R * 0.82, -R * 0.5, -R * 0.12); lock.rotation.z = side * 0.08; head.add(lock); }
      } else if (hs === 'bun') {
        const bun = mesh(sphere(R * 0.46), hairM); bun.position.set(0, R * 0.8, -R * 0.66); head.add(bun);
      } else if (hs === 'pony') {
        const tie = mesh(sphere(R * 0.3), hairM); tie.position.set(0, R * 0.25, -R * 0.98); head.add(tie);
        const p = mesh(capsule(R * 0.27, R * 0.95), hairM); p.position.set(0, -R * 0.42, -R * 1.12); p.rotation.x = 0.25; head.add(p);
      } else if (hs === 'bob') {
        const b = mesh(sphere(R * 1.16), hairM); b.scale.set(1.04, 0.8, 1.0); b.position.set(0, -R * 0.08, -R * 0.24); head.add(b);
      } else if (hs === 'pigtails') {
        for (const side of [-1, 1]) { const p = mesh(capsule(R * 0.24, R * 0.55), hairM); p.position.set(side * R * 1.02, -R * 0.2, -R * 0.3); p.rotation.z = side * 0.45; head.add(p); }
      }
    }
  }
  if (L.hat) {
    const hm = mat(L.hatColor, 0.8);
    if (L.hat === 'cap') {
      const crown = mesh(cached(`gcap${f4(R)}`, () => new THREE.SphereGeometry(R * 1.1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), hm);
      crown.position.set(0, R * 0.16, -R * 0.03); crown.rotation.x = -0.28; crown.scale.set(0.98, 0.92, 1.02); head.add(crown);
      const brim = mesh(sphere(R * 0.62, 18, 8), hm); brim.scale.set(1.05, 0.1, 0.9); brim.position.set(0, R * 0.42, R * 0.78); brim.rotation.x = 0.22; head.add(brim);
    } else if (L.hat === 'sunhat') {
      const g = mesh(lathe(`gsun${f4(R)}`, [[R * 0.001, R * 1.16], [R * 0.7, R * 1.12], [R * 0.98, R * 0.9], [R * 1.05, R * 0.55], [R * 1.5, R * 0.45], [R * 2.0, R * 0.36], [R * 2.1, R * 0.3], [R * 2.0, R * 0.27], [R * 1.4, R * 0.36], [R * 0.98, R * 0.42]], 28), hm);
      g.rotation.x = -0.12; head.add(g);
      const band = mesh(lathe(`gsunb${f4(R)}`, [[R * 1.04, R * 0.48], [R * 1.07, R * 0.56], [R * 1.04, R * 0.66]], 28), mat('#5a3d2a', 0.7)); band.rotation.x = -0.12; head.add(band);
    } else if (L.hat === 'bucket') {
      const g = mesh(lathe(`gbkt${f4(R)}`, [[R * 0.001, R * 1.18], [R * 0.6, R * 1.16], [R * 0.92, R * 1.04], [R * 1.06, R * 0.6], [R * 1.3, R * 0.34], [R * 1.42, R * 0.24], [R * 1.36, R * 0.2], [R * 1.05, R * 0.34]], 24), hm);
      g.rotation.x = -0.22; g.position.y = -R * 0.04; head.add(g);
    } else if (L.hat === 'beanie') {
      const g = mesh(lathe(`gbean${f4(R)}`, [[R * 0.001, R * 1.3], [R * 0.6, R * 1.24], [R * 0.96, R * 0.95], [R * 1.1, R * 0.55], [R * 1.12, R * 0.3], [R * 1.05, R * 0.22]], 24), hm);
      g.rotation.x = -0.4; head.add(g);
      const pom = mesh(sphere(R * 0.28, 10, 8), mat('#f2f0ea', 1)); pom.position.set(0, R * 1.35, -R * 0.5); head.add(pom);
    }
  }
  // backpack and shoulder bag as soft pillows
  if (L.backpack) {
    const bm = mat(L.backpack, 0.75);
    const bp = mesh(sphere(1, 18, 12), bm); bp.scale.set(0.15 * s, 0.19 * s, 0.085 * s); bp.position.set(0, T * 0.56, -0.13 * s * bw); torsoG.add(bp);
    const pocket = mesh(sphere(1, 14, 10), bm); pocket.scale.set(0.1 * s, 0.07 * s, 0.04 * s); pocket.position.set(0, T * 0.44, -0.2 * s * bw); torsoG.add(pocket);
    for (const side of [-1, 1]) { const st = mesh(capsule(0.014, T * 0.42), mat('#2a2a2a', 0.8)); st.position.set(side * 0.085 * s, T * 0.62, 0.118 * s * bw); st.rotation.x = -0.1; torsoG.add(st); }
  }
  if (L.bag && !seated) {
    const bm = mat(L.bag, 0.6);
    const strap = mesh(capsule(0.012, T * 1.05), bm); strap.position.set(0.02, T * 0.55, 0.115 * s); strap.rotation.z = 0.62; torsoG.add(strap);
    const b = mesh(sphere(1, 16, 10), bm); b.scale.set(0.04, 0.1 * s, 0.12 * s); b.position.set(-shoulderX - 0.035, T * 0.06, 0.02); torsoG.add(b);
  }

  // skirt or dress: a flared lathe below the waist (seated: thighs take the colour instead, so nothing pokes through)
  const skirtLike = L.bottomType === 'skirt' || L.bottomType === 'dress';
  const skirtM = L.bottomType === 'dress' ? topM : botM;
  if (skirtLike && !seated) {
    const sk = mesh(lathe(`gsk${f4(s)}${f4(thigh)}`, [[pr(0.135), 0.06], [pr(0.155), -0.1], [pr(0.19), -thigh * 0.8], [pr(0.2), -thigh * 0.9], [pr(0.18), -thigh * 0.94]], 24), skirtM);
    sk.scale.set(1.08, 1, 0.88); torsoG.add(sk);
  }

  // legs: thick tapered thighs and shins meeting at the same radius at the knee
  const legs = [];
  const hipX = pr(0.082 + 0.006 * fw);
  const kneeR = pr(0.076), ankleR = pr(0.056);
  for (const side of [-1, 1]) {
    const longLeg = L.bottomType === 'trousers';
    const thighM = skirtLike ? (seated ? skirtM : skin) : (longLeg ? botM : skin);
    const shorts = L.bottomType === 'shorts' ? { len: thigh * 0.62, r: pr(0.1), m: botM } : null;
    const up = limb(hips, new THREE.Vector3(side * hipX, -0.03 * s, 0), thigh, pr(0.098), kneeR, thighM, shorts);
    const low = limb(up.end, new THREE.Vector3(0, 0, 0), shin, kneeR, ankleR, longLeg ? botM : skin);
    const shoe = mesh(cached(`gshoe${f4(s)}`, () => {
      const g = new THREE.SphereGeometry(1, 18, 12);
      // flatten the sole: squash the lower half harder than the toe cap
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.45);
      g.computeVertexNormals();
      g.scale(0.064 * s, 0.054 * s, 0.118 * s);
      return g;
    }), shoeM);
    shoe.position.set(0, -0.006, 0.042 * s);
    low.end.add(shoe);
    legs.push({ up, low, side });
  }
  // arms: rounded upper arm and forearm, mitten hands
  const arms = [];
  for (const side of [-1, 1]) {
    const longS = L.sleeves === 'long', none = L.sleeves === 'none';
    const upLen = 0.29 * s, foreLen = 0.25 * s;
    const elbowR = pr(0.051);
    const sleeve = longS || none ? null : { len: 0.14 * s, r: pr(0.072), m: topM };
    const up = limb(torsoG, new THREE.Vector3(side * shoulderX, shoulderY, 0), upLen, pr(0.064), elbowR, longS ? topM : skin, sleeve);
    const low = limb(up.end, new THREE.Vector3(0, 0, 0), foreLen, elbowR, pr(0.043), longS ? topM : skin);
    const hand = mesh(sphere(pr(0.056), 14, 10), skin);
    hand.scale.set(0.8, 1.12, 0.7);
    hand.position.y = -0.03 * s;
    low.end.add(hand);
    up.pivot.rotation.z = side * 0.16;
    arms.push({ up, low, side });
  }

  // ---- pose
  const ph = pose.phase ?? 0;
  if (k === 'walk') {
    const a = Math.sin(ph) * 0.36;
    legs.forEach(({ up, low, side }) => { const sw = a * side; up.pivot.rotation.x = -sw; low.pivot.rotation.x = Math.max(0, sw) * 0.9 + 0.08; });
    arms.forEach(({ up, low, side }) => { up.pivot.rotation.x = a * side * 0.9; low.pivot.rotation.x = -0.25 - Math.max(0, a * side) * 0.4; });
    hips.position.y = hipY - Math.abs(Math.sin(ph)) * 0.012 - 0.02;
    torsoG.rotation.x += 0.04;
  } else if (k === 'stand') {
    legs.forEach(({ up, side }) => { up.pivot.rotation.z = side * 0.04; });
    arms.forEach(({ low }) => { low.pivot.rotation.x = -0.18; });
  } else if (k === 'sit') {
    legs.forEach(({ up, low, side }) => { up.pivot.rotation.x = -1.5; up.pivot.rotation.z = side * 0.06; low.pivot.rotation.x = 1.5; });
    arms.forEach(({ up, low }) => { up.pivot.rotation.x = -0.45; low.pivot.rotation.x = -0.8; });
    hips.position.y = 0; // the caller places the seat
  }
  if (L.balloon && (k === 'walk' || k === 'stand')) {
    const a = arms[1];
    a.up.pivot.rotation.x = -0.5; a.low.pivot.rotation.x = -0.9;
    root.updateMatrixWorld(true);
    const hand = new THREE.Vector3(); a.low.end.getWorldPosition(hand);
    const top = hand.clone().add(new THREE.Vector3(0.1, 1.1, -0.05));
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 4), mat('#dddddd', 0.5));
    string.position.copy(hand).lerp(top, 0.5);
    string.lookAt(top); string.rotateX(Math.PI / 2);
    string.scale.y = hand.distanceTo(top);
    root.add(string);
    const b = new THREE.Mesh(sphere(0.16), new THREE.MeshPhysicalMaterial({ color: L.balloon, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }));
    b.scale.set(1, 1.18, 1); b.position.copy(top).add(new THREE.Vector3(0, 0.17, 0)); b.castShadow = true;
    root.add(b);
  }
  root.userData = { hipY, hips };
  return root;
}

export default {
  bake(B) {
    const bs = B.newScene();
    BODIES.forEach((outfits, b) => outfits.forEach((o, k) => {
      const look = randomLook(900 + b * 10 + k, { balloon: null, backpack: null, bag: null, ...o, top: SHIRT, h: b === 0 ? 1.76 : 1.64, build: 1 });
      const set = B.set('guest', `b${b}o${k}`, 'all', true);
      for (let f = 0; f < 4; f++) {
        // pictures: stand, the two opposite strides, sit. The renderer's walk values 0-2 (Task 8) are w0 = stand and
        // w1 / w2 = the two stride extremes (walk phases pi/2 and -pi/2; the renderer alternates 1 and 2 while a guest
        // walks). Phases 0 and pi, used before, are both mid-stride with the legs together, so walkers never moved
        // their legs. A later 8-frame walk adds its phases here (and to the reader) together.
        const poses = [
          ['stand', ['w0'], { kind: 'stand' }],
          ['w1', ['w1'], { kind: 'walk', phase: Math.PI / 2 }],
          ['w2', ['w2'], { kind: 'walk', phase: -Math.PI / 2 }],
          ['sit', ['sit'], { kind: 'sit' }],
        ];
        for (const [name, keys, pose] of poses) {
          const sit = name === 'sit';
          const p = softGuest(look, pose);
          p.rotation.y = YAW[f];
          if (sit) p.position.y = 0.47;
          bs.world.add(p);
          B.setEnv(p);
          set.add(keys.map((kk) => frameKey([`f${f}`, kk])), B.shoot(bs, { target: p, masked: isShirt, ownShadow: !sit }));
          bs.world.remove(p);
        }
      }
      B.log(`guest b${b}o${k} done`);
    }));
  },
};
