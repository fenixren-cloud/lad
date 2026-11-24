// theory-chords.js — «Аккорды»: пауэр, мажор, минор, sus4, dim, aug как фигуры на круге (числа полутонов
// на сторонах), «повернуть фигуру» и «зеркало» мажор ↔ минор, формы баррэ E и A и отдельные формы Drop D,
// все ноты аккорда на грифе, таб рядом с аккордом, звук: удар медиатором и арпеджио.
import { h } from '../ui/dom.js';
import { screenHeader, card, button, segmented, degreeBadge } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { mod12, degreeRole } from '../core/notes.js';
import { CHORD_TYPES, chordSymbol } from '../core/chords.js';
import { TUNINGS, shapesFor, placeShape, voicingMidis, neckNotes } from '../core/neck.js';
import { chordInfo, chordLabelMap, markersFor, mirrorType, tabLines } from '../core/theory.js';
import { settings } from '../app/state.js';
import { store } from '../app/store.js';
import { quickSettings, chipRow, neckView, dialView, listenButton, lessonsCard, german } from './theory-kit.js';

const TYPES = ['power', 'maj', 'min', 'sus4', 'dim', 'aug'];
const HINT = {
  power: 'Корень и квинта: ни мажор, ни минор — чисто звучит на перегрузе.',
  maj: 'Большая терция + малая: светлый, устойчивый.',
  min: 'Малая терция + большая: грустный, мягкий. Зеркало мажора.',
  sus4: 'Кварта вместо терции: «подвешенный», хочет разрешиться в мажор.',
  dim: 'Две малые терции: тесный, тревожный, тянется дальше.',
  aug: 'Две большие терции: равносторонний треугольник, будто зависает.',
};

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const saved = { root: 9, type: 'maj', shape: 0, all: false, ...store().get('thChords', {}) };
  const st = signal({ root: mod12(Number(saved.root) || 0), type: TYPES.includes(saved.type) ? saved.type : 'maj', shape: Number(saved.shape) || 0, all: !!saved.all });
  const set = p => { st.value = { ...st.value, ...p }; store().set('thChords', st.value); };
  const field = k => ({ get value() { return String(st.value[k]); }, watch: fn => st.watch(v => fn(String(v[k]))) });
  const tuningId = () => settings.value.tuning;

  const typeSeg = segmented({ label: 'Тип аккорда', name: 'type', options: [['power', 'Пауэр'], ['maj', 'Мажор'], ['min', 'Минор'], ['sus4', 'sus4'], ['dim', 'dim'], ['aug', 'aug']], sig: field('type'), onchange: v => set({ type: v, shape: 0 }) });
  const roots = chipRow({ label: 'Корень', name: 'root', options: [], sig: field('root'), onchange: v => set({ root: Number(v) }) });
  d.add(roots.dispose);
  const shapeRow = chipRow({ label: 'Форма', name: 'shape', options: [], sig: field('shape'), onchange: v => set({ shape: Number(v) }) });
  d.add(shapeRow.dispose);

  const dial = dialView(d, { label: 'Фигура аккорда на круге', onPick: v => set({ root: v.pc }) });
  const title = h('div', { class: 'chord-title' });
  const hint = h('p', { class: 'muted note' });
  const tones = h('div', { class: 'tones', 'aria-label': 'Ноты аккорда' });
  const neck = neckView(d, 'Аккорд на грифе');
  const tab = h('pre', { class: 'tab mono', 'aria-label': 'Таб аккорда' });
  const allToggle = h('button', { type: 'button', class: 'chip-btn', role: 'switch', dataset: { action: 'all' }, onclick: () => set({ all: !st.value.all }) }, 'Все ноты аккорда на грифе');

  const voicing = () => {
    const shapes = shapesFor(st.value.type, tuningId());
    const s = shapes[Math.min(st.value.shape, shapes.length - 1)];
    return { shape: s, frets: placeShape(s, st.value.root, TUNINGS[tuningId()].midi, 5) || placeShape(s, st.value.root, TUNINGS[tuningId()].midi) };
  };

  function draw() {
    const { root, type, all } = st.value, g = german(), ci = chordInfo(root, type, g);
    roots.redraw(Array.from({ length: 12 }, (_, pc) => [String(pc), chordInfo(pc, type, g).names[0]]));
    const shapes = shapesFor(type, tuningId());
    shapeRow.redraw(shapes.map((s, i) => [String(i), s.name]));
    dial.update({ layout: 'chroma', polygon: { root, type },
      nodes: Array.from({ length: 12 }, (_, pc) => { const i = ci.pcs.indexOf(pc); return { pc, label: i >= 0 ? ci.names[i] : chordInfo(pc, 'maj', g).names[0], role: i >= 0 ? degreeRole(ci.degrees[i]) : 'none' }; }),
      center: { big: chordSymbol(ci.root, type, { german: g }), small: ci.sides.join(' + ') } });
    title.replaceChildren(h('b', null, chordSymbol(ci.root, type, { german: g })), h('span', { class: 'muted' }, ` ${CHORD_TYPES[type].name.toLowerCase()} · стороны ${ci.sides.join(' + ')}`));
    hint.textContent = HINT[type];
    tones.replaceChildren(...ci.names.map((n, i) => h('span', { class: 'tone' }, degreeBadge(ci.degrees[i], degreeRole(ci.degrees[i])), h('b', null, n))));
    const v = voicing(), tun = TUNINGS[tuningId()].midi, map = chordLabelMap(root, type, g);
    const notes = v.frets ? v.frets.flatMap((f, s) => (f == null ? [] : [{ string: s, fret: f, pc: mod12(tun[s] + f) }])) : [];
    const key = new Set(notes.map(n => `${n.string}:${n.fret}`));
    const extra = all ? neckNotes(ci.pcs, tun, 0, 15).filter(n => !key.has(`${n.string}:${n.fret}`)) : [];
    const markers = [...markersFor(notes, map, { labels: /** @type {any} */ (settings.value.labels) }), ...markersFor(extra, map, { labels: /** @type {any} */ (settings.value.labels), dim: () => true })];
    const u = notes.map(n => n.fret);
    neck.show({ from: 0, to: all ? 15 : Math.min(15, Math.max(7, Math.max(...u, 0) + 2)), markers, focus: u.length ? Math.min(...u) : 0 });
    tab.textContent = v.frets ? `${v.shape.name}\n${tabLines(v.frets, tun, g).join('\n')}` : '';
    allToggle.setAttribute('aria-checked', String(all));
    mirrorBtn.toggleAttribute('disabled', !mirrorType(type) || mirrorType(type) === type || !TYPES.includes(/** @type {string} */ (mirrorType(type))));
  }

  const rotate = button({ kind: 'ghost', label: 'Повернуть', onclick: () => set({ root: mod12(st.value.root + 1) }), attrs: { 'data-action': 'rotate', title: 'Фигура поворачивается на 1 час: тот же аккорд на полутон выше' } });
  const mirrorBtn = button({ kind: 'ghost', label: 'Зеркало', onclick: () => { const m = mirrorType(st.value.type); if (m && TYPES.includes(m)) set({ type: m, shape: 0 }); }, attrs: { 'data-action': 'mirror', title: 'Перевернуть фигуру: мажор ↔ минор' } });
  const strum = listenButton(d, { label: 'Послушать', action: 'listen-chord', build: () => {
    const v = voicing(), tun = TUNINGS[tuningId()].midi, midis = v.frets ? voicingMidis(v.frets, tun) : [];
    const pos = v.frets ? v.frets.flatMap((f, s) => (f == null ? [] : [{ string: s, fret: f }])) : [];
    return { title: 'Аккорд', bpm: 90, items: [{ notes: midis.map(m => ({ midi: m })), beats: 2, strum: true }, ...midis.map(m => ({ notes: [{ midi: m }], beats: 0.5 })), { notes: midis.map(m => ({ midi: m })), beats: 2, strum: true }],
      onStep: i => neck.cursor(i < 0 ? [] : i === 0 || i === midis.length + 1 ? pos : [pos[i - 1]]) };
  } });
  d.add(st.watch(draw));
  d.add(settings.watch(draw));

  const el = h('div', { class: 'screen theory th-chords' },
    screenHeader({ eyebrow: 'Теория', title: 'Аккорды', back: '#/theory' }),
    h('p', { class: 'lead' }, 'Аккорд — фигура на круге из 12 нот. Числа на сторонах — полутоны между нотами. Поверни фигуру — получишь тот же аккорд от другой ноты; переверни — мажор станет минором.'),
    typeSeg, title, hint,
    h('div', { class: 'dial-wrap' }, dial.el),
    h('div', { class: 'row' }, rotate, mirrorBtn, strum),
    tones,
    h('div', { class: 'setting' }, h('b', null, 'Корень'), roots.el),
    quickSettings(),
    h('div', { class: 'setting' }, h('b', null, 'Форма на грифе'), shapeRow.el, h('p', { class: 'muted note' }, 'Формы E и A — баррэ от 6-й и 5-й струны: где корень, такой и аккорд. В Drop D у форм от 6-й струны своя аппликатура.')),
    card({ cls: 'neckcard' }, neck.el, h('div', { class: 'row' }, allToggle)),
    card({ title: 'Таб', id: 'chord-tab' }, tab, h('p', { class: 'muted note' }, 'Сверху — 1-я струна (тонкая), снизу — 6-я. Цифра — лад, x — струна не звучит.')),
    lessonsCard('chords'));
  return { el, title: 'Аккорды', dispose: () => d.dispose() };
}
