/**
 * The park and the realistic title screen (VITE_ART=real build only; spec `2026-11-16-realistic-title-and-cards-design.md`,
 * builder-check answers 2 and 4). Two hooks between the realistic boot and the title, so neither imports the other:
 * - `releasePark`: the boot's release of the park's decoded art (`./boot.ts`: the set manager's sets and the ground's
 *   chunks), which the title calls before it decodes its own pictures.
 * - `titleHolds`: true while the title covers the window; the renderer then draws no park (it would ask for the sets
 *   just released, and its pictures would sit in memory under the title).
 * Every caller checks `import.meta.env.VITE_ART === 'real'` first, so the website build folds this module away.
 */

let release: (() => void) | null = null;
let hold: (() => boolean) | null = null;

/** Sets (or clears) the park's release. */
export function setParkRelease(fn: (() => void) | null): void {
  release = fn;
}

/** Releases the park's decoded art (nothing when no realistic boot set a release). Never throws. */
export function releasePark(): void {
  try {
    release?.();
  } catch (err) {
    console.warn('[art=real] park release', err);
  }
}

/** Sets (or clears) the title's test: true while it covers the window. */
export function setTitleHold(fn: (() => boolean) | null): void {
  hold = fn;
}

/** True while the title covers the window: the renderer draws no park. */
export function titleHolds(): boolean {
  return hold !== null && hold();
}
