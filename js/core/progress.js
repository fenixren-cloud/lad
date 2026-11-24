// progress.js — журнал по дням, серия дней с «заморозкой», ряды для графиков и карта грифа. Чистая логика.
//
// Журнал дня (ключ хранилища days): { [день]: { t: { 'play/metronome': секунды, … }, ear: { right, total },
//   cards: { right, total }, lessons: [id] } }. Время на экранах пишется само, пока экран открыт и виден.
import { addDays, daysBetween, isDay } from './dates.js';
import { parseNoteCard, noteCardId, NOTE_FRETS } from './cards.js';
import { LEARNED_BOX, SOLID_BOX } from './srs.js';
import { mod12 } from './notes.js';

/** @typedef {{ t?: Record<string, number>, ear?: { right: number, total: number }, cards?: { right: number, total: number }, lessons?: string[] }} DayLog */
/** @typedef {Record<string, DayLog>} Days */
/** @typedef {{ date: string, minutes: number, planned?: number, steps?: Record<string, string>, stopped?: boolean }} Session */

export const KEEP_DAYS = 400;
/** День считается днём занятий: от 3 минут на экранах, или занятие «Сегодня», или 5 ответов в квизах и повторениях */
export const MIN_SECONDS = 180;

const trim = days => {
  const keys = Object.keys(days).filter(isDay).sort();
  if (keys.length <= KEEP_DAYS) return days;
  const out = {};
  for (const k of keys.slice(-KEEP_DAYS)) out[k] = days[k];
  return out;
};
const dayOf = (days, day) => ({ ...(days?.[day] || {}) });

/** Добавить секунды на экране */
export function logTime(days, day, key, secs) {
  if (!(secs > 0)) return days || {};
  const d = dayOf(days, day);
  d.t = { ...(d.t || {}), [key]: Math.round(((d.t || {})[key] || 0) + secs) };
  return trim({ ...(days || {}), [day]: d });
}
/** Ответ в квизе слуха ('ear') или в повторениях ('cards') */
export function logAnswer(days, day, field, ok) {
  const d = dayOf(days, day);
  const s = d[field] || { right: 0, total: 0 };
  d[field] = { right: s.right + (ok ? 1 : 0), total: s.total + 1 };
  return trim({ ...(days || {}), [day]: d });
}
/** Пройден урок */
export function logLesson(days, day, id) {
  const d = dayOf(days, day);
  d.lessons = [...new Set([...(d.lessons || []), id])];
  return trim({ ...(days || {}), [day]: d });
}

