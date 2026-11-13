// Round 6 renderer: builds the park, lights it per variant, renders through an orthographic 2:1 camera
// with 2x supersampling, then downsizes and labels on a 2D canvas. Driven by render.cjs via window.renderShot().
import * as THREE from 'three';
import { buildPark, TILE } from './park.js';
import { SCENES } from './scenes.js';
import { Post } from './post.js';

// 2:1 dimetric: camera pitch 30 deg below the horizon (tile edges then run at atan(0.5) = 26.565 deg on screen),
// yaw 45 deg. At game zoom 1 a 3 m tile is a 104 x 52 px diamond: 104 px across the tile diagonal (3 * sqrt2 m).
export const PX_PER_M = 104 / (TILE * Math.SQRT2); // 24.51 px per metre in the screen plane at zoom 1
const PITCH = Math.PI / 6;

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // Color() gives linear values

export const VARIANTS = {
  t: {
    name: 'Daylight real', label: 'T  Daylight real',
    sun: { color: '#fff4e2', intensity: 3.4, el: 52, az: 128, soft: 'pcf' },
    hemi: { sky: '#bcd6f2', ground: '#6a7a4a', intensity: 0.35 },
    sky: { top: '#5d93d6', horizon: '#cfe1f2', ground: '#6f7660', sunDisc: 1 }, envIntensity: 0.9,
    post: { exposure: 1.0, aoStrength: 0.75, aoRadius: 0.9, aoIntensity: 1.0, bloom: 0.04, bloomThreshold: 3.5, saturation: 1.05, contrast: 1.04, vignette: 0.12, lift: [0, 0, 0], gain: [1, 1, 1], bgTop: lin('#c9dbe9'), bgBottom: lin('#e9eef0') },
  },
  u: {
    name: 'Miniature photo', label: 'U  Miniature photo (tilt-shift)',
    sun: { color: '#fff1dc', intensity: 3.6, el: 48, az: 128, soft: 'pcf' },
    hemi: { sky: '#bcd6f2', ground: '#6a7a4a', intensity: 0.35 },
    sky: { top: '#5d93d6', horizon: '#d6e6f4', ground: '#6f7660', sunDisc: 1 }, envIntensity: 0.9,
    post: { exposure: 1.08, aoStrength: 0.8, aoRadius: 0.9, aoIntensity: 1.0, bloom: 0.06, bloomThreshold: 3.0, saturation: 1.32, contrast: 1.12, vignette: 0.35, lift: [0.0, 0.0, 0.01], gain: [1.02, 1.0, 0.97], bgTop: lin('#c4d8e8'), bgBottom: lin('#eef1ee'),
      tilt: { focusY: 0.47, band: 0.07, soft: 0.22, maxR: 22 } },
  },
  v: {
    name: 'Evening lights', label: 'V  Evening lights', night: true,
    sun: { color: '#ff9f6a', intensity: 0.55, el: 9, az: 115, soft: 'vsm', radius: 10 },
    hemi: { sky: '#3f5a96', ground: '#1e2230', intensity: 0.5 },
    sky: { top: '#13234d', horizon: '#c4747a', ground: '#151a24', sunDisc: 0 }, envIntensity: 0.55,
    post: { exposure: 1.05, aoStrength: 0.65, aoRadius: 0.9, aoIntensity: 1.0, bloom: 0.55, bloomThreshold: 0.9, saturation: 1.08, contrast: 1.05, vignette: 0.4, lift: [0.0, 0.004, 0.02], gain: [1, 0.99, 1.02], bgTop: lin('#0e1a38'), bgBottom: lin('#3b3f66') },
  },
  w: {
    name: 'Clean architectural', label: 'W  Clean architectural',
    sun: { color: '#fbf8f2', intensity: 1.15, el: 62, az: 140, soft: 'vsm', radius: 18 },
    hemi: { sky: '#e9edf0', ground: '#b9b7ae', intensity: 0.9 },
    sky: { top: '#d7dde2', horizon: '#f2f2f0', ground: '#a8a79f', sunDisc: 0 }, envIntensity: 1.55,
    post: { exposure: 1.05, aoStrength: 1.0, aoRadius: 1.3, aoIntensity: 1.55, bloom: 0.0, bloomThreshold: 9, saturation: 0.78, contrast: 0.98, vignette: 0.05, lift: [0.012, 0.012, 0.014], gain: [0.99, 1.0, 1.01], bgTop: lin('#eef0f1'), bgBottom: lin('#f7f7f6') },
  },
  // ---- round 7: four new settings on 18 x 18 tile plots, all daylight; G = the guest line-up close-up
  x: {
    name: 'Seaside pier', label: 'X  Seaside pier', scene: 'pier',
    sun: { color: '#fff3e0', intensity: 3.4, el: 50, az: 128, soft: 'pcf' },
    hemi: { sky: '#bfd9f4', ground: '#8a8270', intensity: 0.4 },
    sky: { top: '#4f8fd8', horizon: '#d4e6f4', ground: '#6f7a78', sunDisc: 1 }, envIntensity: 0.95,
    post: { exposure: 1.0, aoStrength: 0.7, aoRadius: 0.9, aoIntensity: 1.0, bloom: 0.04, bloomThreshold: 3.5, saturation: 1.06, contrast: 1.04, vignette: 0.12, lift: [0, 0, 0], gain: [1, 1, 1], bgTop: lin('#c4daec'), bgBottom: lin('#eaf0f2') },
  },
  y: {
    name: 'Lakeside forest', label: 'Y  Lakeside forest', scene: 'forest',
    sun: { color: '#fff1da', intensity: 3.3, el: 47, az: 128, soft: 'pcf' },
    hemi: { sky: '#bcd6ea', ground: '#56603e', intensity: 0.4 },
    sky: { top: '#5a90cf', horizon: '#d2e2ec', ground: '#5d6650', sunDisc: 1 }, envIntensity: 0.9,
    post: { exposure: 1.02, aoStrength: 0.75, aoRadius: 0.9, aoIntensity: 1.0, bloom: 0.04, bloomThreshold: 3.5, saturation: 1.04, contrast: 1.04, vignette: 0.12, lift: [0, 0, 0], gain: [1, 1, 0.99], bgTop: lin('#c6d8e2'), bgBottom: lin('#e8eeec') },
  },
  z: {
    name: 'City plaza', label: 'Z  City plaza', scene: 'city',
    sun: { color: '#fff5e6', intensity: 3.4, el: 55, az: 128, soft: 'pcf' },
    hemi: { sky: '#c4d8ee', ground: '#8a8680', intensity: 0.45 },
    sky: { top: '#5b92d4', horizon: '#d8e6f2', ground: '#7a7872', sunDisc: 1 }, envIntensity: 1.0,
    post: { exposure: 1.0, aoStrength: 0.8, aoRadius: 0.9, aoIntensity: 1.05, bloom: 0.04, bloomThreshold: 3.5, saturation: 1.04, contrast: 1.05, vignette: 0.12, lift: [0, 0, 0], gain: [1, 1, 1], bgTop: lin('#cad9e6'), bgBottom: lin('#ecf0f2') },
  },
  aa: {
    name: 'Winter festival', label: 'AA  Winter festival', scene: 'winter',
    sun: { color: '#ffd9b0', intensity: 3.0, el: 21, az: 122, soft: 'pcf' },
    hemi: { sky: '#b9cdee', ground: '#d8dce6', intensity: 0.55 },
    sky: { top: '#6f97d0', horizon: '#f2dcc8', ground: '#c9ced8', sunDisc: 1 }, envIntensity: 1.0,
    post: { exposure: 0.95, aoStrength: 0.7, aoRadius: 0.9, aoIntensity: 1.0, bloom: 0.1, bloomThreshold: 2.2, saturation: 1.04, contrast: 1.05, vignette: 0.14, lift: [0.0, 0.004, 0.012], gain: [1.01, 1.0, 1.0], bgTop: lin('#c9d6e8'), bgBottom: lin('#eef0f4') },
  },
  g: {
    name: 'Guests', label: 'Guest line-up', scene: 'lineup',
    sun: { color: '#fff4e2', intensity: 3.2, el: 45, az: 128, soft: 'pcf' },
    hemi: { sky: '#bcd6f2', ground: '#7a7a6a', intensity: 0.5 },
    sky: { top: '#5d93d6', horizon: '#cfe1f2', ground: '#6f7660', sunDisc: 1 }, envIntensity: 1.0,
    post: { exposure: 1.0, aoStrength: 0.6, aoRadius: 0.3, aoIntensity: 1.0, bloom: 0.0, bloomThreshold: 9, saturation: 1.04, contrast: 1.03, vignette: 0.08, lift: [0, 0, 0], gain: [1, 1, 1], bgTop: lin('#dfe6ec'), bgBottom: lin('#f2f3f4') },
  },
};

