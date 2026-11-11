/** Original line icons drawn as inline SVG (24 × 24). Owner: W1-B. Decorative: always aria-hidden. */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface IconDef {
  /** Stroked paths. */
  d?: string;
  /** Filled paths. */
  fill?: string;
  circles?: Array<[number, number, number]>;
}

const ICONS = {
  footpath: { d: 'M12 3.5 L21 8.5 L12 13.5 L3 8.5 Z M3 13 L12 18 L21 13 M7 10.7 L16 6.3' },
  queue: { d: 'M4 5 H19 V10 H5 V15 H19 V20 H6' },
  demolish: { d: 'M4 20 H20 M6 20 L9 13 L13 16 L15 10 L18 20 M13 4 L19 8 M16 3 L12 9 M9 6 L10.5 7' },
  finance: { d: 'M15 8.6 C14.2 7.5 13.2 7 12 7 C10.3 7 9 8 9 9.4 C9 12.6 15 11.4 15 14.6 C15 16 13.7 17 12 17 C10.6 17 9.5 16.4 8.8 15.4 M12 5 V7 M12 17 V19', circles: [[12, 12, 9.5]] },
  park: { d: 'M5 21 V3.5 M5 4 H18 L15 8 L18 12 H5' },
  menu: { d: 'M4 6 H20 M4 12 H20 M4 18 H20' },
  temperament: { fill: 'M12 3.5 A8.5 8.5 0 0 0 12 20.5 Z', circles: [[12, 12, 8.5]] },
  pause: { fill: 'M6.5 5 H10 V19 H6.5 Z M14 5 H17.5 V19 H14 Z' },
  play: { fill: 'M7 4.5 L19.5 12 L7 19.5 Z' },
  rotate: { d: 'M19.5 12 A7.5 7.5 0 1 1 17 6.4 M19.5 3.5 V8.5 H14.5' },
  check: { d: 'M5 12.5 L10 17.5 L19.5 6.5' },
  cross: { d: 'M6 6 L18 18 M18 6 L6 18' },
  guests: { d: 'M5 21 C5 15.5 19 15.5 19 21', circles: [[12, 8, 4]] },
  star: { d: 'M12 3.5 L14.6 9 L20.5 9.6 L16 13.5 L17.3 19.4 L12 16.3 L6.7 19.4 L8 13.5 L3.5 9.6 L9.4 9 Z' },
  warning: { d: 'M12 3.5 L21.5 20 H2.5 Z M12 10 V14.5 M12 17 V17.6' },
  follow: { d: 'M12 2.5 V6 M12 18 V21.5 M2.5 12 H6 M18 12 H21.5', circles: [[12, 12, 6], [12, 12, 1.5]] },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const def: IconDef = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  for (const [cx, cy, r] of def.circles ?? []) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', 'currentColor');
    c.setAttribute('stroke-width', '2');
    svg.append(c);
  }
  if (def.d) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', def.d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  if (def.fill) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', def.fill);
    p.setAttribute('fill', 'currentColor');
    svg.append(p);
  }
  return svg;
}
