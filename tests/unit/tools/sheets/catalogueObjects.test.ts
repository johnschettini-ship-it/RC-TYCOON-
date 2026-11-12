/** Phase 8b stage 0b test (never merged): the catalogue of objects, ghosts, shadows and people (keys, counts, pictures). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../../src/data/catalog/flatRides';
import { ANGLE_FRAMES, coarseRideFrame, decodeRideFrame, encodeRideFrame } from '../../../../src/render/anim';
import { K_DECAL, K_ENTRANCE, K_FENCE, K_GHOST, K_GUEST, K_PATH_ITEM, K_RIDE, K_SCENERY, K_SHADOW, K_SHOW, K_STAFF, K_STALL } from '../../../../src/render/artHook';
import { ghostKey, shadowKey } from '../../../../src/render/pixel/app/keys';
import { trimmedHash } from '../../../../src/render/pixel/app/format';
import { SLOT_RGBA } from '../../../../src/render/pixel/palette';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';
import { scenerySpriteKey } from '../../../../src/render/scenery/sprites';
import { spriteKey } from '../../../../src/render/spriteCache';
import { decalSpriteKey, guestSpriteKey, pathItemSpriteKey, staffSpriteKey } from '../../../../src/render/sprites/bank';
import { GUEST_BOUNDS, drawGuestArt } from '../../../../src/render/sprites/props';
import { drawRideArt, rideArtBounds } from '../../../../src/render/sprites/rides';
import { HAIR_COLOURS, SKIN_TONES } from '../../../../src/render/sprites/shapes';
import { SHIRT_COLOURS } from '../../../../src/render/palette';
import { objectSpecs } from '../../../../tools/sheets/catalogue/objects';
import { peopleSpecs } from '../../../../tools/sheets/catalogue/people';
import type { PictureSpec } from '../../../../tools/sheets/catalogue/types';
import { paintPicture, type Picture } from '../../../../tools/sheets/picture';
import { SHADOW_SLOT } from '../../../../tools/sheets/ramps';
import type { Dir } from '../../../../src/sim/map';

beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

const objects = objectSpecs();
const people = peopleSpecs();
const all: PictureSpec[] = [...objects, ...people];

/** RGBA bytes of a picture (slot colours, index 0 transparent). */
function rgbaOf(p: Picture): Uint8Array {
  const out = new Uint8Array(p.w * p.h * 4);
  const v = new Uint32Array(out.buffer);
  for (let k = 0; k < p.slots.length; k++) v[k] = SLOT_RGBA[p.slots[k] as number] as number;
  return out;
}

/** `0xRRGGBB` of a slot. */
function rgbOfSlot(s: number): number {
  const v = SLOT_RGBA[s] as number;
  return ((v & 255) << 16) | (v & 0xff00) | ((v >>> 16) & 255);
}

const hashOf = (p: Picture, skip = -1): number => trimmedHash(rgbaOf(p), p.w, p.h, p.ox, p.oy, skip);

/** The key the game computes from a spec's `ref` (bucket 0.5). */
function gameKey(s: PictureSpec): number {
  const r = s.ref;
  if (!r) throw new Error('no ref');
  const [m, ...a] = r;
  switch (m) {
    case 'ride':
      return spriteKey(a[0] as string, a[3] as number, a[4] as number, 0.5);
    case 'stall':
      return spriteKey(a[0] as string, a[1] as number, a[2] as number, 0.5);
    case 'scenery': {
      const k = scenerySpriteKey(a[1] as string, a[2] as Dir, a[3] as number, 0.5);
      expect(a[0]).toBe(k);
      return k;
    }
    case 'pathItem': {
      const k = pathItemSpriteKey(a[1] as number, 0.5);
      expect(a[0]).toBe(k);
      return k;
    }
    case 'decal': {
      const k = decalSpriteKey(a[1] as number, a[2] as number, 0.5);
      expect(a[0]).toBe(k);
      return k;
    }
    case 'fence':
      return spriteKey('fence', a[0] as number, 0, 0.5);
    case 'entrance': {
      const outer = a[1] as number;
      return spriteKey('park_entrance', outer < 0 ? 2 : outer, a[0] as number, 0.5);
    }
    case 'show':
      return spriteKey(a[0] as string, a[1] as number, a[2] as number, 0.5);
    case 'guest': {
      const k = guestSpriteKey(a[1] as number, a[2] as number, 0.5);
      expect(a[0]).toBe(k);
      return k;
    }
    case 'staff': {
      const k = staffSpriteKey(a[1] as number, a[2] as number, 0.5);
      expect(a[0]).toBe(k);
      return k;
    }
    default:
      throw new Error(`unknown ref ${m}`);
  }
}

const KINDS_WITH_REF = [K_RIDE, K_STALL, K_SCENERY, K_PATH_ITEM, K_DECAL, K_FENCE, K_ENTRANCE, K_SHOW, K_GUEST, K_STAFF];

