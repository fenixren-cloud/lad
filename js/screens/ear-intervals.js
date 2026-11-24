// ear-intervals.js — «Интервал на слух»: две ноты вверх, вниз или вместе — какой интервал? После ответа —
// название, характер, подсказка-песня (только название, и только надёжная) и как интервал выглядит на круге.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { mod12, INTERVALS, degreeRole } from '../core/notes.js';
import { IV_LEVELS, IV_LEVEL_NAMES, IV_DIRS, intervalTask, songHint } from '../core/earquiz.js';
import { INTERVAL_FEEL, fretShift } from '../core/theory.js';
import { stepBar } from './step.js';
import { dialView } from './theory-kit.js';
import { earRand, earPrefs, streakView, earNav, earKeys, exposeTask, answerGrid, playSeq, autoplayOk, nm } from './ear-kit.js';

const DIR_TEXT = { up: 'вверх', down: 'вниз', harm: 'вместе' };
const pt = n => `${n} ${n === 1 ? 'полутон' : n >= 2 && n <= 4 ? 'полутона' : 'полутонов'}`;

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  let opened = false; // первое задание экрана уже было
  const rand = earRand(r);
  const fromToday = r.query.from === 'today';
  const prefs = earPrefs('intervals', { level: 'easy', dir: 'up' }, v => ({ level: v.level in IV_LEVELS ? v.level : 'easy', dir: IV_DIRS.some(([x]) => x === v.dir) ? v.dir : 'up' }));
  const streak = streakView('intervals');
  /** @type {ReturnType<typeof intervalTask> & { done: boolean, wrong: Set<number> }} */
  let task = null;

  const prompt = h('p', { class: 'ear-prompt', 'aria-live': 'polite' });
  const grid = answerGrid('Какой интервал?', [], st => pick(st));
  const explain = h('div', { class: 'ear-explain', hidden: true });
  const dial = dialView(d, { label: 'Интервал на круге' });
  const dialWrap = h('div', { class: 'dial-wrap small', hidden: true }, dial.el);

  function drawGrid() {
    grid.redraw(IV_LEVELS[prefs.sig.value.level].map(st => ({ value: st, label: INTERVALS[st].short, sub: `${st} пт` })));
  }
  function play() {
    if (!task) return;
    const { a, b, dir } = task;
    const items = dir === 'harm' ? [{ notes: [{ midi: a }, { midi: b }], beats: 2 }] : [{ notes: [{ midi: a }], beats: 1 }, { notes: [{ midi: b }], beats: 1.5 }];
    playSeq(items, { title: 'Интервал', bpm: 80 }).then(ok => { if (!ok) prompt.textContent = 'Без звука: этот браузер не умеет Web Audio. Квиз работает только со звуком.'; });
  }
  function newTask() {
    const p = prefs.sig.value;
    task = { ...intervalTask(p.level, p.dir, rand), done: false, wrong: new Set() };
    prompt.replaceChildren('Какой интервал? ', h('b', null, DIR_TEXT[task.dir]));
    explain.hidden = true;
    dialWrap.hidden = true;
    drawGrid();
    nav.ready(false);
    if (autoplayOk(r, !opened)) play();
    opened = true;
  }
  function pick(st) {
    if (!task || task.done) return;
    if (st !== task.st) {
      if (!task.wrong.has(st)) { task.wrong.add(st); if (task.wrong.size === 1) streak.score(false); }
      grid.mark(st, 'wrong');
      prompt.textContent = `Не ${INTERVALS[st].short}. Послушай ещё раз — «Ещё раз» внизу.`;
      return;
    }
    task.done = true;
    if (!task.wrong.size) streak.score(true);
    grid.mark(st, 'right');
    const info = INTERVALS[st], song = songHint(st, task.dir);
    prompt.textContent = task.wrong.size ? 'Теперь верно.' : 'Верно!';
    explain.replaceChildren(
      h('p', null, h('b', null, `${info.short} — ${info.name}`), `, ${pt(st)}. ${INTERVAL_FEEL[st][0].toUpperCase()}${INTERVAL_FEEL[st].slice(1)}.`),
      h('p', { class: 'muted' }, song ? `Подсказка: ${song}.` : 'Надёжной подсказки-песни нет — запоминай по характеру и по тому, как интервал лежит на грифе.'),
      h('p', { class: 'muted note' }, `На грифе от нижней ноты: та же струна — ${fretShift(st)}, соседняя струна — ${fretShift(st - 5)}.`));
    explain.hidden = false;
    const root = task.lowPc, top = mod12(root + st);
    dial.update({ layout: 'chroma', arc: st % 12 ? { from: root, st } : null,
      nodes: Array.from({ length: 12 }, (_, pc) => ({ pc, label: nm(pc), role: pc === root ? 'root' : pc === top && st % 12 ? degreeRole(info.deg) : 'none' })),
      center: { big: `+${st}`, small: info.short } });
    dialWrap.hidden = false;
    nav.ready(true);
  }

  const nav = earNav({ replay: play, next: newTask });
  earKeys(d, r, { replay: play, next: newTask, solved: () => !!task?.done });
  exposeTask(d, () => task);

  const level = segmented({ label: 'Уровень', name: 'level', options: IV_LEVEL_NAMES.map(([v, t]) => [v, t]), sig: prefs.field('level'), onchange: v => { prefs.set({ level: v }); newTask(); } });
  const dir = segmented({ label: 'Как звучат ноты', name: 'dir', options: IV_DIRS.map(([v, t]) => [v, t]), sig: prefs.field('dir'), onchange: v => { prefs.set({ dir: v }); newTask(); } });

  newTask();
  const el = h('div', { class: 'screen ear ear-intervals' },
    screenHeader({ eyebrow: 'Слух', title: 'Интервалы на слух', back: fromToday ? '#/today' : '#/ear' }),
    h('p', { class: 'lead' }, 'Две ноты — какое между ними расстояние? Узнавая интервалы, ты слышишь, куда идёт мелодия, — с этого начинается подбор на слух.'),
    h('div', { class: 'setting' }, h('b', null, 'Уровень'), level),
    h('div', { class: 'setting' }, h('b', null, 'Как звучат'), dir),
    card({ cls: 'ear-task' }, prompt, grid.el, explain, dialWrap),
    streak.el,
    card({ title: 'Как заниматься', id: 'iv-how', cls: 'muted-card' },
      h('p', null, 'Не считай полутоны — слушай характер: малая терция грустная, большая светлая, квинта пустая и мощная, тритон тревожный.'),
      h('p', null, 'Начни с лёгкого уровня «вверх». Когда серия дойдёт до 10 — добавь «вниз» и «вместе».'),
      h('p', { class: 'muted note' }, 'Пробел — ещё раз, педаль «вперёд» — следующий интервал.')),
    nav.el,
    stepBar(r, d));
  return { el, title: 'Интервалы на слух', dispose: () => d.dispose() };
}
