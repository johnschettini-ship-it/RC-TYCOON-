// Steel Coaster (track ride, stage 1): rails, supports and cars from the game's own track geometry
// (pieceWorldSamples / pieceWorldTiles, passed in by bake.mjs) and the reached car poses (poses.ts).
//   rail:steel_coaster:r<t>   frames [pieceId, `t<tile index>`], t = the piece's heading in view terms
//                             ((piece.dir + view turn) mod 4, track convention: 0 = +x, 1 = +y). One picture per
//                             rail tile of the piece, numbered among its rail tiles in pieceWorldTiles order (as the
//                             renderer's trackTileSlices count), clipped to that tile.
//                             Anchor: the tile's centre at the piece's entry rail height (piece.z), so the game adds
//                             piece.z × the height step to today's slice anchor (track/layer.ts projects z = 0).
//                             Track-colour mask: rails, spine and ties.
//   support:steel_coaster:r<t> frames [`foot`], [`seg`], [`top`], stacked by the game (one picture per heading t):
//                             foot  anchored at the column axis on the ground (a concrete footing 0.25 m high);
//                             seg   a 1 m column segment anchored at its bottom centre on the axis: segment i goes at
//                                   height i m above the ground (i = 0 .. h - 1); drawn 1.1 m tall so stacks overlap;
//                             top   the saddle across the track heading t, anchored on the axis at the plate's
//                                   bottom: plate 0.22 m high, then a 0.45 m post (0.67 m in all). The game puts this
//                                   anchor SUPPORT_TOP_BELOW_RAIL = 1.2 m under the rail line (src/render/real/
//                                   supportStack.ts), so the post ends 0.53 m under it, just inside the bottom face of
//                                   the spine (0.27-0.57 m under the rail line); segments stop under the plate.
//                             The saddle heading t is the track's heading in the view at the support point.
//                             Support mask (not the footing): the game tints it with the ride's support colour.
// No shadows for rails, supports or cars in stage 1 (controller ruling; moving cars cast none, as today).
//   car:steel_coaster:rall    frames [`y<0-31>`, `p<0-23>`, `r<0-23>`, `full` | `empty`] for every reached pose.
//                             Anchor: the car's centre on the rail line (the sampled track point). Car-body mask.
// Chain lift dashes are not baked (the game draws them per frame over the rail, track/layer.ts).
import { THREE, kit, frameKey } from './common.js';
import { M, V } from '../kit.js';
import { sweep, boxProfile, Beams, sitCar } from '../rides.js';

const TRACK = '#e2e2e2'; // painted light grey: the game tints it (luminance × colour)
const SUPPORT = '#dedede';
const CAR = '#ececec';
const GAUGE = 0.5; // half the rail spacing
const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

/** Track frames (three.js axes) from game samples: P, tangent, lateral and up, banked. */
function framesOf(s) {
  const P = [], Tn = [], Lt = [], Up = [];
  for (let k = 0; k < s.n; k++) {
    P.push(V(s.x[k], s.z[k], s.y[k]));
    const cp = Math.cos(s.pitch[k]);
    const t = V(cp * Math.cos(s.yaw[k]), Math.sin(s.pitch[k]), cp * Math.sin(s.yaw[k])).normalize();
    const lat = V(0, 1, 0).cross(t).normalize();
    const up = t.clone().cross(lat).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(t, -Math.atan2(s.bankSin[k], s.bankCos[k]));
    Tn.push(t); Lt.push(lat.applyQuaternion(q)); Up.push(up.applyQuaternion(q));
  }
  return { P, Tn, Lt, Up, NS: s.n - 1, step: 0.25, closed: false, idx: (i) => Math.max(0, Math.min(s.n - 1, i)) };
}

function tube(l, u, r, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([l + Math.cos(a) * r, u + Math.sin(a) * r]); }
  return [pts];
}

// The swept parts run EXT m on past both piece ends, along the end tangents. A tile picture is clipped to its tile,
// and on a slope the spine (below the rail line) leans past the piece end into the next tile while the next
// piece's spine leans back into this one: without the run-on both slivers are lost and every tile seam on a slope
// shows a gap. The run-on stands in for the neighbour there; the clip keeps it out of the next tile.
const EXT = 0.75;
function extended(F) {
  const n = F.NS;
  const ext = (i, sgn) => F.P[i].clone().addScaledVector(F.Tn[i], sgn * EXT);
  return {
    ...F,
    P: [ext(0, -1), ...F.P, ext(n, 1)],
    Tn: [F.Tn[0], ...F.Tn, F.Tn[n]],
    Lt: [F.Lt[0], ...F.Lt, F.Lt[n]],
    Up: [F.Up[0], ...F.Up, F.Up[n]],
    NS: n + 2,
  };
}

function railModel(K, s, special, mats) {
  const F = framesOf(s);
  const FX = extended(F);
  const g = new THREE.Group();
  g.add(sweep(FX, [...tube(-GAUGE, 0, 0.055), ...tube(GAUGE, 0, 0.055)], mats.rail, { uvLen: 2 }));
  g.add(sweep(FX, boxProfile(0, -0.42, 0.26, 0.3), mats.rail, { uvLen: 2 }));
  const ties = new Beams();
  for (let i = 0; i <= F.NS; i += 4) {
    const p = F.P[i], l = F.Lt[i], u = F.Up[i];
    const at = (a, b) => p.clone().addScaledVector(l, a).addScaledVector(u, b);
    ties.add(at(-GAUGE, -0.02), at(0, -0.36), 0.07, 0.05, u);
    ties.add(at(GAUGE, -0.02), at(0, -0.36), 0.07, 0.05, u);
  }
  g.add(ties.mesh(mats.rail));
  if (special === 'brakes' || special === 'blockBrake') g.add(sweep(FX, boxProfile(0, -0.14, 0.05, 0.16), K.mat.darkSteel, { uvLen: 2 }));
  if (special === 'station') {
    // platforms either side, their deck 0.15 m over the rail line (a station is built on the ground, rail line at
    // ground height: lower, they were under the ground)
    for (const side of [-1, 1]) g.add(sweep(FX, boxProfile(side * 1.4, 0.05, 1.6, 0.2), K.mat.boards, { uvLen: 2 }));
  }
  return g;
}