describe('catalogue of objects and people', () => {
  it('keys equal the game key functions', () => {
    for (const kind of KINDS_WITH_REF) {
      const specs = all.filter((s) => s.kind === kind);
      expect(specs.length, `kind ${kind}`).toBeGreaterThan(0);
      const stride = Math.max(1, Math.floor(specs.length / 50));
      for (let i = 0; i < specs.length; i += stride) {
        const s = specs[i] as PictureSpec;
        expect(s.key, JSON.stringify(s.ref)).toBe(gameKey(s));
      }
    }
    // Ghosts and shadows: new keys (no game key), built from the object's kind, def, view (and phase).
    const ghost = objects.find((s) => s.kind === K_GHOST && s.group === 'ghost/ride') as PictureSpec;
    expect(ghost.ref).toBeNull();
    expect(objects.filter((s) => s.kind === K_GHOST).map((s) => s.key)).toContain(ghostKey(K_RIDE, 'carousel', 2));
    expect(objects.filter((s) => s.kind === K_SHADOW).map((s) => s.key)).toContain(shadowKey(K_RIDE, 'carousel', 1, 1));
  });

  it('keys are unique per kind and pack', () => {
    const seen = new Map<string, number>();
    for (const s of all) {
      const id = `${s.pack}/${s.kind}/${s.key}`;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    expect([...seen.values()].filter((n) => n > 1)).toEqual([]);
    expect(seen.size).toBe(all.length);
  });

  it('ride counts: full and coarse sets', () => {
    const n = FLAT_RIDES.length;
    expect(n).toBe(18);
    const full = objects.filter((s) => s.pack === 'rides-full');
    const coarse = objects.filter((s) => s.pack === 'rides-coarse');
    expect(full.length).toBe(18 * 4 * 32 * 5 + 4 * 32 * 5 * 4);
    expect(coarse.length).toBe(18 * 4 * 16 * 3 + 4 * 16 * 3 * 4);
    // Every coarse frame is a frame `coarseRideFrame` gives, and is also in the full set.
    const fullKeys = new Set(full.map((s) => s.key));
    for (const s of coarse) {
      const frame = (s.ref as [string, string, number, number, number, number])[5];
      expect(coarseRideFrame(frame)).toBe(frame);
      expect(fullKeys.has(s.key)).toBe(true);
    }
  });

  it('group rule: a rides group holds one ride, one view and one occupancy', () => {
    for (const s of objects) {
      if (s.pack !== 'rides-full' && s.pack !== 'rides-coarse') continue;
      const [defId, view, occ] = s.group.split('/');
      const ref = s.ref as [string, string, number, number, number, number];
      expect(ref[1]).toBe(defId);
      expect(String(ref[4])).toBe(view);
      expect(String(decodeRideFrame(ref[5]).occupancy)).toBe(occ);
    }
  });

  it('guest pictures hold the stamp and a shadow under it', () => {
    // Shirt colour 3, walking step 1, look 1 (skin 1, hair 1), untinted, no items, facing 2.
    const spec = people.find((s) => s.kind === K_GUEST && s.ref?.[2] === 2 && s.ref?.[3] === (3 | (1 << 4) | (1 << 6))) as PictureSpec;
    expect(spec).toBeDefined();
    const pic = spec.paint();
    expect(pic.slots.some((v) => v === SHADOW_SLOT)).toBe(true);
    const cleared: Picture = { ...pic, slots: pic.slots.map((v) => (v === SHADOW_SLOT ? 0 : v)) };
    const stamp = paintPicture(GUEST_BOUNDS, (c) =>
      drawGuestArt(c, {
        shirt: SHIRT_COLOURS[3] as string,
        skin: SKIN_TONES[1] as string,
        hair: HAIR_COLOURS[1] as string,
        facing: 2,
        walk: 1,
        ring: null,
        ringStep: -1,
        balloon: null,
        umbrella: null,
      }),
    );
    const skip = rgbOfSlot(SHADOW_SLOT);
    expect(hashOf(cleared, skip)).toBe(hashOf(stamp, skip));
    // The shadow lies only where the stamp is transparent: every stamp pixel is still in the picture.
    expect(stamp.slots.filter((v) => v !== 0).length).toBe(cleared.slots.filter((v) => v !== 0).length);
  });

  it('a ride picture equals the stage 0 surface for the same call', () => {
    const frame = encodeRideFrame(0, 0, 0);
    const spec = objects.find((s) => s.pack === 'rides-full' && s.key === spriteKey('carousel', 2, frame, 0.5)) as PictureSpec;
    expect(spec).toBeDefined();
    const a = spec.paint();
    const b = paintPicture(rideArtBounds('carousel', 3, 3, 2), (c) => drawRideArt(c, 'carousel', 3, 3, { rotation: 2, angle: 0 / ANGLE_FRAMES, swing: 0, occupancy: 0 }));
    expect([a.w, a.h, a.ox, a.oy]).toEqual([b.w, b.h, b.ox, b.oy]);
    expect(Array.from(a.slots)).toEqual(Array.from(b.slots));
  });

  it('shadow pictures are the caster mask in two phases, ghosts are plain frame-0 pictures', () => {
    const s0 = objects.find((s) => s.key === shadowKey(K_STALL, 'snack_shack', 0, 0)) as PictureSpec;
    const s1 = objects.find((s) => s.key === shadowKey(K_STALL, 'snack_shack', 0, 1)) as PictureSpec;
    const p0 = s0.paint();
    const p1 = s1.paint();
    expect(p0.slots.every((v) => v === 0 || v === SHADOW_SLOT)).toBe(true);
    for (let k = 0; k < p0.slots.length; k++) expect(p0.slots[k] !== 0 && p1.slots[k] !== 0).toBe(false);
    const g = objects.find((s) => s.kind === K_GHOST && s.key === ghostKey(K_RIDE, 'carousel', 2)) as PictureSpec;
    const r = objects.find((s) => s.pack === 'rides-full' && s.key === spriteKey('carousel', 2, 0, 0.5)) as PictureSpec;
    expect(Array.from(g.paint().slots)).toEqual(Array.from(r.paint().slots));
  });
});
