/**
 * The title folders and their pure validators (no node: imports; checkIndex.ts and checkIndexCli.ts call them).
 *
 * `title/` is the poster cover the game shows (owner's choice, 2026-11-17): `art-src/title/` copied by cover.ts (the
 * bake does it too), validated by `checkCoverFolder` against the game's own index check (`checkCoverIndex` in
 * src/ui/titleScreen/real/layout.ts) plus the files: present at the size the index says, nothing stray, 3 MB
 * compressed, 24 MB decoded per framing.
 *
 * `title-panorama/` is the earlier baked panorama (tools/art3d/items/title.js), baked only on request
 * (`--only title`) and not shown by the game any more; `checkTitleIndex` below is its format:
 *
 * Two framings, `wide` (desktop) and `tall` (phone), each three layers of the framing's size drawn back to front
 * (sky, park, front: the foreground trees and the lake), and the big wheel as an 8-frame strip (frames side by side,
 * each fw x fh) drawn on the park layer with its top-left at (x, y). `nameRow` is the top of the tallest ride in
 * layer px (the name sits above it); `menuAnchorX` is the wheel's left edge in layer px (the menu must not cover it).
 * Two name signs: `line` (one line) and `stack` ("Thrills", "&", "Chills"). File names are relative to title/.
 */

import { COVER_COMPRESSED_MAX, checkCoverIndex, coverDecoded } from '../../src/ui/titleScreen/real/layout';

export { coverDecoded };

export interface TitleWheel { file: string; frames: 8; fw: number; fh: number; x: number; y: number }
export interface TitleFraming {
  w: number;
  h: number;
  layers: { sky: string; park: string; front: string };
  wheel: TitleWheel;
  nameRow: number;
  menuAnchorX: number;
}
export interface TitleSign { file: string; w: number; h: number }
export interface TitleIndex {
  wide: TitleFraming;
  tall: TitleFraming;
  sign: { line: TitleSign; stack: TitleSign };
  /** Written by the bake for the record (bytes of the files); not needed by the reader. */
  bytes?: { compressed: number; decoded: { wide: number; tall: number } };
}
/** The files of the title folder (not index.json): pixel size read from the file, and its byte size. */
export type TitleFiles = Map<string, { w: number; h: number; bytes: number }>;

/** Largest layer per framing (spec: wide 1920 x 800, tall 900 x 1300 px). */
export const TITLE_CAPS = { wide: { w: 1920, h: 800 }, tall: { w: 900, h: 1300 } } as const;
/** All title files together, compressed (spec S5 share: 3 MB). */
export const TITLE_COMPRESSED_MAX = 3_000_000;
/** Decoded RGBA bytes the title holds for one framing: its three layers, its wheel strip and both signs. */
export const TITLE_DECODED_MAX = 24_000_000;

/** Most transparent margin the wheel strip keeps round the wheel, px. */
export const WHEEL_MARGIN_MAX = 24;

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const posInt = (n: unknown): n is number => isInt(n) && n > 0;

/** Decoded bytes per framing (layers, wheel strip, both signs: the title may show either sign in either framing). */
export function titleDecoded(t: TitleIndex): { wide: number; tall: number } {
  const signs = (t.sign.line.w * t.sign.line.h + t.sign.stack.w * t.sign.stack.h) * 4;
  const of = (f: TitleFraming): number => 3 * f.w * f.h * 4 + f.wheel.frames * f.wheel.fw * f.wheel.fh * 4 + signs;
  return { wide: of(t.wide), tall: of(t.tall) };
}

