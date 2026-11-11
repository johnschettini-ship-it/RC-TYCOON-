// tests/unit/ui/drag.test.ts
import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { tileAtClient } from '../../../src/input';
import { centerOnMap } from '../../../src/input/camera';
import { InputController } from '../../../src/input/controller';
import { dragStarts } from '../../../src/ui/decks/drag';
import { makeTestWorld } from '../../helpers/world';

describe('card drag start (Phase 7 §4.6)', () => {
  it.each([
    [7, 0, 'mouse', 'flat', false],
    [8, 0, 'mouse', 'flat', true],
    [6, 6, 'pen', 'stall', true],
    [20, 0, 'touch', 'flat', false],
    [20, 0, 'mouse', 'track', false],
  ] as const)('dx %i dy %i %s %s gives %s', (dx, dy, pointer, kind, want) => expect(dragStarts(dx, dy, pointer, kind)).toBe(want));
});

describe('tileAtClient (the tile under a card drag)', () => {
  it('picks the tile that the input controller picks for the same point of the canvas, in every view rotation', () => {
    const game = new Game(makeTestWorld());
    centerOnMap(game.camera, game.world.state.map);
    // The canvas does not start at the corner of the page.
    const rect = { left: 40, top: 25, width: 800, height: 600 };
    const canvas = { getBoundingClientRect: () => rect } as unknown as HTMLCanvasElement;
    const ctl = new InputController(game, { viewport: () => ({ width: rect.width, height: rect.height }) });
    const seen = new Set<number>();
    for (const rotation of [0, 1, 2, 3] as const) {
      game.camera.rotation = rotation;
      for (const [x, y] of [[400, 300], [123, 456], [700, 80]] as const) {
        ctl.pointer({ type: 'move', id: 1, x, y, t: 0, pointerType: 'mouse', button: 0 });
        const tile = tileAtClient(game, canvas, x + rect.left, y + rect.top);
        expect(tile).not.toBeNull();
        expect(tile).toBe(game.tool.hoverTile);
        seen.add(tile as number);
      }
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('gives null for a point off the map', () => {
    const game = new Game(makeTestWorld());
    centerOnMap(game.camera, game.world.state.map);
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as unknown as HTMLCanvasElement;
    expect(tileAtClient(game, canvas, -50_000, 300)).toBeNull();
  });
});
