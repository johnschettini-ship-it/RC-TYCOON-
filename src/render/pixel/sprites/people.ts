/** Phase 8 stage 0 prototype (never merged): guest stamps, the twin of `drawGuestArt` (spec §8.2, §8.3). */
import type { ArtCtx } from '../../sprites/shapes';
import type { GuestLook } from '../../sprites/props';
import { stamp, type Stamp } from '../stamp';

// Stage 0 keeps `GUEST_BOUNDS` (the 12-row stamp reaches world y −22, inside the surface pad). No items, rings or
// sit frame; no frame is mirrored (Prototype decision 8).

/** The draft guest, front (`GUEST`, `pixel3.py:256`). */
export const GUEST_FRONT: Stamp = {
  rows: ['..ooo..', '.oHHHo.', 'oHHHHHo', 'oHSSSHo', '.oSSSo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.'],
};

/** The draft guest, back (`GUEST_BACK`, `pixel3.py:257`): hair in place of the face. */
export const GUEST_BACK: Stamp = {
  rows: ['..ooo..', '.oHHHo.', 'oHHHHHo', 'oHHHHHo', '.oHHHo.', 'oTTTTTo', 'oTTTTTo', 'oSTTTSo', '.oTTTo.', '.oPPPo.', '.oPoPo.', '.oo.oo.'],
};

// A step lifts one leg: that leg is one row shorter, its foot outline one row higher.
const LEFT_STEP = ['.oooPo.', '....oo.'];
const RIGHT_STEP = ['.oPooo.', '.oo....'];

const withLegs = (s: Stamp, legs: readonly string[]): Stamp => ({ rows: [...s.rows.slice(0, 10), ...legs] });

/** Front, left leg lifted. */
export const GUEST_STEP_1: Stamp = /* @__PURE__ */ withLegs(GUEST_FRONT, LEFT_STEP);
/** Front, right leg lifted. */
export const GUEST_STEP_2: Stamp = /* @__PURE__ */ withLegs(GUEST_FRONT, RIGHT_STEP);
/** Back, left leg lifted. */
export const GUEST_BACK_STEP_1: Stamp = /* @__PURE__ */ withLegs(GUEST_BACK, LEFT_STEP);
/** Back, right leg lifted. */
export const GUEST_BACK_STEP_2: Stamp = /* @__PURE__ */ withLegs(GUEST_BACK, RIGHT_STEP);

/** The Classic trousers (`drawGuestArt`, `props.ts`). */
const TROUSERS = '#2f3b55';

/** The guest twin: back rows for N and W, front rows for E and S; walk 1 and 2 are the steps, 0 and 3 stand. */
export function drawGuestPixel(ctx: ArtCtx, g: GuestLook): void {
  const back = g.facing === 0 || g.facing === 3;
  let s: Stamp;
  if (g.walk === 1) s = back ? GUEST_BACK_STEP_1 : GUEST_STEP_1;
  else if (g.walk === 2) s = back ? GUEST_BACK_STEP_2 : GUEST_STEP_2;
  else s = back ? GUEST_BACK : GUEST_FRONT;
  stamp(ctx, s, 0, 0, { H: g.hair, S: g.skin, T: g.shirt, P: TROUSERS });
}
