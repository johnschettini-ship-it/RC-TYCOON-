/**
 * Stage 1 benchmark page parts (`?art=real&bench=1`, or `?art=classic&bench=1` for today's look): the "Run benchmark" button, the progress line, and the
 * results card. `main.ts` imports this module lazily, and only in the VITE_ART=real build, so the website build has
 * none of it; the four benchmark saves are lazy chunks of this module, loaded when Run is tapped (never through
 * storage).
 *
 * Before the run, every compressed art file is read into the set manager (progress shown, time reported as the art
 * download), so nothing downloads while anything is measured (spec §5.4 item 1, as in the app).
 *
 * The card is made for a 390 px wide phone: one short table per park, stacked. **Copy results** writes the text
 * and the JSON with `navigator.clipboard.writeText` inside the click handler; where that fails or is missing, the
 * text appears selected in a box (and `execCommand('copy')` is tried), as the phone test did.
 */
import { text } from '../data/strings';
import type { Game } from '../game';
import type { RealOptions } from '../render/renderer';
import type { SetManager } from '../render/real/setManager';
import { FLAT_RIDES } from '../data/catalog/flatRides';
import { aliasItemMap } from '../render/real/aliases';
import { PERF_SCENES, SCALE_SCENE, type PerfSceneId } from '../../tests/perf/sceneInfo';
import { spriteMemory } from '../render/spriteCache';
import { BENCH_PHASES, resultsText, runRealBench, type Band, type BenchScene, type RealBenchResult } from './realBench';

/** The saves, as text. Literal paths, so the bundler makes one lazy chunk each. */
const SAVES: Record<PerfSceneId | 'scale', () => Promise<{ default: string }>> = {
  scale: () => import('../../tests/perf/scale-18-rides-5000-scenery-3000-guests.tcsave.json?raw'),
  build1: () => import('../../tests/perf/build1-2000-guests.tcsave.json?raw'),
  build2: () => import('../../tests/perf/build2-128-3000-guests.tcsave.json?raw'),
  phone: () => import('../../tests/perf/phone-800-guests.tcsave.json?raw'),
  coaster: () => import('../../tests/perf/coaster-600-guests.tcsave.json?raw'),
};