let renderer, post, sizeKey;

function skyEnv(v) {
  // procedural sky dome -> PMREM environment (reflections + image-based ambient)
  const s = new THREE.Scene();
  const sun = sunDir(v);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(v.sky.top) }, hor: { value: new THREE.Color(v.sky.horizon) }, gnd: { value: new THREE.Color(v.sky.ground) }, sun: { value: sun }, disc: { value: v.sky.sunDisc } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 top, hor, gnd, sun; uniform float disc;
      void main(){ float y = d.y; vec3 c = y > 0.0 ? mix(hor, top, pow(y, 0.6)) : mix(hor, gnd, pow(-y, 0.4));
      float s = max(dot(normalize(d), sun), 0.0); c += disc * (pow(s, 600.0) * 60.0 + pow(s, 12.0) * 0.4) * vec3(1.0, 0.95, 0.85);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  return rt.texture;
}
function sunDir(v) {
  // az measured in degrees from +x toward -z... expressed relative to the camera so shadows fall the same way
  // in every rotation: the sun sits screen-left and behind the viewer's left shoulder.
  const el = THREE.MathUtils.degToRad(v.sun.el), az = THREE.MathUtils.degToRad(v.sun.az);
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}

function setup(W, H) {
  const key = W + 'x' + H;
  if (sizeKey === key) return;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    document.body.appendChild(renderer.domElement);
  }
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  post = new Post(renderer, W, H);
  sizeKey = key;
}