// Support pieces, stacked by the game: the foot on the ground, one 1 m segment per metre of height, the saddle on top.
const SEG_H = 1.1; // a segment is drawn 10 cm taller (upward) so stacked segments overlap and never show a gap
function supportPiece(K, part, t, mat) {
  const g = new THREE.Group();
  if (part === 'foot') {
    g.add(M(new THREE.CylinderGeometry(0.34, 0.4, 0.25, 16), K.mat.concrete).translateY(0.125));
  } else if (part === 'seg') {
    g.add(M(new THREE.CylinderGeometry(0.2, 0.2, SEG_H, 16), mat).translateY(SEG_H / 2));
  } else {
    // saddle across the track: the track runs along +x at t = 0 (three x), +z (game +y) at t = 1
    const across = M(new THREE.BoxGeometry(0.3, 0.22, 1.3), mat);
    across.position.y = 0.11;
    across.rotation.y = (-t * Math.PI) / 2;
    g.add(across);
    g.add(M(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 12), mat).translateY(0.22 + 0.22));
  }
  return g;
}

export default {
  bake(B) {
    const K = kit();
    const { track, poses } = B.input;
    const item = 'steel_coaster';
    const railMat = new THREE.MeshPhysicalMaterial({ color: TRACK, roughness: 0.4, metalness: 0.3, clearcoat: 0.4 });
    const supMat = new THREE.MeshPhysicalMaterial({ color: SUPPORT, roughness: 0.45, metalness: 0.3, clearcoat: 0.3 });
    const bs = B.newScene();

    // ---- rails: per heading, piece and rail tile, clipped to the tile.
    // The clip planes are global, so they cut the hold-out ground to the tile too, and anything under the ground
    // (the spine of a rail on the ground) then shows through beside the tile. A ShaderMaterial without the clipping
    // chunk is never clipped: it holds out the whole ground while the rails are shot.
    const holdOut = bs.ground.material;
    bs.ground.material = new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      colorWrite: false,
    });
    for (let t = 0; t < 4; t++) {
      const set = B.set('rail', item, t, true);
      for (const [id, pc] of Object.entries(track.pieces)) {
        const s = pc.dirs[t];
        const model = railModel(K, s, pc.special, { rail: railMat });
        const holder = new THREE.Group();
        holder.add(model);
        bs.world.add(holder);
        B.setEnv(holder);
        s.tiles.filter((tile) => tile.rail).forEach((tile, ti) => {
          model.position.set(-(tile.x + 0.5) * 4, 0, -(tile.y + 0.5) * 4);
          B.clip([[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2]]); // |x| <= 2, |z| <= 2 round the tile centre
          set.add([frameKey([id, `t${ti}`])], B.shoot(bs, { target: holder, masked: (m) => m.material === railMat }));
          B.clip(null);
        });
        bs.world.remove(holder);
      }
      B.log(`rail r${t} done`);
    }
    bs.ground.material = holdOut;

    // ---- supports per heading: foot, 1 m segment, top (the game stacks them)
    for (let t = 0; t < 4; t++) {
      const set = B.set('support', item, t, true);
      for (const part of ['foot', 'seg', 'top']) {
        const m = supportPiece(K, part, t, supMat);
        bs.world.add(m);
        B.setEnv(m);
        set.add([frameKey([part])], B.shoot(bs, { target: m, masked: (x) => x.material === supMat, noGround: part !== 'foot' }));
        bs.world.remove(m);
      }
      B.log(`support r${t} done`);
    }

    // ---- cars per reached pose, full and empty
    const car = sitCar(K, { seed: 1300, color: CAR, trim: '#c9ccd0', rows: 2 });
    const riders = [];
    car.traverse((o) => { if (o.isGroup && o !== car && o.parent === car) riders.push(o); });
    const holder = new THREE.Group();
    holder.add(car);
    bs.world.add(holder);
    B.setEnv(holder);
    const set = B.set('car', item, 'all', true);
    for (const p of poses) {
      const yaw = (p.yaw / 32) * Math.PI * 2, pitch = (p.pitch / 24) * Math.PI * 2, roll = (p.roll / 24) * Math.PI * 2;
      const tn = V(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)).normalize();
      const lat = V(0, 1, 0).cross(tn).normalize();
      const up = tn.clone().cross(lat).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(tn, -roll);
      lat.applyQuaternion(q); up.applyQuaternion(q);
      car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lat, up, tn));
      for (const full of [true, false]) {
        for (const rd of riders) rd.visible = full;
        set.add([frameKey([`y${p.yaw}`, `p${p.pitch}`, `r${p.roll}`, full ? 'full' : 'empty'])], B.shoot(bs, { target: holder, masked: (m) => hex(m.material) === CAR }));
      }
    }
    B.log(`cars: ${poses.length} poses`);
  },
};