/** Returns a list of problems; empty means the title index and its files agree and keep the limits. */
export function checkTitleIndex(t: unknown, files: TitleFiles): string[] {
  const problems: string[] = [];
  const named = new Set<string>();
  const file = (where: string, name: unknown, w: number, h: number): void => {
    if (typeof name !== 'string' || name === '' || name.includes('/')) { problems.push(`${where}: bad file name`); return; }
    named.add(name);
    const f = files.get(name);
    if (!f) { problems.push(`${where}: missing file ${name}`); return; }
    if (f.w !== w || f.h !== h) problems.push(`${where}: ${name} is ${f.w}x${f.h}, the index says ${w}x${h}`);
  };
  const idx = t as Partial<TitleIndex> | null;
  if (!idx || typeof idx !== 'object') return ['not an object'];

  for (const kind of ['wide', 'tall'] as const) {
    const f = idx[kind];
    if (!f || typeof f !== 'object') { problems.push(`${kind}: missing framing`); continue; }
    if (!posInt(f.w) || !posInt(f.h)) { problems.push(`${kind}: size is not whole positive px`); continue; }
    const cap = TITLE_CAPS[kind];
    if (f.w > cap.w || f.h > cap.h) problems.push(`${kind}: ${f.w}x${f.h} is over the cap ${cap.w}x${cap.h}`);
    if (kind === 'wide' && f.w <= f.h) problems.push('wide: not wider than tall');
    if (kind === 'tall' && f.h <= f.w) problems.push('tall: not taller than wide');
    for (const l of ['sky', 'park', 'front'] as const) file(`${kind}.layers.${l}`, f.layers?.[l], f.w, f.h);
    const wh = f.wheel;
    if (!wh) { problems.push(`${kind}: no wheel`); continue; }
    if (wh.frames !== 8) problems.push(`${kind}: the wheel must have 8 frames (has ${String(wh.frames)})`);
    if (!posInt(wh.fw) || !posInt(wh.fh) || !isInt(wh.x) || !isInt(wh.y)) { problems.push(`${kind}: wheel size or place is not whole px`); continue; }
    file(`${kind}.wheel`, wh.file, 8 * wh.fw, wh.fh);
    if (wh.x < 0 || wh.y < 0 || wh.x + wh.fw > f.w || wh.y + wh.fh > f.h) problems.push(`${kind}: wheel outside the layer`);
    if (!isInt(f.nameRow) || f.nameRow <= 0 || f.nameRow >= f.h) problems.push(`${kind}: nameRow ${String(f.nameRow)} not inside the layer`);
    // the tallest ride's top is at or above the wheel's top (the sprite keeps a few px of margin round the wheel)
    else if (f.nameRow > wh.y + WHEEL_MARGIN_MAX) problems.push(`${kind}: nameRow ${f.nameRow} is below the wheel's top (sprite top ${wh.y})`);
    // the wheel ride's leftmost pixel: at the sprite's left edge (its margin), or left of it where the static frame
    // (legs, platform) reaches further out than the turning part
    if (!isInt(f.menuAnchorX) || f.menuAnchorX < 0 || f.menuAnchorX > wh.x + WHEEL_MARGIN_MAX) problems.push(`${kind}: menuAnchorX ${String(f.menuAnchorX)} is not the wheel's left edge (sprite left ${wh.x})`);
  }

  const sign = idx.sign;
  for (const s of ['line', 'stack'] as const) {
    const g = sign?.[s];
    if (!g) { problems.push(`sign.${s}: missing`); continue; }
    if (!posInt(g.w) || !posInt(g.h)) { problems.push(`sign.${s}: size is not whole positive px`); continue; }
    file(`sign.${s}`, g.file, g.w, g.h);
  }
  if (sign?.line && sign.line.w <= 2 * sign.line.h) problems.push(`sign.line: a one-line sign is more than twice as wide as high (${sign.line.w}x${sign.line.h})`);
  if (sign?.line && sign.stack && sign.stack.w / sign.stack.h >= sign.line.w / sign.line.h) problems.push('sign.stack: not narrower in shape than sign.line');

  for (const n of files.keys()) if (!named.has(n)) problems.push(`file not in the title index: ${n}`);
  let bytes = 0;
  for (const f of files.values()) bytes += f.bytes;
  if (bytes > TITLE_COMPRESSED_MAX) problems.push(`compressed ${bytes} bytes, over ${TITLE_COMPRESSED_MAX}`);
  if (problems.length === 0) {
    const d = titleDecoded(idx as TitleIndex);
    for (const k of ['wide', 'tall'] as const) if (d[k] > TITLE_DECODED_MAX) problems.push(`${k}: decoded ${d[k]} bytes, over ${TITLE_DECODED_MAX}`);
  }
  return problems;
}

/** Width and height of a WebP file (VP8X, VP8 or VP8L header). */
export function webpSize(buf: Uint8Array): [number, number] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fourcc = String.fromCharCode(buf[12] ?? 0, buf[13] ?? 0, buf[14] ?? 0, buf[15] ?? 0);
  const u24 = (o: number): number => (buf[o] ?? 0) | ((buf[o + 1] ?? 0) << 8) | ((buf[o + 2] ?? 0) << 16);
  if (fourcc === 'VP8X') return [1 + u24(24), 1 + u24(27)];
  if (fourcc === 'VP8 ') return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
  if (fourcc === 'VP8L') { const b = dv.getUint32(21, true); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  throw new Error('not a WebP file');
}

/** Returns a list of problems of the cover folder (`title/`); empty means its index and files agree and keep the limits. */
export function checkCoverFolder(raw: unknown, files: TitleFiles): string[] {
  const idx = checkCoverIndex(raw);
  if (idx instanceof Error) return [idx.message];
  const problems: string[] = [];
  const named = new Set<string>();
  for (const k of ['wide', 'tall'] as const) {
    const F = idx[k];
    named.add(F.file);
    const f = files.get(F.file);
    if (!f) problems.push(`${k}: missing file ${F.file}`);
    else if (f.w !== F.w || f.h !== F.h) problems.push(`${k}: ${F.file} is ${f.w}x${f.h}, the index says ${F.w}x${F.h}`);
  }
  for (const n of files.keys()) if (!named.has(n)) problems.push(`file not in the cover index: ${n}`);
  let bytes = 0;
  for (const f of files.values()) bytes += f.bytes;
  if (bytes > COVER_COMPRESSED_MAX) problems.push(`compressed ${bytes} bytes, over ${COVER_COMPRESSED_MAX}`);
  const d = coverDecoded(idx);
  for (const k of ['wide', 'tall'] as const) if (d[k] > TITLE_DECODED_MAX) problems.push(`${k}: decoded ${d[k]} bytes, over ${TITLE_DECODED_MAX}`);
  return problems;
}
