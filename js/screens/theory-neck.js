// theory-neck.js — «Гриф и интервалы»: круг = гриф (1 час = 1 полутон = 1 лад), интервалы 0–12 на круге
// и на грифе — на той же струне, на соседней (+5) и при переходе G→B (+4); хроматика и квинты по кругу; факты.
import { h } from '../ui/dom.js';
import { screenHeader, card } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { mod12, noteName, spellPc, INTERVALS, degreeRole, ruName } from '../core/notes.js';
import { TUNINGS } from '../core/neck.js';
import { intervalPlaces, fretShift, INTERVAL_FEEL } from '../core/theory.js';
import { settings } from '../app/state.js';
import { store } from '../app/store.js';
import { quickSettings, chipRow, neckView, dialView, listenButton, lessonsCard, german } from './theory-kit.js';

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const saved = { root: 9, iv: 7, string: 0, ...store().get('thNeck', {}) };
  const st = signal({ root: mod12(Number(saved.root) || 0), iv: Math.min(12, Math.max(0, Number(saved.iv) || 0)), string: Math.min(4, Math.max(0, Number(saved.string) || 0)) });
  const set = p => { st.value = { ...st.value, ...p }; store().set('thNeck', st.value); };
  const field = k => ({ get value() { return String(st.value[k]); }, watch: fn => st.watch(v => fn(String(v[k]))) });
  const nm = pc => noteName(spellPc(pc), { german: german() });
  const ivRole = iv => (iv % 12 === 0 ? 'root' : degreeRole(INTERVALS[iv].deg));
  const label = (pc, deg) => (settings.value.labels === 'notes' ? nm(pc) : deg);

  const roots = chipRow({ label: 'От какой ноты', name: 'root', options: [], sig: field('root'), onchange: v => set({ root: Number(v) }) });
  const ivs = chipRow({ label: 'Интервал', name: 'iv', options: INTERVALS.map(i => [String(i.st), `${i.st} · ${i.short}`]), sig: field('iv'), onchange: v => set({ iv: Number(v) }) });
  const strs = chipRow({ label: 'Корень на струне', name: 'string', options: [0, 1, 2, 3, 4].map(s => [String(s), `${6 - s}-я`]), sig: field('string'), onchange: v => set({ string: Number(v) }) });
  d.add(roots.dispose); d.add(ivs.dispose); d.add(strs.dispose);

  const dial = dialView(d, { label: 'Круг: корень и интервал', onPick: v => set({ iv: mod12(v.pc - st.value.root) }) });
  const caption = h('p', { class: 'lead dial-caption', 'aria-live': 'polite' });
  const neck = neckView(d, 'Интервал на грифе');
  const neckNote = h('p', { class: 'muted note' });

  /** Корень на выбранной струне: первое место от 1-го лада (чтобы было куда идти влево) */
  const rootPos = () => {
    const tun = TUNINGS[settings.value.tuning].midi, s = st.value.string;
    let f = mod12(st.value.root - tun[s]);
    if (f < 2) f += 12;
    return { s, f, midi: tun[s] + f };
  };

  const table = h('div', { class: 'table-wrap' });
  function drawTable() {
    const iv = st.value.iv;
    const sgn = n => (n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`);
    table.replaceChildren(h('p', { class: 'muted note pad' }, 'Сколько ладов вправо (+) или влево (−) от корня: на той же струне, на соседней (+5) и при переходе G→B (+4).'),
      h('table', { class: 'iv-table' },
        h('thead', null, h('tr', null, ...['Пт', 'Интервал', 'Та же', 'Сосед.', 'G→B'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', null, ...INTERVALS.map(i => h('tr', { class: i.st === iv ? 'sel' : '' },
          h('td', null, h('button', { type: 'button', class: `iv-btn role-${ivRole(i.st)}`, 'aria-label': `${i.name}, ${i.st} полутонов`, onclick: () => set({ iv: i.st }) }, String(i.st))),
          h('td', null, h('b', null, i.short), ` ${i.name}`, h('br'), h('small', { class: 'muted' }, INTERVAL_FEEL[i.st])),
          h('td', { class: 'num' }, sgn(i.st)), h('td', { class: 'num' }, sgn(i.st - 5)), h('td', { class: 'num' }, sgn(i.st - 4)))))));
  }

  function draw() {
    const { root, iv } = st.value, tgt = mod12(root + iv), info = INTERVALS[iv];
    roots.redraw(Array.from({ length: 12 }, (_, pc) => [String(pc), nm(pc)]));
    dial.update({ layout: 'chroma', arc: iv % 12 ? { from: root, st: iv } : null,
      nodes: Array.from({ length: 12 }, (_, pc) => ({ pc, label: nm(pc), role: pc === root ? 'root' : pc === tgt && iv % 12 ? ivRole(iv) : 'none' })),
      center: { big: `+${iv}`, small: `${info.short} · ${iv} ${iv === 1 ? 'час' : iv >= 2 && iv <= 4 ? 'часа' : 'часов'}` } });
    caption.textContent = `От ${nm(root)} (${ruName(spellPc(root), { long: true })}) на ${iv} по часовой — ${nm(tgt)}: ${info.name}. ${INTERVAL_FEEL[iv][0].toUpperCase()}${INTERVAL_FEEL[iv].slice(1)}.`;
    const tun = TUNINGS[settings.value.tuning].midi, p = rootPos();
    const markers = [], links = [];
    for (let s = 0; s < 6; s++) for (let f = 0; f <= 15; f++) {
      const pc = mod12(tun[s] + f);
      if (pc === root) markers.push({ string: s, fret: f, label: label(pc, '1'), role: 'root', dim: true });
      else if (pc === tgt && iv % 12) markers.push({ string: s, fret: f, label: label(pc, info.deg), role: ivRole(iv), dim: true });
    }
    const places = iv > 0 ? intervalPlaces(p.s, p.f, iv, tun) : [];
    for (const q of places) {
      if (q.where === 'same' && q.fret === p.f) continue;
      const m = markers.find(x => x.string === q.string && x.fret === q.fret);
      if (m) { m.dim = false; m.ring = true; }
      links.push({ from: [p.s, p.f], to: [q.string, q.fret], label: q.where === 'same' ? `+${q.shift}` : `${q.shift >= 0 ? '+' : '−'}${Math.abs(q.shift)}` });
    }
    const rm = markers.find(x => x.string === p.s && x.fret === p.f);
    if (rm) { rm.dim = false; rm.ring = true; }
    neck.show({ from: 0, to: 15, markers, links, focus: p.f });
    neckNote.textContent = iv === 0 ? 'Выбери интервал — линии покажут, где он лежит от корня.'
      : `От корня на ${6 - p.s}-й струне: ${places.map(q => `${q.where === 'same' ? 'та же струна' : `${6 - q.string}-я струна${q.gap === 4 ? ' (через G→B)' : q.gap === 7 ? ' (Drop D: +7)' : ''}`} — ${fretShift(q.shift)}`).join('; ')}.`;
    drawTable();
  }
  d.add(st.watch(draw));
  d.add(settings.watch(draw));

  const playIv = listenButton(d, { label: 'Послушать интервал', action: 'listen-iv', build: () => {
    const p = rootPos(), a = p.midi, b = a + st.value.iv, tun = TUNINGS[settings.value.tuning].midi;
    const places = intervalPlaces(p.s, p.f, st.value.iv, tun);
    const q = places.find(x => x.where === 'next') || places[0] || { string: p.s, fret: p.f };
    const rootAt = { string: p.s, fret: p.f }, tgtAt = { string: q.string, fret: q.fret };
    return { title: `Интервал +${st.value.iv}`, bpm: 100, items: [{ notes: [{ midi: a }], beats: 1 }, { notes: [{ midi: b }], beats: 1 }, { notes: [{ midi: a }, { midi: b }], beats: 2 }],
      onStep: i => {
        neck.cursor(i < 0 ? [] : i === 0 ? [rootAt] : i === 1 ? [tgtAt] : [rootAt, tgtAt]);
        dial.glow(i < 0 ? null : i === 1 ? mod12(st.value.root + st.value.iv) : st.value.root);
      } };
  } });
  const walk = step => () => {
    const p = rootPos(), list = Array.from({ length: 13 }, (_, k) => (step === 1 ? k : (k * 7) % 12));
    return { title: step === 1 ? 'Хроматика' : 'Квинтами по кругу', bpm: step === 1 ? 140 : 110,
      items: list.map(k => ({ notes: [{ midi: p.midi + k }], beats: 0.5 })),
      onStep: i => { dial.glow(i < 0 ? null : mod12(st.value.root + list[i])); neck.cursor(i < 0 || step !== 1 ? [] : [{ string: p.s, fret: p.f + list[i] }]); } };
  };
  const chroma = listenButton(d, { label: 'Хроматика по кругу', action: 'listen-chroma', build: walk(1) });
  const fifths = listenButton(d, { label: 'Квинтами по кругу', action: 'listen-fifths', build: walk(7) });

  const facts = card({ title: 'Факты, которые экономят время', id: 'neck-facts' },
    h('ul', { class: 'facts' },
      h('li', null, h('b', null, 'Ми–фа и си–до'), ' стоят вплотную (1 лад). Остальные соседние ноты без знаков — через 2 лада.'),
      h('li', null, h('b', null, 'Соседняя струна — +5'), ': 5-й лад звучит как открытая следующая струна.'),
      h('li', null, h('b', null, 'Переход G→B — +4'), ': там та же нота на 4-м ладу, поэтому фигуры на струне си сдвигаются на лад.'),
      h('li', null, h('b', null, 'Октава — 12 ладов'), ': через 12 ладов круг замыкается, ноты повторяются.'),
      h('li', null, h('b', null, 'Drop D'), ': между 6-й и 5-й струной — квинта (7). Пауэр-аккорд от 6-й берётся одним пальцем на одном ладу.')));

  const el = h('div', { class: 'screen theory th-neck' },
    screenHeader({ eyebrow: 'Теория', title: 'Гриф и интервалы', back: '#/theory' }),
    h('p', { class: 'lead' }, '12 нот — как циферблат: 1 час = 1 полутон = 1 лад. Выбери корень и интервал — увидишь его на круге и все места на грифе.'),
    h('div', { class: 'setting' }, h('b', null, 'Корень'), roots.el),
    h('div', { class: 'dial-wrap' }, dial.el), caption,
    h('div', { class: 'setting' }, h('b', null, 'Интервал'), ivs.el),
    h('div', { class: 'row' }, playIv, chroma, fifths),
    quickSettings(),
    h('div', { class: 'setting' }, h('b', null, 'Корень на струне'), strs.el),
    card({ cls: 'neckcard' }, neck.el, neckNote),
    card({ title: 'Интервалы на грифе', id: 'iv-table', cls: 'flush' }, table),
    facts,
    lessonsCard('neck'));
  return { el, title: 'Гриф и интервалы', dispose: () => d.dispose() };
}
