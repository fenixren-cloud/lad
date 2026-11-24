// practice.js — идущее занятие «Сегодня»: какой шаг, сколько осталось, что сделано.
// Пока занятие идёт: экран не гаснет (Wake Lock), при сворачивании таймер встаёт на паузу,
// всё записывается в журнал (его экран — на этапе 6).
import { signal } from '../core/signal.js';
import { planSession } from '../core/session.js';
import { routeHref } from '../core/routes.js';
import { itemById } from '../core/curriculum.js';
import { localDay } from '../core/dates.js';
import { store } from './store.js';
import { go } from './router.js';
import { trackData, cardsToday, streakNow, refreshNotes } from './activity.js';

/**
 * @typedef {{ date: string, minutes: number, steps: import('../core/session.js').Step[], index: number,
 *   left: number, results: Record<string, 'done' | 'skipped'>, startedAt: number }} Practice
 */
const today = () => localDay();
const saved = store().get('practice');
/** Текущее занятие или null */
export const practice = signal(/** @type {Practice | null} */ (saved && saved.date === today() ? saved : null));
const persist = () => store().set('practice', practice.value);

let timer = 0, wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator && !document.hidden) wake = await /** @type {any} */ (navigator).wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}
function tick() {
  const p = practice.value;
  if (!p || document.hidden) return;
  practice.value = { ...p, left: Math.max(0, p.left - 1) };
  if (practice.value.left % 10 === 0) persist();
}
function run(on) {
  clearInterval(timer);
  if (on) timer = setInterval(tick, 1000);
  keepAwake(on);
}
document.addEventListener('visibilitychange', () => { if (practice.value) keepAwake(!document.hidden); });
if (practice.value) run(true);

/** Адрес шага: инструмент сразу настроен (query шага) и знает, что он — шаг занятия */
export const stepHref = (p, i) => routeHref(p.steps[i].section, p.steps[i].page, { ...(p.steps[i].query || {}), from: 'today' });

/** Занятие на сегодня: по дорожке, повторениям, рекордам, слуху и перерыву */
export function planToday(minutes) {
  refreshNotes();
  const s = streakNow();
  return planSession(minutes, { track: trackData(), earStats: store().get('earStats', {}), cards: cardsToday(), today: today(), lastDay: s.todayDone ? today() : s.last });
}

/** Начать занятие на minutes минут и открыть первый шаг */
export function startPractice(minutes) {
  const plan = planToday(minutes);
  practice.value = { date: today(), minutes: plan.minutes, steps: plan.steps, index: 0, left: plan.steps[0].minutes * 60, results: {}, startedAt: Date.now() };
  persist();
  run(true);
  go(stepHref(practice.value, 0));
}

/**
 * Закончить текущий шаг (сделан или пропущен) и перейти к следующему; после последнего — итог на «Сегодня».
 * @param {'done' | 'skipped'} [result]
 */
export function finishStep(result = 'done') {
  const p = practice.value;
  if (!p) return;
  const results = { ...p.results, [p.steps[p.index].id]: result };
  // импровизацию и сочинение приложение не оценивает: сделанный шаг отмечает цель дорожки
  const item = p.steps[p.index].track && itemById(p.steps[p.index].track);
  if (result === 'done' && item && item.kind === 'self') store().update('track', t => ({ ...(t || {}), done: { ...(t?.done || {}), [item.id]: today() } }), {});
  const next = p.index + 1;
  if (next >= p.steps.length) {
    const done = Object.values(results).filter(x => x === 'done').length;
    const spent = Math.round((Date.now() - p.startedAt) / 60000);
    store().update('journal', j => [...j, { date: p.date, minutes: spent, planned: p.minutes, steps: results }].slice(-400), []);
    practice.value = null;
    store().remove('practice');
    store().set('lastPractice', { date: p.date, done, total: p.steps.length, minutes: spent });
    run(false);
    go('#/today');
    return;
  }
  practice.value = { ...p, index: next, left: p.steps[next].minutes * 60, results };
  persist();
  go(stepHref(practice.value, next));
}

/** Ещё пару минут на этот шаг */
export function moreTime(minutes = 2) {
  const p = practice.value;
  if (p) { practice.value = { ...p, left: p.left + minutes * 60 }; persist(); }
}

/** Вернуться к предыдущему шагу (педаль «назад») */
export function previousStep() {
  const p = practice.value;
  if (!p || p.index === 0) return;
  practice.value = { ...p, index: p.index - 1, left: p.steps[p.index - 1].minutes * 60 };
  persist();
  go(stepHref(practice.value, p.index - 1));
}

/** Прервать занятие (без наказаний: сделанное всё равно попадает в журнал) */
export function stopPractice() {
  const p = practice.value;
  if (!p) return;
  if (Object.keys(p.results).length) store().update('journal', j => [...j, { date: p.date, minutes: Math.round((Date.now() - p.startedAt) / 60000), planned: p.minutes, steps: p.results, stopped: true }].slice(-400), []);
  practice.value = null;
  store().remove('practice');
  run(false);
}
