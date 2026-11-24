// dial.js — «циферблат» из 12 нот (1 час = 1 полутон = 1 лад) и квинтовый круг.
// Циферблат: ноты с цветом ступени (и подписью), фигура аккорда с числами полутонов на сторонах,
// дуга интервала, надпись в центре. Фигура поворачивается и «переворачивается» плавно (с уважением
// к prefers-reduced-motion). Квинтовый круг: мажоры снаружи, параллельные миноры внутри, знаки,
// сектор тональности с римскими цифрами. Нажатие на ноту или тональность — только мышью/пальцем:
// с клавиатуры и для диктора тот же выбор есть кнопками рядом.
import { h } from './dom.js';
import { mod12 } from '../core/notes.js';
import { CHORD_TYPES } from '../core/chords.js';
import { FIFTHS } from '../core/scales.js';
import { chordSides, fifthsSector, fifthsK, keyLabel } from '../core/theory.js';

const C = 160; // центр (viewBox 320×320)
const polar = (deg, r) => [C + r * Math.cos((deg - 90) * Math.PI / 180), C + r * Math.sin((deg - 90) * Math.PI / 180)];
const f1 = n => Math.round(n * 10) / 10;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * @typedef {{ pc: number, label: string, role?: string, dim?: boolean, ring?: boolean, sub?: string }} DialNode
 * @typedef {{ layout: 'chroma', nodes?: DialNode[], polygon?: { root: number, type: string } | null, arc?: { from: number, st: number } | null,
 *   center?: { big: string, small?: string } | null, glow?: number | null }} ChromaSpec
 * @typedef {{ layout: 'fifths', selected?: { pc: number, kind: 'maj' | 'min' } | null, sector?: boolean, glow?: number | null }} FifthsSpec
 */

/**
 * @param {{ label?: string, onPick?: (v: { pc: number, kind?: 'maj' | 'min' }) => void, german?: boolean, terms?: string }} [o]
 */
