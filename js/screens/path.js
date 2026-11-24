// path.js — учебная дорожка: 10 ступеней, на каждой — уроки и практика с понятной целью. Цели засчитываются
// сами (по рекордам, тесту ритма, слуху, повторениям); импровизацию и сочинение отмечаешь сам — «Сделано».
// Ступень открывается, когда пройдены уроки предыдущей.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, card } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { trackState, NEXT_TOPICS } from '../core/curriculum.js';
import { routeHref } from '../core/routes.js';
import { store } from '../app/store.js';
import { trackData, today } from '../app/activity.js';

const KIND = { lesson: 'урок', drill: 'практика', self: 'сам' };

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const list = h('div', { class: 'path' });
  const head = h('p', { class: 'lead' });

  const draw = () => {
    const st = trackState(trackData());
    head.textContent = `Пройдено ${st.done} из ${st.total}. Уроки открывают следующую ступень, практику можно догонять параллельно.`;
    list.replaceChildren(...st.units.map((u, ui) => {
      const full = u.done === u.items.length;
      return card({ cls: `unit${u.open ? '' : ' locked'}${full ? ' full' : ''}`, id: `unit-${u.unit.id}` },
        h('div', { class: 'unit-head' },
          h('span', { class: 'unit-num', 'aria-hidden': 'true' }, full ? icon('check', 18) : u.open ? String(ui + 1) : icon('lock', 16)),
          h('div', null, h('h2', { class: 'card-title' }, u.unit.title), h('p', { class: 'muted note' }, u.unit.why)),
          h('span', { class: 'badge' }, `${u.done}/${u.items.length}`)),
        u.open ? null : h('p', { class: 'muted note' }, 'Откроется, когда пройдены уроки предыдущей ступени.'),
        h('ol', { class: 'path-items' }, ...u.items.map(x => {
          const it = x.item;
          const isNext = st.next?.id === it.id;
          const label = h('span', { class: 'row-text' },
            h('b', null, it.title),
            h('span', { class: 'muted' }, `${KIND[it.kind]} · ${it.detail}`),
            x.goal ? h('span', { class: `goal${x.done ? ' ok' : ''}` }, x.goal.text) : null);
          const mark = h('span', { class: `path-mark${x.done ? ' done' : isNext ? ' now' : ''}`, 'aria-hidden': 'true' }, x.done ? icon('check', 16) : null);
          const row = u.open
            ? h('a', { class: `path-row${isNext ? ' next' : ''}`, href: routeHref(it.section, it.page, it.query || null), dataset: { item: it.id } }, mark, label, icon('next', 18))
            : h('div', { class: 'path-row', dataset: { item: it.id } }, mark, label);
          const selfBtn = u.open && it.kind === 'self'
            ? h('button', { type: 'button', class: `btn btn-plain self-done${x.done ? ' on' : ''}`, 'aria-pressed': String(x.done), dataset: { self: it.id },
              onclick: () => {
                store().update('track', t => {
                  const done = { ...(t?.done || {}) };
                  if (done[it.id]) delete done[it.id]; else done[it.id] = today();
                  return { ...(t || {}), done };
                }, {});
                draw();
              } }, x.done ? 'Сделано ✓' : 'Сделано')
            : null;
          return h('li', { class: x.done ? 'done' : '' }, row, selfBtn);
        })));
    }));
  };
  draw();
  d.add(store().onChange(k => { if (['track', 'lessons', 'records', 'deck', 'earStats'].includes(k)) draw(); }));

  const el = h('div', { class: 'screen path-screen' },
    screenHeader({ eyebrow: 'Сегодня', title: 'Учебная дорожка', back: '#/today' }),
    head,
    list,
    card({ title: 'Что дальше', id: 'next-topics', cls: 'muted-card' },
      h('p', { class: 'muted note' }, 'После дорожки — темы на вырост:'),
      h('ul', { class: 'plain-list' }, ...NEXT_TOPICS.map(([t, x]) => h('li', null, h('b', null, t), ` — ${x}`)))));
  return { el, title: 'Учебная дорожка', dispose: () => d.dispose() };
}
