// rhythm.js — тест ритма: насколько ровно ты попадаешь в долю. Режимы: четверти, восьмые, только «и»,
// с пропусками клика, ритмические фигуры. Удары — касанием, пробелом или по заглушённым струнам через микрофон.
// Итог: отклонение каждого удара в мс, среднее (раньше/позже), разброс, график, оценка, история.
// Калибровка задержки — отдельно для касаний и для микрофона.
import { h } from '../ui/dom.js';
import { screenHeader, segmented, card, button } from '../ui/components.js';
import { createMicPanel } from '../ui/mic-panel.js';
import { signal, disposer } from '../core/signal.js';
import { RHYTHM_MODES, rhythmPlan, analyzeTaps, tapsInWindow, calibrate } from '../core/rhythm.js';
import { clampBpm } from '../core/tempo.js';
import { unlockAudio } from '../audio/engine.js';
import { join, leave } from '../audio/hub.js';
import { playVoice } from '../audio/percussion.js';
import { heardAt, micLatencyGuess } from '../audio/latency.js';
import { stop as stopMetronome } from '../audio/metronome.js';
import { store } from '../app/store.js';
import { stepBar } from './step.js';

const FIG_TEXT = { q: '♩', ee: '♫', r: '𝄽', re: '𝄾♪', er: '♪𝄾', tr: '3' };
const ms = s => `${s >= 0 ? '+' : '−'}${Math.abs(Math.round(s * 1000))} мс`;

