// Small tubular steel track (batch 5 Task 6): the rail and round-column styles of the junior coaster and the spinning
// mouse, built from each type's own numbers (its spec module passes them in). Same contract as the kit's steel style
// (trackKit.js RAIL_STYLES / SUPPORT_STYLES): the rail line is the rails' centre line, every part that takes the track
// colour uses `mats.rail`, and the support `top` is anchored SUPPORT_TOP_BELOW_RAIL under the rail line, its post
// reaching into the bottom of the type's spine.
import { THREE } from './common.js';
import { M } from '../kit.js';
import { sweep, boxProfile, Beams } from '../rides.js';
import { RAIL_STYLES, SEG_H } from './trackKit.js';

/** A round tube profile (sweep) at lateral `l`, up `u`. */
export function tube(l, u, r, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([l + Math.cos(a) * r, u + Math.sin(a) * r]); }
  return [pts];
}

/**
 * A tubular steel rail style:
 *   gauge      half the rail spacing (m)
 *   railR      rail tube radius
 *   spine      [up, width, height] of the box spine under the rails (its centre `up` m under the rail line, negative)
 *   tieEvery   samples (0.25 m) between ties
 *   tie        [width along the track, depth] of a tie
 *   ladder     optional: [up, width, height] of a small stringer under each rail, and cross ties between them (the
 *              mouse's ladder frame)
 *   platform   lateral centre of the station platforms
 *   material   the track-colour material
 */
export function tubeRail({ gauge, railR, spine, tieEvery = 4, tie = [0.06, 0.045], ladder = null, platform = 1.4, material }) {
  const [sy, sw, sh] = spine;
  return {
    gauge,
    spine,
    material,
    build(K, F, FX, special, mats, g) {
      const out = new THREE.Group();
      out.add(sweep(FX, [...tube(-g, 0, railR), ...tube(g, 0, railR)], mats.rail, { uvLen: 2 }));
      out.add(sweep(FX, boxProfile(0, sy, sw, sh), mats.rail, { uvLen: 2 }));
      const ties = new Beams();
      const top = sy + sh / 2; // the spine's top face
      for (let i = (tieEvery - ((F.i0 ?? 0) % tieEvery)) % tieEvery; i <= F.NS; i += tieEvery) {
        const p = F.P[i], l = F.Lt[i], u = F.Up[i];
        const at = (a, b) => p.clone().addScaledVector(l, a).addScaledVector(u, b);
        if (ladder) {
          const [ly, , lh] = ladder;
          // a cross tie between the stringers, and a strut from each stringer down to the spine
          ties.add(at(-g, ly - lh / 2), at(g, ly - lh / 2), tie[0], tie[1], u);
          ties.add(at(-g, ly - lh / 2), at(0, top - 0.05), tie[0], tie[1], u);
          ties.add(at(g, ly - lh / 2), at(0, top - 0.05), tie[0], tie[1], u);
        } else {
          ties.add(at(-g, -railR * 0.4), at(0, top - 0.05), tie[0], tie[1], u);
          ties.add(at(g, -railR * 0.4), at(0, top - 0.05), tie[0], tie[1], u);
        }
      }
      out.add(ties.mesh(mats.rail));
      if (ladder) {
        const [ly, lw, lh] = ladder;
        for (const s of [-1, 1]) out.add(sweep(FX, boxProfile(s * g, ly, lw, lh), mats.rail, { uvLen: 2 }));
      }
      if (special === 'brakes' || special === 'blockBrake') out.add(sweep(FX, boxProfile(0, (top - 0.06) / 2, 0.045, -0.06 - top), K.mat.darkSteel, { uvLen: 2 }));
      if (special === 'station') for (const side of [-1, 1]) out.add(sweep(FX, boxProfile(side * platform, 0.05, 1.6, 0.2), K.mat.boards, { uvLen: 2 }));
      return out;
    },
    // the steel coaster's chain trough: it sits between the rails above any of these spines
    trough: RAIL_STYLES.steel.trough,
  };
}

/**
 * A round steel column style (the kit's `round`, in a type's own sizes):
 *   r        column radius
 *   footR    footing radius
 *   saddle   length of the saddle across the track
 *   postR    saddle post radius
 *   reach    height of the top piece (plate 0.2 m + post): the post ends `SUPPORT_TOP_BELOW_RAIL − reach` under the rail
 *            line, which must be inside the type's spine
 */
export function roundSupport({ r, footR, saddle, postR, reach }) {
  const PLATE = 0.2;
  return {
    reach,
    material: (colour) => new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.45, metalness: 0.3, clearcoat: 0.3 }),
    piece(K, part, t, mat) {
      const g = new THREE.Group();
      if (part === 'foot') {
        g.add(M(new THREE.CylinderGeometry(footR * 0.85, footR, 0.25, 16), K.mat.concrete).translateY(0.125));
      } else if (part === 'seg') {
        g.add(M(new THREE.CylinderGeometry(r, r, SEG_H, 16), mat).translateY(SEG_H / 2));
      } else {
        // the saddle across the track (track along three x at t = 0, along z at t = 1), then the post up into the spine
        const across = M(new THREE.BoxGeometry(0.26, PLATE, saddle), mat);
        across.position.y = PLATE / 2;
        across.rotation.y = (-t * Math.PI) / 2;
        g.add(across);
        g.add(M(new THREE.CylinderGeometry(postR, postR, reach - PLATE, 12), mat).translateY(PLATE + (reach - PLATE) / 2));
      }
      return g;
    },
  };
}
