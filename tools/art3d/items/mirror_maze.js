// Mirror Maze (walk-through attraction, 3 x 3 tiles, 8 m): a low pavilion clad in silvered mirror panels on
// aluminium mullions, a violet frieze with a bulb-lit cornice, an arched entrance portal of mirrored glass with marquee bulbs and the
// name board at the front (+z), a flat roof whose skylight strips trace a maze, and a faceted crystal turning on a
// stand above the roof (today's look). No riders. Light change in 4 steps (arenaKeys.mirrorKeys, repeating every 8
// angle slots): the crystal turns 22.5 degrees a step (it repeats every 90), the marquee bulbs chase, and a bright
// sheen walks across the mirror panels. Front at +z: rots [0, 1, 2, 3].
// Colour part: the roof, its dark membrane inside the parapet (the skylight strips, cream parapet and violet frieze keep theirs); base #3d4048.
import { THREE, placeOnFootprint, bakeObject, kit, colourPart, partMask } from './common.js';
import { M, V, rod, std } from '../kit.js';
import { signMat } from '../rides.js';
import { painted, glow, slab, bulbs, canvasTex, hash01 } from './arenaKit.js';
import { mirrorKeys, LIGHT_STEPS, GATE_X } from './arenaKeys.js';

const GX = GATE_X.mirror_maze; // the entrance gate column (x = 0 for a 3-wide footprint)

/** The roof membrane's dark grey: a chosen colour lights it to that colour, keeping its shading. */
const BASE_COLOUR = '#3d4048';
const HX = 4.9; // building half-width
const Z0 = -4.9, Z1 = 3.6; // building depth (forecourt in front)
const WALL = 4.4;
const PANEL = 1.225; // mirror panel width

