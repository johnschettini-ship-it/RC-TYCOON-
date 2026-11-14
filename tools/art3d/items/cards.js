// Card pictures (round 2 of stage 1): one small picture per baked game item, for the card and picker previews
// (src/render/real/cards.ts), all in one set preview:cards:d2:rall, frames keyed by the item id. Density 2 only: the
// set is always loaded, and its decoded size stays under 1 MB.
//
// Framing follows today's previews (src/render/renderer.ts drawPreview, scenery/preview.ts, track/preview.ts): the
// game's three-quarter view; a ride at rotation 0 and a stall at service direction 2 (its counter towards the
// viewer), each on the grass of its footprint; a scenery item at sprite rotation 2 and a path item at side 0 (facing
// the viewer), with no ground; the steel coaster as today's track preview scene (station, small turn, small hill)
// with a two-car train in the type's default colours.
//
// The models come from the items' own bake modules: each module's `bake` runs against a stand-in API that renders
// nothing except the one shot wanted for the card (the first picture of the wanted set), which it re-frames: the
// model is scaled so the picture fits CARD_W x CARD_H px at density 2, whatever its real size.
import { THREE, TILE, frameKey, kit } from './common.js';
import { std, rep, tx } from '../kit.js';
import { bakeCamera } from '../camera.ts';
import { sitCar } from '../rides.js';
import { railModel, supportPiece, SEG_H } from './steel_coaster.js';
import carousel from './carousel.js';
import swing_tower from './swing_tower.js';
import big_wheel from './big_wheel.js';
import snack_shack from './snack_shack.js';
import oak_round from './oak_round.js';
import pine_tall from './pine_tall.js';
import birch_silver from './birch_silver.js';
import willow from './willow.js';
import shrub_round from './shrub_round.js';
import boulder from './boulder.js';
import lamp_globe from './lamp_globe.js';
import bunting_pole from './bunting_pole.js';
import bench from './bench.js';
import bin from './bin.js';

/** The box a card picture fits, in density-2 px (about the card preview's 168 x 120 CSS px, less its padding). */
export const CARD_W = 160;
export const CARD_H = 114;

const MODULES = { carousel, swing_tower, big_wheel, snack_shack, oak_round, pine_tall, birch_silver, willow, shrub_round, boulder, lamp_globe, bunting_pole, bench, bin };

/** The set (kind, rot) whose first picture is the card, by card kind. */
const WANT = {
  ride: { kind: 'ride', rots: [0, 'all'] },
  stall: { kind: 'stall', rots: [2] },
  scenery: { kind: 'scenery', rots: [2] },
  path: { kind: 'scenery', rots: ['all'] },
};

function grassPatch(w, d) {
  const r = (n) => Math.max(1, (n * TILE) / 6); // the grass texture spans 6 m
  const mat = std({ map: rep(tx.grass.map, r(w), r(d)), bumpMap: rep(tx.grass.bump, r(w), r(d)), bumpScale: 1.2, roughness: 0.95 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, d * TILE), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((w * TILE) / 2, 0.004, (d * TILE) / 2);
  m.receiveShadow = true;
  return m;
}

/** Scale `group` (under `bs.world`) so its picture fits CARD_W x CARD_H at density 2, then shoot it (density 2 only). */
function cardShot(B, bs, group) {
  const cam = bakeCamera(0, 2);
  bs.world.scale.set(1, cam.heightScale, 1);
  group.scale.setScalar(1);
  const box = B.boxOf(group);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const X of [box.min.x, box.max.x]) for (const Y of [box.min.y, box.max.y]) for (const Z of [box.min.z, box.max.z]) {
    const p = cam.project(X, Z, Y / cam.heightScale);
    x0 = Math.min(x0, p.sx); x1 = Math.max(x1, p.sx); y0 = Math.min(y0, p.sy); y1 = Math.max(y1, p.sy);
  }
  // The box's projection is a little larger than the picture (corners of a box round a round model), so it fits.
  const s = Math.min(CARD_W / (x1 - x0), CARD_H / (y1 - y0));
  group.scale.setScalar(s);
  let shot = B.shoot(bs, { target: group });
  // Then fit the trimmed picture itself (thin parts and leaf cards make the box larger than what shows).
  const pic = shot[2];
  if (pic) {
    const f = Math.min(CARD_W / pic.canvas.width, CARD_H / pic.canvas.height);
    if (Math.abs(f - 1) > 0.03) {
      group.scale.setScalar(s * f * 0.99);
      shot = B.shoot(bs, { target: group });
    }
  }
  return shot[2] ? { 2: shot[2] } : {};
}

