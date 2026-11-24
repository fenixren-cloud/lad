// theory-sevenths.js — «Септаккорды»: maj7, 7, m7, m7♭5, dim7 — фигура на круге, формы от 6-й и 5-й
// струны, сравнение с трезвучием на слух, диатонические септаккорды тональности, блюз и ii–V–I.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented, degreeBadge } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { mod12, noteName, degreeRole } from '../core/notes.js';
import { CHORD_TYPES, chordSymbol } from '../core/chords.js';
import { keyTonic, diatonicChords } from '../core/scales.js';
import { TUNINGS, shapesFor, placeShape, voicingMidis, bestVoicing } from '../core/neck.js';
import { chordInfo, chordLabelMap, markersFor, tabLines } from '../core/theory.js';
import { settings } from '../app/state.js';
import { store } from '../app/store.js';
import { quickSettings, chipRow, neckView, dialView, listenButton, lessonsCard, german } from './theory-kit.js';
import { example, playExample, stopExample } from '../audio/theoryplayer.js';

const TYPES = ['maj7', 'dom7', 'm7', 'm7b5', 'dim7'];
const TRIAD = { maj7: 'maj', dom7: 'maj', m7: 'min', m7b5: 'dim', dim7: 'dim' };
const HINT = {
  maj7: 'Мажор + большая септима (7): мягкий, мечтательный. Джаз, соул, баллады.',
  dom7: 'Мажор + малая септима (♭7): напряжённый, блюзовый, тянется на квинту вниз. Основа блюза.',
  m7: 'Минор + малая септима: мягкий минор. Фанк, соул, ii в ii–V–I.',
  m7b5: 'Уменьшённое трезвучие + ♭7 (полууменьшённый): ii в миноре, тёмный и неустойчивый.',
  dim7: 'Одни малые терции: симметричный, очень напряжённый — переходный аккорд.',
};
const BLUES = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const saved = { root: 9, type: 'dom7', shape: 0, key: 0, ...store().get('thSevenths', {}) };
  const st = signal({ root: mod12(Number(saved.root) || 0), type: TYPES.includes(saved.type) ? saved.type : 'dom7', shape: Number(saved.shape) || 0, key: mod12(Number(saved.key) || 0) });
  const set = p => { st.value = { ...st.value, ...p }; store().set('thSevenths', st.value); };
  const field = k => ({ get value() { return String(st.value[k]); }, watch: fn => st.watch(v => fn(String(v[k]))) });
  const tuningId = () => settings.value.tuning, tun = () => TUNINGS[tuningId()].midi;

  const typeSeg = segmented({ label: 'Септаккорд', name: 'type', options: TYPES.map(t => [t, CHORD_TYPES[t].sym]), sig: field('type'), onchange: v => set({ type: v, shape: 0 }) });
  const roots = chipRow({ label: 'Корень', name: 'root', options: [], sig: field('root'), onchange: v => set({ root: Number(v) }) });
  const shapes = chipRow({ label: 'Форма', name: 'shape', options: [], sig: field('shape'), onchange: v => set({ shape: Number(v) }) });
  const keys = chipRow({ label: 'Тональность (мажор)', name: 'key', options: [], sig: field('key'), onchange: v => set({ key: Number(v) }) });
  d.add(roots.dispose); d.add(shapes.dispose); d.add(keys.dispose);
  const dial = dialView(d, { label: 'Септаккорд на круге', onPick: v => set({ root: v.pc }) });
  const title = h('div', { class: 'chord-title' });
  const hint = h('p', { class: 'muted note' });
  const tones = h('div', { class: 'tones' });
  const neck = neckView(d, 'Септаккорд на грифе');
  const tab = h('pre', { class: 'tab mono', 'aria-label': 'Таб' });
  const diaRow = h('div', { class: 'chord-row diatonic', role: 'list', 'aria-label': 'Септаккорды тональности' });
  const bluesGrid = h('div', { class: 'scene-grid', role: 'list', 'aria-label': '12-тактовый блюз' });

  const voicing = () => {
    const list = shapesFor(st.value.type, tuningId()), s = list[Math.min(st.value.shape, list.length - 1)];
    return { shape: s, frets: placeShape(s, st.value.root, tun(), 5) || placeShape(s, st.value.root, tun()) };
  };
  const chordName = (pc, type) => chordSymbol(chordInfo(pc, type, german()).root, type, { german: german() });

  async function playChords(list, title) {
    if (example.value) { stopExample(); return; }
    const items = list.map(c => ({ notes: voicingMidis(bestVoicing(c.type, c.pc, tuningId(), 5).frets, tun()).map(m => ({ midi: m })), beats: c.beats || 2, strum: true }));
    await playExample(items, { title, bpm: 100, onStep: i => {
      for (const x of diaRow.children) x.classList.toggle('on', i >= 0 && /** @type {HTMLElement} */ (x).dataset.i === String(list[i].i));
      for (const x of bluesGrid.children) x.classList.toggle('on', i >= 0 && list[i].bar != null && /** @type {HTMLElement} */ (x).dataset.i === String(list[i].bar));
    } });
  }

  function draw() {
    const { root, type, key } = st.value, g = german(), ci = chordInfo(root, type, g);
    roots.redraw(Array.from({ length: 12 }, (_, pc) => [String(pc), chordInfo(pc, type, g).names[0]]));
    shapes.redraw(shapesFor(type, tuningId()).map((s, i) => [String(i), s.name]));
    keys.redraw(Array.from({ length: 12 }, (_, pc) => [String(pc), noteName(keyTonic(pc, 'ionian'), { german: g })]));
    dial.update({ layout: 'chroma', polygon: { root, type },
      nodes: Array.from({ length: 12 }, (_, pc) => { const i = ci.pcs.indexOf(pc); return { pc, label: i >= 0 ? ci.names[i] : chordInfo(pc, 'maj', g).names[0], role: i >= 0 ? degreeRole(ci.degrees[i]) : 'none' }; }),
      center: { big: chordName(root, type), small: ci.sides.join(' + ') } });
    title.replaceChildren(h('b', null, chordName(root, type)), h('span', { class: 'muted' }, ` ${CHORD_TYPES[type].name.toLowerCase()} · стороны ${ci.sides.join(' + ')}`));
    hint.textContent = HINT[type];
    tones.replaceChildren(...ci.names.map((n, i) => h('span', { class: 'tone' }, degreeBadge(ci.degrees[i], degreeRole(ci.degrees[i])), h('b', null, n))));
    const v = voicing(), map = chordLabelMap(root, type, g);
    const notes = v.frets ? v.frets.flatMap((f, s) => (f == null ? [] : [{ string: s, fret: f, pc: mod12(tun()[s] + f) }])) : [];
    const u = notes.map(n => n.fret);
    neck.show({ from: Math.max(0, Math.min(...u, 99) - 1), to: Math.min(22, Math.max(...u, 0) + 3), markers: markersFor(notes, map, { labels: /** @type {any} */ (settings.value.labels) }), focus: Math.min(...u, 99) });
    tab.textContent = v.frets ? `${v.shape.name}\n${tabLines(v.frets, tun(), g).join('\n')}` : '';
    const dia = diatonicChords(keyTonic(key, 'ionian'), 'ionian', { sevenths: true });
    diaRow.replaceChildren(...dia.map((c, i) => {
      const nm = noteName(c.root, { german: g }) + CHORD_TYPES[c.type].sym;
      const b = h('button', { type: 'button', class: 'chord-chip', role: 'listitem', dataset: { i: String(i) }, 'aria-label': `${c.roman}: ${nm}` }, h('b', null, nm), h('small', null, c.roman));
      b.addEventListener('click', () => playChords([{ pc: c.rootPc, type: c.type, i, beats: 3 }], nm));
      return b;
    }));
    bluesGrid.replaceChildren(...BLUES.map((dv, i) => h('span', { class: 'grid-cell', role: 'listitem', dataset: { i: String(i) } }, chordName(mod12(key + dv), 'dom7'))));
  }
  d.add(st.watch(draw));
  d.add(settings.watch(draw));

  const compare = listenButton(d, { label: 'Трезвучие → септаккорд', action: 'listen-compare', build: () => {
    const t3 = bestVoicing(TRIAD[st.value.type], st.value.root, tuningId(), 5), v = voicing();
    const a = t3 ? voicingMidis(t3.frets, tun()) : [], b = v.frets ? voicingMidis(v.frets, tun()) : [];
    return { title: 'Сравнение', bpm: 80, items: [{ notes: a.map(m => ({ midi: m })), beats: 3, strum: true }, { notes: b.map(m => ({ midi: m })), beats: 3, strum: true }, { notes: a.map(m => ({ midi: m })), beats: 2, strum: true }, { notes: b.map(m => ({ midi: m })), beats: 4, strum: true }] };
  } });
  const bluesBtn = h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'blues' }, onclick: () => playChords(BLUES.map((dv, bar) => ({ pc: mod12(st.value.key + dv), type: 'dom7', bar, beats: 2 })), '12-тактовый блюз') }, '12-тактовый блюз');
  const iiVI = h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'ii-v-i' }, onclick: () => playChords([{ pc: mod12(st.value.key + 2), type: 'm7', i: 1 }, { pc: mod12(st.value.key + 7), type: 'dom7', i: 4 }, { pc: st.value.key, type: 'maj7', i: 0, beats: 4 }], 'ii–V–I') }, 'ii – V – I');

  const el = h('div', { class: 'screen theory th-sevenths' },
    screenHeader({ eyebrow: 'Теория', title: 'Септаккорды', back: '#/theory' }),
    h('p', { class: 'lead' }, 'Септаккорд — трезвучие плюс ещё одна нота через одну: септима. Большая (7) — на полутон ниже октавы, малая (♭7) — на тон ниже. Четвёртая нота добавляет цвет: мечтательность, напряжение или мягкость.'),
    typeSeg, title, hint,
    h('div', { class: 'dial-wrap' }, dial.el),
    tones,
    h('div', { class: 'row' }, compare),
    h('div', { class: 'setting' }, h('b', null, 'Корень'), roots.el),
    quickSettings(),
    h('div', { class: 'setting' }, h('b', null, 'Форма'), shapes.el),
    card({ cls: 'neckcard' }, neck.el),
    card({ title: 'Таб', id: 'seventh-tab' }, tab),
    card({ title: 'Септаккорды тональности', id: 'dia7' }, h('div', { class: 'setting' }, keys.el), diaRow,
      h('p', { class: 'muted note' }, 'В мажоре: Imaj7, ii7, iii7, IVmaj7, V7, vi7, viiø7. Нажми — услышишь.')),
    card({ title: 'Блюз и ii–V–I', id: 'blues' }, bluesGrid, h('div', { class: 'row' }, bluesBtn, iiVI),
      h('p', { class: 'muted note' }, 'Блюз — I7, IV7 и V7 по 12 тактам; над ним — минорная пентатоника с блюзовой нотой. ii–V–I — корни идут на квинту вниз, по кругу домой.')),
    lessonsCard('sevenths'));
  return { el, title: 'Септаккорды', dispose: () => d.dispose() };
}
