/**
 * Start-up of the realistic look (`?art=real`, stage 1). Loaded lazily by `main.ts` only when `artStyle()` is
 * 'real', so none of this code is in the website's first download (spec §6 S7).
 *
 * 1. Every storage key gets the prefix `tcreal:` first, before the game reads any saved data: the test shares its
 *    website address with the real game and must never touch its saves (`./storagePrefix.ts`).
 * 2. Fetch `art/real/index.json` relative to the page. On any failure (no baked art, bad index): one plain error
 *    line (`ui.realArt.loadFailed`) and `null`, so the game starts with today's look and today's height step.
 * 3. Build the set manager (decode off the main thread with `createImageBitmap`, decode budget F2 (a) 128 MB),
 *    the look, and the ground, with the ground's chunks and the look's tinted sheets admitted to and reclaimed by
 *    the same budget; switch the height step to `REAL_STEP_PX`; report decoded memory to the perf probe.
 * 4. Decode the card picture set (when the bake has it) and give the card previews its drawer (`setCardArt`).
 */
import { t } from '../../data/strings';
import { perfProbe } from '../../perf/stats';
import { REAL_STEP_PX } from '../artStyle';
import { setStepPx } from '../heightStep';
import type { RealOptions } from '../renderer';
import { setCardArt } from '../cardArt';
import { CARD_SET, cardPicture } from './cards';
import { RealGround } from './ground';
import type { RealIndex } from './indexFormat';
import { createRealLook } from './look';
import { SetManager, type Decoded, type SetIO } from './setManager';
import { installStoragePrefix, pageStorage } from './storagePrefix';

/** Spec F2 (a): the most decoded picture memory the realistic look may hold. */
export const REAL_DECODE_BUDGET_BYTES = 128 * 1024 * 1024;
/** The longest the boot waits for the card pictures before the game starts (they are small: well under this). */
const CARD_WAIT_MS = 3000;
/** Where the baked art lives, relative to the page. */
export const REAL_ART_BASE = 'art/real/';

export interface RealBootDeps {
  fetch: (url: string) => Promise<Response>;
  decode: (blob: Blob) => Promise<Decoded>;
  /** Shows the error line (default: a plain line at the top of the page). */
  show: (message: string) => void;
  storage: Storage | null;
}

async function bitmap(blob: Blob): Promise<Decoded> {
  const b = await createImageBitmap(blob);
  return { image: b, bytes: b.width * b.height * 4, close: () => b.close() };
}

function showLine(message: string): void {
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.textContent = message;
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:1000;padding:4px 8px;font:14px sans-serif;background:#000;color:#fff';
  document.body.appendChild(el);
}

/** The renderer options of the realistic look, or null (error line shown) to start with today's look. */
export async function bootReal(deps: Partial<RealBootDeps> = {}): Promise<RealOptions | null> {
  // Already installed by `main.ts` (`startRealBuild`); kept here so `bootReal` alone is safe too (a no-op twice).
  const store = deps.storage === undefined ? pageStorage() : deps.storage;
  if (store) installStoragePrefix(store, 'tcreal:');
  const get = deps.fetch ?? ((url: string) => fetch(url));
  let index: RealIndex;
  try {
    const res = await get(`${REAL_ART_BASE}index.json`);
    if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
    index = (await res.json()) as RealIndex;
    if (index.format !== 'real/1' || !Array.isArray(index.sets)) throw new Error('index.json: not a real/1 index');
  } catch (err) {
    console.warn('[art=real]', err);
    (deps.show ?? showLine)(t('ui.realArt.loadFailed'));
    return null;
  }
  const io: SetIO = {
    async read(file) {
      const res = await get(REAL_ART_BASE + file);
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      return res.blob();
    },
    decode: deps.decode ?? bitmap,
  };
  const report = (key: string, err: unknown): void => console.warn('[art=real]', key, err);
  const sets = new SetManager(index, io, REAL_DECODE_BUDGET_BYTES, report);
  const look = createRealLook(index, sets, { onError: report });
  const ground = new RealGround(look, {
    hold: (id, bytes, up) => sets.hold(id, bytes, up),
    admit: (id, bytes, up) => sets.admit(id, bytes, up),
    onError: (err) => report('ground', err),
  });
  // Ladder step before any density drops: ground chunks off screen first, then tinted sheets least recently used.
  sets.addReclaimer((n) => ground.reclaim(n));
  sets.addReclaimer((n) => look.reclaim(n));
  perfProbe.realMemory = () => [sets.residentBytes(), sets.peakBytes()];
  // Card pictures: their set decodes now (small), so the cards the UI draws first show them; a card drawn before it
  // is ready, or without it, shows today's preview.
  if (index.sets.some((e) => e.key === CARD_SET)) {
    sets.beginFrame(0);
    sets.want([CARD_SET], 'now');
    sets.endFrame();
    const t0 = Date.now();
    while (sets.state(CARD_SET) === 'loading' && Date.now() - t0 < CARD_WAIT_MS) await new Promise((r) => setTimeout(r, 10));
    setCardArt(cardPicture(sets));
  }
  setStepPx(REAL_STEP_PX);
  return { look, sets, ground };
}
