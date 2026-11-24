// section.js — страница раздела (Теория, Играть, Слух, Прогресс): что внутри и куда идти.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, linkRow, card } from '../ui/components.js';
import { SECTIONS, PAGES, routeHref, isReady } from '../core/routes.js';
import { LESSONS, nextLesson } from '../core/lessons.js';
import { earDrill, QUIZZES, accuracy } from '../core/earquiz.js';
import { store } from '../app/store.js';
import { streakNow, cardsToday, trackData } from '../app/activity.js';
import { trackState } from '../core/curriculum.js';
import { neckMap } from '../core/progress.js';
import { TUNINGS } from '../core/neck.js';

const INTRO = {
  theory: 'Теория прямо на грифе: каждая тема — короткий урок с примером, звуком и проверкой.',
  play: 'Инструменты для игры: настроиться, держать темп, играть поверх подложки и сочинять риффы.',
  ear: 'Слух: узнавать интервалы, аккорды и фразы и находить их на грифе. Отвечать можно и игрой на гитаре.',
  progress: 'Что уже получилось: журнал, рекорды, карта грифа и повторения. Здесь же — твои данные.',
};
export const STAGE_NAME = { 2: 'готово', 3: 'скоро · этап 3', 4: 'скоро · этап 4', 5: 'скоро · этап 5', 6: 'скоро · этап 6' };

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const s = SECTIONS.find(x => x.id === r.section);
  // у квизов «Слуха» — лучшая серия правильных ответов
  const best = r.section === 'ear' ? store().get('earBest', {}) || {} : {};
  const record = id => Math.max(0, ...(id === 'notes' ? ['find', 'build', 'odd'] : [id]).map(k => Number(best[k]) || 0));
  const badgeOf = id => (r.section === 'progress' && id === 'review' ? (cardsToday().due + cardsToday().fresh ? `ждут ${cardsToday().due + cardsToday().fresh}` : null) : null);
  const list = h('div', { class: 'list' }, ...PAGES[r.section].filter(p => !p.hidden).map(p => linkRow({
    href: routeHref(r.section, p.id),
    title: p.title,
    hint: p.hint,
    badge: !isReady(r.section, p.id) ? STAGE_NAME[p.stage] || 'скоро' : record(p.id) ? `рекорд ${record(p.id)}` : badgeOf(p.id),
  })));
  // в «Теории» — следующий урок одной кнопкой: открыл — и сразу понятно, что учить
  let cont = null;
  if (r.section === 'theory') {
    const done = store().get('lessons', {}).done || {};
    const n = nextLesson(done), count = LESSONS.filter(l => done[l.id]).length;
    cont = card({ title: n ? 'Следующий урок' : 'Все уроки пройдены', id: 'next-lesson' },
      n ? h('p', null, h('b', null, n.title), h('br'), h('span', { class: 'muted' }, `${n.minutes} мин · ${n.why}`)) : h('p', { class: 'muted' }, 'Повторяй темы в справочнике и играй над подложкой.'),
      h('p', { class: 'muted note' }, `Пройдено ${count} из ${LESSONS.length}.`),
      n ? h('a', { class: 'btn btn-primary', href: `#/theory/lesson?id=${n.id}`, 'data-action': 'next-lesson' }, n && count ? 'Продолжить' : 'Начать первый урок') : null);
  }
  // в «Слухе» — с чего начать сегодня: квиз, который дольше всего не делал
  if (r.section === 'ear') {
    const stats = store().get('earStats', {}) || {};
    const pick = earDrill(stats);
    const done = Object.entries(stats).filter(([, s]) => s && s.total).map(([id, s]) => `${QUIZZES[id] || id} — ${accuracy(s)} %`);
    cont = card({ title: 'Слух сегодня', id: 'ear-next' },
      h('p', null, h('b', null, pick.detail)),
      h('p', { class: 'muted note' }, done.length ? `Точность: ${done.join(' · ')}.` : 'Отвечать можно касанием или игрой на гитаре — приложение слушает микрофон.'),
      h('a', { class: 'btn btn-primary', href: routeHref('ear', pick.page), 'data-action': 'ear-next' }, 'Начать'));
  }
  // в «Прогрессе» — сводка: серия, карточки на сегодня, дорожка, карта грифа
  if (r.section === 'progress') {
    const st = streakNow(), c = cardsToday(), tr = trackState(trackData());
    const map = neckMap(store().get('deck', {}) || {}, TUNINGS.std.midi);
    const n = c.due + c.fresh;
    cont = card({ id: 'progress-sum' },
      h('div', { class: 'stats3' },
        h('div', null, h('b', { class: 'mono' }, String(st.current)), h('span', { class: 'muted' }, 'дней подряд')),
        h('div', null, h('b', { class: 'mono' }, `${tr.done}/${tr.total}`), h('span', { class: 'muted' }, 'шагов дорожки')),
        h('div', null, h('b', { class: 'mono' }, `${map.percent} %`), h('span', { class: 'muted' }, 'грифа знаешь'))),
      n ? h('a', { class: 'btn btn-primary', href: '#/progress/review', 'data-action': 'review-now' }, `Повторить: ${n}`) : h('p', { class: 'muted note' }, 'На сегодня повторять нечего.'));
  }
  const el = h('div', { class: 'screen' },
    screenHeader({ eyebrow: 'Раздел', title: s.title, actions: [h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Настройки' }, icon('gear', 22))] }),
    h('p', { class: 'lead' }, INTRO[r.section]),
    cont,
    card({ cls: 'flush' }, list));
  return { el, title: s.title };
}
