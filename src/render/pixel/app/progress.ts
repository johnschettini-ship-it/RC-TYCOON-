/** Phase 8b stage 0b test (never merged): the start progress line over the canvas (Test decision 10) and the decode error notice. */

// Fix round 1 (B8): the two strings live in the app chunk, not in the website's string table (English only in 0b).
const PROGRESS_LABEL = 'Loading the park pictures';
const DECODE_ERROR = 'Some park pictures could not be loaded';

export interface ProgressLine {
  /** Show `decoded / queued` while `show`; hide otherwise. */
  update(decoded: number, queued: number, show: boolean): void;
  /** A sheet could not be decoded: a polite notice (once). */
  error(): void;
}

/** A `role="progressbar"` line at the top of the page and a polite live region (both outside the canvas). */
export function createProgressLine(doc: Document): ProgressLine {
  const bar = doc.createElement('div');
  bar.id = 'art-progress';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', PROGRESS_LABEL);
  bar.setAttribute('aria-valuemin', '0');
  bar.style.cssText =
    'position:fixed;left:0;right:0;top:0;height:6px;background:rgba(0,0,0,0.45);z-index:50;pointer-events:none;display:none';
  const fill = doc.createElement('div');
  fill.style.cssText = 'height:100%;width:0;background:#ffe066';
  bar.appendChild(fill);
  const note = doc.createElement('div');
  note.setAttribute('aria-live', 'polite');
  note.style.cssText = 'position:fixed;left:8px;top:10px;z-index:50;color:#fff;background:rgba(0,0,0,0.6);padding:2px 6px;font:12px sans-serif;pointer-events:none';
  doc.body.appendChild(bar);
  doc.body.appendChild(note);
  let shown = false;
  let lastNow = -1;
  let lastMax = -1;
  let errored = false;
  return {
    update(decoded, queued, show) {
      if (show !== shown) {
        bar.style.display = show ? 'block' : 'none';
        shown = show;
      }
      if (!show || (decoded === lastNow && queued === lastMax)) return;
      lastNow = decoded;
      lastMax = queued;
      bar.setAttribute('aria-valuenow', String(decoded));
      bar.setAttribute('aria-valuemax', String(Math.max(1, queued)));
      fill.style.width = `${queued > 0 ? Math.round((100 * decoded) / queued) : 0}%`;
    },
    error() {
      if (errored) return;
      errored = true;
      note.textContent = DECODE_ERROR;
    },
  };
}
