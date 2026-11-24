// ear-notes.js — «Ноты на грифе»: три квиза на знание грифа и аккордов.
//  • Найти ноту — нота и струна: коснись места на грифе или сыграй на гитаре;
//  • Собрать аккорд — отметь на круге все ноты аккорда (подсказка — шаги в полутонах);
//  • Кто лишний — три аккорда тональности и один чужой: найди чужой, объяснение — какой ноты нет в гамме.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented, button } from '../ui/components.js';
import { disposer, signal } from '../core/signal.js';
import { mod12, ruName, spellPc, noteName } from '../core/notes.js';
import { TUNINGS, STRING_NUMBER, bestVoicing, voicingMidis } from '../core/neck.js';
import { chordSymbol, chordRuName } from '../core/chords.js';
import { chordInfo, chordLabelMap } from '../core/theory.js';
import { findTask, findCheck, findFrets, findHeard, buildTask, buildSteps, buildCheck, oddTask, chordText, placeOf } from '../core/earquiz.js';
import { settings } from '../app/state.js';
import { stepBar } from './step.js';
import { neckView, dialView } from './theory-kit.js';
import { earRand, earPrefs, streakView, earNav, earKeys, exposeTask, answerGrid, playSeq, tapNote, tapChord, guitarAnswer, tuneHint, heardName, nm, german } from './ear-kit.js';

