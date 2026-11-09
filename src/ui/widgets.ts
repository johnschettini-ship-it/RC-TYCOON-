/** Small panel widgets. Owner: W1-B. Browser only. */
import { h, newId, setAttr, setText, toggleClass, type Child } from './dom';
import { icon } from './icons';

export function section(title: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'panel-section' }, title ? h('h3', { class: 'section-title', text: title }) : null, ...children);
}

/** "Label ........ value" row. */
export function statRow(label: string): { el: HTMLElement; set(value: string): void } {
  const value = h('span', { class: 'row-value' });
  const el = h('div', { class: 'row' }, h('span', { class: 'row-label', text: label }), value);
  return { el, set: (v) => setText(value, v) };
}

/** Labelled horizontal bar with a readout (role meter). */
export function meterBar(
  label: string,
  opts: { max: number; format: (v: number) => string; warnAt?: number; tone?: 'thrill' | 'chill' | 'family' | 'neutral' },
): { el: HTMLElement; set(v: number): void } {
  const fill = h('i', { class: 'meter-fill' });
  const readout = h('span', { class: 'meter-value' });
  const bar = h('div', { class: `meter tone-${opts.tone ?? 'neutral'}`, role: 'meter', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': opts.max }, fill);
  const el = h('div', { class: 'meter-row' }, h('span', { class: 'meter-label', text: label }), bar, readout);
  return {
    el,
    set(v: number) {
      const f = Math.max(0, Math.min(1, v / opts.max));
      const w = `${(f * 100).toFixed(1)}%`;
      if (fill.style.width !== w) fill.style.width = w;
      const shown = opts.format(v);
      setText(readout, shown);
      setAttr(bar, 'aria-valuenow', String(v));
      setAttr(bar, 'aria-valuetext', shown);
      toggleClass(bar, 'warn', opts.warnAt !== undefined && v >= opts.warnAt);
    },
  };
}

/**
 * Price slider: the readout follows the thumb; the command is sent on release (change).
 * While the player drags, `set` does not move the thumb; after release it snaps to the real value.
 */
export function priceSlider(
  label: string,
  opts: { max: number; step: number; format: (cents: number) => string; onCommit: (cents: number) => void },
): { el: HTMLElement; set(cents: number): void } {
  const id = newId('price');
  const out = h('output', { class: 'row-value', for: id });
  const input = h('input', { id, type: 'range', min: 0, max: opts.max, step: opts.step, class: 'slider', 'aria-label': label });
  let editing = false;
  input.addEventListener('pointerdown', () => {
    editing = true;
  });
  input.addEventListener('input', () => {
    editing = true;
    const v = Number(input.value);
    setText(out, opts.format(v));
    input.setAttribute('aria-valuetext', opts.format(v));
  });
  input.addEventListener('change', () => {
    editing = false;
    opts.onCommit(Number(input.value));
  });
  input.addEventListener('blur', () => {
    editing = false;
  });
  const el = h('div', { class: 'slider-block' }, h('label', { class: 'row', for: id }, h('span', { class: 'row-label', text: label }), out), input);
  return {
    el,
    set(cents: number) {
      if (editing) return;
      const v = String(cents);
      if (input.value !== v) input.value = v;
      setText(out, opts.format(cents));
      setAttr(input, 'aria-valuetext', opts.format(cents));
    },
  };
}

/** Warning lines with an icon (colour is never the only signal). */
export function warningList(): { el: HTMLElement; set(lines: readonly string[]): void } {
  const el = h('ul', { class: 'warnings', role: 'list' });
  let last = '';
  return {
    el,
    set(lines) {
      const key = lines.join('\n');
      if (key === last) return;
      last = key;
      el.replaceChildren(...lines.map((l) => h('li', { class: 'warning' }, icon('warning'), h('span', { text: l }))));
      el.hidden = lines.length === 0;
    },
  };
}

/** Button whose label and pressed state change. */
export function toggleButton(onClick: () => void): { el: HTMLButtonElement; set(label: string, pressed: boolean): void } {
  const el = h('button', { type: 'button', class: 'btn', onclick: onClick });
  return {
    el,
    set(label, pressed) {
      setText(el, label);
      setAttr(el, 'aria-pressed', pressed ? 'true' : 'false');
    },
  };
}
