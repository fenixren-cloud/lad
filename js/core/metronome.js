// metronome.js — что звучит на каждом тике метронома. Чистая логика: время приходит от транспорта.
// Деления доли, акценты, отсчёт, пропуски кликов, ритмы барабанов, тренажёр скорости, лестница темпа, tap.
import { SUBDIVISIONS, PPQ } from './transport.js';
import { hitGain } from './drums.js';

/** Уровни акцента доли: 3 — сильная, 2 — средняя, 1 — слабая, 0 — тишина */
export const ACCENT = Object.freeze({ strong: 3, medium: 2, weak: 1, mute: 0 });
/** @type {[string, string][]} */
export const SOUNDS = [['click', 'Клик'], ['wood', 'Дерево'], ['beep', 'Бип'], ['sticks', 'Палочки'], ['bell', 'Колокол'], ['drums', 'Барабаны']];
/** @type {[string, string][]} */
export const RHYTHMS = [['accents', 'По акцентам'], ['rock', 'Рок'], ['halftime', 'Халфтайм'], ['metal', 'Метал'], ['gallop', 'Галоп'], ['shuffle', 'Шаффл']];
export const SUB_ORDER = Object.freeze(['quarter', 'eighth', 'triplet', 'sixteenth', 'sextuplet', 'swing', 'gallop', 'reverseGallop']);
export const SUB_LABEL = Object.freeze({ quarter: '♩', eighth: '♪♪', triplet: '3', sixteenth: '16', sextuplet: '6', swing: 'свинг', gallop: 'галоп', reverseGallop: 'обр. галоп' });

/** Акценты по умолчанию: первая доля сильная, в 6/8 и 12/8 — каждая третья средняя */
export function defaultAccents(beats) {
  return Array.from({ length: beats }, (_, i) => (i === 0 ? ACCENT.strong : beats % 3 === 0 && beats > 3 && i % 3 === 0 ? ACCENT.medium : ACCENT.weak));
}
/** Нажатие на долю: сильная → средняя → слабая → тишина → сильная */
export const nextAccent = a => (a === ACCENT.mute ? ACCENT.strong : a - 1);

/**
 * @typedef {{ bpm: number, beats: number, unit: number, accents: number[], sub: string, sound: string, rhythm: string,
 *   countIn: number, gap: { play: number, mute: number } | null, randomDrop: number,
 *   trainer: { step: number, every: number, max: number } | null }} MetronomeState
 */
/** @returns {MetronomeState} */
export function defaultMetronome() {
  return { bpm: 84, beats: 4, unit: 4, accents: defaultAccents(4), sub: 'eighth', sound: 'click', rhythm: 'accents', countIn: 0, gap: null, randomDrop: 0, trainer: null };
}

/** Привести сохранённое к правильному виду */
export function normalizeMetronome(src) {
  const d = defaultMetronome(), s = { ...d, ...(src && typeof src === 'object' ? src : {}) };
  s.bpm = Math.min(300, Math.max(30, Math.round(Number(s.bpm) || d.bpm)));
  s.beats = Math.min(16, Math.max(1, Math.round(Number(s.beats) || 4)));
  s.unit = [2, 4, 8, 16].includes(Number(s.unit)) ? Number(s.unit) : 4;
  s.accents = Array.isArray(s.accents) && s.accents.length === s.beats && s.accents.every(a => [0, 1, 2, 3].includes(a)) ? s.accents : defaultAccents(s.beats);
  if (!(s.sub in SUBDIVISIONS)) s.sub = d.sub;
  if (!SOUNDS.some(([v]) => v === s.sound)) s.sound = d.sound;
  if (!RHYTHMS.some(([v]) => v === s.rhythm)) s.rhythm = d.rhythm;
  s.countIn = [0, 1, 2].includes(s.countIn) ? s.countIn : 0;
  s.randomDrop = Math.min(0.5, Math.max(0, Number(s.randomDrop) || 0));
  return s;
}

/**
 * Ритмы барабанов: где на доле звучат бочка (k), малый (s), хай-хэт (h). Позиции — тики из 12.
 * beat — номер доли в такте, beats — сколько долей.
 */