/** @type {[string, string][]} */
const MODES = [['find', 'Найти ноту'], ['build', 'Собрать аккорд'], ['odd', 'Кто лишний']];

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const rand = earRand(r);
  const fromToday = r.query.from === 'today';
  const prefs = earPrefs('notes', { mode: 'find' }, v => ({ mode: MODES.some(([x]) => x === v.mode) ? v.mode : 'find' }));
  if (MODES.some(([x]) => x === r.query.mode)) prefs.set({ mode: r.query.mode });
  const mode = signal(prefs.sig.value.mode);
  const tuning = () => TUNINGS[settings.value.tuning].midi;
  /** @type {any} */
  let task = null;
  let solved = false;
  let pane = disposer();

  const body = h('div', { class: 'ear-pane' });
  const streakSlot = h('div');
  const howSlot = h('div');

  // ---------- найти ноту ----------
  function findPane() {
    const streak = streakView('find');
    const prompt = h('div', { class: 'ear-big', 'aria-live': 'polite' });
    const status = h('p', { class: 'ear-prompt', 'aria-live': 'polite' });
    const neck = neckView(pane, 'Гриф: коснись нужного места', { interactive: true, onTap: (s, f) => { tapNote(tuning()[s] + f, ga.running.value ? 0.45 : 0.7); answer(s, f); } });
    let timer = 0;
    pane.add(() => clearTimeout(timer));
    const next = () => {
      clearTimeout(timer);
      task = { kind: 'find', ...findTask(rand), done: false };
      solved = false;
      const s = task.string, open = tuning()[s];
      prompt.replaceChildren(h('b', null, nm(task.pc)), h('span', null, ruName(spellPc(task.pc), { long: true })));
      status.replaceChildren('на ', h('b', null, `${STRING_NUMBER[s]}-й струне`), ` (открытая — ${nm(mod12(open))}), лады 0–12`);
      neck.show({ from: 0, to: 12, markers: [], focus: 5 });
      neck.cursor([]);
      nav.ready(false);
    };
    function answer(s, f) {
      if (!task || task.done) return;
      const ok = findCheck(task, s, f, tuning());
      neck.cursor([{ string: s, fret: f, kind: ok ? 'ok' : 'bad' }]);
      if (ok) {
        task.done = true;
        solved = true;
        streak.score(true);
        status.textContent = `Верно! ${nm(task.pc)} — ${f === 0 ? 'открытая струна' : `${f}-й лад`}${f === 0 || f === 12 ? ' (и 12-й лад — та же нота октавой выше)' : ''}.`;
        nav.ready(true);
        timer = setTimeout(() => { if (solved && task?.kind === 'find') next(); }, 1100);
        return;
      }
      if (!task.wrong) streak.score(false);
      task.wrong = true;
      const frets = findFrets(task, tuning());
      const here = s === task.string ? `Это ${nm(mod12(tuning()[s] + f))}.` : `Это ${STRING_NUMBER[s]}-я струна, а нужна ${STRING_NUMBER[task.string]}-я.`;
      status.textContent = `${here} ${nm(task.pc)} на ${STRING_NUMBER[task.string]}-й струне — ${frets.map(x => (x === 0 ? 'открытая' : `${x}-й лад`)).join(' и ')}. Сыграй её и жми «Дальше».`;
      neck.show({ from: 0, to: 12, markers: frets.map(x => ({ string: task.string, fret: x, label: nm(task.pc), role: 'root', ring: true })), focus: frets[0] });
      task.done = true;
      nav.ready(true);
    }
    const ga = guitarAnswer(pane, {
      onNote: n => {
        if (!task || task.done) return;
        const res = findHeard(task, n.note, tuning());
        const close = res.ok ? tuneHint(n, n.note) : '';
        if (close) { ga.say(close, 'warn'); return; }
        ga.say(`Слышу ${heardName(n.midi)}`, res.ok ? 'ok' : 'warn');
        if (res.ok) answer(task.string, res.fret);
        else if (mod12(n.note) === task.pc) ga.say(`Слышу ${heardName(n.midi)} — нота та, но на ${STRING_NUMBER[task.string]}-й струне в ладах 0–12 она звучит в другой октаве.`, 'warn');
        else { const at = placeOf(n.note, tuning(), { prefer: task.string }); answer(at.string, at.fret); }
      },
    });
    next();
    howSlot.replaceChildren(card({ title: 'Как заниматься', id: 'find-how', cls: 'muted-card' },
      h('p', null, 'Ориентиры: точки на 3, 5, 7, 9 и 12-м ладу. На 5-м ладу — нота следующей струны (кроме струны G: на ней это 4-й лад). На 12-м — та же нота, что открытая.'),
      h('p', null, 'Ми–фа и си–до стоят вплотную; остальные соседние ноты без знаков — через лад.')));
    streakSlot.replaceChildren(streak.el);
    return { el: [prompt, status, ga.el, card({ cls: 'neckcard' }, neck.el)], next, replay: () => {} };
  }

  // ---------- собрать аккорд ----------
  function buildPane() {
    const streak = streakView('build');
    const sel = new Set();
    const title = h('div', { class: 'ear-big', 'aria-live': 'polite' });
    const status = h('p', { class: 'ear-prompt', 'aria-live': 'polite' });
    const dial = dialView(pane, { label: 'Круг: отметь ноты аккорда', onPick: v => toggle(v.pc) });
    const toggles = h('div', { class: 'chips pc-toggles', role: 'group', 'aria-label': 'Ноты аккорда' });
    const check = button({ kind: 'primary', label: 'Проверить', onclick: () => verify(), attrs: { 'data-action': 'check' } });
    function toggle(pc) {
      if (!task || task.done) return;
      if (sel.has(pc)) sel.delete(pc); else { sel.add(pc); tapNote(48 + pc, 0.6); }
      draw();
    }
    function draw(result = null) {
      const info = chordInfo(task.pc, task.type, german());
      dial.update({ layout: 'chroma', polygon: result ? { root: task.pc, type: task.type } : null,
        nodes: Array.from({ length: 12 }, (_, pc) => {
          if (result) {
            const k = info.pcs.indexOf(pc);
            if (k >= 0) return { pc, label: settings.value.labels === 'notes' ? info.names[k] : info.degrees[k], role: chordLabelMap(task.pc, task.type, german()).get(pc)?.role || 'other', ring: !sel.has(pc) };
            return { pc, label: nm(pc), role: 'none', dim: !sel.has(pc), ring: sel.has(pc) };
          }
          return { pc, label: nm(pc), role: sel.has(pc) ? 'other' : 'none', ring: sel.has(pc) };
        }) });
      toggles.replaceChildren(...Array.from({ length: 12 }, (_, pc) => h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(sel.has(pc)), dataset: { pc: String(pc) }, onclick: () => toggle(pc) }, nm(pc))));
      check.toggleAttribute('disabled', !!result || sel.size < 2);
    }
    function verify() {
      if (!task || task.done || sel.size < 2) return;
      const res = buildCheck(task, sel);
      task.done = true;
      solved = true;
      streak.score(res.ok);
      const info = chordInfo(task.pc, task.type, german());
      const name = pc => info.names[info.pcs.indexOf(pc)] || nm(pc);
      status.textContent = res.ok ? `Верно! ${info.names.join(' ')}: ${buildSteps(task.type)} полутона от корня.`
        : `Нужно: ${info.names.join(' ')}.${res.missing.length ? ` Не хватает: ${res.missing.map(name).join(', ')}.` : ''}${res.extra.length ? ` Лишние: ${res.extra.map(nm).join(', ')}.` : ''}`;
      draw(res);
      const v = bestVoicing(task.type, task.pc, settings.value.tuning, 5);
      if (v) tapChord(voicingMidis(v.frets, tuning()));
      nav.ready(true);
    }
    const next = () => {
      task = { kind: 'build', ...buildTask(rand), done: false };
      solved = false;
      sel.clear();
      const info = chordInfo(task.pc, task.type, german());
      title.replaceChildren(h('b', null, chordSymbol(info.root, task.type, { german: german() })), h('span', null, chordRuName(info.root, task.type)));
      status.textContent = `Отметь на круге все ноты аккорда и нажми «Проверить». Подсказка: от корня ${buildSteps(task.type)} полутона.`;
      draw();
      nav.ready(false);
    };
    next();
    howSlot.replaceChildren(card({ title: 'Как заниматься', id: 'build-how', cls: 'muted-card' },
      h('p', null, 'Аккорд — фигура на круге: мажор — шаги 4 + 3, минор — 3 + 4, уменьшённый — 3 + 3, увеличенный — 4 + 4, sus4 — 5 + 2, пауэр — одна квинта (7).'),
      h('p', null, 'Найди корень и отсчитай часы по кругу. Каждый час — полутон, он же лад на грифе.')));
    streakSlot.replaceChildren(streak.el);
    return { el: [title, status, h('div', { class: 'dial-wrap' }, dial.el), toggles, check], next, replay: () => { if (task?.done) { const v = bestVoicing(task.type, task.pc, settings.value.tuning, 5); if (v) tapChord(voicingMidis(v.frets, tuning())); } } };
  }

  // ---------- кто лишний ----------
  function oddPane() {
    const streak = streakView('odd');
    const prompt = h('p', { class: 'ear-prompt', 'aria-live': 'polite' });
    const grid = answerGrid('Какой аккорд лишний?', [], i => pick(Number(i)));
    const explain = h('div', { class: 'ear-explain', hidden: true });
    const keyName = () => `${noteName(task.tonic, { german: german() })} ${task.mode === 'aeolian' ? 'минор' : 'мажор'}`;
    const voicings = () => task.options.map(c => { const v = bestVoicing(c.type, c.rootPc, settings.value.tuning, 5); return v ? voicingMidis(v.frets, tuning()) : []; });
    function play() {
      if (!task) return;
      playSeq(voicings().map(m => ({ notes: m.map(midi => ({ midi })), beats: 2, strum: true })), { title: 'Кто лишний', bpm: 96, onStep: i => {
        for (const b of grid.el.querySelectorAll('.opt')) b.classList.toggle('playing', Number(b.getAttribute('data-value')) === i);
      } }).then(ok => { if (!ok) prompt.textContent = 'Без звука: этот браузер не умеет Web Audio. Отвечать можно и так — по теории.'; });
    }
    function pick(i) {
      if (!task || task.done) return;
      const ok = i === task.bad;
      task.done = true;
      solved = true;
      streak.score(ok);
      grid.mark(task.bad, 'right');
      if (!ok) grid.mark(i, 'wrong');
      const bad = task.options[task.bad];
      prompt.textContent = ok ? 'Верно!' : 'Не этот.';
      explain.replaceChildren(
        h('p', null, 'Лишний — ', h('b', null, chordText(bad, german())), `: в нём ${task.foreign.map(nm).join(' и ')} — ${task.foreign.length > 1 ? 'этих нот' : 'этой ноты'} нет в гамме ${keyName()} (${task.scale.map(n => noteName(n, { german: german() })).join(' ')}).`),
        h('p', { class: 'muted note' }, `Остальные — аккорды тональности: ${task.options.filter((_, k) => k !== task.bad).map(c => `${chordText(c, german())} (${c.roman})`).join(', ')}.`));
      explain.hidden = false;
      nav.ready(true);
    }
    const next = () => {
      task = { kind: 'odd', ...oddTask(rand), done: false };
      solved = false;
      prompt.replaceChildren('Тональность: ', h('b', null, keyName()), '. Какой аккорд лишний?');
      grid.redraw(task.options.map((c, k) => ({ value: k, label: chordText(c, german()) })));
      explain.hidden = true;
      nav.ready(false);
    };
    next();
    howSlot.replaceChildren(card({ title: 'Как заниматься', id: 'odd-how', cls: 'muted-card' },
      h('p', null, 'Аккорды тональности строятся из нот её гаммы. Если в аккорде есть нота не из гаммы — он чужой.'),
      h('p', null, 'В мажоре: I, IV, V — мажорные, ii, iii, vi — минорные. В миноре: i, iv, v — минорные, III, VI, VII — мажорные.'),
      h('p', { class: 'muted note' }, '«Ещё раз» играет все четыре аккорда по очереди — чужой слышно.')));
    streakSlot.replaceChildren(streak.el);
    return { el: [prompt, grid.el, explain], next, replay: play };
  }

  let cur = { next: () => {}, replay: () => {} };
  const nav = earNav({ replay: () => cur.replay(), next: () => cur.next(), replayLabel: 'Послушать' });
  d.add(mode.watch(m => {
    pane.dispose();
    pane = disposer();
    const p = m === 'build' ? buildPane() : m === 'odd' ? oddPane() : findPane();
    cur = p;
    body.replaceChildren(card({ cls: 'ear-task' }, ...p.el));
    body.dataset.mode = m;
  }));
  d.add(() => pane.dispose());
  let lastTuning = settings.value.tuning;
  d.add(settings.watch(s => { if (s.tuning !== lastTuning) { lastTuning = s.tuning; cur.next(); } }));

  earKeys(d, r, { replay: () => cur.replay(), next: () => cur.next(), solved: () => solved });
  exposeTask(d, () => task);
  const tabs = segmented({ label: 'Квиз', name: 'mode', options: MODES, sig: mode, onchange: v => { prefs.set({ mode: v }); mode.value = v; } });

  const el = h('div', { class: 'screen ear ear-notes' },
    screenHeader({ eyebrow: 'Слух', title: 'Ноты на грифе', back: fromToday ? '#/today' : '#/ear' }),
    h('p', { class: 'lead' }, 'Знать гриф и аккорды без подсказок: найти ноту на струне, собрать аккорд из нот, отличить свой аккорд тональности от чужого.'),
    h('div', { class: 'setting' }, h('b', null, 'Квиз'), tabs),
    body, streakSlot, howSlot,
    nav.el,
    stepBar(r, d));
  return { el, title: 'Ноты на грифе', dispose: () => d.dispose() };
}
