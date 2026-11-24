// theory-penta.js — «Пентатоника»: 5 позиций методом линеек (минорная и мажорная), таблица позиций,
// правила без зубрёжки (цикл 3-2-2-3-2, следующая позиция — где кончилась линейка, сдвиг на струне си),
// соединение позиций, блюзовая нота, проигрывание позиции с бегущим курсором.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { mod12, noteName } from '../core/notes.js';
import { keyTonic, PENTATONICS, spellPenta } from '../core/scales.js';
import { TUNINGS, MAX_FRET, pentaPositions, neckNotes } from '../core/neck.js';
import { pentaTable, pentaLabelMap, markersFor, blueNotes, upAndDown } from '../core/theory.js';
import { settings } from '../app/state.js';
import { store } from '../app/store.js';
import { quickSettings, chipRow, neckView, listenButton, lessonsCard, german } from './theory-kit.js';

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const saved = { root: 9, kind: 'minor', pos: '0', blue: false, join: false, ...store().get('thPenta', {}) };
  const st = signal({ root: mod12(Number(saved.root) || 0), kind: /** @type {'minor' | 'major'} */ (saved.kind === 'major' ? 'major' : 'minor'), pos: ['0', '1', '2', '3', '4', 'all'].includes(String(saved.pos)) ? String(saved.pos) : '0', blue: !!saved.blue, join: !!saved.join });
  const set = p => { st.value = { ...st.value, ...p }; store().set('thPenta', st.value); };
  const field = k => ({ get value() { return String(st.value[k]); }, watch: fn => st.watch(v => fn(String(v[k]))) });
  const tun = () => TUNINGS[settings.value.tuning].midi;

  const kindSeg = segmented({ label: 'Пентатоника', name: 'kind', options: [['minor', 'Минорная'], ['major', 'Мажорная']], sig: field('kind'), onchange: v => set({ kind: v }) });
  const roots = chipRow({ label: 'Тоника', name: 'root', options: [], sig: field('root'), onchange: v => set({ root: Number(v) }) });
  d.add(roots.dispose);
  const posSeg = segmented({ label: 'Позиция', name: 'pos', options: [['0', '1'], ['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'], ['all', 'Все']], sig: field('pos'), onchange: v => set({ pos: v }) });
  const blueBtn = h('button', { type: 'button', class: 'chip-btn', role: 'switch', dataset: { action: 'blue' }, onclick: () => set({ blue: !st.value.blue }) }, 'Блюзовая нота');
  const joinBtn = h('button', { type: 'button', class: 'chip-btn', role: 'switch', dataset: { action: 'join' }, onclick: () => set({ join: !st.value.join }) }, 'Со следующей позицией');
  const notesLine = h('p', { class: 'muted note' });
  const neck = neckView(d, 'Позиция пентатоники');
  const table = h('div', { class: 'table-wrap' });
  const rules = h('ul', { class: 'facts' });

  function draw() {
    const { root, kind, pos, blue, join } = st.value, g = german(), t = tun();
    const tonic = keyTonic(root, kind === 'minor' ? 'aeolian' : 'ionian');
    roots.redraw(Array.from({ length: 12 }, (_, pc) => [String(pc), noteName(keyTonic(pc, kind === 'minor' ? 'aeolian' : 'ionian'), { german: g })]));
    const all = pentaPositions(root, kind, t), map = pentaLabelMap(root, kind, g, blue), labels = /** @type {any} */ (settings.value.labels);
    notesLine.textContent = `${noteName(tonic, { german: g })} ${kind === 'minor' ? 'минорная' : 'мажорная'}: ${spellPenta(tonic, kind).map(n => noteName(n, { german: g })).join(' ')}${blue ? ` + блюзовая нота` : ''}. Шаги: ${PENTATONICS[kind].steps.join('-')}.`;
    if (pos === 'all') {
      // весь гриф от порожка: пять позиций повторяются через 12 ладов, поэтому показываем каждую ноту гаммы
      // на каждом ладу 0–22 (в Drop D у порожка открытая 6-я — тоника ре минора)
      const notes = neckNotes(PENTATONICS[kind].st.map(x => root + x), t, 0, MAX_FRET);
      const blues = blue ? neckNotes([root + PENTATONICS[kind].blueSt], t, 0, MAX_FRET) : [];
      neck.show({ from: 0, to: MAX_FRET, markers: [...markersFor(notes, map, { labels }), ...markersFor(blues, map, { labels, ring: () => true })], focus: 0 });
    } else {
      const i = Number(pos), p = all[i], nx = all[(i + 1) % 5];
      const own = new Set(p.notes.map(n => `${n.string}:${n.fret}`));
      const extra = join ? nx.notes.filter(n => !own.has(`${n.string}:${n.fret}`)) : [];
      const blues = blue ? blueNotes(root, kind, p) : [];
      const lo = Math.min(p.minFret, ...(join ? [nx.minFret] : [])), hi = Math.max(p.maxFret, ...(join ? [nx.maxFret] : []));
      neck.show({ from: Math.max(0, lo - 1), to: Math.min(22, hi + 2),
        markers: [...markersFor(p.notes, map, { labels }), ...markersFor(extra, map, { labels, dim: () => true }), ...markersFor(blues, map, { labels, ring: () => true })],
        rulers: p.rulers.map(x => ({ ...x, long: x.length >= 3 })), focus: p.minFret });
    }
    const rows = pentaTable(root, kind, t);
    table.replaceChildren(h('table', { class: 'pos-table' },
      h('thead', null, h('tr', null, ...['Поз.', 'Лады', 'Линейки 6 → 1'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, ...rows.map(x => h('tr', { class: String(x.index) === pos ? 'sel' : '' },
        h('td', null, h('button', { type: 'button', class: 'iv-btn', 'aria-label': `Позиция ${x.index + 1}`, onclick: () => set({ pos: String(x.index) }) }, String(x.index + 1))),
        h('td', null, `${x.from}–${x.to}`, h('br'), h('small', { class: 'muted' }, `от ${x.startDegree}`)),
        h('td', { class: 'rulers-cell' }, ...x.rulers.map(k => h('span', { class: `rl ${k === 'Д' ? 'long' : 'short'}`, title: k === 'Д' ? 'длинная: 3 лада' : 'короткая: 2 лада' }, k))))))));
    const s = PENTATONICS[kind].steps;
    rules.replaceChildren(
      h('li', null, h('b', null, `Цикл ${s.join('-')}`), `: соседние ноты ${kind === 'minor' ? 'минорной' : 'мажорной'} пентатоники отстоят на столько полутонов, и цикл повторяется — поэтому позиций ровно пять.`),
      h('li', null, h('b', null, 'Следующая позиция начинается там, где кончилась линейка'), ': вторая нота на 6-й струне — первая нота следующей позиции.'),
      h('li', null, h('b', null, 'Сдвиг на струне си'), ': переход G→B — 4 полутона, поэтому линейка на 2-й струне на лад правее, чем подсказывает фигура.'),
      h('li', null, h('b', null, 'Линейки'), ': на каждой струне 2 ноты — длинная (3 лада, «Д») или короткая (2 лада, «К»). Позиция 1 минорной: Д → К К К → Д Д.'),
      h('li', null, h('b', null, 'Блюзовая нота'), `: ${kind === 'minor' ? '♭5 между 4 и 5' : '♭3 между 2 и 3'} — проходящая, «скрипит» и сразу уходит дальше.`),
      h('li', null, h('b', null, 'Мажорная = параллельная минорная'), ': те же ноты, другая тоника. До-мажорная пентатоника — это ля-минорная, только «дом» — до.'));
    blueBtn.setAttribute('aria-checked', String(blue));
    joinBtn.setAttribute('aria-checked', String(join));
    joinBtn.hidden = pos === 'all';
  }
  d.add(st.watch(draw));
  d.add(settings.watch(draw));

  const playPos = listenButton(d, { label: 'Сыграть позицию', action: 'listen-pos', build: () => {
    const all = pentaPositions(st.value.root, st.value.kind, tun());
    const p = all[st.value.pos === 'all' ? 0 : Number(st.value.pos)];
    const seq = upAndDown(p.notes);
    return { title: `Позиция ${p.index + 1}`, bpm: 100, items: seq.map(n => ({ notes: [{ midi: n.midi }], beats: 0.5 })), onStep: i => neck.cursor(i < 0 ? [] : [{ string: seq[i].string, fret: seq[i].fret }]) };
  } });
  const playAll = listenButton(d, { label: 'Все 5 позиций вверх', action: 'listen-all', build: () => {
    const all = pentaPositions(st.value.root, st.value.kind, tun());
    const seq = all.flatMap(p => [...p.notes].sort((a, b) => a.midi - b.midi));
    return { title: 'Все позиции', bpm: 150, items: seq.map(n => ({ notes: [{ midi: n.midi }], beats: 0.5 })), onStep: i => neck.cursor(i < 0 ? [] : [{ string: seq[i].string, fret: seq[i].fret }]) };
  } });

  const el = h('div', { class: 'screen theory th-penta' },
    screenHeader({ eyebrow: 'Теория', title: 'Пентатоника', back: '#/theory' }),
    h('p', { class: 'lead' }, 'Пять нот, пять позиций. Каждая позиция — 2 ноты на струне: линейка длинная (3 лада) или короткая (2 лада). Выучишь фигуру линейками — сыграешь её в любой тональности.'),
    kindSeg,
    h('div', { class: 'setting' }, h('b', null, 'Тоника'), roots.el),
    quickSettings(),
    h('div', { class: 'setting' }, h('b', null, 'Позиция'), posSeg),
    h('div', { class: 'row' }, blueBtn, joinBtn),
    card({ cls: 'neckcard' }, neck.el, notesLine),
    h('div', { class: 'row' }, playPos, playAll),
    card({ title: 'Таблица позиций', id: 'pos-table', cls: 'flush' }, table),
    card({ title: 'Правила без зубрёжки', id: 'penta-rules' }, rules),
    lessonsCard('penta'));
  return { el, title: 'Пентатоника', dispose: () => d.dispose() };
}
