import { describe, it, expect, vi } from 'vitest';
import { BANNER_MAX_TEXT_PX, drawEntranceBanners, drawBannerSign, fitBannerText } from '../../../src/render/rides/entranceBanner';
import { setStepPx } from '../../../src/render/heightStep';
import { setLabelAvoidBoxes } from '../../../src/render/screenAvoid';
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
    // A ride at (20, 20) has its entrance near the middle of the 800 × 600 canvas.
    offX: 400,
    offY: -400,
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

  const plainTool = (selected: number | null): ToolState =>
    ({ tool: 'inspect', selectedEntity: selected === null ? null : { kind: 'ride', id: selected }, hoverTile: null, drag: null, ghost: null }) as unknown as ToolState;

  it('fitBannerText keeps a short name and cuts a long one with an ellipsis to the width', () => {
    const measure = (t: string): number => t.length * 8;
    expect(fitBannerText(measure, 'Carousel', 120)).toBe('Carousel');
    const cut = fitBannerText(measure, 'The Very Long Name Of A Ride That Goes On', 120);
    expect(cut.endsWith('…')).toBe(true);
    expect(measure(cut)).toBeLessThanOrEqual(120);
  });

  it('a long name is drawn shortened; the text is measured once, not every frame', () => {
    const { ctx, mock } = createMockCtx();
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    ride.name = 'Grand Imperial Super Spinning Carousel of Wonders';
    drawEntranceBanners(ctx, w, plainTool(ride.id), frame);
    const drawn = mock.fillText.mock.calls[0]![0] as string;
    expect(drawn.endsWith('…')).toBe(true);
    expect(drawn.length * 8).toBeLessThanOrEqual(BANNER_MAX_TEXT_PX);
    const measured = mock.measureText.mock.calls.length;
    drawEntranceBanners(ctx, w, plainTool(ride.id), frame);
    expect(mock.measureText.mock.calls.length).toBe(measured);
  });

  it('no banner when the entrance is off screen; near the edge the banner stays wholly on screen', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    ride.name = 'Edge Of The World Carousel';
    const off = createMockCtx();
    drawEntranceBanners(off.ctx, w, plainTool(ride.id), { ...frame, offX: 2000 });
    expect(off.mock.fillText).not.toHaveBeenCalled();
    // Find the entrance's screen x with the frame above, then move the frame so it sits 3 px from the left edge.
    const probe = createMockCtx();
    drawEntranceBanners(probe.ctx, w, plainTool(ride.id), frame);
    const x0 = probe.mock.fillText.mock.calls[0]![1] as number;
    const edge = createMockCtx();
    drawEntranceBanners(edge.ctx, w, plainTool(ride.id), { ...frame, offX: frame.offX - x0 + 3 });
    const pill = edge.mock.roundRect.mock.calls[0] as number[];
    expect(pill[0]).toBeGreaterThanOrEqual(0);
    expect(pill[0]! + pill[2]!).toBeLessThanOrEqual(frame.width);
  });

  it('uses the look\'s height step (realistic 9.8 px), not a fixed 8', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    w.state.map.heights[ride.entrance!.gate] = 10;
    const at = (step: number): number => {
      setStepPx(step);
      const m = createMockCtx();
      drawEntranceBanners(m.ctx, w, plainTool(ride.id), { ...frame, offY: -200 });
      return m.mock.fillText.mock.calls[0]![2] as number;
    };
    try {
      // Ten steps of ground and 3.4 steps of lift: 13.4 × (9.8 − 8) px higher on screen.
      expect(Math.abs(at(8) - at(9.8) - 13.4 * 1.8)).toBeLessThanOrEqual(1);
    } finally {
      setStepPx(8);
    }
  });

  it('keeps out of the floating turn buttons: moves aside, or is not drawn when there is no room', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    const probe = createMockCtx();
    drawEntranceBanners(probe.ctx, w, plainTool(ride.id), frame);
    const pill = probe.mock.roundRect.mock.calls[0] as number[];
    const box = { x: pill[0]! + 4, y: pill[1]! - 4, w: 44, h: 44 };
    try {
      setLabelAvoidBoxes([box]);
      const moved = createMockCtx();
      drawEntranceBanners(moved.ctx, w, plainTool(ride.id), frame);
      const p = moved.mock.roundRect.mock.calls[0] as number[];
      const apart = p[0]! + p[2]! <= box.x || p[0]! >= box.x + box.w;
      expect(apart).toBe(true);
      // A box as wide as the canvas leaves no room: no banner.
      setLabelAvoidBoxes([{ x: 0, y: box.y, w: frame.width, h: 44 }]);
      const none = createMockCtx();
      drawEntranceBanners(none.ctx, w, plainTool(ride.id), frame);
      expect(none.mock.fillText).not.toHaveBeenCalled();
    } finally {
      setLabelAvoidBoxes([]);
    }
  });
});