const CSS = `
.rb-run{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2000;font:600 16px system-ui,sans-serif;padding:12px 20px;border-radius:10px;border:0;background:#1f6feb;color:#fff;min-height:44px}
.rb-run:disabled{background:#555}
.rb-status{position:fixed;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:2000;font:14px system-ui,sans-serif;background:rgba(0,0,0,.75);color:#fff;padding:6px 10px;border-radius:8px;text-align:center}
.rb-card{position:fixed;inset:0;z-index:2001;background:rgba(20,24,40,.5);overflow:auto;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box}
.rb-box{box-sizing:border-box;max-width:560px;margin:0 auto;background:#fff;color:#111;border-radius:12px;padding:14px;font:14px/1.35 system-ui,sans-serif}
.rb-box h2{font-size:18px;margin:0 0 6px}
.rb-box h3{font-size:15px;margin:12px 0 4px}
.rb-box table{width:100%;border-collapse:collapse;table-layout:fixed}
.rb-box td{padding:3px 4px;border-top:1px solid #ddd;vertical-align:top;overflow-wrap:anywhere}
.rb-box td.v{text-align:right;font-variant-numeric:tabular-nums}
.rb-box td.b{width:3.6em;text-align:center;font-weight:700}
.rb-pass{color:#116329}.rb-fail{color:#b42318}.rb-na{color:#666}
.rb-verdict{font-weight:700;font-size:16px;margin:0 0 6px}
.rb-note{color:#555;font-size:12px}
.rb-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.rb-actions button{flex:1 1 140px;min-height:44px;font:600 15px system-ui,sans-serif;border-radius:8px;border:1px solid #888;background:#f4f4f4;color:#111}
.rb-text{display:none;box-sizing:border-box;width:100%;height:160px;margin-top:8px;font:12px monospace}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, txt?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function bandCell(b: Band | null): HTMLTableCellElement {
  const v = b?.band ?? 'n/a';
  const key = v === 'n/a' ? 'na' : v;
  const td = el('td', `b rb-${key}`, b ? text(`ui.realBench.band.${key}`) : '');
  if (b) td.dataset.band = v;
  return td;
}

function row(label: string, value: string, b: Band | null = null, id?: string): HTMLTableRowElement {
  const tr = el('tr');
  tr.append(el('td', '', label), el('td', 'v', value), bandCell(b));
  if (id) tr.dataset.check = id;
  return tr;
}

/** The results card (also used by the e2e smoke through its test ids). */
export function resultsCard(r: RealBenchResult, onClose: () => void): HTMLElement {
  const card = el('div', 'rb-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'rb-title');
  card.dataset.testid = 'real-bench-card';
  const box = el('div', 'rb-box');
  const h = el('h2', '', text('ui.realBench.title'));
  h.id = 'rb-title';
  const verdict = el('p', `rb-verdict rb-${r.verdict}`, text(`ui.realBench.verdict.${r.verdict}`));
  verdict.dataset.verdict = r.verdict;
  box.append(h, verdict);

  const top = el('table');
  const first = r.scenes.find((s) => s.error === undefined);
  const look = row(text('ui.realBench.look'), text(`ui.realBench.look.${r.look}`));
  look.dataset.look = r.look;
  top.append(
    look,
    row(text('ui.realBench.start'), r.startMs === null ? text('ui.realBench.band.na') : text('ui.realBench.ms', { n: r.startMs }), first?.bands.S4 ?? null, 'S4'),
    row(text('ui.realBench.device'), text('ui.realBench.deviceValue', {
        dpr: r.device.devicePixelRatio,
        w: r.device.canvasPx[0],
        h: r.device.canvasPx[1],
        cssW: r.device.viewportCss[0],
        cssH: r.device.viewportCss[1],
      })),
    row(text('ui.realBench.download'), r.artDownload ? text('ui.realBench.downloadValue', { mb: r.artDownload.MB, files: r.artDownload.files, ms: r.artDownload.ms }) : text('ui.realBench.band.na')),
    row(text('ui.realBench.boot'), r.bootCompleteMs === null ? text('ui.realBench.band.na') : text('ui.realBench.ms', { n: r.bootCompleteMs })),
    row(text('ui.realBench.fallbacks'), r.fallbacksUsed.join(', ') || text('ui.realBench.none')),
  );
  box.append(top);

  for (const s of r.scenes) {
    box.append(el('h3', '', s.id));
    const t = el('table');
    t.dataset.scene = s.id;
    if (s.error !== undefined) {
      t.append(row(text('ui.realBench.notLoaded', { error: s.error }), ''));
    } else {
      const b = s.bands;
      t.append(
        row(text('ui.realBench.frame'), `${s.frameP50} / ${s.frameP95} / ${s.frameP99}`, b.S1, 'S1'),
        row(text('ui.realBench.slowFrames'), `${s.framesOver33} / ${s.frames}`),
        row(text('ui.realBench.longestGap'), `${s.longestGapMs}`, b.S6g, 'S6g'),
        ...BENCH_PHASES.map((p) => row(text(`ui.realBench.phase.${p}`), text('ui.realBench.phaseValue', { p95: s.phases[p].p95, pct: s.phases[p].over33Pct, n: s.phases[p].frames }))),
        row(text('ui.realBench.hiddenGaps'), `${s.droppedHiddenGaps}`),
        row(text('ui.realBench.work'), `${s.workP95}`),
        row(text('ui.realBench.memory'), `${s.peakMB} / ${s.endMB}`, b.S2, 'S2'),
        row(text('ui.realBench.split'), s.peakSplitMB ? text('ui.realBench.splitValue', { ...s.peakSplitMB }) : text('ui.realBench.band.na')),
        row(text('ui.realBench.other'), s.otherMB ? text('ui.realBench.otherValue', { ...s.otherMB }) : text('ui.realBench.band.na')),
        row(text('ui.realBench.allPeak'), s.allPeakMB === null ? text('ui.realBench.band.na') : `${s.allPeakMB}`),
        row(text('ui.realBench.density'), s.densities.join(' / ') || text('ui.realBench.band.na')),
        row(text('ui.realBench.turns'), s.turns.map((x) => text(x.dir === 1 ? 'ui.realBench.turnCw' : 'ui.realBench.turnCcw', { ms: x.ms })).join(' '), b.S3, 'S3'),
        row(text('ui.realBench.sharpen'), s.turns.map((x) => text(x.dir === 1 ? 'ui.realBench.turnCw' : 'ui.realBench.turnCcw', { ms: x.sharpenMs ?? text('ui.realBench.band.na') })).join(' ')),
        row(text('ui.realBench.placement'), `${s.placementLongestFrameMs} (${s.placements})`),
        row(text('ui.realBench.incomplete'), `${s.incompleteFrames}`),
        row(text('ui.realBench.degraded'), text('ui.realBench.degradedValue', { frames: s.degradedFrames, most: s.degradedMax })),
        row(text('ui.realBench.caps'), `${s.capEvents}`),
        row(text('ui.realBench.cappedAtStart'), text(s.cappedAtStart ? 'ui.realBench.yes' : 'ui.realBench.no')),
        row(text('ui.realBench.stalls'), s.stalls.map((x) => x.at).join(', ') || text('ui.realBench.none')),
        row(text('ui.realBench.fallbacks'), s.fallbacksUsed.join(', ') || text('ui.realBench.none')),
      );
    }
    box.append(t);
  }
  box.append(el('p', 'rb-note', text('ui.realBench.note')));

  const area = el('textarea', 'rb-text');
  area.readOnly = true;
  area.setAttribute('aria-label', text('ui.realBench.textLabel'));
  const copy = el('button', '', text('ui.realBench.copy'));
  copy.type = 'button';
  copy.dataset.testid = 'real-bench-copy';
  copy.addEventListener('click', () => {
    const all = resultsText(r);
    const fallback = (): void => {
      area.value = all;
      area.style.display = 'block';
      area.focus();
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      copy.textContent = ok ? text('ui.realBench.copied') : text('ui.realBench.selectText');
    };
    // Inside the click handler: the clipboard needs the tap's user activation.
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clip && typeof clip.writeText === 'function') {
      clip.writeText(all).then(() => {
        copy.textContent = text('ui.realBench.copied');
      }, fallback);
    } else fallback();
  });
  const close = el('button', '', text('ui.realBench.close'));
  close.type = 'button';
  close.addEventListener('click', onClose);
  const actions = el('div', 'rb-actions');
  actions.append(copy, close);
  box.append(actions, area);
  card.append(box);
  return card;
}

/** The bench's runs: `?bench=1` (the four parks and the scale park), `quick` (the same, every step a tenth as long: the e2e smoke), `scale` (the scale park only). */
export type BenchMode = 'full' | 'quick' | 'scale';

/**
 * Show the Run button. `boot()` gives the navigation start to the boot's first drawn frame (S4's first part) and to
 * its first complete frame (information), each undefined until it came.
 */
export function mountRealBench(game: Game, real: RealOptions | undefined, boot: () => { firstFrameMs?: number; completeMs?: number }, mode: BenchMode = 'full'): void {
  const quick = mode === 'quick';
  const style = el('style', '', CSS);
  document.head.append(style);
  const run = el('button', 'rb-run', text('ui.realBench.run'));
  run.type = 'button';
  run.dataset.testid = 'real-bench-run';
  const status = el('div', 'rb-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  document.body.append(run, status);

  run.addEventListener('click', () => {
    run.disabled = true;
    run.hidden = true;
    status.hidden = false;
    status.textContent = text('ui.realBench.loading');
    // The park itself is measured, so the title screen steps aside visually; it stays open underneath (no autosave).
    const title = document.querySelector<HTMLElement>('.title-screen');
    const titleWasHidden = title?.hidden ?? true;
    if (title) title.hidden = true;
    const restore = (): void => {
      if (title) title.hidden = titleWasHidden;
    };
    void (async () => {
      try {
        // The scale park (round 3 item 7) draws each flat ride type from its own alias sets (added by the realistic
        // boot when the page has `?bench=`), so 18 types decode and count as 18 baked types would.
        const scale = { id: SCALE_SCENE.id, focus: SCALE_SCENE.focus, itemMap: aliasItemMap(FLAT_RIDES.map((d) => d.id)) };
        const list = mode === 'scale' ? [scale] : [...PERF_SCENES.map((s) => ({ id: s.id, focus: s.focus })), scale];
        const scenes: BenchScene[] = await Promise.all(list.map(async (s) => ({ ...s, json: (await SAVES[s.id]()).default })));
        const sets = real?.sets && 'capEvents' in real.sets ? (real.sets as unknown as SetManager) : null;
        // All compressed art local first: nothing downloads while anything is measured.
        let artDownload: { ms: number; bytes: number; files: number } | undefined;
        if (sets) {
          const t0 = performance.now();
          const got = await sets.preloadAll((n, total) => {
            status.textContent = text('ui.realBench.downloading', { n, total });
          });
          artDownload = { ms: performance.now() - t0, bytes: got.bytes, files: got.files };
        }
        const b = boot();
        const result = await runRealBench(game, scenes, () => performance.now(), {
          look: real?.look ?? null,
          ground: real?.ground ?? null,
          sets,
          setItemMap: real?.look?.setItemMap,
          artDownload,
          bootCompleteMs: b.completeMs,
          appReadyMs: b.firstFrameMs,
          // Picture memory outside the decode budget, for either look: today's terrain and static layer, today's
          // sprite caches (labels from `spriteMemory`), and the compressed art kept once read.
          otherMemory: () => {
            const m = spriteMemory.breakdown();
            return { terrain: m.chunks ?? 0, staticLayer: m.static ?? 0, sprites: (m.sprites ?? 0) + (m.other ?? 0), blobs: sets?.blobBytes() ?? 0 };
          },
          timeScale: quick ? 0.1 : 1,
          onScene: (id, i, total) => {
            status.textContent = text('ui.realBench.running', { scene: id, n: i + 1, total });
          },
        });
        status.hidden = true;
        const card = resultsCard(result, () => {
          card.remove();
          restore();
          run.hidden = false;
          run.disabled = false;
        });
        document.body.append(card);
        (window as unknown as { __tcBench?: RealBenchResult }).__tcBench = result;
      } catch (err) {
        restore();
        status.textContent = text('ui.realBench.failed', { error: err instanceof Error ? err.message : String(err) });
        run.hidden = false;
        run.disabled = false;
      }
    })();
  });
}
