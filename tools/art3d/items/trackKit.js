// The track kit (phase 8c batch 5 Task 3): what every track type's bake shares. A type module (steel_coaster.js) is a
// style spec passed to bakeTrackType; the geometry always comes from the game (tools/art3d/bakeNode.ts trackGeometry:
// pieceWorldSamples and pieceWorldTiles of every piece the type builds, at every heading), and the frame plan from
// trackKeys.js (classes, headings, pieces, rail tiles; car poses by class).
//
// Sets (the reader's contract, src/render/real/look/track.ts and trackClasses.ts):
//   rail:<type>~<class>:d*:r<t>   one picture per (piece, rail tile, heading t), the heading in view terms
//                                 ((piece.dir + view turn) mod 4, track convention: 0 = +x, 1 = +y), numbered among the
//                                 piece's rail tiles in pieceWorldTiles order (as the renderer's trackTileSlices count),
//                                 clipped to its tile with the EXT run-on (a tile that takes in a rail-less
//                                 neighbour of the piece, as a loop's clearance tile, is clipped to both: clipRects). Anchor: the tile's centre at the piece's entry
//                                 rail height (piece.z), so the game adds piece.z × the height step to today's slice
//                                 anchor (track/layer.ts projects z = 0). A frame that takes the track colour everywhere
//                                 sits on an alpha-tint sheet (no mask: its alpha is the mask); a piece with untinted
//                                 parts (station deck, brake fins, water) is shot with a mask of its rail material and
//                                 sits on a masked sheet. A tile over TALL_M of rail range is cut into stacked sub-frames
//                                 (trackKeys.js), each clipped to its height band and anchored at the same point.
//   support:<type>:d*:r<t>        frames [`foot`], [`seg`], [`top`], stacked by the game (one picture per heading t):
//                                 foot  anchored at the column axis on the ground (a concrete footing 0.25 m high);
//                                 seg   a 1 m column segment anchored at its bottom centre on the axis: segment i goes
//                                       at height i m above the ground (i = 0 .. h - 1); drawn SEG_H = 1.1 m tall so
//                                       stacks overlap;
//                                 top   the saddle across the track heading t, anchored on the axis at the plate's
//                                       bottom: plate 0.22 m high, then a 0.45 m post (0.67 m in all). The game puts
//                                       this anchor SUPPORT_TOP_BELOW_RAIL = 1.2 m under the rail line
//                                       (src/render/real/supportStack.ts), so the post ends 0.53 m under it, just inside
//                                       the bottom face of the steel spine (0.27-0.57 m under the rail line).
//                                 Support mask (not the footing): the game tints it with the ride's support colour.
//   car:<type>~<class>:d*:rall    frames [`y<0-31>`, `p<0-23>`, `r<0-23>`, `full` | `empty`] (+ `front`) for every pose
//                                 of the class. Anchor: the car's centre on the rail line (the sampled track point).
//                                 Car-body mask.
// No shadows, chain troughs or water channels yet (Tasks 4, 5 and 14). Chain dashes stay live (track/layer.ts).
//
// Styles: one entry per `render.rail`, `render.supports` and `render.car` of the track types
// (src/data/track/trackTypes.ts). Batch 5 adds a type's styles with its module (Tasks 6-7, 10-12, 14-15); Task 3 has
// the steel coaster's: rail `steel`, supports `round`, car `coaster`, the stage 1 models unchanged.
import { THREE, kit } from './common.js';
import { M, V } from '../kit.js';
import { sweep, boxProfile, Beams, sitCar } from '../rides.js';
import { bakeCamera } from '../camera.ts';
import { SUB_M, SUPPORT_PARTS, carFrames, classItem, railFrames, supportKey } from './trackKeys.js';

const hex = (m) => (!Array.isArray(m) && m.color ? `#${m.color.getHexString()}` : '');

