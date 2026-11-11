/**
 * Show UI styles (Phase 6 §7). Owner: W4-C. Injected once from this folder (the shared stylesheet belongs to W4-F) and
 * built on the tokens of `src/styles/tokens.css` and the shared classes (`.btn`, `.tool-status`, `.panel-section`, `.row`). Touch targets ≥ 44 × 44 CSS px.
 */
const CSS = `
.shw-layer { position: absolute; inset: 0; pointer-events: none; }
.shw-picker {
  position: absolute; pointer-events: auto; display: flex; flex-direction: column;
  background: var(--surface); border: var(--outline); box-shadow: var(--shadow); overflow: hidden;
}
#ui[data-layout='side'] .shw-picker {
  top: calc(var(--hud-bottom) + 10px); right: calc(10px + var(--safe-right)); width: 340px;
  max-height: calc(100% - var(--hud-bottom) - var(--toolbar-space) - 120px - var(--safe-bottom)); border-radius: var(--radius-surface);
}
#ui[data-layout='bottom'] .shw-picker {
  left: 0; right: 0; bottom: var(--toolbar-space); max-height: min(60vh, calc(100% - var(--hud-bottom) - var(--toolbar-space)));
  border-radius: var(--radius-surface) var(--radius-surface) 0 0; padding-left: var(--safe-left); padding-right: var(--safe-right);
}
/* Task 19, the low layout (a phone held sideways): a right-side panel from below the first top row to above the chips row. */
#ui[data-low='1'] .shw-picker {
  left: auto; bottom: auto; top: calc(var(--hud-row1, var(--hud-bottom)) + 8px); right: calc(10px + var(--safe-right)); width: min(340px, 48%);
  max-height: calc(100% - var(--hud-row1, var(--hud-bottom)) - var(--chips-space, var(--toolbar-space)) - 16px);
  border-radius: var(--radius-surface); padding-left: 0; padding-right: 0;
}
.shw-head { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border-bottom: var(--control-outline); flex: none; }
.shw-head h2 { margin: 0; font-size: calc(17px * var(--ts, 1)); flex: 1; }
.shw-help { margin: 0; padding: 6px 14px 0; color: var(--muted-ink); font-size: calc(13px * var(--ts, 1)); }
.shw-note { margin: 0; padding: 4px 14px 0; color: var(--warn-text); font-size: calc(13px * var(--ts, 1)); }
/* Rows take the full height of their cards and the grid scrolls (as the scenery grid): plain auto rows let the grid
   squeeze the rows to fit the sheet. */
.shw-grid { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: max-content; align-content: start; gap: 8px; padding: 10px; overflow-y: auto; }
.shw-card {
  pointer-events: auto; cursor: pointer; display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 6px;
  min-height: var(--touch); border-radius: var(--radius); border: var(--control-outline); background: var(--surface-2); color: var(--ink);
  text-align: left; font-size: calc(12px * var(--ts, 1)); border-top: 4px solid var(--accent-chill);
}
.shw-card[data-def='fireworks_launcher'] { border-top-color: var(--accent-thrill); }
.shw-card:hover { background: var(--surface-3); }
.shw-card:disabled { opacity: 0.5; cursor: not-allowed; }
.shw-card canvas { width: 100%; aspect-ratio: 120 / 96; height: auto; border-radius: 6px; background: var(--surface-3); }
.shw-card .shw-name { font-weight: 700; font-size: calc(13px * var(--ts, 1)); line-height: 1.15; }
.shw-card .shw-cost { align-self: flex-start; color: var(--ink); background: var(--gold); border-radius: 999px; padding: 0 6px; font-weight: 700; }
.shw-card .shw-facts, .shw-card .shw-lock { color: var(--muted-ink); }
.shw-status .status-actions { flex-wrap: wrap; }
.shw-time { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.shw-clock { font-variant-numeric: tabular-nums; font-size: calc(22px * var(--ts, 1)); font-weight: 700; min-width: 2.2ch; text-align: center; }
.shw-colon { font-size: calc(22px * var(--ts, 1)); font-weight: 700; }
.shw-days { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.shw-days .btn[aria-checked='true'] { background: var(--ink); color: var(--surface); }
.shw-state { margin: 0 0 6px; font-weight: 600; }
`;

let injected = false;

export function injectShowStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'tc-shows-style';
  el.textContent = CSS;
  document.head.append(el);
}
