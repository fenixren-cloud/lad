// activity.js — журнал пишется сам: сколько минут на каком экране (пока экран открыт и виден), ответы в квизах
// и повторениях, пройденные уроки, чистый темп упражнений. И колода повторений: карточки пройденных уроков,
// ноты на грифе группами. Всё — через хранилище.
import { store } from './store.js';
import { localDay } from '../core/dates.js';
import { logTime, logAnswer, logLesson, logTempo, practiceDates, streakInfo } from '../core/progress.js';
import { addCards, dueToday } from '../core/srs.js';
import { nextNoteGroup } from '../core/cards.js';
import { lessonById } from '../core/lessons.js';
import { TUNINGS } from '../core/neck.js';

export const today = () => localDay();

// ---------- время на экранах ----------
const MAX_CHUNK = 15 * 60; // больше 15 минут без перехода — вероятно, телефон просто лежит
let screen = '', since = 0;
function flush() {
  if (!screen || !since) return;
  const secs = Math.min(MAX_CHUNK, (Date.now() - since) / 1000);
  since = Date.now();
  if (secs >= 1) store().update('days', d => logTime(d || {}, today(), screen, secs), {});
}
/** Открыт экран (ключ «раздел/страница» или «раздел») */
export function enterScreen(key) {
  flush();
  screen = key;
  since = document.hidden ? 0 : Date.now();
}
export function startActivity() {
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flush(); since = 0; } else if (screen) since = Date.now(); });
  addEventListener('pagehide', flush);
  setInterval(flush, 30000);
}

// ---------- события ----------
/** Ответ в квизе слуха */
export const noteEar = ok => store().update('days', d => logAnswer(d || {}, today(), 'ear', ok), {});
/** Ответ на карточку повторений */
export const noteCard = ok => store().update('days', d => logAnswer(d || {}, today(), 'cards', ok), {});
/** Чистый темп упражнения (лестница темпа засчитала проход) */
export const noteTempo = (ex, bpm) => store().update('tempoLog', l => logTempo(l || {}, ex, today(), bpm), {});

/** Пройден урок: в журнал, его карточки — в повторения (а после урока о нотах — и ноты на грифе) */
export function noteLesson(id) {
  const t = today();
  store().update('days', d => logLesson(d || {}, t, id), {});
  const l = lessonById(id);
  if (l) store().update('deck', deck => addCards(deck || {}, l.cards, t), {});
  refreshNotes();
}

/**
 * Колода в порядке: карточки всех пройденных уроков (и тех, что пройдены до появления повторений)
 * и следующая группа нот на грифе, если пора
 */
export function refreshNotes() {
  const done = store().get('lessons', {})?.done || {};
  const before = store().get('deck', {}) || {};
  let deck = addCards(before, Object.keys(done).flatMap(id => lessonById(id)?.cards || []), today());
  deck = addCards(deck, nextNoteGroup(deck, !!done['neck-low'], TUNINGS.std.midi), today());
  if (Object.keys(deck).length !== Object.keys(before).length) store().set('deck', deck);
}

/** Сколько карточек ждёт сегодня */
export function cardsToday() {
  const { due, fresh } = dueToday(store().get('deck', {}) || {}, today());
  return { due: due.length, fresh: fresh.length };
}

/** Серия дней и последний день занятий */
export function streakNow() {
  const dates = practiceDates(store().get('days', {}) || {}, store().get('journal', []) || []);
  return streakInfo(dates, today());
}

/** Всё, по чему дорожка проверяет цели */
export function trackData() {
  const s = store();
  return { lessons: s.get('lessons', {}), records: s.get('records', {}), rhythmHist: s.get('rhythmHist', []), earBest: s.get('earBest', {}),
    earStats: s.get('earStats', {}), ear: s.get('ear', {}), riffs: s.get('riffs', []), deck: s.get('deck', {}), track: s.get('track', {}) };
}
