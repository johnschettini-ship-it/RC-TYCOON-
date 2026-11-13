// People with real proportions (metres). Origin = between the feet, facing +z.
// Round 7: shaped torso (lathe profile: hips, waist, chest, shoulders), faces (eyes, brows, mouth, nose, ears),
// ten hair styles, hats (cap, sun hat, bucket hat, beanie), dresses, skirts, shorts, jackets, scarves,
// backpacks and shoulder bags, child proportions (bigger head, shorter legs), and more poses.
// Each person is a small joint hierarchy (hips, knees, shoulders, elbows) so one builder gives every pose:
// walk (with a phase), stand, wave, sit (bench), ride (car seat, legs hidden), dangle (open seat, legs hanging),
// horse (astride), skate (glide on one leg), slide (sitting on a mat, legs forward), eat (hand to mouth).
import * as THREE from 'three';
import { rng } from './textures.js';

export const SKIN = ['#f3d9c6', '#eac2a2', '#dcaa84', '#c99068', '#b07850', '#8e5a3a', '#6e4329', '#4f2f1e', '#f6e1d2', '#c08360', '#d6a07a', '#a36846'];
export const HAIR = ['#1b1512', '#2c1f17', '#47301f', '#6b4428', '#93602f', '#c39657', '#dcc596', '#8c8580', '#c9c4bd', '#8d3a20', '#3a2a22'];
export const TOPS = ['#c8372d', '#2f5fa5', '#f2f0ea', '#2b2b2e', '#e2a92c', '#3b7d4f', '#d96b8e', '#7aa7d6', '#e57a2e', '#6c4f9a',
  '#1f8a8a', '#d8d1bd', '#9b2f45', '#5b6b2e', '#f5d6d9', '#33415c', '#f3e3a1', '#8fc4b8'];
export const BOTTOMS = ['#2c3a55', '#3c4f74', '#1f1f22', '#b9ad92', '#6b6f75', '#4a5a3a', '#7b5a3c', '#22324f', '#c9c3b5', '#5d6f8f'];
const DRESSES = ['#d9534f', '#f2c14e', '#5b8fd1', '#f4f1e8', '#e98fb0', '#3c8d6e', '#9a63b5', '#2b3d5c'];
const COATS = ['#b8302a', '#1f3557', '#2a2a2c', '#5d7a4a', '#d9c6a0', '#7a2440', '#2f6d8a', '#e2b33a', '#6b4b8f', '#e9e4da'];
const KNIT = ['#c8372d', '#f2f0ea', '#2f5fa5', '#e2a92c', '#3b7d4f', '#d96b8e', '#33415c'];

