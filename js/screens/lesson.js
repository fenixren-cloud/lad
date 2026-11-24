// lesson.js — урок теории: объяснение с примером на грифе или круге → послушай → сыграй сам (микрофон
// проверяет каждую ноту) → мини-проверка → итог. Педаль или стрелки листают шаги; урок отмечается пройденным,
// его карточки на этапе 6 уйдут в повторения. Как шаг «Сегодня» — внизу полоса шага.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, card, button } from '../ui/components.js';
import { createMicPanel } from '../ui/mic-panel.js';
import { signal, disposer } from '../core/signal.js';
import { LESSONS, lessonById, nextLesson, stepText, shuffleQuestion } from '../core/lessons.js';
import { PAGES } from '../core/routes.js';
import { createNoteListener } from '../core/listen.js';
import { createPlayCheck, playHint } from '../core/playcheck.js';
import { ruName, spellPc, mod12, octaveOf } from '../core/notes.js';
import { store } from '../app/store.js';
import { noteLesson } from '../app/activity.js';
import { localDay } from '../core/dates.js';
import { go } from '../app/router.js';
import { stepBar } from './step.js';
import { theoryCtx, sceneView, listenButton, lessonProgress } from './theory-kit.js';

const STEP_NAMES = { learn: 'Что это', listen: 'Послушай', play: 'Сыграй', quiz: 'Проверка' };
const topicTitle = id => PAGES.theory.find(p => p.id === id)?.title || 'Теория';
const heardName = m => `${ruName(spellPc(mod12(Math.round(m))), { long: true })}${octaveOf(Math.round(m))}`;

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const lesson = lessonById(r.query.id) || nextLesson(lessonProgress().done) || LESSONS[0];
  const ctx = theoryCtx();
  const fromToday = r.query.from === 'today';
  const steps = lesson.steps;
  const at = signal(0); // 0..steps.length (последний — итог)
  let score = 0, answered = 0, stepD = disposer();

  const dots = h('ol', { class: 'lesson-steps', 'aria-label': 'Шаги урока' },
    ...[...steps.map(s => STEP_NAMES[s.kind]), 'Итог'].map((t, i) => h('li', { dataset: { i: String(i) } }, h('span', { class: 'dot', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, t))));
  const body = h('div', { class: 'lesson-body' });
  const back = button({ kind: 'ghost', label: 'Назад', onclick: () => { if (at.value > 0) at.value--; }, attrs: { 'data-action': 'prev' } });
  const nextLabel = h('span');
  const next = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'next' }, nextLabel, icon('next', 20));
  next.addEventListener('click', () => {
    if (at.value < steps.length) at.value++;
    else {
      const n = nextLesson(lessonProgress().done);
      go(n ? `#/theory/lesson?id=${n.id}${fromToday ? '&from=today' : ''}` : `#/theory/${lesson.topic}`);
    }
  });

  // ---------- шаги ----------
  function learnOrListen(s) {
    const sc = s.scene ? s.scene(ctx) : null;
    const sv = sceneView(stepD);
    sv.show(sc);
    const parts = [h('h2', { class: 'step-title' }, s.title), ...stepText(s, ctx).map(t => h('p', null, t)), sv.el];
    if (sc?.seq?.length) parts.splice(parts.length - 1, 0, h('div', { class: 'row' }, listenButton(stepD, { label: s.kind === 'listen' ? 'Послушать' : 'Послушать пример', build: () => ({ items: sc.seq, title: lesson.title, bpm: sc.bpm || 90, onStep: i => sv.step(i) }) })));
    return parts;
  }

  function play(s) {
    const task = s.task(ctx);
    const check = createPlayCheck(task.targets);
    const listener = createNoteListener();
    // длинное задание (позиция из 12 нот) — компактными фишками, чтобы гриф оставался рядом
    const compact = task.targets.length > 4;
    const list = h('ol', { class: `targets${compact ? ' compact' : ''}` }, ...task.targets.map((t, i) => {
      const [name, where] = t.label.split(' — ');
      return h('li', { dataset: { i: String(i) }, title: t.label }, h('span', { class: 'tick', 'aria-hidden': 'true' }),
        compact ? h('span', null, h('b', null, name), where ? h('small', null, where.replace('-я струна, ', '·').replace('-й лад', '').replace('открытая', '0')) : null) : h('span', null, t.label));
    }));
    const hint = h('p', { class: 'play-hint', 'aria-live': 'polite' }, 'Нажми «Слушать игру» и играй ноты по порядку. Можно и без микрофона — тогда просто «Дальше».');
    const mark = () => list.querySelectorAll('li').forEach((li, i) => { li.classList.toggle('ok', i < check.index); li.classList.toggle('now', i === check.index); });
    mark();
    const panel = createMicPanel({
      pitch: true, onsets: false,
      onReading: rd => {
        if (rd.selfSound) { listener.reset(); return; }
        const n = listener.push(rd);
        if (!n || check.done) return;
        const res = check.push(n.midi);
        hint.textContent = playHint(res, heardName);
        hint.className = `play-hint ${res?.result === 'ok' ? 'ok' : 'warn'}`;
        mark();
        if (check.done) { panel.stop(); next.classList.add('pulse'); }
      },
    });
    stepD.add(() => panel.dispose());
    const listen = button({ kind: 'ghost', icon: 'sound', label: 'Слушать игру', onclick: () => (panel.running.value ? panel.stop() : panel.start()), attrs: { 'data-action': 'mic' } });
    stepD.add(panel.running.watch(on => { listen.querySelector('span').textContent = on ? 'Стоп' : 'Слушать игру'; }));
    const sample = listenButton(stepD, { label: 'Как звучит', action: 'sample', build: () => ({ title: 'Задание', bpm: 80, items: task.targets.map(t => ({ notes: [{ midi: t.midi ?? 48 + mod12(/** @type {number} */ (t.pc) - 0) - (mod12(/** @type {number} */ (t.pc)) > 7 ? 12 : 0) }], beats: 1 })) }) });
    const parts = [h('h2', { class: 'step-title' }, s.title), h('p', null, task.text)];
    if (task.scene) { const sv = sceneView(stepD); sv.show(task.scene); parts.push(sv.el); }
    parts.push(list, compact ? h('p', { class: 'muted note' }, 'Под нотой: струна · лад.') : null, h('div', { class: 'row' }, listen, sample), hint, panel.el);
    return parts;
  }

  function quiz(s) {
    const qs = s.quiz(ctx).map(q => shuffleQuestion(q));
    score = 0;
    answered = 0;
    const total = h('p', { class: 'muted', 'aria-live': 'polite' }, `Ответь на ${qs.length} вопроса.`);
    const cards = qs.map((q, qi) => {
      const explain = h('p', { class: 'explain', hidden: true });
      const opts = h('div', { class: 'answers', role: 'group', 'aria-label': q.q }, ...q.options.map((o, oi) => {
        const b = h('button', { type: 'button', class: 'answer', dataset: { q: String(qi), o: String(oi) } }, o);
        b.addEventListener('click', () => {
          if (opts.dataset.done) return;
          opts.dataset.done = '1';
          const ok = oi === q.answer;
          if (ok) score++;
          answered++;
          for (const x of opts.querySelectorAll('.answer')) {
            const k = Number(/** @type {HTMLElement} */ (x).dataset.o);
            x.classList.toggle('right', k === q.answer);
            x.classList.toggle('wrong', k === oi && !ok);
            x.setAttribute('aria-disabled', 'true');
          }
          explain.textContent = `${ok ? 'Верно.' : 'Не совсем.'} ${q.explain || ''}`.trim();
          explain.className = `explain ${ok ? 'ok' : 'warn'}`;
          explain.hidden = false;
          total.textContent = answered < qs.length ? `Отвечено ${answered} из ${qs.length}.` : `Верно ${score} из ${qs.length}.`;
          if (answered === qs.length) next.classList.add('pulse');
        });
        return b;
      }));
      return h('div', { class: 'question' }, h('b', null, `${qi + 1}. ${q.q}`), opts, explain);
    });
    return [h('h2', { class: 'step-title' }, s.title), total, ...cards];
  }

  function finish() {
    const today = localDay();
    store().update('lessons', p => ({ done: { ...(p.done || {}), [lesson.id]: today }, score: { ...(p.score || {}), [lesson.id]: Math.max(score, p.score?.[lesson.id] || 0) } }), { done: {}, score: {} });
    noteLesson(lesson.id);
    const n = nextLesson(lessonProgress().done);
    return [
      card({ cls: 'finish' },
        h('div', { class: 'finish-ico', 'aria-hidden': 'true' }, icon('check', 28)),
        h('h2', null, 'Урок пройден'),
        h('p', null, answered ? `Проверка: верно ${score} из ${answered}. ` : '', lesson.why),
        h('p', { class: 'muted note' }, `Карточки урока (${lesson.cards.length}) — уже в «Повторениях»: приложение само напомнит, когда пора освежить.`),
        n ? h('p', { class: 'muted' }, `Дальше: «${n.title}».`) : h('p', { class: 'muted' }, 'Все уроки раздела пройдены — загляни в справочник тем или поиграй над подложкой.')),
      h('a', { class: 'btn btn-ghost', href: `#/theory/${lesson.topic}` }, `К теме «${topicTitle(lesson.topic)}»`),
    ];
  }

  d.add(at.watch(i => {
    stepD.dispose();
    stepD = disposer();
    next.classList.remove('pulse');
    const s = steps[i];
    body.replaceChildren(...(i === 0 ? [h('p', { class: 'lead' }, lesson.why)] : []),
      ...(s ? (s.kind === 'play' ? play(s) : s.kind === 'quiz' ? quiz(s) : learnOrListen(s)) : finish()));
    dots.querySelectorAll('li').forEach((li, k) => { li.classList.toggle('done', k < i); li.classList.toggle('now', k === i); li.toggleAttribute('aria-current', k === i); });
    back.hidden = i === 0;
    nextLabel.textContent = i < steps.length - 1 ? 'Дальше' : i === steps.length - 1 ? 'Итог' : nextLesson(lessonProgress().done) ? 'Следующий урок' : 'К теме';
    /** @type {HTMLElement | null} */ (document.querySelector('main h1'))?.scrollIntoView?.({ block: 'nearest' });
  }));
  d.add(() => stepD.dispose());

  // «руки заняты»: педаль или стрелки листают шаги урока (на итоге — отдают клавишу полосе шага занятия)
  const onKey = e => {
    if (e.defaultPrevented || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    const fwd = e.key === 'PageDown' || e.key === 'ArrowRight', bwd = e.key === 'PageUp' || e.key === 'ArrowLeft';
    if (fwd && at.value < steps.length) { e.preventDefault(); at.value++; }
    else if (bwd && at.value > 0) { e.preventDefault(); at.value--; }
  };
  document.addEventListener('keydown', onKey);
  d.add(() => document.removeEventListener('keydown', onKey));

  const el = h('div', { class: 'screen lesson', dataset: { lesson: lesson.id } },
    screenHeader({ eyebrow: `Урок · ${topicTitle(lesson.topic)}`, title: lesson.title, back: fromToday ? '#/today' : `#/theory/${lesson.topic}` }),
    dots, body,
    h('div', { class: 'cta-sticky lesson-nav' }, back, next),
    stepBar(r, d));
  return { el, title: lesson.title, dispose: () => d.dispose() };
}
