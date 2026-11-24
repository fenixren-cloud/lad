// ear-kit.js — общие детали экранов «Слуха»: настройки квиза (с сохранением), серия правильных ответов
// и точность, «Отвечать гитарой» (микрофон + слушатель нот), звук по нажатию, кнопки «Ещё раз» / «Дальше»
// в зоне большого пальца, педаль и клавиши, проигрывание через общий транспорт.
// Для автотестов (?debug): текущее задание квиза и подстановка «услышанной» ноты.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button } from '../ui/components.js';
import { createMicPanel } from '../ui/mic-panel.js';
import { signal } from '../core/signal.js';
import { seeded, nextStreak, recordAnswer, QUIZZES } from '../core/earquiz.js';
import { createNoteListener, matchPitch } from '../core/listen.js';
import { ruName, spellPc, mod12, octaveOf, noteName } from '../core/notes.js';
import { store } from '../app/store.js';
import { hooks } from '../app/debughooks.js';
import { settings } from '../app/state.js';
import { practice } from '../app/practice.js';
import { noteEar } from '../app/activity.js';
import { localDay } from '../core/dates.js';
import { prepareInstruments } from '../audio/instruments.js';
import { playExample, stopExample, example } from '../audio/theoryplayer.js';

/** Случайность квиза: ?seed=N в адресе — одни и те же задания (эталоны и проверки), иначе — случайные */
export const earRand = r => (r.query.seed ? seeded(Number(r.query.seed)) : Math.random);
export const german = () => settings.value.notation === 'german';
/** «A», «F♯» (немецкая нотация — H/B) */
export const nm = pc => noteName(spellPc(mod12(pc)), { german: german() });
/** «ля малой октавы» → «ля2»: имя и номер октавы, как в тюнере */
export const heardName = m => `${ruName(spellPc(mod12(Math.round(m))), { long: true })}${octaveOf(Math.round(m))}`;
export const today = () => localDay();

/**
 * Настройки квиза: хранятся в одном ключе «ear» ({ dictation: {...}, intervals: {...} … }).
 * @template T @param {string} id @param {T} defaults @param {(v: any) => T} [check] привести сохранённое к правильному
 */
export function earPrefs(id, defaults, check = v => v) {
  const saved = store().get('ear', {})?.[id] || {};
  const sig = signal(/** @type {T} */ (check({ ...defaults, ...saved })));
  return {
    sig,
    /** @param {Partial<T>} patch */
    set(patch) {
      sig.value = /** @type {T} */ (check({ ...sig.value, ...patch }));
      store().update('ear', all => ({ ...(all || {}), [id]: sig.value }), {});
    },
    /** Поле настроек как сигнал строк — для переключателей */
    field(k) { return { get value() { return String(sig.value[k]); }, watch: fn => sig.watch(v => fn(String(v[k]))) }; },
  };
}

/** Текущие серии — пока открыто приложение; лучшие — в хранилище (earBest) */
const live = {};
/**
 * Серия правильных ответов подряд и рекорд. score(ok) — ответ засчитан; заодно копится точность (earStats).
 * @param {string} id
 */
export function streakView(id) {
  const cur = h('b', { class: 'streak-cur' });
  const best = h('span', { class: 'streak-best' });
  const el = h('p', { class: 'streak', 'aria-live': 'polite', dataset: { quiz: id } }, icon('check', 18), h('span', null, 'Серия '), cur, best);
  const draw = (record = false) => {
    const b = store().get('earBest', {})?.[id] || 0;
    cur.textContent = String(live[id] || 0);
    best.textContent = record ? ' · новый рекорд!' : ` · рекорд ${b}`;
    el.classList.toggle('record', record);
  };
  draw();
  return {
    el,
    /** @param {boolean} ok */
    score(ok) {
      const s = nextStreak({ cur: live[id] || 0, best: store().get('earBest', {})?.[id] || 0 }, ok);
      live[id] = s.cur;
      if (s.record) store().update('earBest', b => ({ ...(b || {}), [id]: s.best }), {});
      store().update('earStats', st => recordAnswer(st || {}, id, ok, today()), {});
      noteEar(ok);
      draw(s.record);
      return s;
    },
    get current() { return live[id] || 0; },
    title: QUIZZES[id],
  };
}

