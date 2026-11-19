import { describe, it, expect, vi } from 'vitest';
import { drawEntranceBanners, drawBannerSign } from '../../../src/render/rides/entranceBanner';
import { Content } from '../../../src/sim/map';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import type { ToolState } from '../../../src/render/types';
import type { LayerFrame } from '../../../src/render/layers';

function createMockCtx() {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = {
    save: vi.fn(() => calls.push({ name: 'save', args: [] })),
    restore: vi.fn(() => calls.push({ name: 'restore', args: [] })),
    beginPath: vi.fn(() => calls.push({ name: 'beginPath', args: [] })),
    moveTo: vi.fn((...args: unknown[]) => calls.push({ name: 'moveTo', args })),
    lineTo: vi.fn((...args: unknown[]) => calls.push({ name: 'lineTo', args })),
    rect: vi.fn((...args: unknown[]) => calls.push({ name: 'rect', args })),
    roundRect: vi.fn((...args: unknown[]) => calls.push({ name: 'roundRect', args })),
    fill: vi.fn(() => calls.push({ name: 'fill', args: [] })),
    stroke: vi.fn(() => calls.push({ name: 'stroke', args: [] })),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    fillText: vi.fn((text: string, x: number, y: number) => calls.push({ name: 'fillText', args: [text, x, y] })),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: '',
    textBaseline: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, mock: ctx };
}

describe('entranceBanner', () => {
  const frame: LayerFrame = {
    scale: 1,
    rotation: 0,
    offX: 0,
    offY: 0,
    dpr: 1,
    bucket: 1,
    view: { x0: 0, y0: 0, x1: 800, y1: 600 },
    alpha: 0,
    width: 800,
    height: 600,
  };

  it('drawBannerSign renders ride name text and sign pill', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    const { ctx, mock } = createMockCtx();
    drawBannerSign(ctx, ride, 100, 100, 1.0, false);

    expect(mock.measureText).toHaveBeenCalledWith(ride.name);
    expect(mock.fillText).toHaveBeenCalledWith(ride.name, 100, 100);
    expect(mock.save).toHaveBeenCalled();
    expect(mock.restore).toHaveBeenCalled();
  });

  it('drawEntranceBanners skips drawing when queue path is NOT connected and ride is not selected', () => {
    const { ctx, mock } = createMockCtx();
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);

    const tool: ToolState = {
      tool: 'select',
      selectedEntity: null,
      selectedTile: null,
      hoverTile: null,
      drag: null,
      ghost: null,
      brush: null,
    } as unknown as ToolState;

    drawEntranceBanners(ctx, w, tool, frame);
    expect(mock.fillText).not.toHaveBeenCalled();
  });

  it('drawEntranceBanners draws banner when queue path is connected', () => {
    const { ctx, mock } = createMockCtx();
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    w.state.map.content[ride.entrance!.outside] = Content.Queue;

    const tool: ToolState = {
      tool: 'select',
      selectedEntity: null,
      selectedTile: null,
      hoverTile: null,
      drag: null,
      ghost: null,
      brush: null,
    } as unknown as ToolState;

    drawEntranceBanners(ctx, w, tool, frame);
    expect(mock.fillText).toHaveBeenCalledWith(ride.name, expect.any(Number), expect.any(Number));
  });

  it('drawEntranceBanners draws banner when ride is selected even before path is built', () => {
    const { ctx, mock } = createMockCtx();
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);

    const tool: ToolState = {
      tool: 'select',
      selectedEntity: { kind: 'ride', id: ride.id },
      selectedTile: null,
      hoverTile: null,
      drag: null,
      ghost: null,
      brush: null,
    } as unknown as ToolState;

    drawEntranceBanners(ctx, w, tool, frame);
    expect(mock.fillText).toHaveBeenCalledWith(ride.name, expect.any(Number), expect.any(Number));
  });
});
