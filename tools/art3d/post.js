// Small hand-written post chain (no three.js addons): HDR scene -> AO from depth -> bloom -> grade + ACES -> tilt-shift.
// The orthographic camera makes depth linear, so view-space positions come straight from (uv, depth).
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function pass(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  return { m, s, u: uniforms };
}

const AO = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth; uniform vec2 res; uniform vec2 frustum; uniform float near, far, radius, intensity;
float lin(vec2 uv){ return near + texture2D(tDepth, uv).x * (far - near); }
vec3 vpos(vec2 uv){ return vec3((uv - 0.5) * frustum, -lin(uv)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }
  vec2 px = 1.0 / res;
  vec3 P = vpos(vUv);
  // normal from depth: take the smaller difference on each axis (avoids smearing across silhouettes)
  vec3 l = vpos(vUv - vec2(px.x, 0.0)) - P, r = vpos(vUv + vec2(px.x, 0.0)) - P;
  vec3 b = vpos(vUv - vec2(0.0, px.y)) - P, t = vpos(vUv + vec2(0.0, px.y)) - P;
  vec3 dx = abs(l.z) < abs(r.z) ? -l : r;
  vec3 dy = abs(b.z) < abs(t.z) ? -b : t;
  vec3 N = normalize(cross(dx, dy));
  float rpx = radius / frustum.x * res.x; // radius in pixels
  float occ = 0.0;
  float ang = hash(gl_FragCoord.xy) * 6.2831;
  const int S = 16;
  for (int i = 0; i < S; i++) {
    float f = (float(i) + 0.5) / float(S);
    float a = ang + float(i) * 2.39996;
    vec2 off = vec2(cos(a), sin(a)) * sqrt(f) * rpx * px;
    vec3 Q = vpos(vUv + off);
    vec3 v = Q - P;
    float dist = length(v);
    float o = max(0.0, dot(v / max(dist, 1e-4), N) - 0.08);
    o *= 1.0 - smoothstep(radius * 0.5, radius * 1.5, dist);
    occ += o;
  }
  float ao = clamp(1.0 - intensity * occ / float(S) * 1.6, 0.0, 1.0);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const BLUR_AO = `
precision highp float;
varying vec2 vUv; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 res; uniform float near, far;
float lin(vec2 uv){ return near + texture2D(tDepth, uv).x * (far - near); }
void main(){
  vec2 px = 1.0 / res; float z0 = lin(vUv); float s = 0.0, w = 0.0;
  for (int x = -3; x <= 3; x++) for (int y = -3; y <= 3; y++) {
    vec2 uv = vUv + vec2(float(x), float(y)) * px * 1.5;
    float wt = 1.0 / (1.0 + abs(lin(uv) - z0) * 6.0);
    s += texture2D(tAO, uv).x * wt; w += wt;
  }
  float a = s / w; gl_FragColor = vec4(a, a, a, 1.0);
}`;

const BRIGHT = `
precision highp float;
varying vec2 vUv; uniform sampler2D tColor; uniform float threshold;
void main(){ vec3 c = texture2D(tColor, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(threshold, threshold * 2.0, l), 1.0); }`;

const BLUR = `
precision highp float;
varying vec2 vUv; uniform sampler2D tColor; uniform vec2 dir;
void main(){
  vec3 s = texture2D(tColor, vUv).rgb * 0.227;
  s += (texture2D(tColor, vUv + dir * 1.385).rgb + texture2D(tColor, vUv - dir * 1.385).rgb) * 0.316;
  s += (texture2D(tColor, vUv + dir * 3.231).rgb + texture2D(tColor, vUv - dir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMPOSE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tAO, tDepth, tB1, tB2, tB3;
uniform float aoStrength, bloom, exposure, saturation, contrast, vignette;
uniform vec3 lift, gain, bgTop, bgBottom;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 i = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 o = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= exposure / 0.6; c = i * c; c = RRTAndODTFit(c); c = o * c; return clamp(c, 0.0, 1.0);
}
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  float d = texture2D(tDepth, vUv).x;
  vec3 c;
  if (d >= 0.9999) {
    c = mix(bgBottom, bgTop, smoothstep(0.0, 1.0, vUv.y));
  } else {
    vec3 hdr = texture2D(tColor, vUv).rgb;
    float ao = texture2D(tAO, vUv).x;
    hdr *= mix(1.0, ao, aoStrength);
    hdr += (texture2D(tB1, vUv).rgb * 0.5 + texture2D(tB2, vUv).rgb * 0.8 + texture2D(tB3, vUv).rgb * 1.0) * bloom;
    c = aces(hdr);
  }
  // grade (display-referred, linear)
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c = c * gain + lift * (1.0 - c);
  c = srgb(max(c, 0.0));
  c = (c - 0.5) * contrast + 0.5;
  vec2 q = vUv - 0.5; c *= 1.0 - vignette * dot(q, q) * 1.6;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// tilt-shift: disc blur whose radius grows with distance from a horizontal focus band (screen y)
const TILT = `
precision highp float;
varying vec2 vUv; uniform sampler2D tColor; uniform vec2 res; uniform float focusY, band, soft, maxR;
void main(){
  float dy = abs(vUv.y - focusY);
  float r = maxR * smoothstep(band, band + soft, dy);
  if (r < 0.5) { gl_FragColor = texture2D(tColor, vUv); return; }
  vec3 s = vec3(0.0); float w = 0.0;
  const int N = 40;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 0.5) / float(N);
    float a = float(i) * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * sqrt(f) * r / res;
    vec3 c = texture2D(tColor, vUv + o).rgb;
    float wt = 1.0 + dot(c, vec3(0.3)) * 0.6; // bright spots bloom a little, like lens bokeh
    s += c * wt; w += wt;
  }
  gl_FragColor = vec4(s / w, 1.0);
}`;

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.scene = new THREE.WebGLRenderTarget(W, H, { ...hf, samples: 0 });
    this.scene.depthTexture = new THREE.DepthTexture(W, H, THREE.FloatType);
    this.ao = new THREE.WebGLRenderTarget(W, H, hf);
    this.ao2 = new THREE.WebGLRenderTarget(W, H, hf);
    this.b = [4, 8, 16].map((d) => [new THREE.WebGLRenderTarget(W / d, H / d, hf), new THREE.WebGLRenderTarget(W / d, H / d, hf)]);
    this.out = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.pAO = pass(AO, { tDepth: { value: null }, res: { value: new THREE.Vector2(W, H) }, frustum: { value: new THREE.Vector2() }, near: { value: 0 }, far: { value: 1 }, radius: { value: 1 }, intensity: { value: 1 } });
    this.pAOB = pass(BLUR_AO, { tAO: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(W, H) }, near: { value: 0 }, far: { value: 1 } });
    this.pBright = pass(BRIGHT, { tColor: { value: null }, threshold: { value: 1 } });
    this.pBlur = pass(BLUR, { tColor: { value: null }, dir: { value: new THREE.Vector2() } });
    this.pComp = pass(COMPOSE, {
      tColor: { value: null }, tAO: { value: null }, tDepth: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
      aoStrength: { value: 1 }, bloom: { value: 0 }, exposure: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 }, vignette: { value: 0 },
      lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, bgTop: { value: new THREE.Vector3() }, bgBottom: { value: new THREE.Vector3() },
    });
    this.pTilt = pass(TILT, { tColor: { value: null }, res: { value: new THREE.Vector2(W, H) }, focusY: { value: 0.5 }, band: { value: 0.1 }, soft: { value: 0.2 }, maxR: { value: 0 } });
  }
  run(scene, camera, P) {
    const r = this.r;
    r.setRenderTarget(this.scene); r.render(scene, camera);
    const fr = new THREE.Vector2(camera.right - camera.left, camera.top - camera.bottom);
    Object.assign(this.pAO.u.tDepth, { value: this.scene.depthTexture });
    this.pAO.u.frustum.value.copy(fr); this.pAO.u.near.value = camera.near; this.pAO.u.far.value = camera.far;
    this.pAO.u.radius.value = P.aoRadius; this.pAO.u.intensity.value = P.aoIntensity;
    r.setRenderTarget(this.ao); r.render(this.pAO.s, this.cam);
    this.pAOB.u.tAO.value = this.ao.texture; this.pAOB.u.tDepth.value = this.scene.depthTexture; this.pAOB.u.near.value = camera.near; this.pAOB.u.far.value = camera.far;
    r.setRenderTarget(this.ao2); r.render(this.pAOB.s, this.cam);
    // bloom pyramid
    let src = this.scene.texture;
    this.pBright.u.threshold.value = P.bloomThreshold;
    this.b.forEach(([a, b], k) => {
      if (k === 0) { this.pBright.u.tColor.value = src; r.setRenderTarget(a); r.render(this.pBright.s, this.cam); }
      else { this.pBlur.u.tColor.value = src; this.pBlur.u.dir.value.set(0, 0); r.setRenderTarget(a); r.render(this.pBlur.s, this.cam); }
      for (let it = 0; it < 2; it++) {
        this.pBlur.u.tColor.value = a.texture; this.pBlur.u.dir.value.set(1 / a.width, 0); r.setRenderTarget(b); r.render(this.pBlur.s, this.cam);
        this.pBlur.u.tColor.value = b.texture; this.pBlur.u.dir.value.set(0, 1 / a.height); r.setRenderTarget(a); r.render(this.pBlur.s, this.cam);
      }
      src = a.texture;
    });
    const u = this.pComp.u;
    u.tColor.value = this.scene.texture; u.tAO.value = this.ao2.texture; u.tDepth.value = this.scene.depthTexture;
    u.tB1.value = this.b[0][0].texture; u.tB2.value = this.b[1][0].texture; u.tB3.value = this.b[2][0].texture;
    u.aoStrength.value = P.aoStrength; u.bloom.value = P.bloom; u.exposure.value = P.exposure;
    u.saturation.value = P.saturation; u.contrast.value = P.contrast; u.vignette.value = P.vignette;
    u.lift.value.set(...P.lift); u.gain.value.set(...P.gain);
    u.bgTop.value.set(...P.bgTop); u.bgBottom.value.set(...P.bgBottom);
    const tilt = P.tilt;
    r.setRenderTarget(tilt ? this.out : null); r.render(this.pComp.s, this.cam);
    if (tilt) {
      Object.assign(this.pTilt.u, {});
      this.pTilt.u.tColor.value = this.out.texture;
      this.pTilt.u.focusY.value = tilt.focusY; this.pTilt.u.band.value = tilt.band; this.pTilt.u.soft.value = tilt.soft;
      this.pTilt.u.maxR.value = tilt.maxR * (this.W / 3200);
      r.setRenderTarget(null); r.render(this.pTilt.s, this.cam);
    }
  }
}
