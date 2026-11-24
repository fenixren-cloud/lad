// ear-callback.js — «Перекличка»: приложение играет короткую фразу (пентатоника или кусок риффа на низких
// струнах), ты повторяешь её на гитаре — приложение слушает и отмечает каждую ноту. Сложность растёт сама:
// 3 чистых повтора подряд — уровень выше (длиннее фраза, шире скачки, свой ритм); 2 неудачи — фраза полегче.
// Руки заняты гитарой: «Автоматически дальше» — после удачного повтора следующая фраза звучит сама.
import { h } from '../ui/dom.js';
import { screenHeader, card, segmented, button } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { mod12 } from '../core/notes.js';
import { TUNINGS } from '../core/neck.js';
import { DICT_TONICS } from '../core/earquiz.js';
import { LEVELS, MAX_LEVEL, MODES, levelOf, makePhrase, phraseSpots, grade, progress, contour, riffTonic } from '../core/callback.js';
import { createPlayCheck } from '../core/playcheck.js';
import { roleOf } from '../ui/fretboard.js';
import { settings } from '../app/state.js';
import { stepBar } from './step.js';
import { neckView, chipRow, quickSettings } from './theory-kit.js';
import { earRand, earPrefs, streakView, earNav, earKeys, exposeTask, playSeq, autoplayOk, tapNote, guitarAnswer, tuneHint, heardName, nm } from './ear-kit.js';

