/**
 * Procedural flat-ride sprites (Phase 1 §7, master §2.5). Owner: W1-A.
 * Original shapes in flat colours. Warm = thrill, cool = chill, green = family.
 * Anchor: the top corner of the footprint origin tile at the ride's base height.
 */
import { gateIndex, getFlatRideDef } from '../../data/catalog/flatRides';
import { getTrackRideDef } from '../../data/catalog/trackRides';
import type { RideTag } from '../../data/catalog/types';
import { extent, footprintTile, frontDir } from '../../sim/footprint';
import type { Dir } from '../../sim/map';
import { surfaceArt } from '../artHook';
import { TAG_COLOURS, mix32, shade } from '../palette';
import { box, circlePt, cone, cylinder, disc, head, line3, nearness, poly3, rrect, sx, sy, HAIR_COLOURS, SKIN_TONES, type Ctx } from './shapes';
import { CONTENT_RIDE_ART } from './content';

export interface ArtBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RideArtState {
  rotation: Dir;
  /** 0–1: share of one revolution. */
  angle: number;
  /** 0–1: how far swings are thrown out. */
  swing: number;
  /** 0 empty … 4 full. */
  occupancy: number;
}

const HEIGHTS: Readonly<Record<string, number>> = {
  carousel: 100,
  big_wheel: 118,
  swing_tower: 146,
  teacup_twirl: 50,
};

function tagOf(defId: string): RideTag {
  return getFlatRideDef(defId)?.tag ?? getTrackRideDef(defId)?.tag ?? 'family';
}

function genericHeight(defId: string): number {
  const def = getFlatRideDef(defId);
  const r = Math.min(def?.w ?? 2, def?.d ?? 2) / 2 - 0.3;
  return (def?.flags.tall ? 46 : 24) + 26 + r * 10 + 12 + 10;
}

/** Map extent and art bounds (world px from the anchor) for a w × d ride at `rotation`. */
export function rideArtBounds(defId: string, w: number, d: number, rotation: Dir): ArtBounds {
  const { ex, ey } = extent(w, d, rotation);
  const height = HEIGHTS[defId] ?? CONTENT_RIDE_ART[defId]?.height ?? genericHeight(defId);
  return { left: -ey * 32, right: ex * 32, top: (ex + ey) * 8 - height - 6, bottom: (ex + ey) * 16 + 4 };
}

function seatsFilled(seats: number, occupancy: number): number {
  if (occupancy <= 0) return 0;
  return Math.max(1, Math.round((seats * occupancy) / 4));
}

function rider(ctx: Ctx, x: number, y: number, k: number): void {
  const m = mix32(k * 7919 + 13);
  head(ctx, x, y, 2.3, SKIN_TONES[m % SKIN_TONES.length] as string, HAIR_COLOURS[(m >>> 4) % HAIR_COLOURS.length] as string);
}

/** Low platform over the footprint. */
function platform(ctx: Ctx, ex: number, ey: number, top: string, side: string): void {
  box(ctx, 0.05, 0.05, ex - 0.05, ey - 0.05, 0, 3, top, side, shade(side, 0.8));
}

interface GateMark {
  u: number;
  v: number;
  /** Unit vector along the edge. */
  au: number;
  av: number;
  colour: string;
}

function gateMarks(w: number, d: number, rotation: Dir, entranceColour: string): GateMark[] {
  const g = gateIndex(w);
  const ent = footprintTile(0, 0, w, d, rotation, g, 0);
  const ext = footprintTile(0, 0, w, d, rotation, g, d - 1);
  const fd = frontDir(rotation);
  const bd = ((fd + 2) % 4) as Dir;
  const edge = (t: { x: number; y: number }, dir: Dir, colour: string): GateMark => {
    switch (dir) {
      case 0:
        return { u: t.x + 0.5, v: t.y + 0.04, au: 1, av: 0, colour };
      case 1:
        return { u: t.x + 0.96, v: t.y + 0.5, au: 0, av: 1, colour };
      case 2:
        return { u: t.x + 0.5, v: t.y + 0.96, au: 1, av: 0, colour };
      default:
        return { u: t.x + 0.04, v: t.y + 0.5, au: 0, av: 1, colour };
    }
  };
  return [edge(ent, fd, entranceColour), edge(ext, bd, '#8a96a3')];
}