/** Можно ли играть без нажатия (браузер пускает звук только после первого касания страницы) */
export function mayAutoplay() {
  const ua = /** @type {any} */ (navigator).userActivation;
  return ua ? !!ua.hasBeenActive : false;
}
/**
 * Играть ли задание само: открыл квиз касанием — первое звучит сразу, дальше — каждое новое.
 * С зерном в адресе (эталонный режим проверок) первое задание ждёт «Ещё раз» — снимок экрана не зависит от времени.
 * @param {{ query: Record<string, string> }} r @param {boolean} first
 */
export const autoplayOk = (r, first) => mayAutoplay() && !(first && r.query.seed);

/**
 * Сыграть через общий транспорт (встаёт в сетку метронома или подложки, если они играют).
 * @param {{ notes: { midi: number }[], beats: number, dur?: number, strum?: boolean }[]} items
 * @param {{ title: string, bpm?: number, onStep?: (i: number) => void }} o
 */
export async function playSeq(items, { title, bpm = 84, onStep = () => {} }) {
  const ok = await playExample(items, { title, bpm, onStep, quiet: true });
  return ok;
}
export { stopExample, example };

/** Нота сразу по нажатию (вне сетки): отклик на касание грифа или круга */
export async function tapNote(midi, duration = 0.7) {
  const inst = await prepareInstruments();
  inst?.guitar.play(midi, undefined, { choke: true, duration });
}
/** Аккорд сразу «медиатором» */
export async function tapChord(midis) {
  const inst = await prepareInstruments();
  inst?.guitar.strum(midis, undefined, { velocity: 0.75, duration: 1.8 });
}

/**
 * «Отвечать гитарой»: микрофон слушает сыгранные ноты. Пока звучит само приложение — не слушает.
 * onNote получает ноту { midi (дробный), note, cents }. say(text, kind) — что услышано, под кнопкой.
 * @param {{ add: Function }} d @param {{ onNote: (n: { midi: number, note: number, cents: number }) => void, idle?: string }} o
 */
export function guitarAnswer(d, { onNote, idle = 'Сыграй ответ на гитаре — приложение услышит.' }) {
  const listener = createNoteListener();
  const heard = h('p', { class: 'play-hint heard', 'aria-live': 'polite' }, idle);
  const panel = createMicPanel({
    pitch: true, onsets: false,
    onReading: rd => {
      if (rd.selfSound) { listener.reset(); return; }
      const n = listener.push(rd);
      if (n) onNote(n);
    },
    onStop: () => { listener.reset(); },
  });
  panel.el.hidden = true;
  d.add(() => panel.dispose());
  const text = h('span', null, 'Отвечать гитарой');
  const btn = h('button', { type: 'button', class: 'btn btn-ghost', 'data-action': 'mic', 'aria-pressed': 'false' }, icon('sound', 20), text);
  btn.addEventListener('click', () => {
    if (panel.running.value) { panel.stop(); panel.el.hidden = true; return; }
    panel.el.hidden = false;
    panel.start();
  });
  d.add(panel.running.watch(on => {
    text.textContent = on ? 'Не слушать' : 'Отвечать гитарой';
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('on', on);
    heard.textContent = on ? 'Слушаю… сыграй ответ.' : idle;
    heard.className = 'play-hint heard';
  }));
  // отладка (?debug): подставить «услышанную» ноту, как будто её сыграли на гитаре
  const hear = midi => onNote({ midi, note: Math.round(midi), cents: (midi - Math.round(midi)) * 100 });
  hooks.earHear = hear;
  d.add(() => { if (hooks.earHear === hear) delete hooks.earHear; });
  return {
    el: h('div', { class: 'guitar-answer' }, btn, heard, panel.el),
    running: panel.running,
    /** @param {string} t @param {'ok' | 'warn' | ''} [kind] */
    say(t, kind = '') { heard.textContent = t; heard.className = `play-hint heard ${kind}`.trim(); },
  };
}

