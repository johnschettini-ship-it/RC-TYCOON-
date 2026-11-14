/**
 * The batch review page (phase 8c, spec §7 item 1): one row per item, today's look next to the realistic look, for
 * the owner to approve a batch on a phone. Pure: `reviewShots.mjs` takes the pictures and writes this page.
 * Phone width: every size is fluid (percent / rem); nothing is fixed wider than 390 px.
 */
export interface ReviewShot { look: 'classic' | 'real'; turn: number; file: string }
export interface ReviewItem { id: string; name: string; shots: ReviewShot[] }

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
`;

export function reviewPage(items: readonly ReviewItem[]): string {
  const look = (it: ReviewItem, which: 'classic' | 'real', label: string): string => {
    const imgs = it.shots
      .filter((s) => s.look === which)
      .sort((a, b) => a.turn - b.turn)
      .map((s) => `<img src="${esc(s.file)}" alt="${esc(it.name)}, ${label}, turn ${s.turn}" loading="lazy">`)
      .join('');
    return `<div class="look ${which}"><h3>${label}</h3><div class="turns">${imgs}</div></div>`;
  };
  const rows = items
    .map((it) => `<section class="item" id="${esc(it.id)}"><h2>${esc(it.name)} <small>${esc(it.id)}</small></h2>${look(it, 'classic', 'Today')}${look(it, 'real', 'Realistic')}</section>`)
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Art review</title><style>${CSS}</style></head>
<body><h1>Art review: today vs realistic</h1>
${rows}
</body></html>
`;
}