function drawGate(ctx: Ctx, m: GateMark): void {
  const p0u = m.u - m.au * 0.3;
  const p0v = m.v - m.av * 0.3;
  const p1u = m.u + m.au * 0.3;
  const p1v = m.v + m.av * 0.3;
  line3(ctx, p0u, p0v, 0, p0u, p0v, 22, shade(m.colour, 0.7), 3);
  line3(ctx, p1u, p1v, 0, p1u, p1v, 22, shade(m.colour, 0.7), 3);
  line3(ctx, p0u, p0v, 22, p1u, p1v, 22, m.colour, 5);
}

function withGates(ctx: Ctx, w: number, d: number, st: RideArtState, ex: number, ey: number, tag: RideTag, body: () => void): void {
  const marks = gateMarks(w, d, st.rotation, TAG_COLOURS[tag].main);
  const centre = nearness(ex / 2, ey / 2);
  for (const m of marks) if (nearness(m.u, m.v) < centre) drawGate(ctx, m);
  body();
  for (const m of marks) if (nearness(m.u, m.v) >= centre) drawGate(ctx, m);
}

const TAU = Math.PI * 2;

function drawCarousel(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#e9dcc0', '#b49a6a');
  cylinder(ctx, cu, cv, 1.25, 3, 9, '#c79a4e', '#f3e6c4');
  disc(ctx, cu, cv, 0.95, 9, '', '#d8c49a', 2);
  const horses = 8;
  const colours = ['#e8503a', '#3d9be0', '#f5d03b', '#8d5ad8', '#f2f2f2', '#f39a2b', '#2fb39a', '#d457a8'];
  const filled = seatsFilled(horses, st.occupancy);
  const items: Array<{ n: number; draw: () => void }> = [];
  for (let i = 0; i < horses; i++) {
    const th = TAU * (i / horses + st.angle);
    const p = circlePt(cu, cv, 0.9, th);
    const bob = 18 + 5 * Math.sin(TAU * (st.angle * 4 + i / 2));
    items.push({
      n: nearness(p.u, p.v),
      draw: () => {
        line3(ctx, p.u, p.v, 9, p.u, p.v, 58, '#e8c547', 1.5);
        const x = sx(p.u, p.v);
        const y = sy(p.u, p.v, bob);
        const dir = -Math.sin(th) + Math.cos(th) >= 0 ? 1 : -1;
        ctx.fillStyle = colours[i % colours.length] as string;
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 3.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillRect(x + dir * 4, y - 6, dir * 3, 5);
        ctx.strokeStyle = shade(colours[i % colours.length] as string, 0.6);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - 3, y + 2);
        ctx.lineTo(x - 4, y + 6);
        ctx.moveTo(x + 3, y + 2);
        ctx.lineTo(x + 4, y + 6);
        ctx.stroke();
        if (i < filled) rider(ctx, x, y - 6, i);
      },
    });
  }
  items.push({ n: nearness(cu, cv), draw: () => cylinder(ctx, cu, cv, 0.24, 9, 62, '#d9b64a', '#f0d66e') });
  items.sort((a, b) => a.n - b.n);
  for (const it of items) it.draw();
  cone(ctx, cu, cv, 1.4, 56, 86, ['#4fbf63', '#fff3d6', '#3aa552', '#fff3d6'], 16);
  // Scalloped valance on the visible rim.
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    if (Math.cos(a) + Math.sin(a) < -0.2) continue;
    const p = circlePt(cu, cv, 1.4, a);
    ctx.beginPath();
    ctx.arc(sx(p.u, p.v), sy(p.u, p.v, 56) + 1, 3.2, 0, Math.PI);
    ctx.fillStyle = k % 2 ? '#e8503a' : '#f5d03b';
    ctx.fill();
  }
  const ax = sx(cu, cv);
  const ay = sy(cu, cv, 86);
  ctx.fillStyle = '#f5d03b';
  ctx.beginPath();
  ctx.arc(ax, ay, 3, 0, TAU);
  ctx.fill();
  line3(ctx, cu, cv, 86, cu, cv, 98, '#7a5a3a', 1.5);
  ctx.fillStyle = '#e8503a';
  ctx.beginPath();
  ctx.moveTo(ax, ay - 12);
  ctx.lineTo(ax + 9, ay - 9);
  ctx.lineTo(ax, ay - 6);
  ctx.closePath();
  ctx.fill();
}