const fresh = () => ({ level: 1, clean: 0, fails: 0 });
const where = (s, f) => `${6 - s}-я струна, ${f === 0 ? 'открытая' : `${f}-й лад`}`;

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  let opened = false; // первое задание экрана уже было
  const rand = earRand(r);
  const fromToday = r.query.from === 'today';
  const prefs = earPrefs('callback', { mode: 'penta', tonic: 9, pos: 0, auto: true, levels: { penta: fresh(), riff: fresh() } }, v => ({
    mode: MODES.some(([x]) => x === v.mode) ? v.mode : 'penta',
    tonic: DICT_TONICS.includes(Number(v.tonic)) ? Number(v.tonic) : 9,
    pos: Math.max(0, Math.min(4, Number(v.pos) || 0)),
    auto: v.auto !== false,
    levels: { penta: { ...fresh(), ...(v.levels?.penta || {}) }, riff: { ...fresh(), ...(v.levels?.riff || {}) } },
  }));
  const streak = streakView('callback');
  const tuning = () => TUNINGS[settings.value.tuning].midi;
  const prog = () => prefs.sig.value.levels[prefs.sig.value.mode];
  const opts = () => ({ mode: prefs.sig.value.mode, level: prog().level, tonic: prefs.sig.value.tonic, pos: prefs.sig.value.pos, tuning: tuning() });

  /** @type {import('../core/callback.js').Phrase | null} */
  let ph = null;
  /** @type {ReturnType<typeof createPlayCheck> | null} */
  let check = null;
  let done = false, hinted = false, timer = 0;
  d.add(() => clearTimeout(timer));

  // ---------- вид ----------
  const levelTitle = h('b', { class: 'cb-level' });
  const levelHint = h('span', { class: 'muted' });
  const cleanDots = h('span', { class: 'cb-clean', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  const cleanText = h('span', { class: 'sr-only' });
  const dots = h('ol', { class: 'ear-dots cb-dots', 'aria-label': 'Ноты фразы' });
  const status = h('p', { class: 'ear-prompt cb-status', 'aria-live': 'polite' });
  const hintLine = h('p', { class: 'muted note', hidden: true });
  const neck = neckView(d, 'Гриф: можно отвечать и касанием', { interactive: true, onTap: (s, f) => { const m = tuning()[s] + f; tapNote(m, 0.45); hear(m, { string: s, fret: f }); } });

  function drawLevel() {
    const L = levelOf(prog().level), p = prog();
    levelTitle.textContent = `Уровень ${L.id} из ${MAX_LEVEL} · ${L.title}`;
    levelHint.textContent = L.hint;
    cleanDots.querySelectorAll('i').forEach((x, i) => x.classList.toggle('on', i < p.clean));
    cleanText.textContent = `Чистых повторов подряд: ${p.clean} из 3.`;
  }
  function drawDots(playing = -1) {
    if (!ph) return;
    dots.replaceChildren(...ph.notes.map((n, i) => {
      const ok = check && i < check.index;
      const cls = `${ok ? 'ok' : ''}${check && i === check.index && !done && playing < 0 ? ' now' : ''}${i === playing ? ' playing' : ''}`;
      return h('li', { class: cls.trim(), dataset: { i: String(i) } }, ok || done ? nm(mod12(n.midi)) : String(i + 1));
    }));
  }
  function drawNeck(reveal = false) {
    if (!ph) return;
    const spots = phraseSpots(opts());
    const lab = (midi, deg) => (settings.value.labels === 'notes' ? nm(mod12(midi)) : deg);
    const show = new Set(reveal ? ph.notes.map(n => n.midi) : hinted ? [ph.notes[0].midi] : []);
    const got = new Set(check ? ph.notes.slice(0, check.index).map(n => n.midi) : []);
    const markers = spots.map(s => ({ string: s.string, fret: s.fret, label: lab(s.midi, s.degree), role: roleOf(s.degree), dim: !show.has(s.midi) && !got.has(s.midi), ring: show.has(s.midi) || got.has(s.midi) }));
    const fs = spots.map(s => s.fret);
    neck.show({ from: Math.max(0, Math.min(...fs) - 1), to: Math.min(22, Math.max(...fs) + 1), markers, focus: Math.min(...fs) });
  }

  // ---------- звук ----------
  function play(slow = false) {
    if (!ph) return;
    clearTimeout(timer);
    const short = ga.running.value;
    const items = ph.notes.map((n, i) => ({ notes: [{ midi: n.midi }], beats: ph.beats[i], dur: Math.min(ph.beats[i], short ? 0.5 : 0.95) }));
    status.textContent = 'Слушай…';
    playSeq(items, { title: 'Перекличка', bpm: slow ? Math.round(ph.bpm * 0.65) : ph.bpm, onStep: i => {
      drawDots(i);
      if (i < 0 && !done) status.textContent = ga.running.value ? 'Твоя очередь — играй фразу.' : 'Твоя очередь: сыграй фразу на гитаре («Отвечать гитарой») или найди её на грифе.';
    } }).then(ok => { if (!ok) status.textContent = 'Без звука: этот браузер не умеет Web Audio. Перекличке нужен звук.'; });
  }

  // ---------- фраза ----------
  function newPhrase() {
    clearTimeout(timer);
    ph = makePhrase(opts(), rand);
    check = createPlayCheck(ph.notes.map(n => ({ midi: n.midi, label: where(n.string, n.fret) })));
    done = false; hinted = false;
    hintLine.hidden = true;
    status.textContent = 'Нажми «Ещё раз» — прозвучит фраза. Потом повтори её.';
    neck.cursor([]);
    drawLevel(); drawDots(); drawNeck();
    nav.ready(false);
    if (autoplayOk(r, !opened)) play();
    opened = true;
  }
  /** Сыгранная (или нажатая) нота */
  function hear(midi, at = null, fromGuitar = false) {
    if (!check || done) return;
    const want = ph.notes[check.index];
    const res = check.push(midi);
    if (!res) return;
    const k = res.index + 1, n = ph.notes.length;
    if (res.result === 'ok') {
      if (at) neck.cursor([{ ...at, kind: 'ok' }]);
      if (check.done) { finish(); return; }
      status.textContent = `Есть! ${k} из ${n}.`;
    } else {
      if (at) neck.cursor([{ ...at, kind: 'bad' }]);
      const who = fromGuitar ? `Слышу ${heardName(midi)}` : `Это ${nm(mod12(midi))}`;
      status.textContent = res.result === 'octave' ? `${who} — та нота, но в другой октаве. Нота ${k}: ниже или выше на 12 ладов.`
        : `${who} — не та. Нота ${k}: ${midi < want.midi ? 'нужна выше' : 'нужна ниже'}.`;
    }
    drawDots(); drawNeck();
  }
  function finish(asGiveUp = false) {
    done = true;
    const result = grade({ done: !asGiveUp, misses: (check?.misses || 0) + (hinted ? 1 : 0), gaveUp: asGiveUp });
    const p = progress(prog(), result);
    prefs.set({ levels: { ...prefs.sig.value.levels, [prefs.sig.value.mode]: { level: p.level, clean: p.clean, fails: p.fails } } });
    streak.score(result === 'clean');
    const lvl = p.change > 0 ? ` Уровень выше: ${levelOf(p.level).title.toLowerCase()}!` : p.change < 0 ? ` Возьмём фразы полегче: уровень ${p.level}.` : '';
    status.textContent = (result === 'clean' ? 'Чисто! Повторено с первого раза.' : result === 'messy' ? `Повторено. ${check.misses ? `Ошибок: ${check.misses}` : 'С подсказкой'} — следующая получится чище.` : 'Ответ на грифе: кольца — ноты фразы. Сыграй её и возьми новую.') + lvl;
    drawLevel(); drawDots(); drawNeck(true);
    nav.ready(true);
    if (prefs.sig.value.auto && result !== 'fail') timer = setTimeout(() => { if (done) newPhrase(); }, p.change ? 2600 : 1800);
  }
  function hint() {
    if (!ph || done) return;
    hinted = true;
    hintLine.textContent = `Куда идёт мелодия: ${contour(ph.notes.map(n => n.midi)).join(', ')}. Первая нота — кольцо на грифе.`;
    hintLine.hidden = false;
    drawNeck();
  }

  const ga = guitarAnswer(d, {
    idle: 'Включи — и играй фразу на гитаре. Пока звучит приложение, микрофон не слушает.',
    onNote: n => {
      if (!check || done) return;
      const want = ph.notes[check.index].midi;
      const close = tuneHint(n, want);
      if (close) { ga.say(close, 'warn'); return; }
      ga.say(`Слышу ${heardName(n.midi)}`, Math.abs(n.midi - want) * 100 <= 40 ? 'ok' : 'warn');
      hear(n.midi, null, true);
    },
  });

  const nav = earNav({ replay: () => play(false), next: newPhrase, nextLabel: 'Новая фраза' });
  earKeys(d, r, { replay: () => play(false), next: newPhrase, solved: () => done });
  exposeTask(d, () => ({ phrase: ph, index: check?.index ?? 0, misses: check?.misses ?? 0, done, level: prog().level, mode: prefs.sig.value.mode }));

  // ---------- настройки ----------
  const modeSeg = segmented({ label: 'Что играет приложение', name: 'mode', options: MODES.map(([v, t]) => [v, t]), sig: prefs.field('mode'), onchange: v => { prefs.set({ mode: v }); newPhrase(); drawMode(); } });
  const modeNote = h('p', { class: 'muted note' });
  const levelSeg = segmented({ label: 'Уровень', name: 'level', options: LEVELS.map(L => [String(L.id), String(L.id)]),
    sig: { get value() { return String(prog().level); }, watch: fn => prefs.sig.watch(() => fn(String(prog().level))) },
    onchange: v => { prefs.set({ levels: { ...prefs.sig.value.levels, [prefs.sig.value.mode]: { level: Number(v), clean: 0, fails: 0 } } }); newPhrase(); } });
  const tonics = chipRow({ label: 'Тоника', name: 'tonic', options: [], sig: prefs.field('tonic'), onchange: v => { prefs.set({ tonic: Number(v) }); newPhrase(); } });
  d.add(tonics.dispose);
  const pos = segmented({ label: 'Позиция', name: 'pos', options: [0, 1, 2, 3, 4].map(i => [String(i), String(i + 1)]), sig: prefs.field('pos'), onchange: v => { prefs.set({ pos: Number(v) }); newPhrase(); } });
  const pentaOpts = h('details', { class: 'ear-more' }, h('summary', null, 'Тоника и позиция пентатоники'),
    h('div', { class: 'setting' }, h('b', null, 'Тоника (минор)'), tonics.el),
    h('div', { class: 'setting' }, h('b', null, 'Позиция'), pos));
  const autoBtn = h('button', { type: 'button', class: 'chip-btn', role: 'switch', 'aria-checked': String(prefs.sig.value.auto), 'data-action': 'auto' }, 'Автоматически дальше');
  autoBtn.addEventListener('click', () => { prefs.set({ auto: !prefs.sig.value.auto }); autoBtn.setAttribute('aria-checked', String(prefs.sig.value.auto)); });
  function drawMode() {
    const riff = prefs.sig.value.mode === 'riff';
    pentaOpts.hidden = riff;
    const t = riffTonic(tuning());
    modeNote.textContent = riff
      ? `От открытой 6-й струны: ${settings.value.tuning === 'dropd' ? 'Drop D — ре минор' : 'Standard — ми минор'} (${nm(t)}), 6-я и 5-я струны.`
      : 'Минорная пентатоника, одна позиция; тусклые значки на грифе — её ноты.';
  }
  d.add(settings.watch(() => { tonics.redraw(DICT_TONICS.map(pc => [String(pc), `${nm(pc)}m`])); drawMode(); }));
  let lastTuning = settings.value.tuning;
  d.add(settings.watch(s => { if (s.tuning !== lastTuning) { lastTuning = s.tuning; newPhrase(); } }));

  const slow = button({ kind: 'ghost', label: 'Медленно', onclick: () => play(true), attrs: { 'data-action': 'slow' } });
  const hintBtn = button({ kind: 'ghost', icon: 'info', label: 'Подсказка', onclick: hint, attrs: { 'data-action': 'hint' } });
  const showBtn = button({ kind: 'plain', label: 'Показать ответ', onclick: () => { if (!done && ph) finish(true); }, attrs: { 'data-action': 'show' } });

  newPhrase();
  drawMode();
  const el = h('div', { class: 'screen ear ear-callback' },
    screenHeader({ eyebrow: 'Слух', title: 'Перекличка', back: fromToday ? '#/today' : '#/ear' }),
    h('p', { class: 'lead' }, 'Приложение играет короткую фразу — повтори её на гитаре. Это прямая тренировка подбора риффов на слух: услышать — найти — сыграть.'),
    h('div', { class: 'setting' }, h('b', null, 'Что играет приложение'), modeSeg, modeNote),
    pentaOpts,
    card({ cls: 'ear-task cb-task' },
      h('div', { class: 'cb-head' }, h('div', { class: 'row-text' }, levelTitle, levelHint), h('span', { class: 'cb-clean-wrap', title: 'Чистых повторов подряд — 3, и уровень выше' }, cleanDots, cleanText)),
      dots, status, hintLine,
      ga.el,
      h('div', { class: 'row' }, slow, hintBtn, showBtn)),
    quickSettings(),
    card({ cls: 'neckcard' }, neck.el),
    h('div', { class: 'row cb-opts' }, autoBtn, h('div', { class: 'setting-inline' }, h('span', { class: 'muted' }, 'Уровень'), levelSeg)),
    streak.el,
    card({ title: 'Как заниматься', id: 'cb-how', cls: 'muted-card' },
      h('p', null, 'Слушай фразу целиком, потом пропой её про себя и только потом ищи на грифе. Первая нота почти всегда — тоника или квинта (в риффе — открытая 6-я струна).'),
      h('p', null, 'Ошибка — не страшно: неверная нота не сбрасывает уже сыгранные, просто ищи дальше. Три чистых повтора подряд — уровень выше.'),
      h('p', null, h('b', null, 'Подсказка'), ' покажет, куда идёт мелодия, и первую ноту; «Медленно» — фраза в две трети темпа.'),
      h('p', { class: 'muted note' }, 'Ритм на 5-м уровне — для уха: приложение проверяет ноты и их порядок. Пробел — ещё раз, педаль «вперёд» — новая фраза.')),
    nav.el,
    stepBar(r, d));
  return { el, title: 'Перекличка', dispose: () => d.dispose() };
}
