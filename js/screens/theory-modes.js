// theory-modes.js — «Лады»: 7 ладов мажора, гармонический минор и фригийский доминантовый. Для каждого —
// формула и характерная нота, настроение и жанры, отличие от минора и мажора, родительский мажор и место
// на квинтовом круге, лестница яркости, 5 позиций и весь гриф, бурдон. Отдельно — почему фригийский «металлический».
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented, degreeBadge } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { mod12, noteName, pcOf } from '../core/notes.js';
import { MODES, MODE_ORDER, BRIGHTNESS, keyTonic, parentMajor, keySignature, spellScale } from '../core/scales.js';
import { TUNINGS, modePositions, neckNotes } from '../core/neck.js';
import { modeInfo, modeDiff, modeLabelMap, markersFor, upAndDown, BRIGHTNESS_STEP, MODE_TEXT } from '../core/theory.js';
import { settings } from '../app/state.js';
import { store } from '../app/store.js';
import { quickSettings, chipRow, neckView, dialView, listenButton, lessonsCard, german } from './theory-kit.js';
import { drone, startDrone, stopDrone } from '../audio/theoryplayer.js';

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const saved = { tonic: 2, mode: 'phrygian', pos: '0', ...store().get('thModes', {}) };
  const st = signal({ tonic: mod12(Number(saved.tonic) || 0), mode: MODE_ORDER.includes(saved.mode) ? saved.mode : 'phrygian', pos: ['0', '1', '2', '3', '4', 'all'].includes(String(saved.pos)) ? String(saved.pos) : '0' });
  const set = p => { st.value = { ...st.value, ...p }; store().set('thModes', st.value); };
  const field = k => ({ get value() { return String(st.value[k]); }, watch: fn => st.watch(v => fn(String(v[k]))) });
  const tun = () => TUNINGS[settings.value.tuning].midi;

  const modes = chipRow({ label: 'Лад', name: 'mode', options: MODE_ORDER.map(id => [id, MODES[id].name]), sig: field('mode'), onchange: v => set({ mode: v }) });
  const tonics = chipRow({ label: 'Тоника', name: 'tonic', options: [], sig: field('tonic'), onchange: v => set({ tonic: Number(v) }) });
  d.add(modes.dispose); d.add(tonics.dispose);
  const posSeg = segmented({ label: 'Позиция', name: 'pos', options: [['0', '1'], ['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'], ['all', 'Гриф']], sig: field('pos'), onchange: v => set({ pos: v }) });
  const head = h('div', { class: 'mode-head', 'aria-live': 'polite' });
  const formula = h('div', { class: 'formula', role: 'list', 'aria-label': 'Ступени лада' });
  const about = h('div', { class: 'mode-about' });
  const ladder = h('div', { class: 'ladder', role: 'group', 'aria-label': 'Лестница яркости: от светлого к тёмному' });
  const relation = h('p', { class: 'note' });
  const dial = dialView(d, { label: 'Родительский мажор на квинтовом круге' });
  const neck = neckView(d, 'Лад на грифе');

  function draw() {
    const { tonic, mode, pos } = st.value, g = german(), M = MODES[mode], info = modeInfo(tonic, mode, g), text = MODE_TEXT[mode];
    tonics.redraw(Array.from({ length: 12 }, (_, pc) => [String(pc), noteName(keyTonic(pc, mode), { german: g })]));
    head.replaceChildren(h('b', null, `${info.names[0]} ${M.name.toLowerCase()}`), h('span', { class: 'muted' }, ` — ${M.alt}`));
    formula.replaceChildren(...info.degrees.map((dg, i) => {
      const isChar = info.charPcs.includes(info.pcs[i]);
      return h('span', { class: `step-cell${isChar ? ' char' : ''}`, role: 'listitem' }, degreeBadge(dg, isChar ? 'char' : i === 0 ? 'root' : ['third', 'fifth', 'seventh'][[2, 4, 6].indexOf(i)] || 'other'), h('small', null, info.names[i]));
    }));
    const vsMinor = mode === 'aeolian' ? 'это он и есть' : modeDiff(mode, 'aeolian').map(x => `${x.degree} вместо ${x.instead}`).join(', ');
    const vsMajor = mode === 'ionian' ? 'это он и есть' : modeDiff(mode, 'ionian').map(x => `${x.degree} вместо ${x.instead}`).join(', ');
    about.replaceChildren(
      h('p', null, h('b', null, 'Характерная нота: '), info.charDegrees.join(' и '), ` (${info.charPcs.map(pc => info.names[info.pcs.indexOf(pc)]).join(', ')}) — лаймовая на грифе. ${text.idea}`),
      h('p', null, h('b', null, 'Настроение: '), text.mood, '. ', h('b', null, 'Где звучит: '), text.genres, '.'),
      h('p', { class: 'muted' }, `Против натурального минора: ${vsMinor}. Против мажора: ${vsMajor}.`));
    ladder.replaceChildren(...BRIGHTNESS.map((id, i) => {
      const b = h('button', { type: 'button', class: `ladder-step${id === mode ? ' on' : ''}`, dataset: { mode: id }, 'aria-pressed': String(id === mode) }, h('b', null, MODES[id].name), h('small', null, BRIGHTNESS_STEP[id]));
      b.addEventListener('click', () => set({ mode: id }));
      return b;
    }));
    const tonicNote = keyTonic(tonic, mode), parent = parentMajor(tonicNote, mode);
    const sig = keySignature(tonicNote, mode), sigText = sig.list.length ? `${sig.list.length}${sig.sharps ? '♯' : '♭'}` : 'без знаков';
    if (parent) {
      relation.textContent = `${info.names[0]} ${M.name.toLowerCase()} = ноты ${noteName(parent, { german: g })} мажора, сыгранные от ${info.names[0]} (${MODE_ORDER.indexOf(mode) + 1}-я ступень мажора). Знаки — ${sigText}; на круге это сектор ${noteName(parent, { german: g })}.`;
      dial.update({ layout: 'fifths', selected: { pc: pcOf(parent), kind: 'maj' }, sector: true });
    } else {
      const base = mode === 'harmonic' ? 'натурального минора' : 'фригийского';
      relation.textContent = mode === 'harmonic'
        ? `Натуральный ${info.names[0]} минор (${sigText}) с поднятой 7-й ступенью: знак ставится прямо в нотах, а не при ключе.`
        : `5-й лад гармонического минора ${noteName(spellScale(tonicNote, M.st)[3], { german: g })}: знаки как у ${base} (${sigText}) плюс поднятая терция.`;
      dial.update({ layout: 'fifths', selected: { pc: mode === 'harmonic' ? tonic : mod12(tonic + 5), kind: 'min' }, sector: true });
    }
    const map = modeLabelMap(tonic, mode, g), labels = /** @type {any} */ (settings.value.labels);
    if (pos === 'all') neck.show({ from: 0, to: 15, markers: markersFor(neckNotes(info.pcs, tun(), 0, 15), map, { labels }), focus: 3 });
    else {
      const p = modePositions(tonic, mode, tun())[Number(pos)];
      neck.show({ from: Math.max(0, p.minFret - 1), to: Math.min(22, p.maxFret + 2), markers: markersFor(p.notes, map, { labels }), focus: p.minFret });
    }
  }
  d.add(st.watch(draw));
  d.add(settings.watch(draw));

  const playMode = listenButton(d, { label: 'Сыграть лад', action: 'listen-mode', build: () => {
    const all = modePositions(st.value.tonic, st.value.mode, tun());
    const p = all[st.value.pos === 'all' ? 0 : Number(st.value.pos)], seq = upAndDown(p.notes);
    return { title: MODES[st.value.mode].name, bpm: 110, items: seq.map(n => ({ notes: [{ midi: n.midi }], beats: 0.5 })), onStep: i => neck.cursor(i < 0 ? [] : [{ string: seq[i].string, fret: seq[i].fret }]) };
  } });
  const droneBtn = h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'drone' } });
  droneBtn.addEventListener('click', () => (drone.value ? stopDrone() : startDrone(st.value.tonic, { title: `${noteName(keyTonic(st.value.tonic, st.value.mode), { german: german() })} ${MODES[st.value.mode].name.toLowerCase()}` })));
  d.add(drone.watch(v => { droneBtn.textContent = v ? 'Выключить бурдон' : 'Бурдон: тоника снизу'; }));
  d.add(() => stopDrone());

  const metal = h('details', { class: 'card explainer' },
    h('summary', null, 'Почему фригийский звучит «металлически»'),
    h('p', null, 'Всё дело в ♭2 — ноте на полутон выше тоники. Полутон — самое острое расстояние в музыке: такая нота трётся о тонику и тянет в неё обратно. В миноре вторая ступень на тон выше — спокойно; во фригийском — на полутон, и от этого тревожно и тяжело.'),
    h('p', null, 'В риффах это ход пауэр-аккордами 1 → ♭2 → 1: в Drop D — открытая 6-я струна, потом 1-й лад, и снова открытая. Добавь ♭5 или ♭6 — и получится классический тёмный метал-рифф.'),
    h('p', null, 'Фригийский доминантовый поднимает терцию (♭3 → 3): ♭2 и 3 оказываются через полтора тона — восточный, «пустынный» колорит.'),
    h('p', { class: 'muted' }, 'Попробуй: включи бурдон на ре и сыграй ре – ми♭ – ре – фа – ми♭ – ре.'));

  const el = h('div', { class: 'screen theory th-modes' },
    screenHeader({ eyebrow: 'Теория', title: 'Лады', back: '#/theory' }),
    h('p', { class: 'lead' }, 'Лад — гамма со своим «домом». Одна нота меняет настроение: характерная нота подсвечена лаймовым. Включи бурдон и импровизируй — так характер лада слышнее всего.'),
    h('div', { class: 'setting' }, h('b', null, 'Лад'), modes.el),
    h('div', { class: 'setting' }, h('b', null, 'Тоника'), tonics.el),
    head, formula, about,
    h('div', { class: 'row' }, droneBtn, playMode),
    quickSettings(),
    h('div', { class: 'setting' }, h('b', null, 'Позиция'), posSeg),
    card({ cls: 'neckcard' }, neck.el),
    card({ title: 'Лестница яркости', id: 'ladder' }, ladder, h('p', { class: 'muted note' }, 'От одной тоники: каждый шаг вниз понижает одну ноту на полутон. Нажми — откроется лад.')),
    card({ title: 'Родство и квинтовый круг', id: 'relation' }, relation, h('div', { class: 'dial-wrap' }, dial.el)),
    metal,
    lessonsCard('modes'));
  return { el, title: 'Лады', dispose: () => d.dispose() };
}