/** Track frames (three.js axes) from game samples: P, tangent, lateral and up, banked. */
export function framesOf(s) {
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
export function extended(F) {
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

// ------------------------------------------------------------------ rail styles
/**
 * A rail style: `material(colour)` the track-colour material, and `build(K, F, FX, special, mats, gauge)` the rail
 * meshes of one piece (F its frames, FX the frames with the EXT run-on). Parts that never take the track colour use
 * other materials (the mask pass of a masked frame keeps only `mats.rail`).
 */
export const RAIL_STYLES = {
  // Steel (stage 1, owner-approved): two round rails, a box spine under them, ties every metre, brake fins, station
  // platforms either side.
  steel: {
    gauge: 0.5, // half the rail spacing
    material: (colour) => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.4, metalness: 0.3, clearcoat: 0.4 }),
    build(K, F, FX, special, mats, gauge) {
      const g = new THREE.Group();
      g.add(sweep(FX, [...tube(-gauge, 0, 0.055), ...tube(gauge, 0, 0.055)], mats.rail, { uvLen: 2 }));
      g.add(sweep(FX, boxProfile(0, -0.42, 0.26, 0.3), mats.rail, { uvLen: 2 }));
      const ties = new Beams();
      for (let i = 0; i <= F.NS; i += 4) {
        const p = F.P[i], l = F.Lt[i], u = F.Up[i];
        const at = (a, b) => p.clone().addScaledVector(l, a).addScaledVector(u, b);
        ties.add(at(-gauge, -0.02), at(0, -0.36), 0.07, 0.05, u);
        ties.add(at(gauge, -0.02), at(0, -0.36), 0.07, 0.05, u);
      }
      g.add(ties.mesh(mats.rail));
      if (special === 'brakes' || special === 'blockBrake') g.add(sweep(FX, boxProfile(0, -0.14, 0.05, 0.16), K.mat.darkSteel, { uvLen: 2 }));
      if (special === 'station') {
        // platforms either side, their deck 0.15 m over the rail line (a station is built on the ground, rail line at
        // ground height: lower, they were under the ground)
        for (const side of [-1, 1]) g.add(sweep(FX, boxProfile(side * 1.4, 0.05, 1.6, 0.2), K.mat.boards, { uvLen: 2 }));
      }
      return g;
    },
  },
};

/** The rail of one piece from its game samples, in `style` (default steel). */
export function railModel(K, s, special, mats, style = RAIL_STYLES.steel, gauge = style.gauge) {
  const F = framesOf(s);
  return style.build(K, F, extended(F), special, mats, gauge);
}

// ------------------------------------------------------------------ support styles
export const SEG_H = 1.1; // a segment is drawn 10 cm taller (upward) so stacked segments overlap and never show a gap

/** A support style: `material(colour)` the support-colour material, `piece(K, part, t, mat)` one stacked part. */
export const SUPPORT_STYLES = {
  // Round steel columns on a concrete footing, a saddle across the track (stage 1).
  round: {
    material: (colour) => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.45, metalness: 0.3, clearcoat: 0.3 }),
    piece(K, part, t, mat) {
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
    },
  },
};

/** One support part (foot, seg, top) at track heading t, in `style` (default round). */
export function supportPiece(K, part, t, mat, style = SUPPORT_STYLES.round) {
  return style.piece(K, part, t, mat);
}

// ------------------------------------------------------------------ car styles
/**
 * A car style: `build(K, colour, i)` gives `{ car, riders }` (riders: the groups hidden in `empty`), the car centred on
 * the rail line, running along +z with up +y; `masked(mesh, colour)` its tint mask (the body in the car colour);
 * `front(car, on)` (types with a front car) switches the car to the train's front car.
 */
export const CAR_STYLES = {
  // Two rows of riders in an open car (stage 1).
  coaster: {
    build(K, colour, i = 0) {
      const car = sitCar(K, { seed: 1300 + i, color: colour, trim: '#c9ccd0', rows: 2 });
      const riders = [];
      car.traverse((o) => { if (o.isGroup && o !== car && o.parent === car) riders.push(o); });
      return { car, riders };
    },
    masked: (m, colour) => hex(m.material) === colour,
  },
};

/** Turns `car` to a quantised pose (yaw of 32, pitch and roll of 24 steps, src/render/real/pose.ts). */
export function poseCar(car, p) {
  const yaw = (p.yaw / 32) * Math.PI * 2, pitch = (p.pitch / 24) * Math.PI * 2, roll = (p.roll / 24) * Math.PI * 2;
  const tn = V(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)).normalize();
  const lat = V(0, 1, 0).cross(tn).normalize();
  const up = tn.clone().cross(lat).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(tn, -roll);
  lat.applyQuaternion(q); up.applyQuaternion(q);
  car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lat, up, tn));
}

/** A spec's styles, by name or given directly. */
export function stylesOf(spec) {
  const pick = (table, s, what) => {
    const st = typeof s === 'string' ? table[s] : s;
    if (!st) throw new Error(`${spec.item}: no ${what} style '${s}'`);
    return st;
  };
  return { rail: pick(RAIL_STYLES, spec.rail, 'rail'), supports: pick(SUPPORT_STYLES, spec.supports, 'support'), car: pick(CAR_STYLES, spec.car, 'car') };
}

// ------------------------------------------------------------------ the bake loop
/**
 * Bakes one track type from its style spec:
 *   spec = { item, rail, supports, car (style names or style objects), colours: { track, supports, cars } (the
 *            light colours the pictures are painted in: the game tints them), gauge? }
 * B.input.track is bakeNode.ts trackGeometry(spec.item).
 */
