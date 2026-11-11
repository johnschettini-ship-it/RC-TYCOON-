/**
 * The renderer's world layers, in call order at each frame stage (`./layers.ts`). Owner: integrator.
 * Build 2 (Wave 3.0): fields overlay, lighting, elevated paths, scenery, terrain tools.
 * Build 3 (Wave 4.0): shows (W4-C; after lighting, so beams and fireworks glow over the dark), map cursor (W4-F, last
 * overlay).
 */
import type { WorldLayer } from './layers';
import { createFieldOverlayLayer } from './fields/overlay';
import { createLightingLayer } from './lighting/layer';
import { createElevatedPathLayer } from './elevated/layer';
import { createSceneryLayer } from './scenery/layer';
import { createTerrainToolLayer } from './terrainTools/layer';
import { createShowLayer } from './shows/layer';
import { createA11yLayer } from './a11y/layer';
import { createPixelShadowLayer } from './pixel/shadows';

export function createWorldLayers(): WorldLayer[] {
  return [
    // Phase 8 stage 0 prototype (§8.4 item 4): ground shadows first; it draws nothing in Classic.
    createPixelShadowLayer(),
    createFieldOverlayLayer(),
    createLightingLayer(),
    createElevatedPathLayer(),
    createSceneryLayer(),
    createTerrainToolLayer(),
    createShowLayer(),
    createA11yLayer(),
  ];
}
