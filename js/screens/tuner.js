// tuner.js — тюнер: стрелка ±50 центов, зелёная зона ±5, автоопределение струны или выбранная струна
// с эталонной нотой, Standard E и Drop D, эталон A4 от 430 до 450 Гц, отметка «настроена»
// (только если струна держится в строе ~0,4 с), советы по подключению.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, card, button } from '../ui/components.js';
import { createMicPanel } from '../ui/mic-panel.js';
import { signal, disposer } from '../core/signal.js';
import { analyzeReading, createSmoother, createTunedTracker, A4_MIN, A4_MAX, IN_TUNE_CENTS } from '../core/tuner.js';
import { TUNINGS } from '../core/neck.js';
import { noteName, spellPc, mod12, octaveOf } from '../core/notes.js';
import { settings, setSetting, settingSignal } from '../app/state.js';
import { store } from '../app/store.js';
import { stepBar } from './step.js';

const W = 300, CX = 150, CY = 150, R = 124;
const pt = (c, r) => { const a = ((-90 + c * 1.6) * Math.PI) / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };

function gauge() {
  const svg = h('svg:svg', { class: 'gauge', viewBox: `0 0 ${W} 170`, role: 'img', 'aria-label': 'Стрелка тюнера: отклонение в центах' });
  const [g1x, g1y] = pt(-IN_TUNE_CENTS, R), [g2x, g2y] = pt(IN_TUNE_CENTS, R);
  let inner = `<path class="zone" d="M${g1x} ${g1y} A${R} ${R} 0 0 1 ${g2x} ${g2y}"/>`;
  for (let c = -50; c <= 50; c += 5) {
    const long = c % 25 === 0, [x1, y1] = pt(c, R - (long ? 22 : 12)), [x2, y2] = pt(c, R - 4);
    inner += `<line class="${long ? 'tick long' : 'tick'}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  for (const c of [-50, 0, 50]) { const [x, y] = pt(c, c === 0 ? R + 12 : R - 38); inner += `<text class="gl" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${c > 0 ? '+' + c : c}</text>`; }
  inner += `<g class="needle"><line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R + 6}"/><circle cx="${CX}" cy="${CY}" r="7"/></g>`;
  svg.innerHTML = inner;
  return svg;
}

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const prefs = { a4: 440, mode: 'auto', ...store().get('tuner', {}) };
  const save = () => store().set('tuner', { a4: prefs.a4, mode: prefs.mode });
  const a4 = signal(Math.min(A4_MAX, Math.max(A4_MIN, Number(prefs.a4) || 440)));
  const mode = signal(prefs.mode === 'string' ? 'string' : 'auto');
  const lock = signal(/** @type {number | null} */ (null));
  const tuning = settingSignal('tuning');
  const smoother = createSmoother(5);
  let tracker = createTunedTracker();

  const noteEl = h('span', { class: 'note-big' }, '—');
  const octEl = h('span', { class: 'oct' });
  const hzEl = h('span', { class: 'mono' }, '');
  const centsEl = h('b', { class: 'cents' });
  const hint = h('p', { class: 'hold muted', 'aria-live': 'polite' }, 'Нажми «Слушать» и дёрни струну.');
  const g = gauge();
  const needle = /** @type {SVGGElement} */ (g.querySelector('.needle'));

  const strings = h('div', { class: 'strs', role: 'group', 'aria-label': 'Струны: нажми — услышишь эталон и тюнер будет ждать эту струну' });
  const name = m => noteName(spellPc(mod12(m)), { german: settings.value.notation === 'german' });
  function drawStrings() {
    const midi = TUNINGS[tuning.value].midi;
    strings.replaceChildren(...midi.map((m, s) => {
      const b = h('button', { type: 'button', class: 'str', dataset: { string: String(s) }, 'aria-label': `${6 - s}-я струна, ${name(m)}${octaveOf(m)}` }, s === 5 ? name(m).toLowerCase() : name(m));
      b.addEventListener('click', () => pickString(s));
      return b;
    }));
    markStrings();
  }
  function markStrings(active = null) {
    const done = tracker.tuned;
    strings.querySelectorAll('.str').forEach(b => {
      const s = Number(/** @type {HTMLElement} */ (b).dataset.string);
      b.classList.toggle('ok', done.has(s));
      b.classList.toggle('on', s === (lock.value ?? active));
      b.setAttribute('aria-pressed', String(s === lock.value));
    });
  }
  async function pickString(s) {
    lock.value = s;
    mode.value = 'string';
    prefs.mode = 'string';
    save();
    markStrings();
    const { prepareInstruments } = await import('../audio/instruments.js');
    const inst = await prepareInstruments();
    inst?.guitar.play(TUNINGS[tuning.value].midi[s], undefined, { choke: true, duration: 2.5 });
  }

  function showReading(rd) {
    if (rd.selfSound) return; // звучит эталон — не слушаем себя
    const res = analyzeReading(rd.freq, { a4: a4.value, tuning: TUNINGS[tuning.value].midi, lock: mode.value === 'string' ? lock.value : null });
    if (!res) { smoother.reset(); return; }
    const m = smoother.push(res.midi);
    const note = Math.round(m), c = (m - note) * 100;
    noteEl.textContent = name(note);
    octEl.textContent = String(octaveOf(note));
    hzEl.textContent = `${rd.freq.toFixed(1).replace('.', ',')} Гц`;
    const target = res.target;
    const dev = target != null ? (m - target) * 100 : c;
    const shown = Math.max(-50, Math.min(50, dev));
    needle.style.transform = `rotate(${(shown * 1.6).toFixed(1)}deg)`;
    const inZone = target != null && Math.abs(dev) <= IN_TUNE_CENTS;
    g.classList.toggle('in-tune', inZone);
    centsEl.textContent = `${dev > 0 ? '+' : dev < 0 ? '−' : ''}${Math.abs(Math.round(dev))} ${Math.abs(Math.round(dev)) % 10 === 1 && Math.abs(Math.round(dev)) !== 11 ? 'цент' : 'центов'}`;
    centsEl.className = `cents ${inZone ? 'ok' : ''}`;
    const fresh = tracker.push({ ...res, inTune: inZone && note === target });
    if (target == null) hint.textContent = 'Далеко от открытых струн — проверь, та ли струна звучит.';
    else if (Math.abs(dev) > 100) hint.textContent = `Звучит ${name(note)}${octaveOf(note)}, а струна — ${name(target)}${octaveOf(target)}: ${dev > 0 ? 'ослабь' : 'подтяни'} её сильнее.`;
    else if (inZone) hint.textContent = fresh != null ? `${6 - fresh}-я струна настроена ✓` : 'В строю — подержи ноту ещё секунду.';
    else hint.textContent = dev > 0 ? 'Выше нужного — немного ослабь струну.' : 'Ниже нужного — немного подтяни струну.';
    markStrings(res.string);
  }

  const panel = createMicPanel({ pitch: true, onsets: false, onReading: showReading, onStop: () => { needle.style.transform = 'rotate(0deg)'; g.classList.remove('in-tune'); } });
  d.add(() => panel.dispose());
  const listen = button({ kind: 'primary', icon: 'playFill', label: 'Слушать', onclick: () => (panel.running.value ? panel.stop() : panel.start()), attrs: { 'data-action': 'listen' } });
  d.add(panel.running.watch(on => {
    listen.querySelector('span').textContent = on ? 'Стоп' : 'Слушать';
    listen.replaceChild(icon(on ? 'stopFill' : 'playFill', 20), listen.querySelector('svg'));
    if (!on) hint.textContent = 'Нажми «Слушать» и дёрни струну.';
  }));

  const a4Value = h('output', { class: 'mono a4' });
  const stepA4 = dv => { a4.value = Math.min(A4_MAX, Math.max(A4_MIN, a4.value + dv)); prefs.a4 = a4.value; save(); };
  d.add(a4.watch(v => { a4Value.textContent = `A4 = ${v} Гц`; }));
  d.add(tuning.watch(() => { tracker = createTunedTracker(); lock.value = null; drawStrings(); }));
  d.add(settings.watch(() => drawStrings()));

  const modeSeg = segmented({
    label: 'Как выбирать струну', name: 'tuner-mode', options: [['auto', 'Авто'], ['string', 'Струна']], sig: mode,
    onchange: v => { mode.value = v; prefs.mode = v; save(); if (v === 'auto') { lock.value = null; markStrings(); } },
  });

  const el = h('div', { class: 'screen tool tuner' },
    screenHeader({ eyebrow: 'Играть', title: 'Тюнер', back: r.query.from === 'today' ? '#/today' : '#/play' }),
    segmented({ label: 'Строй', name: 'tuning', options: [['std', 'Standard E'], ['dropd', 'Drop D']], sig: tuning, onchange: v => setSetting('tuning', v) }),
    panel.el,
    h('div', { class: 'readout' },
      h('div', { class: 'notewrap' }, noteEl, octEl),
      h('div', { class: 'hz muted' }, hzEl, ' · ', centsEl),
      g,
      hint),
    strings,
    h('div', { class: 'row center' }, modeSeg,
      h('div', { class: 'stepper', role: 'group', 'aria-label': 'Эталон ля первой октавы' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ниже на 1 Гц', onclick: () => stepA4(-1) }, '−'), a4Value,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Выше на 1 Гц', onclick: () => stepA4(1) }, '+'))),
    h('div', { class: 'cta-sticky' }, listen),
    card({ title: 'Как подключиться', id: 'tuner-tips', cls: 'tips' },
      h('p', { class: 'muted' }, 'Ноутбук и USB-звуковая карта: гитара в инструментальный вход, в списке выбери звуковую карту. Гитару обычно слышно во входе 2 — «Авто» найдёт его само.'),
      h('p', { class: 'muted' }, 'Если звук идёт в DAW через ASIO, браузер может не получить вход: закрой DAW или включи в её настройках звука освобождение устройства, когда окно не активно; частота везде — 48 кГц.'),
      h('p', { class: 'muted' }, 'Телефон: положи его рядом с гитарой — микрофон услышит струны даже без усилителя. Звук никуда не отправляется.')),
    stepBar(r, d));
  drawStrings();
  // «руки заняты»: пробел — слушать/стоп
  const onKey = e => { if (e.code === 'Space' && !e.defaultPrevented && !/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); listen.click(); } };
  document.addEventListener('keydown', onKey);
  d.add(() => document.removeEventListener('keydown', onKey));
  return { el, title: 'Тюнер', dispose: () => d.dispose() };
}
