// charts.js — графики прогресса: темп упражнений (лестница темпа), тест ритма (смещение и разброс),
// точность слуха по дням. Одна ось на график; вторая величина — пунктиром, с подписью.
import { h } from '../ui/dom.js';
import { screenHeader, card } from '../ui/components.js';
import { signal, disposer } from '../core/signal.js';
import { EXERCISES } from '../core/metronome.js';
import { RHYTHM_MODES } from '../core/rhythm.js';
import { tempoSeries, rhythmSeries, earSeries } from '../core/progress.js';
import { QUIZZES, accuracy } from '../core/earquiz.js';
import { dayLabel } from '../core/dates.js';
import { lineChart } from '../ui/linechart.js';
import { store } from '../app/store.js';

/** Выпадающий список (длинные названия не влезают в сегменты на 360 px) */
function picker(label, name, options, sig) {
  const sel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input-select', 'aria-label': label, dataset: { setting: name }, onchange: () => { sig.value = sel.value; } },
    ...options.map(([v, t]) => h('option', { value: v }, t))));
  sel.value = sig.value;
  return h('label', { class: 'setting' }, h('b', null, label), sel);
}
const short = day => dayLabel(day).replace(/ (\S{3})\S*$/, ' $1');

export function render() {
  const d = disposer();
  const tempoLog = store().get('tempoLog', {}) || {};
  const records = store().get('records', {}) || {};

  // ---------- темп ----------
  const withData = EXERCISES.filter(e => tempoSeries(tempoLog, e.id).length);
  const ex = signal(withData[0]?.id || '');
  const tempoBox = h('div');
  d.add(ex.watch(id => {
    const e = EXERCISES.find(x => x.id === id);
    if (!e) {
      tempoBox.replaceChildren(h('p', { class: 'muted' }, 'Пока пусто. Включи в метрономе упражнение с лестницей темпа и «Слушать игру»: каждый чистый проход попадёт сюда.'),
        h('a', { class: 'btn btn-ghost', href: '#/play/metronome?ex=chrom' }, 'К упражнениям'));
      return;
    }
    const pts = tempoSeries(tempoLog, id).map(p => ({ x: p.day, y: p.value }));
    tempoBox.replaceChildren(
      h('p', { class: 'muted note' }, `${e.name}: старт ${e.start}, рекорд ${records[id]?.best || pts[pts.length - 1].y} BPM, сейчас лестница на ${records[id]?.bpm || e.start}.`),
      lineChart({ label: `Темп: ${e.name}`, series: [{ name: 'чистый темп', points: pts }], unit: ' BPM', format: short }));
  }));
  const exSel = withData.length > 1 ? picker('Упражнение', 'ex', withData.map(e => [e.id, e.name]), ex) : null;

  // ---------- тест ритма ----------
  const hist = store().get('rhythmHist', []) || [];
  const modes = RHYTHM_MODES.filter(([m]) => rhythmSeries(hist, m).length);
  const mode = signal(modes[0]?.[0] || '');
  const rhythmBox = h('div');
  d.add(mode.watch(m => {
    const list = rhythmSeries(hist, m).slice(-30);
    if (!list.length) {
      rhythmBox.replaceChildren(h('p', { class: 'muted' }, 'Пока пусто. Пройди тест ритма — здесь будет видно, как уменьшается разброс.'), h('a', { class: 'btn btn-ghost', href: '#/play/rhythm' }, 'К тесту ритма'));
      return;
    }
    const key = i => String(i).padStart(3, '0');
    const days = list.map(x => x.day);
    const format = x => short(days[Number(x)]);
    rhythmBox.replaceChildren(
      h('p', { class: 'muted note' }, 'Разброс — насколько удары гуляют вокруг доли: чем ниже, тем ровнее. Смещение — раньше (минус) или позже (плюс) в среднем; его исправляет калибровка.'),
      lineChart({ label: 'Тест ритма: разброс и смещение, мс', unit: ' мс', zero: true, format,
        series: [{ name: 'разброс', points: list.map((x, i) => ({ x: key(i), y: x.sd })) }, { name: 'смещение', dashed: true, points: list.map((x, i) => ({ x: key(i), y: x.mean })) }] }));
  }));
  const modeSel = modes.length > 1 ? picker('Режим теста', 'mode', modes, mode) : null;

  // ---------- слух ----------
  const ear = earSeries(store().get('days', {}) || {}).slice(-30);
  const stats = store().get('earStats', {}) || {};
  const quizRows = Object.entries(QUIZZES).filter(([id]) => stats[id]?.total).map(([id, name]) => h('tr', null, h('td', null, name), h('td', { class: 'mono' }, `${accuracy(stats[id])} %`), h('td', { class: 'mono' }, String(stats[id].total))));
  const earBox = ear.length
    ? lineChart({ label: 'Точность слуха по дням, %', series: [{ name: 'точность', points: ear.map(x => ({ x: x.day, y: x.value })) }], unit: ' %', yMin: 0, yMax: 100, format: short })
    : h('p', { class: 'muted' }, 'Пока пусто: ответь хотя бы на 3 вопроса квизов «Слуха» за день.');

  const el = h('div', { class: 'screen charts' },
    screenHeader({ eyebrow: 'Прогресс', title: 'Графики', back: '#/progress' }),
    card({ title: 'Темп упражнений', id: 'ch-tempo' }, exSel, tempoBox),
    card({ title: 'Тест ритма', id: 'ch-rhythm' }, modeSel, rhythmBox),
    card({ title: 'Слух', id: 'ch-ear' }, earBox,
      quizRows.length ? h('table', { class: 'quiz-table' }, h('thead', null, h('tr', null, h('th', null, 'Квиз'), h('th', null, 'Точность'), h('th', null, 'Ответов'))), h('tbody', null, ...quizRows)) : null));
  return { el, title: 'Графики', dispose: () => d.dispose() };
}
