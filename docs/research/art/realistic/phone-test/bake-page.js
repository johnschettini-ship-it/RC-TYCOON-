// Sprite bake for the realistic look phone test (round 6/7 "T Daylight real"). Driven by bake.cjs via window.bake().
// Builds the round 6 park from ../tools, then renders, with a transparent background, through the same orthographic
// 2:1 camera (yaw 45, pitch 30, 1 tile = 3 m = 104 x 52 px at zoom 1) and the same light, AO and grade as T:
//   * ground chunks (lawn, paving, kerbs, pond; shadows of every static object baked in), 512 px, per rotation and zoom
//   * static objects as separate sprites with a ground anchor (trees, lamps, benches, bins, shrubs, kiosk, tables,
//     fountain, carousel base and canopy); the coaster and the queue rails are cut into 6 m columns (clip planes)
//   * the carousel horse ring, 16 frames (one view serves all four rotations, see README)
//   * guests: 8 outfits x 8 facing directions x 8 walk frames, each with its own soft contact shadow
// Every render is done once at 4 internal px per zoom-1 px (zoom 2 with 2x supersampling) and box-filtered down to
// zoom 2 (/2) and zoom 1 (/4), so both zooms come from one render. Packing into atlases and WebP encoding happen here
// too (canvas.toDataURL), so Node only writes files.
import * as THREE from 'three';
import { buildPark } from '../tools/park.js';
import { person, randomLook } from '../tools/people.js';
import { Post } from '../tools/post.js';
import { VARIANTS } from '../tools/main.js';

const VT = VARIANTS.t;
const PPM1 = 104 / (3 * Math.SQRT2); // zoom-1 px per metre
const SS = 4; // internal px per zoom-1 px
const C30 = Math.cos(Math.PI / 6);
const PITCH = Math.PI / 6;
const CHUNK = 512;
const PAGE = 2048;
const PAD = 2;
const log = (...a) => console.log('[bake]', ...a);

// park-space point (already turned by the world rotation) -> zoom-1 screen px relative to the projected origin, y down
export function proj(X, Y, Z) { return [PPM1 * (X - Z) / Math.SQRT2, PPM1 * (0.5 * (X + Z) / Math.SQRT2 - C30 * Y)]; }

