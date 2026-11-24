// callback.js — «Перекличка»: приложение играет короткую фразу, ты повторяешь её на гитаре, приложение проверяет.
// Прямая тренировка подбора риффов на слух. Два вида фраз:
//  • пентатоника — минорная пентатоника линейками, в выбранной позиции (на уровнях повыше — в двух соседних);
//  • рифф — низкие струны от открытой тоники: в Drop D — ре минор (пауэр-аккорды одним пальцем),
//    в Standard — ми минор; на уровнях повыше — фригийская ♭2 и блюзовая ♭5.
// Сложность растёт сама: 3 чистых повтора подряд — уровень выше, 2 неудачи подряд — ниже.
// Чистая логика: фраза считается из настроек и генератора случайных чисел.
import { mod12, defaultDegree } from './notes.js';
import { pentaPositions } from './neck.js';
import { pickOf } from './earquiz.js';

/**
 * Уровни: сколько нот, насколько далеко может шагнуть мелодия (полутоны), где играть, свой ритм.
 * @typedef {{ id: number, title: string, hint: string, count: number, maxStep: number, wide: boolean, rhythm: boolean, bpm: number }} Level
 */
export const LEVELS = Object.freeze([
  { id: 1, title: 'Две ноты', hint: 'две ноты рядом — куда сдвинулась мелодия?', count: 2, maxStep: 3, wide: false, rhythm: false, bpm: 76 },
  { id: 2, title: 'Три ноты', hint: 'три ноты, шаги до терции', count: 3, maxStep: 4, wide: false, rhythm: false, bpm: 80 },
  { id: 3, title: 'Четыре ноты', hint: 'четыре ноты, шаги до кварты', count: 4, maxStep: 5, wide: false, rhythm: false, bpm: 84 },
  { id: 4, title: 'Шире', hint: 'четыре ноты, скачки до квинты, шире позиции', count: 4, maxStep: 7, wide: true, rhythm: false, bpm: 88 },
  { id: 5, title: 'Свой ритм', hint: 'четыре ноты с ритмом: восьмые, синкопа, галоп', count: 4, maxStep: 7, wide: true, rhythm: true, bpm: 92 },
]);
export const MAX_LEVEL = LEVELS.length;
export const levelOf = n => LEVELS[Math.max(1, Math.min(MAX_LEVEL, n | 0)) - 1];

/** Виды фраз */
export const MODES = Object.freeze([['penta', 'Пентатоника'], ['riff', 'Рифф на низких струнах']]);

/** Ритмы фраз (в долях) — для 2, 3 и 4 нот; последняя нота длиннее, чтобы фраза «закрывалась» */
const RHYTHMS = {
  2: [[0.5, 1.5], [1.5, 0.5]],
  3: [[0.5, 0.5, 1], [1, 0.5, 1.5], [0.75, 0.75, 1.5]],
  4: [[0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1], [0.75, 0.75, 0.5, 1], [0.5, 0.25, 0.25, 1], [0.5, 0.5, 0.5, 1.5]],
};

/** Ступени риффа (полутоны от тоники) по уровням: сначала опоры, потом краски — ♭2 (фригийская) и ♭5 (блюзовая) */
const RIFF_ST = { 1: [0, 3, 5, 7], 2: [0, 3, 5, 7], 3: [0, 3, 5, 7, 10, 12], 4: [0, 1, 3, 5, 6, 7, 8, 10, 12], 5: [0, 1, 3, 5, 6, 7, 8, 10, 12] };

/**
 * @typedef {{ string: number, fret: number, midi: number, degree: string }} Spot
 * @typedef {{ notes: Spot[], beats: number[], bpm: number, level: number, mode: string, tonicPc: number, tonicName?: string }} Phrase
 */

/** Тоника риффа: в Drop D — ре (открытая 6-я струна), в Standard — ми */
export const riffTonic = tuning => mod12(tuning[0]);

/**
 * Где можно играть: ноты позиции пентатоники (на «широких» уровнях — и следующей позиции)
 * или ноты риффа на 6-й и 5-й струнах (лады 0–8).
 * @param {{ mode: string, level: number, tonic: number, pos: number, tuning: number[] }} o
 * @returns {Spot[]}
 */
