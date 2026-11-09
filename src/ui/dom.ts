/** Tiny DOM builder. Owner: W1-B. Browser only. */

type AttrValue = string | number | boolean | null | undefined;
export type Attrs = Record<string, AttrValue | ((ev: Event) => void)>;
export type Child = Node | string | null | undefined | false;

/** Create an element. `class` sets className, `text` sets textContent, `on<event>` adds a listener. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      if (v) el.className = String(v);
    } else if (k === 'text') {
      if (v !== null && v !== undefined) el.textContent = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else if (v !== false && v !== null && v !== undefined) {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Set text only when it changed (avoids layout work every frame). */
export function setText(el: Element, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

export function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

export function toggleClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

let uid = 0;
/** Unique element id for label/aria wiring. */
export function newId(prefix: string): string {
  uid += 1;
  return `tc-${prefix}-${uid}`;
}

/**
 * Modal counter on <body>. While any title screen or dialog is open, `data-tc-modal` is set,
 * and the keyboard shortcuts in `src/input` stay quiet.
 */
export function pushModal(): void {
  const n = Number(document.body.dataset.tcModal ?? '0') + 1;
  document.body.dataset.tcModal = String(n);
}

export function popModal(): void {
  const n = Number(document.body.dataset.tcModal ?? '0') - 1;
  if (n > 0) document.body.dataset.tcModal = String(n);
  else delete document.body.dataset.tcModal;
}
