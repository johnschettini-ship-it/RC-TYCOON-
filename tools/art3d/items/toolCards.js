// Tool card objects (realistic title and cards, Task 4): one small baked object per base tool card of the decks
// (src/ui/decks/toolCards.ts), drawn on the card instead of its flat icon in the realistic build. items/cards.js bakes
// each into the card set as frame `tool:<id>`, framed like the other card pictures (cardShot).
//
// Original designs from the kit's materials and the people kit; nothing traced or copied. Coordinates as the other
// bake modules (three.js x, y up, z = game x, height, y); +z is the side the card's three-quarter view sees most.
// Every builder returns a group standing on y = 0, with a little ground of its own (paving or grass).
import { THREE, TILE } from './common.js';
import { M, V, rep, rod, std, tx } from '../kit.js';
import { person, randomLook } from '../people.js';

/** A flat ground patch w x d metres centred on the origin, its texture spanning `texM` metres. */
function patch(w, d, map, bump, texM, roughness = 0.85, y = 0.004) {
  const m = M(new THREE.PlaneGeometry(w, d), std({ map: rep(map, w / texM, d / texM), bumpMap: rep(bump, w / texM, d / texM), bumpScale: 1.4, roughness }), false, true);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}
const grass = (w, d) => patch(w, d, tx.grass.map, tx.grass.bump, 6, 0.95);
const pavers = (w, d, grey = false, y = 0.04) => patch(w, d, (grey ? tx.paversGrey : tx.pavers).map, (grey ? tx.paversGrey : tx.pavers).bump, 3, 0.82, y);

/** A canvas texture drawn by `draw(ctx, w, h)` (sRGB, clamped). */
function painted(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const paint = (color, roughness = 0.5, metalness = 0.2) => std({ map: tx.paint.map, roughnessMap: tx.paint.rough, color, roughness, metalness });

/** A rope hanging between a and b, sagging `sag` metres at its middle. */
function rope(a, b, sag, r, mat) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 8, false), mat);
}

/** A small Ferris wheel (the research card's ride model), about `size` metres tall, its wheel facing +z. */
function wheelModel(size, K) {
  const g = new THREE.Group();
  const R = size * 0.42;
  const hub = size * 0.52;
  const white = paint('#f1ede4', 0.45, 0.2);
  const red = paint('#c8372d', 0.4, 0.2);
  const rim = M(new THREE.TorusGeometry(R, size * 0.018, 6, 40), white);
  rim.position.y = hub;
  g.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = V(Math.cos(a) * R, hub + Math.sin(a) * R, 0);
    g.add(rod(V(0, hub, 0), p, size * 0.007, white, 5));
    const cab = M(new THREE.BoxGeometry(size * 0.09, size * 0.08, size * 0.09), i % 3 === 0 ? paint('#2f6fb5', 0.4) : i % 3 === 1 ? red : paint('#f0b323', 0.4));
    cab.position.set(p.x, p.y - size * 0.06, size * 0.03);
    g.add(cab);
  }
  for (const sx of [-1, 1]) {
    g.add(rod(V(sx * size * 0.24, 0, size * 0.08), V(0, hub, 0), size * 0.016, red, 6));
    g.add(rod(V(sx * size * 0.24, 0, -size * 0.08), V(0, hub, 0), size * 0.016, red, 6));
  }
  const base = M(new THREE.BoxGeometry(size * 0.7, size * 0.04, size * 0.28), K.mat.stone);
  base.position.y = size * 0.02;
  g.add(base);
  return g;
}