function drumHits(rhythm, beat, sub, beats, level) {
  const two4 = beat % 2 === 1; // 2-я и 4-я доли
  switch (rhythm) {
    case 'rock': return [...(beat % 2 === 0 ? [['k', 0]] : []), ...(two4 ? [['s', 0]] : []), ['h', 0], ['h', 6], ...(beat === 2 ? [['k', 6]] : [])];
    case 'halftime': return [...(beat === 0 ? [['k', 0]] : []), ...(beat === 2 || (beats < 3 && beat === 1) ? [['s', 0]] : []), ['h', 0], ['h', 6]];
    case 'metal': return [['k', 0], ['k', 3], ['k', 6], ['k', 9], ...(two4 ? [['s', 0]] : []), ['h', 0]];
    case 'gallop': return [['k', 0], ['k', 6], ['k', 9], ...(two4 ? [['s', 0]] : []), ['h', 0]];
    case 'shuffle': return [...(beat % 2 === 0 ? [['k', 0]] : []), ...(two4 ? [['s', 0]] : []), ['h', 0], ['h', 8]];
    default: { // по акцентам: сильная — бочка, средняя — малый, слабая — хай-хэт; деления — тихий хэт
      const main = level === ACCENT.strong ? 'k' : level === ACCENT.medium ? 's' : 'h';
      return [...(level > 0 ? [[main, 0]] : []), ...SUBDIVISIONS[sub].ticks.filter(t => t > 0).map(t => ['hs', t])];
    }
  }
}

/**
 * Звуки на тике. bar — номер такта с начала игры (0 = первый, с отсчётом), beat — доля, sub — тик доли.
 * Возвращает [] или список { voice, gain }: voice — accent/beat/sub (клик) или голос барабанов (k/s/h/hs/c/r).
 * @param {{ bar: number, beat: number, sub: number }} t
 * @param {MetronomeState} m
 * @param {() => number} [rand] для случайного выпадения долей
 */
export function soundsAt(t, m, rand = Math.random) {
  const counting = t.bar < m.countIn;
  const playBar = t.bar - m.countIn;
  const level = m.accents[t.beat] ?? ACCENT.weak;
  if (counting) {
    // отсчёт: только доли, первая громче; деления и барабаны не звучат
    return t.sub === 0 ? [{ voice: t.beat === 0 ? 'accent' : 'beat', gain: 1, countIn: true }] : [];
  }
  // пропуски клика: N тактов играет, M молчит — проверка внутреннего пульса
  if (m.gap && m.gap.mute > 0 && playBar % (m.gap.play + m.gap.mute) >= m.gap.play) return [];
  if (m.sound === 'drums') {
    const out = [];
    // в ритмах: крэш на «раз» каждой фразы из 4 тактов (легче считать такты), в шаффле хэт заменяет райд
    const crash = m.rhythm !== 'accents' && playBar % 4 === 0 && t.beat === 0 && t.sub === 0;
    for (const [v, at] of drumHits(m.rhythm, t.beat, m.sub, m.beats, level)) {
      if (at !== t.sub) continue;
      const voice = v === 'h' && crash ? 'c' : v === 'h' && m.rhythm === 'shuffle' ? 'r' : v;
      out.push({ voice, gain: hitGain(v, at) });
    }
    if (out.length && t.sub === 0 && m.randomDrop > 0 && rand() < m.randomDrop) return [];
    return out;
  }
  if (t.sub === 0) {
    if (level === ACCENT.mute) return [];
    if (m.randomDrop > 0 && t.beat !== 0 && rand() < m.randomDrop) return [];
    return [{ voice: level >= ACCENT.medium ? 'accent' : 'beat', gain: level === ACCENT.strong ? 1 : level === ACCENT.medium ? 0.8 : 0.7 }];
  }
  return SUBDIVISIONS[m.sub].ticks.includes(t.sub) && level !== ACCENT.mute ? [{ voice: 'sub', gain: 0.45 }] : [];
}

/** Тренажёр скорости: темп в такте bar (без отсчёта) — каждые every тактов +step, не выше max */
export function trainerBpm(start, bar, trainer) {
  if (!trainer || bar < 0) return start;
  return Math.min(trainer.max, start + Math.floor(bar / trainer.every) * trainer.step);
}

/**
 * Tap tempo: темп по последним нажатиям (медиана интервалов). Пауза больше 2 с — начинаем заново.
 * @param {number[]} taps моменты нажатий, мс
 * @returns {number | null}
 */
