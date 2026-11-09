/**
 * Shared client state of the scenario front end. Owner: W3-I. Browser only.
 * - the one progress store (`tc.progress`, Phase 5 §4.12) and the "Unlock all scenarios" setting (kept for the
 *   session; Phase 6 settings will store it);
 * - the title bridge, so the end screen can open the title at a view;
 * - the last pointer type, so tutorial text says "click" or "tap" (Phase 5 §4.11).
 */
import { ProgressStore } from '../../progress';
import { browserStore } from '../../save';
import type { ScenarioFlow } from './flow';

let store: ProgressStore | null = null;

export function progressStore(): ProgressStore {
  store ??= new ProgressStore(browserStore());
  return store;
}

export const settings = { unlockAll: false };

export type TitleView = 'main' | 'newGame' | 'scenarios' | 'sandbox';

export interface TitleBridge {
  open(view: TitleView): void;
  isOpen(): boolean;
  /** The title's scenario flow (end screen, starts). */
  flow: ScenarioFlow;
}

let title: TitleBridge | null = null;

export function registerTitle(t: TitleBridge): void {
  title = t;
}

export function openTitle(view: TitleView): void {
  title?.open(view);
}

export function titleOpen(): boolean {
  return title?.isOpen() ?? false;
}

/** The title screen or any dialog is open (`data-tc-modal` on <body>): scenario overlays step aside. */
export function modalOpen(): boolean {
  return titleOpen() || (typeof document !== 'undefined' && document.body.dataset.tcModal !== undefined);
}

export function titleFlow(): ScenarioFlow | null {
  return title?.flow ?? null;
}

let pointer: 'mouse' | 'touch' | null = null;
let listening = false;

/** The last pointer type: 'touch' for fingers and pens, else 'mouse'. Before any input, a coarse pointer means touch. */
export function lastPointer(): 'mouse' | 'touch' {
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('pointerdown', (e) => {
      pointer = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    }, { capture: true, passive: true });
  }
  if (pointer) return pointer;
  try {
    return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  } catch {
    return 'mouse';
  }
}

/** Seed from `crypto.getRandomValues` (sandbox "random" and new parks). */
export function randomSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] ?? 0) >>> 0;
  } catch {
    return (Date.now() & 0x7fffffff) >>> 0;
  }
}

/** Save a text file through a temporary link. */
export function downloadText(fileName: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
