// metronome.js — экран метронома: крупный темп, ±1/±5, tap, ×½/×2, сетка долей (нажатие меняет акцент),
// размер, деления, звук и ритмы барабанов, отсчёт, пропуски, тренажёр скорости, громкость, вспышка,
// таймер занятия, пробел — старт/стоп. Упражнения с рекордами и лестницей темпа: «3 раза чисто → +4 BPM» —
// приложение само слушает удары через микрофон или отмечаешь сам.
import { h, bindText, announce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, card, button } from '../ui/components.js';
import { createMicPanel } from '../ui/mic-panel.js';
import { signal, disposer } from '../core/signal.js';
import { tempoName, clampBpm } from '../core/tempo.js';
import { SUB_ORDER, SUB_LABEL, SOUNDS, RHYTHMS, ACCENT, nextAccent, defaultAccents, tapTempo, EXERCISES, ladderStep, LADDER, expectedOnsets } from '../core/metronome.js';
import { SUBDIVISIONS } from '../core/transport.js';
import { isClean } from '../core/rhythm.js';
import { metro, setMetro, running, toggle, start, onMetroTick, elapsed, highClick } from '../audio/metronome.js';
import { getAudio } from '../audio/engine.js';
import { heardAt } from '../audio/latency.js';
import { store } from '../app/store.js';
import { noteTempo } from '../app/activity.js';
import { stepBar } from './step.js';

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const field = key => ({ get value() { return String(metro.value[key]); }, watch: fn => metro.watch(m => fn(String(m[key]))) });

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();

  // ---------- темп ----------
  const bpmEl = h('output', { class: 'bpm', 'aria-live': 'polite', 'aria-label': 'Темп, ударов в минуту' });
  const tempoEl = h('div', { class: 'tempo-name muted' });
  d.add(bindText(bpmEl, metro, m => String(m.bpm)));
  d.add(bindText(tempoEl, metro, m => { const t = tempoName(m.bpm); return `${t.name} · ${t.ru} · ударов в минуту`; }));
  const nudge = dv => setMetro({ bpm: clampBpm(metro.value.bpm + dv) });
  const taps = [];
  const tap = () => {
    taps.push(performance.now());
    if (taps.length > 8) taps.shift();
    const b = tapTempo(taps);
    if (b) setMetro({ bpm: b });
  };
  const adj = h('div', { class: 'adj' },
    ...[[-5, '−5'], [-1, '−1']].map(([v, l]) => h('button', { type: 'button', class: 'round', 'aria-label': `Медленнее на ${-v}`, onclick: () => nudge(v) }, l)),
    h('button', { type: 'button', class: 'round tap', 'data-action': 'tap', onclick: tap }, 'Tap'),
    ...[[1, '+1'], [5, '+5']].map(([v, l]) => h('button', { type: 'button', class: 'round', 'aria-label': `Быстрее на ${v}`, onclick: () => nudge(v) }, l)));
  const halves = h('div', { class: 'row center' },
    h('button', { type: 'button', class: 'btn btn-plain', onclick: () => setMetro({ bpm: clampBpm(metro.value.bpm / 2) }) }, '×½'),
    h('button', { type: 'button', class: 'btn btn-plain', onclick: () => setMetro({ bpm: clampBpm(metro.value.bpm * 2) }) }, '×2'));

  // ---------- сетка долей (нажатие — акцент) ----------
  const grid = h('div', { class: 'beatgrid', role: 'group', 'aria-label': 'Доли такта: нажми, чтобы поменять акцент' });
  const LEVEL = { [ACCENT.strong]: 'сильная', [ACCENT.medium]: 'средняя', [ACCENT.weak]: 'слабая', [ACCENT.mute]: 'тишина' };
  let cells = [];
  const drawGrid = m => {
    const subs = m.sub === 'quarter' ? [0] : SUBDIVISIONS[m.sub].ticks;
    grid.style.setProperty('--beats', String(m.beats));
    cells = m.accents.map((a, beat) => {
      const b = h('button', { type: 'button', class: `beat lvl-${a}`, dataset: { beat: String(beat) }, 'aria-label': `Доля ${beat + 1}: ${LEVEL[a]}` },
        h('span', { class: 'beat-num' }, String(beat + 1)),
        h('span', { class: 'beat-subs' }, ...subs.map(t => h('i', { dataset: { sub: String(t) } }))));
      b.addEventListener('click', () => { const acc = [...metro.value.accents]; acc[beat] = nextAccent(acc[beat]); setMetro({ accents: acc }); });
      return b;
    });
    grid.replaceChildren(...cells);
  };
  let gridKey = '';
  d.add(metro.watch(m => { const k = `${m.beats}|${m.sub}|${m.accents.join('')}`; if (k !== gridKey) { gridKey = k; drawGrid(m); } }));

  // подсветка текущей доли — точно по звуку: события приходят заранее, показываем в свой момент
  const queue = [];
  let raf = 0;
  const flashEl = h('div', { class: 'flash', 'aria-hidden': 'true' });
  const frame = () => {
    const a = getAudio();
    const now = a ? heardAt(a.ctx, performance.now()) : 0; // что слышно сейчас
    while (queue.length && queue[0].time <= now) {
      const e = queue.shift();
      cells.forEach((c, i) => c.classList.toggle('now', i === e.beat));
      const cell = cells[e.beat];
      cell?.querySelectorAll('i').forEach(x => x.classList.toggle('on', Number(/** @type {HTMLElement} */ (x).dataset.sub) === e.sub));
      if (e.sub === 0 && e.beat === 0 && flash.value === 'on') { flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go'); }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  d.add(() => cancelAnimationFrame(raf));
  d.add(onMetroTick(e => queue.push(e)));
  d.add(running.watch(on => { if (!on) { queue.length = 0; cells.forEach(c => c.classList.remove('now')); } }));

  // ---------- размер, деления, звук ----------
  const beatsStep = h('div', { class: 'stepper', role: 'group', 'aria-label': 'Размер' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Меньше долей', onclick: () => { const b = Math.max(1, metro.value.beats - 1); setMetro({ beats: b, accents: defaultAccents(b) }); } }, '−'),
    h('output', { class: 'mono meter' }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Больше долей', onclick: () => { const b = Math.min(16, metro.value.beats + 1); setMetro({ beats: b, accents: defaultAccents(b) }); } }, '+'));
  d.add(bindText(beatsStep.querySelector('output'), metro, m => `${m.beats}/${m.unit}`));
  const unitSeg = segmented({ label: 'Длительность доли', name: 'unit', options: [['4', '/4'], ['8', '/8']], sig: field('unit'), onchange: v => setMetro({ unit: Number(v) }) });
  const subSeg = segmented({ label: 'Деление доли', name: 'sub', options: SUB_ORDER.map(s => [s, SUB_LABEL[s]]), sig: field('sub'), onchange: v => setMetro({ sub: v }) });
  const soundSeg = segmented({ label: 'Звук', name: 'sound', options: [...SOUNDS], sig: field('sound'), onchange: v => setMetro({ sound: v }) });
  const rhythmSeg = segmented({ label: 'Ритм барабанов', name: 'rhythm', options: [...RHYTHMS], sig: field('rhythm'), onchange: v => setMetro({ rhythm: v }) });
  const rhythmRow = h('div', { class: 'setting' }, h('b', null, 'Ритм барабанов'), rhythmSeg,
    h('span', { class: 'muted note' }, '«По акцентам»: сильная доля — бочка, средняя — малый, слабая — хай-хэт.'));
  d.add(metro.watch(m => { rhythmRow.hidden = m.sound !== 'drums'; }));

  // ---------- «ещё»: отсчёт, пропуски, тренажёр, громкость, вспышка ----------
  const flash = signal(store().get('metroFlash', 'on'));
  const gapSig = { get value() { const g = metro.value.gap; return g ? `${g.play}+${g.mute}` : 'off'; }, watch: fn => metro.watch(m => fn(m.gap ? `${m.gap.play}+${m.gap.mute}` : 'off')) };
  const trainerSig = { get value() { const t = metro.value.trainer; return t ? `${t.step}/${t.every}` : 'off'; }, watch: fn => metro.watch(m => fn(m.trainer ? `${m.trainer.step}/${m.trainer.every}` : 'off')) };
  const vol = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: metro.value.volume, 'aria-label': 'Громкость метронома', oninput: e => setMetro({ volume: Number(e.target.value) }) }));
  const more = h('details', { class: 'more' }, h('summary', null, 'Ещё: отсчёт, пропуски, тренажёр, громкость'),
    h('div', { class: 'setting' }, h('b', null, 'Отсчёт перед стартом'), segmented({ label: 'Отсчёт', name: 'countIn', options: [['0', 'нет'], ['1', '1 такт'], ['2', '2 такта']], sig: field('countIn'), onchange: v => setMetro({ countIn: Number(v) }) })),
    h('div', { class: 'setting' }, h('b', null, 'Пропуски клика'), h('span', { class: 'muted note' }, 'Метроном замолкает на такт — держишь ли ты темп сам?'),
      segmented({ label: 'Пропуски клика', name: 'gap', options: [['off', 'нет'], ['3+1', '3 + 1'], ['2+2', '2 + 2'], ['1+1', '1 + 1']], sig: gapSig, onchange: v => setMetro({ gap: v === 'off' ? null : { play: Number(v[0]), mute: Number(v[2]) } }) })),
    h('div', { class: 'setting' }, h('b', null, 'Случайное выпадение долей'),
      segmented({ label: 'Выпадение долей', name: 'drop', options: [['0', 'нет'], ['0.15', '15 %'], ['0.3', '30 %']], sig: field('randomDrop'), onchange: v => setMetro({ randomDrop: Number(v) }) })),
    h('div', { class: 'setting' }, h('b', null, 'Тренажёр скорости'), h('span', { class: 'muted note' }, 'Темп растёт сам: на N ударов каждые M тактов, до +40.'),
      segmented({ label: 'Тренажёр скорости', name: 'trainer', options: [['off', 'нет'], ['2/2', '+2 / 2 такта'], ['4/4', '+4 / 4 такта'], ['5/8', '+5 / 8 тактов']], sig: trainerSig,
        onchange: v => setMetro({ trainer: v === 'off' ? null : { step: Number(v.split('/')[0]), every: Number(v.split('/')[1]), max: Math.min(300, metro.value.bpm + 40) } }) })),
    h('div', { class: 'setting' }, h('b', null, 'Громкость метронома'), h('div', { class: 'range-row' }, vol)),
    h('div', { class: 'setting' }, h('b', null, 'Вспышка на «раз»'),
      segmented({ label: 'Вспышка', name: 'flash', options: [['on', 'вкл'], ['off', 'выкл']], sig: flash, onchange: v => { flash.value = v; store().set('metroFlash', v); } })));

  // ---------- упражнения и лестница темпа ----------
  const records = signal(store().get('records', {}));
  const rec = id => ({ bpm: EXERCISES.find(e => e.id === id).start, streak: 0, best: 0, ...(records.value[id] || {}) });
  const saveRec = (id, v) => { records.value = { ...records.value, [id]: { bpm: v.bpm, streak: v.streak, best: v.best } }; store().set('records', records.value); };
  const active = signal(/** @type {string | null} */ (r.query.ex || null));
  const ladderStatus = h('p', { class: 'status muted', 'aria-live': 'polite' });
  const round = { taps: [], expected: [], latency: 0, bars: 0 };
  const markRound = clean => {
    const id = active.value;
    if (!id) return;
    const bpmNow = rec(id).bpm;
    const next = ladderStep(rec(id), clean);
    saveRec(id, next);
    if (clean) noteTempo(id, bpmNow);
    if (next.raised) { setMetro({ bpm: next.bpm }); ladderStatus.textContent = `Чисто ${LADDER.cleanToStep} раза подряд — темп ${next.bpm}.`; announce(ladderStatus.textContent); }
    else ladderStatus.textContent = clean ? `Чисто: ${next.streak} из ${LADDER.cleanToStep}.` : 'Сбилось — серия заново. Спокойно, без зажима.';
  };
  const mic = createMicPanel({
    pitch: false, onsets: true, ignoreSelf: false,
    onOnset: t => round.taps.push(t),
    onStart: s => { highClick.value = true; round.latency = store().get('rhythm', {}).micLatency ?? (s.info.outputLatency + s.info.inputLatency || 0.06); ladderStatus.textContent = 'Слушаю: играй упражнение — каждые 2 такта проверяю, чисто ли.'; },
    onStop: () => { highClick.value = false; },
  });
  d.add(() => mic.dispose());
  // раунд — 2 такта: ожидаемые удары — деления упражнения, сыгранные — что услышал микрофон
  d.add(onMetroTick(e => {
    if (!active.value || !mic.running.value || e.countIn) return;
    if (e.beat === 0 && e.sub === 0) {
      if (round.bars === 2) {
        const res = isClean(round.expected, round.taps, { latency: round.latency });
        markRound(res.clean);
        round.expected = []; round.taps = []; round.bars = 0;
      }
      round.bars++;
      const beatDur = 60 / metro.value.bpm;
      for (const o of expectedOnsets(metro.value)) round.expected.push(e.time + o * beatDur);
    }
  }));

  const exList = h('div', { class: 'list' });
  const drawEx = () => exList.replaceChildren(...EXERCISES.map(ex => {
    const v = rec(ex.id), on = active.value === ex.id;
    const pips = h('span', { class: 'pips', 'aria-label': `чисто ${v.streak} из ${LADDER.cleanToStep}` }, ...Array.from({ length: LADDER.cleanToStep }, (_, i) => h('i', { class: i < v.streak ? 'on' : '' })));
    const head = h('button', { type: 'button', class: `ex-row ${on ? 'on' : ''}`, 'aria-expanded': String(on), dataset: { ex: ex.id }, onclick: () => pick(ex.id) },
      h('span', { class: 'row-text' }, h('b', null, ex.name), h('span', { class: 'muted' }, `темп ${v.bpm}${v.best ? ` · рекорд ${v.best}` : ''} · ${ex.goal}`)), pips);
    if (!on) return head;
    return h('div', { class: 'ex-open' }, head,
      h('p', null, ex.how),
      h('div', { class: 'row' },
        button({ kind: 'ghost', label: 'Чисто ✓', onclick: () => markRound(true), attrs: { 'data-action': 'clean' } }),
        button({ kind: 'ghost', label: 'Сбился', onclick: () => markRound(false), attrs: { 'data-action': 'miss' } })),
      h('p', { class: 'muted note' }, `${LADDER.cleanToStep} раза подряд чисто — темп +${LADDER.step}. Отмечай сам или включи «Слушать игру»: приложение услышит удары и решит само (клик станет высоким, его микрофон не слышит).`),
      mic.el,
      button({ kind: 'ghost', icon: 'sound', label: 'Слушать игру', onclick: () => (mic.running.value ? mic.stop() : mic.start()), attrs: { 'data-action': 'listen' } }),
      ladderStatus);
  }));
  const pick = id => {
    if (active.value === id) { active.value = null; mic.stop(); return; }
    active.value = id;
    const ex = EXERCISES.find(e => e.id === id);
    setMetro({ bpm: rec(id).bpm, sub: ex.sub });
    ladderStatus.textContent = '';
  };
  d.add(active.watch(drawEx));
  d.add(records.watch(drawEx));
  if (active.value) { const ex = EXERCISES.find(e => e.id === active.value); if (ex) setMetro({ bpm: rec(ex.id).bpm, sub: ex.sub }); else active.value = null; }

  // ---------- старт ----------
  const startBtn = button({ kind: 'primary', icon: 'playFill', label: 'Старт', onclick: () => toggle(), attrs: { 'data-action': 'start' } });
  const timerEl = h('span', { class: 'mono muted timer' });
  d.add(running.watch(on => {
    startBtn.querySelector('span').textContent = on ? 'Стоп' : 'Старт';
    startBtn.replaceChild(icon(on ? 'stopFill' : 'playFill', 20), startBtn.querySelector('svg'));
  }));
  d.add(bindText(timerEl, elapsed, s => (s ? `занимаешься ${mmss(s)}` : '')));
  const onKey = e => {
    if (e.code !== 'Space' || e.defaultPrevented || /^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(document.activeElement?.tagName || '')) return;
    e.preventDefault();
    toggle();
  };
  document.addEventListener('keydown', onKey);
  d.add(() => document.removeEventListener('keydown', onKey));
  if (r.query.from === 'today' && r.query.autostart === '1') start();

  const el = h('div', { class: 'screen tool metronome' },
    flashEl,
    screenHeader({ eyebrow: 'Играть', title: 'Метроном', back: r.query.from === 'today' ? '#/today' : '#/play' }),
    h('div', { class: 'tempo' }, bpmEl, tempoEl, adj, halves),
    grid,
    h('div', { class: 'row center' }, beatsStep, unitSeg),
    h('div', { class: 'setting' }, h('b', null, 'Деление доли'), subSeg),
    h('div', { class: 'setting' }, h('b', null, 'Звук'), soundSeg),
    rhythmRow,
    more,
    h('div', { class: 'cta-sticky' }, startBtn, timerEl),
    card({ title: 'Упражнения с рекордами', id: 'exercises', cls: 'flush-list' }, exList),
    stepBar(r, d));
  return { el, title: 'Метроном', dispose: () => d.dispose() };
}
