// journal.js — журнал по дням: сколько минут и на что ушли, занятия «Сегодня», уроки, ответы слуха и
// повторений. Сверху — серия дней с «заморозкой». Всё пишется само.
import { h } from '../ui/dom.js';
import { screenHeader, card, button } from '../ui/components.js';
import { journalList } from '../core/progress.js';
import { PAGES, SECTIONS } from '../core/routes.js';
import { lessonById } from '../core/lessons.js';
import { dayLabel } from '../core/dates.js';
import { store } from '../app/store.js';
import { streakNow } from '../app/activity.js';

const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
/** «play/metronome» → «Метроном», «today» → «Сегодня» */
export function screenName(key) {
  const [sec, page] = key.split('/');
  if (page) return PAGES[sec]?.find(p => p.id === page)?.title || key;
  return SECTIONS.find(s => s.id === sec)?.title || (sec === 'settings' ? 'Настройки' : key);
}

export function render() {
  const s = streakNow();
  const list = journalList(store().get('days', {}) || {}, store().get('journal', []) || [], screenName);
  const total = list.reduce((a, x) => a + x.minutes, 0);
  let shown = 30;
  const box = h('ol', { class: 'journal' });
  const more = button({ kind: 'ghost', label: 'Показать ещё', onclick: () => { shown += 30; draw(); }, attrs: { 'data-action': 'more' } });
  const frozen = new Set(s.frozen);
  function draw() {
    box.replaceChildren(...list.slice(0, shown).map(x => h('li', { class: 'jday' },
      h('div', { class: 'jday-head' }, h('b', null, dayLabel(x.day, { weekday: true })), h('span', { class: 'mono' }, `${x.minutes} мин`)),
      x.parts.length ? h('p', { class: 'muted note' }, x.parts.map(p => `${p.label} — ${p.minutes} мин`).join(' · ')) : null,
      x.sessions ? h('p', { class: 'note' }, `Занятие «Сегодня»: ${x.sessions}`) : null,
      x.lessons.length ? h('p', { class: 'note' }, `Уроки: ${x.lessons.map(id => `«${lessonById(id)?.title || id}»`).join(', ')}`) : null,
      x.ear ? h('p', { class: 'note' }, `Слух: верно ${x.ear.right} из ${x.ear.total}`) : null,
      x.cards ? h('p', { class: 'note' }, `Повторения: верно ${x.cards.right} из ${x.cards.total}`) : null)));
    more.hidden = list.length <= shown;
  }
  draw();
  const el = h('div', { class: 'screen journal-screen' },
    screenHeader({ eyebrow: 'Прогресс', title: 'Журнал', back: '#/progress' }),
    card({ cls: 'streak-card', id: 'j-streak' },
      h('div', { class: 'stats3' },
        h('div', null, h('b', { class: 'mono' }, String(s.current)), h('span', { class: 'muted' }, `${plural(s.current, 'день', 'дня', 'дней')} подряд`)),
        h('div', null, h('b', { class: 'mono' }, String(s.best)), h('span', { class: 'muted' }, 'лучшая серия')),
        h('div', null, h('b', { class: 'mono' }, String(s.freezes)), h('span', { class: 'muted' }, plural(s.freezes, 'заморозка', 'заморозки', 'заморозок')))),
      h('p', { class: 'muted note' }, frozen.size ? `Заморозка спасла серию: ${[...frozen].slice(-3).map(d => dayLabel(d)).join(', ')}.` : 'Заморозка спасает серию за пропущенный день. Одна есть сразу, новая — за каждые 7 дней занятий, не больше двух.')),
    list.length
      ? card({ title: `Всего ${total} ${plural(total, 'минута', 'минуты', 'минут')}`, id: 'j-days', cls: 'flush' }, box, more)
      : card({ id: 'j-empty' }, h('p', { class: 'muted' }, 'Журнал пока пуст. Он пишется сам: сколько минут на каждом инструменте, уроки, ответы. Начни с занятия на «Сегодня».'),
        h('a', { class: 'btn btn-primary', href: '#/today' }, 'К занятию')));
  return { el, title: 'Журнал' };
}