export function createDial(o = {}) {
  let opts = { german: false, terms: 'ru', ...o };
  const svg = h('svg:svg', { class: 'dial', viewBox: '0 0 320 320', role: 'img', 'aria-label': o.label || 'Круг из 12 нот' });
  const base = h('svg:g'), shape = h('svg:g', { class: 'dial-shape' }), top = h('svg:g');
  svg.append(base, shape, top);
  /** @type {number[] | null} углы вершин фигуры (градусы) — для плавного перехода */
  let angles = null, anim = 0, spec = /** @type {any} */ (null);

  svg.addEventListener('click', e => {
    const g = /** @type {Element} */ (e.target).closest('[data-pc]');
    if (!g || !opts.onPick) return;
    opts.onPick({ pc: Number(g.getAttribute('data-pc')), kind: /** @type {any} */ (g.getAttribute('data-kind') || undefined) });
  });

  function drawChroma(s) {
    const byPc = new Map((s.nodes || []).map(n => [n.pc, n]));
    let out = `<circle class="dial-ring" cx="${C}" cy="${C}" r="118"/>`;
    for (let pc = 0; pc < 12; pc++) {
      const n = byPc.get(pc), [x, y] = polar(pc * 30, 118);
      const role = n?.role || 'none';
      const cls = `dial-node role-${role}${n?.dim ? ' dim' : ''}${n?.ring ? ' ring' : ''}${s.glow === pc ? ' glow' : ''}${opts.onPick ? ' pick' : ''}`;
      out += `<g class="${cls}" data-pc="${pc}" transform="translate(${f1(x)} ${f1(y)})"><circle r="${role === 'none' ? 15 : 21}"/>`;
      if (n?.label) out += `<text y="${n.sub ? 0 : 5}" text-anchor="middle">${esc(n.label)}</text>`;
      if (n?.sub) out += `<text class="sub" y="12" text-anchor="middle">${esc(n.sub)}</text>`;
      out += '</g>';
    }
    if (s.arc && s.arc.st > 0) {
      const a0 = s.arc.from * 30, a1 = a0 + s.arc.st * 30, r = 84;
      const [x0, y0] = polar(a0, r), [x1, y1] = polar(Math.min(a1, a0 + 359.9), r);
      // дуга по часовой от корня; число полутонов — в центре круга
      out = `<path class="dial-arc" d="M${f1(x0)} ${f1(y0)} A${r} ${r} 0 ${s.arc.st > 6 ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}"/>` + out;
    }
    base.innerHTML = out;
    // с фигурой аккорда центр занят её сторонами — название аккорда показывает экран рядом
    top.innerHTML = s.center && !s.polygon ? `<text class="dial-big" x="${C}" y="${C + 4}" text-anchor="middle">${esc(s.center.big)}</text>${s.center.small ? `<text class="dial-small" x="${C}" y="${C + 26}" text-anchor="middle">${esc(s.center.small)}</text>` : ''}` : '';
    drawShape(s.polygon || null);
  }

  /** Фигура аккорда: вершины по углам нот, на сторонах — полутоны */
  function drawShape(poly) {
    cancelAnimationFrame(anim);
    if (!poly) { shape.innerHTML = ''; angles = null; return; }
    const st = CHORD_TYPES[poly.type].st, target = st.map(x => (poly.root + x) * 30);
    const sides = chordSides(poly.type);
    const paint = list => {
      const pts = list.map(a => polar(a, 96));
      let d = `M${pts.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L')}${pts.length > 2 ? ' Z' : ''}`;
      let labels = '';
      pts.forEach((p, i) => {
        if (pts.length === 2 && i === 1) return; // у пауэр-аккорда одна сторона
        const q = pts[(i + 1) % pts.length], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        labels += `<g class="dial-side" transform="translate(${f1(mx)} ${f1(my)})"><circle r="11"/><text y="4" text-anchor="middle">${sides[i]}</text></g>`;
      });
      shape.innerHTML = `<path class="dial-poly" d="${d}"/>${labels}`;
    };
    const from = angles && angles.length === target.length ? angles : null;
    angles = target;
    if (!from || reduced()) { paint(target); return; }
    // каждая вершина едет по кратчайшей дуге: поворот — все на 30°, «зеркало» — одна вершина на полутон
    const delta = target.map((a, i) => { let d = mod12((a - from[i]) / 30) * 30; if (d > 180) d -= 360; return d; });
    const t0 = performance.now(), dur = 420;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - (1 - t) ** 3;
      paint(from.map((a, i) => a + delta[i] * e));
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function drawFifths(s) {
    const sel = s.selected, k = sel ? fifthsK(sel.pc, sel.kind) : null;
    const sector = s.sector && k != null ? fifthsSector(k) : [];
    const romanOf = (pc, kind) => sector.find(x => x.pc === pc && x.kind === kind)?.roman || '';
    let out = '';
    if (sector.length) {
      const a0 = (k - 1.5) * 30, a1 = (k + 1.5) * 30, [x0, y0] = polar(a0, 142), [x1, y1] = polar(a1, 142), [x2, y2] = polar(a1, 52), [x3, y3] = polar(a0, 52);
      out += `<path class="dial-sector" d="M${f1(x0)} ${f1(y0)} A142 142 0 0 1 ${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)} A52 52 0 0 0 ${f1(x3)} ${f1(y3)} Z"/>`;
    }
    for (const f of FIFTHS) {
      const a = f.k * 30;
      const sig = f.signature.list.length ? `${f.signature.list.length}${f.signature.sharps ? '♯' : '♭'}` : '0';
      const [sx, sy] = polar(a, 152);
      out += `<text class="dial-sig" x="${f1(sx)}" y="${f1(sy + 4)}" text-anchor="middle">${sig}</text>`;
      for (const [kind, pc, r] of /** @type {[('maj' | 'min'), number, number][]} */ ([['maj', f.pc, 120], ['min', f.minorPc, 78]])) {
        const [x, y] = polar(a, r), roman = romanOf(pc, kind);
        const isSel = sel && sel.pc === pc && sel.kind === kind;
        const label = keyLabel(pc, kind, { german: opts.german, terms: 'ru' });
        const text = opts.terms === 'de' && kind === 'min' ? label.replace('m', '').toLowerCase() : label;
        const cls = `dial-key ${kind}${roman ? ' in' : ''}${isSel ? ' sel' : ''}${s.glow != null && s.glow === pc && (kind === 'maj' || !sector.length) ? ' glow' : ''}${opts.onPick ? ' pick' : ''}`;
        out += `<g class="${cls}" data-pc="${pc}" data-kind="${kind}" transform="translate(${f1(x)} ${f1(y)})"><circle r="${kind === 'maj' ? 21 : 18}"/><text y="${roman ? 1 : 5}" text-anchor="middle">${esc(text)}</text>${roman ? `<text class="sub" y="13" text-anchor="middle">${roman}</text>` : ''}</g>`;
      }
    }
    base.innerHTML = out;
    shape.innerHTML = '';
    angles = null;
    top.innerHTML = '';
  }

  /** @param {ChromaSpec | FifthsSpec} next */
  function update(next) {
    spec = next;
    svg.setAttribute('data-layout', next.layout);
    if (next.layout === 'fifths') drawFifths(next);
    else drawChroma(next);
  }

  /** Подсветить ноту/тональность (во время проигрывания) */
  function glow(pc) {
    if (!spec) return;
    for (const g of svg.querySelectorAll('.glow')) g.classList.remove('glow');
    if (pc == null) return;
    const sel = spec.layout === 'fifths' ? `[data-pc="${pc}"][data-kind="maj"]` : `[data-pc="${pc}"]`;
    svg.querySelector(sel)?.classList.add('glow');
  }

  return { el: svg, update, glow, setOptions: p => { opts = { ...opts, ...p }; if (spec) update(spec); } };
}
