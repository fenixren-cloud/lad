// neckmap.js — карта грифа: какие ноты до 12-го лада уже знаешь (по повторениям). Цель — весь гриф.
// Тусклые — ещё не в повторениях, контурные — учатся, светлые — «знаю» (держится 4+ дня), яркие — «твёрдо».
import { h } from '../ui/dom.js';
import { screenHeader, card } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { TUNINGS } from '../core/neck.js';
import { neckMap } from '../core/progress.js';
import { deckStats } from '../core/srs.js';
import { isNoteCard } from '../core/cards.js';
import { store } from '../app/store.js';
import { settings } from '../app/state.js';
import { refreshNotes, today } from '../app/activity.js';
import { neckView } from './theory-kit.js';
import { nm } from './ear-kit.js';

const LEVEL = ['ещё нет', 'учится', 'знаю', 'твёрдо'];

export function render() {
  const d = disposer();
  refreshNotes();
  const tuning = TUNINGS[settings.value.tuning].midi;
  const map = neckMap(store().get('deck', {}) || {}, tuning);
  const stats = deckStats(store().get('deck', {}) || {}, today(), isNoteCard);
  const neck = neckView(d, 'Карта грифа: выученные ноты');
  neck.show({ from: 0, to: 12, focus: 0,
    markers: map.cells.map(c => ({ string: c.string, fret: c.fret, label: nm(c.pc), role: /** @type {'other'} */ ('other'), dim: c.level === 0, ring: c.level === 1, cls: `lv-${c.level}` })) });
  const per = [0, 1, 2, 3, 4, 5].map(s => { const cs = map.cells.filter(c => c.string === s); return { s, known: cs.filter(c => c.level >= 2).length, total: cs.length }; });
  const el = h('div', { class: 'screen neckmap' },
    screenHeader({ eyebrow: 'Прогресс', title: 'Карта грифа', back: '#/progress' }),
    card({ id: 'map-sum' },
      h('div', { class: 'stats3' },
        h('div', null, h('b', { class: 'mono' }, `${map.percent} %`), h('span', { class: 'muted' }, 'грифа до 12-го лада')),
        h('div', null, h('b', { class: 'mono' }, String(map.known)), h('span', { class: 'muted' }, `из ${map.total} мест`)),
        h('div', null, h('b', { class: 'mono' }, String(stats.today)), h('span', { class: 'muted' }, 'нот на сегодня'))),
      h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Выучено мест на грифе', 'aria-valuemin': '0', 'aria-valuemax': String(map.total), 'aria-valuenow': String(map.known) }, h('span', { style: `width:${map.percent}%` }))),
    card({ cls: 'neckcard' }, neck.el),
    h('p', { class: 'map-legend muted note' }, ...LEVEL.map((t, i) => h('span', { class: `lv lv-${i}` }, t))),
    card({ title: 'По струнам', id: 'map-strings', cls: 'flush' },
      h('ul', { class: 'plain-list pad' }, ...per.map(p => h('li', null, h('b', null, `${6 - p.s}-я струна (${nm(tuning[p.s] % 12)})`), ` — ${p.known} из ${p.total}`)))),
    card({ cls: 'muted-card', id: 'map-how' },
      h('p', null, 'Ноты попадают сюда из повторений: сначала 6-я и 5-я струны (после урока «Ноты на 6-й и 5-й струнах»), потом по струне — когда предыдущие держатся в памяти. «Знаю» — нота продержалась хотя бы 4 дня.'),
      h('a', { class: 'btn btn-primary', href: '#/progress/review?deck=notes', 'data-action': 'train-notes' }, 'Тренировать ноты')));
  return { el, title: 'Карта грифа', dispose: () => d.dispose() };
}
