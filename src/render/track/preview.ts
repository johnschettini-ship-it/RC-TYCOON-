/**
 * Picker preview of a track ride type: a station, a small hill with supports, and a two-car train in the
 * type's default colours (phase-2 §7.1 step 1). Water types show a lift, a slope down, and their splash feature
 * (Phase 4 §4.4). Phase 6 (W4-D): the Inverted Coaster shows a corkscrew, the Bobsled Run a banked turn.
 * Owner: W2-A; water W3-C; Phase 6 W4-D.
 */
import { getTrackPieceDef, getTrackTypeDef } from '../../data/track';
import { pieceWorldSamples } from '../../sim/rides/track/api';
import type { TrackPieceInstance } from '../../sim/rides/track/types';
import type { Ctx } from '../sprites/shapes';
import { paletteColour } from './colours';
import { lookFor, paintCar, paintRun, paintSupport, Projector, type TrackColours } from './paint';
import { trackFrame, viewFrame } from './project';

function piece(defId: string, x: number, y: number, z: number, dir: 0 | 1 | 2 | 3): TrackPieceInstance {
  return { defId, x, y, z, dir, chain: false, brakeSpeed: null, cost: 0 };
}

/** Pieces of the preview scene for a type (every rail type has stations, slopes, and small turns). */
export function previewPieces(typeId: string): TrackPieceInstance[] {
  const type = getTrackTypeDef(typeId);
  if (type && type.pieceSet !== 'rail') {
    const p = (id: string): string => `${type.pieceSet}_${id}`;
    return [
      piece(p('station'), 0, 0, 0, 0),
      piece(p('station'), 1, 0, 0, 0),
      piece(p('turn_small_r'), 2, 0, 0, 0),
      piece(p('lift'), 2, 1, 0, 1),
      piece(p('slope_down'), 2, 2, 2, 1),
      piece(type.pieceSet === 'flume' ? 'flume_splashdown' : 'rapids_whirlpool', 2, 3, 0, 1),
    ];
  }
  if (typeId === 'inverted_coaster') {
    return [piece('station', 0, 0, 0, 0), piece('station', 1, 0, 0, 0), piece('corkscrew_right', 2, 0, 0, 0)];
  }
  if (typeId === 'bobsled_run') {
    // No unbanked turns on a bobsled: bank in, then a banked medium turn.
    return [piece('station', 0, 0, 0, 0), piece('station', 1, 0, 0, 0), piece('bank_right_in', 2, 0, 0, 0), piece('banked_turn_medium_right', 3, 0, 0, 0)];
  }
  const special = type?.groups.includes('Sp') ? 'spooky_tunnel' : 'straight';
  // An L shape keeps the picture compact: station along +x, a small turn, then a small hill along +y.
  return [
    piece('station', 0, 0, 0, 0),
    piece('station', 1, 0, 0, 0),
    piece('turn_small_right', 2, 0, 0, 0),
    piece('flat_to_gentle_up', 2, 1, 0, 1),
    piece('gentle_up_to_flat', 2, 2, 1, 1),
    piece(special, 2, 3, 2, 1),
  ];
}

export function drawTrackPreview(ctx: CanvasRenderingContext2D, typeId: string, w: number, h: number): void {
  const type = getTrackTypeDef(typeId);
  ctx.clearRect(0, 0, w, h);
  if (!type) return;
  const f = viewFrame(0, 64, 64);
  const P = new Projector(f, 0, 0);
  const look = lookFor(type);
  const col: TrackColours = {
    track: paletteColour(type.render.colours.track),
    supports: paletteColour(type.render.colours.supports),
    cars: paletteColour(type.render.colours.cars),
  };
  const pieces = previewPieces(typeId);
  const samples = pieces.map((p) => pieceWorldSamples(p));
  let l = Infinity;
  let r = -Infinity;
  let t = Infinity;
  let b = -Infinity;
  for (const s of samples) {
    for (let k = 0; k < s.n; k++) {
      for (const d of [-2, 2]) {
        const x = P.x((s.x[k] as number) + d, (s.y[k] as number) - d);
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, P.y(s.x[k] as number, s.y[k] as number, (s.z[k] as number) + 2.5 + (look.lift ?? 0)));
        b = Math.max(b, P.y((s.x[k] as number) + d, (s.y[k] as number) + d, 0));
      }
    }
  }
  const pad = Math.min(w, h) * 0.06;
  const k = Math.max(0.01, Math.min((w - 2 * pad) / (r - l), (h - 2 * pad) / (b - t)));
  ctx.save();
  ctx.translate((w - (r - l) * k) / 2 - l * k, (h - (b - t) * k) / 2 - t * k);
  ctx.scale(k, k);
  const c = ctx as Ctx;
  // Grass under the track tiles.
  for (const p of pieces) {
    const x0 = p.x * 4;
    const y0 = p.y * 4;
    ctx.fillStyle = (p.x + p.y) % 2 === 0 ? '#64b049' : '#6dbb4f';
    ctx.beginPath();
    ctx.moveTo(P.x(x0, y0), P.y(x0, y0, 0));
    ctx.lineTo(P.x(x0 + 4, y0), P.y(x0 + 4, y0, 0));
    ctx.lineTo(P.x(x0 + 4, y0 + 4), P.y(x0 + 4, y0 + 4, 0));
    ctx.lineTo(P.x(x0, y0 + 4), P.y(x0, y0 + 4, 0));
    ctx.closePath();
    ctx.fill();
  }
  samples.forEach((s, i) => {
    const p = pieces[i] as TrackPieceInstance;
    const mid = Math.floor(s.n / 2);
    if ((s.z[mid] as number) > 0.5) paintSupport(c, P, type.render.supports, col.supports, s.x[mid] as number, s.y[mid] as number, s.yaw[mid] as number, 0, (s.z[mid] as number) - look.drop);
    const def = getTrackPieceDef(p.defId);
    paintRun(c, P, look, col, s, 0, s.n - 1, { special: def?.special ?? null, chain: false, conveyor: def?.water?.drive === 'conveyor' && def.special !== 'station' });
  });
  // Two cars in the station (one boat on a water ride).
  const st = samples[1];
  if (st) {
    const fr = new Float64Array(9);
    const cars = type.medium === 'water' ? ([[Math.floor(st.n * 0.5), true]] as const) : ([[Math.floor(st.n * 0.75), true], [Math.floor(st.n * 0.1), false]] as const);
    for (const [kk, front] of cars) {
      trackFrame(0, 0, 0, 1, fr);
      ctx.save();
      ctx.translate(P.x(st.x[kk] as number, st.y[kk] as number), P.y(st.x[kk] as number, st.y[kk] as number, st.z[kk] as number));
      paintCar(c, type.render.car, 0, 0, col.cars, front);
      ctx.restore();
    }
  }
  ctx.restore();
}
