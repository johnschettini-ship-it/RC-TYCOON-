/** Phase 8b stage 0b test (never merged): catalogue of people (guests with their shadow, staff). */
import { K_GUEST, K_STAFF } from '../../../src/render/pixel/app/keys';
import { GUEST_SHADOW, casterMask } from '../../../src/render/pixel/shadows';
import { SHIRT_COLOURS, TINT_STEPS, rgbCss, tintStepRgb } from '../../../src/render/palette';
import { GUEST_BALLOON, GUEST_UMBRELLA, guestFrame, guestSpriteKey, staffSpriteKey } from '../../../src/render/sprites/bank';
import { GUEST_BOUNDS, GUEST_ITEM_BOUNDS, ITEM_COLOURS, drawGuestArt } from '../../../src/render/sprites/props';
import { HAIR_COLOURS, SKIN_TONES } from '../../../src/render/sprites/shapes';
import { COSTUME_CODE, STAFF_BOUNDS, STAFF_TYPE_CODE, decodeStaffFrame, drawStaffArt, staffFrame } from '../../../src/render/sprites/staff';
import type { Dir } from '../../../src/sim/map';
import type { Picture } from '../picture';
import { shadowPicture } from '../ramps';
import { painter } from './objects';
import type { PictureSpec } from './types';

const FACINGS: readonly Dir[] = [0, 1, 2, 3];
const BUCKET = 0.5;

// As `SpriteBank.guest` (`src/render/sprites/bank.ts`): the 4 skin and hair looks and the fixed item colours.
const LOOKS: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [1, 1],
  [2, 0],
  [3, 3],
];
const itemColour = (colour: number, offset: number): string => ITEM_COLOURS[(colour + offset) % ITEM_COLOURS.length] as string;

/** `top` over `under` (anchors aligned): `under` shows only where `top` is transparent; bounds are the union. */
export function overlay(top: Picture, under: Picture): Picture {
  const left = Math.max(top.ox, under.ox);
  const up = Math.max(top.oy, under.oy);
  const w = left + Math.max(top.w - top.ox, under.w - under.ox);
  const h = up + Math.max(top.h - top.oy, under.h - under.oy);
  const slots = new Uint8Array(w * h);
  const put = (p: Picture, keep: boolean): void => {
    const dx = left - p.ox;
    const dy = up - p.oy;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const v = p.slots[y * p.w + x] as number;
        const k = (y + dy) * w + x + dx;
        if (v !== 0 && !(keep && slots[k] !== 0)) slots[k] = v;
      }
    }
  };
  put(top, false);
  put(under, true);
  return { w, h, ox: left, oy: up, slots };
}

/** The guest stamp of `SpriteBank.guest` for a frame, on top of the guest shadow (phase 0). */
function guestPainter(facing: Dir, frame: number): () => Picture {
  const colour = frame & 15;
  const tinted = (frame & 256) !== 0;
  const look = LOOKS[(frame >> 6) & 3] as readonly [number, number];
  const shirt = tinted ? rgbCss(tintStepRgb(colour)) : (SHIRT_COLOURS[colour % SHIRT_COLOURS.length] as string);
  const balloon = (frame & GUEST_BALLOON) !== 0 ? itemColour(colour, 3) : null;
  const umbrella = (frame & GUEST_UMBRELLA) !== 0 ? itemColour(colour, 1) : null;
  const stamp = painter(balloon || umbrella ? GUEST_ITEM_BOUNDS : GUEST_BOUNDS, (ctx) =>
    drawGuestArt(ctx, {
      shirt,
      skin: SKIN_TONES[look[0]] as string,
      hair: HAIR_COLOURS[look[1]] as string,
      facing,
      walk: (frame >> 4) & 3,
      ring: tinted ? shirt : null,
      ringStep: tinted ? colour : -1,
      balloon,
      umbrella,
    }),
  );
  return () => overlay(stamp(), shadowPicture(casterMask(GUEST_SHADOW, 0), 0));
}

/** Every guest frame the renderer makes: shirt colour (untinted) or tint step (tinted), walk 0-3 (3 sits), look, items. */
function guestFrames(): number[] {
  const out: number[] = [];
  const items = [0, GUEST_BALLOON, GUEST_UMBRELLA, GUEST_BALLOON | GUEST_UMBRELLA];
  for (const [tinted, colours] of [
    [false, SHIRT_COLOURS.length],
    [true, TINT_STEPS],
  ] as const)
    for (let colour = 0; colour < colours; colour++)
      for (let walk = 0; walk < 4; walk++) for (let look = 0; look < LOOKS.length; look++) for (const it of items) out.push(guestFrame(colour, walk, look, tinted, it));
  return out;
}

/** Every staff frame the management layer makes: type, costume (performers only), walk 0-2, action 0-2. */
function staffFrames(): number[] {
  const out: number[] = [];
  for (const type of Object.values(STAFF_TYPE_CODE)) {
    const costumes = type === STAFF_TYPE_CODE.performer ? [0, ...Object.values(COSTUME_CODE)] : [0];
    for (const costume of costumes) for (let walk = 0; walk < 3; walk++) for (let action = 0; action < 3; action++) out.push(staffFrame(type, costume, walk, action));
  }
  return out;
}

/** Pack `people`: guests (one group `guest`, fix round 1 M1: facings share sheets, so equal pictures dedupe) and staff (group `staff`). */
export function peopleSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  const guests = guestFrames();
  for (const facing of FACINGS) {
    for (const frame of guests) {
      const key = guestSpriteKey(facing, frame, BUCKET);
      out.push({ pack: 'people', group: 'guest', kind: K_GUEST, key, paint: guestPainter(facing, frame), ref: ['guest', key, facing, frame] });
    }
  }
  for (const frame of staffFrames()) {
    for (const facing of FACINGS) {
      const key = staffSpriteKey(facing, frame, BUCKET);
      const paint = painter(STAFF_BOUNDS, (ctx) => drawStaffArt(ctx, { ...decodeStaffFrame(frame), facing }));
      out.push({ pack: 'people', group: 'staff', kind: K_STAFF, key, paint, ref: ['staff', key, facing, frame] });
    }
  }
  return out;
}
