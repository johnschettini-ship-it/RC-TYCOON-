/**
 * Start-up of the realistic look (`?art=real`, stage 1). Loaded lazily by `main.ts` only when `artStyle()` is
 * 'real', so none of this code is in the website's first download (spec §6 S7).
 *
 * 1. Every storage key gets the prefix `tcreal:` first, before the game reads any saved data: the test shares its
 *    website address with the real game and must never touch its saves (`./storagePrefix.ts`).
 * 2. Fetch `art/real/index.json` relative to the page. On any failure (no baked art, bad index): one plain error
 *    line (`ui.realArt.loadFailed`) and `null`, so the game starts with today's look and today's height step.
 * 3. Build the set manager (decode off the main thread with `createImageBitmap`, decode budget F2 (a) 128 MB),
 *    the look, and the ground; switch the height step to `REAL_STEP_PX`; report decoded memory to the perf probe.
 */
import { t } from '../../data/strings';
import { perfProbe } from '../../perf/stats';
import { REAL_STEP_PX } from '../artStyle';
import { setStepPx } from '../heightStep';
import type { RealOptions } from '../renderer';
import { RealGround } from './ground';
import type { RealIndex } from './indexFormat';
import { createRealLook } from './look';
import { SetManager, type Decoded, type SetIO } from './setManager';
import { installStoragePrefix, pageStorage } from './storagePrefix';

/** Spec F2 (a): the most decoded picture memory the realistic look may hold. */
export const REAL_DECODE_BUDGET_BYTES = 128 * 1024 * 1024;
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
  const ground = new RealGround(look, { hold: (id, bytes) => sets.hold(id, bytes) });
  perfProbe.realMemory = () => [sets.residentBytes(), sets.peakBytes()];
  setStepPx(REAL_STEP_PX);
  return { look, sets, ground };
}
