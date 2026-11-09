import { defineConfig } from 'vite';
import { swManifestPlugin } from './scripts/sw-manifest-plugin.ts';

// `base: './'` keeps every URL relative, so the build works at the GitHub Pages base path (`/RC-TYCOON-/`) and at
// the preview root. Offline play (Phase 6 §4.10): the plugin writes `sw-manifest.json` and stamps `sw.js`.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  plugins: [swManifestPlugin()],
});
