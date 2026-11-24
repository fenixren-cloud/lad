// notes.js — ноты, их написание, высоты, интервалы и ступени. Чистая логика без DOM и звука.
//
// Нота с написанием — { letter, acc }: буква 0..6 (C D E F G A B) и знак −3..+3
// (♭ = −1, ♯ = +1, 𝄫/𝄪 = ±2). Высотный класс (pc) — 0..11, где 0 = до.
// Одна и та же высота пишется по-разному (A♯ и B♭): буква определяется смыслом —
// ступенью гаммы или аккорда, поэтому почти все функции получают букву явно.

export const mod12 = n => ((n % 12) + 12) % 12;
export const mod7 = n => ((n % 7) + 7) % 7;

export const LETTERS = Object.freeze(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
export const RU_LETTERS = Object.freeze(['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си']);
/** Высота натуральной (белой) ноты для каждой буквы */
export const NATURAL_PC = Object.freeze([0, 2, 4, 5, 7, 9, 11]);

const SIGN = { '-3': '♭𝄫', '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪', 3: '♯𝄪' };
const RU_SIGN = { '-3': '-трижды-бемоль', '-2': '-дубль-бемоль', '-1': '-бемоль', 0: '', 1: '-диез', 2: '-дубль-диез', 3: '-трижды-диез' };

/** @typedef {{ letter: number, acc: number }} Note */

/** @returns {Note} */
export const note = (letter, acc = 0) => ({ letter: mod7(letter), acc });
/** @param {Note} n */
export const pcOf = n => mod12(NATURAL_PC[n.letter] + n.acc);
/** @param {Note} a @param {Note} b */
export const sameNote = (a, b) => a.letter === b.letter && a.acc === b.acc;

/**
 * Название ноты: «B♭», «F♯». В немецкой нотации си = H, си-бемоль = B.
 * @param {Note} n
 * @param {{ german?: boolean }} [opts]
 */
export function noteName(n, { german = false } = {}) {
  const sign = SIGN[n.acc];
  if (sign === undefined) return null; // четверные знаки не пишем
  if (german && n.letter === 6) {
    if (n.acc === 0) return 'H';
    if (n.acc === -1) return 'B';
    return 'H' + sign;
  }
  return LETTERS[n.letter] + sign;
}

/** «ля», «си♭» или «си-бемоль» */
export function ruName(n, { long = false } = {}) {
  const sign = (long ? RU_SIGN : SIGN)[n.acc];
  return sign === undefined ? null : RU_LETTERS[n.letter] + sign;
}

const SHARPS = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const FLATS = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
/**
 * Привычное написание высоты без контекста: диезами (по умолчанию) или бемолями.
 * @param {number} pc @param {{ flat?: boolean }} [opts]
 */
export function spellPc(pc, { flat = false } = {}) {
  const [letter, acc] = (flat ? FLATS : SHARPS)[mod12(pc)];
  return note(letter, acc);
}

/**
 * Записать высоту pc заданной буквой: 10 буквой B → B♭, буквой A → A♯.
 * Знак выбирается ближайший (−5..+6); дальше ±3 названия нет.
 */
export function spellAs(pc, letter) {
  const l = mod7(letter);
  let acc = mod12(pc - NATURAL_PC[l]);
  if (acc > 6) acc -= 12;
  return note(l, acc);
}

/** «Цена» написания: каждый знак — 1, двойной — ещё штраф. Нужна, чтобы выбрать написание проще. */
export const spellingCost = notes => notes.reduce((s, n) => s + Math.abs(n.acc) + (Math.abs(n.acc) >= 2 ? 10 : 0), 0);

// ---------- высота звука ----------
export const midiToHz = (m, a4 = 440) => a4 * 2 ** ((m - 69) / 12);
export const hzToMidi = (hz, a4 = 440) => 69 + 12 * Math.log2(hz / a4);
export const octaveOf = m => Math.floor(m / 12) - 1;
/** «A2», «C♯4»; немецкая нотация — «H2» */
export const midiName = (m, opts = {}) => noteName(spellPc(m), opts) + octaveOf(m);

// ---------- интервалы ----------
/** Интервалы от 0 до 12 полутонов: сокращение и ступень, которой интервал становится от тоники */
export const INTERVALS = Object.freeze([
  { st: 0, short: 'ч1', deg: '1', name: 'прима (унисон)' },
  { st: 1, short: 'м2', deg: '♭2', name: 'малая секунда' },
  { st: 2, short: 'б2', deg: '2', name: 'большая секунда' },
  { st: 3, short: 'м3', deg: '♭3', name: 'малая терция' },
  { st: 4, short: 'б3', deg: '3', name: 'большая терция' },
  { st: 5, short: 'ч4', deg: '4', name: 'чистая кварта' },
  { st: 6, short: 'тт', deg: '♭5', name: 'тритон' },
  { st: 7, short: 'ч5', deg: '5', name: 'чистая квинта' },
  { st: 8, short: 'м6', deg: '♭6', name: 'малая секста' },
  { st: 9, short: 'б6', deg: '6', name: 'большая секста' },
  { st: 10, short: 'м7', deg: '♭7', name: 'малая септима' },
  { st: 11, short: 'б7', deg: '7', name: 'большая септима' },
  { st: 12, short: 'ч8', deg: '8', name: 'октава' },
]);

/**
 * Где лежит интервал на грифе, если корень — на ладу 0 некоторой струны.
 * Соседняя струна выше на 5 полутонов, поэтому интервал там на (st − 5) ладов правее корня;
 * при переходе со струны G на струну B — на 4 (st − 4). Через струну — st − 10 или st − 9 с переходом G→B.
 */
export const intervalOnNeck = st => ({ same: st, next: st - 5, gb: st - 4, next2: st - 10, next2gb: st - 9 });

// ---------- ступени ----------
/**
 * Подпись ступени по расстоянию в полутонах и в буквах: (3 полутона, 2 буквы) → «♭3».
 * @param {number} st полутоны от тоники
 * @param {number} letterSteps сколько букв от тоники (0 = 1-я ступень, 2 = терция …)
 */
export function degreeLabel(st, letterSteps) {
  const diff = st - NATURAL_PC[letterSteps % 7] - 12 * Math.floor(letterSteps / 7);
  const sign = diff <= -2 ? '𝄫' : diff === -1 ? '♭' : diff === 1 ? '♯' : diff >= 2 ? '𝄪' : '';
  return sign + (letterSteps + 1);
}
const DEFAULT_DEGREES = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
/** Ступень без контекста буквы: 6 полутонов → «♭5» */
export const defaultDegree = st => DEFAULT_DEGREES[mod12(st)];

/**
 * Роль ступени для цвета: тоника, терция, квинта, септима или прочая.
 * Характерную ноту лада знает только лад — её отмечают отдельно.
 * @returns {'root' | 'third' | 'fifth' | 'seventh' | 'other'}
 */
export function degreeRole(label) {
  const n = String(label).replace(/\D/g, '');
  if (n === '1' || n === '8') return 'root';
  if (n === '3') return 'third';
  if (n === '5') return 'fifth';
  if (n === '7') return 'seventh';
  return 'other';
}
