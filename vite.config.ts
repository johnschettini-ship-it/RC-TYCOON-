import { defineConfig } from 'vite';
import { swManifestPlugin } from './scripts/sw-manifest-plugin.ts';
import { dropWorker, sheetsPlugin } from './tools/sheets/plugin.ts';

// `base: './'` keeps every URL relative, so the build works at the GitHub Pages base path (`/RC-TYCOON-/`) and at
// the preview root. Offline play (Phase 6 §4.10): the plugin writes `sw-manifest.json` and stamps `sw.js`.
// Phase 8b stage 0b test (never merged): `--mode app` builds the app output (art sheets, no service worker); the
// website build keeps the worker and gets an empty `virtual:tc-art`.
// `__TC_APP__` (fix round 1, B8): true only in the app output, so the minifier drops every Pixel branch of the
// Classic files from the website build.
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __TC_APP__: JSON.stringify(mode === 'app') },
  build: { target: 'es2022', sourcemap: true },
  plugins: mode === 'app' ? [sheetsPlugin(), dropWorker()] : [swManifestPlugin(), sheetsPlugin()],
}));
