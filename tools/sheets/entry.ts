/** Phase 8b stage 0b test (never merged): the module the sheet plugin loads through `runnerImport` (hook on, all catalogues). */
import { installSurfaceArt } from '../../src/render/pixel/surfaceArt';
import { buildSheets, type SheetBuild } from './build';
import { elevatedSpecs } from './catalogue/elevated';
import { groundSpecs } from './catalogue/ground';
import { objectSpecs } from './catalogue/objects';
import { peopleSpecs } from './catalogue/people';
import { trackSpecs } from './catalogue/track';
import type { PictureSpec } from './catalogue/types';

installSurfaceArt();

/** Every picture of the app art: objects, ghosts, shadows, people, track, elevated paths, ground. */
export function allSpecs(): PictureSpec[] {
  return [...objectSpecs(), ...peopleSpecs(), ...trackSpecs(), ...elevatedSpecs(), ...groundSpecs()];
}

/** Paints and packs everything (inside the runner, so the hook and the catalogues share one module graph). */
export function build(opts: { coarseOnly?: boolean } = {}): SheetBuild {
  installSurfaceArt();
  return buildSheets(allSpecs(), opts);
}
