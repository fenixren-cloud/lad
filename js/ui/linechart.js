// linechart.js — простой линейный график на SVG: одна ось Y, тонкие линии 2 px, точки 8 px, тихая сетка.
// Вторая линия — пунктиром и с подписью (цвет не единственный признак). У каждой точки — подсказка при
// наведении и касании, рядом — таблица значений (для диктора и для точных чисел).
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v)); for (const c of kids) if (c) e.append(c); return e; };

/**
 * @typedef {{ name: string, points: { x: string, y: number }[], dashed?: boolean }} Series
 * @param {{ label: string, series: Series[], unit?: string, yMin?: number | null, yMax?: number | null, format?: (x: string) => string, zero?: boolean }} o
 */
export function lineChart({ label, series, unit = '', yMin = null, yMax = null, format = x => x, zero = false }) {
  const W = 340, H = 180, L = 40, R = 12, T = 14, B = 26;
  const xs = [...new Set(series.flatMap(se => se.points.map(p => p.x)))].sort();
  const ys = series.flatMap(se => se.points.map(p => p.y));
  let lo = yMin ?? Math.min(...ys), hi = yMax ?? Math.max(...ys);
  if (zero) lo = Math.min(lo, 0);
  if (hi - lo < 4) { hi += 2; lo -= 2; }
  const pad = (hi - lo) * 0.1;
  if (yMin == null) lo -= pad;
  if (yMax == null) hi += pad;
  const step = niceStep((hi - lo) / 4);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const X = i => L + (xs.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (xs.length - 1));
  const Y = v => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
  const tip = h('div', { class: 'chart-tip', hidden: true, role: 'status' });

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  for (const v of ticks) {
    svg.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v === 0 && zero ? 'grid zero' : 'grid' }));
    const t = s('text', { x: L - 6, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }); t.textContent = String(v); svg.append(t);
  }
  const lastI = xs.length - 1;
  for (const i of [0, lastI].filter((v, k, a) => a.indexOf(v) === k && v >= 0)) {
    const t = s('text', { x: X(i), y: H - 6, class: 'tick', 'text-anchor': i === 0 && xs.length > 1 ? 'start' : i === lastI && xs.length > 1 ? 'end' : 'middle' });
    t.textContent = format(xs[i]); svg.append(t);
  }
  series.forEach(se => {
    /** @type {[number, number, { x: string, y: number }][]} */
    const pts = se.points.map(p => [X(xs.indexOf(p.x)), Y(p.y), p]);
    if (pts.length > 1) svg.append(s('polyline', { points: pts.map(([x, y]) => `${x},${y}`).join(' '), class: `line${se.dashed ? ' dashed' : ''}` }));
    for (const [x, y, p] of pts) {
      svg.append(s('circle', { cx: x, cy: y, r: 4, class: `dot${se.dashed ? ' dashed' : ''}` }));
      const hit = s('circle', { cx: x, cy: y, r: 14, class: 'hit', tabindex: '0', 'aria-label': `${format(p.x)}: ${se.name} ${p.y}${unit}` });
      const showTip = () => { tip.textContent = `${format(p.x)} · ${se.name}: ${p.y}${unit}`; tip.hidden = false; };
      hit.addEventListener('pointerenter', showTip);
      hit.addEventListener('focus', showTip);
      hit.addEventListener('click', showTip);
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
      hit.addEventListener('blur', () => { tip.hidden = true; });
      svg.append(hit);
    }
    // подпись прямо у последней точки
    const last = pts[pts.length - 1];
    if (last && series.length > 1) { const t = s('text', { x: Math.min(last[0], W - R - 2), y: last[1] - 8, class: 'tick label', 'text-anchor': 'end' }); t.textContent = se.name; svg.append(t); }
  });
  const legend = series.length > 1 ? h('p', { class: 'chart-legend muted note' }, ...series.map(se => h('span', { class: `key${se.dashed ? ' dashed' : ''}` }, se.name))) : null;
  const table = h('details', { class: 'chart-table' }, h('summary', null, 'Таблица'),
    h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'День'), ...series.map(se => h('th', null, se.name + (unit ? `, ${unit.trim()}` : ''))))),
      h('tbody', null, ...[...xs].reverse().map(x => h('tr', null, h('td', null, format(x)), ...series.map(se => h('td', { class: 'mono' }, String(se.points.find(p => p.x === x)?.y ?? '—'))))))));
  return h('figure', { class: 'chart-wrap' }, legend, h('div', { class: 'chart-box' }, svg, tip), table);
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
