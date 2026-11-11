/**
 * Procedural stall sprites (Phase 1 §7). Owner: W1-A.
 * Anchor: the stall tile's top corner at its base height. The service side faces `rotation`
 * (0 = N, 1 = E, 2 = S, 3 = W); only S and E faces are visible from the camera.
 */
import { getStallDef } from '../../data/catalog/stalls';
import type { StallKind } from '../../data/catalog/types';
import type { Dir } from '../../sim/map';
import { shade } from '../palette';
import type { ArtBounds } from './rides';
import { box, line3, poly3, pyramid, sx, sy, type Ctx } from './shapes';
import { CONTENT_STALL_ART } from './content';
import { isPixelSurface } from '../pixel/surface';

interface Scheme {
  roof: string;
  stripe: string;
  wall: string;
  accent: string;
}

const SCHEMES: Readonly<Record<StallKind | 'unknown', Scheme>> = {
  food: { roof: '#e8503a', stripe: '#fff1d6', wall: '#f6efe0', accent: '#f5d03b' },
  drink: { roof: '#3fa7d6', stripe: '#e8f7ff', wall: '#eef6fa', accent: '#2fb39a' },
  toilet: { roof: '#4f63d9', stripe: '#dfe5ff', wall: '#e3ecf5', accent: '#9bd8f0' },
  souvenir: { roof: '#d457a8', stripe: '#ffe3f3', wall: '#f8eef4', accent: '#f5d03b' },
  info: { roof: '#f5d03b', stripe: '#fff8dc', wall: '#f7f3e6', accent: '#3d9be0' },
  facility: { roof: '#7cc04b', stripe: '#eefbe4', wall: '#f1f6ee', accent: '#e8503a' },
  unknown: { roof: '#8a96a3', stripe: '#e9eef5', wall: '#eef0f3', accent: '#f39a2b' },
};

export function stallArtBounds(): ArtBounds {
  return { left: -34, right: 34, top: 16 - 66, bottom: 38 };
}

const TAU = Math.PI * 2;

/** Striped awning that sticks out of the service face. */
function awning(ctx: Ctx, dir: Dir, s: Scheme): void {
  const stripes = 4;
  for (let k = 0; k < stripes; k++) {
    const a = 0.2 + (0.6 * k) / stripes;
    const b = 0.2 + (0.6 * (k + 1)) / stripes;
    const col = k % 2 ? s.stripe : s.roof;
    let pts: number[];
    switch (dir) {
      case 2:
        pts = [a, 0.82, 23, b, 0.82, 23, b, 1.02, 15, a, 1.02, 15];
        break;
      case 1:
        pts = [0.82, a, 23, 0.82, b, 23, 1.02, b, 15, 1.02, a, 15];
        break;
      case 0:
        pts = [a, 0.18, 23, b, 0.18, 23, b, -0.02, 15, a, -0.02, 15];
        break;
      default:
        pts = [0.18, a, 23, 0.18, b, 23, -0.02, b, 15, -0.02, a, 15];
    }
    poly3(ctx, pts, col);
  }
}

function serviceFront(ctx: Ctx, dir: Dir, s: Scheme): void {
  if (dir === 2) {
    poly3(ctx, [0.3, 0.82, 8, 0.7, 0.82, 8, 0.7, 0.82, 18, 0.3, 0.82, 18], '#3a2f2a');
    box(ctx, 0.26, 0.82, 0.74, 0.92, 0, 8, shade(s.accent, 1.15), s.accent, shade(s.accent, 0.75));
  } else if (dir === 1) {
    poly3(ctx, [0.82, 0.3, 8, 0.82, 0.7, 8, 0.82, 0.7, 18, 0.82, 0.3, 18], '#2c2420');
    box(ctx, 0.82, 0.26, 0.92, 0.74, 0, 8, shade(s.accent, 1.15), s.accent, shade(s.accent, 0.75));
  }
}

