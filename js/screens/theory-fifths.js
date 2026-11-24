// theory-fifths.js — «Квинтовый круг»: мажоры снаружи, параллельные миноры внутри, знаки при ключе,
// сектор тональности (6 аккордов), 7 диатонических аккордов с римскими цифрами, последовательности и V → I,
// гамма или пентатоника тональности на грифе, параллельная и одноимённая тональности.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { mod12, noteName } from '../core/notes.js';
import { CHORD_TYPES } from '../core/chords.js';
import { keyTonic, diatonicChords, PROGRESSIONS, progressionChords } from '../core/scales.js';
import { TUNINGS, bestVoicing, voicingMidis, neckNotes } from '../core/neck.js';
import { signatureText, keyLabel, relativeOf, parallelOf, modeLabelMap, pentaLabelMap, markersFor, fifthsSector, fifthsK } from '../core/theory.js';
import { settings } from '../app/state.js';
import { store } from '../app/store.js';
import { quickSettings, neckView, dialView, listenButton, lessonsCard, german } from './theory-kit.js';
import { example, playExample, stopExample } from '../audio/theoryplayer.js';

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const saved = { pc: 0, kind: 'maj', show: 'scale', ...store().get('thFifths', {}) };
  const st = signal({ pc: mod12(Number(saved.pc) || 0), kind: /** @type {'maj' | 'min'} */ (saved.kind === 'min' ? 'min' : 'maj'), show: saved.show === 'penta' ? 'penta' : 'scale' });
  const set = p => { st.value = { ...st.value, ...p }; store().set('thFifths', st.value); };
  const mode = () => (st.value.kind === 'maj' ? 'ionian' : 'aeolian');
  const lbl = (pc, kind) => keyLabel(pc, kind, { german: german(), terms: settings.value.terms });
  const chordName = c => noteName(c.root, { german: german() }) + CHORD_TYPES[c.type].sym;

  const dial = dialView(d, { label: 'Квинтовый круг', onPick: v => set({ pc: v.pc, kind: v.kind || 'maj' }) });
  const keySel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input-select', 'aria-label': 'Тональность', onchange: () => { const [pc, kind] = keySel.value.split(':'); set({ pc: Number(pc), kind }); } }));
  const info = h('div', { class: 'key-info', 'aria-live': 'polite' });
  const rel = h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'relative' }, onclick: () => set(relativeOf(st.value.pc, st.value.kind)) });
  const par = h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'parallel' }, onclick: () => set(parallelOf(st.value.pc, st.value.kind)) });
  const chordsRow = h('div', { class: 'chord-row diatonic', role: 'list', 'aria-label': 'Аккорды тональности' });
  const progRow = h('div', { class: 'chips', role: 'group', 'aria-label': 'Последовательности' });
  const neck = neckView(d, 'Гамма тональности');
  const showSeg = segmented({ label: 'Что показать на грифе', name: 'show', options: [['scale', 'Гамма'], ['penta', 'Пентатоника']], sig: { get value() { return st.value.show; }, watch: fn => st.watch(v => fn(v.show)) }, onchange: v => set({ show: v }) });

  /** Сыграть аккорды: каждый — удар и подсветка на круге */
  async function playChords(list, title, beats = 2) {
    if (example.value) { stopExample(); return; }
    const tun = TUNINGS[settings.value.tuning].midi;
    const items = list.map(c => ({ notes: voicingMidis(bestVoicing(c.type, c.rootPc, settings.value.tuning, 5).frets, tun).map(m => ({ midi: m })), beats, strum: true }));
    await playExample(items, { title, bpm: 92, onStep: i => {
      dial.glow(i < 0 ? null : list[i].rootPc);
      chordsRow.querySelectorAll('.chord-chip').forEach(x => x.classList.toggle('on', i >= 0 && Number(/** @type {HTMLElement} */ (x).dataset.pc) === list[i].rootPc));
    } });
  }

  function draw() {
    const { pc, kind, show } = st.value, g = german(), tonic = keyTonic(pc, mode());
    keySel.replaceChildren(...['maj', 'min'].map(k => h('optgroup', { label: k === 'maj' ? 'Мажор' : 'Минор' },
      ...Array.from({ length: 12 }, (_, i) => { const p = k === 'maj' ? mod12(i * 7) : mod12(i * 7 + 9); return h('option', { value: `${p}:${k}` }, `${lbl(p, k)} · ${signatureText(p, k, g)}`); }))));
    keySel.value = `${pc}:${kind}`;
    dial.update({ layout: 'fifths', selected: { pc, kind }, sector: true });
    const r2 = relativeOf(pc, kind), p2 = parallelOf(pc, kind);
    const k = fifthsK(pc, kind), sector = fifthsSector(k);
    info.replaceChildren(
      h('div', { class: 'key-name' }, h('b', null, lbl(pc, kind)), h('span', { class: 'muted' }, ` · ${signatureText(pc, kind, g)}`)),
      h('p', { class: 'muted note' }, `Сектор на круге: ${sector.map(x => `${x.roman} ${lbl(x.pc, x.kind)}`).join(', ')}. Седьмой аккорд — уменьшённый — в сектор не входит.`));
    rel.textContent = `Параллельная: ${lbl(r2.pc, r2.kind)} (те же ноты)`;
    par.textContent = `Одноимённая: ${lbl(p2.pc, p2.kind)} · ${signatureText(p2.pc, p2.kind, g)}`;
    const dia = diatonicChords(tonic, mode());
    chordsRow.replaceChildren(...dia.map(c => {
      const b = h('button', { type: 'button', class: 'chord-chip', role: 'listitem', dataset: { pc: String(c.rootPc) }, 'aria-label': `${c.roman}: ${chordName(c)}` }, h('b', null, chordName(c)), h('small', null, c.roman));
      b.addEventListener('click', () => playChords([c], chordName(c), 3));
      return b;
    }));
    const fam = kind === 'maj' ? 'major' : 'minor';
    progRow.replaceChildren(...PROGRESSIONS[fam].filter(p => !p.type).map(p => {
      const b = h('button', { type: 'button', class: 'chip-btn', dataset: { prog: p.id } }, p.name);
      b.addEventListener('click', () => playChords(progressionChords(tonic, mode(), p), p.name));
      return b;
    }), (() => {
      const b = h('button', { type: 'button', class: 'chip-btn', dataset: { prog: 'v-i' } }, 'V → I «домой»');
      b.addEventListener('click', () => {
        const I = dia[0], V = { ...dia[4], type: 'maj' };
        playChords([V, I], 'V → I', 3);
      });
      return b;
    })());
    const tun = TUNINGS[settings.value.tuning].midi;
    const map = show === 'scale' ? modeLabelMap(pc, mode(), g) : pentaLabelMap(pc, kind === 'maj' ? 'major' : 'minor', g);
    const pcs = [...map.keys()];
    neck.show({ from: 0, to: 15, markers: markersFor(neckNotes(pcs, tun, 0, 15), map, { labels: /** @type {any} */ (settings.value.labels) }), focus: 5 });
  }
  d.add(st.watch(draw));
  d.add(settings.watch(draw));

  const walk = listenButton(d, { label: 'Тоники по кругу', action: 'listen-walk', build: () => {
    const list = Array.from({ length: 13 }, (_, i) => mod12(st.value.pc + 7 * i));
    return { title: 'Квинтовый круг', bpm: 110, items: list.map(pc => ({ notes: [{ midi: 43 + mod12(pc - 7) }], beats: 0.5 })), onStep: i => dial.glow(i < 0 ? null : list[i]) };
  } });

  const el = h('div', { class: 'screen theory th-fifths' },
    screenHeader({ eyebrow: 'Теория', title: 'Квинтовый круг', back: '#/theory' }),
    h('p', { class: 'lead' }, 'Карта тональностей: шаг по часовой — квинта вверх и +1♯, против — +1♭. Внутри — параллельные миноры с теми же знаками. Нажми на тональность на круге или выбери в списке.'),
    keySel,
    h('div', { class: 'dial-wrap big' }, dial.el),
    info,
    h('div', { class: 'row' }, rel, par),
    card({ title: '7 аккордов тональности', id: 'diatonic' }, chordsRow, h('p', { class: 'muted note' }, 'Большие римские цифры — мажорные аккорды, маленькие — минорные, ° — уменьшённый. Нажми — услышишь.')),
    card({ title: 'Последовательности', id: 'progs' }, progRow, h('div', { class: 'row' }, walk), h('p', { class: 'muted note' }, 'Если играет метроном или подложка — пример встанет в их сетку со следующего такта.')),
    quickSettings(), showSeg,
    card({ cls: 'neckcard' }, neck.el),
    lessonsCard('fifths'));
  return { el, title: 'Квинтовый круг', dispose: () => d.dispose() };
}