/** График отклонений: по горизонтали — удары, по вертикали — мс (вверх — позже), полоса ±20 мс */
function chart(hits) {
  const W = 320, H = 140, mid = H / 2, scale = mid / 0.1; // ±100 мс
  const svg = h('svg:svg', { class: 'rchart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Отклонение каждого удара' });
  let s = `<rect class="band" x="0" y="${mid - 0.02 * scale}" width="${W}" height="${0.04 * scale}"/><line class="zero" x1="0" y1="${mid}" x2="${W}" y2="${mid}"/>`;
  s += `<text class="lbl" x="4" y="12">позже</text><text class="lbl" x="4" y="${H - 4}">раньше</text>`;
  hits.forEach((x, i) => {
    const cx = ((i + 0.5) / Math.max(1, hits.length)) * W, cy = mid - Math.max(-0.1, Math.min(0.1, x.dev)) * scale;
    s += `<circle class="${Math.abs(x.dev) <= 0.02 ? 'good' : 'off'}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4"/>`;
  });
  svg.innerHTML = s;
  return svg;
}

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const saved = { mode: 'quarters', bpm: 80, bars: 4, input: 'tap', ...store().get('rhythm', {}) };
  const opt = signal({ mode: saved.mode, bpm: clampBpm(saved.bpm), bars: [2, 4, 8].includes(saved.bars) ? saved.bars : 4, input: saved.input === 'mic' ? 'mic' : 'tap' });
  const save = patch => { opt.value = { ...opt.value, ...patch }; store().update('rhythm', x => ({ ...x, ...opt.value }), {}); };
  const field = key => ({ get value() { return String(opt.value[key]); }, watch: fn => opt.watch(v => fn(String(v[key]))) });
  const state = signal(/** @type {'idle' | 'count' | 'play' | 'done'} */ ('idle'));

  const status = h('p', { class: 'status big-status', 'aria-live': 'assertive' }, 'Выбери режим и нажми «Начать».');
  const dots = h('div', { class: 'rdots', 'aria-hidden': 'true' }, ...[0, 1, 2, 3].map(() => h('i')));
  const figureRow = h('div', { class: 'figure', 'aria-label': 'Ритмическая фигура такта' });
  const result = h('div', { class: 'rresult', hidden: true });
  const hist = h('div', { class: 'list' });

  /** @type {{ taps: number[], expected: number[], barTimes: number[], startBar: number, plan: any[], calibrating: boolean, micInfo: any }} */
  const run = { taps: [], expected: [], barTimes: [], startBar: 0, plan: [], calibrating: false, micInfo: null };
  let ctx = null, bus = null, endTimer = 0;

  const mic = createMicPanel({
    pitch: false, onsets: true, ignoreSelf: false,
    onOnset: t => { if (state.value === 'play' || state.value === 'count') run.taps.push(t); },
    onStart: s => { run.micInfo = s.info; },
  });
  d.add(() => mic.dispose());
  const micBox = h('div', { class: 'mic-box' }, mic.el, h('p', { class: 'muted note' }, 'Глуши струны левой рукой и бей медиатором — каждый «чак» засчитывается. Клик в этом режиме высокий: микрофон его не слышит. В наушниках точнее.'));
  d.add(opt.watch(o => { micBox.hidden = o.input !== 'mic'; }));

  const latency = () => {
    const cal = store().get('rhythm', {});
    return opt.value.input === 'mic' ? (cal.micLatency ?? micLatencyGuess(run.micInfo)) : (cal.tapLatency ?? 0);
  };

  function onTicks(events) {
    const o = opt.value, countBars = 1;
    for (const e of events) {
      const bar = e.bar - run.startBar;
      if (bar < 0 || e.late) continue;
      const testBar = bar - countBars;
      if (testBar >= run.plan.length) continue;
      if (e.sub === 0) {
        if (e.beat === 0 && testBar >= 0) run.barTimes[testBar] = e.time;
        const clicks = testBar < 0 ? [0, 1, 2, 3] : run.plan[testBar].clicks;
        if (clicks.includes(e.beat)) playVoice(ctx, bus, e.beat === 0 ? 'accent' : 'beat', 'click', e.time, 1, o.input === 'mic');
        // подсветка — в момент, когда клик слышно (а не когда он запланирован)
        const delay = Math.max(0, (e.time - heardAt(ctx, performance.now())) * 1000);
        setTimeout(() => {
          dots.querySelectorAll('i').forEach((x, i) => x.classList.toggle('on', i === e.beat));
          if (testBar < 0) status.textContent = `Отсчёт: ${e.beat + 1}`;
          else if (testBar === 0 && e.beat === 0) { state.value = 'play'; status.textContent = run.calibrating ? 'Бей точно вместе с кликом' : 'Играй!'; }
          if (testBar >= 0 && e.beat === 0) showFigure(run.plan[testBar].figure);
        }, delay);
      }
    }
  }
  function showFigure(f) {
    figureRow.hidden = !f;
    if (f) figureRow.replaceChildren(...f.map(k => h('span', null, FIG_TEXT[k])));
  }

  async function begin(calibrating = false) {
    const a = await unlockAudio();
    if (!a) { status.textContent = 'Без звука тест ритма не получится: в этом браузере нет Web Audio.'; return; }
    ctx = a.ctx;
    if (!bus) { bus = ctx.createGain(); bus.connect(a.master); }
    if (opt.value.input === 'mic' && !mic.running.value) { await mic.start(); if (!mic.running.value) return; }
    stopMetronome();
    leave('rhythm');
    run.taps = []; run.barTimes = []; run.calibrating = calibrating;
    run.plan = calibrating ? rhythmPlan('quarters', 2) : rhythmPlan(opt.value.mode, opt.value.bars);
    result.hidden = true;
    state.value = 'count';
    status.textContent = 'Приготовься…';
    const j = join('rhythm', onTicks, { bpm: opt.value.bpm, beatsPerBar: 4 });
    if (!j) return;
    run.startBar = j.startBar;
    const total = ((run.plan.length + 1) * 4 * 60) / opt.value.bpm;
    clearTimeout(endTimer);
    endTimer = setTimeout(finish, (total + 0.8) * 1000);
  }

  function finish() {
    leave('rhythm');
    dots.querySelectorAll('i').forEach(x => x.classList.remove('on'));
    figureRow.hidden = true;
    const beat = 60 / opt.value.bpm;
    const expected = run.plan.flatMap((b, i) => (run.barTimes[i] == null ? [] : b.expected.map(p => run.barTimes[i] + p * beat)));
    const lat = run.calibrating ? 0 : latency();
    const taps = tapsInWindow(expected, run.taps.map(t => t - lat));
    state.value = 'done';
    if (run.calibrating) {
      const c = calibrate(expected, taps);
      if (c == null) { status.textContent = 'Мало попаданий для калибровки — попробуй ещё раз, бей вместе с кликом.'; return; }
      const key = opt.value.input === 'mic' ? 'micLatency' : 'tapLatency';
      store().update('rhythm', x => ({ ...x, [key]: c }), {});
      status.textContent = `Калибровка готова: задержка ${Math.round(c * 1000)} мс ${opt.value.input === 'mic' ? 'для гитары через микрофон' : 'для касаний'}. Теперь тест честный.`;
      drawCal();
      return;
    }
    const res = analyzeTaps(expected, taps);
    status.textContent = res.grade;
    result.replaceChildren(
      h('div', { class: 'rstats' },
        h('div', null, h('b', { class: 'mono' }, String(res.score)), h('span', { class: 'muted' }, 'баллов')),
        h('div', null, h('b', { class: 'mono' }, ms(res.mean)), h('span', { class: 'muted' }, res.mean >= 0 ? 'в среднем позже' : 'в среднем раньше')),
        h('div', null, h('b', { class: 'mono' }, `±${Math.round(res.sd * 1000)} мс`), h('span', { class: 'muted' }, 'разброс'))),
      chart(res.hits),
      h('p', { class: 'muted note' }, `Попаданий ${res.hits.length} из ${expected.length}${res.missed ? `, пропусков ${res.missed}` : ''}${res.extra ? `, лишних ${res.extra}` : ''}. Разброс важнее среднего: постоянный сдвиг исправляет калибровка, а ровность — только руки.`));
    result.hidden = false;
    const entry = { date: new Date().toISOString(), mode: opt.value.mode, input: opt.value.input, bpm: opt.value.bpm, mean: res.mean, sd: res.sd, score: res.score, grade: res.grade, missed: res.missed };
    store().update('rhythmHist', list => [...list, entry].slice(-200), []);
    drawHist();
  }
  d.add(() => { clearTimeout(endTimer); leave('rhythm'); });

  // удары касанием и пробелом: время — что было слышно в момент нажатия
  const pad = h('button', { type: 'button', class: 'rpad', 'data-action': 'tap', 'aria-label': 'Бей сюда в такт' }, 'Бей сюда');
  pad.addEventListener('pointerdown', e => { if (ctx && opt.value.input === 'tap' && state.value !== 'idle' && state.value !== 'done') run.taps.push(heardAt(ctx, e.timeStamp)); });
  const onKey = e => {
    if (e.code !== 'Space' || e.repeat || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    if (ctx && opt.value.input === 'tap' && (state.value === 'count' || state.value === 'play')) { e.preventDefault(); run.taps.push(heardAt(ctx, e.timeStamp)); }
  };
  document.addEventListener('keydown', onKey);
  d.add(() => document.removeEventListener('keydown', onKey));
  d.add(opt.watch(o => { pad.hidden = o.input !== 'tap'; }));

  const bpmOut = h('output', { class: 'mono meter' });
  d.add(opt.watch(o => { bpmOut.textContent = String(o.bpm); }));
  const startBtn = button({ kind: 'primary', icon: 'playFill', label: 'Начать', onclick: () => begin(false), attrs: { 'data-action': 'start' } });
  d.add(state.watch(s => { startBtn.querySelector('span').textContent = s === 'done' ? 'Ещё раз' : s === 'idle' ? 'Начать' : 'Идёт…'; startBtn.toggleAttribute('disabled', s === 'count' || s === 'play'); }));

  const calText = h('p', { class: 'muted note' });
  const drawCal = () => {
    const c = store().get('rhythm', {});
    const f = v => (v == null ? 'не сделана' : `${Math.round(v * 1000)} мс`);
    calText.textContent = `Касания: ${f(c.tapLatency)}. Гитара через микрофон: ${f(c.micLatency)}.`;
  };
  drawCal();
  const MODE_NAME = Object.fromEntries(RHYTHM_MODES);
  const drawHist = () => {
    const list = store().get('rhythmHist', []).slice(-10).reverse();
    hist.replaceChildren(...(list.length ? list.map(x => h('div', { class: 'hist-row' },
      h('span', { class: 'row-text' }, h('b', null, `${x.score} · ${x.grade}`), h('span', { class: 'muted' }, `${new Date(x.date).toLocaleDateString('ru-RU')} · ${MODE_NAME[x.mode] || x.mode} · ${x.bpm} BPM · ${x.input === 'mic' ? 'гитара' : 'касание'}`)),
      h('span', { class: 'mono muted' }, `±${Math.round(x.sd * 1000)}`))) : [h('p', { class: 'muted note pad' }, 'Здесь появится история: видно, как растёт ровность.')]));
  };
  drawHist();

  const el = h('div', { class: 'screen tool rhythm' },
    screenHeader({ eyebrow: 'Играть', title: 'Тест ритма', back: r.query.from === 'today' ? '#/today' : '#/play' }),
    segmented({ label: 'Режим', name: 'rmode', options: RHYTHM_MODES, sig: field('mode'), onchange: v => save({ mode: v }) }),
    h('div', { class: 'row center' },
      h('div', { class: 'stepper', role: 'group', 'aria-label': 'Темп' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Медленнее', onclick: () => save({ bpm: clampBpm(opt.value.bpm - 5) }) }, '−'),
        bpmOut, h('span', { class: 'muted' }, 'BPM'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Быстрее', onclick: () => save({ bpm: clampBpm(opt.value.bpm + 5) }) }, '+')),
      segmented({ label: 'Тактов', name: 'rbars', options: [['2', '2 такта'], ['4', '4'], ['8', '8']], sig: field('bars'), onchange: v => save({ bars: Number(v) }) })),
    segmented({ label: 'Чем бить', name: 'rinput', options: [['tap', 'Касание / пробел'], ['mic', 'Гитарой']], sig: field('input'), onchange: v => save({ input: v }) }),
    micBox,
    h('div', { class: 'rlive' }, dots, figureRow, status),
    pad,
    h('div', { class: 'cta-sticky' }, startBtn),
    result,
    card({ title: 'Калибровка задержки', id: 'rcal' },
      h('p', { class: 'muted note' }, 'Телефон, наушники и звуковая карта звучат с задержкой. 8 ударов вместе с кликом — и приложение её учтёт. Отдельно для касаний и для гитары.'),
      calText,
      button({ kind: 'ghost', icon: 'refresh', label: 'Калибровать', onclick: () => begin(true), attrs: { 'data-action': 'calibrate' } })),
    card({ title: 'История', id: 'rhist', cls: 'flush-list' }, hist),
    stepBar(r, d));
  figureRow.hidden = true;
  return { el, title: 'Тест ритма', dispose: () => d.dispose() };
}