/** «Это ля2, но гитара чуть расстроена» — если высота рядом, но не в допуске ±40 центов */
export function tuneHint(n, target) {
  return matchPitch(n.midi, target) === 'close' ? `Это ${heardName(n.midi)}, но гитара чуть расстроена (${Math.round(Math.abs((n.midi - target) * 100))} центов) — проверь тюнер.` : '';
}

/**
 * Кнопки внизу, в зоне большого пальца: «Ещё раз» (повторить звук) и «Дальше» (новое задание).
 * @param {{ replay: () => void, next: () => void, nextLabel?: string, replayLabel?: string }} o
 */
export function earNav({ replay, next, nextLabel = 'Дальше', replayLabel = 'Ещё раз' }) {
  const replayBtn = button({ kind: 'ghost', icon: 'playFill', label: replayLabel, onclick: replay, attrs: { 'data-action': 'replay' } });
  const label = h('span', null, nextLabel);
  const nextBtn = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'next', onclick: next }, label, icon('next', 20));
  return {
    el: h('div', { class: 'cta-sticky lesson-nav ear-nav' }, replayBtn, nextBtn),
    /** Подсветить «Дальше», когда задание решено */
    ready(on) { nextBtn.classList.toggle('pulse', on); },
    setNext(t) { label.textContent = t; },
  };
}

/**
 * «Руки заняты»: пробел — «Ещё раз»; педаль вперёд (PageDown, стрелка вправо, Enter) — «Дальше», пока задание
 * не решено — тоже «Ещё раз». Когда время шага занятия вышло, педаль отдаётся полосе шага («Готово»).
 * Зовётся до stepBar(): обработчик экрана должен срабатывать раньше обработчика полосы шага.
 * @param {{ add: Function }} d @param {{ section: string, page: string | null }} r экран (чей шаг занятия)
 * @param {{ replay: () => void, next: () => void, solved: () => boolean }} o
 */
export function earKeys(d, r, { replay, next, solved }) {
  const onKey = e => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const a = document.activeElement;
    const field = /^(INPUT|SELECT|TEXTAREA)$/.test(a?.tagName || '');
    // на кнопке или ссылке пробел и Enter нажимают её саму
    const control = field || /^(BUTTON|A|SUMMARY)$/.test(a?.tagName || '') || a?.getAttribute?.('role') === 'button';
    const pedal = e.key === 'PageDown' || e.key === 'ArrowRight';
    if (e.key === ' ' && !control) { e.preventDefault(); replay(); return; }
    if (!(pedal && !field) && !(e.key === 'Enter' && !control)) return;
    const p = practice.value, step = p && p.steps[p.index];
    if (pedal && step && step.section === r.section && step.page === r.page && p.left === 0) return;
    e.preventDefault();
    if (solved()) next(); else replay();
  };
  document.addEventListener('keydown', onKey);
  d.add(() => document.removeEventListener('keydown', onKey));
}

/** Отладка: текущее задание квиза — для автотестов (?debug) */
export function exposeTask(d, get) {
  hooks.earTask = get;
  d.add(() => { if (hooks.earTask === get) delete hooks.earTask; });
}

/** Сетка вариантов ответа: кнопки с крупной подписью и мелкой строкой под ней */
export function answerGrid(label, options, onPick) {
  const grid = h('div', { class: 'ear-answers', role: 'group', 'aria-label': label });
  const draw = list => grid.replaceChildren(...list.map(o => {
    const b = h('button', { type: 'button', class: 'opt', dataset: { value: String(o.value) } }, h('b', null, o.label), o.sub ? h('small', null, o.sub) : null);
    b.addEventListener('click', () => onPick(o.value, b));
    return b;
  }));
  draw(options);
  return {
    el: grid, redraw: draw,
    /** Отметить кнопку: right / wrong / снять отметки */
    mark(value, kind) { for (const b of grid.querySelectorAll('.opt')) if (b.getAttribute('data-value') === String(value)) b.classList.add(kind); },
    clear() { for (const b of grid.querySelectorAll('.opt')) b.classList.remove('right', 'wrong'); },
  };
}
