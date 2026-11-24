// scales.js — лады, пентатоника, тональности, знаки, диатонические аккорды, квинтовый круг,
// готовые последовательности. Чистая логика.
import { mod12, pcOf, spellAs, spellPc, sameNote, spellingCost, degreeLabel } from './notes.js';
import { classifyChord } from './chords.js';

/**
 * 7 ладов мажора, гармонический минор и фригийский доминантовый.
 * st — полутоны ступеней; parentStep — на какой ступени родительского мажора лад начинается
 * (дорийский — со 2-й ступени, то есть на 2 полутона выше тоники мажора); characteristic —
 * характерные ступени: то, чем лад отличается от ближайшего «обычного» мажора или минора.
 */
export const MODES = Object.freeze({
  ionian: { name: 'Ионийский', alt: 'натуральный мажор', st: [0, 2, 4, 5, 7, 9, 11], parentStep: 0, family: 'major', characteristic: [11] },
  dorian: { name: 'Дорийский', alt: 'минор с большой секстой', st: [0, 2, 3, 5, 7, 9, 10], parentStep: 2, family: 'minor', characteristic: [9] },
  phrygian: { name: 'Фригийский', alt: 'минор с малой секундой', st: [0, 1, 3, 5, 7, 8, 10], parentStep: 4, family: 'minor', characteristic: [1] },
  lydian: { name: 'Лидийский', alt: 'мажор с увеличенной квартой', st: [0, 2, 4, 6, 7, 9, 11], parentStep: 5, family: 'major', characteristic: [6] },
  mixolydian: { name: 'Миксолидийский', alt: 'мажор с малой септимой', st: [0, 2, 4, 5, 7, 9, 10], parentStep: 7, family: 'major', characteristic: [10] },
  aeolian: { name: 'Эолийский', alt: 'натуральный минор', st: [0, 2, 3, 5, 7, 8, 10], parentStep: 9, family: 'minor', characteristic: [8] },
  locrian: { name: 'Локрийский', alt: 'минор с уменьшённой квинтой', st: [0, 1, 3, 5, 6, 8, 10], parentStep: 11, family: 'minor', characteristic: [6] },
  harmonic: { name: 'Гармонический минор', alt: 'минор с большой септимой', st: [0, 2, 3, 5, 7, 8, 11], parentStep: null, family: 'minor', characteristic: [11] },
  phrygdom: { name: 'Фригийский доминантовый', alt: '5-й лад гармонического минора', st: [0, 1, 4, 5, 7, 8, 10], parentStep: null, family: 'minor', characteristic: [1, 4] },
});
/** Порядок ладов мажора (от 1-й ступени) и два «экзотических» в конце */
export const MODE_ORDER = Object.freeze(['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'harmonic', 'phrygdom']);
/** Лестница яркости: от самого светлого к самому тёмному, каждый шаг понижает одну ступень на полутон */
export const BRIGHTNESS = Object.freeze(['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian']);

/** Ступени лада: дорийский → 1 2 ♭3 4 5 6 ♭7 */
export const modeDegrees = id => MODES[id].st.map((st, i) => degreeLabel(st, i));
/** Характерные ступени лада подписью: фригийский → ♭2 */
export const characteristicDegrees = id => MODES[id].characteristic.map(st => modeDegrees(id)[MODES[id].st.indexOf(st)]);

/** Гамма от тоники: каждой ступени — своя буква (поэтому в фа мажоре B♭, а не A♯) */
export const spellScale = (tonic, st) => st.map((s, i) => spellAs(pcOf(tonic) + s, tonic.letter + i));

/**
 * Как назвать тонику: из двух написаний (диез или бемоль) — то, при котором в гамме меньше знаков;
 * при равенстве — диезы (F♯ мажор, а не G♭).
 */
export function keyTonic(pc, modeId) {
  const sharp = spellPc(pc), flat = spellPc(pc, { flat: true });
  if (sameNote(sharp, flat)) return sharp;
  const st = MODES[modeId].st;
  return spellingCost(spellScale(flat, st)) < spellingCost(spellScale(sharp, st)) ? flat : sharp;
}

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F
/**
 * Знаки при ключе. Гармонический минор и фригийский доминантовый пишутся со знаками
 * натурального минора и фригийского: повышенная ступень — случайный знак, а не ключевой.
 */
export function keySignature(tonic, modeId) {
  const base = modeId === 'harmonic' ? 'aeolian' : modeId === 'phrygdom' ? 'phrygian' : modeId;
  const notes = spellScale(tonic, MODES[base].st);
  const pick = (order, test) => order.map(l => notes.find(n => n.letter === l && test(n.acc))).filter(Boolean);
  const sharps = pick(SHARP_ORDER, a => a > 0), flats = pick(FLAT_ORDER, a => a < 0);
  return { sharps: sharps.length, flats: flats.length, list: sharps.length ? sharps : flats };
}

/**
 * Родительский мажор лада: D дорийский → C мажор.
 * Тоника мажора — та ступень лада, с которой начинается «круг» ионийского.
 */
export function parentMajor(tonic, modeId) {
  const i = MODE_ORDER.indexOf(modeId);
  if (MODES[modeId].parentStep == null) return null;
  return spellScale(tonic, MODES[modeId].st)[(7 - i) % 7];
}

// ---------- пентатоника ----------
/**
 * steps — цикл шагов между соседними нотами (минорная: 3-2-2-3-2), blueSt — блюзовая нота в полутонах от тоники.
 */
export const PENTATONICS = Object.freeze({
  minor: { name: 'Минорная пентатоника', st: [0, 3, 5, 7, 10], letters: [0, 2, 3, 4, 6], steps: [3, 2, 2, 3, 2], blueSt: 6 },
  major: { name: 'Мажорная пентатоника', st: [0, 2, 4, 7, 9], letters: [0, 1, 2, 4, 5], steps: [2, 2, 3, 2, 3], blueSt: 3 },
});
export const pentaDegrees = kind => PENTATONICS[kind].st.map((st, i) => degreeLabel(st, PENTATONICS[kind].letters[i]));
export const spellPenta = (tonic, kind) => PENTATONICS[kind].st.map((st, i) => spellAs(pcOf(tonic) + st, tonic.letter + PENTATONICS[kind].letters[i]));

// ---------- диатонические аккорды ----------
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const LOWER = new Set(['min', 'dim', 'm7', 'm7b5', 'dim7', 'mmaj7']);
const ROMAN_SUFFIX = { maj: '', min: '', dim: '°', aug: '+', maj7: 'maj7', dom7: '7', m7: '7', m7b5: 'ø7', dim7: '°7', mmaj7: '(maj7)', maj7s5: '+maj7' };
/** Римская цифра ступени: минорные — строчными (ii), уменьшённые — с ° */
export const romanFor = (degree, type) => (LOWER.has(type) ? ROMAN[degree].toLowerCase() : ROMAN[degree]) + (ROMAN_SUFFIX[type] ?? '');

/**
 * Аккорды на каждой ступени лада: берём ноты «через одну» внутри лада.
 * @returns {{ degree: number, root: import('./notes.js').Note, rootPc: number, type: string | null, roman: string }[]}
 */
export function diatonicChords(tonic, modeId, { sevenths = false } = {}) {
  const st = MODES[modeId].st;
  return spellScale(tonic, st).map((root, i) => {
    const up = k => mod12(st[(i + k) % 7] - st[i]);
    const type = sevenths ? classifyChord(up(2), up(4), up(6)) : classifyChord(up(2), up(4));
    return { degree: i, root, rootPc: pcOf(root), type, roman: romanFor(i, type) };
  });
}

// ---------- квинтовый круг ----------
/**
 * 12 тональностей по кругу: k шагов по квинте от C. Внутри — параллельный минор
 * (на малую терцию ниже), знаки и написание тоник.
 */
export const FIFTHS = Object.freeze(Array.from({ length: 12 }, (_, k) => {
  const pc = mod12(7 * k), minorPc = mod12(pc + 9);
  const major = keyTonic(pc, 'ionian'), minor = keyTonic(minorPc, 'aeolian');
  return { k, pc, minorPc, major, minor, signature: keySignature(major, 'ionian') };
}));
/** Номер мажорной тональности на круге: G → 1, F → 11 */
export const fifthsIndex = pc => mod12(pc * 7);
/** Одноимённый минор (та же тоника): C → Cm */
export const parallelMinor = pc => keyTonic(pc, 'aeolian');
/** Одноимённый мажор: Am → A */
export const parallelMajor = pc => keyTonic(pc, 'ionian');

// ---------- последовательности ----------
/** degrees — ступени (0 = I), type — тип для всех аккордов, override — тип для отдельных ступеней */
export const PROGRESSIONS = Object.freeze({
  major: [
    { id: 'pop', name: 'I–V–vi–IV', degrees: [0, 4, 5, 3] },
    { id: 'rock', name: 'I–IV–V–IV', degrees: [0, 3, 4, 3] },
    { id: 'fifties', name: 'I–vi–IV–V', degrees: [0, 5, 3, 4] },
    { id: 'emo', name: 'vi–IV–I–V', degrees: [5, 3, 0, 4] },
    { id: 'cadence', name: 'I–IV–V–I', degrees: [0, 3, 4, 0] },
    { id: 'blues', name: '12-тактовый блюз', degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], type: 'dom7' },
  ],
  minor: [
    { id: 'epic', name: 'i–VI–III–VII', degrees: [0, 5, 2, 6] },
    { id: 'metal', name: 'i–VII–VI–VII', degrees: [0, 6, 5, 6] },
    { id: 'ivv', name: 'i–iv–v–i', degrees: [0, 3, 4, 0] },
    { id: 'andal', name: 'i–VII–VI–V (андалузская)', degrees: [0, 6, 5, 4], override: { 4: 'maj' } },
    { id: 'vi', name: 'i–VI–VII–i', degrees: [0, 5, 6, 0] },
    { id: 'mblues', name: 'Минорный блюз', degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], type: 'm7', override: { 4: 'dom7' } },
  ],
});

/**
 * Аккорды последовательности в тональности. В блюзе мажорные ступени становятся септаккордами,
 * в минорном блюзе мажорные — доминантсептаккордами, а V — всегда доминантой.
 */
export function progressionChords(tonic, modeId, prog) {
  const dia = diatonicChords(tonic, modeId);
  return prog.degrees.map(d => {
    const c = dia[d];
    let type = c.type;
    if (prog.type) type = prog.type === 'm7' && c.type === 'maj' ? 'dom7' : prog.type;
    if (prog.override && prog.override[d]) type = prog.override[d];
    return { degree: d, root: c.root, rootPc: c.rootPc, type, roman: romanFor(d, type) };
  });
}
