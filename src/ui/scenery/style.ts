/**
 * Scenery UI styles (Phase 4 §7). Owner: W3-D. Injected once from this folder so the scenery tool needs no edit of the
 * shared stylesheet. Uses the design tokens of `src/styles/tokens.css`. Touch targets ≥ 44 × 44 CSS px.
 */
const CSS = `
.scn-layer { position: absolute; inset: 0; pointer-events: none; }
.scn-picker {
  position: absolute; pointer-events: auto; display: flex; flex-direction: column;
  background: var(--surface); border: var(--outline); box-shadow: var(--shadow); overflow: hidden;
}
#ui[data-layout='side'] .scn-picker {
  top: calc(var(--hud-bottom) + 10px); right: calc(10px + var(--safe-right)); width: 372px;
  max-height: calc(100% - var(--hud-bottom) - var(--toolbar-space) - 120px - var(--safe-bottom)); border-radius: var(--radius-surface);
}
#ui[data-layout='bottom'] .scn-picker {
  left: 0; right: 0; bottom: var(--toolbar-space); max-height: min(56vh, calc(100% - var(--hud-bottom) - var(--toolbar-space)));
  border-radius: var(--radius-surface) var(--radius-surface) 0 0; padding-left: var(--safe-left); padding-right: var(--safe-right);
}
/* Task 19, the low layout (a phone held sideways): a right-side panel from below the top region to above the chips row. */
#ui[data-low='1'] .scn-picker {
  left: auto; bottom: auto; top: calc(var(--hud-bottom) + 8px); right: calc(10px + var(--safe-right)); width: min(372px, 48%);
  max-height: calc(100% - var(--hud-bottom) - var(--chips-space, var(--toolbar-space)) - 16px);
  border-radius: var(--radius-surface); padding-left: 0; padding-right: 0;
}
.scn-head { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border-bottom: var(--control-outline); flex: none; }
.scn-head h2 { margin: 0; font-size: calc(17px * var(--ts, 1)); flex: 1; }
.scn-tabs { display: flex; gap: 4px; padding: 6px 8px; overflow-x: auto; flex: none; scrollbar-width: thin; }
.scn-tab {
  pointer-events: auto; cursor: pointer; flex: none; min-height: var(--touch); min-width: var(--touch); padding: 4px 10px;
  border-radius: var(--radius); border: var(--control-outline); background: var(--surface-2); color: var(--ink); font-weight: 600;
  display: inline-flex; align-items: center; gap: 6px; border-top-width: 4px;
}
.scn-tab[aria-selected='true'] { background: var(--ink); color: var(--surface); border-left-color: var(--ink); border-right-color: var(--ink); border-bottom-color: var(--ink); }
.scn-tab[aria-selected='true'] .scn-lock { color: inherit; }
.scn-tab .scn-lock { font-size: calc(12px * var(--ts, 1)); color: var(--muted-ink); }
.scn-mood-thrill { border-top-color: var(--accent-thrill); }
.scn-mood-chill { border-top-color: var(--accent-chill); }
.scn-mood-family { border-top-color: var(--accent-family); }
.scn-mood-neutral { border-top-color: var(--muted-ink); }
.scn-note { margin: 0; padding: 4px 14px; color: var(--warn-text); font-size: calc(13px * var(--ts, 1)); flex: none; }
/* Rows take the full height of their cards and the grid scrolls; with plain auto rows the grid squeezed the rows to
   fit the sheet (the preview canvas has a percentage width, so it counts as compressible), and text spilled out. */
.scn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); grid-auto-rows: max-content; align-content: start; gap: 6px; padding: 8px; overflow-y: auto; }
#ui[data-layout='bottom'] .scn-grid { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); }
.scn-card {
  pointer-events: auto; cursor: pointer; display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 4px;
  min-height: var(--touch); border-radius: var(--radius); border: var(--control-outline); background: var(--surface-2); color: var(--ink);
  text-align: left; font-size: calc(12px * var(--ts, 1));
}
.scn-card:hover { background: var(--surface-3); }
.scn-card[aria-pressed='true'] { background: var(--gold); box-shadow: inset 0 0 0 2px var(--ink); }
.scn-card:disabled { opacity: 0.45; cursor: not-allowed; }
.scn-card canvas { width: 100%; aspect-ratio: 96 / 72; height: auto; border-radius: 6px; background: var(--surface-3); }
.scn-card .scn-name { font-weight: 700; line-height: 1.15; }
.scn-card .scn-cost { align-self: flex-start; color: var(--ink); background: var(--gold); border-radius: 999px; padding: 0 6px; font-weight: 700; }
.scn-card .scn-fields { color: var(--muted-ink); }
.scn-status .btn[aria-pressed='true'] { background: var(--ink); color: var(--surface); }
#ui[data-layout='side'] .scn-status { left: 50%; transform: translateX(-50%); bottom: calc(max(var(--toolbar-space), var(--safe-bottom)) + 16px); }
#ui[data-layout='bottom'] .scn-status { left: 10px; right: 10px; margin: 0 auto; bottom: calc(var(--toolbar-space) + 8px); }
.scn-status .status-actions { flex-wrap: wrap; }
`;

let injected = false;

export function injectSceneryStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'tc-scenery-style';
  el.textContent = CSS;
  document.head.append(el);
}