export function phraseSpots({ mode, level, tonic, pos, tuning }) {
  const L = levelOf(level);
  if (mode === 'riff') {
    const root = tuning[0], allowed = RIFF_ST[L.id];
    const out = [];
    for (const s of [0, 1]) for (let f = 0; f <= 8; f++) {
      const midi = tuning[s] + f, st = midi - root;
      if (allowed.includes(st) && !out.some(o => o.midi === midi)) out.push({ string: s, fret: f, midi, degree: st === 12 ? '8' : defaultDegree(st) });
    }
    return out.sort((a, b) => a.midi - b.midi);
  }
  const all = pentaPositions(tonic, 'minor', tuning);
  const p = Math.max(0, Math.min(4, pos | 0));
  const list = L.wide ? [...all[p].notes, ...all[(p + 1) % 5].notes.filter(n => Math.abs(n.fret - all[p].maxFret) <= 4)] : all[p].notes;
  const out = [];
  for (const n of list) if (!out.some(o => o.midi === n.midi)) out.push({ string: n.string, fret: n.fret, midi: n.midi, degree: n.degree });
  return out.sort((a, b) => a.midi - b.midi);
}

/**
 * Фраза: count нот, соседние — разные и не дальше maxStep полутонов. Рифф начинается с открытой тоники
 * и возвращается к ней через ноту (как «педаль» в метал-риффе); пентатоника — с тоники или квинты позиции.
 * @param {{ mode: string, level: number, tonic: number, pos: number, tuning: number[] }} o
 * @param {() => number} rand
 * @returns {Phrase}
 */
export function makePhrase(o, rand) {
  const L = levelOf(o.level);
  const spots = phraseSpots(o);
  const tonicPc = o.mode === 'riff' ? riffTonic(o.tuning) : mod12(o.tonic);
  const midis = spots.map(s => s.midi);
  let first;
  if (o.mode === 'riff') first = midis[0];
  else {
    const anchors = spots.filter(s => s.degree === '1' || s.degree === '5').map(s => s.midi);
    first = pickOf(rand, anchors.length ? anchors : midis);
  }
  const mel = [first];
  while (mel.length < L.count) {
    const cur = mel[mel.length - 1];
    // в риффе после ноты не на тонике — часто возврат к открытой тонике (на уровнях 3+)
    if (o.mode === 'riff' && L.id >= 3 && cur !== midis[0] && mel.length < L.count - 1 && rand() < 0.5) { mel.push(midis[0]); continue; }
    const near = midis.filter(m => m !== cur && Math.abs(m - cur) <= L.maxStep);
    mel.push(pickOf(rand, near.length ? near : midis.filter(m => m !== cur)));
  }
  const beats = L.rhythm ? [...pickOf(rand, RHYTHMS[L.count] || RHYTHMS[4])] : mel.map((_, i) => (i === mel.length - 1 ? 2 : 1));
  return { notes: mel.map(m => ({ ...spots.find(s => s.midi === m) })), beats, bpm: L.bpm, level: L.id, mode: o.mode, tonicPc };
}

/**
 * Как прошла попытка: clean — сыграно без ошибок; messy — сыграно, но с ошибками; fail — сдался (показал ответ).
 * @param {{ done: boolean, misses: number, gaveUp?: boolean }} r
 * @returns {'clean' | 'messy' | 'fail'}
 */
export const grade = r => (r.gaveUp || !r.done ? 'fail' : r.misses === 0 ? 'clean' : 'messy');

/**
 * Рост сложности: 3 чистых повтора подряд — уровень выше; 2 неудачи подряд — уровень ниже (без наказаний,
 * просто фраза полегче). Ошибки по дороге уровень не меняют.
 * @param {{ level: number, clean?: number, fails?: number }} p @param {'clean' | 'messy' | 'fail'} result
 * @returns {{ level: number, clean: number, fails: number, change: -1 | 0 | 1 }}
 */
export function progress(p, result) {
  let level = Math.max(1, Math.min(MAX_LEVEL, p.level | 0 || 1)), clean = p.clean || 0, fails = p.fails || 0;
  /** @type {-1 | 0 | 1} */
  let change = 0;
  if (result === 'clean') {
    clean++; fails = 0;
    if (clean >= 3 && level < MAX_LEVEL) { level++; clean = 0; change = 1; }
  } else if (result === 'fail') {
    fails++; clean = 0;
    if (fails >= 2 && level > 1) { level--; fails = 0; change = -1; }
  } else { clean = 0; fails = 0; }
  return { level, clean, fails, change };
}

/**
 * Что делала мелодия — подсказка «куда слушать», не выдающая ответ: вверх/вниз и на сколько.
 * @param {number[]} mel
 */
export function contour(mel) {
  return mel.slice(1).map((m, i) => {
    const d = m - mel[i];
    const size = Math.abs(d) <= 2 ? 'шаг' : Math.abs(d) <= 4 ? 'терция' : Math.abs(d) <= 5 ? 'кварта' : 'скачок';
    return `${d > 0 ? '↑' : '↓'} ${size}`;
  });
}