export function bakeTrackType(B, spec) {
  const K = kit();
  const track = B.input.track;
  if (!track || track.type !== spec.item) throw new Error(`${spec.item}: the bake input is for '${track?.type}'`);
  const st = stylesOf(spec);
  const gauge = spec.gauge ?? st.rail.gauge;
  const railMat = st.rail.material(spec.colours.track);
  const supMat = st.supports.material(spec.colours.supports);
  const bs = B.newScene();
  const hs = bakeCamera(0, 4).heightScale;

  // ---- rails: per class, heading, piece and rail tile, clipped to the tile.
  // The clip planes are global, so they cut the hold-out ground to the tile too, and anything under the ground
  // (the spine of a rail on the ground) then shows through beside the tile. A ShaderMaterial without the clipping
  // chunk is never clipped: it holds out the whole ground while the rails are shot.
  const holdOut = bs.ground.material;
  bs.ground.material = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
    colorWrite: false,
  });
  // |x| <= 2, |z| <= 2 round the tile centre, or the tile's `clip` rectangle (a rail tile that takes in rail-less
  // neighbours: bakeNode.ts clipRects), as planes [nx, nz, k] kept where nx·x + nz·z + k >= 0
  const clipOf = (tile) => {
    const [x0, x1, y0, y1] = tile.clip ?? [-2, 2, -2, 2];
    return [[1, 0, -x0], [-1, 0, x1], [0, 1, -y0], [0, -1, y1]];
  };
  const sets = new Map();
  const setOf = (cls, t) => {
    const k = `${cls}|${t}`;
    if (!sets.has(k)) sets.set(k, B.set('rail', classItem(spec.item, cls), t, true));
    return sets.get(k);
  };
  let cur = null; // the model of the (piece, heading) being shot
  let n = 0;
  for (const f of railFrames(track)) {
    if (!cur || cur.piece !== f.piece || cur.heading !== f.heading) {
      if (cur) bs.world.remove(cur.holder);
      const pc = track.pieces[f.piece];
      const model = railModel(K, pc.dirs[f.heading], pc.special, { rail: railMat }, st.rail, gauge);
      const holder = new THREE.Group();
      holder.add(model);
      bs.world.add(holder);
      B.setEnv(holder);
      cur = { piece: f.piece, heading: f.heading, model, holder };
    }
    cur.model.position.set(-(f.tile.x + 0.5) * 4, 0, -(f.tile.y + 0.5) * 4);
    const tileClip = clipOf(f.tile);
    if (f.sub === null) B.clip(tileClip);
    else {
      // a tall tile's sub-frame k: its band of SUB_M of rail range (the first takes all below, the last all above)
      const planes = tileClip.map(([nx, nz, k]) => new THREE.Plane(new THREE.Vector3(nx, 0, nz), k));
      const lo = f.tile.railMin + f.sub * SUB_M;
      if (f.sub > 0) planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -lo * hs));
      if (f.sub < f.subs - 1) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), (lo + SUB_M) * hs));
      B.clipPlanes(planes);
    }
    const shot = f.alpha ? B.shoot(bs, { target: cur.holder }) : B.shoot(bs, { target: cur.holder, masked: (m) => m.material === railMat });
    setOf(f.cls, f.heading).add([f.key], shot, f.alpha ? { alpha: true } : undefined);
    B.clip(null);
    n++;
  }
  if (cur) bs.world.remove(cur.holder);
  bs.ground.material = holdOut;
  B.log(`${spec.item}: ${n} rail pictures`);

  // ---- supports per heading: foot, 1 m segment, top (the game stacks them)
  for (let t = 0; t < 4; t++) {
    const set = B.set('support', spec.item, t, true);
    for (const part of SUPPORT_PARTS) {
      const m = supportPiece(K, part, t, supMat, st.supports);
      bs.world.add(m);
      B.setEnv(m);
      set.add([supportKey(part)], B.shoot(bs, { target: m, masked: (x) => x.material === supMat, noGround: part !== 'foot' }));
      bs.world.remove(m);
    }
  }

  // ---- cars per class and pose, full and empty (and the front car)
  const { car, riders } = st.car.build(K, spec.colours.cars);
  if (track.front && !st.car.front) throw new Error(`${spec.item}: the type has a front car but car style has no front variant`);
  const holder = new THREE.Group();
  holder.add(car);
  bs.world.add(holder);
  B.setEnv(holder);
  const carSets = new Map();
  let last = null;
  for (const f of carFrames(track)) {
    if (!carSets.has(f.cls)) carSets.set(f.cls, B.set('car', classItem(spec.item, f.cls), 'all', true));
    if (f.pose !== last) { poseCar(car, f.pose); last = f.pose; }
    if (track.front) st.car.front(car, f.front);
    for (const rd of riders) rd.visible = f.full;
    carSets.get(f.cls).add([f.key], B.shoot(bs, { target: holder, masked: (m) => st.car.masked(m, spec.colours.cars) }));
  }
  B.log(`${spec.item}: ${track.classes.map((c) => `${c.cls} ${c.pieces.length} pieces, ${c.poses.length} poses`).join('; ')}`);
}