function drawBigWheel(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  const alongX = st.rotation % 2 === 0;
  const au = alongX ? 1 : 0;
  const av = alongX ? 0 : 1;
  const pu = av;
  const pv = au;
  const H = 62;
  const R = 1.2;
  const Rz = R * 32;
  platform(ctx, ex, ey, '#dfe8f0', '#7d8ea3');
  // Loading deck under the wheel.
  box(ctx, cu - 0.45 * au - 0.35 * pu, cv - 0.45 * av - 0.35 * pv, cu + 0.45 * au + 0.35 * pu, cv + 0.45 * av + 0.35 * pv, 3, 8, '#b9c7d6', '#8394a8', '#6c7d92');
  const leg = (side: number, colour: string): void => {
    const ou = pu * 0.34 * side;
    const ov = pv * 0.34 * side;
    const hu = pu * 0.12 * side;
    const hv = pv * 0.12 * side;
    line3(ctx, cu - au * 0.95 + ou, cv - av * 0.95 + ov, 3, cu + hu, cv + hv, H, colour, 4);
    line3(ctx, cu + au * 0.95 + ou, cv + av * 0.95 + ov, 3, cu + hu, cv + hv, H, colour, 4);
  };
  leg(-1, '#55657a');
  const rimPt = (phi: number): { x: number; y: number } => {
    const c = Math.cos(phi);
    const u = cu + au * R * c;
    const v = cv + av * R * c;
    return { x: sx(u, v), y: sy(u, v, H + Rz * Math.sin(phi)) };
  };
  const hubX = sx(cu, cv);
  const hubY = sy(cu, cv, H);
  // Spokes and rim.
  ctx.strokeStyle = '#cfe3f2';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 16; k++) {
    const p = rimPt(TAU * (k / 16 + st.angle));
    ctx.beginPath();
    ctx.moveTo(hubX, hubY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let k = 0; k <= 48; k++) {
    const p = rimPt((k / 48) * TAU);
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = '#3fa7d6';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k <= 48; k++) {
    const phi = (k / 48) * TAU;
    const c = Math.cos(phi);
    const u = cu + au * R * 0.8 * c;
    const v = cv + av * R * 0.8 * c;
    const x = sx(u, v);
    const y = sy(u, v, H + Rz * 0.8 * Math.sin(phi));
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#9bd8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Gondolas hang below the rim and stay upright.
  const gondolas = 8;
  const colours = ['#3fa7d6', '#2fb39a', '#8d5ad8', '#4f63d9', '#9bd8f0', '#2fb39a', '#4f63d9', '#8d5ad8'];
  const filled = seatsFilled(gondolas, st.occupancy);
  for (let i = 0; i < gondolas; i++) {
    const p = rimPt(TAU * (i / gondolas + st.angle));
    const c = colours[i] as string;
    ctx.fillStyle = shade(c, 0.7);
    ctx.fillRect(p.x - 0.75, p.y, 1.5, 3);
    ctx.fillStyle = c;
    ctx.beginPath();
    rrect(ctx, p.x - 5, p.y + 3, 10, 8, 2.5);
    ctx.fill();
    ctx.fillStyle = shade(c, 0.65);
    ctx.fillRect(p.x - 5, p.y + 3, 10, 2);
    if (i < filled) rider(ctx, p.x, p.y + 7, i);
  }
  ctx.fillStyle = '#e9eef5';
  ctx.beginPath();
  ctx.arc(hubX, hubY, 4.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3fa7d6';
  ctx.beginPath();
  ctx.arc(hubX, hubY, 2, 0, TAU);
  ctx.fill();
  leg(1, '#6f8197');
}

function drawSwingTower(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#f6dcc4', '#b7754a');
  cylinder(ctx, cu, cv, 0.55, 3, 8, '#c4552c', '#f0a46a');
  const Hc = 104 + 8 * st.swing;
  const seats = 10;
  const colours = ['#f5d03b', '#e8503a', '#f39a2b', '#ff7aa2', '#ffd166'];
  const filled = seatsFilled(seats, st.occupancy);
  const rs = 0.5 + 0.75 * st.swing;
  const hs = Hc - 46 + 18 * st.swing;
  const items: Array<{ n: number; draw: () => void }> = [];
  for (let i = 0; i < seats; i++) {
    const th = TAU * (i / seats + st.angle);
    const top = circlePt(cu, cv, 0.48, th);
    const seat = circlePt(cu, cv, rs, th);
    items.push({
      n: nearness(seat.u, seat.v),
      draw: () => {
        line3(ctx, top.u, top.v, Hc, seat.u, seat.v, hs + 4, '#5b4636', 1);
        const x = sx(seat.u, seat.v);
        const y = sy(seat.u, seat.v, hs);
        const c = colours[i % colours.length] as string;
        ctx.fillStyle = c;
        ctx.beginPath();
        rrect(ctx, x - 3.5, y - 1, 7, 5, 1.5);
        ctx.fill();
        ctx.fillStyle = shade(c, 0.65);
        ctx.fillRect(x - 3.5, y + 3, 7, 1.5);
        if (i < filled) rider(ctx, x, y - 3, i);
      },
    });
  }
  items.sort((a, b) => a.n - b.n);
  const centre = nearness(cu, cv);
  for (const it of items) if (it.n < centre) it.draw();
  // Column with bands.
  cylinder(ctx, cu, cv, 0.2, 8, Hc + 8, '#e8503a', '#f06a52');
  for (let k = 0; k < 4; k++) {
    const h = 24 + k * 22;
    cylinder(ctx, cu, cv, 0.205, h, h + 6, '#ffd166', '#ffd166');
  }
  // Rotating crown with bulbs.
  cylinder(ctx, cu, cv, 0.56, Hc - 3, Hc + 2, '#c4552c', '#ffb36b');
  for (let k = 0; k < 12; k++) {
    const a = TAU * (k / 12 + st.angle);
    if (Math.cos(a) + Math.sin(a) < -0.3) continue;
    const p = circlePt(cu, cv, 0.56, a);
    ctx.fillStyle = k % 2 ? '#fff3b0' : '#ffd166';
    ctx.beginPath();
    ctx.arc(sx(p.u, p.v), sy(p.u, p.v, Hc - 0.5), 1.4, 0, TAU);
    ctx.fill();
  }
  cone(ctx, cu, cv, 0.5, Hc + 2, Hc + 22, ['#f0643a', '#ffd166'], 10);
  const tx = sx(cu, cv);
  const ty = sy(cu, cv, Hc + 22);
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 2.2 : 5.5;
    const a = (k / 10) * TAU - Math.PI / 2;
    const x = tx + r * Math.cos(a);
    const y = ty - 5 + r * Math.sin(a);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  for (const it of items) if (it.n >= centre) it.draw();
}

function drawTeacups(ctx: Ctx, ex: number, ey: number, st: RideArtState): void {
  const cu = ex / 2;
  const cv = ey / 2;
  platform(ctx, ex, ey, '#f3e6ef', '#b28aa0');
  cylinder(ctx, cu, cv, 1.35, 3, 7, '#c98aa8', '#f7d7e6');
  // Turning floor pattern.
  for (let k = 0; k < 8; k++) {
    const a0 = TAU * (k / 8 + st.angle * 0.5);
    const a1 = a0 + TAU / 16;
    const p0 = circlePt(cu, cv, 1.3, a0);
    const p1 = circlePt(cu, cv, 1.3, a1);
    poly3(ctx, [cu, cv, 7, p0.u, p0.v, 7, p1.u, p1.v, 7], '#efb8d0');
  }
  const cupColours = ['#e8503a', '#3d9be0', '#f5d03b', '#8d5ad8'];
  const cups = 4;
  const filled = seatsFilled(cups, st.occupancy);
  const items: Array<{ n: number; draw: () => void }> = [];
  for (let i = 0; i < cups; i++) {
    const th = TAU * (i / cups + st.angle * 0.5 + 0.125);
    const p = circlePt(cu, cv, 0.85, th);
    const spin = TAU * (st.angle * 3 + i * 0.3);
    items.push({
      n: nearness(p.u, p.v),
      draw: () => {
        const c = cupColours[i] as string;
        const hp = circlePt(p.u, p.v, 0.3, spin);
        const handleBack = Math.cos(spin) + Math.sin(spin) < 0;
        const handle = (): void => {
          ctx.strokeStyle = shade(c, 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx(hp.u, hp.v), sy(hp.u, hp.v, 15), 2.6, 0, TAU);
          ctx.stroke();
        };
        if (handleBack) handle();
        cylinder(ctx, p.u, p.v, 0.27, 7, 20, c, shade(c, 0.55));
        cylinder(ctx, p.u, p.v, 0.275, 17, 20, '#fff6ea', shade(c, 0.55));
        disc(ctx, p.u, p.v, 0.2, 20, shade(c, 0.45));
        if (i < filled) {
          rider(ctx, sx(p.u, p.v) - 3, sy(p.u, p.v, 22), i * 2);
          rider(ctx, sx(p.u, p.v) + 3, sy(p.u, p.v, 22), i * 2 + 1);
        }
        if (!handleBack) handle();
      },
    });
  }
  items.push({
    n: nearness(cu, cv),
    draw: () => {
      cylinder(ctx, cu, cv, 0.32, 7, 30, '#7cc04b', '#9bd86a');
      cylinder(ctx, cu, cv, 0.2, 30, 35, '#5fa338', '#9bd86a');
      ctx.fillStyle = '#f5d03b';
      ctx.beginPath();
      ctx.arc(sx(cu, cv), sy(cu, cv, 38), 3, 0, TAU);
      ctx.fill();
      line3(ctx, cu + 0.3, cv - 0.3, 18, cu + 0.62, cv - 0.62, 28, '#7cc04b', 4);
    },
  });
  items.sort((a, b) => a.n - b.n);
  for (const it of items) it.draw();
}

/**
 * Fallback for any other ride id (Phase 3 content gets real art in Wave 2): a striped tag-coloured
 * pavilion with a pointed roof, a pennant, and a turning star on top. Tall rides get a taller drum.
 */
function drawGenericRide(ctx: Ctx, defId: string, ex: number, ey: number, st: RideArtState): void {
  const tag = tagOf(defId);
  const c = TAG_COLOURS[tag];
  const tall = getFlatRideDef(defId)?.flags.tall ?? false;
  platform(ctx, ex, ey, shade(c.light, 1.25), c.dark);
  const cu = ex / 2;
  const cv = ey / 2;
  const r = Math.min(ex, ey) / 2 - 0.3;
  const h = tall ? 46 : 24;
  cylinder(ctx, cu, cv, r, 3, h, c.main, c.light);
  // Vertical stripes on the visible half of the drum.
  for (let k = 0; k < 16; k += 2) {
    const a0 = (k / 16) * TAU;
    const a1 = ((k + 1) / 16) * TAU;
    if (Math.cos((a0 + a1) / 2) + Math.sin((a0 + a1) / 2) < 0.15) continue;
    const p0 = circlePt(cu, cv, r, a0);
    const p1 = circlePt(cu, cv, r, a1);
    poly3(ctx, [p0.u, p0.v, 4, p1.u, p1.v, 4, p1.u, p1.v, h, p0.u, p0.v, h], '#fff6ea');
  }
  // Doorway facing the viewer.
  const door = circlePt(cu, cv, r, Math.PI / 4);
  const dx = sx(door.u, door.v);
  const dy = sy(door.u, door.v, 3);
  ctx.fillStyle = shade(c.dark, 0.7);
  ctx.beginPath();
  rrect(ctx, dx - 6, dy - 15, 12, 15, 6, 0);
  ctx.fill();
  const roofTop = h + 26 + r * 10;
  cone(ctx, cu, cv, r + 0.12, h, roofTop, [c.main, '#fff6ea'], 12);
  line3(ctx, cu, cv, roofTop, cu, cv, roofTop + 12, '#5b4636', 1.5);
  const tx = sx(cu, cv);
  const ty = sy(cu, cv, roofTop + 12);
  // Turning star.
  ctx.fillStyle = tag === 'thrill' ? '#ffd166' : tag === 'chill' ? '#e8f7ff' : '#f5d03b';
  ctx.beginPath();
  const spin = TAU * st.angle;
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 ? 2.2 : 5.5;
    const a = (k / 10) * TAU + spin;
    const x = tx + rr * Math.cos(a);
    const y = ty + rr * 0.75 * Math.sin(a);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  if (st.occupancy > 0) {
    const n = seatsFilled(4, st.occupancy);
    for (let i = 0; i < n; i++) rider(ctx, dx - 9 + i * 6, dy - 20, i);
  }
}

/** Draw a ride sprite with its anchor at (0, 0). `w` × `d` is the catalog footprint. */
export function drawRideArt(ctx: Ctx, defId: string, w: number, d: number, st: RideArtState): void {
  const { ex, ey } = extent(w, d, st.rotation);
  const tag = tagOf(defId);
  withGates(ctx, w, d, st, ex, ey, tag, () => {
    // Phase 8b tool hook: on a surface, the stage 0 twin when the ride has one.
    const sa = __TC_APP__ ? surfaceArt.on : null;
    if (__TC_APP__ && sa?.is(ctx) && sa.ride(ctx, defId, ex, ey, st)) return;
    switch (defId) {
      case 'carousel':
        drawCarousel(ctx, ex, ey, st);
        break;
      case 'big_wheel':
        drawBigWheel(ctx, ex, ey, st);
        break;
      case 'swing_tower':
        drawSwingTower(ctx, ex, ey, st);
        break;
      case 'teacup_twirl':
        drawTeacups(ctx, ex, ey, st);
        break;
      default: {
        // Phase 3 research rides have their own art (W2-C, ./content); anything else gets the fallback.
        const art = CONTENT_RIDE_ART[defId];
        if (__TC_APP__ && art) art.draw(ctx, ex, ey, st);
        else drawGenericRide(ctx, defId, ex, ey, st);
      }
    }
  });
}
