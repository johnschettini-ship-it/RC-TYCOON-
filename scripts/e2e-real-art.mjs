// Puts the baked realistic art next to a VITE_ART=real build for the realistic e2e suite (tests/e2e/README.md):
// copies <art> (default dist-art/real, what `node tools/art3d/bake.mjs --out dist-art/real` writes; override with
// REAL_ART_DIR) to <dist>/art/real, as the deploy does for /real-game/. Fails with the bake command when there is no
// baked index, so a realistic run never silently tests today's look.
//
//   node scripts/e2e-real-art.mjs [dist]
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const art = resolve(process.env.REAL_ART_DIR ?? 'dist-art/real');
const missing = ['index.json', 'title/index.json'].filter((f) => !existsSync(join(art, f)));
if (missing.length > 0) {
  console.error(`e2e-real-art: no baked art in ${art} (missing ${missing.join(', ')}).`);
  console.error('Bake it first:  node tools/art3d/bake.mjs --out dist-art/real   (or set REAL_ART_DIR to a baked folder)');
  process.exit(1);
}
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`e2e-real-art: no build in ${dist} (VITE_ART=real npm run build first).`);
  process.exit(1);
}
rmSync(join(dist, 'art/real'), { recursive: true, force: true });
cpSync(art, join(dist, 'art/real'), { recursive: true });
console.log(`e2e-real-art: ${art} -> ${join(dist, 'art/real')}`);