// shot: { variant, yaw (0..3 quarter turns), view: { cx, cz, zoom, w, h, dpr }, label }
window.renderShot = async (shot) => {
  const t0 = performance.now();
  const v = VARIANTS[shot.variant];
  const SS = 2; // supersampling
  const { w, h, dpr = 1, zoom = 1, cx = 0, cy = 0, cz = 0 } = shot.view;
  const W = w * dpr * SS, H = h * dpr * SS;
  setup(W, H);
  renderer.shadowMap.type = v.sun.soft === 'vsm' ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const env = skyEnv(v);
  scene.environment = env;
  const park = (v.scene ? SCENES[v.scene] : buildPark)(v);
  // rotate the world, not the camera: lighting stays fixed relative to the screen (as a sprite bake would)
  const world = new THREE.Group();
  world.add(park.root);
  world.rotation.y = (shot.yaw || 0) * Math.PI / 2;
  scene.add(world);
  scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if ('envMapIntensity' in m) m.envMapIntensity = v.envIntensity; });

  if (shot.debug) {
    // report suspiciously large meshes (a broken rod or beam shows up as a long line across the scene)
    world.updateMatrixWorld(true);
    const big = [];
    world.traverse((o) => { if (o.isInstancedMesh) { const m = new THREE.Matrix4(), p = new THREE.Vector3(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const sc = new THREE.Vector3().setFromMatrixScale(m); p.setFromMatrixPosition(m); if (Math.max(sc.x, sc.y, sc.z) > shot.debug || !isFinite(sc.x + sc.y + sc.z)) big.push('inst ' + o.geometry.type + ' #' + i + ' scale ' + sc.toArray().map((v) => v.toFixed(1)) + ' at ' + p.toArray().map((v) => v.toFixed(1))); } return; } if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); const s = b.getSize(new THREE.Vector3()); if (Math.max(s.x, s.y, s.z) > shot.debug || !isFinite(s.x + s.y + s.z)) big.push(o.geometry.type + ' ' + s.toArray().map((v) => v.toFixed(1)).join('x') + ' @' + b.min.toArray().map((v) => v.toFixed(1)).join(',')); });
    window.__big = big;
  }
  const tb = performance.now();
  // camera: orthographic, looking from +x +z (yaw 45) and 30 deg down
  const ppm = PX_PER_M * zoom; // CSS px per metre
  const fw = w / ppm, fh = h / ppm;
  const cam = new THREE.OrthographicCamera(-fw / 2, fw / 2, fh / 2, -fh / 2, 1, 400);
  const target = new THREE.Vector3(cx, cy, cz);
  const dir = new THREE.Vector3(Math.cos(PITCH) * Math.SQRT1_2, Math.sin(PITCH), Math.cos(PITCH) * Math.SQRT1_2);
  cam.position.copy(target).addScaledVector(dir, 150);
  cam.lookAt(target);
  cam.updateMatrixWorld();

  // sun: azimuth relative to the camera so shadows always fall to screen right/back
  const sd = sunDir(v);
  const sun = new THREE.DirectionalLight(v.sun.color, v.sun.intensity);
  sun.position.copy(sd).multiplyScalar(park.extent ? 110 : 80);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const ext = park.extent || 34; // shadow box half-size in metres (bigger plots need a bigger box)
  const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = park.extent ? 260 : 200;
  sun.shadow.bias = v.sun.soft === 'vsm' ? -0.0006 : -0.0003;
  sun.shadow.normalBias = 0.035;
  if (park.shadowTarget) { sun.target.position.copy(park.shadowTarget); sun.position.add(park.shadowTarget); }
  if (v.sun.soft === 'vsm') { sun.shadow.radius = v.sun.radius; sun.shadow.blurSamples = 16; sun.shadow.mapSize.set(2048, 2048); }
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(v.hemi.sky, v.hemi.ground, v.hemi.intensity));
  if (v.night) {
    // moonless blue hour: a faint cool fill from the opposite side
    const fill = new THREE.DirectionalLight('#6d86c8', 0.35); fill.position.set(-40, 50, 30); scene.add(fill);
  }

  // per-shot tilt-shift focus: the render driver may override the band position
  const P = { ...v.post };
  if (P.tilt && shot.tilt) P.tilt = { ...P.tilt, ...shot.tilt };
  post.run(scene, cam, P);
  // force the GPU to finish before timing (readPixels blocks until the frame is done)
  const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  const t1 = performance.now();

  // downsample 2x (and to CSS size x dpr) + label
  const out = document.createElement('canvas');
  out.width = w * dpr; out.height = h * dpr;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  // two-step halving keeps it a proper box/bilinear average
  ctx.drawImage(renderer.domElement, 0, 0, W, H, 0, 0, out.width, out.height);
  if (shot.label !== false) {
    const s = dpr;
    const text = shot.label || v.label;
    ctx.font = `600 ${14 * s}px "Helvetica Neue", Arial, sans-serif`;
    const tw = ctx.measureText(text).width;
    const x = 14 * s, y = out.height - 14 * s - 28 * s;
    ctx.fillStyle = v.night ? 'rgba(10,16,32,0.72)' : 'rgba(255,255,255,0.82)';
    ctx.beginPath(); ctx.roundRect(x, y, tw + 24 * s, 28 * s, 8 * s); ctx.fill();
    ctx.fillStyle = v.night ? '#f1ead8' : '#1f2340';
    ctx.textBaseline = 'middle'; ctx.fillText(text, x + 12 * s, y + 14 * s);
  }
  // dispose GPU resources of this scene so repeated shots do not pile up
  env.dispose();
  const info = renderer.info.render;
  return { big: window.__big, png: out.toDataURL('image/png'), ms: Math.round(t1 - t0), build: Math.round(tb - t0), calls: info.calls, tris: info.triangles };
};
window.ready = true;
