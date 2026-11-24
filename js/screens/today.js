// today.js — «Сегодня»: открыл — и сразу понятно, что играть. Занятие на 10, 25 или 45 минут в одно нажатие,
// подобранное по дорожке, повторениям, рекордам и слуху; серия дней с «заморозкой»; после перерыва — мягкий
// возврат без упрёков. Шаги открывают инструменты сразу в режиме шага: внизу — таймер и «Готово».
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, card } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { dayTitle, LENGTHS } from '../core/session.js';
import { routeHref, isReady } from '../core/routes.js';
import { trackState } from '../core/curriculum.js';
import { recentMinutes, isComeback } from '../core/progress.js';
import { summarizeV2, describeV2, V2_PREFIX } from '../core/migrate.js';
import { store, readForeign } from '../app/store.js';
import { practice, startPractice, stopPractice, stepHref, planToday } from '../app/practice.js';
import { streakNow, trackData, cardsToday, today } from '../app/activity.js';
import { go } from '../app/router.js';

const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

/** Похвала за регулярность, а не только за рекорды */
function streakText(s) {
  if (!s.current) return s.best ? 'Новая серия начинается с одного дня. Даже 10 минут считаются.' : 'Занимайся каждый день понемногу — здесь появится серия дней.';
  const days = `${s.current} ${plural(s.current, 'день', 'дня', 'дней')} подряд`;
  if (!s.todayDone) return `${days}. Сегодня ещё можно продолжить серию.`;
  if (s.current >= 7) return `${days} — регулярность важнее длины, так и растёт рука.`;
  return `${days}. Сегодня занятие уже было — серия продолжается.`;
}

/** Предложение перенести данные «Гитарного круга», если они есть на этом адресе */
function migrateOffer() {
  if (store().get('migratedV2') || store().get('migrateV2Later')) return null;
  const v2 = readForeign(V2_PREFIX);
  const sum = summarizeV2(v2);
  if (!sum.any || !(sum.riffs || sum.records || sum.rhythmTests || sum.ear || sum.settings)) return null;
  const box = card({ title: 'Данные «Гитарного круга»', id: 'migrate-offer', cls: 'offer' },
    h('p', null, `В этом браузере есть твои данные из прошлого приложения: ${describeV2(sum)}. Их можно перенести — старые данные останутся как есть.`),
    h('div', { class: 'row' },
      h('a', { class: 'btn btn-primary', href: '#/progress/data?migrate=1', 'data-action': 'migrate' }, 'Посмотреть и перенести'),
      h('button', { type: 'button', class: 'btn btn-plain', 'data-action': 'migrate-later', onclick: () => { store().set('migrateV2Later', today()); box.remove(); } }, 'Не сейчас')));
  return box;
}

