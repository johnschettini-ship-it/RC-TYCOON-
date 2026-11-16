/**
 * The in-browser half of the stage 1 bake (driven by tools/art3d/bake.mjs through bake.html). Bundled by rolldown
 * (Vite's bundler, already a dependency) with `three` aliased to the vendored build, so the kit's bare `three`
 * imports and bakeView.js's `./camera.ts` import resolve; bake.mjs writes the bundle to dist-art/.build/.
 *
 * Every picture uses the game's own projection (`bakeCamera(0, d)`): the camera never turns; a view turn is baked
 * by turning the model the other way round its anchor, so the sun (from the screen's left, 52° high, as round 6
 * "T Daylight real") lights every turn the same way. One render at 2 × the largest density, box-filtered down to
 * each density (2× supersampling for density 4, 4× for density 2), with the light, AO and grade of round 6.
 *
 * Anchors: an item puts its game anchor (the screen point today's sprite is anchored to) at the three.js origin,
 * so a frame's ox/oy is simply the projected position of its top-left (indexFormat.ts: offset FROM the anchor TO
 * the top-left, density px). Rects are snapped so the anchor falls on a pixel corner at every density.
 *
 * Frame keys follow the reader's contract (src/render/real/look.ts, Task 7 header); see the item modules.
 */
import * as THREE from 'three';
import { Post } from './post.js';
import { makeBakeCamera } from './bakeView.js';
import { bakeCamera, type BakeDensity } from './camera';
import { ITEMS } from './items/index.js';
import type { RealKind, RealFrame } from '../../src/render/real/indexFormat';
import { greyPng } from './png';

// ------------------------------------------------------------------ look constants (round 6 "T Daylight real")
const VT = {
  sun: { color: '#fff4e2', intensity: 3.4, el: 52, az: 128 },
  hemi: { sky: '#bcd6f2', ground: '#6a7a4a', intensity: 0.35 },
  sky: { top: '#5d93d6', horizon: '#cfe1f2', ground: '#6f7660', sunDisc: 1 },
  envIntensity: 0.9,
  post: { exposure: 1.0, aoStrength: 0.75, aoRadius: 0.9, aoIntensity: 1.0, saturation: 1.05, contrast: 1.04, lift: [0, 0, 0], gain: [1, 1, 1] },
};
const PAGE = 2048;
const PAD = 2;
const ALPHA_MIN = 3;
const log = (...a: unknown[]): void => console.log('[bake]', ...a);

// ------------------------------------------------------------------ renderer and post
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(16, 16, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.localClippingEnabled = false;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const post = new Post(renderer, 16, 16); // only its AO passes are used; the render targets are ours

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
  vec3 hdr = s.rgb / s.a;
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
  const P = VT.post;
  const m = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: COMPOSE, depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: null }, tAO: { value: null }, aoStrength: { value: P.aoStrength }, exposure: { value: P.exposure },
      saturation: { value: P.saturation }, contrast: { value: P.contrast }, lift: { value: new THREE.Vector3(...P.lift) }, gain: { value: new THREE.Vector3(...P.gain) },
    },
  });
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  return { m, s };
})();

interface Targets { scene: any; ao: any; ao2: any; out: any }
const rtCache = new Map<string, Targets>();
function targets(W: number, H: number): Targets {
  const key = `${W}x${H}`;
  const hit = rtCache.get(key);
  if (hit) return hit;
  if (rtCache.size > 6) {
    for (const t of rtCache.values()) for (const r of Object.values(t)) r.dispose();
    rtCache.clear();
  }
  const hf = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const scene = new THREE.WebGLRenderTarget(W, H, hf);
  scene.depthTexture = new THREE.DepthTexture(W, H, THREE.FloatType);
  const t = { scene, ao: new THREE.WebGLRenderTarget(W, H, hf), ao2: new THREE.WebGLRenderTarget(W, H, hf), out: new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }) };
  rtCache.set(key, t);
  return t;
}

