// Low-poly people with real proportions (metres). Origin = between the feet, facing +z.
// Each person is a small joint hierarchy (hips, knees, shoulders, elbows) so one builder gives every pose:
// walk (with a phase), stand, sit (bench), ride (coaster seat: no legs drawn below the car side), horse.
import * as THREE from 'three';
import { rng } from './textures.js';

export const SKIN = ['#f1d3bd', '#e8bc98', '#d9a47c', '#c28a62', '#a26a46', '#7d4f33', '#5c3a26', '#f4dccb', '#b77b55'];
export const HAIR = ['#1d1612', '#2e2018', '#4a3020', '#6b4428', '#9a6a3a', '#c9a064', '#d8c79e', '#7a7470', '#23201e', '#8d3a20'];
export const TOPS = ['#c8372d', '#2f5fa5', '#f2f0ea', '#2b2b2e', '#e2a92c', '#3b7d4f', '#d96b8e', '#7aa7d6', '#e57a2e', '#6c4f9a',
  '#1f8a8a', '#d8d1bd', '#9b2f45', '#5b6b2e', '#f5d6d9', '#33415c'];
export const BOTTOMS = ['#2c3a55', '#3c4f74', '#1f1f22', '#b9ad92', '#6b6f75', '#4a5a3a', '#7b5a3c', '#22324f', '#c9c3b5'];

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
function capsule(r, len) {
  const k = `c${r}_${len}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CapsuleGeometry(r, len, 4, 10));
  return geoCache.get(k);
}
function sphere(r) {
  const k = `s${r}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, 16, 12));
  return geoCache.get(k);
}
function mesh(geo, m) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
// limb hanging down from a pivot: returns { pivot, end } where end is a group at the far joint
function limb(parent, at, len, r, m, sleeve) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  parent.add(pivot);
  const seg = mesh(capsule(r, Math.max(0.01, len - 2 * r)), m);
  seg.position.y = -len / 2;
  pivot.add(seg);
  if (sleeve) {
    const s = mesh(capsule(r * 1.25, Math.max(0.01, sleeve.len - 2 * r)), sleeve.m);
    s.position.y = -sleeve.len / 2 + 0.01;
    pivot.add(s);
  }
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

export function randomLook(seed, opts = {}) {
  const r = rng(seed);
  const pick = (a) => a[(r() * a.length) | 0];
  const child = opts.child ?? r() < 0.18;
  const female = r() < 0.5;
  return {
    child, female,
    h: child ? 1.05 + r() * 0.3 : (female ? 1.58 + r() * 0.16 : 1.70 + r() * 0.16),
    build: 0.92 + r() * 0.2,
    skin: pick(SKIN), hair: pick(HAIR),
    hairStyle: female ? pick(['long', 'bun', 'bob', 'pony', 'short']) : pick(['short', 'short', 'cap', 'bald', 'short']),
    top: pick(TOPS), sleeves: r() < 0.6 ? 'short' : 'long',
    bottom: pick(BOTTOMS), bottomType: female && r() < 0.35 ? 'skirt' : (r() < 0.4 ? 'shorts' : 'trousers'),
    shoes: pick(['#f2f2f2', '#2a2a2a', '#5a3b28', '#d0d0d0', '#30405a']),
    capColor: pick(['#c8372d', '#1f2f4f', '#f2f0ea', '#2f6d3a']),
    backpack: !child && r() < 0.22 ? pick(['#2b3a55', '#7a2a2a', '#3f4a2a', '#222']) : null,
    balloon: child && r() < 0.6 ? pick(['#e2312b', '#f2c22e', '#2e7fe0', '#e85aa8']) : null,
    ...opts,
  };
}

