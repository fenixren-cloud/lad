// ear-chords.js — «Аккорд на слух»: удар медиатором (или арпеджио) — какой аккорд? После ответа —
// название с корнем, как звучит, фигура на круге и аппликатура на грифе.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented, button } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { mod12 } from '../core/notes.js';
import { TUNINGS } from '../core/neck.js';
import { CHORD_LEVELS, CHORD_LEVEL_NAMES, CHORD_EAR_NAMES, CHORD_FEEL, chordTask, chordTaskMidis, chordTaskName } from '../core/earquiz.js';
import { chordInfo, chordLabelMap, markersFor } from '../core/theory.js';
import { settings } from '../app/state.js';
import { stepBar } from './step.js';
import { dialView, neckView } from './theory-kit.js';
import { earRand, earPrefs, streakView, earNav, earKeys, exposeTask, answerGrid, playSeq, autoplayOk, german } from './ear-kit.js';

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  let opened = false; // первое задание экрана уже было
  const rand = earRand(r);
  const fromToday = r.query.from === 'today';
  const prefs = earPrefs('chords', { level: 'easy' }, v => ({ level: v.level in CHORD_LEVELS ? v.level : 'easy' }));
  const streak = streakView('chords');
  /** @type {ReturnType<typeof chordTask> & { done: boolean, wrong: Set<string> }} */
  let task = null;

  const prompt = h('p', { class: 'ear-prompt', 'aria-live': 'polite' });
  const grid = answerGrid('Какой аккорд?', [], t => pick(String(t)));
  const explain = h('div', { class: 'ear-explain', hidden: true });
  const dial = dialView(d, { label: 'Аккорд на круге' });
  const neck = neckView(d, 'Аккорд на грифе');
  const reveal = h('div', { class: 'ear-reveal', hidden: true }, h('div', { class: 'dial-wrap small' }, dial.el), card({ cls: 'neckcard' }, neck.el));

  const tuning = () => TUNINGS[settings.value.tuning].midi;
  function play(arp = false) {
    if (!task) return;
    const midis = chordTaskMidis(task, tuning());
    const items = arp ? midis.map((m, i) => ({ notes: [{ midi: m }], beats: i === midis.length - 1 ? 1.5 : 0.5 })) : [{ notes: midis.map(m => ({ midi: m })), beats: 3, strum: true }];
    playSeq(items, { title: 'Аккорд', bpm: 90 }).then(ok => { if (!ok) prompt.textContent = 'Без звука: этот браузер не умеет Web Audio. Квиз работает только со звуком.'; });
  }
  function newTask() {
    task = { ...chordTask(prefs.sig.value.level, settings.value.tuning, rand), done: false, wrong: new Set() };
    prompt.textContent = 'Какой аккорд?';
    explain.hidden = true;
    reveal.hidden = true;
    grid.redraw(CHORD_LEVELS[prefs.sig.value.level].map(t => ({ value: t, label: CHORD_EAR_NAMES[t] })));
    nav.ready(false);
    if (autoplayOk(r, !opened)) play();
    opened = true;
  }
  function pick(type) {
    if (!task || task.done) return;
    if (type !== task.type) {
      if (!task.wrong.has(type)) { task.wrong.add(type); if (task.wrong.size === 1) streak.score(false); }
      grid.mark(type, 'wrong');
      prompt.textContent = `Не ${CHORD_EAR_NAMES[type].toLowerCase()}. Послушай ещё раз — можно арпеджио, по одной ноте.`;
      return;
    }
    task.done = true;
    if (!task.wrong.size) streak.score(true);
    grid.mark(type, 'right');
    prompt.textContent = task.wrong.size ? 'Теперь верно.' : 'Верно!';
    const info = chordInfo(task.pc, task.type, german());
    explain.replaceChildren(
      h('p', null, h('b', null, chordTaskName(task, german())), ` — ${info.names.join(' ')} (${info.degrees.join(' ')}). Характер: ${CHORD_FEEL[task.type]}.`),
      h('p', { class: 'muted note' }, `Форма: ${task.shape}. Стороны фигуры на круге — ${info.sides.join(' + ')} полутонов.`));
    explain.hidden = false;
    const map = chordLabelMap(task.pc, task.type, german());
    dial.update({ layout: 'chroma', polygon: { root: task.pc, type: task.type },
      nodes: info.pcs.map((pc, i) => ({ pc, label: settings.value.labels === 'notes' ? info.names[i] : info.degrees[i], role: map.get(pc)?.role || 'other' })) });
    const notes = (task.frets || []).flatMap((f, s) => (f == null ? [] : [{ string: s, fret: f, pc: mod12(tuning()[s] + f) }]));
    const fs = notes.map(n => n.fret);
    neck.show({ from: Math.max(0, Math.min(...fs) - 1), to: Math.min(22, Math.max(...fs) + 2), markers: markersFor(notes, map, { labels: /** @type {any} */ (settings.value.labels) }), focus: Math.min(...fs) });
    reveal.hidden = false;
    nav.ready(true);
  }

  const nav = earNav({ replay: () => play(false), next: newTask });
  earKeys(d, r, { replay: () => play(false), next: newTask, solved: () => !!task?.done });
  exposeTask(d, () => task);

  const level = segmented({ label: 'Уровень', name: 'level', options: CHORD_LEVEL_NAMES.map(([v, t]) => [v, t]), sig: prefs.field('level'), onchange: v => { prefs.set({ level: v }); newTask(); } });
  const arp = button({ kind: 'ghost', label: 'Арпеджио', onclick: () => play(true), attrs: { 'data-action': 'arp' } });

  newTask();
  const el = h('div', { class: 'screen ear ear-chords' },
    screenHeader({ eyebrow: 'Слух', title: 'Аккорды на слух', back: fromToday ? '#/today' : '#/ear' }),
    h('p', { class: 'lead' }, 'Удар по аккорду — какой он? Мажор светлый, минор грустный, пауэр-аккорд «пустой» — ни то ни другое. Арпеджио — те же ноты по одной.'),
    h('div', { class: 'setting' }, h('b', null, 'Уровень'), level),
    card({ cls: 'ear-task' }, prompt, grid.el, h('div', { class: 'row' }, arp), explain, reveal),
    streak.el,
    card({ title: 'Как заниматься', id: 'ch-how', cls: 'muted-card' },
      h('p', null, 'Слушай терцию — она решает, мажор или минор. Если не слышно — включи «Арпеджио»: вторая нота снизу и есть терция.'),
      h('p', null, 'Sus4 звучит «подвешенно» и просится разрешиться, уменьшённый — тесно и тревожно, увеличенный — зыбко.'),
      h('p', { class: 'muted note' }, 'Пробел — ещё раз, педаль «вперёд» — следующий аккорд.')),
    nav.el,
    stepBar(r, d));
  return { el, title: 'Аккорды на слух', dispose: () => d.dispose() };
}