// ------------------------------------------------------------------ scene: sun, sky light, environment, ground plane
const sunDir = (): any => {
  const el = THREE.MathUtils.degToRad(VT.sun.el);
  const az = THREE.MathUtils.degToRad(VT.sun.az);
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
};
let envTex: any = null;
function skyEnv(): any {
  if (envTex) return envTex;
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
  envTex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return envTex;
}

/** A bake scene: `world` is scaled by the bake camera's height stretch; items add their models to it. */
export interface BakeScene {
  scene: any;
  world: any;
  sun: any;
  ground: any;
  catcher: any;
}

function newScene(): BakeScene {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const sun = new THREE.DirectionalLight(VT.sun.color, VT.sun.intensity);
  sun.castShadow = true;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.layers.enableAll();
  scene.add(sun, sun.target, new THREE.HemisphereLight(VT.hemi.sky, VT.hemi.ground, VT.hemi.intensity));
  scene.environment = skyEnv();
  // Hold-out ground: writes depth but no colour, so nothing below the ground shows and AO sees the ground.
  const holdMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), holdMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  world.add(ground);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.5 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  catcher.visible = false;
  world.add(catcher);
  return { scene, world, sun, ground, catcher };
}

function setEnv(obj: any): void {
  obj.traverse((o: any) => {
    if (!o.material) return;
    for (const m of [].concat(o.material) as any[]) if ('envMapIntensity' in m) m.envMapIntensity = VT.envIntensity;
  });
}

// world box of an object, counting every instance of instanced meshes (Box3.setFromObject does not)
function boxOf(obj: any): any {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  const m = new THREE.Matrix4();
  obj.traverse((o: any) => {
    if (!o.isMesh || !o.geometry || !o.visible || o.userData.noBox) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); box.union(b.copy(o.geometry.boundingBox).applyMatrix4(m)); }
    } else box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}

// ------------------------------------------------------------------ shooting
let densities: BakeDensity[] = [2, 4];
let renderD = 8; // render density: 2 × the largest baked density
let snapF = 4; // rect snap in render px: renderD / smallest density
let renderCount = 0;
let renderMs = 0;

interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Render px rect (relative to the anchor at the origin) of a world box; z (three y) is already height-scaled. */
function rectOfBox(box: any, cam: ReturnType<typeof bakeCamera>, margin: number): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const X of [box.min.x, box.max.x]) for (const Y of [box.min.y, box.max.y]) for (const Z of [box.min.z, box.max.z]) {
    const p = cam.project(X, Z, Y / cam.heightScale);
    x0 = Math.min(x0, p.sx); x1 = Math.max(x1, p.sx); y0 = Math.min(y0, p.sy); y1 = Math.max(y1, p.sy);
  }
  const F = snapF;
  return { x0: Math.floor(x0 / F - margin) * F, y0: Math.floor(y0 / F - margin) * F, x1: Math.ceil(x1 / F + margin) * F, y1: Math.ceil(y1 / F + margin) * F };
}

function placeSun(bs: BakeScene, box: any): void {
  const c = box.getCenter(new THREE.Vector3());
  const ext = Math.max(2, box.getSize(new THREE.Vector3()).length() * 0.6);
  const sun = bs.sun;
  sun.position.copy(sunDir()).multiplyScalar(ext + 60).add(c);
  sun.target.position.copy(c);
  sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 2 * ext + 140;
  sc.updateProjectionMatrix();
  // about 1.7 cm per shadow texel, as the round 6 park (68 m / 4096)
  const size = Math.min(4096, Math.max(512, 2 ** Math.ceil(Math.log2((2 * ext) / 0.017))));
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
}

interface Raw { px: Uint8Array; W: number; H: number }

/** The largest render target side the GPU draws: past it the render reads back blank (no error). */
function maxRenderPx(): number {
  const gl = renderer.getContext();
  const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  return Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, vp[0] as number, vp[1] as number);
}
const tooBig = (r: Rect): boolean => Math.max(r.x1 - r.x0, r.y1 - r.y0) > maxRenderPx();

