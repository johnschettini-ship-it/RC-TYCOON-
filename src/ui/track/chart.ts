/** Test tab line chart (phase-2 §7.4): speed, vertical G, lateral G over ride time. Owner: W2-A. Browser only. */
import { text } from '../../data/strings/en';
import type { TestResult } from '../../sim/rides/track/types';
import { h } from '../dom';
import { chartGeometry, type ChartSeries } from './testFormat';

const W = 320;
const H = 170;
const SVG_NS = 'http://www.w3.org/2000/svg';

function legendSwatch(s: ChartSeries): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 28 8');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '8');
  svg.setAttribute('aria-hidden', 'true');
  const l = document.createElementNS(SVG_NS, 'line');
  l.setAttribute('x1', '1');
  l.setAttribute('y1', '4');
  l.setAttribute('x2', '27');
  l.setAttribute('y2', '4');
  l.setAttribute('stroke', s.colour);
  l.setAttribute('stroke-width', '2.5');
  if (s.dash.length) l.setAttribute('stroke-dasharray', s.dash.join(' '));
  svg.append(l);
  return svg;
}

export function createTestChart(): { el: HTMLElement; set(test: TestResult | null): void } {
  const canvas = h('canvas', { class: 'track-chart', role: 'img', 'aria-label': text('ui.track.chart.label'), 'data-testid': 'track-chart' });
  const legend = h('ul', { class: 'chart-legend', role: 'list' });
  const el = h('figure', { class: 'chart-wrap' }, canvas, legend);
  let last: TestResult | null | undefined;

  const draw = (test: TestResult): void => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const g = chartGeometry(test.chart, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { x, y, w, h: bh } = g.box;
    ctx.fillStyle = '#0e1925';
    ctx.fillRect(x, y, w, bh);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#a9bccd';
    ctx.strokeStyle = 'rgba(169,188,205,0.25)';
    ctx.lineWidth = 1;
    // Speed axis on the left, G axis on the right.
    for (let i = 0; i <= 4; i++) {
      const yy = y + bh - (i / 4) * bh;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round((g.speedMax * i) / 4)), x - 4, yy + 3);
      ctx.textAlign = 'left';
      ctx.fillText((g.gMin + ((g.gMax - g.gMin) * i) / 4).toFixed(1), x + w + 4, yy + 3);
    }
    ctx.textAlign = 'center';
    ctx.fillText(`${text('ui.track.chart.time')}: 0–${g.seconds.toFixed(0)}`, x + w / 2, H - 4);
    ctx.textAlign = 'left';
    for (const s of g.series) {
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i += 2) {
        if (i === 0) ctx.moveTo(s.points[i] as number, s.points[i + 1] as number);
        else ctx.lineTo(s.points[i] as number, s.points[i + 1] as number);
      }
      ctx.setLineDash(s.dash as number[]);
      ctx.strokeStyle = s.colour;
      ctx.lineWidth = s.key === 'speed' ? 2 : 1.6;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.setLineDash([]);
    legend.replaceChildren(...g.series.map((s) => h('li', { class: 'legend-item' }, legendSwatch(s), h('span', { text: s.label }))));
  };

  return {
    el,
    set(test) {
      if (test === last) return;
      last = test;
      el.hidden = !test || !test.passed || test.chart.speedCms.length < 2;
      if (test && !el.hidden) draw(test);
    },
  };
}