export function render() {
  const d = disposer();
  const saved = store().get('today', {});
  const minutes = signal(LENGTHS.includes(saved.minutes) ? saved.minutes : 25);
  const plan = signal(planToday(minutes.value));
  d.add(minutes.watch(m => { plan.value = planToday(m); }));
  const streak = streakNow();
  const comeback = !streak.todayDone && isComeback(streak.gap);

  const steps = h('ol', { class: 'steps' });
  const summary = h('b', { class: 'big' });
  const startLabel = h('span');
  const start = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'start' }, icon('playFill', 22), startLabel);
  const stop = h('button', { type: 'button', class: 'btn btn-ghost', 'data-action': 'stop', onclick: () => stopPractice() }, 'Закончить занятие');
  const result = h('p', { class: 'result', hidden: true });

  const lengths = segmented({
    label: 'Длина занятия, минут',
    name: 'minutes',
    options: LENGTHS.map(l => [String(l), String(l)]),
    sig: { get value() { return String(minutes.value); }, watch: fn => minutes.watch(v => fn(String(v))) },
    onchange: v => { minutes.value = Number(v); store().set('today', { minutes: minutes.value }); },
  });

  // шаги: в идущем занятии — его шаги с отметками, иначе — план на выбранную длину
  const view = signal(null);
  const refresh = () => { view.value = { plan: plan.value, p: practice.value }; };
  d.add(plan.watch(refresh));
  d.add(practice.watch(refresh));
  d.add(view.watch(v => {
    if (!v) return;
    const p = v.p, list = p ? p.steps : v.plan.steps;
    steps.replaceChildren(...list.map((s, i) => {
      const state = p ? (p.results[s.id] || (i === p.index ? 'now' : '')) : i === 0 ? 'now' : '';
      return h('li', null, h('a', { class: `step ${state}`, href: routeHref(s.section, s.page, { ...(s.query || {}), from: 'today' }), dataset: { step: s.id } },
        h('span', { class: 'step-num', 'aria-hidden': 'true' }, state === 'done' ? icon('check', 18) : String(i + 1)),
        h('span', { class: 'row-text' }, h('b', null, s.title), h('span', { class: 'muted' }, s.detail + (isReady(s.section, s.page) ? '' : ' · инструмент скоро'))),
        h('span', { class: 'step-min muted' }, state === 'skipped' ? 'пропущен' : `${s.minutes} мин`)));
    }));
    startLabel.textContent = p ? `Продолжить · шаг ${p.index + 1} из ${p.steps.length}` : `Начать · ${minutes.value} мин`;
    stop.hidden = !p;
    lengths.hidden = !!p;
    summary.textContent = p ? `Идёт занятие · ${p.minutes} мин` : `${v.plan.minutes} мин · ${v.plan.steps.length} ${plural(v.plan.steps.length, 'шаг', 'шага', 'шагов')}`;
    const last = store().get('lastPractice');
    result.hidden = !!p || !last || last.date !== today();
    if (!result.hidden) result.textContent = `Сегодняшнее занятие сделано: ${last.done} ${plural(last.done, 'шаг', 'шага', 'шагов')} из ${last.total} за ${last.minutes} мин. Можно ещё — или отдохнуть: регулярность важнее длины.`;
  }));
  start.addEventListener('click', () => {
    const p = practice.value;
    if (p) go(stepHref(p, p.index));
    else startPractice(minutes.value);
  });

  // серия дней и неделя столбиками
  const week = recentMinutes(store().get('days', {}) || {}, today(), 7);
  const maxMin = Math.max(20, ...week.map(x => x.minutes));
  const streakCard = card({ cls: 'streak-card', id: 'streak' },
    h('div', { class: 'streak-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Серия'), h('b', { class: 'big mono' }, String(streak.current)), h('span', { class: 'muted' }, ` ${plural(streak.current, 'день', 'дня', 'дней')}`)),
      h('div', { class: 'week', role: 'img', 'aria-label': `Минуты за неделю: ${week.map(x => x.minutes).join(', ')}` },
        ...week.map(x => h('span', { class: `wbar${x.day === today() ? ' now' : ''}`, style: `--h:${Math.round((100 * x.minutes) / maxMin)}%`, title: `${x.minutes} мин` })))),
    h('p', { class: 'muted note' }, comeback
      ? `С возвращением! Перерыв был ${streak.gap} ${plural(/** @type {number} */ (streak.gap), 'день', 'дня', 'дней')} — это нормально. Сегодня спокойно: разогрей руки и освежи пройденное.`
      : streakText(streak)),
    h('p', { class: 'muted note' }, `Заморозки: ${streak.freezes} из 2 — спасают серию за пропущенный день. Новая — за каждые 7 дней занятий.`));

  // дорожка и повторения
  const tstate = trackState(trackData());
  const next = tstate.next;
  const pathCard = card({ title: 'Учебная дорожка', id: 'path-card' },
    h('p', null, h('b', null, `Ступень «${tstate.current.title}»`), h('br'), h('span', { class: 'muted' }, next ? `Дальше: ${next.title}` : 'Дорожка пройдена — впереди CAGED, гаммы по 3 ноты и техника.')),
    h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(tstate.total), 'aria-valuenow': String(tstate.done), 'aria-label': 'Пройдено шагов дорожки' },
      h('span', { style: `width:${Math.round((100 * tstate.done) / tstate.total)}%` })),
    h('p', { class: 'muted note' }, `Пройдено ${tstate.done} из ${tstate.total}.`),
    h('a', { class: 'btn btn-ghost', href: '#/today/path', 'data-action': 'path' }, 'Открыть дорожку'));
  const cards = cardsToday();
  const n = cards.due + cards.fresh;
  const reviewRow = n ? h('a', { class: 'row-link', href: '#/progress/review', 'data-action': 'review' },
    h('span', { class: 'row-text' }, h('b', null, 'Повторения'), h('span', { class: 'muted' }, `${n} ${plural(n, 'карточка ждёт', 'карточки ждут', 'карточек ждут')} — пара минут`)),
    h('span', { class: 'badge' }, String(n)), icon('next', 20)) : null;

  const el = h('div', { class: 'screen today' },
    screenHeader({ eyebrow: dayTitle(), title: 'Сегодня', actions: [h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Настройки' }, icon('gear', 22))] }),
    migrateOffer(),
    result,
    card({ cls: 'session' },
      h('div', { class: 'session-head' }, h('div', null, h('div', { class: 'eyebrow' }, comeback ? 'Мягкий возврат' : 'Занятие'), summary), lengths),
      steps,
      h('p', { class: 'note muted' }, 'Каждый шаг открывает инструмент, внизу — таймер и «Готово». Педаль для перелистывания тоже работает: «вперёд» — следующий шаг.'),
      stop),
    streakCard,
    reviewRow ? card({ cls: 'flush' }, reviewRow) : null,
    pathCard,
    h('div', { class: 'cta-sticky' }, start));
  return { el, title: 'Сегодня', dispose: () => d.dispose() };
}
