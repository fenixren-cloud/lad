// review.js — «Повторения»: карточки, которые пора освежить. Каждый показ — новый вариант задания.
// Ответ: выбрать вариант, коснуться грифа или сыграть на гитаре (микрофон). Верно — карточка уходит в
// следующую коробку (интервал вдвое дольше), ошибка — в коробку 1 и ещё раз в конце этого подхода.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, card, button } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { TUNINGS } from '../core/neck.js';
import { mod12 } from '../core/notes.js';
import { matchPitch } from '../core/listen.js';
import { makeCard, neckHit, cardMidis, isNoteCard, cardTitle } from '../core/cards.js';
import { review as grade, dueToday, deckStats, dueIn, dueText, MAX_BOX } from '../core/srs.js';
import { store } from '../app/store.js';
import { settings } from '../app/state.js';
import { noteCard, refreshNotes, today } from '../app/activity.js';
import { stepBar } from './step.js';
import { neckView } from './theory-kit.js';
import { earRand, earNav, earKeys, exposeTask, answerGrid, playSeq, tapNote, guitarAnswer, heardName, nm } from './ear-kit.js';

const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const rand = earRand(r);
  const onlyNotes = r.query.deck === 'notes';
  const filter = id => !onlyNotes || isNoteCard(id);
  const back = r.query.from === 'today' ? '#/today' : '#/progress';
  refreshNotes();

  const ctx = () => ({ tuningId: settings.value.tuning, tuning: TUNINGS[settings.value.tuning].midi, german: settings.value.notation === 'german' });
  const deck = () => store().get('deck', {}) || {};
  const first = dueToday(deck(), today(), { filter });
  /** очередь: id карточек; ошибочные возвращаются в конец один раз; extra — тренировка вперёд (расписание не трогает) */
  const queue = [...first.due, ...first.fresh];
  const again = new Set();
  let extra = false, pos = 0, right = 0, total = 0;
  /** @type {(import('../core/cards.js').Card & { done: boolean, ok: boolean | null }) | null} */
  let cur = null;

  const counter = h('p', { class: 'muted note review-count', 'aria-live': 'polite' });
  const chip = h('div', { class: 'review-chip' });
  const prompt = h('p', { class: 'review-prompt', 'aria-live': 'polite' });
  const grid = answerGrid('Варианты ответа', [], v => pick(Number(v)));
  const neck = neckView(d, 'Гриф: коснись ответа', { interactive: true, onTap: (s, f) => { tapNote(ctx().tuning[s] + f, 0.6); tap(s, f); } });
  const neckBox = card({ cls: 'neckcard' }, neck.el);
  const ga = guitarAnswer(d, {
    idle: 'Можно ответить игрой: сыграй нужную ноту — приложение услышит.',
    onNote: n => {
      if (!cur || cur.done || cur.kind !== 'neck') return;
      const want = cardMidis(cur, ctx().tuning);
      const best = want.map(m => ({ m, res: matchPitch(n.midi, m) })).find(x => x.res !== 'no');
      if (best?.res === 'close') { ga.say(`Это ${heardName(n.midi)}, но гитара чуть расстроена (${Math.round(Math.abs((n.midi - best.m) * 100))} центов) — проверь тюнер.`, 'warn'); return; }
      ga.say(`Слышу ${heardName(n.midi)}`, best ? 'ok' : 'warn');
      if (best) { const t = /** @type {any} */ (cur.targets).find(x => ctx().tuning[x.string] + x.fret === best.m); finish(true, t); }
      else finish(false, null, `Слышу ${heardName(n.midi)}.`);
    },
  });
  const feedback = h('div', { class: 'review-feedback', hidden: true });
  const body = h('div', { class: 'review-body' }, chip, prompt, grid.el, ga.el, neckBox, feedback);
  const doneBox = h('div', { class: 'review-done', hidden: true });

  function play() {
    if (cur?.sound) playSeq(cur.sound, { title: 'Повторение', bpm: 96 });
  }
  function show(id) {
    const c = makeCard(id, ctx(), rand);
    if (!c) { next(); return; }
    cur = { ...c, done: false, ok: null };
    nav.el.hidden = false;
    /** @type {HTMLElement} */ (nav.el.querySelector('[data-action="replay"]')).hidden = !c.sound;
    const st = deck()[id];
    chip.replaceChildren(h('b', null, c.title), h('span', { class: 'muted' }, extra ? ' · тренировка' : st && st.seen ? ` · коробка ${st.box} из ${MAX_BOX}` : ' · новая'));
    prompt.textContent = c.prompt;
    feedback.hidden = true;
    const choice = c.kind === 'choice';
    grid.el.hidden = !choice;
    grid.redraw(choice ? (c.options || []).map((o, i) => ({ value: i, label: o })) : []);
    ga.el.hidden = choice;
    neckBox.hidden = choice && !c.show;
    const range = c.range || { from: 0, to: 12 };
    neck.show({ ...range, markers: (c.show || []).map(m => ({ string: m.string, fret: m.fret, label: m.label || '?', role: m.role || 'root' })), focus: (c.show?.[0]?.fret ?? 5) });
    neck.cursor([]);
    nav.ready(false);
    counter.textContent = extra ? 'Тренировка вперёд — на расписание не влияет.' : `Карточка ${Math.min(pos + 1, queue.length)} из ${queue.length}`;
  }
  function pick(i) {
    if (!cur || cur.done) return;
    grid.mark(String(i), i === cur.answer ? 'right' : 'wrong');
    if (i !== cur.answer) grid.mark(String(cur.answer), 'right');
    finish(i === cur.answer);
  }
  function tap(s, f) {
    if (!cur || cur.done || cur.kind !== 'neck') return;
    const ok = neckHit(cur, { string: s, fret: f });
    if (ok) finish(true, { string: s, fret: f });
    else finish(false, { string: s, fret: f }, `Это ${nm(mod12(ctx().tuning[s] + f))} (${6 - s}-я струна, ${f === 0 ? 'открытая' : `${f}-й лад`}).`);
  }
  /** @param {boolean} ok @param {{ string: number, fret: number } | null} [spot] @param {string} [said] */
  function finish(ok, spot = null, said = '') {
    if (!cur) return;
    cur.done = true;
    cur.ok = ok;
    total++;
    if (ok) right++;
    noteCard(ok);
    let when = '';
    if (!extra) {
      const t = today();
      const st = grade(deck()[cur.id], ok, t);
      store().update('deck', dk => ({ ...(dk || {}), [cur.id]: st }), {});
      when = ok ? `Следующий показ — ${dueText(dueIn(st, t))}.` : 'Покажу ещё раз в конце и завтра.';
      if (!ok && !again.has(cur.id)) { again.add(cur.id); queue.push(cur.id); }
    }
    if (cur.kind === 'neck') {
      neck.cursor(/** @type {any} */ ([...(spot ? [{ ...spot, kind: ok ? 'ok' : 'bad' }] : []), ...(ok ? [] : (cur.targets || []).map(x => ({ string: x.string, fret: x.fret, kind: 'ok' })))]));
      if (!ok) neck.show({ ...(cur.range || { from: 0, to: 12 }), markers: [...(cur.show || []).map(m => ({ string: m.string, fret: m.fret, label: m.label || '1', role: m.role || 'root' })),
        ...(cur.targets || []).map(x => ({ string: x.string, fret: x.fret, label: nm(mod12(ctx().tuning[x.string] + x.fret)), role: 'other', ring: true, cls: 'answer' }))], focus: cur.targets?.[0]?.fret ?? 5 });
    }
    feedback.replaceChildren(...[
      h('p', { class: ok ? 'ok' : 'bad' }, h('b', null, ok ? 'Верно.' : 'Не то.'), said ? ` ${said}` : ''),
      h('p', null, cur.explain),
      when ? h('p', { class: 'muted note' }, when) : null].filter(Boolean));
    feedback.hidden = false;
    nav.ready(true);
    if (cur.sound && ok) play();
  }
  function next() {
    if (!extra) pos++;
    if (!extra && pos < queue.length) { show(queue[pos]); return; }
    if (extra) { show(practiceId()); return; }
    end();
  }
  /** Карточка для тренировки вперёд: та, что понадобится раньше остальных */
  function practiceId() {
    const list = Object.entries(deck()).filter(([id, c]) => filter(id) && c.seen > 0).sort(([, a], [, b]) => (a.due < b.due ? -1 : 1));
    return list.length ? list[Math.floor(rand() * Math.min(6, list.length))][0] : '';
  }
  function end() {
    cur = null;
    body.hidden = true;
    refreshNotes();
    const s = deckStats(deck(), today(), filter);
    const soon = Object.entries(deck()).filter(([id]) => filter(id)).map(([, c]) => c.due).sort()[0];
    const any = Object.keys(deck()).some(filter);
    doneBox.replaceChildren(...[
      h('div', { class: 'finish-ico', 'aria-hidden': 'true' }, icon('check', 28)),
      h('h2', null, total ? 'На сегодня всё' : any ? 'Сегодня повторять нечего' : 'Карточек пока нет'),
      total ? h('p', null, `Верно ${right} из ${total}. Повторять понемногу каждый день — так память держится дольше всего.`) : null,
      any ? h('p', { class: 'muted' }, `В колоде ${s.total} ${plural(s.total, 'карточка', 'карточки', 'карточек')}, выучено ${s.learned}. ${soon && soon > today() ? `Следующие — ${dueText(dueIn({ due: soon }, today()))}.` : ''}`)
        : h('p', { class: 'muted' }, 'Карточки появляются после уроков: пройди урок на дорожке — его карточки придут сюда. Ноты на грифе — после урока «Ноты на 6-й и 5-й струнах».'),
      any ? button({ kind: 'ghost', label: 'Тренироваться вперёд', onclick: () => { extra = true; body.hidden = false; doneBox.hidden = true; show(practiceId()); }, attrs: { 'data-action': 'extra' } })
        : h('a', { class: 'btn btn-primary', href: '#/today/path' }, 'Открыть дорожку')].filter(Boolean));
    doneBox.hidden = false;
    nav.el.hidden = true;
    counter.textContent = '';
    nav.ready(false);
  }

  const nav = earNav({ replay: play, next: () => { if (cur?.done || !cur) next(); }, replayLabel: 'Послушать' });
  earKeys(d, r, { replay: play, next, solved: () => !!cur?.done });
  exposeTask(d, () => cur && { ...cur, queue: [...queue], pos, extra });

  const s0 = deckStats(deck(), today(), filter);
  const el = h('div', { class: 'screen review' },
    screenHeader({ eyebrow: 'Прогресс', title: onlyNotes ? 'Ноты на грифе' : 'Повторения', back }),
    h('p', { class: 'lead' }, queue.length
      ? `Сегодня ${queue.length} ${plural(queue.length, 'карточка', 'карточки', 'карточек')}${first.fresh.length ? `, из них новых ${first.fresh.length}` : ''}. Отвечай касанием, выбором или игрой на гитаре.`
      : `В колоде ${s0.total} ${plural(s0.total, 'карточка', 'карточки', 'карточек')}.`),
    counter,
    card({ cls: 'review-card' }, body, doneBox),
    card({ title: 'Как это работает', id: 'srs-how', cls: 'muted-card' },
      h('p', null, 'Каждая карточка лежит в коробке от 0 до 6. Верный ответ — она переезжает в следующую и показывается вдвое реже: через 1, 2, 4, 8, 16, 32 дня. Ошибка — возвращается в коробку 1: завтра ещё раз.'),
      h('p', null, 'Новые карточки приходят из пройденных уроков, не больше 8 в день. Ноты на грифе — группами: сначала 6-я и 5-я струны, следующая струна открывается, когда эти держатся в памяти.')),
    nav.el,
    stepBar(r, d));
  if (queue.length) show(queue[0]); else end();
  return { el, title: onlyNotes ? 'Ноты на грифе' : 'Повторения', dispose: () => d.dispose() };
}

export { cardTitle };