function build() {
  const K = kit();
  const { mat } = K;
  const root = new THREE.Group();
  const alu = std({ color: '#b9bec4', metalness: 1, roughness: 0.35 });
  const violet = painted('#4a3c8c');
  const cream = painted('#f1ede4');
  const mirror = new THREE.MeshPhysicalMaterial({ color: '#b8d6ee', metalness: 0.95, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, emissive: '#2a4a6a', emissiveIntensity: 0.15 });
  const sheen = new THREE.MeshPhysicalMaterial({ color: '#e2eef8', metalness: 0.9, roughness: 0.08, emissive: '#cfeaff', emissiveIntensity: 0.16, clearcoat: 1 });
  // the portal's mirror: a reflection painted in (sky gradient, two diagonal glints), so it reads as glass from above
  const glassTex = canvasTex(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f2f8fd'); grd.addColorStop(0.55, '#b9d4ea'); grd.addColorStop(1, '#8fb0cc');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [x, ww] of [[0.15, 0.22], [0.55, 0.1]]) { g.beginPath(); g.moveTo(x * w, h); g.lineTo((x + ww) * w, h); g.lineTo((x + ww + 0.5) * w, 0); g.lineTo((x + 0.5) * w, 0); g.fill(); }
  });
  const portalMirror = new THREE.MeshPhysicalMaterial({ map: glassTex, metalness: 0.5, roughness: 0.1, emissive: '#ffffff', emissiveMap: glassTex, emissiveIntensity: 0.25, clearcoat: 1 });
  // base and forecourt
  root.add(slab(11.6, 0.2, 11.6, mat.concrete, 0, 0, 0));
  root.add(slab(11.2, 0.05, 11.6 / 2 - Z1 - 0.1, mat.paversGrey, 0, 0.2, (Z1 + 5.8) / 2));
  root.add(slab(HX * 2, 0.35, Z1 - Z0, mat.concrete, 0, 0.2, (Z0 + Z1) / 2));
  // walls: a dark core behind the panels
  const y0 = 0.55;
  root.add(slab(HX * 2 - 0.1, WALL, Z1 - Z0 - 0.1, std({ color: '#2b2f3a', roughness: 0.8 }), 0, y0, (Z0 + Z1) / 2));
  // mirror panels on all four faces (the front leaves the portal free); panels by column for the sheen
  const panels = [];
  const face = (e) => {
    const along = e % 2 === 0;
    const len = along ? HX * 2 : Z1 - Z0;
    const n = Math.round(len / PANEL);
    const pw = len / n;
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (i + 0.5) * pw;
      if (e === 0 && Math.abs(u - GX) < 1.5) continue; // the portal
      for (let r = 0; r < 2; r++) {
        const ph = (WALL - 1.0) / 2;
        const m = M(new THREE.BoxGeometry(pw - 0.06, ph - 0.06, 0.04), mirror);
        const y = y0 + 0.35 + ph * (r + 0.5);
        // a slight tilt per panel, as a funhouse mirror wall
        m.rotation.x = (hash01(e * 100 + i * 7 + r) - 0.5) * 0.04;
        const holder = new THREE.Group();
        holder.add(m);
        const out = 0.06;
        if (e === 0) holder.position.set(u, y, Z1 + out);
        else if (e === 2) { holder.position.set(-u, y, Z0 - out); holder.rotation.y = Math.PI; }
        else if (e === 1) { holder.position.set(HX + out, y, (Z0 + Z1) / 2 - u); holder.rotation.y = Math.PI / 2; }
        else { holder.position.set(-HX - out, y, (Z0 + Z1) / 2 + u); holder.rotation.y = -Math.PI / 2; }
        root.add(holder);
        panels.push({ m, col: i + e * 20 });
      }
    }
    // mullions and the plinth band
    for (let i = 0; i <= n; i++) {
      const u = -len / 2 + i * pw;
      if (e === 0 && Math.abs(u - GX) < 1.5) continue;
      const a = along ? V(u * (e === 0 ? 1 : -1), y0 + 0.35, e === 0 ? Z1 + 0.09 : Z0 - 0.09) : V(e === 1 ? HX + 0.09 : -HX - 0.09, y0 + 0.35, (Z0 + Z1) / 2 + (e === 1 ? -u : u));
      root.add(rod(a, a.clone().setY(y0 + WALL - 0.65), 0.035, alu, 6));
    }
  };
  for (let e = 0; e < 4; e++) face(e);
  // plinth band, frieze and cornice
  root.add(slab(HX * 2 + 0.24, 0.35, Z1 - Z0 + 0.24, violet, 0, y0, (Z0 + Z1) / 2));
  root.add(slab(HX * 2 + 0.24, 0.65, Z1 - Z0 + 0.24, violet, 0, y0 + WALL - 0.65, (Z0 + Z1) / 2));
  root.add(slab(HX * 2 + 0.44, 0.16, Z1 - Z0 + 0.44, cream, 0, y0 + WALL, (Z0 + Z1) / 2));
  // parapet: a ring of four low walls round the roof
  { const W = HX * 2 + 0.2, D = Z1 - Z0 + 0.2, cz = (Z0 + Z1) / 2, t = 0.3, y = y0 + WALL + 0.16;
    root.add(slab(W, 0.4, t, cream, 0, y, cz + D / 2 - t / 2)); root.add(slab(W, 0.4, t, cream, 0, y, cz - D / 2 + t / 2));
    root.add(slab(t, 0.4, D, cream, W / 2 - t / 2, y, cz)); root.add(slab(t, 0.4, D, cream, -W / 2 + t / 2, y, cz)); }
  // roof: dark membrane inside the parapet, skylight strips tracing a maze
  const roofY = y0 + WALL + 0.16;
  root.add(slab(HX * 2 - 0.3, 0.05, Z1 - Z0 - 0.3, colourPart(std({ color: '#3d4048', roughness: 0.9 })), 0, roofY, (Z0 + Z1) / 2));
  const sky = new THREE.MeshPhysicalMaterial({ color: '#7fb4d6', metalness: 0.2, roughness: 0.08, emissive: '#5e8fd0', emissiveIntensity: 0.25, clearcoat: 1 });
  const n = 6, cw = (HX * 2 - 1.2) / n, cd = (Z1 - Z0 - 1.2) / n;
  const gx = (i) => -HX + 0.6 + i * cw, gz = (j) => Z0 + 0.6 + j * cd;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const h = hash01(i * 17 + j * 131 + 7);
    if (i < n && (h < 0.5 || j === 0 || j === n)) root.add(slab(cw + 0.18, 0.12, 0.18, sky, (gx(i) + gx(i + 1)) / 2, roofY + 0.05, gz(j)));
    if (j < n && (h >= 0.45 || i === 0 || i === n)) root.add(slab(0.18, 0.12, cd + 0.18, sky, gx(i), roofY + 0.05, (gz(j) + gz(j + 1)) / 2));
  }
  // entrance portal: an arch of cream and violet with marquee bulbs, the name board above, a mirrored door
  const portal = new THREE.Group();
  portal.position.set(GX, y0, Z1 + 0.05);
  root.add(portal);
  for (const s of [-1, 1]) portal.add(slab(0.5, 3.0, 0.5, cream, s * 1.35, 0, 0.1));
  const arch = M(new THREE.TorusGeometry(1.35, 0.25, 12, 32, Math.PI), cream);
  arch.position.set(0, 3.0, 0.1);
  portal.add(arch);
  portal.add(slab(2.2, 3.0, 0.1, portalMirror, 0, 0, -0.05));
  const door = M(new THREE.CircleGeometry(1.1, 32, 0, Math.PI), portalMirror);
  door.position.set(0, 3.0, 0.0);
  portal.add(door);
  portal.add(slab(0.08, 3.0, 0.08, alu, 0, 0, 0.02)); // the joint between the two mirrored door leaves
  const board = M(new THREE.BoxGeometry(3.6, 0.8, 0.14), [cream, cream, cream, cream, signMat('MIRROR MAZE', { bg: '#2c2466', accent: '#bfe6ff', frame: '#d6e6f2', title: 62 }), cream]);
  board.position.set(0, 4.75, 0.35);
  portal.add(board);
  const bulbOn = glow('#fff1b8', 2.2);
  const bulbOff = std({ color: '#efe3c0', emissive: '#ffd27a', emissiveIntensity: 0.15, roughness: 0.3 });
  const chase = [[], [], [], []];
  for (let k = 0; k <= 16; k++) {
    const a = Math.PI - (k / 16) * Math.PI;
    chase[k % 4].push([Math.cos(a) * 1.35, 3.0 + Math.sin(a) * 1.35, 0.4]);
  }
  for (let k = 0; k < 10; k++) for (const s of [-1, 1]) chase[(k + (s > 0 ? 0 : 2)) % 4].push([s * 1.35, 0.3 + k * 0.29, 0.4]);
  for (let k = 0; k <= 14; k++) { chase[k % 4].push([-1.75 + k * 0.25, 4.3, 0.44]); chase[(k + 2) % 4].push([-1.75 + k * 0.25, 5.2, 0.44]); }
  const chaseMeshes = chase.map((pts) => { const b = bulbs(pts, bulbOff, 0.06); portal.add(b); return b; });
  // cornice bulbs all round
  const cp = [];
  for (let k = 0; k <= 32; k++) { const x = -HX - 0.2 + (k / 32) * (HX * 2 + 0.4); cp.push([x, roofY - 0.08, Z1 + 0.24], [x, roofY - 0.08, Z0 - 0.24]); }
  for (let k = 0; k <= 28; k++) { const z = Z0 - 0.2 + (k / 28) * (Z1 - Z0 + 0.4); cp.push([HX + 0.24, roofY - 0.08, z], [-HX - 0.24, roofY - 0.08, z]); }
  root.add(bulbs(cp, K.ringBulb, 0.05));
  // the crystal on its stand
  const cz = (Z0 + Z1) / 2 - 0.5;
  root.add(M(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 24), violet).translateY(roofY + 0.25).translateZ(cz));
  root.add(rod(V(0, roofY + 0.4, cz), V(0, roofY + 1.6, cz), 0.09, alu, 12));
  root.add(M(new THREE.CylinderGeometry(0.35, 0.12, 0.2, 24), alu).translateY(roofY + 1.65).translateZ(cz));
  const crystal = M(new THREE.OctahedronGeometry(0.95, 0), new THREE.MeshPhysicalMaterial({ color: '#9fdcf5', metalness: 0.15, roughness: 0.04, emissive: '#3fa7d6', emissiveIntensity: 0.35, clearcoat: 1, flatShading: true }));
  crystal.scale.set(1, 1.45, 1);
  crystal.position.set(0, roofY + 3.1, cz);
  root.add(crystal);
  const halo = M(new THREE.TorusGeometry(1.25, 0.03, 6, 48), std({ color: '#d6e6f2', metalness: 1, roughness: 0.2 }));
  halo.rotation.x = Math.PI / 2; halo.position.set(0, roofY + 2.0, cz);
  root.add(halo);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; root.add(rod(V(Math.cos(a) * 1.25, roofY + 2.0, cz + Math.sin(a) * 1.25), V(0, roofY + 1.7, cz), 0.025, alu, 6)); }
  const pose = (step) => {
    crystal.rotation.y = (step / LIGHT_STEPS) * (Math.PI / 2);
    chaseMeshes.forEach((b, i) => { b.material = (i - step + 4) % 4 < 2 ? bulbOn : bulbOff; });
    for (const p of panels) p.m.material = (p.col - step * 2 + 400) % 8 < 1 ? sheen : mirror;
  };
  return { root, pose };
}

export default {
  bake(B) {
    const [w, d] = B.input.spec.footprintTiles;
    const m = build();
    const pictures = [...mirrorKeys().entries()].map(([id, g]) => ({ keys: g.keys, pose: () => m.pose(Number(id.slice(1))) }));
    B.log(`mirror_maze: ${pictures.length} pictures per rotation`);
    bakeObject(B, { kind: 'ride', item: 'mirror_maze', model: m.root, rots: [0, 1, 2, 3], place: (h, k) => placeOnFootprint(h, w, d, k), pictures, masked: partMask, baseColour: BASE_COLOUR });
  },
};