// ------------------------------------------------------------------ renderer + post (AO and grade from T, alpha kept)
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(16, 16, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const post = new Post(renderer, 16, 16); // only its AO passes are used; render targets are ours

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMPOSE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tAO;
uniform float aoStrength, exposure, saturation, contrast;
uniform vec3 lift, gain;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 i = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 o = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= exposure / 0.6; c = i * c; c = RRTAndODTFit(c); c = o * c; return clamp(c, 0.0, 1.0);
}
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec4 s = texture2D(tColor, vUv);
  if (s.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  vec3 hdr = s.rgb / s.a; // blended pixels (shadow catcher, spray, glass) are premultiplied
  hdr *= mix(1.0, texture2D(tAO, vUv).x, aoStrength);
  vec3 c = aces(hdr);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c = c * gain + lift * (1.0 - c);
  c = srgb(max(c, 0.0));
  c = (c - 0.5) * contrast + 0.5;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), s.a);
}`;
const comp = (() => {
  const m = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: COMPOSE, depthTest: false, depthWrite: false,
    uniforms: { tColor: { value: null }, tAO: { value: null }, aoStrength: { value: VT.post.aoStrength }, exposure: { value: VT.post.exposure }, saturation: { value: VT.post.saturation }, contrast: { value: VT.post.contrast }, lift: { value: new THREE.Vector3(...VT.post.lift) }, gain: { value: new THREE.Vector3(...VT.post.gain) } },
  });
  const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  return { m, s };
})();

const rtCache = new Map();
function targets(W, H) {
  const key = W + 'x' + H;
  if (rtCache.has(key)) return rtCache.get(key);
  if (rtCache.size > 4) { for (const t of rtCache.values()) Object.values(t).forEach((r) => r.dispose()); rtCache.clear(); }
  const hf = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const scene = new THREE.WebGLRenderTarget(W, H, hf);
  scene.depthTexture = new THREE.DepthTexture(W, H, THREE.FloatType);
  const t = { scene, ao: new THREE.WebGLRenderTarget(W, H, hf), ao2: new THREE.WebGLRenderTarget(W, H, hf), out: new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }) };
  rtCache.set(key, t);
  return t;
}

// camera for a screen rectangle (zoom-1 px, relative to the projected origin): the frustum is just that window
function camFor(r) {
  const cam = new THREE.OrthographicCamera(r.x0 / PPM1, r.x1 / PPM1, -r.y0 / PPM1, -r.y1 / PPM1, 1, 400);
  const dir = new THREE.Vector3(Math.cos(PITCH) * Math.SQRT1_2, Math.sin(PITCH), Math.cos(PITCH) * Math.SQRT1_2);
  cam.position.copy(dir).multiplyScalar(150);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

let renderCount = 0, renderMs = 0;
// render a rectangle -> RGBA (bottom-up rows, as WebGL reads them) at SS internal px per zoom-1 px
function shoot(scene, r) {
  const t0 = performance.now();
  const W = (r.x1 - r.x0) * SS, H = (r.y1 - r.y0) * SS;
  const cam = camFor(r), t = targets(W, H);
  renderer.setRenderTarget(t.scene); renderer.render(scene, cam);
  const P = VT.post;
  const ao = post.pAO.u, aob = post.pAOB.u;
  ao.tDepth.value = t.scene.depthTexture; ao.res.value.set(W, H);
  ao.frustum.value.set(cam.right - cam.left, cam.top - cam.bottom); ao.near.value = cam.near; ao.far.value = cam.far;
  ao.radius.value = P.aoRadius; ao.intensity.value = P.aoIntensity;
  renderer.setRenderTarget(t.ao); renderer.render(post.pAO.s, post.cam);
  aob.tAO.value = t.ao.texture; aob.tDepth.value = t.scene.depthTexture; aob.res.value.set(W, H); aob.near.value = cam.near; aob.far.value = cam.far;
  renderer.setRenderTarget(t.ao2); renderer.render(post.pAOB.s, post.cam);
  comp.m.uniforms.tColor.value = t.scene.texture; comp.m.uniforms.tAO.value = t.ao2.texture;
  renderer.setRenderTarget(t.out); renderer.render(comp.s, post.cam);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(t.out, 0, 0, W, H, px);
  renderer.setRenderTarget(null);
  renderCount++; renderMs += performance.now() - t0;
  return { px, W, H };
}

// box filter by f (premultiplied average), flips to top-down rows, returns straight-alpha RGBA
function down(src, f) {
  const { px, W, H } = src, w = W / f, h = H / f, out = new Uint8ClampedArray(w * h * 4), n = f * f;
  for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let ky = 0; ky < f; ky++) {
      const sy = H - 1 - (oy * f + ky);
      let i = (sy * W + ox * f) * 4;
      for (let kx = 0; kx < f; kx++, i += 4) { const al = px[i + 3]; r += px[i] * al; g += px[i + 1] * al; b += px[i + 2] * al; a += al; }
    }
    const o = (oy * w + ox) * 4;
    if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = a / n; }
  }
  return { data: out, w, h };
}
function bbox(img, thr = 3) {
  const { data, w, h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function toCanvas(img, r = { x: 0, y: 0, w: img.w, h: img.h }) {
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const full = new ImageData(img.data, img.w, img.h);
  c.getContext('2d').putImageData(full, -r.x, -r.y, r.x, r.y, r.w, r.h);
  return c;
}
function touchesEdge(img, r) { return r && (r.x <= 0 || r.y <= 0 || r.x + r.w >= img.w || r.y + r.h >= img.h); }

// ------------------------------------------------------------------ scene
const sunDir = () => { const el = THREE.MathUtils.degToRad(VT.sun.el), az = THREE.MathUtils.degToRad(VT.sun.az); return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize(); };
function skyEnv() {
  const s = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(VT.sky.top) }, hor: { value: new THREE.Color(VT.sky.horizon) }, gnd: { value: new THREE.Color(VT.sky.ground) }, sun: { value: sunDir() }, disc: { value: VT.sky.sunDisc } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 top, hor, gnd, sun; uniform float disc;
      void main(){ float y = d.y; vec3 c = y > 0.0 ? mix(hor, top, pow(y, 0.6)) : mix(hor, gnd, pow(-y, 0.4));
      float s = max(dot(normalize(d), sun), 0.0); c += disc * (pow(s, 600.0) * 60.0 + pow(s, 12.0) * 0.4) * vec3(1.0, 0.95, 0.85);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02); pm.dispose();
  return rt.texture;
}
function lights(scene, ext, mapSize, at = new THREE.Vector3()) {
  const sun = new THREE.DirectionalLight(VT.sun.color, VT.sun.intensity);
  sun.position.copy(sunDir()).multiplyScalar(80).add(at);
  sun.target.position.copy(at);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mapSize, mapSize);
  const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target, new THREE.HemisphereLight(VT.hemi.sky, VT.hemi.ground, VT.hemi.intensity));
  return sun;
}
function setEnv(scene, env) {
  scene.environment = env;
  scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if ('envMapIntensity' in m) m.envMapIntensity = VT.envIntensity; });
}

// world box of an object, counting every instance of instanced meshes (Box3.setFromObject does not)
function boxOf(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); box.union(b.copy(o.geometry.boundingBox).applyMatrix4(m)); }
    else box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}
function rectOf(box, margin = 3) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const X of [box.min.x, box.max.x]) for (const Y of [box.min.y, box.max.y]) for (const Z of [box.min.z, box.max.z]) {
    const [sx, sy] = proj(X, Y, Z);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { x0: Math.floor(x0) - margin, y0: Math.floor(y0) - margin, x1: Math.ceil(x1) + margin, y1: Math.ceil(y1) + margin };
}

// display modes per part: show (normal), hold (writes depth, no colour: hides what is behind it), hide
const holdMats = new Map();
function holdOf(m) {
  if (!holdMats.has(m)) { const h = m.clone(); h.colorWrite = false; holdMats.set(m, h); }
  return holdMats.get(m);
}
function setMode(obj, mode) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.orig === undefined) o.userData.orig = o.material;
    o.visible = mode !== 'hide';
    const om = o.userData.orig;
    o.material = mode === 'hold' ? (Array.isArray(om) ? om.map(holdOf) : holdOf(om)) : om;
  });
}

// ------------------------------------------------------------------ atlas packing + files
const files = new Map(); // name -> data URL
function encode(canvas, name) {
  const url = canvas.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
  files.set(name, url);
  return name;
}
// shelf packer: sprites [{canvas, ...}] -> pages; writes s.a (file), s.sx, s.sy, s.w, s.h
function pack(sprites, prefix) {
  const order = sprites.slice().sort((a, b) => b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width);
  const pages = [];
  let page = null;
  const newPage = () => { page = { items: [], x: PAD, y: PAD, shelfH: 0, usedW: 0, usedH: 0 }; pages.push(page); };
  newPage();
  for (const s of order) {
    const w = s.canvas.width, h = s.canvas.height;
    if (w + 2 * PAD > PAGE || h + 2 * PAD > PAGE) throw new Error(`sprite ${w}x${h} too big for a ${PAGE} page`);
    if (page.x + w + PAD > PAGE) { page.x = PAD; page.y += page.shelfH + PAD; page.shelfH = 0; }
    if (page.y + h + PAD > PAGE) newPage();
    s.sx = page.x; s.sy = page.y; s.w = w; s.h = h; s.page = pages.length - 1;
    page.items.push(s);
    page.x += w + PAD; page.shelfH = Math.max(page.shelfH, h);
    page.usedW = Math.max(page.usedW, page.x); page.usedH = Math.max(page.usedH, page.y + h + PAD);
  }
  return pages.map((p, i) => {
    const c = document.createElement('canvas'); c.width = Math.min(PAGE, p.usedW); c.height = Math.min(PAGE, p.usedH);
    const g = c.getContext('2d');
    for (const s of p.items) g.drawImage(s.canvas, s.sx, s.sy);
    const name = `${prefix}-${i}.webp`;
    encode(c, name);
    for (const s of p.items) s.a = name;
    return name;
  });
}
const strip = (s, keep) => { const o = { a: s.a, sx: s.sx, sy: s.sy, w: s.w, h: s.h }; for (const k of keep) o[k] = s[k]; return o; };

// ------------------------------------------------------------------ the bake
window.bake = async (opts = {}) => {
  const T0 = performance.now();
  const outfits = opts.outfits ?? 8, dirs = 8, frames = 8, ringFrames = 16;
  const env = skyEnv();

  // ---- park scene: ground, objects, chopped groups (coaster + loose rails), carousel; the scene's own guests removed
  const scene = new THREE.Scene();
  const park = buildPark(VT);
  const root = park.root;
  for (const g of park.guests) root.remove(g);
  const world = new THREE.Group(); world.add(root); scene.add(world);
  lights(scene, 34, 4096);
  setEnv(scene, env);
  world.updateMatrixWorld(true);

  const ground = [], objects = [], chop = [];
  const car = park.carousel, coaster = park.coaster.group;
  for (const c of root.children.slice()) {
    if (c === car) continue;
    if (c === coaster) { chop.push(c); continue; }
    const b = boxOf(c);
    if ((c.isMesh || c.isInstancedMesh) && b.max.y < 0.5) ground.push(c);
    else if (c.isMesh) chop.push(c); // queue rails and posts
    else objects.push(c);
  }
  // carousel: base (platform, centre column, fence), canopy (everything from the ceiling up) and the horse ring
  const FY = 0.52, ROOF_Y = FY + 3.75, RING_R = 4.6;
  const base = new THREE.Group(), roof = new THREE.Group(), ring = new THREE.Group();
  const horses = [], poles = [];
  for (const c of car.children.slice()) {
    if (c.userData.seatY !== undefined) { horses.push(c); car.remove(c); continue; }
    const isPole = c.isMesh && c.geometry.type === 'CylinderGeometry' && c.geometry.parameters.radiusTop === 0.035 && Math.abs(c.position.y - (FY + ROOF_Y) / 2) < 0.05;
    if (isPole) { poles.push(c); car.remove(c); continue; }
    car.remove(c);
    c.updateMatrix();
    const bb = new THREE.Box3().copy((c.geometry.boundingBox || (c.geometry.computeBoundingBox(), c.geometry.boundingBox))).applyMatrix4(c.matrix);
    if (c.isInstancedMesh) { const m = new THREE.Matrix4(); c.getMatrixAt(0, m); bb.copy(c.geometry.boundingBox).applyMatrix4(m); }
    (bb.min.y > ROOF_Y - 0.8 ? roof : base).add(c); // the valance hangs 0.68 m below the ceiling
  }
  car.add(base, roof, ring);
  // ring with a 72 degree period so 16 frames loop: 10 outer horses alternating two designs (the second with its
  // rider), lift 0.3 m in antiphase (sin 5a). The inner ring of 7 is left out (7 and 10 share no short period).
  const outer = horses.filter((h) => Math.abs(Math.hypot(h.position.x, h.position.z) - RING_R) < 0.2);
  const outerPoles = poles.filter((p) => Math.abs(Math.hypot(p.position.x, p.position.z) - RING_R) < 0.2);
  const rh = [], rp = [];
  for (let i = 0; i < 10; i++) { const h = outer[i % 2].clone(true); ring.add(h); rh.push(h); const p = outerPoles[i]; ring.add(p); rp.push(p); }
  const setRing = (f) => {
    const th = (f / ringFrames) * (Math.PI * 2 / 5);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + th;
      rh[i].position.set(Math.cos(a) * RING_R, FY + 0.95 + 0.3 * Math.sin(5 * a), Math.sin(a) * RING_R);
      rh[i].rotation.set(0, -a, 0);
      rp[i].position.set(Math.cos(a) * RING_R, rp[i].position.y, Math.sin(a) * RING_R);
    }
  };
  setRing(0);
  setEnv(scene, env);
  const carCentre = new THREE.Vector3(car.position.x, 0, car.position.z);
  log(`park: ${ground.length} ground parts, ${objects.length} objects, ${chop.length} chopped groups, carousel ${base.children.length}/${roof.children.length}/${ring.children.length}`);

  const allParts = [...ground, ...objects, ...chop, base, roof, ring];
  const only = (modes) => { for (const p of allParts) setMode(p, modes.get(p) || 'hide'); };
  const turned = (v, q) => { const a = q * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); return [v.x * c + v.z * s, -v.x * s + v.z * c]; };
  const depthOf = (v, q) => { const [x, z] = turned(v, q); return +(x + z).toFixed(3); };
  const anchorPx = (v, q) => { const [x, z] = turned(v, q); return proj(x, v.y || 0, z); };

  // render one part set, return sprites for both zooms (trimmed), positions relative to the projected origin
  const sprite = (rect, tries = 0) => {
    const src = shoot(scene, rect);
    const out = {};
    for (const z of [1, 2]) {
      const img = down(src, SS / z);
      const bb = bbox(img);
      if (bb && touchesEdge(img, bb) && tries < 2) {
        const gx = Math.ceil((rect.x1 - rect.x0) * 0.3), gy = Math.ceil((rect.y1 - rect.y0) * 0.3);
        return sprite({ x0: rect.x0 - gx, y0: rect.y0 - gy, x1: rect.x1 + gx, y1: rect.y1 + gy }, tries + 1);
      }
      out[z] = bb ? { canvas: toCanvas(img, bb), x: rect.x0 * z + bb.x, y: rect.y0 * z + bb.y } : null;
    }
    return out;
  };

  const M = { z: { 1: { ground: [], objects: [], ring: [], guests: null }, 2: { ground: [], objects: [], ring: [], guests: null } } };
  const sprites = { 1: { objects: [], ring: [], guests: [] }, 2: { objects: [], ring: [], guests: [] } };
  let groundBytesPx = 0;

  for (let q = 0; q < 4; q++) {
    const tq = performance.now();
    world.rotation.y = q * Math.PI / 2;
    world.updateMatrixWorld(true);
    // freeze the shadow map with everything in place (later renders hide parts but keep their shadows)
    for (const p of allParts) setMode(p, 'show');
    renderer.shadowMap.needsUpdate = true;
    shoot(scene, { x0: 0, y0: 0, x1: 1, y1: 1 });

    // ---- ground chunks: render 512 zoom-1 px windows (+16 px margin for AO), cut into 512 px chunks per zoom
    only(new Map(ground.map((g) => [g, 'show'])));
    const gb = new THREE.Box3(); for (const g of ground) gb.union(boxOf(g));
    const gr = rectOf(gb, 0);
    const MG = 16;
    for (const z of [1, 2]) M.z[z].ground[q] = [];
    for (let cy = Math.floor(gr.y0 / CHUNK); cy * CHUNK < gr.y1; cy++) for (let cx = Math.floor(gr.x0 / CHUNK); cx * CHUNK < gr.x1; cx++) {
      const r = { x0: cx * CHUNK - MG, y0: cy * CHUNK - MG, x1: (cx + 1) * CHUNK + MG, y1: (cy + 1) * CHUNK + MG };
      const src = shoot(scene, r);
      for (const z of [1, 2]) {
        const img = down(src, SS / z);
        const n = CHUNK * z / CHUNK; // chunks per side at this zoom
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const cut = { x: MG * z + i * CHUNK, y: MG * z + j * CHUNK, w: CHUNK, h: CHUNK };
          const sub = toCanvas(img, cut);
          const data = sub.getContext('2d').getImageData(0, 0, CHUNK, CHUNK).data;
          let any = false; for (let k = 3; k < data.length; k += 4) if (data[k] > 2) { any = true; break; }
          if (!any) continue;
          const gx = cx * CHUNK * z + i * CHUNK, gy = cy * CHUNK * z + j * CHUNK;
          const name = `z${z}-ground-r${q}-${gx}_${gy}.webp`;
          encode(sub, name);
          M.z[z].ground[q].push({ f: name, x: gx, y: gy, w: CHUNK, h: CHUNK });
          groundBytesPx += CHUNK * CHUNK;
        }
      }
    }

    // ---- static objects, each alone, ground as hold-out (so nothing below the ground shows)
    for (const z of [1, 2]) M.z[z].objects[q] = [];
    const addObj = (s, info) => {
      for (const z of [1, 2]) {
        if (!s[z]) continue;
        const rec = { ...info, canvas: s[z].canvas, x: s[z].x, y: s[z].y };
        sprites[z].objects.push(rec);
        M.z[z].objects[q].push(rec);
      }
    };
    for (const o of objects) {
      only(new Map([[o, 'show'], ...ground.map((g) => [g, 'hold'])]));
      const b = boxOf(o);
      const c = b.getCenter(new THREE.Vector3()); c.y = 0;
      const local = c.clone(); { const [x, z] = turned(local, -q); local.set(x, 0, z); } // back to park space for the anchor
      const h = b.max.y, fp = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      const kind = h > 6 ? 'tree' : h > 4 && fp < 1 ? 'lamp' : h < 1.2 && fp < 0.7 ? 'bin' : h < 1.2 && fp < 2 ? 'bench' : h < 2.2 && fp < 3.2 ? 'shrub' : fp > 2.6 && h < 2.8 ? 'table' : h > 2.2 && fp < 2.6 ? 'fountain' : 'kiosk';
      addObj(sprite(rectOf(b)), { k: kind, d: depthOf(local, q), s: 0 });
    }
    // ---- coaster, station and queue rails cut into 6 m columns (one sprite per column, sorted by its centre)
    {
      only(new Map([...chop.map((c) => [c, 'show']), ...ground.map((g) => [g, 'hold'])]));
      world.rotation.y = 0; world.updateMatrixWorld(true);
      const cb = new THREE.Box3(); for (const c of chop) cb.union(boxOf(c));
      world.rotation.y = q * Math.PI / 2; world.updateMatrixWorld(true);
      const CELL = 6;
      for (let x0 = Math.floor((cb.min.x + 21) / CELL) * CELL - 21; x0 < cb.max.x; x0 += CELL) for (let z0 = Math.floor((cb.min.z + 21) / CELL) * CELL - 21; z0 < cb.max.z; z0 += CELL) {
        const planes = [[1, 0, -x0], [-1, 0, x0 + CELL], [0, 1, -z0], [0, -1, z0 + CELL]].map(([nx, nz, k]) => new THREE.Plane(new THREE.Vector3(nx, 0, nz), k).applyMatrix4(world.matrixWorld));
        renderer.clippingPlanes = planes;
        const colBox = new THREE.Box3(new THREE.Vector3(x0, cb.min.y, z0), new THREE.Vector3(x0 + CELL, cb.max.y, z0 + CELL));
        const wb = colBox.clone().applyMatrix4(world.matrixWorld);
        const s = sprite(rectOf(wb));
        renderer.clippingPlanes = [];
        addObj(s, { k: 'coaster', d: depthOf(new THREE.Vector3(x0 + CELL / 2, 0, z0 + CELL / 2), q), s: 0 });
      }
    }
    // ---- carousel base and canopy (per rotation: the fence gap and the floor planks are not round)
    {
      const cb = boxOf(car);
      const d = depthOf(carCentre, q);
      only(new Map([[base, 'show'], ...ground.map((g) => [g, 'hold'])]));
      addObj(sprite(rectOf(cb)), { k: 'carousel-base', d, s: 0 });
      only(new Map([[roof, 'show'], ...ground.map((g) => [g, 'hold'])]));
      addObj(sprite(rectOf(cb)), { k: 'carousel-roof', d, s: 2 });
      const [ax, ay] = anchorPx(carCentre, q);
      for (const z of [1, 2]) M.z[z].objects[q].push({ k: 'carousel-ring', d, s: 1, x: Math.round(ax * z), y: Math.round(ay * z) });
    }
    log(`rotation ${q}: ${((performance.now() - tq) / 1000).toFixed(1)} s`);
  }

  // ---- carousel ring, 16 frames, rotation 0 only: base and canopy hold out (column and roof cover the horses);
  // the shadow map is redrawn per frame so horse shadows move with the horses
  {
    const tr = performance.now();
    world.rotation.y = 0; world.updateMatrixWorld(true);
    only(new Map([[ring, 'show'], [base, 'hold'], [roof, 'hold'], ...ground.map((g) => [g, 'hold'])]));
    const cb = boxOf(car);
    const [ax, ay] = anchorPx(carCentre, 0);
    for (let f = 0; f < ringFrames; f++) {
      setRing(f);
      renderer.shadowMap.needsUpdate = true;
      const s = sprite(rectOf(cb));
      for (const z of [1, 2]) {
        const rec = { canvas: s[z].canvas, ox: s[z].x - Math.round(ax * z), oy: s[z].y - Math.round(ay * z) };
        sprites[z].ring.push(rec); M.z[z].ring.push(rec);
      }
    }
    log(`carousel ring: ${((performance.now() - tr) / 1000).toFixed(1)} s`);
  }

  // ---- guests: own small scene, a shadow catcher under the feet, same sun and sky; feet at the origin
  {
    const tg = performance.now();
    const gs = new THREE.Scene();
    lights(gs, 4.25, 512); // same shadow texel size as the park (68 m / 4096)
    gs.environment = env;
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.42 }));
    catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; gs.add(catcher);
    const LOOKS = [
      { female: false, sleeves: 'short', bottomType: 'shorts' },
      { female: true, bottomType: 'trousers', hairStyle: 'long' },
      { child: true, female: false, hat: 'cap', bottomType: 'shorts' },
      { female: true, bottomType: 'dress', hat: 'sunhat' },
      { female: false, age: 2, bottomType: 'trousers', sleeves: 'long' },
      { child: true, female: true, hairStyle: 'pigtails', bottomType: 'skirt' },
      { female: false, hat: 'bucket', backpack: '#2b3a55', bottomType: 'trousers' },
      { female: true, hairStyle: 'pony', bottomType: 'shorts', bag: '#7b5a3c' },
    ];
    const rect = { x0: -34, y0: -56, x1: 52, y1: 22 }; // feet at (0,0); the shadow falls to screen right
    const list = { 1: [], 2: [] };
    for (let o = 0; o < outfits; o++) {
      const look = randomLook(500 + o * 17, { balloon: null, ...LOOKS[o % LOOKS.length] });
      for (let d = 0; d < dirs; d++) for (let f = 0; f < frames; f++) {
        const p = person(look, { kind: 'walk', phase: (f / frames) * Math.PI * 2 });
        p.rotation.y = d * Math.PI / 4; // faces (sin, cos) of this yaw, i.e. +z at 0
        gs.add(p);
        setEnv(p, env);
        renderer.shadowMap.needsUpdate = true;
        const src = shoot(gs, rect);
        gs.remove(p);
        for (const z of [1, 2]) {
          const img = down(src, SS / z);
          const bb = bbox(img);
          if (touchesEdge(img, bb)) log(`warning: guest ${o}/${d}/${f} touches the sprite edge at zoom ${z}`);
          const rec = { canvas: toCanvas(img, bb), ox: rect.x0 * z + bb.x, oy: rect.y0 * z + bb.y };
          list[z].push(rec); sprites[z].guests.push(rec);
        }
      }
      log(`guest outfit ${o + 1}/${outfits}`);
    }
    for (const z of [1, 2]) M.z[z].guests = { n: [outfits, dirs, frames], frames: list[z] };
    log(`guests: ${((performance.now() - tg) / 1000).toFixed(1)} s`);
  }

  // ---- pack and encode
  const pages = {};
  for (const z of [1, 2]) {
    pages[z] = {};
    for (const k of ['objects', 'ring', 'guests']) pages[z][k] = pack(sprites[z][k], `z${z}-${k}`);
    M.z[z].objects = M.z[z].objects.map((list) => list.map((s) => (s.canvas ? strip(s, ['k', 'd', 's', 'x', 'y']) : s)).sort((a, b) => a.d - b.d || a.s - b.s));
    M.z[z].ring = M.z[z].ring.map((s) => strip(s, ['ox', 'oy']));
    M.z[z].guests.frames = M.z[z].guests.frames.map((s) => strip(s, ['ox', 'oy']));
  }
  const manifest = {
    format: 'realistic-phone-test/1',
    look: 'T Daylight real (round 6/7)',
    pxPerMetre: PPM1, tile: [104, 52], pitchDeg: 30, yawDeg: 45, rotations: 4, zooms: [1, 2],
    projection: 'sx = pxPerMetre*(X-Z)/sqrt2, sy = pxPerMetre*(0.5*(X+Z)/sqrt2 - cos30*Y), X/Z turned by q*90 deg (x\' = x cos + z sin, z\' = -x sin + z cos); depth = x\'+z\'',
    carousel: { centre: [carCentre.x, carCentre.z], frames: ringFrames, periodDeg: 72, note: 'ring frames are baked once (rotation 0) and serve all four rotations' },
    guests: { outfits, dirs, frames, yaw: 'dir d faces (sin, cos) of d*45 deg in the turned park; frame f = walk phase f/8 of a stride pair', feetY: 0.05 },
    pages,
    z: M.z,
    stats: { renders: renderCount, renderSeconds: +(renderMs / 1000).toFixed(1), groundChunkPixels: groundBytesPx },
    bakeSeconds: +((performance.now() - T0) / 1000).toFixed(1),
  };
  window.__manifest = manifest;
  return { files: [...files.keys()], seconds: manifest.bakeSeconds, renders: renderCount };
};
window.getFile = (name) => files.get(name);
window.getManifest = () => JSON.stringify(window.__manifest);
window.bakeReady = true;
