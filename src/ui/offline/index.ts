/**
 * Offline update toast (Phase 6 §4.10, §7). Owner: W4-G. Neutral stub: nothing mounted.
 * Contract: "Update ready" with **Reload** and **Later**; it stays until the player picks; Reload autosaves first.
 * The service worker side is `src/offline/` and `public/sw.js`.
 */
import type { UiExtension } from '../extensions';

export const offlineUi: UiExtension = {};