export function tapTempo(taps) {
  const recent = [];
  for (let i = taps.length - 1; i > 0 && recent.length < 6; i--) {
    const dt = taps[i] - taps[i - 1];
    if (dt > 2000 || dt <= 0) break;
    recent.push(dt);
  }
  if (!recent.length) return null;
  const s = recent.sort((a, b) => a - b), m = s.length >> 1;
  const med = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.min(300, Math.max(30, Math.round(60000 / med)));
}

/** Ожидаемые удары за такт для проверки «чисто ли»: моменты делений в долях от начала такта */
export function expectedOnsets(m) {
  const ticks = m.sub === 'quarter' ? [0] : SUBDIVISIONS[m.sub].ticks;
  const out = [];
  for (let b = 0; b < m.beats; b++) for (const t of ticks) out.push(b + t / PPQ);
  return out;
}

// ---------- упражнения и лестница темпа ----------
/** 8 упражнений с рекордами. id совпадают с «Гитарным кругом» — рекорды перенесутся. */
export const EXERCISES = Object.freeze([
  { id: 'chrom', name: 'Хроматика 1-2-3-4', start: 60, sub: 'sixteenth', goal: 'ровность и синхронность рук',
    how: 'По пальцу на лад: 1-2-3-4 на каждой струне от 6-й к 1-й и обратно, потом на лад выше. Пальцы — низко над грифом, у самых ладов.' },
  { id: 'alt', name: 'Переменный штрих', start: 70, sub: 'sixteenth', goal: 'скорость без зажима',
    how: 'Строго вниз-вверх на одной струне, потом по позиции пентатоники. Двигается кисть, медиатор входит в струну неглубоко.' },
  { id: 'pm', name: 'Palm mute', start: 80, sub: 'eighth', goal: 'плотный ровный «чаг»',
    how: 'Ребро ладони — на струнах у самой подставки. Восьмые на открытой 6-й, на «раз» — акцент без глушения.' },
  { id: 'gallop', name: 'Галоп', start: 70, sub: 'gallop', goal: 'металлический «тыгыдык»',
    how: 'Восьмая и две шестнадцатых (вниз · вниз-вверх) с palm mute на 6-й струне. Акцент — на первой ноте группы.' },
  { id: 'power', name: 'Смена пауэр-аккордов', start: 60, sub: 'eighth', goal: 'быстрая точная перестановка',
    how: 'Пауэр-аккорды на 3-м, 5-м и 7-м ладу, по 4 восьмых. Переставляй руку одним движением, без «дырки». В Drop D — одним пальцем.' },
  { id: 'mute', name: 'Глушение лишних струн', start: 60, sub: 'eighth', goal: 'чистый звук под перегрузом',
    how: 'Размашистый удар по всем струнам, но звучат только 2–3 струны аккорда: лишние глушат подушечка указательного снизу и ребро ладони сверху.' },
  { id: 'bend', name: 'Бенды и вибрато', start: 60, sub: 'quarter', goal: 'точная высота бенда',
    how: 'Сыграй 9-й лад 3-й струны как эталон, потом тяни 7-й лад до той же высоты. Вибрато — в ритм: четвертями, потом восьмыми.' },
  { id: 'count', name: 'Счёт и ритм', start: 70, sub: 'quarter', goal: 'внутренний пульс',
    how: 'Считай вслух «раз-и-два-и» и играй одну ноту: 2 такта четвертями, 2 — восьмыми, 2 — триолями, 2 — шестнадцатыми, без остановки.' },
]);
export const LADDER = Object.freeze({ cleanToStep: 3, step: 4 });

/**
 * Лестница темпа: 3 раза подряд чисто — темп +4 BPM; не чисто — серия сначала. Рекорд — лучший чистый темп.
 * @param {{ bpm: number, streak: number, best: number }} rec
 * @param {boolean} clean
 */
export function ladderStep(rec, clean) {
  if (!clean) return { ...rec, streak: 0, raised: false };
  const streak = rec.streak + 1, best = Math.max(rec.best || 0, rec.bpm);
  if (streak >= LADDER.cleanToStep) return { bpm: Math.min(300, rec.bpm + LADDER.step), streak: 0, best, raised: true };
  return { ...rec, streak, best, raised: false };
}
