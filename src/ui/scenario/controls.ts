/** Small controls for the scenario front end: single-choice chip groups. Owner: W3-I. Browser only. */
import { h, newId, setAttr } from '../dom';

export interface ChipOption<T> {
  value: T;
  label: string;
  testId?: string;
}

/**
 * A labelled radio group of 44 px chips. Arrow keys move the choice (roving tab stop), like native radios.
 */
export function chipGroup<T>(label: string, options: readonly ChipOption<T>[], initial: T, onChange: (v: T) => void, testId?: string): { el: HTMLElement; value(): T; set(v: T): void } {
  let current = initial;
  const labelId = newId('chips');
  const chips = options.map((o) =>
    h('button', { type: 'button', class: 'tc-chip', role: 'radio', 'aria-checked': 'false', 'data-testid': o.testId, text: o.label, onclick: () => choose(o.value, true) }),
  );
  const group = h('div', { class: 'tc-chips', role: 'radiogroup', 'aria-labelledby': labelId, 'data-testid': testId }, ...chips);
  group.addEventListener('keydown', (e) => {
    const i = options.findIndex((o) => o.value === current);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || i < 0) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length] as ChipOption<T>;
    choose(next.value, true);
    chips[options.indexOf(next)]?.focus();
  });
  const el = h('div', { class: 'tc-field' }, h('span', { id: labelId, class: 'field-label', text: label }), group);
  function render(): void {
    options.forEach((o, i) => {
      const on = o.value === current;
      const chip = chips[i] as HTMLButtonElement;
      setAttr(chip, 'aria-checked', on ? 'true' : 'false');
      chip.tabIndex = on ? 0 : -1;
    });
  }
  function choose(v: T, notify: boolean): void {
    current = v;
    render();
    if (notify) onChange(v);
  }
  render();
  return { el, value: () => current, set: (v) => choose(v, false) };
}
