/**
 * Styles of the scenario front end (title flow, scenario select, detail sheet, sandbox setup, objectives panel,
 * end screen, award toasts, tutorial bubbles). Owner: W3-I. Injected once, so `styles/main.css` stays untouched.
 * Touch targets are at least 44 × 44 CSS px (plan Global Constraints).
 */
const CSS = `
.title-card.wide { width: min(980px, 100%); }
.tc-view { display: flex; flex-direction: column; gap: 10px; }
.tc-view-head { display: flex; align-items: center; gap: 8px; }
.tc-view-head h2 { margin: 0; font-size: 20px; flex: 1; }
.tc-section-title { margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.tc-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.tc-mode { flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; min-height: 64px; }
.tc-mode .btn-label { font-weight: 800; font-size: 16px; }
.tc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tc-chip {
  pointer-events: auto; cursor: pointer;
  min-height: var(--touch); min-width: var(--touch);
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--panel-2); color: var(--panel-text);
  font: inherit; font-weight: 600;
}
.tc-chip[aria-pressed='true'], .tc-chip[aria-checked='true'] { background: var(--accent-chill); color: #0d1b28; border-color: transparent; }
.tc-chip:focus-visible, .tc-card:focus-visible, .tc-hud-btn:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.tc-warning { margin: 0; color: var(--warn); font-size: 13px; }
.tc-field { display: flex; flex-direction: column; gap: 4px; }
.tc-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tc-row > .text-input { flex: 1 1 140px; min-width: 0; }
.tc-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.tc-option > span { font-weight: 600; }
.tc-options { display: flex; flex-direction: column; gap: 8px; }
.tc-option-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px 16px; }
.tc-muted { color: var(--muted); margin: 0; }

/* Scenario select */
.tc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.tc-grid > [role='listitem'] { display: flex; }
.tc-grid .tc-card { flex: 1; width: 100%; }
.tc-card {
  pointer-events: auto; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 120px; padding: 12px;
  border-radius: 14px; border: 1px solid var(--line); background: var(--panel-2); color: var(--panel-text); font: inherit;
}
.tc-card:hover { background: var(--panel-3); }
.tc-card.locked { opacity: 0.6; cursor: default; }
.tc-card-name { font-weight: 800; font-size: 16px; }
.tc-stars { color: var(--warn); letter-spacing: 1px; }
.tc-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tc-tag { padding: 1px 8px; border-radius: 999px; background: #0e1925; font-size: 12px; font-weight: 600; }
.tc-tag.climate-cold { color: #bfe9ff; } .tc-tag.climate-hot { color: #ffb37a; } .tc-tag.climate-coastal { color: #7cc4ff; } .tc-tag.climate-temperate { color: #a8e6a1; }
.tc-tag.night { color: #c7b8ff; }
.tc-best { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: 12px; }
.tc-best span { text-align: center; border-radius: 8px; background: #0e1925; padding: 2px; }
.tc-lock { color: var(--muted); font-size: 13px; }
.tc-earlier { font-size: 11px; color: var(--muted); font-style: italic; }
.tc-notice {
  display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border-radius: 12px; border: 1px solid var(--warn);
  background: color-mix(in srgb, var(--warn) 18%, var(--panel));
}
.tc-notice p { margin: 0; font-weight: 600; }

/* Detail sheet: side panel on desktop, bottom sheet on phones */
.tc-sheet-backdrop { position: fixed; inset: 0; pointer-events: auto; background: rgba(6, 12, 20, 0.55); }
.tc-detail {
  position: absolute; pointer-events: auto;
  display: flex; flex-direction: column; gap: 10px;
  overflow-y: auto; overscroll-behavior: contain;
  padding: 16px; background: var(--panel); border: 1px solid var(--line);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}
#ui[data-layout='side'] .tc-detail {
  top: 0; right: 0; bottom: 0; width: min(420px, 100%);
  padding-top: calc(16px + var(--safe-top)); padding-right: calc(16px + var(--safe-right));
  border-radius: 16px 0 0 16px;
}
#ui[data-layout='bottom'] .tc-detail {
  left: 0; right: 0; bottom: 0; max-height: 88%;
  padding-bottom: calc(16px + var(--safe-bottom));
  border-radius: 18px 18px 0 0;
}
.tc-detail h2 { margin: 0; font-size: 20px; flex: 1; }
.tc-detail p { margin: 0; }
.tc-goals { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.tc-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.tc-presets .tc-chip { border-radius: 10px; }

/* HUD flag and objectives panel */
.tc-hud-btn {
  pointer-events: auto; cursor: pointer;
  min-width: var(--touch); min-height: var(--touch);
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 4px 8px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--panel-2); color: var(--panel-text); font: inherit; font-weight: 700;
}
.tc-hud-btn[aria-expanded='true'] { border-color: var(--focus); }
.tc-hud-btn.won { color: var(--ok); } .tc-hud-btn.lost { color: var(--danger); }
.tc-objectives {
  position: absolute; pointer-events: auto; z-index: 2;
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 14px; overflow-y: auto; overscroll-behavior: contain;
  background: var(--panel); border: 1px solid var(--line); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
#ui[data-layout='side'] .tc-objectives { top: calc(var(--hud-bottom) + 10px); right: calc(10px + var(--safe-right)); width: 340px; max-height: calc(100% - var(--hud-bottom) - 20px); border-radius: var(--radius); }
#ui[data-layout='bottom'] .tc-objectives { left: 0; right: 0; bottom: var(--toolbar-space); max-height: 60%; border-radius: 16px 16px 0 0; }
.tc-objectives h2 { margin: 0; font-size: 17px; flex: 1; }
.tc-goal { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
.tc-goal:last-child { border-bottom: 0; }
.tc-goal-text { font-weight: 600; }
.tc-goal.met .tc-goal-text::before { content: '✓ '; color: var(--ok); }
.tc-bar { height: 10px; border-radius: 5px; background: #0e1925; border: 1px solid var(--line); overflow: hidden; }
.tc-bar i { display: block; height: 100%; background: var(--accent-chill); }
.tc-goal.met .tc-bar i { background: var(--ok); }
.tc-goal-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.tc-deadline { font-weight: 700; }

/* Award toasts */
.tc-award-toast {
  position: absolute; pointer-events: auto; z-index: 2;
  left: 50%; transform: translateX(-50%);
  top: calc(var(--hud-bottom) + 56px);
  width: min(440px, calc(100% - 20px));
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: 14px; border: 2px solid var(--accent-chill);
  background: var(--panel); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
.tc-award-toast.negative { border-color: var(--danger); }
.tc-award-toast.positive.spark { border-color: var(--accent-thrill); }
.tc-award-toast strong { display: block; font-size: 15px; }
.tc-award-toast span { display: block; color: var(--muted); font-size: 13px; }
.tc-award-toast.enter { animation: tc-pop 200ms ease-out; }
@keyframes tc-pop { from { transform: translate(-50%, -8px); opacity: 0; } to { transform: translateX(-50%); opacity: 1; } }

/* Park panel: awards */
.tc-award-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.tc-award-list li { display: flex; justify-content: space-between; gap: 8px; }
.tc-award-list li.positive .tc-award-name { color: #a8e6a1; }
.tc-award-list li.negative .tc-award-name { color: #ff9da0; }
.tc-award-list .tc-award-date { color: var(--muted); font-size: 12px; }
.tc-award-history { max-height: 180px; overflow-y: auto; }

/* Tutorial */
.tc-bubble {
  position: absolute; pointer-events: auto; z-index: 2;
  left: 50%; transform: translateX(-50%);
  width: min(540px, calc(100% - 16px));
  display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: start;
  padding: 12px 14px; border-radius: 16px;
  background: color-mix(in srgb, var(--panel) 96%, transparent);
  border: 2px solid var(--accent-chill); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}
.tc-bubble[data-guide='spark'] { border-color: var(--accent-thrill); }
.tc-bubble[data-guide='both'] { border-color: var(--focus); }
.tc-bubble[data-pos='top'] { top: calc(var(--hud-bottom) + 8px); }
#ui[data-layout='side'] .tc-bubble[data-pos='bottom'] { bottom: calc(16px + var(--safe-bottom)); }
#ui[data-layout='bottom'] .tc-bubble[data-pos='bottom'] { bottom: calc(var(--toolbar-space) + 8px); }
.tc-bubble-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tc-bubble-who { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.tc-bubble-title { font-weight: 800; font-size: 16px; }
.tc-bubble-hint { color: var(--panel-text); }
.tc-bubble-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.tc-ring {
  position: absolute; pointer-events: none; z-index: 3;
  border: 3px solid var(--focus); border-radius: 12px;
  box-shadow: 0 0 0 4px rgba(255, 210, 63, 0.3);
  animation: tc-ring 1.2s ease-in-out infinite;
}
@keyframes tc-ring { 50% { box-shadow: 0 0 0 9px rgba(255, 210, 63, 0.12); } }

/* End screen: modal on desktop, full-screen sheet on phones */
.dialog.tc-end { width: min(480px, 100%); display: flex; flex-direction: column; gap: 10px; }
.dialog.tc-end .dialog-title { margin: 0; text-align: center; font-size: 22px; }
.tc-end-reason { margin: 0; text-align: center; color: var(--muted); }
.tc-end-art { display: flex; justify-content: center; }
.tc-facts { margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; }
.tc-facts dt { color: var(--muted); }
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
