/** Phase 3 line icons (24 × 24 inline SVG, original). Owner: W2-B. Decorative: always aria-hidden. */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface IconDef {
  d?: string;
  fill?: string;
  circles?: Array<[number, number, number]>;
}

const ICONS = {
  staff: { d: 'M4 21 C4 16 11 16 11 21 M13 21 C13 16.5 20 16.5 20 21 M5 6.5 H10 M14 7.5 H19', circles: [[7.5, 10, 3], [16.5, 11, 3]] },
  research: { d: 'M9 3.5 H15 M10 3.5 V9.5 L4.5 19 C4 20 4.6 21 5.8 21 H18.2 C19.4 21 20 20 19.5 19 L14 9.5 V3.5 M7.2 15 H16.8' },
  marketing: { d: 'M3.5 10 V14 H7 L15 18.5 V5.5 L7 10 Z M7 14 L8.5 20 H11 L10 14.5 M18 9 C19.3 10.3 19.3 13.7 18 15' },
  messages: { d: 'M3.5 6 H20.5 V18 H3.5 Z M3.5 6.5 L12 13 L20.5 6.5' },
  pathItems: { d: 'M3.5 11 H20.5 M4.5 11 V18 M19.5 11 V18 M3.5 15 H20.5 M5 7.5 H19 M7 7.5 V11 M17 7.5 V11' },
  wrench: { d: 'M14.5 4 A5 5 0 0 0 9.8 10.6 L3.8 16.6 A2 2 0 0 0 6.6 19.4 L12.6 13.4 A5 5 0 0 0 19.4 8.7 L16.3 11.1 L13.4 10.1 L12.6 7.2 Z' },
  coin: { d: 'M12 7.5 V16.5 M14.5 9.3 C13.9 8.6 13.1 8.3 12 8.3 C10.7 8.3 9.7 9 9.7 10 C9.7 12.4 14.3 11.4 14.3 13.9 C14.3 15 13.3 15.7 12 15.7 C10.8 15.7 9.9 15.2 9.4 14.4', circles: [[12, 12, 8.5]] },
  flag: { d: 'M5 21 V3.5 M5 4 H18 L15 8 L18 12 H5' },
  locate: { d: 'M12 2.5 V6 M12 18 V21.5 M2.5 12 H6 M18 12 H21.5', circles: [[12, 12, 6]] },
  bench: { d: 'M3.5 12 H20.5 M5 12 V18 M19 12 V18 M4 8 H20 M6.5 8 V12 M17.5 8 V12' },
  bin: { d: 'M5 6.5 H19 M9.5 6.5 V4 H14.5 V6.5 M6.5 6.5 L7.6 20.5 H16.4 L17.5 6.5 M10 10 V17 M14 10 V17' },
  lamp: { d: 'M12 21 V9 M8.5 21 H15.5 M8 9 H16 L14.5 4.5 H9.5 Z' },
  remove: { d: 'M5 7 H19 M10 7 V4.5 H14 V7 M7 7 L8 20 H16 L17 7 M5 12 L19 12' },
  repair: { d: 'M14.5 4 A5 5 0 0 0 9.8 10.6 L3.8 16.6 A2 2 0 0 0 6.6 19.4 L12.6 13.4 A5 5 0 0 0 19.4 8.7 L16.3 11.1 L13.4 10.1 L12.6 7.2 Z M17 15 V21 M14 18 H20' },
  paint: { d: 'M4 20 C6 20 8 19 8 16.5 C8 15 9.2 14 10.5 14 C12 14 13 15.2 13 16.5 C13 19 9.5 21 4 20 Z M11.5 13 L19.5 4.5 L20.5 5.5 L13 13.8' },
  erase: { d: 'M8 20 H19 M4.5 15.5 L13.5 6.5 L19.5 12.5 L12 20 H8.5 Z M9 11 L15 17' },
  done: { d: 'M5 12.5 L10 17.5 L19.5 6.5' },
  weather_sunny: { d: 'M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M5.3 18.7 L7 17 M17 7 L18.7 5.3', circles: [[12, 12, 4.5]] },
  /** A clear night (After Dark): a crescent moon and a small star. */
  weather_night: { d: 'M19.5 14.5 A8 8 0 1 1 9.5 4.5 A6.5 6.5 0 0 0 19.5 14.5 Z M18 3.5 V7 M16.25 5.25 H19.75' },
  weather_cloudy: { d: 'M6.5 18.5 H17.5 A4 4 0 0 0 17 10.6 A5.5 5.5 0 0 0 6.6 11.7 A3.5 3.5 0 0 0 6.5 18.5 Z' },
  weather_rain: { d: 'M6.5 14.5 H17.5 A3.7 3.7 0 0 0 17 7.2 A5.2 5.2 0 0 0 6.9 8.2 A3.2 3.2 0 0 0 6.5 14.5 Z M8 17 L7 20.5 M12 17 L11 20.5 M16 17 L15 20.5' },
  weather_storm: { d: 'M6.5 13.5 H17.5 A3.7 3.7 0 0 0 17 6.2 A5.2 5.2 0 0 0 6.9 7.2 A3.2 3.2 0 0 0 6.5 13.5 Z M12.5 13.5 L10 17.5 H13.5 L11 21.5' },
  weather_hot: { d: 'M10 14.5 V4.5 A2 2 0 0 1 14 4.5 V14.5 M12 8 V16.5 M17 5 H20 M17 8.5 H19.5', circles: [[12, 17.5, 3.2]] },
  weather_cold: { d: 'M12 2.5 V21.5 M3.8 7.3 L20.2 16.7 M3.8 16.7 L20.2 7.3 M9.5 4 L12 6.5 L14.5 4 M9.5 20 L12 17.5 L14.5 20' },
} satisfies Record<string, IconDef>;

export type MgmtIconName = keyof typeof ICONS;

export function mgmtIcon(name: MgmtIconName, className = 'icon'): SVGSVGElement {
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

/** Swap an icon element in place (weather icon changes). */
export function setMgmtIcon(holder: Element, name: MgmtIconName, className = 'icon'): void {
  const key = `${name}|${className}`;
  if ((holder as HTMLElement).dataset.icon === key) return;
  (holder as HTMLElement).dataset.icon = key;
  holder.replaceChildren(mgmtIcon(name, className));
}