function render(bs: BakeScene, rect: Rect, mode: 'color' | 'flat'): Raw {
  const t0 = performance.now();
  const W = rect.x1 - rect.x0;
  const H = rect.y1 - rect.y0;
  if (tooBig(rect)) throw new Error(`a ${W}x${H} px render is over the GPU's ${maxRenderPx()} px limit (it would read back blank)`);
  const cam = bakeCamera(0, renderD as BakeDensity);
  const { camera, modelScale } = makeBakeCamera(THREE, cam, { widthPx: W, heightPx: H, originPx: [-rect.x0, -rect.y0] });
  bs.world.scale.copy(modelScale);
  const t = targets(W, H);
  const px = new Uint8Array(W * H * 4);
  if (mode === 'flat') {
    renderer.setRenderTarget(t.out);
    renderer.render(bs.scene, camera);
    renderer.readRenderTargetPixels(t.out, 0, 0, W, H, px);
  } else {
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(t.scene);
    renderer.render(bs.scene, camera);
    const P = VT.post;
    const ao = post.pAO.u;
    const aob = post.pAOB.u;
    ao.tDepth.value = t.scene.depthTexture; ao.res.value.set(W, H);
    ao.frustum.value.set(camera.right - camera.left, camera.top - camera.bottom); ao.near.value = camera.near; ao.far.value = camera.far;
    ao.radius.value = P.aoRadius; ao.intensity.value = P.aoIntensity;
    renderer.setRenderTarget(t.ao); renderer.render(post.pAO.s, post.cam);
    aob.tAO.value = t.ao.texture; aob.tDepth.value = t.scene.depthTexture; aob.res.value.set(W, H); aob.near.value = camera.near; aob.far.value = camera.far;
    renderer.setRenderTarget(t.ao2); renderer.render(post.pAOB.s, post.cam);
    comp.m.uniforms.tColor.value = t.scene.texture; comp.m.uniforms.tAO.value = t.ao2.texture;
    renderer.setRenderTarget(t.out); renderer.render(comp.s, post.cam);
    renderer.readRenderTargetPixels(t.out, 0, 0, W, H, px);
  }
  renderer.setRenderTarget(null);
  renderCount++;
  renderMs += performance.now() - t0;
  return { px, W, H };
}

interface Img { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number }

/** Box filter by f (premultiplied average), flips to top-down rows, returns straight-alpha RGBA. */
function down(src: Raw, f: number): Img {
  const { px, W, H } = src;
  const w = W / f, h = H / f, out = new Uint8ClampedArray(w * h * 4), n = f * f;
  for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let ky = 0; ky < f; ky++) {
      const sy = H - 1 - (oy * f + ky);
      let i = (sy * W + ox * f) * 4;
      for (let kx = 0; kx < f; kx++, i += 4) { const al = px[i + 3] as number; r += (px[i] as number) * al; g += (px[i + 1] as number) * al; b += (px[i + 2] as number) * al; a += al; }
    }
    const o = (oy * w + ox) * 4;
    if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = a / n; }
  }
  return { data: out, w, h };
}

