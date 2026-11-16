/**
 * The batch review page (phase 8c, spec §7 item 1): one row per item, today's look next to the realistic look, for
 * the owner to approve a batch on a phone. Pure: `reviewShots.mjs` takes the pictures and writes this page.
 * Phone width: every size is fluid (percent / rem); nothing is fixed wider than 390 px.
 */
/** `colour`: a ride shot in that colour (TRACK_PALETTE index, ride colour choice); absent: its original colours. */
export interface ReviewShot { look: 'classic' | 'real'; turn: number; file: string; colour?: number }
export interface ReviewItem { id: string; name: string; shots: ReviewShot[] }
/**
 * Ride colours on the page: 'shot' (rides shot in the colours have colour rows), 'unsupported' (asked for, but the
 * build has no setRideColour command: the page says so), absent (not asked for).
 */
export interface ReviewOpts { colours?: 'shot' | 'unsupported' }

/** The ride colours the colour command takes (TRACK_PALETTE indices) and their names (src/render/track/colours.ts). */
export const REVIEW_COLOURS: readonly number[] = [0, 1, 2, 3, 4, 7];
const COLOUR_NAMES: Readonly<Record<number, string>> = { 0: 'cherry', 1: 'sunset', 2: 'lemon', 3: 'leaf', 4: 'sky', 7: 'grape' };

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
*{box-sizing:border-box}
body{margin:0;padding:12px;font:16px/1.4 system-ui,sans-serif;background:#1d2024;color:#eee;max-width:390px}
h1{font-size:1.2rem;margin:0 0 12px}
.item{margin:0 0 20px;padding:10px;background:#2a2e34;border-radius:10px}
.item h2{font-size:1rem;margin:0 0 8px}
.item h2 small{color:#9aa;font-weight:400}
.look{margin:0 0 8px}
.look h3{font-size:.8rem;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;color:#cdb}
.look.real h3{color:#fc8}
.turns{display:flex;gap:6px}
.turns img{flex:1 1 0;min-width:0;width:100%;height:auto;border-radius:6px;background:#8fb36a;display:block}
.colours h3{font-size:.8rem;margin:0 0 4px;color:#9cf}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.grid figure{margin:0}
.grid img{width:100%;height:auto;border-radius:6px;background:#8fb36a;display:block}
.grid figcaption{font-size:.75rem;color:#bbb;text-align:center}
.note{padding:8px 10px;margin:0 0 12px;background:#4a3a1c;border-radius:8px;font-size:.9rem}
`;

export function reviewPage(items: readonly ReviewItem[], opts: ReviewOpts = {}): string {
  const look = (it: ReviewItem, which: 'classic' | 'real', label: string): string => {
    const imgs = it.shots
      .filter((s) => s.look === which && s.colour === undefined)
      .sort((a, b) => a.turn - b.turn)
      .map((s) => `<img src="${esc(s.file)}" alt="${esc(it.name)}, ${label}, turn ${s.turn}" loading="lazy">`)
      .join('');
    return `<div class="look ${which}"><h3>${label}</h3><div class="turns">${imgs}</div></div>`;
  };
  // one row per look of the ride in the six colours (turn 0), under its original rows
  const colours = (it: ReviewItem, which: 'classic' | 'real', label: string): string => {
    const shots = it.shots.filter((s) => s.look === which && s.colour !== undefined).sort((a, b) => (a.colour as number) - (b.colour as number));
    if (!shots.length) return '';
    const figs = shots.map((s) => {
      const name = COLOUR_NAMES[s.colour as number] ?? `colour ${s.colour}`;
      return `<figure><img src="${esc(s.file)}" alt="${esc(it.name)}, ${label}, ${esc(name)}" loading="lazy"><figcaption>${esc(name)}</figcaption></figure>`;
    }).join('');
    return `<div class="colours ${which}"><h3>${label}: ride colours</h3><div class="grid">${figs}</div></div>`;
  };
  const rows = items
    .map((it) => `<section class="item" id="${esc(it.id)}"><h2>${esc(it.name)} <small>${esc(it.id)}</small></h2>${look(it, 'classic', 'Today')}${look(it, 'real', 'Realistic')}${colours(it, 'classic', 'Today')}${colours(it, 'real', 'Realistic')}</section>`)
    .join('\n');
  const note = opts.colours === 'unsupported'
    ? '<p class="note">Ride colours were not shot: this build has no setRideColour command (ride colour choice not built in yet). The original colours are shown.</p>\n'
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Art review</title><style>${CSS}</style></head>
<body><h1>Art review: today vs realistic</h1>
${note}${rows}
</body></html>
`;
}
