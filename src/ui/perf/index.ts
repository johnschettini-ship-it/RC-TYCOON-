/**
 * Performance overlay (Phase 6 §4.6, §7). Owner: W4-E. Neutral stub: nothing mounted.
 * Contract: a top-left text block, hidden by default, shown by `F3` or Settings → Performance overlay
 * (`game.settings.perfOverlay`): fps, frame time p50/p95, tick time p50/p95, draw calls per frame, sprite cache size
 * in MB, and entity counts (`perfProbe.snapshot()`).
 */
import type { UiExtension } from '../extensions';

export const perfUi: UiExtension = {};
