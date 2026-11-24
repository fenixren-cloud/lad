// step.js — полоса шага занятия внизу экрана инструмента: что за шаг, таймер, «Готово», «Ещё», «Пропустить».
// «Руки заняты»: педаль для перелистывания (PageDown / стрелка вправо) — «Готово», PageUp / стрелка влево — назад.
import { h } from '../ui/dom.js';
import { practice, finishStep, moreTime, previousStep } from '../app/practice.js';

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * @param {{ section: string, page: string | null }} route экран, на котором стоит полоса (если занятие сейчас
 *   на другом шаге — полоса не видна)
 * @param {{ add: (fn: () => void) => any }} d набор отписок экрана
 */
export function stepBar(route, d) {
  const title = h('b');
  const time = h('span', { class: 'mono step-time', role: 'timer', 'aria-live': 'off' });
  const bar = h('div', { class: 'stepbar', role: 'region', 'aria-label': 'Шаг занятия' },
    h('div', { class: 'stepbar-info' }, title, time),
    h('div', { class: 'stepbar-btns' },
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-step': 'skip', onclick: () => finishStep('skipped') }, 'Пропустить'),
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-step': 'more', onclick: () => moreTime(2) }, '+2 мин'),
      h('button', { type: 'button', class: 'btn btn-step', 'data-step': 'done', onclick: () => finishStep('done') }, 'Готово')));
  d.add(practice.watch(p => {
    const step = p && p.steps[p.index];
    const mine = !!step && step.section === route.section && step.page === route.page;
    bar.hidden = !mine;
    document.body.classList.toggle('has-step', !!mine);
    if (!mine) return;
    title.textContent = `Шаг ${p.index + 1} из ${p.steps.length} · ${p.steps[p.index].title}`;
    time.textContent = p.left > 0 ? mmss(p.left) : 'время вышло';
    bar.classList.toggle('over', p.left === 0);
  }));
  const onKey = e => {
    if (bar.hidden || e.defaultPrevented || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); finishStep('done'); }
    else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); previousStep(); }
  };
  document.addEventListener('keydown', onKey);
  d.add(() => { document.removeEventListener('keydown', onKey); document.body.classList.remove('has-step'); });
  return bar;
}
