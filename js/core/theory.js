// theory.js — расчёты для раздела «Теория»: интервалы на грифе, фигуры аккордов на круге, сектор
// квинтового круга, таблица позиций пентатоники, блюзовые ноты, сравнение ладов, значки грифа. Чистая логика.
import { mod12, noteName, spellPc, spellAs, pcOf, INTERVALS, degreeLabel, degreeRole } from './notes.js';
import { CHORD_TYPES, chordRoot, spellChord, chordDegrees } from './chords.js';
import { MODES, BRIGHTNESS, modeDegrees, keyTonic, spellScale, keySignature, FIFTHS, PENTATONICS, spellPenta, pentaDegrees } from './scales.js';
import { MAX_FRET, pentaPositions } from './neck.js';

// ---------- гриф и интервалы ----------
/** Насколько выше следующая (более тонкая) струна: в Standard 5, между G и B — 4, в Drop D между 6-й и 5-й — 7 */
export const stringGap = (tuning, s) => tuning[s + 1] - tuning[s];

/**
 * Где на грифе лежит интервал st от корня (струна s, лад f): на той же струне, на соседней и через одну.
 * Сдвиг на соседней струне = st − (насколько она выше) — поэтому квинта на соседней струне на 2 лада правее,
 * а при переходе G→B на 1 лад дальше, чем на других струнах.
 * @returns {{ string: number, fret: number, shift: number, where: 'same' | 'next' | 'next2', gap: number }[]}
 */
export function intervalPlaces(s, f, st, tuning) {
  const out = [];
  for (let k = 0; k <= 2 && s + k <= 5; k++) {
    const gap = tuning[s + k] - tuning[s];
    const fret = f + st - gap;
    if (fret < 0 || fret > MAX_FRET) continue;
    out.push({ string: s + k, fret, shift: st - gap, where: /** @type {any} */ (['same', 'next', 'next2'][k]), gap: k === 1 ? stringGap(tuning, s) : gap });
  }
  return out;
}

/** «+3 лада», «−1 лад», «тот же лад» */
export function fretShift(n) {
  if (n === 0) return 'тот же лад';
  const a = Math.abs(n), d = a % 10, h = a % 100;
  const w = d === 1 && h !== 11 ? 'лад' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'лада' : 'ладов';
  return `${n > 0 ? '+' : '−'}${a} ${w}`;
}

/** Ноты на струне по ладам (для «ноты на 6-й и 5-й»): только натуральные — опорные, остальные — между ними */
export function stringNotes(s, tuning, from = 0, to = 12, { naturals = false } = {}) {
  const out = [];
  for (let f = from; f <= to; f++) {
    const midi = tuning[s] + f, n = spellPc(midi);
    if (naturals && n.acc !== 0) continue;
    out.push({ string: s, fret: f, midi, pc: mod12(midi), note: n });
  }
  return out;
}

/** Натуральные ноты, между которыми нет «чёрной клавиши»: E–F и B–C */
export const TIGHT_PAIRS = Object.freeze([[4, 5], [11, 0]]);

// ---------- аккорды на круге ----------
/**
 * Стороны фигуры аккорда на круге — полутоны между соседними нотами и обратно к корню:
 * мажор 4-3-5, минор 3-4-5, пауэр 7-5. Сумма всегда 12.
 */
export function chordSides(type) {
  const st = CHORD_TYPES[type].st;
  return st.map((s, i) => (i + 1 < st.length ? st[i + 1] - s : 12 - s));
}

/**
 * «Зеркало» фигуры: та же фигура, перевёрнутая через ребро корень–квинта (стороны внутри идут в обратном порядке).
 * Мажор ↔ минор, 7 ↔ m7♭5; maj7, m7, dim, aug, dim7 — симметричны. Нет такого типа — null.
 */
export function mirrorType(type) {
  const inner = chordSides(type).slice(0, -1).reverse();
  if (inner.length < 2) return null;
  const st = inner.reduce((acc, x) => [...acc, acc[acc.length - 1] + x], [0]);
  const key = st.join(',');
  return Object.keys(CHORD_TYPES).find(t => CHORD_TYPES[t].st.join(',') === key) || null;
}