const secsOf = log => Object.values(log?.t || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const answers = log => (log?.ear?.total || 0) + (log?.cards?.total || 0);

/**
 * Дни занятий по порядку
 * @param {Days} days @param {Session[]} journal
 */
export function practiceDates(days = {}, journal = []) {
  const set = new Set();
  for (const [day, log] of Object.entries(days || {})) if (isDay(day) && (secsOf(log) >= MIN_SECONDS || answers(log) >= 5 || (log.lessons || []).length)) set.add(day);
  for (const s of journal || []) if (isDay(s?.date)) set.add(s.date);
  return [...set].sort();
}

/**
 * Серия дней подряд. «Заморозка» спасает серию за пропущенный день: одна есть сразу, ещё одна
 * копится за каждые 7 дней занятий (не больше двух). Сегодняшний день, пока занятия не было, серию не рвёт.
 * @param {string[]} dates дни занятий (по возрастанию) @param {string} today
 */
export function streakInfo(dates, today) {
  const set = new Set(dates);
  const first = dates.find(d => d <= today);
  const last = [...dates].reverse().find(d => d <= today) || null;
  let current = 0, best = 0, freezes = 1, earned = 0;
  /** @type {string[]} */
  const frozen = [];
  if (first) {
    for (let day = first; day <= today; day = addDays(day, 1)) {
      if (set.has(day)) {
        current++; earned++;
        if (earned >= 7) { freezes = Math.min(2, freezes + 1); earned = 0; }
        best = Math.max(best, current);
      } else if (day === today) {
        // ещё есть время
      } else if (current > 0 && freezes > 0) { freezes--; frozen.push(day); }
      else { current = 0; earned = 0; }
    }
  }
  return { current, best, freezes, frozen, todayDone: set.has(today), last, gap: last ? daysBetween(last, today) : null };
}

/** После недели без занятий — мягкий возврат */
export const COMEBACK_DAYS = 7;
export const isComeback = (gap) => gap != null && gap >= COMEBACK_DAYS;

/**
 * Журнал по дням, свежие сверху: минуты, на что ушли, занятия, уроки, ответы
 * @param {Days} days @param {Session[]} journal @param {(key: string) => string} label название экрана по ключу
 */
export function journalList(days = {}, journal = [], label = k => k) {
  const all = new Set([...Object.keys(days || {}).filter(isDay), ...(journal || []).map(s => s?.date).filter(isDay)]);
  return [...all].sort().reverse().map(day => {
    const log = days?.[day] || {};
    const parts = Object.entries(log.t || {}).filter(([, s]) => s >= 30)
      .map(([k, s]) => ({ key: k, label: label(k), minutes: Math.max(1, Math.round(s / 60)) }))
      .sort((a, b) => b.minutes - a.minutes);
    const sessions = (journal || []).filter(s => s?.date === day);
    const sessionMin = sessions.reduce((a, s) => a + (s.minutes || 0), 0);
    return { day, minutes: Math.max(Math.round(secsOf(log) / 60), sessionMin), parts, sessions: sessions.length,
      lessons: log.lessons || [], ear: log.ear || null, cards: log.cards || null };
  }).filter(x => x.minutes > 0 || x.sessions || x.lessons.length || x.ear || x.cards);
}

/** Минуты по дням за последние n дней (старые слева) */
export function recentMinutes(days = {}, today, n = 7) {
  return Array.from({ length: n }, (_, i) => { const day = addDays(today, i - n + 1); return { day, minutes: Math.round(secsOf(days?.[day]) / 60) }; });
}

// ---------- графики ----------
/**
 * Темп упражнения по дням: лучший чистый темп дня (tempoLog: { [упражнение]: [{ d, bpm }] })
 * @param {Record<string, { d: string, bpm: number }[]>} log @param {string} ex
 */
export function tempoSeries(log, ex) {
  const by = new Map();
  for (const p of log?.[ex] || []) if (isDay(p?.d) && p.bpm > 0) by.set(p.d, Math.max(by.get(p.d) || 0, p.bpm));
  return [...by].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, bpm]) => ({ day, value: bpm }));
}
/** Добавить чистый темп в журнал темпа (не больше 60 точек на упражнение) */
export function logTempo(log, ex, day, bpm) {
  const list = (log?.[ex] || []).filter(p => !(p.d === day && p.bpm <= bpm));
  if ((log?.[ex] || []).some(p => p.d === day && p.bpm > bpm)) return log || {};
  return { ...(log || {}), [ex]: [...list, { d: day, bpm }].slice(-60) };
}
/**
 * Тест ритма: смещение и разброс каждой попытки, в мс
 * @param {{ date: string, mode: string, mean: number, sd: number, score: number }[]} hist
 */
export function rhythmSeries(hist = [], mode = null) {
  return (hist || []).filter(h => h && (!mode || h.mode === mode) && Number.isFinite(h.mean) && Number.isFinite(h.sd))
    .map(h => ({ day: String(h.date).slice(0, 10), mean: Math.round(h.mean * 1000), sd: Math.round(h.sd * 1000), score: h.score, mode: h.mode }));
}
/** Точность слуха по дням (дни, где ответов хотя бы 3) */
export function earSeries(days = {}) {
  return Object.keys(days || {}).filter(isDay).sort()
    .filter(d => (days[d].ear?.total || 0) >= 3)
    .map(d => ({ day: d, value: Math.round((100 * days[d].ear.right) / days[d].ear.total), total: days[d].ear.total }));
}

// ---------- карта грифа ----------
/**
 * Карта нот на грифе (до 12-го лада): для каждого места — нота и насколько она выучена.
 * level: 0 — ещё не в повторениях, 1 — учится, 2 — знаю (коробка 3+), 3 — твёрдо (коробка 5+).
 * @param {Record<string, { box: number }>} deck @param {number[]} tuning
 */
export function neckMap(deck = {}, tuning) {
  const cells = [];
  for (let s = 0; s < 6; s++) for (let f = 0; f <= NOTE_FRETS; f++) {
    const c = deck?.[noteCardId(s, f)];
    const level = !c ? 0 : c.box >= SOLID_BOX ? 3 : c.box >= LEARNED_BOX ? 2 : 1;
    cells.push({ string: s, fret: f, pc: mod12(tuning[s] + f), level, box: c?.box ?? null });
  }
  const known = cells.filter(c => c.level >= 2).length;
  return { cells, known, total: cells.length, percent: Math.round((100 * known) / cells.length) };
}
export { parseNoteCard };
