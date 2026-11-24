// fretboard.js — гриф: горизонтальный или вертикальный, окно ладов, метки ладов, подписи струн,
// цветные значки ступеней (всегда с подписью), линейки, нажатие на место грифа (ввод риффа).
// Значки — с ключом «струна:лад»: при смене аппликатуры они плавно переезжают и проявляются, а не мигают.
import { h } from './dom.js';
import { mod12, noteName, spellPc } from '../core/notes.js';

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE = [12];

/**
 * @typedef {{ string: number, fret: number, label: string, role: 'root' | 'third' | 'fifth' | 'seventh' | 'char' | 'other', dim?: boolean, ring?: boolean, cls?: string }} Marker
 * @typedef {{ string: number, from: number, to: number, long?: boolean }} RulerMark
 */

/**
 * @param {{ tuning: number[], from?: number, to?: number, orientation?: 'horizontal' | 'vertical',
 *   interactive?: boolean, german?: boolean, onTap?: (string: number, fret: number) => void, label?: string }} o
 */
export function createFretboard(o) {
  let cfg = { from: 0, to: 12, orientation: 'horizontal', interactive: false, german: false, ...o };
  const wrap = h('div', { class: 'fb-wrap' });
  const svg = h('svg:svg', { class: 'fb', role: o.interactive ? 'group' : 'img', 'aria-label': o.label || 'Гриф' });
  const neck = h('svg:g', { class: 'fb-neck' });
  const rulersG = h('svg:g', { class: 'fb-rulers' });
  const linksG = h('svg:g', { class: 'fb-links' });
  const marksG = h('svg:g', { class: 'fb-marks' });
  const cursorG = h('svg:g', { class: 'fb-cursor' });
  const hitsG = h('svg:g', { class: 'fb-hits' });
  svg.append(neck, rulersG, linksG, marksG, cursorG, hitsG);
  wrap.append(svg);
  /** @type {Map<string, SVGGElement>} */
  const marks = new Map();
  let geo = null;

  function layout() {
    const { from, to, orientation, interactive } = cfg;
    const frets = to - from + 1; // ячеек с учётом from
    const gap = interactive ? 46 : 32, cell = interactive ? 60 : 54, nut = from === 0 ? 38 : 0, lead = 26, tail = 24;
    const across = gap * 5, along = nut + (to - Math.max(from, 1) + 1) * cell;
    const vertical = orientation === 'vertical';
    const W = vertical ? across + lead * 2 + 8 : lead + along + 12;
    const H = vertical ? lead + along + 12 : across + 44 + tail;
    // позиция по струне s (0 = 6-я) и по ладу f (центр ячейки)
    const sPos = s => (vertical ? lead + 4 + s * gap : 22 + (5 - s) * gap); // горизонтально: 1-я струна сверху
    const fPos = f => (f === 0 ? (vertical ? lead : lead) + nut / 2 : (vertical ? lead : lead) + nut + (f - Math.max(from, 1) + 0.5) * cell);
    const wire = f => (vertical ? lead : lead) + nut + (f - Math.max(from, 1) + 1) * cell; // правая проволока лада f
    geo = { vertical, W, H, sPos, fPos, wire, gap, cell, nut, lead, from, to, frets };
    return geo;
  }
  const xy = (s, f) => (geo.vertical ? [geo.sPos(s), geo.fPos(f)] : [geo.fPos(f), geo.sPos(s)]);

  function drawNeck() {
    const g = layout();
    svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    svg.setAttribute('width', String(g.W));
    svg.setAttribute('height', String(g.H));
    const lo = Math.max(cfg.from, 1), [s0, s5] = [g.sPos(0), g.sPos(5)];
    const first = g.lead + (cfg.from === 0 ? g.nut : 0), last = g.wire(cfg.to);
    const line = (a1, b1, a2, b2, cls, w) => {
      const [x1, y1, x2, y2] = g.vertical ? [b1, a1, b2, a2] : [a1, b1, a2, b2];
      return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`;
    };
    const lowS = Math.min(s0, s5) - 12, highS = Math.max(s0, s5) + 12;
    let s = g.vertical
      ? `<rect class="fb-board" x="${lowS}" y="${first - (cfg.from === 0 ? 0 : 6)}" width="${highS - lowS}" height="${last - first + (cfg.from === 0 ? 0 : 6)}" rx="8"/>`
      : `<rect class="fb-board" x="${first - (cfg.from === 0 ? 0 : 6)}" y="${lowS}" width="${last - first + (cfg.from === 0 ? 0 : 6)}" height="${highS - lowS}" rx="8"/>`;
    for (let f = lo; f <= cfg.to; f++) {
      const mid = (g.sPos(2) + g.sPos(3)) / 2, c = g.fPos(f);
      if (INLAYS.includes(f)) s += g.vertical ? `<circle class="fb-inlay" cx="${mid}" cy="${c}" r="5"/>` : `<circle class="fb-inlay" cx="${c}" cy="${mid}" r="5"/>`;
      if (DOUBLE.includes(f)) for (const k of [g.sPos(1) / 2 + g.sPos(2) / 2, g.sPos(3) / 2 + g.sPos(4) / 2]) s += g.vertical ? `<circle class="fb-inlay" cx="${k}" cy="${c}" r="5"/>` : `<circle class="fb-inlay" cx="${c}" cy="${k}" r="5"/>`;
    }
    if (cfg.from === 0) s += line(g.lead + g.nut - 2, lowS + 4, g.lead + g.nut - 2, highS - 4, 'fb-nut', 5);
    for (let f = lo; f <= cfg.to; f++) s += line(g.wire(f), lowS + 4, g.wire(f), highS - 4, 'fb-fret', 2);
    for (let st = 0; st < 6; st++) {
      s += line(g.lead + (cfg.from === 0 ? 4 : -6), g.sPos(st), last, g.sPos(st), 'fb-string', [2.2, 1.9, 1.6, 1.3, 1, 0.8][st]);
      const name = noteName(spellPc(mod12(cfg.tuning[st])), { german: cfg.german });
      const [x, y] = g.vertical ? [g.sPos(st), 14] : [10, g.sPos(st) + 4];
      s += `<text class="fb-sname" x="${x}" y="${y}" text-anchor="middle">${st === 5 ? name.toLowerCase() : name}</text>`;
    }
    for (let f = cfg.from; f <= cfg.to; f++) {
      const c = g.fPos(f);
      const [x, y] = g.vertical ? [g.W - 12, c + 4] : [c, g.H - 6];
      s += `<text class="fb-fnum${[3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f) ? ' on' : ''}" x="${x}" y="${y}" text-anchor="middle">${f}</text>`;
    }
    neck.innerHTML = s;
    // зоны нажатия — на всю ячейку (не меньше 44 px)
    hitsG.replaceChildren();
    if (cfg.interactive) {
      for (let st = 0; st < 6; st++) for (let f = cfg.from; f <= cfg.to; f++) {
        const [cx, cy] = xy(st, f), w = f === 0 && cfg.from === 0 ? g.nut : g.cell;
        const [rw, rh] = g.vertical ? [g.gap, w] : [w, g.gap];
        const r = h('svg:rect', { class: 'fb-hit', x: cx - rw / 2, y: cy - rh / 2, width: rw, height: rh, tabindex: '0', role: 'button',
          'aria-label': `${6 - st}-я струна, ${f === 0 ? 'открытая' : f + '-й лад'}`, dataset: { string: String(st), fret: String(f) } });
        r.addEventListener('click', () => cfg.onTap?.(st, f));
        r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cfg.onTap?.(st, f); } });
        hitsG.append(r);
      }
    }
    for (const m of marks.values()) m.remove();
    marks.clear();
    cursorG.replaceChildren();
  }

  /**
   * Обновить значки и линейки. Окно ладов и ориентация меняются тоже здесь (тогда гриф перерисовывается).
   * links — линии между местами грифа с подписью (интервал, «+5»).
   * @param {{ markers?: Marker[], rulers?: RulerMark[], links?: { from: [number, number], to: [number, number], label?: string }[],
   *   from?: number, to?: number, orientation?: 'horizontal' | 'vertical', tuning?: number[], german?: boolean }} next
   */
  function update(next) {
    const geomKeys = ['from', 'to', 'orientation', 'tuning', 'german'];
    if (geomKeys.some(k => k in next && JSON.stringify(next[k]) !== JSON.stringify(cfg[k]))) {
      cfg = { ...cfg, ...next };
      drawNeck();
    }
    const list = (next.markers || []).filter(m => m.fret >= cfg.from && m.fret <= cfg.to);
    const keep = new Set();
    for (const m of list) {
      const key = `${m.string}:${m.fret}`;
      keep.add(key);
      let g = marks.get(key);
      const [x, y] = xy(m.string, m.fret);
      if (!g) {
        g = /** @type {SVGGElement} */ (/** @type {unknown} */ (h('svg:g', { class: 'fb-mark enter', transform: `translate(${x} ${y})` }, h('svg:circle', { r: geo.gap > 40 ? 15 : 13 }), h('svg:text', { 'text-anchor': 'middle', y: 4.5 }))));
        marksG.append(g);
        requestAnimationFrame(() => g.classList.remove('enter'));
        marks.set(key, g);
      }
      g.setAttribute('class', `fb-mark role-${m.role}${m.dim ? ' dim' : ''}${m.ring ? ' ring' : ''}${m.cls ? ' ' + m.cls : ''}`);
      g.setAttribute('transform', `translate(${x} ${y})`);
      g.querySelector('text').textContent = m.label;
      g.setAttribute('aria-label', `${6 - m.string}-я струна, ${m.fret}-й лад: ${m.label}`);
    }
    for (const [key, g] of marks) if (!keep.has(key)) { marks.delete(key); g.classList.add('leave'); setTimeout(() => g.remove(), 220); }
    const inView = ([s, f]) => s >= 0 && s <= 5 && f >= cfg.from && f <= cfg.to;
    linksG.replaceChildren(...(next.links || []).filter(l => inView(l.from) && inView(l.to)).map(l => {
      const [x1, y1] = xy(l.from[0], l.from[1]), [x2, y2] = xy(l.to[0], l.to[1]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      return h('svg:g', { class: 'fb-link' },
        h('svg:line', { x1, y1, x2, y2 }),
        l.label ? h('svg:g', { transform: `translate(${mx} ${my})` }, h('svg:rect', { x: -15, y: -10, width: 30, height: 20, rx: 10 }), h('svg:text', { 'text-anchor': 'middle', y: 4 }, l.label)) : null);
    }));
    rulersG.replaceChildren(...(next.rulers || []).map(r => {
      const [x1, y1] = xy(r.string, r.from), [x2, y2] = xy(r.string, r.to);
      const pad = 16, t = geo.gap > 40 ? 30 : 26;
      return geo.vertical
        ? h('svg:rect', { class: `fb-ruler${r.long ? ' long' : ''}`, x: x1 - t / 2, y: Math.min(y1, y2) - pad, width: t, height: Math.abs(y2 - y1) + pad * 2, rx: t / 2 })
        : h('svg:rect', { class: `fb-ruler${r.long ? ' long' : ''}`, x: Math.min(x1, x2) - pad, y: y1 - t / 2, width: Math.abs(x2 - x1) + pad * 2, height: t, rx: t / 2 });
    }));
  }

  /** Прокрутить к нужному месту грифа (на узком экране гриф шире окна) */
  function scrollTo(fret) {
    const [x, y] = xy(0, Math.max(cfg.from, Math.min(cfg.to, fret)));
    if (geo.vertical) wrap.scrollTo({ top: Math.max(0, y - wrap.clientHeight / 2), behavior: 'smooth' });
    else wrap.scrollTo({ left: Math.max(0, x - wrap.clientWidth / 2), behavior: 'smooth' });
  }

  /**
   * «Курсор» проигрывания: кольца на местах, которые звучат сейчас (пустой список — убрать).
   * kind: 'ok' — верный ответ (зелёное кольцо), 'bad' — неверный (красное).
   * @param {{ string: number, fret: number, kind?: 'ok' | 'bad' }[]} [list]
   */
  function cursor(list = []) {
    cursorG.replaceChildren(...list.filter(p => p.fret >= cfg.from && p.fret <= cfg.to).map(p => {
      const [x, y] = xy(p.string, p.fret);
      return h('svg:circle', { cx: x, cy: y, r: geo.gap > 40 ? 18 : 16, class: p.kind ? `cur-${p.kind}` : null });
    }));
  }

  drawNeck();
  return { el: wrap, update, scrollTo, cursor, get config() { return cfg; } };
}

/** Роль ступени для значка: 1/♭3/3/5/♭7/7 и характерная нота */
export function roleOf(degree, characteristic = []) {
  if (characteristic.includes(degree)) return 'char';
  const n = String(degree).replace(/\D/g, '');
  return n === '1' || n === '8' ? 'root' : n === '3' ? 'third' : n === '5' ? 'fifth' : n === '7' ? 'seventh' : 'other';
}