/** Ноты аккорда с подписями: корень выбирается так, чтобы знаков было меньше */
export function chordInfo(rootPc, type, german = false) {
  const root = chordRoot(rootPc, type);
  const notes = spellChord(root, type);
  return { root, notes, names: notes.map(n => noteName(n, { german })), degrees: chordDegrees(type), pcs: notes.map(pcOf), sides: chordSides(type) };
}

// ---------- квинтовый круг ----------
/**
 * Сектор тональности на круге — 6 аккордов: мажорные IV, I, V (соседи по кругу) и их параллельные миноры ii, vi, iii.
 * k — номер мажорной тональности на круге (C = 0, G = 1 … F = 11).
 */
export function fifthsSector(k) {
  const at = i => FIFTHS[mod12(k + i)];
  return [
    { k: mod12(k - 1), pc: at(-1).pc, kind: 'maj', roman: 'IV' }, { k, pc: at(0).pc, kind: 'maj', roman: 'I' }, { k: mod12(k + 1), pc: at(1).pc, kind: 'maj', roman: 'V' },
    { k: mod12(k - 1), pc: at(-1).minorPc, kind: 'min', roman: 'ii' }, { k, pc: at(0).minorPc, kind: 'min', roman: 'vi' }, { k: mod12(k + 1), pc: at(1).minorPc, kind: 'min', roman: 'iii' },
  ];
}

/** Номер тональности на круге: мажор по тонике, минор — по своему параллельному мажору (Am → C → 0) */
export const fifthsK = (pc, kind) => mod12((kind === 'min' ? pc + 3 : pc) * 7);

/** Параллельная тональность (те же ноты): C ↔ Am. Одноимённая (та же тоника): C ↔ Cm */
export const relativeOf = (pc, kind) => (kind === 'maj' ? { pc: mod12(pc + 9), kind: 'min' } : { pc: mod12(pc + 3), kind: 'maj' });
export const parallelOf = (pc, kind) => ({ pc, kind: kind === 'maj' ? 'min' : 'maj' });

/** Знаки тональности словами: «3♯: F♯ C♯ G♯», «без знаков» */
export function signatureText(pc, kind, german = false) {
  const tonic = keyTonic(pc, kind === 'maj' ? 'ionian' : 'aeolian');
  const sig = keySignature(tonic, kind === 'maj' ? 'ionian' : 'aeolian');
  if (!sig.list.length) return 'без знаков';
  return `${sig.list.length}${sig.sharps ? '♯' : '♭'}: ${sig.list.map(n => noteName(n, { german })).join(' ')}`;
}

/** Название тональности: «C», «Am»; немецкими терминами — «C-Dur», «a-Moll» */
export function keyLabel(pc, kind, { german = false, terms = 'ru' } = {}) {
  const t = keyTonic(pc, kind === 'maj' ? 'ionian' : 'aeolian');
  const n = noteName(t, { german });
  if (terms === 'de') return kind === 'maj' ? `${n}-Dur` : `${n.toLowerCase()}-Moll`;
  return kind === 'maj' ? n : `${n}m`;
}

// ---------- пентатоника ----------
/**
 * Таблица позиций: с какого лада начинается, какие линейки на струнах (с 6-й по 1-ю: Д — длинная, 3 лада;
 * К — короткая, 2 лада) и с какой ступени начинается позиция на 6-й струне.
 */
export function pentaTable(rootPc, kind, tuning) {
  return pentaPositions(rootPc, kind, tuning).map(p => ({
    index: p.index,
    from: p.minFret,
    to: p.maxFret,
    rulers: p.rulers.map(r => (r.length >= 3 ? 'Д' : 'К')),
    startDegree: p.notes[0].degree,
    startFret: p.notes[0].fret,
  }));
}

/**
 * Где в позиции блюзовая нота (♭5 у минорной, ♭3 у мажорной): между нотами линейки или на лад за её концом.
 * Если соседние ступени (4 и 5) на разных струнах, нота одна — берём её на нижней струне, за концом линейки.
 */
export function blueNotes(rootPc, kind, position) {
  const pc = mod12(rootPc + PENTATONICS[kind].blueSt);
  const out = [];
  for (const r of position.rulers) {
    const tuningBase = position.notes.find(n => n.string === r.string);
    const open = tuningBase.midi - tuningBase.fret;
    for (let f = r.from; f <= Math.min(MAX_FRET, r.to + 1); f++) if (mod12(open + f) === pc) out.push({ string: r.string, fret: f, midi: open + f, pc });
  }
  return out;
}