/** The base tool card objects by tool card id. Each takes a kit (items/common.js kit()) and returns the object. */
export const TOOL_OBJECTS = {
  // A short stretch of the game's footpath: the warm clay pavers and concrete kerbs of ground:path, on grass.
  footpath: (K) => {
    const g = new THREE.Group();
    const W = TILE * 0.62, k = 0.16;
    g.add(grass(TILE * 2.3, TILE * 1.9));
    // an L: a stretch along x and a branch towards the viewer (+z) from its right end
    const ax0 = -TILE, ax1 = TILE * 0.85;
    const a = pavers(ax1 - ax0, W);
    a.position.x = (ax0 + ax1) / 2;
    a.position.z = -TILE * 0.35;
    g.add(a);
    const bx = ax1 - W / 2, bz0 = -TILE * 0.35 + W / 2, bz1 = TILE * 0.85;
    const b = pavers(W, bz1 - bz0);
    b.position.set(bx, 0.04, (bz0 + bz1) / 2);
    g.add(b);
    const kerb = (x0, x1, z0, z1) => {
      const m = M(new THREE.BoxGeometry(Math.max(k, x1 - x0), 0.14, Math.max(k, z1 - z0)), K.mat.kerb);
      m.position.set((x0 + x1) / 2, 0.07, (z0 + z1) / 2);
      g.add(m);
    };
    const za = -TILE * 0.35 - W / 2, zb = -TILE * 0.35 + W / 2;
    kerb(ax0, ax1, za - k, za); // back edge
    kerb(ax0, bx - W / 2, zb, zb + k); // front edge to the branch
    kerb(ax1, ax1 + k, za - k, bz1); // right edge, round the corner
    kerb(bx - W / 2 - k, bx - W / 2, zb, bz1); // the branch's left edge
    kerb(ax0 - k, ax0, za - k, zb + k); // the open end of the stretch
    return g;
  },

  // Queue line: polished posts on weighted bases with a red rope sagging between them, on the grey queue paving.
  queue: (K) => {
    const g = new THREE.Group();
    g.add(pavers(4.2, 2.0, true, 0.02));
    const ropeMat = std({ color: '#a8182a', roughness: 0.55, sheen: 1 });
    const posts = [V(-1.6, 0, 0.45), V(0, 0, -0.35), V(1.6, 0, 0.45)];
    for (const p of posts) {
      g.add(M(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 20), K.mat.brass).translateX(p.x).translateZ(p.z).translateY(0.05));
      g.add(rod(p.clone().setY(0.05), p.clone().setY(1.0), 0.035, K.mat.brass, 12));
      const knob = M(new THREE.SphereGeometry(0.07, 14, 10), K.mat.brass);
      knob.position.set(p.x, 1.04, p.z);
      g.add(knob);
    }
    for (let i = 0; i < posts.length - 1; i++) g.add(rope(posts[i].clone().setY(0.94), posts[i + 1].clone().setY(0.94), 0.28, 0.042, ropeMat));
    return g;
  },

  // Path items: a park bench with a lamp post beside it, on a little paving.
  pathItems: (K) => {
    const g = new THREE.Group();
    g.add(pavers(3.6, 1.9));
    g.add(K.bench(-0.35, 0.15, 0, 0.04));
    g.add(K.lamp(1.15, -0.35, 0.04));
    return g;
  },

  // Staff: a mechanic in blue overalls and a cap, a spanner in hand, with a red toolbox at the feet.
  staff: (K) => {
    const g = new THREE.Group();
    g.add(pavers(2.4, 1.7));
    const look = randomLook(4, {
      child: false, female: false, age: 1, h: 1.78, build: 1.05, hairStyle: 'short', hat: 'cap', hatColor: '#e2a92c',
      top: '#2a5a9a', bottom: '#2a5a9a', bottomType: 'trousers', sleeves: 'long', shoes: '#2a2a2a',
      backpack: null, bag: null, balloon: null, scarf: null, gloves: null, jacket: false,
    });
    const p = person(look, { kind: 'stand' });
    p.position.set(-0.3, 0.04, 0);
    p.rotation.y = 0.35;
    g.add(p);
    // toolbox: a red steel box with a handle and a tray of tools showing
    const box = new THREE.Group();
    const red = paint('#c8231e', 0.38, 0.35);
    box.add(M(new THREE.BoxGeometry(0.62, 0.3, 0.3), red).translateY(0.15));
    const lid = M(new THREE.BoxGeometry(0.64, 0.05, 0.32), red);
    lid.position.y = 0.32;
    box.add(lid);
    box.add(rod(V(-0.18, 0.35, 0), V(-0.18, 0.46, 0), 0.015, K.mat.darkSteel, 6));
    box.add(rod(V(0.18, 0.35, 0), V(0.18, 0.46, 0), 0.015, K.mat.darkSteel, 6));
    box.add(rod(V(-0.18, 0.46, 0), V(0.18, 0.46, 0), 0.02, K.mat.darkSteel, 8));
    for (const x of [-0.31, 0.31]) box.add(M(new THREE.BoxGeometry(0.02, 0.06, 0.12), K.mat.stainless).translateX(x).translateY(0.24));
    box.position.set(0.62, 0.04, 0.25);
    box.rotation.y = -0.3;
    g.add(box);
    // a spanner lying on the paving by the box
    const sp = new THREE.Group();
    sp.add(M(new THREE.BoxGeometry(0.34, 0.012, 0.04), K.mat.stainless));
    const jaw = M(new THREE.TorusGeometry(0.04, 0.014, 6, 12, Math.PI * 1.4), K.mat.stainless);
    jaw.rotation.x = -Math.PI / 2;
    jaw.position.x = 0.19;
    sp.add(jaw);
    sp.position.set(0.6, 0.055, 0.62);
    sp.rotation.y = 0.5;
    g.add(sp);
    return g;
  },

  // Research: a drafting table, a blueprint pinned on its sloped board, and a model Ferris wheel on its flat end.
  research: (K) => {
    const g = new THREE.Group();
    g.add(pavers(2.8, 1.8));
    const wood = K.mat.wood;
    const legs = paint('#2c3133', 0.5, 0.5);
    const W = 1.9, D = 0.9, H = 0.88;
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) g.add(rod(V(x, 0.04, z), V(x, H, z), 0.03, legs, 8));
    const top = M(new THREE.BoxGeometry(W, 0.05, D), wood);
    top.position.y = H + 0.025;
    g.add(top);
    // the sloped drawing board on the left two thirds, rising to the back
    const blueprint = painted(512, 360, (c, w, h) => {
      c.fillStyle = '#1d4f8f'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(220,235,255,0.25)'; c.lineWidth = 1;
      for (let x = 0; x < w; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y < h; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.strokeStyle = '#eaf3ff'; c.lineWidth = 6;
      // a coaster hill and loop drawn in white
      c.beginPath(); c.moveTo(30, h - 60); c.bezierCurveTo(110, h - 60, 120, 60, 200, 60); c.bezierCurveTo(260, 60, 270, h - 70, 330, h - 70);
      c.lineTo(470, h - 70); c.stroke();
      c.beginPath(); c.arc(400, h - 140, 70, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 3;
      for (let x = 60; x < 330; x += 34) { c.beginPath(); c.moveTo(x, h - 30); c.lineTo(x, h - 62 - (x > 110 && x < 300 ? 120 : 0)); c.stroke(); }
      c.strokeStyle = '#eaf3ff'; c.lineWidth = 4; c.strokeRect(10, 10, w - 20, h - 20);
    });
    const bw = W * 0.62, bd = D * 0.95;
    const board = new THREE.Group();
    board.add(M(new THREE.BoxGeometry(bw, 0.04, bd), K.mat.whiteTimber));
    const paper = M(new THREE.PlaneGeometry(bw * 0.88, bd * 0.86), std({ map: blueprint, roughness: 0.8 }), false, true);
    paper.rotation.x = -Math.PI / 2;
    paper.position.y = 0.022;
    board.add(paper);
    board.position.set(-W / 2 + bw / 2 + 0.03, H + 0.22, 0);
    board.rotation.x = 0.42;
    g.add(board);
    // the ride model on the flat right end
    const model = wheelModel(1.0, K);
    model.position.set(W / 2 - 0.36, H + 0.05, -0.05);
    model.rotation.y = -0.25;
    g.add(model);
    return g;
  },

  // Marketing: a poster board on two posts, the poster a bright ride picture with stars.
  marketing: (K) => {
    const g = new THREE.Group();
    g.add(grass(3.6, 2.0));
    const poster = painted(512, 360, (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#ff7a3d'); sky.addColorStop(1, '#ffd25a');
      c.fillStyle = sky; c.fillRect(0, 0, w, h);
      // sun burst
      c.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < 16; i += 2) {
        const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
        c.beginPath(); c.moveTo(w * 0.7, h * 0.45); c.lineTo(w * 0.7 + Math.cos(a0) * 600, h * 0.45 + Math.sin(a0) * 600); c.lineTo(w * 0.7 + Math.cos(a1) * 600, h * 0.45 + Math.sin(a1) * 600); c.fill();
      }
      // a big coaster loop in deep blue
      c.strokeStyle = '#183f8f'; c.lineWidth = 22;
      c.beginPath(); c.moveTo(0, h * 0.82); c.bezierCurveTo(w * 0.25, h * 0.82, w * 0.3, h * 0.15, w * 0.48, h * 0.15); c.bezierCurveTo(w * 0.62, h * 0.15, w * 0.6, h * 0.82, w, h * 0.82); c.stroke();
      c.beginPath(); c.arc(w * 0.78, h * 0.55, h * 0.22, 0, Math.PI * 2); c.stroke();
      // a red car at the top
      c.fillStyle = '#d42a2a'; c.fillRect(w * 0.42, h * 0.07, w * 0.13, h * 0.09);
      // stars
      c.fillStyle = '#ffffff';
      for (const [x, y, r] of [[0.13, 0.2, 22], [0.25, 0.42, 13], [0.9, 0.16, 18], [0.6, 0.65, 11]]) {
        c.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(w * x + Math.cos(a) * rr, h * y + Math.sin(a) * rr); }
        c.fill();
      }
      c.strokeStyle = '#ffffff'; c.lineWidth = 12; c.strokeRect(6, 6, w - 12, h - 12);
    });
    const PW = 2.6, PH = 1.85, base = 0.6;
    const frameMat = paint('#1f3b2e', 0.5, 0.4);
    for (const x of [-PW / 2 - 0.02, PW / 2 + 0.02]) g.add(rod(V(x, 0, -0.04), V(x, base + PH + 0.12, -0.04), 0.06, frameMat, 10));
    const backing = M(new THREE.BoxGeometry(PW + 0.16, PH + 0.16, 0.08), frameMat);
    backing.position.set(0, base + PH / 2, -0.04);
    g.add(backing);
    const face = M(new THREE.PlaneGeometry(PW, PH), std({ map: poster, roughness: 0.55 }), false, true);
    face.position.set(0, base + PH / 2, 0.005);
    g.add(face);
    // a little roof over the board
    const roof = M(new THREE.BoxGeometry(PW + 0.4, 0.06, 0.4), frameMat);
    roof.position.set(0, base + PH + 0.16, 0.06);
    roof.rotation.x = 0.2;
    g.add(roof);
    g.rotation.y = 0.55;
    return g;
  },

  // Finance: a ticket booth with a striped roof, its window open, and a green cash box with coins on the counter.
  finance: (K) => {
    const g = new THREE.Group();
    g.add(pavers(3.4, 2.6));
    const BW = 1.7, BD = 1.5, BH = 2.3;
    const wall = paint('#efe6cf', 0.6, 0.05);
    const trim = paint('#a8232b', 0.45, 0.2);
    // walls with a window opening on the front (+z): sill to 1.0 m, opening to 2.0 m
    const z = BD / 2;
    g.add(M(new THREE.BoxGeometry(BW, BH, BD - 0.08), wall).translateY(BH / 2).translateZ(-0.04));
    const front = (w, h, x, y) => { const m = M(new THREE.BoxGeometry(w, h, 0.08), wall); m.position.set(x, y, z - 0.04); g.add(m); };
    front(BW, 1.0, 0, 0.5);
    front(BW, BH - 2.0, 0, (BH + 2.0) / 2);
    front(0.25, 1.0, -BW / 2 + 0.125, 1.5);
    front(0.25, 1.0, BW / 2 - 0.125, 1.5);
    const dark = M(new THREE.PlaneGeometry(BW - 0.5, 1.0), std({ color: '#2b2622', roughness: 0.9 }), false, false);
    dark.position.set(0, 1.5, z - 0.081);
    g.add(dark);
    // red trim: base band, window frame, top band
    g.add(M(new THREE.BoxGeometry(BW + 0.04, 0.16, BD + 0.04), trim).translateY(0.08));
    g.add(M(new THREE.BoxGeometry(BW + 0.04, 0.12, BD + 0.04), trim).translateY(BH - 0.06));
    const counter = M(new THREE.BoxGeometry(BW - 0.3, 0.06, 0.5), K.mat.wood);
    counter.position.set(0, 1.03, z + 0.17);
    g.add(counter);
    // striped hip roof
    const roof = M(new THREE.ConeGeometry(Math.hypot(BW, BD) * 0.62, 0.8, 4, 1, true), K.mat.roofStripes);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = BH + 0.4;
    roof.scale.set(1, 1, BD / BW);
    g.add(roof);
    g.add(M(new THREE.SphereGeometry(0.08, 12, 8), K.mat.gold).translateY(BH + 0.82));
    // a ticket shape on the front above the window
    const ticket = painted(256, 128, (c, w, h) => {
      c.fillStyle = '#f2b541';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.35); c.arc(w, h / 2, h * 0.15, -Math.PI / 2, Math.PI / 2, true); c.lineTo(w, h); c.lineTo(0, h); c.lineTo(0, h * 0.65);
      c.arc(0, h / 2, h * 0.15, Math.PI / 2, -Math.PI / 2, true); c.closePath(); c.fill();
      c.strokeStyle = '#a8232b'; c.setLineDash([10, 8]); c.lineWidth = 6; c.beginPath(); c.moveTo(w * 0.68, 12); c.lineTo(w * 0.68, h - 12); c.stroke();
      c.fillStyle = '#a8232b'; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 14 : 32; c.lineTo(w * 0.34 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
      c.fill();
    });
    ticket.wrapS = ticket.wrapT = THREE.ClampToEdgeWrapping;
    const sign = M(new THREE.PlaneGeometry(0.9, 0.45), std({ map: ticket, roughness: 0.5, transparent: true, alphaTest: 0.5 }), false, false);
    sign.position.set(0, 2.08, z + 0.004);
    sign.scale.setScalar(0.85);
    g.add(sign);
    // the cash box on the counter, lid open, coins inside
    const cash = new THREE.Group();
    const green = paint('#2f6d3a', 0.35, 0.45);
    cash.add(M(new THREE.BoxGeometry(0.46, 0.18, 0.32), green).translateY(0.09));
    const lid = M(new THREE.BoxGeometry(0.46, 0.03, 0.32), green);
    lid.position.set(0, 0.18 + 0.15, -0.17);
    cash.scale.setScalar(1.35);
    lid.rotation.x = -1.25;
    cash.add(lid);
    for (let i = 0; i < 9; i++) {
      const coin = M(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), K.mat.gold);
      coin.position.set(-0.15 + (i % 5) * 0.075, 0.185 + Math.floor(i / 5) * 0.012, -0.06 + ((i * 7) % 4) * 0.04);
      cash.add(coin);
    }
    const note = M(new THREE.BoxGeometry(0.16, 0.01, 0.08), std({ color: '#7fae7a', roughness: 0.9 }));
    note.position.set(0.12, 0.2, 0.05);
    note.rotation.y = 0.4;
    cash.add(note);
    cash.position.set(0.2, 1.06, z + 0.2);
    cash.rotation.y = -0.2;
    g.add(cash);
    g.rotation.y = 0.6;
    return g;
  },

  // Park: the park entrance arch, two brick pillars with flags and a striped arch over the way in, on the path.
  park: (K) => {
    const g = new THREE.Group();
    g.add(grass(8.2, 3.2));
    g.add(pavers(3.4, 3.2, false, 0.03));
    const span = 4.6, PH = 3.0;
    const pillarMat = K.mat.stone;
    const red = paint('#c8372d', 0.4, 0.25);
    const cream = paint('#efe6cf', 0.5, 0.1);
    for (const s of [-1, 1]) {
      const x = s * span / 2;
      g.add(M(new THREE.BoxGeometry(0.8, PH, 0.8), pillarMat).translateX(x).translateY(PH / 2));
      g.add(M(new THREE.BoxGeometry(0.96, 0.18, 0.96), cream).translateX(x).translateY(PH + 0.09));
      g.add(M(new THREE.BoxGeometry(0.96, 0.22, 0.96), cream).translateX(x).translateY(0.11));
      // pennant
      g.add(rod(V(x, PH + 0.18, 0), V(x, PH + 1.6, 0), 0.03, K.mat.stainless, 8));
      const flag = new THREE.Shape();
      flag.moveTo(0, 0); flag.lineTo(0.75 * -s, -0.2); flag.lineTo(0, -0.42); flag.closePath();
      const f = M(new THREE.ShapeGeometry(flag), std({ color: s < 0 ? '#f0b323' : '#2f6fb5', roughness: 0.7, side: THREE.DoubleSide }), false, false);
      f.position.set(x, PH + 1.58, 0);
      g.add(f);
      // a little railing fence going out sideways
      const fx = x + s * 0.4;
      for (let i = 0; i <= 3; i++) g.add(rod(V(fx + s * i * 0.55, 0, 0), V(fx + s * i * 0.55, 0.9, 0), 0.025, K.mat.green, 6));
      for (const y of [0.4, 0.85]) g.add(rod(V(fx, y, 0), V(fx + s * 1.65, y, 0), 0.02, K.mat.green, 6));
    }
    // the arch: a red half ring springing from the pillar tops, with a cream band and bulbs
    const archR = span / 2;
    const arch = M(new THREE.TorusGeometry(archR, 0.16, 10, 40, Math.PI), red);
    arch.position.y = PH + 0.18;
    g.add(arch);
    const band = M(new THREE.TorusGeometry(archR - 0.28, 0.07, 8, 40, Math.PI), cream);
    band.position.y = PH + 0.18;
    g.add(band);
    for (let i = 1; i < 12; i++) {
      const a = (i / 12) * Math.PI;
      const b = M(new THREE.SphereGeometry(0.07, 10, 8), K.ringBulb, false, false);
      b.position.set(Math.cos(a) * archR, PH + 0.18 + Math.sin(a) * archR, 0.17);
      g.add(b);
    }
    // the name board hung from the arch (striped, no lettering: the card names the tool)
    const board = M(new THREE.BoxGeometry(span * 0.62, 0.62, 0.1), K.mat.roofStripes);
    board.position.set(0, PH + 0.95, 0.05);
    g.add(board);
    const edge = M(new THREE.BoxGeometry(span * 0.62 + 0.12, 0.74, 0.08), K.mat.gold);
    edge.position.set(0, PH + 0.95, 0);
    g.add(edge);
    g.rotation.y = 0.45;
    return g;
  },
};
