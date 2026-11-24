// ear-dictation.js — «Диктант на грифе»: приложение играет короткую мелодию, ты находишь её на грифе по порядку —
// касанием или игрой на гитаре. Уровни: пентатоника, гамма, хроматика; 2–5 нот; ориентир — первая нота
// или тоника; медленный режим. Так подбирают риффы на слух: слушаешь, куда и насколько сдвинулась мелодия.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented, button } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { mod12 } from '../core/notes.js';
import { TUNINGS } from '../core/neck.js';
import { DICT_LEVELS, DICT_TONICS, dictWindow, dictMelody, placeOf } from '../core/earquiz.js';
import { roleOf } from '../ui/fretboard.js';
import { settings } from '../app/state.js';
import { stepBar } from './step.js';
import { neckView, chipRow } from './theory-kit.js';
import { earRand, earPrefs, streakView, earNav, earKeys, exposeTask, playSeq, autoplayOk, tapNote, guitarAnswer, tuneHint, heardName, nm } from './ear-kit.js';

/** @type {[string, string][]} */
const COUNTS = [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']];
/** @type {[string, string][]} */
const REFS = [['first', 'Первая нота'], ['tonic', 'Тоника']];

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  let opened = false; // первое задание экрана уже было
  const rand = earRand(r);
  const fromToday = r.query.from === 'today';
  const prefs = earPrefs('dictation', { level: 'penta', count: 3, ref: 'first', tonic: 9, pos: 0 }, v => ({
    level: DICT_LEVELS.some(([x]) => x === v.level) ? v.level : 'penta',
    count: Math.max(2, Math.min(5, Number(v.count) || 3)),
    ref: v.ref === 'tonic' ? 'tonic' : 'first',
    tonic: DICT_TONICS.includes(Number(v.tonic)) ? Number(v.tonic) : 9,
    pos: Math.max(0, Math.min(4, Number(v.pos) || 0)),
  }));
  const streak = streakView('dictation');
  /** @type {{ mel: number[], tonicMidi: number, win: any[], idx: number, marks: string[], errors: number, shown: boolean, done: boolean }} */
  let task = null;
  const tuning = () => TUNINGS[settings.value.tuning].midi;

  const dots = h('ol', { class: 'ear-dots', 'aria-label': 'Ноты мелодии' });
  const status = h('p', { class: 'ear-prompt', 'aria-live': 'polite' });
  const neck = neckView(d, 'Гриф: нажми ноты мелодии по порядку', { interactive: true, onTap: (s, f) => tap(s, f) });
  const label = (n, deg) => (settings.value.labels === 'notes' ? nm(n.pc) : deg);

  function drawDots(playing = -1) {
    dots.replaceChildren(...task.mel.map((m, i) => h('li', { class: `${task.marks[i]}${i === task.idx && !task.done ? ' now' : ''}${i === playing ? ' playing' : ''}`, dataset: { i: String(i) } },
      task.marks[i] === 'ok' || task.shown ? nm(mod12(m)) : String(i + 1))));
  }
  function drawNeck() {
    const win = task.win, lo = Math.min(...win.map(n => n.fret)), hi = Math.max(...win.map(n => n.fret));
    const known = new Set(task.mel.filter((_, i) => task.marks[i] === 'ok' || task.shown));
    const markers = win.map(n => ({ string: n.string, fret: n.fret, label: label(n, n.degree), role: roleOf(n.degree), dim: !known.has(n.midi) || placeOf(n.midi, tuning(), { win }).string !== n.string, ring: known.has(n.midi) && placeOf(n.midi, tuning(), { win }).string === n.string }));
    neck.show({ from: Math.max(0, lo - 1), to: Math.min(22, hi + 1), markers, focus: lo });
  }
  function draw(playing = -1) { drawDots(playing); drawNeck(); }

  function play(slow = false) {
    if (!task) return;
    const short = ga.running.value; // отвечаешь гитарой — ноты короче: приложение быстрее замолкает и слушает тебя
    const items = task.mel.map(m => ({ notes: [{ midi: m }], beats: 1, dur: short ? 0.45 : 0.9 }));
    const pre = prefs.sig.value.ref === 'tonic' ? [{ notes: [{ midi: task.tonicMidi }], beats: 1, dur: short ? 0.6 : 0.9 }, { notes: [], beats: 1 }] : [];
    const off = pre.length;
    playSeq([...pre, ...items], { title: 'Диктант', bpm: slow ? 50 : 84, onStep: i => drawDots(i >= off ? i - off : -1) })
      .then(ok => { if (!ok) status.textContent = 'Без звука: этот браузер не умеет Web Audio. Диктант работает только со звуком.'; });
  }
  function newTask() {
    const p = prefs.sig.value;
    const win = dictWindow({ level: p.level, tonic: p.tonic, pos: p.pos, tuning: tuning() });
    const { mel, tonicMidi } = dictMelody(win, { count: p.count, ref: p.ref, tonic: p.tonic }, rand);
    const first = p.ref === 'first';
    task = { mel, tonicMidi, win, idx: first ? 1 : 0, marks: mel.map((_, i) => (first && i === 0 ? 'ok' : '')), errors: 0, shown: false, done: false };
    status.textContent = first ? 'Первая нота дана (кольцо на грифе). Найди остальные по порядку — касанием или на гитаре.' : 'Сначала звучит тоника — от неё и считай. Найди все ноты мелодии по порядку.';
    neck.cursor([]);
    draw();
    nav.ready(false);
    if (autoplayOk(r, !opened)) play();
    opened = true;
  }
  /** Ответ: нота midi на месте (string, fret) */
  function answer(midi, at, fromGuitar = false) {
    if (!task || task.done) return;
    const want = task.mel[task.idx];
    const ok = midi === want;
    task.marks[task.idx] = ok ? 'ok' : 'bad';
    if (ok) task.idx++; else task.errors++;
    neck.cursor([{ ...at, kind: ok ? 'ok' : 'bad' }]);
    if (task.idx >= task.mel.length) {
      task.done = true;
      streak.score(task.errors === 0 && !task.shown);
      status.textContent = task.shown ? 'Мелодия показана. Сыграй её на гитаре и возьми новую.' : task.errors ? `Готово, ошибок: ${task.errors}. Послушай ещё раз и сравни.` : 'Чисто! Без единой ошибки.';
      nav.ready(true);
    } else if (!ok) {
      status.textContent = `${fromGuitar ? `Слышу ${heardName(midi)}` : `Это ${nm(mod12(midi))}`} — не та нота. Нота ${task.idx + 1}: послушай ещё раз и найди.`;
    } else status.textContent = `Есть! Нота ${task.idx + 1} из ${task.mel.length}.`;
    draw();
  }
  function tap(s, f) {
    const midi = tuning()[s] + f;
    tapNote(midi, ga.running.value ? 0.45 : 0.7);
    answer(midi, { string: s, fret: f });
  }
  const ga = guitarAnswer(d, {
    onNote: n => {
      if (!task || task.done) return;
      const want = task.mel[task.idx];
      const close = tuneHint(n, want);
      if (close) { ga.say(close, 'warn'); return; }
      const midi = Math.abs(n.midi - want) * 100 <= 40 ? want : n.note;
      if (midi !== want && mod12(midi) === mod12(want)) { ga.say(`Слышу ${heardName(n.midi)} — та нота, но в другой октаве. Посмотри на гриф.`, 'warn'); return; }
      ga.say(`Слышу ${heardName(n.midi)}`, midi === want ? 'ok' : 'warn');
      answer(midi, placeOf(midi, tuning(), { win: task.win }), true);
    },
  });
  function show() {
    if (!task || task.done) return;
    task.shown = true;
    task.errors++;
    status.textContent = 'Ответ на грифе: кольца — ноты мелодии. Сыграй их и возьми новую мелодию.';
    task.done = true;
    streak.score(false);
    draw();
    nav.ready(true);
  }

  const nav = earNav({ replay: () => play(false), next: newTask, nextLabel: 'Новая мелодия' });
  earKeys(d, r, { replay: () => play(false), next: newTask, solved: () => !!task?.done });
  exposeTask(d, () => task);

  const set = p => { prefs.set(p); newTask(); };
  const level = segmented({ label: 'Уровень', name: 'level', options: DICT_LEVELS.map(([v, t]) => [v, t]), sig: prefs.field('level'), onchange: v => set({ level: v }) });
  const count = segmented({ label: 'Сколько нот', name: 'count', options: COUNTS, sig: prefs.field('count'), onchange: v => set({ count: Number(v) }) });
  const ref = segmented({ label: 'Ориентир', name: 'ref', options: REFS, sig: prefs.field('ref'), onchange: v => set({ ref: v }) });
  const tonics = chipRow({ label: 'Тоника', name: 'tonic', options: [], sig: prefs.field('tonic'), onchange: v => set({ tonic: Number(v) }) });
  d.add(tonics.dispose);
  const pos = segmented({ label: 'Позиция', name: 'pos', options: [0, 1, 2, 3, 4].map(i => [String(i), String(i + 1)]), sig: prefs.field('pos'), onchange: v => set({ pos: Number(v) }) });
  d.add(settings.watch(() => tonics.redraw(DICT_TONICS.map(pc => [String(pc), `${nm(pc)}m`]))));
  let lastTuning = settings.value.tuning;
  d.add(settings.watch(s => { if (s.tuning !== lastTuning) { lastTuning = s.tuning; newTask(); } }));

  const slow = button({ kind: 'ghost', label: 'Медленно', onclick: () => play(true), attrs: { 'data-action': 'slow' } });
  const reveal = button({ kind: 'plain', label: 'Показать ответ', onclick: show, attrs: { 'data-action': 'show' } });

  newTask();
  const el = h('div', { class: 'screen ear ear-dictation' },
    screenHeader({ eyebrow: 'Слух', title: 'Диктант на грифе', back: fromToday ? '#/today' : '#/ear' }),
    h('p', { class: 'lead' }, 'Приложение играет короткую мелодию — найди её на грифе по порядку. Так подбирают риффы на слух: слушай, куда и насколько сдвинулась мелодия — вверх или вниз, на шаг или прыжком.'),
    h('div', { class: 'setting' }, h('b', null, 'Уровень'), level),
    h('div', { class: 'setting' }, h('b', null, 'Нот в мелодии'), count),
    h('details', { class: 'ear-more' }, h('summary', null, 'Тоника, позиция, ориентир'),
      h('div', { class: 'setting' }, h('b', null, 'Тоника'), tonics.el),
      h('div', { class: 'setting' }, h('b', null, 'Позиция пентатоники'), pos),
      h('div', { class: 'setting' }, h('b', null, 'Ориентир'), ref)),
    card({ cls: 'ear-task' }, dots, status, h('div', { class: 'row' }, slow, reveal), ga.el),
    card({ cls: 'neckcard' }, neck.el),
    streak.el,
    card({ title: 'Как заниматься', id: 'dict-how', cls: 'muted-card' },
      h('p', null, 'Начни с 2 нот в пентатонике. Не угадывай название ноты — слушай движение: вверх или вниз, соседняя нота или прыжок.'),
      h('p', null, 'Ошибся — ничего страшного: нота отметится красным, ищи дальше. «Медленно» играет мелодию в полтемпа.'),
      h('p', { class: 'muted note' }, 'Тусклые значки — ноты позиции с подписью ступени. Пробел — ещё раз, педаль «вперёд» — новая мелодия.')),
    nav.el,
    stepBar(r, d));
  return { el, title: 'Диктант на грифе', dispose: () => d.dispose() };
}