/** Ноты позиции вверх и обратно вниз — для проигрывания и «сыграй сам» */
export const upAndDown = notes => {
  const up = [...notes].sort((a, b) => a.midi - b.midi);
  return [...up, ...up.slice(0, -1).reverse()];
};

/** Шаги пентатоники в ладах подряд по позиции (3-2-2-3-2 у минорной) */
export const pentaSteps = kind => [...PENTATONICS[kind].steps];

// ---------- лады ----------
/** Чем лад отличается от другого: «6 вместо ♭6» */
export function modeDiff(modeId, refId) {
  const a = MODES[modeId].st, b = MODES[refId].st, da = modeDegrees(modeId), db = modeDegrees(refId);
  const out = [];
  for (let i = 0; i < 7; i++) if (a[i] !== b[i]) out.push({ degree: da[i], instead: db[i] });
  return out;
}

/** Ступень лестницы яркости: какую ноту понизили по сравнению с предыдущим ладом */
export const BRIGHTNESS_STEP = Object.freeze({ lydian: 'самый светлый: ♯4', ionian: '♯4 → 4', mixolydian: '7 → ♭7', dorian: '3 → ♭3', aeolian: '6 → ♭6', phrygian: '2 → ♭2', locrian: '5 → ♭5' });
export const brightnessIndex = modeId => BRIGHTNESS.indexOf(modeId);

/** Ноты лада с подписями и характерными нотами */
export function modeInfo(tonicPc, modeId, german = false) {
  const tonic = keyTonic(tonicPc, modeId), notes = spellScale(tonic, MODES[modeId].st), degs = modeDegrees(modeId);
  const charSt = MODES[modeId].characteristic;
  return {
    tonic, notes, names: notes.map(n => noteName(n, { german })), degrees: degs,
    pcs: notes.map(pcOf), charPcs: charSt.map(st => mod12(tonicPc + st)),
    charDegrees: charSt.map(st => degs[MODES[modeId].st.indexOf(st)]),
  };
}

// ---------- значки грифа ----------
/**
 * Подписи и роли для набора высот: pc → { deg, name, role }. Характерные высоты — лаймовые (role 'char').
 * @param {{ pc: number, deg: string, note?: import('./notes.js').Note }[]} items
 * @param {{ german?: boolean, charPcs?: number[] }} [o]
 */
export function labelMap(items, { german = false, charPcs = [] } = {}) {
  const m = new Map();
  for (const it of items) {
    const n = it.note || spellPc(it.pc);
    m.set(it.pc, { deg: it.deg, name: noteName(n, { german }), role: charPcs.includes(it.pc) ? 'char' : degreeRole(it.deg) });
  }
  return m;
}

/**
 * Значки для грифа по нотам и карте подписей.
 * @param {{ string: number, fret: number, pc: number }[]} notes
 * @param {Map<number, { deg: string, name: string, role: string }>} map
 * @param {{ labels?: 'degrees' | 'notes', dim?: (n: any) => boolean, ring?: (n: any) => boolean }} [o]
 */
export function markersFor(notes, map, { labels = 'degrees', dim = () => false, ring = () => false } = {}) {
  return notes.filter(n => map.has(n.pc)).map(n => {
    const info = map.get(n.pc);
    return { string: n.string, fret: n.fret, label: labels === 'notes' ? info.name : info.deg, role: info.role, dim: dim(n), ring: ring(n) };
  });
}