interface BBox { x: number; y: number; w: number; h: number }
function bbox(img: Img): BBox | null {
  const { data, w, h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((data[(y * w + x) * 4 + 3] as number) >= ALPHA_MIN) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function toCanvas(img: Img, r: BBox, opaqueBlack = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = r.w; c.height = r.h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const sub = g.createImageData(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const s = ((r.y + y) * img.w + r.x) * 4;
    sub.data.set(img.data.subarray(s, s + r.w * 4), y * r.w * 4);
  }
  if (opaqueBlack) for (let i = 0; i < sub.data.length; i += 4) { const v = sub.data[i] as number; sub.data[i + 1] = v; sub.data[i + 2] = v; sub.data[i + 3] = 255; }
  g.putImageData(sub, 0, 0);
  return c;
}
/** Soft shadow edge: a gaussian blur of `px` density px (canvas filter). */
function blur(img: Img, px: number): Img {
  const a = document.createElement('canvas'); a.width = img.w; a.height = img.h;
  (a.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.w, img.h), 0, 0);
  const b = document.createElement('canvas'); b.width = img.w; b.height = img.h;
  const g = b.getContext('2d') as CanvasRenderingContext2D;
  g.filter = `blur(${px.toFixed(1)}px)`;
  g.drawImage(a, 0, 0);
  return { data: g.getImageData(0, 0, img.w, img.h).data, w: img.w, h: img.h };
}
const touches = (img: Img, r: BBox): boolean => r.x <= 0 || r.y <= 0 || r.x + r.w >= img.w || r.y + r.h >= img.h;

/** One baked picture per density: the trimmed canvas, its mask (if any) and its offset from the anchor. */
export interface Pic { canvas: HTMLCanvasElement; mask: HTMLCanvasElement | null; ox: number; oy: number }
export type Shot = Partial<Record<BakeDensity, Pic | null>>;

// material swaps for the mask pass and the shadow pass
/**
 * What a mesh (or each material of a material array) takes in the mask pass: true / 1 white (all of it takes the
 * colour), false / 0 black, or `{ map }` a mask map laid out as the material's own map (white where the colour goes).
 */
export type MaskSpec = boolean | 0 | 1 | { map: any };
// Mask materials keep what decides which pixels a material covers: its side (an open cone seen from inside) and its
// alpha test with its map (a scalloped valance), so the mask covers exactly the pixels the picture shows. A see-through
// material that is not the part (glass, opacity < 0.6) is left out of the mask pass, so the part behind it still masks.
const maskMats = new Map<any, Map<unknown, any>>();
const FLAT_OUT = (s: any): void => { s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4( diffuse, 1.0 );'); };
const MAP_OUT = (s: any): void => { s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor.a = 1.0;'); };
function maskMat(orig: any, spec: MaskSpec): any {
  const per = maskMats.get(orig) ?? new Map<unknown, any>();
  maskMats.set(orig, per);
  const key = typeof spec === 'object' ? spec.map : !!spec;
  const hit = per.get(key);
  if (hit) return hit;
  const side = orig?.side ?? THREE.FrontSide;
  const alphaTest = orig?.alphaTest ?? 0;
  let m: any;
  if (typeof spec === 'object') {
    // the mask map in the place of the material's map, with its repeat and offset (its alpha carries the same edge)
    const t = spec.map.clone();
    const src = orig?.map;
    if (src) { t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.center.copy(src.center); t.rotation = src.rotation; t.wrapS = src.wrapS; t.wrapT = src.wrapT; }
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    m = new THREE.MeshBasicMaterial({ map: t, side, alphaTest });
    m.onBeforeCompile = MAP_OUT;
  } else if (!spec && orig?.transparent && (orig.opacity ?? 1) < 0.6) {
    m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  } else {
    m = new THREE.MeshBasicMaterial({ color: spec ? 0xffffff : 0x000000, side, alphaTest, map: alphaTest > 0 && orig?.map ? orig.map : null });
    m.onBeforeCompile = FLAT_OUT;
  }
  per.set(key, m);
  return m;
}
function maskOf(mesh: any, spec: MaskSpec | MaskSpec[]): any {
  const mats = mesh.material;
  if (Array.isArray(mats)) return mats.map((x: any, i: number) => maskMat(x, Array.isArray(spec) ? (spec[i] ?? false) : spec));
  return maskMat(mats, Array.isArray(spec) ? (spec[0] ?? false) : spec);
}
function swap(target: any, pick: (mesh: any) => any): () => void {
  const saved: [any, any][] = [];
  target.traverse((o: any) => { if (o.isMesh) { saved.push([o, o.material]); o.material = pick(o); } });
  return () => { for (const [o, m] of saved) o.material = m; };
}
// Shadow pass: the object keeps casting (the shadow map uses its own depth material, copying map and alphaTest from
// these clones) but draws neither colour nor depth, so only the catcher under it shows.
const ghostMats = new Map<any, any>();
function ghostOf(m: any): any {
  let g = ghostMats.get(m);
  if (!g) { g = m.clone(); g.colorWrite = false; g.depthWrite = false; ghostMats.set(m, g); }
  return g;
}
const ghost = (mesh: any): any => (Array.isArray(mesh.material) ? mesh.material.map(ghostOf) : ghostOf(mesh.material));

export interface ShootOpts {
  /** Object whose box sets the picture rect (default: every visible item in the world). */
  target: any;
  /** Mask pass: per mesh, white (true), black (false), a mask map ({ map }), or one of those per material (array). */
  masked?: (mesh: any) => MaskSpec | MaskSpec[];
  /** Extra margin in snap units. */
  margin?: number;
  /** Keep the object's own contact shadow in the picture (guests): the shadow catcher replaces the hold-out. */
  ownShadow?: boolean;
  /** No hold-out ground (pieces stacked in the air, e.g. support segments: no ground AO at their ends). */
  noGround?: boolean;
}

/** Render the visible models of `bs` (anchor at the origin) and cut one picture per density. */
function shoot(bs: BakeScene, o: ShootOpts, shadow = false): Shot {
  const cam = bakeCamera(0, renderD as BakeDensity);
  bs.world.scale.set(1, cam.heightScale, 1);
  const box = boxOf(o.target);
  if (box.isEmpty()) return {};
  placeSun(bs, box);
  // a shadow lies on the ground round the object, up to ~1.4 × its height away
  let sb = box;
  if (o.ownShadow) sb = box.clone().expandByVector(new THREE.Vector3(box.max.y * 1.4, 0, box.max.y * 1.4));
  if (shadow) {
    const reach = box.max.y * 1.4 + 0.5;
    sb = new THREE.Box3(new THREE.Vector3(box.min.x - reach, 0, box.min.z - reach), new THREE.Vector3(box.max.x + reach, 0.01, box.max.z + reach));
    // Round a tall object that reach passes the GPU's render size (the 26 m drop tower's was 10456 px wide against
    // 8192: the read-back was blank and the tower had no shadow set). Then only the side the shadow falls on: the
    // footprint, and the footprint moved `reach` away from the sun.
    if (tooBig(rectOfBox(sb, cam, o.margin ?? 2))) {
      const s = sunDir();
      const away = new THREE.Vector3(-s.x, 0, -s.z).normalize().multiplyScalar(reach);
      const foot = new THREE.Box3(new THREE.Vector3(box.min.x - 0.5, 0, box.min.z - 0.5), new THREE.Vector3(box.max.x + 0.5, 0.01, box.max.z + 0.5));
      sb = foot.clone().union(foot.clone().translate(away));
    }
  }
  let rect = rectOfBox(sb, cam, o.margin ?? 2);
  for (let tries = 0; tries < 3; tries++) {
    let restore: (() => void) | null = null;
    if (shadow) restore = swap(o.target, ghost);
    const catcher = shadow || !!o.ownShadow;
    bs.ground.visible = !catcher && !o.noGround;
    bs.catcher.visible = catcher;
    const src = render(bs, rect, 'color');
    if (restore) restore();
    let maskSrc: Raw | null = null;
    if (o.masked && !shadow) {
      const restore = swap(o.target, (m) => maskOf(m, o.masked!(m)));
      maskSrc = render(bs, rect, 'flat');
      restore();
    }
    bs.ground.visible = true;
    bs.catcher.visible = false;
    const out: Shot = {};
    let grow = false;
    for (const d of densities) {
      const f = renderD / d;
      const img = shadow ? blur(down(src, f), 0.12 * 11.31 * d) : down(src, f);
      const bb = bbox(img);
      if (!bb) { out[d] = null; continue; }
      if (touches(img, bb)) { grow = true; break; }
      const mask = maskSrc ? toCanvas(down(maskSrc, f), bb, true) : null;
      out[d] = { canvas: toCanvas(img, bb), mask, ox: rect.x0 / f + bb.x, oy: rect.y0 / f + bb.y };
    }
    if (!grow) {
      if (shadow && densities.every((d) => !out[d])) throw new Error('the shadow picture is empty at every density');
      return out;
    }
    const gx = Math.ceil((rect.x1 - rect.x0) * 0.25 / snapF) * snapF, gy = Math.ceil((rect.y1 - rect.y0) * 0.25 / snapF) * snapF;
    rect = { x0: rect.x0 - gx, y0: rect.y0 - gy, x1: rect.x1 + gx, y1: rect.y1 + gy };
  }
  throw new Error('picture still touches its edge after growing the rect');
}

// ------------------------------------------------------------------ sets, packing and files
interface SetPic { keys: string[]; shot: Shot }
interface SetB { kind: RealKind; item: string; rot: 0 | 1 | 2 | 3 | 'all'; pics: SetPic[]; masked: boolean; baseColour?: string; maskLevels?: number }
let sets: SetB[] = [];
const files = new Map<string, string>(); // name -> data URL
const pending: Promise<void>[] = []; // mask files still being written (greyPng is async)

/**
 * Tint mask weight levels by default: 0, 1/7 .. 1 (exact 0 and 1 on and off the part, soft steps only at edges). A
 * ride whose mask has much edge (the carousel's 48 stripes) may bake fewer (bakeObject maskLevels) to keep its size rule.
 */
const MASK_LEVELS = 8;
/**
 * A mask sheet is quantised to its levels of weight and written lossless as an 8-bit grey PNG (png.ts). A lossy WebP
 * mask left a haze of 1-5/255 weights over its black and ringing at its edges; Chromium's lossless WebP was exact but
 * large on these mostly black sheets (drop tower: 0.96 MB for a mask covering 2% of its pixels; grey PNG 0.13 MB).
 */
function encodeMask(canvas: HTMLCanvasElement, name: string, levels = MASK_LEVELS): void {
  if (!Number.isInteger(levels) || levels < 2 || levels > 256) throw new Error(`${name}: mask levels must be 2..256, got ${levels}`);
  const d = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height).data;
  const grey = new Uint8Array(canvas.width * canvas.height);
  const step = 255 / (levels - 1);
  for (let i = 0; i < grey.length; i++) grey[i] = Math.round(Math.round((d[i * 4] as number) / step) * step);
  pending.push(greyPng(grey, canvas.width, canvas.height, zlib).then((png) => { files.set(name, `data:image/png;base64,${base64(png)}`); }));
}
/** zlib (RFC 1950) compression in the page: CompressionStream('deflate'). */
async function zlib(raw: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function encode(canvas: HTMLCanvasElement, name: string, quality = 0.85): void {
  const url = canvas.toDataURL('image/webp', quality);
  if (!url.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
  files.set(name, url);
}

interface OutSet {
  kind: RealKind; item: string; density: BakeDensity; rot: 0 | 1 | 2 | 3 | 'all';
  sheets: { file: string; w: number; h: number; mask?: string }[];
  frames: Record<string, RealFrame>;
  pictures: number;
  /** Rides: the colour part's designed colour (index `baseColour`). */
  baseColour?: string;
  /**
   * Masked sets: the mask's share of the set's drawn pixels (mask weight summed over pixels with alpha, / their count),
   * and of the pictures, how many have no mask at all (bake report; a mask that covers nothing is a failed bake).
   */
  maskCoverage?: number;
  emptyMasks?: number;
}

function packSet(s: SetB, d: BakeDensity, prefix: string): OutSet {
  const pics = s.pics.map((p) => ({ keys: p.keys, pic: p.shot[d] })).filter((p): p is { keys: string[]; pic: Pic } => !!p.pic);
  const order = pics.slice().sort((a, b) => b.pic.canvas.height - a.pic.canvas.height || b.pic.canvas.width - a.pic.canvas.width);
  // skyline bottom-left packing: tall narrow pictures (supports) and wide low ones share a sheet without the empty
  // space a shelf packer leaves above the shorter pictures of a shelf
  interface Seg { x: number; y: number; w: number }
  interface Page { items: { p: Pic; x: number; y: number; keys: string[] }[]; sky: Seg[]; usedW: number; usedH: number }
  // sheet width: about square for the set's total picture area, at least the widest picture, at most PAGE
  const area = pics.reduce((a, p) => a + (p.pic.canvas.width + PAD) * (p.pic.canvas.height + PAD), 0);
  const widest = pics.reduce((a, p) => Math.max(a, p.pic.canvas.width + 2 * PAD), 0);
  const pageW = Math.min(PAGE, Math.max(widest, Math.ceil(Math.sqrt(area * 1.15))));
  const newPage = (): Page => ({ items: [], sky: [{ x: PAD, y: PAD, w: pageW - PAD }], usedW: 0, usedH: 0 });
  const fit = (pg: Page, w: number, h: number): { x: number; y: number; i: number } | null => {
    let best: { x: number; y: number; i: number } | null = null;
    for (let i = 0; i < pg.sky.length; i++) {
      const x = (pg.sky[i] as Seg).x;
      if (x + w + PAD > pageW) break;
      let y = 0, j = i, left = w + PAD;
      while (left > 0 && j < pg.sky.length) { const sg = pg.sky[j] as Seg; y = Math.max(y, sg.y); left -= sg.w; j++; }
      if (left > 0 || y + h + PAD > PAGE) continue;
      if (!best || y < best.y || (y === best.y && x < best.x)) best = { x, y, i };
    }
    return best;
  };
  const place = (pg: Page, x: number, y: number, w: number, h: number): void => {
    const x1 = x + w + PAD;
    const next: Seg[] = [];
    for (const sg of pg.sky) {
      const s1 = sg.x + sg.w;
      if (s1 <= x || sg.x >= x1) { next.push(sg); continue; }
      if (sg.x < x) next.push({ x: sg.x, y: sg.y, w: x - sg.x });
      if (s1 > x1) next.push({ x: x1, y: sg.y, w: s1 - x1 });
    }
    next.push({ x, y: y + h + PAD, w: w + PAD });
    next.sort((a, b) => a.x - b.x);
    const merged: Seg[] = [];
    for (const sg of next) { const last = merged[merged.length - 1]; if (last && last.y === sg.y && last.x + last.w === sg.x) last.w += sg.w; else merged.push({ ...sg }); }
    pg.sky = merged;
  };
  const pages: Page[] = [newPage()];
  for (const { keys, pic } of order) {
    const w = pic.canvas.width, h = pic.canvas.height;
    if (w + 2 * PAD > PAGE || h + 2 * PAD > PAGE) throw new Error(`${prefix}: picture ${w}x${h} too big for a ${PAGE} sheet`);
    let pg = pages[pages.length - 1] as Page;
    let at = fit(pg, w, h);
    if (!at) { pg = newPage(); pages.push(pg); at = fit(pg, w, h); }
    if (!at) throw new Error(`${prefix}: cannot place a ${w}x${h} picture`);
    place(pg, at.x, at.y, w, h);
    pg.items.push({ p: pic, x: at.x, y: at.y, keys });
    pg.usedW = Math.max(pg.usedW, at.x + w + PAD); pg.usedH = Math.max(pg.usedH, at.y + h + PAD);
  }
  const out: OutSet = { kind: s.kind, item: s.item, density: d, rot: s.rot, sheets: [], frames: {}, pictures: pics.length };
  if (s.baseColour !== undefined) out.baseColour = s.baseColour;
  if (s.masked) {
    let sum = 0, n = 0, empty = 0;
    for (const { pic } of pics) {
      const c = (pic.canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, pic.canvas.width, pic.canvas.height).data;
      const m = pic.mask ? (pic.mask.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, pic.canvas.width, pic.canvas.height).data : null;
      let ps = 0;
      for (let i = 0; i < c.length; i += 4) if ((c[i + 3] as number) > 0) { n++; const v = m ? (m[i] as number) / 255 : 0; sum += v; ps += v; }
      if (ps === 0) empty++;
    }
    out.maskCoverage = n ? +(sum / n).toFixed(4) : 0;
    out.emptyMasks = empty;
  }
  pages.forEach((p, i) => {
    if (p.items.length === 0) return;
    const W = Math.min(PAGE, p.usedW), H = Math.min(PAGE, p.usedH);
    const file = `${prefix}-${i}.webp`;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    for (const it of p.items) g.drawImage(it.p.canvas, it.x, it.y);
    encode(c, file);
    const sheet: OutSet['sheets'][number] = { file, w: W, h: H };
    if (s.masked) {
      const mfile = `${prefix}-${i}-mask.png`;
      const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
      const mg = mc.getContext('2d') as CanvasRenderingContext2D;
      mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H);
      for (const it of p.items) if (it.p.mask) mg.drawImage(it.p.mask, it.x, it.y);
      encodeMask(mc, mfile, s.maskLevels);
      sheet.mask = mfile;
      out.sheets.push(sheet, { file: mfile, w: W, h: H });
    } else out.sheets.push(sheet);
    for (const it of p.items) {
      for (const k of it.keys) out.frames[k] = { sheet: file, sx: it.x, sy: it.y, w: it.p.canvas.width, h: it.p.canvas.height, ox: it.p.ox, oy: it.p.oy };
    }
  });
  return out;
}

// ------------------------------------------------------------------ the API items use
export interface BakeApi {
  THREE: any;
  densities: BakeDensity[];
  /** Input from the driver for this item (catalogue footprint and height, track geometry, poses). */
  input: any;
  newScene(): BakeScene;
  setEnv(obj: any): void;
  boxOf(obj: any): any;
  shoot(bs: BakeScene, o: ShootOpts): Shot;
  shootShadow(bs: BakeScene, target: any): Shot;
  /** Start a set; `add` registers one picture under every frame key that shows it. */
  set(kind: RealKind, item: string, rot: 0 | 1 | 2 | 3 | 'all', masked?: boolean, baseColour?: string, maskLevels?: number): { add(keys: string[], shot: Shot): void };
  /** Clip every render to vertical planes [nx, nz, k] (three.js x/z; kept where nx·x + nz·z + k >= 0); null clears. */
  clip(planes: [number, number, number][] | null): void;
  log(...a: unknown[]): void;
}

declare global {
  interface Window {
    bakeItem: (id: string, opts: { densities: BakeDensity[]; hash: string; input: unknown }) => Promise<{ sets: OutSet[]; files: string[]; renders: number; renderSeconds: number }>;
    takeFile: (name: string) => string | undefined;
    pngOf: (dataUrl: string) => Promise<string>;
    bakeReady: boolean;
  }
}

window.bakeItem = async (id, opts) => {
  const mod = (ITEMS as Record<string, { bake(api: BakeApi): void | Promise<void> }>)[id];
  if (!mod) throw new Error(`no bake module for item '${id}'`);
  densities = [...opts.densities].sort((a, b) => a - b) as BakeDensity[];
  renderD = 2 * (densities[densities.length - 1] as number);
  snapF = renderD / (densities[0] as number);
  sets = [];
  files.clear();
  pending.length = 0;
  renderCount = 0; renderMs = 0;
  const api: BakeApi = {
    THREE, densities, input: opts.input, newScene, setEnv, boxOf, log,
    shoot: (bs, o) => shoot(bs, o, false),
    shootShadow: (bs, target) => shoot(bs, { target }, true),
    clip(planes) {
      renderer.clippingPlanes = planes ? planes.map(([nx, nz, k]) => new THREE.Plane(new THREE.Vector3(nx, 0, nz), k)) : [];
    },
    set(kind, item, rot, masked = false, baseColour, maskLevels) {
      const s: SetB = { kind, item, rot, pics: [], masked };
      if (maskLevels !== undefined) s.maskLevels = maskLevels;
      if (baseColour !== undefined) s.baseColour = baseColour;
      sets.push(s);
      return { add: (keys, shot) => { s.pics.push({ keys, shot }); } };
    },
  };
  await mod.bake(api);
  const out: OutSet[] = [];
  for (const s of sets) for (const d of densities) {
    const o = packSet(s, d, `${s.kind}-${s.item}-${opts.hash}-d${d}-r${s.rot}`);
    if (o.sheets.length) out.push(o);
  }
  await Promise.all(pending.splice(0));
  return { sets: out, files: [...files.keys()], renders: renderCount, renderSeconds: +(renderMs / 1000).toFixed(1) };
};
window.takeFile = (name) => { const f = files.get(name); files.delete(name); return f; };
/** Convert a WebP data URL to a PNG data URL (for looking at sheets with tools that read PNG). */
window.pngOf = async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#7f8f7a'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
};
window.bakeReady = true;