// pose: { kind: 'walk'|'stand'|'sit'|'ride'|'horse'|'wave', phase, armsUp, legsHidden }
export function person(look, pose = { kind: 'stand' }) {
  const L = look, h = L.h, s = h / 1.75; // proportions scale with height; children get bigger heads below
  const kid = L.child;
  const root = new THREE.Group();
  const skin = mat(L.skin, 0.6), topM = mat(L.top, 0.9, true), botM = mat(L.bottom, 0.9, true), shoeM = mat(L.shoes, 0.6), hairM = mat(L.hair, 0.55);

  const hipY = 0.93 * s * (kid ? 0.94 : 1), thigh = 0.46 * s * (kid ? 0.92 : 1), shin = 0.43 * s * (kid ? 0.92 : 1);
  const torsoLen = 0.50 * s * (kid ? 0.95 : 1);
  const shoulderW = (L.female ? 0.18 : 0.21) * s * L.build;
  const hipW = (L.female ? 0.095 : 0.09) * s;
  const headR = (kid ? 0.115 : 0.105) * Math.max(s, 0.75);

  const hips = new THREE.Group();
  hips.position.y = hipY;
  root.add(hips);

  // pelvis + torso
  const pelvis = mesh(sphere(0.14 * s), L.bottomType === 'skirt' ? topM : botM);
  pelvis.scale.set(1.25 * L.build, 0.75, 0.85);
  hips.add(pelvis);
  const chest = mesh(capsule(0.15 * s * L.build, torsoLen * 0.62), topM);
  chest.scale.set(1.18, 1, 0.68);
  chest.position.y = torsoLen * 0.5;
  hips.add(chest);
  const neck = mesh(capsule(0.045 * s, 0.06 * s), skin);
  neck.position.y = torsoLen + 0.05 * s;
  hips.add(neck);
  const head = new THREE.Group();
  head.position.y = torsoLen + 0.06 * s + headR * 1.05;
  hips.add(head);
  const skull = mesh(sphere(headR), skin);
  skull.scale.set(0.9, 1.08, 1.0);
  head.add(skull);
  const nose = mesh(sphere(headR * 0.18), skin);
  nose.position.set(0, -headR * 0.05, headR * 0.95);
  head.add(nose);
  // hair
  const hs = L.hairStyle;
  if (hs !== 'bald') {
    const cap = mesh(new THREE.SphereGeometry(headR * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    cap.scale.set(0.92, 1.1, 1.04);
    cap.rotation.x = -0.35;
    cap.position.set(0, headR * 0.06, -headR * 0.06);
    head.add(cap);
    if (hs === 'long') {
      const back = mesh(capsule(headR * 0.85, headR * 1.2), hairM);
      back.scale.set(1.05, 1, 0.5);
      back.position.set(0, -headR * 0.6, -headR * 0.55);
      head.add(back);
    } else if (hs === 'bun') {
      const bun = mesh(sphere(headR * 0.42), hairM); bun.position.set(0, headR * 0.75, -headR * 0.75); head.add(bun);
    } else if (hs === 'pony') {
      const p = mesh(capsule(headR * 0.25, headR * 1.0), hairM); p.position.set(0, -headR * 0.3, -headR * 1.05); p.rotation.x = 0.3; head.add(p);
    } else if (hs === 'bob') {
      const b = mesh(sphere(headR * 1.1), hairM); b.scale.set(1.0, 0.75, 1.0); b.position.set(0, -headR * 0.1, -headR * 0.25); head.add(b);
    }
  }
  if (hs === 'cap') {
    const cm = mat(L.capColor, 0.8);
    const crown = mesh(new THREE.SphereGeometry(headR * 1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), cm);
    crown.position.y = headR * 0.12; head.add(crown);
    const brim = mesh(new THREE.CylinderGeometry(headR * 0.75, headR * 0.75, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), cm);
    brim.position.set(0, headR * 0.2, headR * 0.65); brim.scale.set(1, 1, 1.1); head.add(brim);
  }
  if (L.backpack) {
    const bp = mesh(new THREE.BoxGeometry(0.28 * s, 0.36 * s, 0.14 * s), mat(L.backpack, 0.8));
    bp.position.set(0, torsoLen * 0.55, -0.16 * s); hips.add(bp);
  }
  if (L.bottomType === 'skirt') {
    const sk = mesh(new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 0.42 * s, 16), botM);
    sk.position.y = -0.17 * s; hips.add(sk);
  }

  // legs
  const legs = [];
  if (!pose.legsHidden) for (const side of [-1, 1]) {
    const longLeg = L.bottomType === 'trousers';
    const thighM = L.bottomType === 'skirt' ? skin : (longLeg ? botM : skin);
    const up = limb(hips, new THREE.Vector3(side * hipW, -0.02, 0), thigh, 0.072 * s, thighM,
      L.bottomType === 'shorts' ? { len: thigh * 0.6, m: botM } : null);
    const low = limb(up.end, new THREE.Vector3(0, 0, 0), shin, 0.054 * s, longLeg ? botM : skin);
    const foot = mesh(new THREE.BoxGeometry(0.095 * s, 0.075 * s, 0.25 * s), shoeM);
    foot.position.set(0, -0.02, 0.06 * s);
    low.end.add(foot);
    legs.push({ up, low, side });
  }
  // arms
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * shoulderW, torsoLen * 0.88, 0);
    const longS = L.sleeves === 'long';
    const up = limb(hips, shoulder, 0.29 * s, 0.045 * s, longS ? topM : skin, longS ? null : { len: 0.16 * s, m: topM });
    const low = limb(up.end, new THREE.Vector3(0, 0, 0), 0.26 * s, 0.038 * s, longS ? topM : skin);
    const hand = mesh(sphere(0.045 * s), skin);
    hand.scale.set(0.8, 1.2, 0.6);
    hand.position.y = -0.05 * s;
    low.end.add(hand);
    up.pivot.rotation.z = side * 0.08;
    arms.push({ up, low, side });
  }

  // ---- pose
  const k = pose.kind;
  const ph = pose.phase ?? 0;
  if (k === 'walk') {
    const a = Math.sin(ph) * 0.42;
    legs.forEach(({ up, low, side }) => {
      const sw = a * side;
      up.pivot.rotation.x = -sw;
      low.pivot.rotation.x = Math.max(0, sw) * 0.9 + 0.08;
    });
    arms.forEach(({ up, low, side }) => { up.pivot.rotation.x = a * side * 0.9; low.pivot.rotation.x = -0.25 - Math.max(0, a * side) * 0.4; });
    hips.position.y = hipY - Math.abs(Math.sin(ph)) * 0.01 - 0.02;
  } else if (k === 'stand' || k === 'wave') {
    legs.forEach(({ up, side }) => { up.pivot.rotation.z = side * 0.04; });
    arms.forEach(({ up, low, side }) => { low.pivot.rotation.x = -0.15; });
    if (k === 'wave') { const a = arms[1]; a.up.pivot.rotation.x = -2.6; a.up.pivot.rotation.z = 0.35; a.low.pivot.rotation.x = -0.4; }
  } else if (k === 'sit' || k === 'horse') {
    legs.forEach(({ up, low, side }) => {
      up.pivot.rotation.x = k === 'sit' ? -1.5 : -0.75;
      up.pivot.rotation.z = side * (k === 'horse' ? 0.55 : 0.06);
      low.pivot.rotation.x = k === 'sit' ? 1.5 : 0.85;
    });
    arms.forEach(({ up, low }) => { up.pivot.rotation.x = -0.45; low.pivot.rotation.x = -0.8; });
    hips.position.y = 0; // caller places the seat
  } else if (k === 'ride') {
    hips.position.y = 0;
    legs.forEach(({ up, low }) => { up.pivot.rotation.x = -1.45; low.pivot.rotation.x = 1.3; });
    arms.forEach(({ up, low, side }) => {
      if (pose.armsUp) { up.pivot.rotation.x = -2.85; up.pivot.rotation.z = side * 0.35; low.pivot.rotation.x = -0.2; }
      else { up.pivot.rotation.x = -0.9; low.pivot.rotation.x = -0.6; }
    });
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
