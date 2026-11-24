// chords.js — аккорды: из чего состоят, как пишутся, как называются. Чистая логика.
import { mod12, pcOf, spellAs, spellPc, sameNote, spellingCost, noteName, ruName, degreeLabel } from './notes.js';

/**
 * Типы аккордов. st — полутоны от корня; steps — на сколько букв от корня стоит нота
 * (терция = 2 буквы, кварта = 3, квинта = 4, септима = 6): по ним ноты получают правильные имена.
 */
export const CHORD_TYPES = Object.freeze({
  power: { name: 'Пауэр-аккорд', sym: '5', st: [0, 7], steps: [0, 4] },
  maj: { name: 'Мажор', sym: '', st: [0, 4, 7], steps: [0, 2, 4] },
  min: { name: 'Минор', sym: 'm', st: [0, 3, 7], steps: [0, 2, 4] },
  sus4: { name: 'Sus4', sym: 'sus4', st: [0, 5, 7], steps: [0, 3, 4] },
  dim: { name: 'Уменьшённый', sym: 'dim', st: [0, 3, 6], steps: [0, 2, 4] },
  aug: { name: 'Увеличенный', sym: '+', st: [0, 4, 8], steps: [0, 2, 4] },
  maj7: { name: 'Большой мажорный септаккорд', sym: 'maj7', st: [0, 4, 7, 11], steps: [0, 2, 4, 6] },
  dom7: { name: 'Доминантсептаккорд', sym: '7', st: [0, 4, 7, 10], steps: [0, 2, 4, 6] },
  m7: { name: 'Малый минорный септаккорд', sym: 'm7', st: [0, 3, 7, 10], steps: [0, 2, 4, 6] },
  m7b5: { name: 'Полууменьшённый септаккорд', sym: 'm7♭5', st: [0, 3, 6, 10], steps: [0, 2, 4, 6] },
  dim7: { name: 'Уменьшённый септаккорд', sym: 'dim7', st: [0, 3, 6, 9], steps: [0, 2, 4, 6] },
  mmaj7: { name: 'Минорный с большой септимой', sym: 'm(maj7)', st: [0, 3, 7, 11], steps: [0, 2, 4, 6] },
  maj7s5: { name: 'Увеличенный с большой септимой', sym: 'maj7♯5', st: [0, 4, 8, 11], steps: [0, 2, 4, 6] },
});

/** Ступени аккорда: maj → 1 3 5, m7♭5 → 1 ♭3 ♭5 ♭7 */
export const chordDegrees = type => CHORD_TYPES[type].st.map((st, i) => degreeLabel(st, CHORD_TYPES[type].steps[i]));
/** Высоты аккорда от корня pc */
export const chordPcs = (rootPc, type) => CHORD_TYPES[type].st.map(st => mod12(rootPc + st));

/** Ноты аккорда с правильными именами: B♭ мажор → B♭ D F */
export function spellChord(root, type) {
  const c = CHORD_TYPES[type];
  return c.st.map((st, i) => spellAs(pcOf(root) + st, root.letter + c.steps[i]));
}

/**
 * Как назвать корень аккорда вне тональности: A♯ или B♭?
 * Берём вариант, при котором у нот аккорда меньше знаков; при равенстве — диез.
 */
export function chordRoot(pc, type) {
  const sharp = spellPc(pc), flat = spellPc(pc, { flat: true });
  if (sameNote(sharp, flat)) return sharp;
  return spellingCost(spellChord(flat, type)) < spellingCost(spellChord(sharp, type)) ? flat : sharp;
}

/** «B♭m», «F♯7»; в немецкой нотации — «Bm» для си-бемоль минора */
export const chordSymbol = (root, type, opts = {}) => noteName(root, opts) + CHORD_TYPES[type].sym;

/** «ля минор», «пауэр-аккорд от ре» */
export function chordRuName(root, type) {
  const r = ruName(root, { long: true });
  const names = {
    power: `пауэр-аккорд от ${r}`, maj: `${r} мажор`, min: `${r} минор`, sus4: `${r} sus4`,
    dim: `${r} уменьшённый`, aug: `${r} увеличенный`, maj7: `${r} maj7`, dom7: `${r} септаккорд`,
    m7: `${r} минорный септаккорд`, m7b5: `${r} полууменьшённый`, dim7: `${r} уменьшённый септаккорд`,
    mmaj7: `${r} минор с большой септимой`, maj7s5: `${r} maj7♯5`,
  };
  return names[type] || r;
}

const TRIADS = { '4,7': 'maj', '3,7': 'min', '3,6': 'dim', '4,8': 'aug' };
const SEVENTHS = { '4,7,11': 'maj7', '4,7,10': 'dom7', '3,7,10': 'm7', '3,6,10': 'm7b5', '3,6,9': 'dim7', '3,7,11': 'mmaj7', '4,8,11': 'maj7s5' };
/**
 * Тип аккорда по расстояниям от корня до терции, квинты и (если есть) септимы.
 * @param {number} third @param {number} fifth @param {number | null} [seventh]
 * @returns {string | null}
 */
export function classifyChord(third, fifth, seventh = null) {
  if (seventh == null) return TRIADS[`${third},${fifth}`] || null;
  return SEVENTHS[`${third},${fifth},${seventh}`] || null;
}