const mats = new Map();
function mat(color, rough = 0.85, sheen = false) {
  const key = color + rough + sheen;
  if (!mats.has(key)) {
    const m = sheen
      ? new THREE.MeshPhysicalMaterial({ color, roughness: rough, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4) })
      : new THREE.MeshStandardMaterial({ color, roughness: rough });
    mats.set(key, m);
  }
  return mats.get(key);
}
const geoCache = new Map();
const cached = (k, fn) => { if (!geoCache.has(k)) geoCache.set(k, fn()); return geoCache.get(k); };
const capsule = (r, len) => cached(`c${r.toFixed(4)}_${len.toFixed(4)}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));
const sphere = (r, w = 16, h = 12) => cached(`s${r.toFixed(4)}_${w}`, () => new THREE.SphereGeometry(r, w, h));
// lathe profile [[radius, y], ...] -> a round solid, scaled flatter front-to-back by the caller
const lathe = (key, pts, seg = 16) => cached(key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg));

function mesh(geo, m, cast = true) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = cast; o.receiveShadow = true;
  return o;
}
// tapered limb hanging down from a pivot: returns { pivot, end } where end is a group at the far joint
function limb(parent, at, len, r0, r1, m, sleeve) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  parent.add(pivot);
  const g = cached(`l${len.toFixed(3)}_${r0.toFixed(4)}_${r1.toFixed(4)}`, () => {
    // tapered capsule: lathe of a rounded-end profile
    const pts = [];
    for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push([Math.sin(a) * r1, -len + r1 - Math.cos(a) * r1]); }
    for (let i = 0; i <= 4; i++) { const a = Math.PI / 2 + (i / 4) * Math.PI / 2; pts.push([Math.sin(a) * r0, -r0 * 0.4 - Math.cos(a) * r0]); }
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), 10);
  });
  pivot.add(mesh(g, m));
  if (sleeve) {
    const k = sleeve.k || 1.22;
    const s = mesh(capsule(r0 * k, Math.max(0.01, sleeve.len - 2 * r0)), sleeve.m);
    s.position.y = -sleeve.len / 2 + r0 * 0.5;
    pivot.add(s);
  }
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

export function randomLook(seed, opts = {}) {
  const r = rng(seed * 7 + 3);
  const pick = (a) => a[(r() * a.length) | 0];
  const child = opts.child ?? r() < 0.22;
  const female = opts.female ?? r() < 0.5;
  const winter = opts.season === 'winter';
  const age = child ? 0 : (r() < 0.15 ? 2 : 1); // 2 = older adult (grey hair, a little stooped)
  let hair = pick(HAIR);
  if (age === 2) hair = pick(['#c9c4bd', '#8c8580', '#e4e0da', '#a59f98']);
  if (child && (hair === '#8c8580' || hair === '#c9c4bd')) hair = '#c39657';
  const hairStyle = female
    ? pick(child ? ['pigtails', 'pony', 'bob', 'long', 'curly'] : ['long', 'bun', 'bob', 'pony', 'short', 'curly', 'long', 'afro'])
    : pick(child ? ['short', 'crop', 'curly', 'short'] : ['short', 'crop', 'bald', 'short', 'curly', 'afro', 'crop', 'side']);
  let bottomType = female && r() < 0.28 ? (r() < 0.55 ? 'dress' : 'skirt') : (r() < (winter ? 0 : 0.42) ? 'shorts' : 'trousers');
  if (winter && bottomType !== 'trousers') bottomType = 'trousers';
  const hats = winter ? ['beanie', 'beanie', 'beanie', null] : ['cap', 'sunhat', 'bucket', null, null, null, null, null];
  let hat = pick(hats);
  if (hat === 'sunhat' && !female && r() < 0.6) hat = 'bucket';
  return {
    child, female, age,
    h: child ? 1.0 + r() * 0.4 : (female ? 1.58 + r() * 0.15 : 1.70 + r() * 0.16) - (age === 2 ? 0.04 : 0),
    build: 0.9 + r() * 0.25,
    skin: pick(SKIN), hair, hairStyle, hat,
    hatColor: winter ? pick(KNIT) : pick(['#c8372d', '#1f2f4f', '#f2f0ea', '#2f6d3a', '#e8d9b0', '#d9b46a', '#7aa7d6']),
    top: winter ? pick(COATS) : (bottomType === 'dress' ? pick(DRESSES) : pick(TOPS)),
    sleeves: winter ? 'long' : (r() < 0.12 ? 'none' : r() < 0.7 ? 'short' : 'long'),
    jacket: winter,
    scarf: winter && r() < 0.6 ? pick(KNIT) : null,
    gloves: winter && r() < 0.5 ? pick(['#2a2a2a', '#7a2440', '#1f3557']) : null,
    bottom: pick(BOTTOMS), bottomType,
    shoes: pick(winter ? ['#2a2a2a', '#5a3b28', '#3b3f45', '#7a5a3c'] : ['#f2f2f2', '#2a2a2a', '#5a3b28', '#d0d0d0', '#30405a', '#c8372d']),
    backpack: !child && r() < 0.2 ? pick(['#2b3a55', '#7a2a2a', '#3f4a2a', '#222', '#d9a03a']) : null,
    bag: !child && female && r() < 0.25 ? pick(['#7b5a3c', '#1f1f22', '#c8b28a']) : null,
    balloon: child && !winter && r() < 0.5 ? pick(['#e2312b', '#f2c22e', '#2e7fe0', '#e85aa8']) : null,
    ...opts,
  };
}

// pose: { kind, phase, armsUp, legsHidden, item }
export function person(look, pose = { kind: 'stand' }) {
  const L = look, h = L.h;
  const kid = L.child;
  const s = kid ? h / 1.62 : h / 1.75; // children: legs and torso shorter relative to the head
  const root = new THREE.Group();
  const skin = mat(L.skin, 0.62), hairM = mat(L.hair, 0.5);
  const topM = mat(L.top, L.jacket ? 0.6 : 0.9, !L.jacket);
  const botM = mat(L.bottom, 0.9, true), shoeM = mat(L.shoes, 0.6);
  const handM = L.gloves ? mat(L.gloves, 0.8) : skin;
  const k = pose.kind;
  const seated = k === 'sit' || k === 'ride' || k === 'horse' || k === 'dangle' || k === 'slide';

  const legLen = (kid ? 0.43 : 0.47) * h;                 // hip joint to sole
  const thigh = legLen * 0.5, shin = legLen * 0.46;
  const hipY = legLen + 0.02;
  const torsoLen = (kid ? 0.29 : 0.31) * h;               // hip joint to shoulder line
  const headR = kid ? 0.098 * Math.pow(h / 1.2, 0.3) : 0.107 * (L.female ? 0.97 : 1);
  const bw = L.build * (L.jacket ? 1.12 : 1);
  const shoulderW = (L.female ? 0.165 : 0.195) * s * L.build;
  const hipW = (L.female ? 0.088 : 0.082) * s;

  const hips = new THREE.Group();
  hips.position.y = hipY;
  root.add(hips);
  const torsoG = new THREE.Group(); // pivot for leaning
  hips.add(torsoG);
  if (L.age === 2) torsoG.rotation.x = 0.08;

  // pelvis + torso as lathe profiles, flattened front-to-back
  const fw = L.female ? 1 : 0;
  const pr = (v) => v * s;
  const pelvisPts = [[0.02, -0.11], [pr(0.1 + 0.015 * fw), -0.09], [pr(0.14 + 0.02 * fw), -0.02], [pr(0.135 + 0.015 * fw), 0.05], [pr(0.125), 0.09]];
  const pelvis = mesh(lathe(`p${kid}${fw}${s.toFixed(2)}`, pelvisPts), L.bottomType === 'dress' ? topM : botM);
  pelvis.scale.set(1.12 * L.build, 1, 0.78);
  torsoG.add(pelvis);
  const T = torsoLen;
  const torsoPts = [[pr(0.125), 0.06], [pr(0.118 - 0.012 * fw), T * 0.35], [pr(0.14 - 0.005 * fw), T * 0.62], [pr(0.155), T * 0.84], [pr(0.14), T * 0.96], [pr(0.07), T * 1.04], [pr(0.04), T * 1.06]];
  const torso = mesh(lathe(`t${kid}${fw}${s.toFixed(2)}${T.toFixed(3)}`, torsoPts), topM);
  torso.scale.set(1.18 * bw, 1, 0.7 * bw);
  torsoG.add(torso);
  if (L.jacket) { // open front zip line + slightly longer hem over the hips
    const hem = mesh(lathe(`j${s.toFixed(2)}`, [[pr(0.165), -0.13], [pr(0.165), 0.02], [pr(0.14), 0.1]]), topM);
    hem.scale.set(1.18 * bw, 1, 0.74 * bw); torsoG.add(hem);
    const zip = mesh(new THREE.BoxGeometry(0.012, T * 1.05, 0.01), mat('#1d1d1d', 0.5)); zip.position.set(0, T * 0.45, pr(0.14) * 0.7 * bw + 0.004); torsoG.add(zip);
  }
  // shoulders: round caps so the arm joins the body
  for (const side of [-1, 1]) { const sh = mesh(sphere(0.05 * s * bw), topM); sh.position.set(side * shoulderW * 0.96, T * 0.9, 0); sh.scale.set(1, 0.9, 1); torsoG.add(sh); }
  const neck = mesh(capsule(0.045 * s, 0.07 * s), skin);
  neck.position.y = T + 0.04 * s;
  torsoG.add(neck);
  if (L.scarf) { const sc = mesh(new THREE.TorusGeometry(0.06 * s, 0.03 * s, 8, 16), mat(L.scarf, 0.95, true)); sc.rotation.x = Math.PI / 2; sc.position.y = T + 0.03; torsoG.add(sc);
    const tail = mesh(new THREE.BoxGeometry(0.06 * s, 0.22 * s, 0.025), mat(L.scarf, 0.95, true)); tail.position.set(0.04, T - 0.08, 0.1 * s * bw); tail.rotation.z = 0.1; torsoG.add(tail); }

  // ---- head
  const head = new THREE.Group();
  head.position.y = T + 0.075 * s + headR * 1.0;
  torsoG.add(head);
  const R = headR;
  const skull = mesh(sphere(R, 20, 14), skin);
  skull.scale.set(0.88, 1.06, 0.98);
  head.add(skull);
  const jaw = mesh(sphere(R * 0.72), skin); jaw.position.set(0, -R * 0.38, R * 0.18); jaw.scale.set(1, 0.85, 1); head.add(jaw);
  const nose = mesh(sphere(R * 0.16, 8, 6), skin); nose.position.set(0, -R * 0.12, R * 0.95); nose.scale.set(0.8, 1.1, 1); head.add(nose);
  for (const side of [-1, 1]) {
    const ear = mesh(sphere(R * 0.2, 8, 6), skin); ear.position.set(side * R * 0.86, -R * 0.08, 0); ear.scale.set(0.5, 1, 0.8); head.add(ear);
    const eye = mesh(sphere(R * 0.135, 8, 6), mat('#17110d', 0.3), false); eye.position.set(side * R * 0.33, R * 0.02, R * 0.86); eye.scale.set(1, 0.85, 0.6); head.add(eye);
    const glint = mesh(sphere(R * 0.035, 4, 3), mat('#ffffff', 0.2), false); glint.position.set(side * R * 0.31, R * 0.06, R * 0.93); head.add(glint);
    const brow = mesh(new THREE.BoxGeometry(R * 0.36, R * 0.09, R * 0.08), mat(L.hairStyle === 'bald' ? '#3a2a20' : L.hair, 0.8), false);
    brow.position.set(side * R * 0.33, R * 0.25, R * 0.86); brow.rotation.z = side * -0.12; head.add(brow);
  }
  const mouth = mesh(new THREE.BoxGeometry(R * 0.32, R * 0.05, R * 0.06), mat('#7a3a32', 0.6), false); mouth.position.set(0, -R * 0.45, R * 0.82); head.add(mouth);

  // hair
  // under a hat, big hair styles are tucked in (otherwise curls and buns poke through the crown)
  const hs = L.hat && ['curly', 'afro', 'bun', 'side'].includes(L.hairStyle) ? 'short' : L.hairStyle;
  const hairCap = (k = 1.07, tilt = -0.5, cover = 0.56) => {
    const cap = mesh(cached(`hc${R.toFixed(4)}${k}${cover}`, () => new THREE.SphereGeometry(R * k, 18, 10, 0, Math.PI * 2, 0, Math.PI * cover)), hairM);
    cap.scale.set(0.92, 1.06, 1.02);
    cap.rotation.x = tilt;
    cap.position.set(0, R * 0.04, -R * 0.04);
    head.add(cap);
    return cap;
  };
  if (hs !== 'bald') {
    if (hs === 'crop') hairCap(1.03, -0.45, 0.52);
    else if (hs === 'curly') {
      hairCap(1.06, -0.5, 0.58);
      const r2 = rng(Math.round(R * 1e5));
      for (let i = 0; i < 14; i++) { const a = r2() * Math.PI * 2, e = 0.2 + r2() * 1.1; const c = mesh(sphere(R * 0.3, 8, 6), hairM); c.position.set(Math.cos(a) * Math.cos(e) * R * 0.9, R * 0.25 + Math.sin(e) * R * 0.8, Math.sin(a) * Math.cos(e) * R * 0.9 - R * 0.12); head.add(c); }
    } else if (hs === 'afro') {
      const a = mesh(sphere(R * 1.22, 16, 12), hairM); a.position.set(0, R * 0.55, -R * 0.42); a.scale.set(1.05, 0.95, 1); head.add(a);
    } else {
      hairCap();
      if (hs === 'side') { const f = mesh(sphere(R * 0.5), hairM); f.position.set(R * 0.35, R * 0.62, R * 0.45); f.scale.set(1.3, 0.5, 0.8); head.add(f); }
      if (hs === 'long') {
        const back = mesh(capsule(R * 0.82, R * 1.3), hairM); back.scale.set(1.08, 1, 0.48); back.position.set(0, -R * 0.75, -R * 0.55); head.add(back);
        for (const side of [-1, 1]) { const lock = mesh(capsule(R * 0.25, R * 1.0), hairM); lock.position.set(side * R * 0.8, -R * 0.55, -R * 0.1); head.add(lock); }
      } else if (hs === 'bun') {
        const bun = mesh(sphere(R * 0.42), hairM); bun.position.set(0, R * 0.78, -R * 0.72); head.add(bun);
      } else if (hs === 'pony') {
        const p = mesh(capsule(R * 0.24, R * 1.1), hairM); p.position.set(0, -R * 0.25, -R * 1.08); p.rotation.x = 0.35; head.add(p);
      } else if (hs === 'bob') {
        const b = mesh(sphere(R * 1.12), hairM); b.scale.set(1.02, 0.78, 1.0); b.position.set(0, -R * 0.12, -R * 0.28); head.add(b);
      } else if (hs === 'pigtails') {
        for (const side of [-1, 1]) { const p = mesh(capsule(R * 0.2, R * 0.6), hairM); p.position.set(side * R * 1.0, -R * 0.2, -R * 0.35); p.rotation.z = side * 0.5; head.add(p); }
      }
    }
  }
  if (L.hat) {
    const hm = mat(L.hatColor, 0.85, true);
    if (L.hat === 'cap') {
      const crown = mesh(new THREE.SphereGeometry(R * 1.06, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hm); crown.position.set(0, R * 0.22, -R * 0.04); crown.rotation.x = -0.3; crown.scale.set(0.95, 0.92, 1); head.add(crown);
      const brim = mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.7, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), hm); brim.position.set(0, R * 0.5, R * 0.6); brim.scale.set(1, 1, 1.1); brim.rotation.x = 0.3; head.add(brim);
    } else if (L.hat === 'sunhat') {
      const brim = mesh(new THREE.CylinderGeometry(R * 2.0, R * 2.1, 0.012, 24), hm); brim.position.set(0, R * 0.5, -R * 0.05); brim.rotation.x = -0.12; head.add(brim);
      const crown = mesh(new THREE.CylinderGeometry(R * 0.9, R * 1.05, R * 0.7, 18), hm); crown.position.y = R * 0.82; head.add(crown);
      const band = mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.06, R * 0.18, 18), mat('#2b2b2e', 0.7)); band.position.y = R * 0.6; head.add(band);
    } else if (L.hat === 'bucket') {
      const bg = new THREE.Group(); bg.rotation.x = -0.25; bg.position.y = R * 0.18; head.add(bg);
      const crown = mesh(new THREE.CylinderGeometry(R * 0.9, R * 1.08, R * 0.75, 16), hm); crown.position.y = R * 0.5; bg.add(crown);
      const brim = mesh(new THREE.CylinderGeometry(R * 1.1, R * 1.5, R * 0.28, 18, 1, true), hm); brim.position.y = R * 0.08; bg.add(brim);
    } else if (L.hat === 'beanie') {
      const bg = new THREE.Group(); bg.rotation.x = -0.42; bg.position.set(0, R * 0.12, -R * 0.06); head.add(bg); // tilted back: the front edge sits at the brows
      const crown = mesh(new THREE.SphereGeometry(R * 1.08, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hm); crown.scale.set(0.95, 1.15, 1); bg.add(crown);
      const fold = mesh(new THREE.CylinderGeometry(R * 1.1, R * 1.1, R * 0.32, 16), hm); fold.position.y = R * 0.1; fold.scale.set(0.95, 1, 1.0); bg.add(fold);
      const pom = mesh(sphere(R * 0.28, 8, 6), mat('#f2f0ea', 1)); pom.position.y = R * 1.3; bg.add(pom);
    }
  }
  if (L.backpack) {
    const bp = mesh(new THREE.BoxGeometry(0.27 * s, 0.36 * s, 0.13 * s), mat(L.backpack, 0.8));
    bp.position.set(0, T * 0.58, -0.15 * s * bw); torsoG.add(bp);
    const pocket = mesh(new THREE.BoxGeometry(0.2 * s, 0.14 * s, 0.05 * s), mat(L.backpack, 0.7)); pocket.position.set(0, T * 0.45, -0.23 * s * bw); torsoG.add(pocket);
    for (const side of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(0.035, T * 0.6, 0.02), mat('#1d1d1d', 0.8)); st.position.set(side * 0.08 * s, T * 0.62, 0.115 * s * bw); torsoG.add(st); }
  }
  if (L.bag && !seated) {
    const strap = mesh(new THREE.BoxGeometry(0.025, T * 1.15, 0.02), mat(L.bag, 0.7)); strap.position.set(0.02, T * 0.55, 0.12 * s); strap.rotation.z = 0.62; torsoG.add(strap);
    const b = mesh(new THREE.BoxGeometry(0.06, 0.2 * s, 0.25 * s), mat(L.bag, 0.6)); b.position.set(-shoulderW - 0.02, T * 0.05, 0.02); torsoG.add(b);
  }

  // skirt or dress below the waist (seated: thighs take the colour instead, so nothing pokes through seats)
  const skirtLike = L.bottomType === 'skirt' || L.bottomType === 'dress';
  if (skirtLike && !seated) {
    const sk = mesh(lathe(`sk${s.toFixed(2)}`, [[pr(0.13), 0.06], [pr(0.155), -0.12], [pr(0.2), -thigh * 0.95]], 18), L.bottomType === 'dress' ? topM : botM);
    sk.scale.set(1.1, 1, 0.9); torsoG.add(sk);
  }

  // legs
  const legs = [];
  if (!pose.legsHidden) for (const side of [-1, 1]) {
    const longLeg = L.bottomType === 'trousers';
    const skirtCol = L.bottomType === 'dress' ? topM : botM;
    const thighM = skirtLike ? (seated ? skirtCol : skin) : (longLeg ? botM : skin);
    const up = limb(hips, new THREE.Vector3(side * hipW, -0.02, 0), thigh, 0.095 * s, 0.066 * s, thighM,
      L.bottomType === 'shorts' ? { len: thigh * 0.6, m: botM, k: 1.08 } : null);
    const low = limb(up.end, new THREE.Vector3(0, 0, 0), shin, 0.064 * s, 0.044 * s, longLeg ? botM : skin);
    const foot = mesh(cached(`f${s.toFixed(2)}`, () => { const g = new THREE.CapsuleGeometry(0.045 * s, 0.15 * s, 3, 8); g.rotateX(Math.PI / 2); g.scale(1.05, 0.75, 1); return g; }), shoeM);
    foot.position.set(0, -0.015, 0.055 * s);
    low.end.add(foot);
    legs.push({ up, low, side });
  }
  // arms
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * shoulderW, T * 0.9, 0);
    const longS = L.sleeves === 'long', none = L.sleeves === 'none';
    const upLen = 0.3 * s, foreLen = 0.25 * s;
    const up = limb(torsoG, shoulder, upLen, 0.054 * s * (L.jacket ? 1.2 : 1), 0.044 * s, longS ? topM : skin, longS || none ? null : { len: 0.15 * s, m: topM });
    const low = limb(up.end, new THREE.Vector3(0, 0, 0), foreLen, 0.044 * s * (L.jacket ? 1.2 : 1), 0.033 * s, longS ? topM : skin);
    const hand = mesh(sphere(0.047 * s, 10, 8), handM);
    hand.scale.set(0.75, 1.25, 0.55);
    hand.position.y = -0.045 * s;
    low.end.add(hand);
    up.pivot.rotation.z = side * 0.1;
    arms.push({ up, low, side });
  }

  // ---- pose
  const ph = pose.phase ?? 0;
  const armsDown = () => arms.forEach(({ low }) => { low.pivot.rotation.x = -0.15; });
  if (k === 'walk') {
    const a = Math.sin(ph) * 0.42;
    legs.forEach(({ up, low, side }) => {
      const sw = a * side;
      up.pivot.rotation.x = -sw;
      low.pivot.rotation.x = Math.max(0, sw) * 0.9 + 0.08;
    });
    arms.forEach(({ up, low, side }) => { up.pivot.rotation.x = a * side * 0.9; low.pivot.rotation.x = -0.25 - Math.max(0, a * side) * 0.4; });
    hips.position.y = hipY - Math.abs(Math.sin(ph)) * 0.012 - 0.02;
    torsoG.rotation.x += 0.04;
  } else if (k === 'stand' || k === 'wave' || k === 'eat' || k === 'point') {
    legs.forEach(({ up, side }) => { up.pivot.rotation.z = side * 0.035; });
    if ((ph * 10 | 0) % 2) { legs[0] && (legs[0].up.pivot.rotation.x = -0.12, legs[0].low.pivot.rotation.x = 0.2); hips.position.y = hipY - 0.01; }
    armsDown();
    if (k === 'wave') { const a = arms[1]; a.up.pivot.rotation.x = -2.6; a.up.pivot.rotation.z = 0.35; a.low.pivot.rotation.x = -0.4; }
    if (k === 'eat') { const a = arms[1]; a.up.pivot.rotation.x = -0.35; a.low.pivot.rotation.x = -2.1; a.up.pivot.rotation.z = -0.15; }
    if (k === 'point') { const a = arms[0]; a.up.pivot.rotation.x = -1.4; a.up.pivot.rotation.z = -0.3; a.low.pivot.rotation.x = -0.1; }
  } else if (k === 'sit' || k === 'dangle') {
    legs.forEach(({ up, low, side }) => {
      up.pivot.rotation.x = -1.5; up.pivot.rotation.z = side * 0.06;
      low.pivot.rotation.x = k === 'sit' ? 1.5 : 1.25 + side * 0.15;
    });
    arms.forEach(({ up, low }) => { up.pivot.rotation.x = -0.45; low.pivot.rotation.x = -0.8; });
    if (pose.armsUp) arms.forEach(({ up, low, side }) => { up.pivot.rotation.x = -2.8; up.pivot.rotation.z = side * 0.3; low.pivot.rotation.x = -0.2; });
    hips.position.y = 0; // caller places the seat
  } else if (k === 'horse') {
    legs.forEach(({ up, low, side }) => { up.pivot.rotation.x = -0.85; up.pivot.rotation.z = side * 0.5; low.pivot.rotation.x = 1.15; low.pivot.rotation.z = -side * 0.35; });
    arms.forEach(({ up, low }) => { up.pivot.rotation.x = -0.55; low.pivot.rotation.x = -0.9; up.pivot.rotation.z *= 0.3; });
    hips.position.y = 0;
  } else if (k === 'ride') {
    hips.position.y = 0;
    legs.forEach(({ up, low }) => { up.pivot.rotation.x = -1.45; low.pivot.rotation.x = 1.3; });
    arms.forEach(({ up, low, side }) => {
      if (pose.armsUp) { up.pivot.rotation.x = -2.85; up.pivot.rotation.z = side * 0.35; low.pivot.rotation.x = -0.2; }
      else { up.pivot.rotation.x = -0.9; low.pivot.rotation.x = -0.6; }
    });
  } else if (k === 'slide') {
    hips.position.y = 0;
    torsoG.rotation.x = -0.25;
    legs.forEach(({ up, low, side }) => { up.pivot.rotation.x = -1.45; up.pivot.rotation.z = side * 0.08; low.pivot.rotation.x = 0.1; });
    arms.forEach(({ up, low, side }) => { up.pivot.rotation.x = -0.6; up.pivot.rotation.z = side * 0.6; low.pivot.rotation.x = -0.3; });
  } else if (k === 'skate') {
    // glide on the left leg, right leg pushed back, arms out for balance, leaning forward
    torsoG.rotation.x = 0.28;
    const [l, r] = legs;
    if (l) { l.up.pivot.rotation.x = -0.25; l.low.pivot.rotation.x = 0.35; }
    if (r) { r.up.pivot.rotation.x = 0.55; r.up.pivot.rotation.z = 0.12; r.low.pivot.rotation.x = 0.25; }
    hips.position.y = hipY - 0.06;
    arms.forEach(({ up, low, side }) => { up.pivot.rotation.z = side * (0.7 + 0.2 * Math.sin(ph)); up.pivot.rotation.x = -0.2 * side; low.pivot.rotation.x = -0.3; });
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
  if (pose.item) {
    // something held in the right hand: ice cream cone, drink cup, candy floss
    const a = arms[1];
    const it = new THREE.Group();
    if (pose.item === 'cone') { it.add(mesh(new THREE.ConeGeometry(0.03, 0.11, 8), mat('#d9a35a', 0.8)).rotateX(Math.PI)); const sc = mesh(sphere(0.038, 8, 6), mat('#f6e7d0', 0.6)); sc.position.y = 0.065; it.add(sc); }
    else if (pose.item === 'cup') { it.add(mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.13, 10), mat('#e8402e', 0.6))); }
    else if (pose.item === 'floss') { it.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 4), mat('#f2f0ea', 0.6))); const f = mesh(sphere(0.09, 10, 8), mat('#f4a6c8', 1)); f.position.y = 0.14; it.add(f); }
    it.position.y = -0.07 * s; it.rotation.x = Math.PI; // points away from the elbow (up in the eat pose)
    a.low.end.add(it);
  }
  root.userData = { hipY, hips };
  return root;
}
