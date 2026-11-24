// earquiz.js — квизы раздела «Слух»: диктант на грифе, найти ноту, собрать аккорд на круге, «кто лишний
// в тональности», интервал на слух (подсказки — только названия песен), аккорд на слух; серии ответов,
// точность по квизам, какой квиз взять в занятие «Сегодня», перенос рекордов «Гитарного круга».
// Чистая логика: задания считаются из настроек и генератора случайных чисел (в проверках — с зерном).
import { mod12, pcOf, spellPc, noteName, defaultDegree, INTERVALS } from './notes.js';
import { CHORD_TYPES, chordPcs, chordRoot, chordSymbol } from './chords.js';
import { MODES, keyTonic, spellScale, diatonicChords } from './scales.js';
import { TUNINGS, pentaPositions, modePositions, bestVoicing } from './neck.js';

/** @typedef {() => number} Rand */

// ---------- случайность ----------
/** Генератор с зерном (mulberry32): одно зерно — одни и те же задания (для проверок и эталонов) */
export function seeded(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** @template T @param {Rand} rand @param {T[]} list @returns {T} */
export const pickOf = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
/** Перемешать копию списка */
export function shuffled(rand, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- диктант на грифе ----------
/** Уровни диктанта: в каких нотах может быть мелодия */
export const DICT_LEVELS = Object.freeze([
  ['penta', 'Пентатоника'], ['scale', 'Гамма'], ['chrom', 'Хроматика'],
]);
/** Тоники (минор): ля, ми, ре, соль, до */
export const DICT_TONICS = Object.freeze([9, 4, 2, 7, 0]);

/**
 * @typedef {{ string: number, fret: number, midi: number, pc: number, degree: string }} WinNote
 * Окно диктанта: позиция минорной пентатоники, гаммы (натуральный минор) или все ноты в тех же ладах ±1.
 * @param {{ level: string, tonic: number, pos: number, tuning: number[] }} o
 * @returns {WinNote[]}
 */
export function dictWindow({ level, tonic, pos, tuning }) {
  const p = Math.max(0, Math.min(4, pos | 0));
  if (level === 'scale') return modePositions(tonic, 'aeolian', tuning)[p].notes.map(n => ({ string: n.string, fret: n.fret, midi: n.midi, pc: n.pc, degree: n.degree }));
  const penta = pentaPositions(tonic, 'minor', tuning)[p];
  if (level !== 'chrom') return penta.notes.map(n => ({ string: n.string, fret: n.fret, midi: n.midi, pc: n.pc, degree: n.degree }));
  const out = [];
  for (let s = 0; s < 6; s++) {
    for (let f = Math.max(0, penta.minFret - 1); f <= penta.maxFret + 1; f++) {
      const midi = tuning[s] + f;
      out.push({ string: s, fret: f, midi, pc: mod12(midi), degree: defaultDegree(midi - tonic) });
    }
  }
  return out;
}

/** Разные высоты окна по возрастанию */
export const windowPitches = win => [...new Set(win.map(n => n.midi))].sort((a, b) => a - b);

/**
 * Мелодия диктанта: count нот, соседние — не дальше кварты (5 полутонов) и не повторяются подряд.
 * ref = 'first' — первая нота дана; 'tonic' — сначала звучит тоника, мелодия от неё.
 * @param {WinNote[]} win @param {{ count: number, ref: string, tonic: number }} o @param {Rand} rand
 * @returns {{ mel: number[], tonicMidi: number }}
 */
export function dictMelody(win, { count, ref, tonic }, rand) {
  const pitches = windowPitches(win);
  const tonics = pitches.filter(m => mod12(m) === mod12(tonic));
  const n = Math.max(2, Math.min(6, count | 0));
  let cur = ref === 'tonic' && tonics.length ? pickOf(rand, tonics) : pickOf(rand, pitches);
  const mel = [cur];
  while (mel.length < n) {
    const near = pitches.filter(m => m !== cur && Math.abs(m - cur) <= 5);
    cur = pickOf(rand, near.length ? near : pitches.filter(m => m !== cur));
    mel.push(cur);
  }
  return { mel, tonicMidi: tonics[0] ?? pitches[0] };
}

/**
 * Где показать высоту на грифе: в окне (нижняя струна), иначе на струне prefer, иначе первое место до 12-го лада.
 * @param {number} midi @param {number[]} tuning @param {{ win?: WinNote[], prefer?: number | null }} [o]
 */
export function placeOf(midi, tuning, { win = [], prefer = null } = {}) {
  const inWin = win.filter(n => n.midi === midi).sort((a, b) => a.string - b.string)[0];
  if (inWin) return { string: inWin.string, fret: inWin.fret };
  if (prefer != null && midi - tuning[prefer] >= 0 && midi - tuning[prefer] <= 22) return { string: prefer, fret: midi - tuning[prefer] };
  for (let s = 0; s < 6; s++) { const f = midi - tuning[s]; if (f >= 0 && f <= 12) return { string: s, fret: f }; }
  return { string: 0, fret: Math.max(0, midi - tuning[0]) };
}

// ---------- найти ноту ----------
/** @param {Rand} rand @returns {{ string: number, pc: number }} */
export const findTask = rand => ({ string: Math.floor(rand() * 6) % 6, pc: Math.floor(rand() * 12) % 12 });
/** Верно ли нажато место (лады 0–12) */
export const findCheck = (task, string, fret, tuning) => string === task.string && fret >= 0 && fret <= 12 && mod12(tuning[string] + fret) === task.pc;
/** Лады, где нота лежит на струне задания (0–12; у открытой — и 12-й) */
export const findFrets = (task, tuning) => [0, 12].map(o => mod12(task.pc - tuning[task.string]) + o).filter(f => f <= 12);
/**
 * Ответ гитарой: сыгранная нота (целый midi) — та же высота и её можно взять на струне задания в ладах 0–12.
 * @returns {{ ok: boolean, fret: number }}
 */
export function findHeard(task, note, tuning) {
  const fret = note - tuning[task.string];
  return { ok: mod12(note) === task.pc && fret >= 0 && fret <= 12, fret };
}

// ---------- собрать аккорд на круге ----------
export const BUILD_TYPES = Object.freeze(['maj', 'min', 'maj', 'min', 'dim', 'aug', 'sus4', 'power']);
/** @param {Rand} rand */
export const buildTask = rand => ({ pc: Math.floor(rand() * 12) % 12, type: pickOf(rand, [...BUILD_TYPES]) });
/** Шаги от ноты к ноте: maj → «4 + 3» */
export const buildSteps = type => CHORD_TYPES[type].st.slice(1).map((s, i) => s - CHORD_TYPES[type].st[i]).join(' + ');
/**
 * @param {{ pc: number, type: string }} task @param {Iterable<number>} selected
 * @returns {{ ok: boolean, missing: number[], extra: number[], want: number[] }}
 */
export function buildCheck(task, selected) {
  const want = chordPcs(task.pc, task.type), sel = new Set([...selected].map(mod12));
  const missing = want.filter(p => !sel.has(p)), extra = [...sel].filter(p => !want.includes(p)).sort((a, b) => a - b);
  return { ok: !missing.length && !extra.length, missing, extra, want };
}

// ---------- кто лишний в тональности ----------
/**
 * Три аккорда тональности (мажор или натуральный минор, без уменьшённого) и один чужой: в нём есть нота не из гаммы.
 * @param {Rand} rand
 */
export function oddTask(rand) {
  const minor = rand() < 0.5, mode = minor ? 'aeolian' : 'ionian';
  const tonic = keyTonic(Math.floor(rand() * 12) % 12, mode);
  const scale = spellScale(tonic, MODES[mode].st);
  const scalePcs = new Set(scale.map(pcOf));
  const dia = diatonicChords(tonic, mode).filter(c => c.type === 'maj' || c.type === 'min');
  const good = shuffled(rand, dia).slice(0, 3).map(c => ({ rootPc: c.rootPc, type: c.type, root: c.root, roman: c.roman }));
  let bad = null;
  for (let guard = 0; !bad && guard < 200; guard++) {
    const type = pickOf(rand, ['maj', 'min']), rootPc = Math.floor(rand() * 12) % 12;
    if (chordPcs(rootPc, type).some(p => !scalePcs.has(p))) bad = { rootPc, type, root: chordRoot(rootPc, type), roman: '' };
  }
  const options = shuffled(rand, [...good, bad]);
  const foreign = chordPcs(bad.rootPc, bad.type).filter(p => !scalePcs.has(p));
  return { tonic, mode, scale, options, bad: options.indexOf(bad), foreign };
}
/** Подпись аккорда для ответа */
export const chordText = (c, german = false) => chordSymbol(c.root, c.type, { german });

// ---------- интервал на слух ----------
export const IV_LEVELS = Object.freeze({
  easy: Object.freeze([3, 4, 7, 12]),
  medium: Object.freeze([1, 2, 3, 4, 5, 7, 9, 12]),
  all: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
});
export const IV_LEVEL_NAMES = Object.freeze([['easy', 'Лёгкий'], ['medium', 'Средний'], ['all', 'Все 12']]);
export const IV_DIRS = Object.freeze([['up', 'Вверх'], ['down', 'Вниз'], ['harm', 'Вместе'], ['mix', 'Вперемешку']]);

/**
 * Подсказки — только названия песен и мелодий (без исполнителей, текстов и табов), и только надёжные:
 * где не уверен — подсказки нет, остаётся характер интервала.
 */
export const SONGS = Object.freeze({
  up: Object.freeze({
    1: '«Челюсти» — тема из фильма',
    2: '«Happy Birthday to You» — второй и третий слог',
    3: '«Smoke on the Water» — первые две ноты риффа; «Greensleeves» — начало',
    4: '«When the Saints Go Marching In» — начало',
    5: '«Amazing Grace» — начало; «Свадебный хор» из оперы «Лоэнгрин»',
    6: '«Мария» из мюзикла «Вестсайдская история» — первые два слога',
    7: '«Звёздные войны» — главная тема; «Twinkle, Twinkle, Little Star»',
    8: '«The Entertainer» — скачок вверх после первых трёх нот',
    9: '«My Bonnie Lies over the Ocean» — начало',
    10: '«Somewhere» из мюзикла «Вестсайдская история» — начало',
    12: '«Over the Rainbow» — первые две ноты',
  }),
  down: Object.freeze({
    1: '«К Элизе» — начало',
    2: '«Yesterday» — первые два слога',
    3: '«Hey Jude» — первые две ноты',
    4: '«Swing Low, Sweet Chariot» — начало; Пятая симфония — «та-та-та-там»',
    5: '«Маленькая ночная серенада» — первые две ноты',
  }),
});
/** Подсказка-песня к интервалу: «вместе» — как вверх; null — надёжной подсказки нет */
export const songHint = (st, dir) => (dir === 'down' ? SONGS.down : SONGS.up)[st] || null;

/**
 * Задание: интервал st из уровня, направление, две высоты (нижняя — от ля до соль♯ малой октавы).
 * @param {string} level @param {string} dir @param {Rand} rand
 */
export function intervalTask(level, dir, rand) {
  const st = pickOf(rand, [...(IV_LEVELS[level] || IV_LEVELS.easy)]);
  const d = dir === 'mix' ? pickOf(rand, ['up', 'down', 'harm']) : dir;
  const low = 45 + (Math.floor(rand() * 12) % 12);
  return { st, dir: d, a: d === 'down' ? low + st : low, b: d === 'down' ? low : low + st, lowPc: mod12(low) };
}
/** Название интервала для ответа */
export const ivName = st => INTERVALS[st];

// ---------- аккорд на слух ----------
export const CHORD_LEVELS = Object.freeze({
  easy: Object.freeze(['maj', 'min']),
  medium: Object.freeze(['maj', 'min', 'power', 'sus4', 'dim', 'aug']),
  sevenths: Object.freeze(['maj7', 'dom7', 'm7', 'm7b5', 'dim7']),
});
export const CHORD_LEVEL_NAMES = Object.freeze([['easy', 'Мажор/минор'], ['medium', '+ пауэр, sus4, dim, aug'], ['sevenths', 'Септаккорды']]);
export const CHORD_EAR_NAMES = Object.freeze({ maj: 'Мажор', min: 'Минор', power: 'Пауэр', sus4: 'Sus4', dim: 'Уменьш.', aug: 'Увелич.', maj7: 'maj7', dom7: '7', m7: 'm7', m7b5: 'm7♭5', dim7: 'dim7' });
/** Как звучит аккорд — одной фразой: на это и стоит опираться, узнавая его на слух */
export const CHORD_FEEL = Object.freeze({
  maj: 'светлый, устойчивый', min: 'грустный, мягкий', power: 'пустой и мощный — ни мажор, ни минор (терции нет)',
  sus4: 'подвешенный — хочет разрешиться в мажор или минор', dim: 'тесный, тревожный', aug: 'зыбкий, «сказочный», без опоры',
  maj7: 'мечтательный, мягкий', dom7: 'блюзовый, тянет дальше', m7: 'мягкий минор, фанковый', m7b5: 'тёмный, напряжённый', dim7: 'драматичный, «киношный»',
});
/** @param {string} level @param {string} tuningId @param {Rand} rand */
export function chordTask(level, tuningId, rand) {
  const type = pickOf(rand, [...(CHORD_LEVELS[level] || CHORD_LEVELS.easy)]);
  const pc = Math.floor(rand() * 12) % 12;
  const v = bestVoicing(type, pc, tuningId, 5);
  return { type, pc, frets: v ? v.frets : null, shape: v ? v.shape.name : '' };
}
/** Высоты аккорда задания (от 6-й струны к 1-й) */
export const chordTaskMidis = (task, tuning) => (task.frets || []).flatMap((f, s) => (f == null ? [] : [tuning[s] + f]));
/** «A♭m», «F♯7» — с правильным написанием корня */
export const chordTaskName = (task, german = false) => chordSymbol(chordRoot(task.pc, task.type), task.type, { german });

// ---------- серии и точность ----------
/** Квизы раздела: id для серий, точности и «Сегодня» */
export const QUIZZES = Object.freeze({
  dictation: 'Диктант', callback: 'Перекличка', intervals: 'Интервалы', chords: 'Аккорды на слух',
  find: 'Найти ноту', build: 'Собрать аккорд', odd: 'Кто лишний',
});

/**
 * Серия правильных ответов подряд: верно — +1, неверно — с нуля. Лучшая серия запоминается.
 * @param {{ cur: number, best: number }} s @param {boolean} ok
 */
export function nextStreak(s, ok) {
  const cur = ok ? (s.cur || 0) + 1 : 0;
  return { cur, best: Math.max(s.best || 0, cur), record: ok && cur > (s.best || 0) };
}

/**
 * Точность по квизам — для графиков «Прогресса» и подбора занятия: { id: { right, total, last } }.
 * @param {Record<string, { right: number, total: number, last: string }>} stats @param {string} quiz @param {boolean} ok @param {string} date
 */
export function recordAnswer(stats, quiz, ok, date) {
  const s = stats?.[quiz] || { right: 0, total: 0, last: '' };
  return { ...(stats || {}), [quiz]: { right: s.right + (ok ? 1 : 0), total: s.total + 1, last: date } };
}
/** Доля верных в процентах (null — ещё не отвечал) */
export const accuracy = s => (s && s.total ? Math.round((100 * s.right) / s.total) : null);

// ---------- «Слух» в занятии «Сегодня» ----------
/** По кругу: перекличка (подбор риффов на слух) → интервалы → диктант → аккорды */
export const EAR_ROTATION = Object.freeze(['callback', 'intervals', 'dictation', 'chords']);
const EAR_DETAIL = {
  callback: 'Перекличка: услышь фразу — повтори на гитаре',
  intervals: 'Интервалы на слух: терции, квинта, октава',
  dictation: 'Диктант: найди мелодию на грифе',
  chords: 'Аккорды на слух: мажор или минор?',
};
/**
 * Какой квиз взять в шаг «Слух»: тот, что дольше всего не делал (ещё не делал — по порядку круга).
 * @param {Record<string, { last?: string }>} [stats]
 * @returns {{ page: string, detail: string }}
 */
export function earDrill(stats = {}) {
  let best = EAR_ROTATION[0], bestLast = null;
  for (const id of EAR_ROTATION) {
    const last = stats?.[id]?.last || '';
    if (bestLast === null || last < bestLast) { best = id; bestLast = last; }
  }
  return { page: best, detail: EAR_DETAIL[best] };
}

// ---------- перенос из «Гитарного круга» (этап 6) ----------
const V2_IDS = { dict: 'dictation', find: 'find', build: 'build', odd: 'odd', iv: 'intervals', chord: 'chords' };
/**
 * Рекорды слуха «Гитарного круга» (gk3.earBest: { dict, find, build, odd, iv, chord }) → лучшие серии «Лада».
 * Берётся большее из двух: перенос ничего не уменьшает.
 * @param {Record<string, any>} v2Best @param {Record<string, number>} [mine]
 */
export function mergeV2EarBest(v2Best, mine = {}) {
  const out = { ...mine };
  for (const [old, id] of Object.entries(V2_IDS)) {
    const n = Number(v2Best?.[old]);
    if (Number.isFinite(n) && n > 0) out[id] = Math.max(out[id] || 0, Math.floor(n));
  }
  return out;
}
/**
 * Настройки квизов «Гитарного круга» (gk3.ear) → настройки «Лада» (то, что совпадает по смыслу)
 * @param {any} [q]
 */
export function v2EarPrefs(q = {}) {
  const out = {};
  if (q && typeof q === 'object') {
    const d = {};
    if (DICT_LEVELS.some(([v]) => v === q.dLevel)) d.level = q.dLevel;
    if ([2, 3, 4, 5].includes(Number(q.dCount))) d.count = Number(q.dCount);
    if (q.dRef === 'first' || q.dRef === 'tonic') d.ref = q.dRef;
    if (Number.isInteger(Number(q.dRoot)) && DICT_TONICS.includes(mod12(Number(q.dRoot)))) d.tonic = mod12(Number(q.dRoot));
    if ([0, 1, 2, 3, 4].includes(Number(q.dPos))) d.pos = Number(q.dPos);
    if (Object.keys(d).length) out.dictation = d;
    const iv = {};
    if (q.ivLevel in IV_LEVELS || q.ivLevel === 'hard') iv.level = q.ivLevel === 'hard' ? 'all' : q.ivLevel;
    if (IV_DIRS.some(([v]) => v === q.ivDir)) iv.dir = q.ivDir;
    if (Object.keys(iv).length) out.intervals = iv;
    const ch = {};
    if (q.chLevel === 'easy' || q.chLevel === 'medium') ch.level = q.chLevel;
    if (q.chLevel === 'hard') ch.level = 'sevenths';
    if (Object.keys(ch).length) out.chords = ch;
  }
  return out;
}

/** Название ноты без контекста (для подписей заданий) */
export const pcName = (pc, german = false) => noteName(spellPc(pc), { german });
export { TUNINGS };