function icon(ctx: Ctx, defId: string, kind: StallKind | 'unknown', x: number, y: number): void {
  ctx.save();
  // Sign board.
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = '#5b4636';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  if (defId === 'snack_shack' || kind === 'food') {
    ctx.fillStyle = '#d98a3a';
    ctx.beginPath();
    ctx.arc(x, y + 0.5, 5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#5fbf4a';
    ctx.fillRect(x - 5.5, y + 0.5, 11, 1.6);
    ctx.fillStyle = '#7a3e1d';
    ctx.fillRect(x - 5, y + 2.1, 10, 1.6);
    ctx.fillStyle = '#d98a3a';
    ctx.fillRect(x - 5, y + 3.7, 10, 1.5);
  } else if (defId === 'fizz_stand' || kind === 'drink') {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3fa7d6';
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y - 4);
    ctx.lineTo(x + 3, y + 5);
    ctx.lineTo(x - 3, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3fa7d6';
    ctx.fillRect(x - 3.6, y - 0.5, 7.2, 2.2);
    ctx.strokeStyle = '#e8503a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 4);
    ctx.lineTo(x + 3, y - 8);
    ctx.stroke();
  } else if (defId === 'restrooms' || kind === 'toilet') {
    ctx.fillStyle = '#4f63d9';
    for (const dx of [-3, 3]) {
      ctx.beginPath();
      ctx.arc(x + dx, y - 3.5, 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.fillRect(x - 4.5, y - 1.5, 3, 6);
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 1.5);
    ctx.lineTo(x + 5.2, y + 4.5);
    ctx.lineTo(x + 0.8, y + 4.5);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'souvenir') {
    ctx.fillStyle = '#e8503a';
    ctx.beginPath();
    ctx.ellipse(x, y - 1.5, 3.5, 4.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5b4636';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 2.7);
    ctx.lineTo(x + 1, y + 6);
    ctx.stroke();
  } else if (kind === 'info') {
    ctx.fillStyle = '#3d9be0';
    ctx.beginPath();
    ctx.arc(x, y - 4, 1.5, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - 1.2, y - 1.5, 2.4, 6.5);
  } else {
    ctx.fillStyle = kind === 'facility' ? '#e8503a' : '#f39a2b';
    ctx.fillRect(x - 1.5, y - 5, 3, 10);
    ctx.fillRect(x - 5, y - 1.5, 10, 3);
  }
  ctx.restore();
}

/** Draw a stall sprite with its anchor at (0, 0). Unknown ids get the generic scheme and icon. */
export function drawStallArt(ctx: Ctx, defId: string, rotation: Dir): void {
  // Phase 3 stalls and facilities have their own art (W2-C, ./content).
  const art = CONTENT_STALL_ART[defId];
  if (art) {
    art.draw(ctx, rotation);
    return;
  }
  const def = getStallDef(defId);
  const kind: StallKind | 'unknown' = def?.kind ?? 'unknown';
  const s = SCHEMES[kind];
  // Shadow (Phase 8 stage 0 prototype, §8.4 item 6: on a surface the shadow layer draws it).
  if (!isPixelSurface(ctx)) poly3(ctx, [0.12, 0.12, 0, 0.92, 0.12, 0, 0.92, 0.92, 0, 0.12, 0.92, 0], 'rgba(20,30,20,0.18)');
  const backService = rotation === 0 || rotation === 3;
  if (backService) awning(ctx, rotation, s);
  box(ctx, 0.18, 0.18, 0.82, 0.82, 0, 23, s.wall, shade(s.wall, 0.88), shade(s.wall, 0.74));
  // Coloured base band.
  box(ctx, 0.18, 0.18, 0.82, 0.82, 0, 4, s.roof, shade(s.roof, 0.85), shade(s.roof, 0.7));
  if (kind === 'toilet') {
    // Doors on both visible faces.
    poly3(ctx, [0.42, 0.82, 0, 0.6, 0.82, 0, 0.6, 0.82, 16, 0.42, 0.82, 16], shade(s.roof, 0.9));
    poly3(ctx, [0.82, 0.42, 0, 0.82, 0.6, 0, 0.82, 0.6, 16, 0.82, 0.42, 16], shade(s.roof, 0.75));
  } else {
    serviceFront(ctx, rotation, s);
  }
  if (!backService && kind !== 'toilet') awning(ctx, rotation, s);
  pyramid(ctx, 0.1, 0.1, 0.9, 0.9, 23, 38, shade(s.roof, 1.1), s.roof, shade(s.roof, 0.78));
  // Stripe the two front roof faces.
  poly3(ctx, [0.3, 0.9, 23, 0.5, 0.9, 23, 0.5, 0.5, 38], s.stripe);
  poly3(ctx, [0.9, 0.3, 23, 0.9, 0.5, 23, 0.5, 0.5, 38], shade(s.stripe, 0.85));
  line3(ctx, 0.5, 0.5, 38, 0.5, 0.5, 44, '#5b4636', 1.6);
  icon(ctx, defId, kind, sx(0.5, 0.5), sy(0.5, 0.5, 52));
}
