/**
 * Styles of the scenario front end (title flow, scenario select, detail sheet, sandbox setup, objectives panel,
 * end screen, award toasts, tutorial bubbles). Owner: W3-I. Injected once, so `styles/main.css` stays untouched.
 * Touch targets are at least 44 × 44 CSS px (plan Global Constraints).
 */
const CSS = `
.tc-view { display: flex; flex-direction: column; gap: 10px; }
.tc-view-head { display: flex; align-items: center; gap: 8px; }
.tc-view-head h2 { margin: 0; font-size: calc(20px * var(--ts, 1)); flex: 1; }
.tc-section-title { margin: 6px 0 0; font-size: calc(12px * var(--ts, 1)); text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-ink); }
/* The column's least width grows with the text scale, so large text gives fewer, wider columns (G8). */
.tc-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(120px * var(--ts, 1))), 1fr)); gap: 8px; }
.tc-mode { flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; min-height: 64px; min-width: 0; }
.tc-mode > * { max-width: 100%; overflow-wrap: anywhere; }
.tc-mode .btn-label { font-weight: 800; font-size: calc(16px * var(--ts, 1)); }
.tc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tc-chip {
  pointer-events: auto; cursor: pointer;
  min-height: var(--touch); min-width: var(--touch);
  padding: 6px 12px; border-radius: 999px;
  border: var(--control-outline); background: var(--surface-2); color: var(--ink);
  font: inherit; font-weight: 600;
}
.tc-chip[aria-pressed='true'], .tc-chip[aria-checked='true'] { background: var(--ink); color: var(--surface); }
.tc-chip:focus-visible, .tc-card:focus-visible, .tc-hud-btn:focus-visible { outline: 3px solid transparent; outline-offset: 2px; box-shadow: var(--focus-ring); }
.tc-warning { margin: 0; color: var(--warn-text); font-size: calc(13px * var(--ts, 1)); }
.tc-field { display: flex; flex-direction: column; gap: 4px; }
.tc-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tc-row > .text-input { flex: 1 1 140px; min-width: 0; }
.tc-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.tc-option > span { font-weight: 600; }
.tc-options { display: flex; flex-direction: column; gap: 8px; }
.tc-option-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px 16px; }
.tc-muted { color: var(--muted-ink); margin: 0; }

/* Scenario select */
.tc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.tc-grid > [role='listitem'] { display: flex; }
.tc-grid .tc-card { flex: 1; width: 100%; }
.tc-card {
  pointer-events: auto; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 120px; padding: 12px;
  border-radius: var(--radius); border: var(--control-outline); background: var(--surface-2); color: var(--ink); font: inherit;
}
.tc-card:hover { background: var(--surface-3); }
/* Locked: a dashed outline on the muted fill; the text keeps its full contrast (Task 15b). */
.tc-card.locked { cursor: default; border-style: dashed; }
.tc-card.locked:hover { background: var(--surface-2); }
.tc-card-name { font-weight: 800; font-size: calc(16px * var(--ts, 1)); }
.tc-stars { color: var(--warn-text); letter-spacing: 1px; }
.tc-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tc-tag { padding: 1px 8px; border-radius: 999px; background: var(--surface); color: var(--ink); border: 2px solid var(--ink); font-size: calc(12px * var(--ts, 1)); font-weight: 600; }
/* Tags are tinted fills with ink text. */
.tc-tag.climate-cold { background: color-mix(in srgb, var(--weather-cold) 25%, var(--surface)); } .tc-tag.climate-hot { background: color-mix(in srgb, var(--accent-thrill) 35%, var(--surface)); } .tc-tag.climate-coastal { background: color-mix(in srgb, var(--accent-chill) 35%, var(--surface)); } .tc-tag.climate-temperate { background: color-mix(in srgb, var(--accent-family) 35%, var(--surface)); }
.tc-tag.night { background: color-mix(in srgb, var(--weather-storm) 25%, var(--surface)); }
.tc-best { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: calc(12px * var(--ts, 1)); }
.tc-best span { text-align: center; border-radius: 8px; background: var(--surface); border: 1px solid var(--ink); padding: 2px; }
.tc-lock { color: var(--muted-ink); font-size: calc(13px * var(--ts, 1)); }
.tc-earlier { font-size: calc(11px * var(--ts, 1)); color: var(--muted-ink); font-style: italic; }
.tc-notice {
  display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border-radius: var(--radius); border: 2px solid var(--warn);
  background: color-mix(in srgb, var(--gold) 22%, var(--surface));
}
.tc-notice p { margin: 0; font-weight: 600; }

/* Detail sheet: side panel on desktop, bottom sheet on phones */
.tc-sheet-backdrop { position: fixed; inset: 0; pointer-events: auto; background: var(--backdrop); }
.tc-detail {
  position: absolute; pointer-events: auto;
  display: flex; flex-direction: column; gap: 10px;
  overflow-y: auto; overscroll-behavior: contain;
  padding: 16px; background: var(--surface); border: var(--outline);
  box-shadow: var(--shadow);
}
#ui[data-layout='side'] .tc-detail {
  top: 0; right: 0; bottom: 0; width: min(420px, 100%);
  padding-top: calc(16px + var(--safe-top)); padding-right: calc(16px + var(--safe-right));
  border-radius: var(--radius-surface) 0 0 var(--radius-surface);
}
#ui[data-layout='bottom'] .tc-detail {
  left: 0; right: 0; bottom: 0; max-height: 88%;
  padding-bottom: calc(16px + var(--safe-bottom));
  border-radius: var(--radius-surface) var(--radius-surface) 0 0;
}
.tc-detail h2 { margin: 0; font-size: calc(20px * var(--ts, 1)); flex: 1; }
.tc-detail p { margin: 0; }
.tc-goals { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.tc-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.tc-presets .tc-chip { border-radius: var(--radius); }

/* HUD flag and objectives panel */
.tc-hud-btn {
  pointer-events: auto; cursor: pointer;
  min-width: var(--touch); min-height: var(--touch);
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 4px 8px; border-radius: var(--radius); border: var(--control-outline);
  background: var(--surface-2); color: var(--ink); font: inherit; font-weight: 700;
}
.tc-hud-btn[aria-expanded='true'] { background: var(--ink); color: var(--surface); }
.tc-hud-btn.won { color: var(--ok); } .tc-hud-btn.lost { color: var(--danger-text); }
.tc-objectives {
  position: absolute; pointer-events: auto; z-index: 2;
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 14px; overflow-y: auto; overscroll-behavior: contain;
  background: var(--surface); border: var(--outline); box-shadow: var(--shadow);
}
#ui[data-layout='side'] .tc-objectives { top: calc(var(--hud-bottom) + 10px); right: calc(10px + var(--safe-right)); width: 340px; max-height: calc(100% - var(--hud-bottom) - var(--toolbar-space) - 20px); border-radius: var(--radius-surface); }
#ui[data-layout='bottom'] .tc-objectives { left: 0; right: 0; bottom: var(--toolbar-space); max-height: 60%; border-radius: var(--radius-surface) var(--radius-surface) 0 0; }
/* Task 19, the low layout (a phone held sideways): a right-side panel from below the top region to above the chips row. */
#ui[data-low='1'] .tc-objectives {
  left: auto; bottom: auto; top: calc(var(--hud-bottom) + 8px); right: calc(10px + var(--safe-right)); width: min(340px, 48%);
  max-height: calc(100% - var(--hud-bottom) - var(--chips-space, var(--toolbar-space)) - 16px);
  border-radius: var(--radius-surface);
}
.tc-objectives h2 { margin: 0; font-size: calc(17px * var(--ts, 1)); flex: 1; }
.tc-goal { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-bottom: 1px solid var(--rule); }
.tc-goal:last-child { border-bottom: 0; }
.tc-goal-text { font-weight: 600; }
.tc-goal.met .tc-goal-text::before { content: '✓ '; color: var(--ok); }
.tc-bar { height: 10px; border-radius: 5px; background: var(--surface-2); border: var(--control-outline); overflow: hidden; }
.tc-bar i { display: block; height: 100%; background: var(--accent-chill); }
.tc-goal.met .tc-bar i { background: var(--ok); }
.tc-goal-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--muted-ink); font-size: calc(13px * var(--ts, 1)); font-variant-numeric: tabular-nums; }
.tc-deadline { font-weight: 700; }

/* Award toasts */
.tc-award-toast {
  position: absolute; pointer-events: auto; z-index: 2;
  left: 50%; transform: translateX(-50%);
  top: calc(var(--hud-bottom) + 56px);
  width: min(440px, calc(100% - 20px));
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: var(--radius-surface); border: var(--outline);
  background: var(--surface); box-shadow: inset 6px 0 0 var(--accent-chill), var(--shadow);
  cursor: pointer;
}
.tc-award-toast.negative { box-shadow: inset 6px 0 0 var(--danger), var(--shadow); }
.tc-award-toast.positive.thrill { box-shadow: inset 6px 0 0 var(--accent-thrill), var(--shadow); }
.tc-award-toast strong { display: block; font-size: calc(15px * var(--ts, 1)); }
.tc-award-toast span { display: block; color: var(--muted-ink); font-size: calc(13px * var(--ts, 1)); }
.tc-award-toast.enter { animation: tc-pop 200ms ease-out; }
@keyframes tc-pop { from { transform: translate(-50%, -8px); opacity: 0; } to { transform: translateX(-50%); opacity: 1; } }

/* Park panel: awards */
.tc-award-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.tc-award-list li { display: flex; justify-content: space-between; gap: 8px; }
.tc-award-list li.positive .tc-award-name { color: var(--good-text); }
.tc-award-list li.negative .tc-award-name { color: var(--danger-text); }
.tc-award-list .tc-award-date { color: var(--muted-ink); font-size: calc(12px * var(--ts, 1)); }
.tc-award-history { max-height: 180px; overflow-y: auto; }

/* Tutorial */
.tc-bubble {
  position: absolute; pointer-events: auto; z-index: 2;
  left: 50%; transform: translateX(-50%);
  width: min(540px, calc(100% - 16px));
  display: grid; grid-template-columns: 1fr; gap: 6px 12px; align-items: start;
  padding: 12px 14px; border-radius: var(--radius-surface);
  background: var(--surface);
  border: var(--outline); box-shadow: inset 6px 0 0 var(--accent-chill), var(--shadow);
}
.tc-bubble[data-pos='top'] { top: calc(var(--hud-bottom) + 8px); }
#ui[data-layout='side'] .tc-bubble[data-pos='bottom'] { bottom: calc(max(var(--toolbar-space), var(--safe-bottom)) + 16px); }
#ui[data-layout='bottom'] .tc-bubble[data-pos='bottom'] { bottom: calc(var(--toolbar-space) + 8px); }
.tc-bubble-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tc-bubble-step { font-size: calc(12px * var(--ts, 1)); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-ink); }
.tc-bubble-title { font-weight: 800; font-size: calc(16px * var(--ts, 1)); }
.tc-bubble-hint { color: var(--ink); }
.tc-bubble-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.tc-ring {
  position: absolute; pointer-events: none; z-index: 3;
  border: 3px solid var(--ink); border-radius: var(--radius);
  box-shadow: 0 0 0 4px var(--ring-glow);
  animation: tc-ring 1.2s ease-in-out infinite;
}
@keyframes tc-ring { 50% { box-shadow: 0 0 0 9px var(--ring-glow-faint); } }

/* End screen: modal on desktop, full-screen sheet on phones */
.dialog.tc-end { width: min(480px, 100%); display: flex; flex-direction: column; gap: 10px; }
.dialog.tc-end .dialog-title { margin: 0; text-align: center; font-size: calc(22px * var(--ts, 1)); }
.tc-end-reason { margin: 0; text-align: center; color: var(--muted-ink); }
.tc-facts { margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; }
.tc-facts dt { color: var(--muted-ink); }
.tc-facts dd { margin: 0; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
#ui[data-layout='bottom'] .modal-backdrop:has(.tc-end) { padding: 0; }
#ui[data-layout='bottom'] .dialog.tc-end { width: 100%; height: 100%; max-height: 100%; border-radius: 0; padding: calc(18px + var(--safe-top)) calc(18px + var(--safe-right)) calc(18px + var(--safe-bottom)) calc(18px + var(--safe-left)); }

@media (prefers-reduced-motion: reduce) {
  .tc-ring, .tc-award-toast.enter { animation: none; }
}
`;

let injected = false;

export function injectScenarioStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'tc-scenario-styles';
  style.textContent = CSS;
  document.head.append(style);
}
