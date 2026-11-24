// srs.js — повторения: когда какую карточку показать снова. Чистая логика.
//
// Алгоритм — коробки Лейтнера с удваивающимися интервалами. Почему не SM-2 и не FSRS:
//  • ответы здесь «да/нет» (коснулся грифа, сыграл ноту, выбрал вариант) — оценки «легко/трудно» от тебя
//    не нужны, а SM-2 и FSRS без них теряют главное преимущество;
//  • карточек немного (десятки, не тысячи), а каждое повторение — новый вариант задания (другая тоника,
//    другая струна), поэтому важнее простое и честное правило, чем точная модель забывания;
//  • коробку видно и понятно: «коробка 4 из 6 — следующий раз через 8 дней».
//
// Правило: верно — карточка переходит в следующую коробку, интервал удваивается (0 → 1 → 2 → 4 → 8 → 16 → 32 дня);
// ошибка — карточка возвращается в коробку 1 (завтра) и ещё раз показывается в этом же подходе.
import { addDays, daysBetween } from './dates.js';

/** Интервал (дней) для коробки 0…6. Коробка 0 — новая, ещё ни разу не отвеченная. */
export const INTERVALS = Object.freeze([0, 1, 2, 4, 8, 16, 32]);
export const MAX_BOX = INTERVALS.length - 1;
/** Карточка «знаю»: продержалась хотя бы 4 дня. «Знаю твёрдо» — 16 и больше. */
export const LEARNED_BOX = 3;
export const SOLID_BOX = 5;
/** Сколько новых карточек в день можно впустить в повторения */
export const NEW_PER_DAY = 8;

/**
 * @typedef {{ box: number, due: string, added: string, seen: number, right: number, wrong: number, last?: string }} CardState
 * @typedef {Record<string, CardState>} Deck
 */

/** Новая карточка: коробка 0, показать сегодня */
export const newCard = today => ({ box: 0, due: today, added: today, seen: 0, right: 0, wrong: 0 });

/**
 * Добавить карточки, которых ещё нет (уже знакомые не трогаем)
 * @param {Deck} deck @param {string[]} ids @param {string} today
 * @returns {Deck}
 */
export function addCards(deck, ids, today) {
  const out = { ...(deck || {}) };
  for (const id of ids) if (!out[id]) out[id] = newCard(today);
  return out;
}

/**
 * Ответ на карточку
 * @param {CardState} card @param {boolean} ok @param {string} today
 * @returns {CardState}
 */
export function review(card, ok, today) {
  const c = card || newCard(today);
  const box = ok ? Math.min(MAX_BOX, c.box + 1) : 1;
  return { ...c, box, due: addDays(today, INTERVALS[box]), seen: c.seen + 1, right: c.right + (ok ? 1 : 0), wrong: c.wrong + (ok ? 0 : 1), last: today };
}

/**
 * Что повторить сегодня: сначала просроченные (чем дольше ждут — тем раньше), потом новые — не больше лимита
 * за день (с учётом уже впущенных сегодня).
 * @param {Deck} deck @param {string} today
 * @param {{ newLimit?: number, filter?: (id: string) => boolean }} [o]
 * @returns {{ due: string[], fresh: string[] }}
 */
export function dueToday(deck, today, { newLimit = NEW_PER_DAY, filter = () => true } = {}) {
  const entries = Object.entries(deck || {}).filter(([id]) => filter(id));
  const startedToday = entries.filter(([, c]) => c.seen > 0 && c.added === today).length;
  const due = entries.filter(([, c]) => c.seen > 0 && c.due <= today)
    .sort(([a, x], [b, y]) => (x.due < y.due ? -1 : x.due > y.due ? 1 : x.box - y.box || (a < b ? -1 : 1)))
    .map(([id]) => id);
  const fresh = entries.filter(([, c]) => c.seen === 0)
    .sort(([a, x], [b, y]) => (x.added < y.added ? -1 : x.added > y.added ? 1 : 0))
    .slice(0, Math.max(0, newLimit - startedToday))
    .map(([id]) => id);
  return { due, fresh };
}

/**
 * Сводка колоды
 * @param {Deck} deck @param {string} today @param {(id: string) => boolean} [filter]
 */
export function deckStats(deck, today, filter = () => true) {
  const list = Object.entries(deck || {}).filter(([id]) => filter(id)).map(([, c]) => c);
  const { due, fresh } = dueToday(deck, today, { filter });
  return {
    total: list.length,
    learned: list.filter(c => c.box >= LEARNED_BOX).length,
    solid: list.filter(c => c.box >= SOLID_BOX).length,
    waiting: list.filter(c => c.seen === 0).length,
    due: due.length,
    fresh: fresh.length,
    today: due.length + fresh.length,
  };
}

/** Через сколько дней карточка понадобится снова (0 — сегодня) */
export const dueIn = (card, today) => Math.max(0, daysBetween(today, card.due));

/** «завтра», «через 4 дня» */
export function dueText(days) {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  const a = days % 10, b = days % 100;
  const w = a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'дня' : 'дней';
  return `через ${days} ${w}`;
}
