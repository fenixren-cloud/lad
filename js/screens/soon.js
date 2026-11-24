// soon.js — страница инструмента или темы, которая появится на следующих этапах:
// честно говорит, что здесь будет и когда.
import { h } from '../ui/dom.js';
import { screenHeader, card } from '../ui/components.js';
import { SECTIONS, pageInfo, routeHref } from '../core/routes.js';
import { disposer } from '../core/signal.js';
import { stepBar } from './step.js';

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const p = pageInfo(r.section, r.page);
  const s = SECTIONS.find(x => x.id === r.section);
  const fromToday = r.query.from === 'today';
  const el = h('div', { class: 'screen' },
    screenHeader({ eyebrow: s.title, title: p.title, back: fromToday ? '#/today' : routeHref(r.section) }),
    card({ cls: 'soon' },
      h('p', { class: 'lead' }, p.hint[0].toUpperCase() + p.hint.slice(1) + '.'),
      h('p', { class: 'muted' }, `Появится на этапе ${p.stage}. Здесь будет полноценный инструмент: он работает и сам по себе, и как шаг занятия «Сегодня».`),
      fromToday ? h('p', { class: 'muted' }, 'Пока можно позаниматься этим самостоятельно и нажать «Готово» — или пропустить шаг.') : null),
    fromToday ? h('a', { class: 'btn btn-ghost', href: '#/today' }, 'Вернуться к занятию') : null,
    stepBar(r, d));
  return { el, title: p.title, dispose: () => d.dispose() };
}