/** Runs an item's bake module against a stand-in API and returns the card shot of the wanted set's first picture. */
async function itemCard(B, card) {
  const mod = MODULES[card.id];
  if (!mod) throw new Error(`cards: no bake module for ${card.id}`);
  const want = WANT[card.kind];
  let cur = null;
  let shot = null;
  const P = {
    ...B,
    input: { spec: card.spec },
    log() {},
    set(kind, _item, rot) {
      cur = { kind, rot };
      return { add() {} };
    },
    shootShadow() {
      return {};
    },
    shoot(bs, o) {
      if (shot || !cur || cur.kind !== want.kind || !want.rots.includes(cur.rot)) return {};
      // Re-frame: the item's holder (placed and posed by its module) moves into a card group with its footprint's grass.
      const group = new THREE.Group();
      bs.world.add(group);
      group.add(o.target);
      if (card.kind === 'ride') {
        const [w, d] = card.spec.footprintTiles;
        group.add(grassPatch(w, d));
      } else if (card.kind === 'stall') group.add(grassPatch(1, 1));
      shot = cardShot(B, bs, group);
      return {};
    },
  };
  await mod.bake(P);
  if (!shot || !shot[2]) throw new Error(`cards: no card picture for ${card.id}`);
  return shot;
}

/** Today's track preview scene for the steel coaster, from the placed rail samples bake.mjs passes in. */
function coasterCard(B, coaster) {
  const K = kit();
  const col = coaster.colours;
  const railMat = new THREE.MeshPhysicalMaterial({ color: col.track, roughness: 0.4, metalness: 0.3, clearcoat: 0.4 });
  const supMat = new THREE.MeshPhysicalMaterial({ color: col.supports, roughness: 0.45, metalness: 0.3, clearcoat: 0.3 });
  const bs = B.newScene();
  const group = new THREE.Group();
  bs.world.add(group);
  for (const pc of coaster.pieces) {
    group.add(railModel(K, pc.samples, pc.special, { rail: railMat }));
    // Grass under the track tiles, as today's preview.
    const g = grassPatch(1, 1);
    g.position.x += pc.tile[0] * TILE;
    g.position.z += pc.tile[1] * TILE;
    group.add(g);
  }
  // Supports: under every raised piece (as today's preview: middle sample above 0.5 m), at its middle sample, stacked
  // as the game stacks them (foot, 1 m segments to 1.2 m under the rail line, the saddle across the track there).
  for (const pc of coaster.pieces) {
    const s = pc.samples;
    const k = Math.floor(s.n / 2);
    const z = s.z[k];
    if (z <= 0.5) continue;
    const at = (o, y) => { o.position.set(s.x[k], y, s.y[k]); group.add(o); };
    at(supportPiece(K, 'foot', 0, supMat), 0);
    const top = Math.max(0.25, z - 1.2);
    for (let y = 0.25; y + 0.2 < top; y += 1) {
      const seg = supportPiece(K, 'seg', 0, supMat);
      seg.scale.y = Math.min(1, (top - y) / SEG_H);
      at(seg, y);
    }
    const heading = ((Math.round(s.yaw[k] / (Math.PI / 2)) % 4) + 4) % 4;
    at(supportPiece(K, 'top', heading, supMat), top);
  }
  // A two-car train on the second station piece (as today's preview), as the game draws cars: centre on the rail
  // line, facing along it.
  const st = (coaster.pieces[1] ?? coaster.pieces[0]).samples;
  for (const [i, frac] of [[0, 0.3], [1, 0.85]]) {
    const k = Math.min(st.n - 1, Math.round(frac * (st.n - 1)));
    const car = sitCar(K, { seed: 1300 + i, color: col.cars, trim: '#c9ccd0', rows: 2 });
    const yaw = st.yaw[k], pitch = st.pitch[k];
    const tn = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)).normalize();
    const lat = new THREE.Vector3(0, 1, 0).cross(tn).normalize();
    const up = tn.clone().cross(lat).normalize();
    car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lat, up, tn));
    car.position.set(st.x[k], st.z[k], st.y[k]);
    group.add(car);
  }
  B.setEnv(group);
  return cardShot(B, bs, group);
}

export default {
  async bake(B) {
    const { items, coaster } = B.input.cards;
    const set = B.set('preview', 'cards', 'all');
    for (const card of items) {
      const shot = card.kind === 'track' ? coasterCard(B, coaster) : await itemCard(B, card);
      set.add([frameKey([card.id])], shot);
      B.log(`cards: ${card.id} ${shot[2].canvas.width}x${shot[2].canvas.height}`);
    }
  },
};