/** Карта подписей гаммы лада */
export const modeLabelMap = (tonicPc, modeId, german = false) => {
  const i = modeInfo(tonicPc, modeId, german);
  return labelMap(i.notes.map((n, k) => ({ pc: i.pcs[k], deg: i.degrees[k], note: n })), { german, charPcs: i.charPcs });
};
/** Карта подписей пентатоники (+ блюзовая нота) */
export function pentaLabelMap(rootPc, kind, german = false, blue = false) {
  const tonic = keyTonic(rootPc, kind === 'minor' ? 'aeolian' : 'ionian');
  const notes = spellPenta(tonic, kind), degs = pentaDegrees(kind);
  const items = notes.map((n, i) => ({ pc: pcOf(n), deg: degs[i], note: n }));
  if (blue) {
    const st = PENTATONICS[kind].blueSt;
    const note = spellAs(rootPc + st, tonic.letter + (kind === 'minor' ? 4 : 2));
    items.push({ pc: mod12(rootPc + st), deg: degreeLabel(st, kind === 'minor' ? 4 : 2), note });
  }
  return labelMap(items, { german });
}
/** Карта подписей аккорда */
export function chordLabelMap(rootPc, type, german = false) {
  const c = chordInfo(rootPc, type, german);
  return labelMap(c.notes.map((n, i) => ({ pc: c.pcs[i], deg: c.degrees[i], note: n })), { german });
}

/** Интервал по числу полутонов */
export const intervalInfo = st => INTERVALS[Math.max(0, Math.min(12, st))];

/** Характер интервала — одной фразой */
export const INTERVAL_FEEL = Object.freeze([
  'та же нота — унисон', 'острое трение, напряжение', 'шаг гаммы, движение', 'грустная, минорная', 'светлая, мажорная',
  'открытая, «церковная»', 'тревожный, неустойчивый', 'устойчивая, мощная — основа пауэр-аккорда', 'мягкая, минорная',
  'тёплая, светлая', 'блюзовая, хочет разрешиться', 'острая, тянется вверх к октаве', 'та же нота выше — круг замкнулся',
]);

/**
 * Таб аккорда текстом: 6 строк от 1-й струны к 6-й, «x» — струна не звучит.
 * @param {(number | null)[]} frets от 6-й струны к 1-й @param {number[]} tuning
 */
export function tabLines(frets, tuning, german = false) {
  const w = Math.max(...frets.map(f => (f == null ? 1 : String(f).length)));
  return frets.map((f, s) => {
    const name = noteName(spellPc(tuning[s]), { german });
    const cell = f == null ? 'x' : String(f);
    return `${(s === 5 ? name.toLowerCase() : name).padEnd(2)}|--${cell.padStart(w, '-')}--|`;
  }).reverse();
}

/** Лады: настроение, где звучат и как сыграть идею — коротко, своими словами */
export const MODE_TEXT = Object.freeze({
  ionian: { mood: 'светлый, завершённый', genres: 'поп, рок-баллады, гимны', idea: '7 — вводный тон: на полутон ниже тоники и тянет домой.' },
  dorian: { mood: 'минор без безысходности, грувовый', genres: 'фанк, блюз-рок, соло над минорным вампом', idea: 'Поиграй над чередованием i–IV (например, Dm–G): IV мажорный из-за 6.' },
  phrygian: { mood: 'тёмный, давящий, восточный', genres: 'метал, трэш, фламенко', idea: 'Пауэр-аккорды на 1 и ♭2: в Drop D — открытая 6-я и 1-й лад.' },
  lydian: { mood: 'парящий, сказочный', genres: 'музыка к фильмам, прогрессив, мечтательные соло', idea: 'Над аккордами I–II (C–D): ♯4 звучит как свет сверху.' },
  mixolydian: { mood: 'мажор с ленцой, без тяги домой', genres: 'классический рок, блюз-рок, кантри', idea: 'Ход I–♭VII (A–G) — визитная карточка рок-н-ролла.' },
  aeolian: { mood: 'грустный, эпичный', genres: 'метал, рок-баллады, хард-рок', idea: 'i–VI–VII–i: Dm–B♭–C–Dm — эпика в чистом виде.' },
  locrian: { mood: 'неустойчивый, диссонансный', genres: 'экстремальный метал, короткие вставки', idea: '♭5 вместо квинты: тоника не может успокоиться — играй короткими фразами.' },
  harmonic: { mood: 'драматичный, восточный', genres: 'неоклассический метал, фолк, фламенко', idea: 'Скачок ♭6 → 7 (3 лада) и мажорная V, которая сильно тянет в i.' },
  phrygdom: { mood: 'экзотика, «пустыня»', genres: 'ориентальный метал, фламенко, клезмер', idea: 'Над пауэр-аккордом тоники: ♭2 и 3 рядом — восточный колорит.' },
});
