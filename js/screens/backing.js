// backing.js — подложка: тональность и лад, готовые и свои последовательности (1–8 аккордов по 1, 2 или 4 такта),
// 5 грувов, дорожки барабанов, баса и гитары с громкостью и выключением, целевые ноты текущего аккорда на грифе.
import { h, bindText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, card, button } from '../ui/components.js';
import { createFretboard } from '../ui/fretboard.js';
import { disposer } from '../core/signal.js';
import { GROOVES, buildChords, chordLabel, targetMarkers, scaleNames } from '../core/backing.js';
import { PROGRESSIONS, MODES, MODE_ORDER, keyTonic } from '../core/scales.js';
import { noteName } from '../core/notes.js';
import { TUNINGS } from '../core/neck.js';
import { clampBpm } from '../core/tempo.js';
import { backing, setBacking, running, toggle, current, chords, familyOf } from '../audio/backing.js';
import { settings } from '../app/state.js';
import { stepBar } from './step.js';

const TRACKS = [['drums', 'Барабаны'], ['bass', 'Бас'], ['guitar', 'Гитара']];

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const german = () => settings.value.notation === 'german';
  const field = key => ({ get value() { return String(backing.value[key]); }, watch: fn => backing.watch(b => fn(String(b[key]))) });
  // шаг занятия или дорожки приходит с тональностью: #/play/backing?tonic=2&mode=dorian
  if (r.query.mode && r.query.mode in MODES) {
    const fam = familyOf(r.query.mode);
    const want = r.query.prog || (r.query.mode === 'mixolydian' ? 'blues' : backing.value.prog);
    const prog = want === 'custom' || PROGRESSIONS[fam].some(p => p.id === want) ? want : PROGRESSIONS[fam][0].id;
    const tonic = Number.isInteger(Number(r.query.tonic)) ? ((Number(r.query.tonic) % 12) + 12) % 12 : backing.value.tonic;
    if (backing.value.mode !== r.query.mode || backing.value.tonic !== tonic || backing.value.prog !== prog) setBacking({ mode: r.query.mode, tonic, prog });
  }

  // ---------- тональность и лад ----------
  const keySel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input-select', 'aria-label': 'Тоника', onchange: () => setBacking({ tonic: Number(keySel.value) }) }));
  const modeSel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input-select', 'aria-label': 'Лад', onchange: () => {
    const fam = familyOf(modeSel.value);
    const prog = backing.value.prog === 'custom' || PROGRESSIONS[fam].some(p => p.id === backing.value.prog) ? backing.value.prog : PROGRESSIONS[fam][0].id;
    setBacking({ mode: modeSel.value, prog });
  } }, ...MODE_ORDER.map(id => h('option', { value: id }, `${MODES[id].name} — ${MODES[id].alt}`))));
  const fillKeys = () => {
    keySel.replaceChildren(...Array.from({ length: 12 }, (_, pc) => h('option', { value: String(pc) }, noteName(keyTonic(pc, backing.value.mode), { german: german() }))));
    keySel.value = String(backing.value.tonic);
    modeSel.value = backing.value.mode;
  };
  d.add(backing.watch(fillKeys));
  d.add(settings.watch(fillKeys));
  const scaleLine = h('p', { class: 'muted note' });

  // ---------- последовательность ----------
  const progSeg = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Последовательность', dataset: { setting: 'prog' } });
  const drawProgs = () => {
    const fam = familyOf(backing.value.mode);
    const opts = [...PROGRESSIONS[fam].map(p => [p.id, p.name]), ['custom', 'Своя']];
    progSeg.replaceChildren(...opts.map(([id, name]) => {
      const b = h('button', { type: 'button', class: 'chip-btn', role: 'radio', 'aria-checked': String(backing.value.prog === id), dataset: { value: id } }, name);
      b.addEventListener('click', () => setBacking({ prog: id }));
      return b;
    }));
  };
  // своя последовательность: до 8 аккордов, у каждого — ступень и число тактов
  const custom = h('div', { class: 'custom-prog' });
  const drawCustom = () => {
    const b = backing.value;
    if (b.prog !== 'custom') { custom.hidden = true; return; }
    custom.hidden = false;
    const all = buildChords(b.tonic, b.mode, [0, 1, 2, 3, 4, 5, 6].map(dg => ({ degree: dg, bars: 1 })));
    custom.replaceChildren(...b.custom.map((c, i) => {
      const sel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input-select', 'aria-label': `Аккорд ${i + 1}` },
        ...all.map(x => h('option', { value: String(x.degree) }, `${chordLabel(x, german()).symbol} · ${x.roman}`))));
      sel.value = String(c.degree);
      sel.addEventListener('change', () => { const list = [...b.custom]; list[i] = { ...list[i], degree: Number(sel.value) }; setBacking({ custom: list }); });
      const bars = segmented({ label: `Тактов на аккорд ${i + 1}`, name: `bars-${i}`, options: [['1', '1'], ['2', '2'], ['4', '4']],
        sig: { value: String(c.bars), watch: fn => { fn(String(c.bars)); return () => {}; } },
        onchange: v => { const list = [...b.custom]; list[i] = { ...list[i], bars: Number(v) }; setBacking({ custom: list }); } });
      const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Убрать аккорд ${i + 1}`, onclick: () => { if (b.custom.length > 1) setBacking({ custom: b.custom.filter((_, k) => k !== i) }); } }, '×');
      return h('div', { class: 'custom-row' }, sel, bars, del);
    }), b.custom.length < 8 ? button({ kind: 'ghost', label: '+ аккорд', onclick: () => setBacking({ custom: [...b.custom, { degree: 3, bars: 1 }] }), attrs: { 'data-action': 'add-chord' } }) : null);
  };

  // ---------- текущий аккорд и гриф ----------
  const chordRow = h('div', { class: 'chord-row', role: 'list', 'aria-label': 'Аккорды последовательности' });
  const bigChord = h('div', { class: 'big-chord', 'aria-live': 'polite' });
  const fb = createFretboard({ tuning: TUNINGS[settings.value.tuning].midi, from: 0, to: 12, orientation: /** @type {any} */ (settings.value.orientation), german: german(), label: 'Целевые ноты текущего аккорда' });
  const drawChords = () => {
    const list = chords(), cur = current.value?.index ?? 0;
    chordRow.replaceChildren(...list.map((c, i) => {
      const l = chordLabel(c, german());
      return h('span', { class: `chord-chip${i === cur ? ' on' : ''}`, role: 'listitem' }, h('b', null, l.symbol), h('small', null, `${l.roman} · ${c.bars} т.`));
    }));
    const c = list[cur] || list[0], l = chordLabel(c, german());
    bigChord.replaceChildren(h('b', null, l.symbol), h('span', { class: 'muted' }, ` ${l.roman} — целевые ноты: 1, 3, 5 аккорда`));
    const b = backing.value, tuning = TUNINGS[settings.value.tuning].midi;
    fb.update({ markers: targetMarkers(c, b.tonic, b.mode, tuning, 0, 12), tuning, orientation: /** @type {any} */ (settings.value.orientation), german: german() });
    scaleLine.textContent = `Ноты лада: ${scaleNames(b.tonic, b.mode, german()).join(' ')}. Тусклые на грифе — ноты лада, яркие — ноты текущего аккорда: в них хорошо приземлять фразы.`;
  };
  d.add(backing.watch(() => { drawProgs(); drawCustom(); drawChords(); }));
  d.add(current.watch(drawChords));
  d.add(settings.watch(drawChords));

  // ---------- темп, грув, дорожки ----------
  const bpmOut = h('output', { class: 'mono meter' });
  d.add(bindText(bpmOut, backing, b => String(b.bpm)));
  const tempo = h('div', { class: 'stepper', role: 'group', 'aria-label': 'Темп' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Медленнее', onclick: () => setBacking({ bpm: clampBpm(backing.value.bpm - 5) }) }, '−'),
    bpmOut, h('span', { class: 'muted' }, 'BPM'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Быстрее', onclick: () => setBacking({ bpm: clampBpm(backing.value.bpm + 5) }) }, '+'));
  const grooveSeg = segmented({ label: 'Грув', name: 'groove', options: GROOVES.map(g => [g.id, g.name]), sig: field('groove'), onchange: v => setBacking({ groove: v }) });
  const grooveHint = h('p', { class: 'muted note' });
  d.add(bindText(grooveHint, backing, b => GROOVES.find(g => g.id === b.groove)?.hint || ''));
  const mixer = h('div', { class: 'mixer' }, ...TRACKS.map(([k, name]) => {
    const onBtn = h('button', { type: 'button', class: 'chip-btn', role: 'switch', dataset: { track: k }, onclick: () => setBacking({ tracks: { ...backing.value.tracks, [k]: { ...backing.value.tracks[k], on: !backing.value.tracks[k].on } } }) }, name);
    const vol = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: backing.value.tracks[k].vol, 'aria-label': `Громкость: ${name}`,
      oninput: e => setBacking({ tracks: { ...backing.value.tracks, [k]: { ...backing.value.tracks[k], vol: Number(e.target.value) } } }) }));
    d.add(backing.watch(b => onBtn.setAttribute('aria-checked', String(b.tracks[k].on))));
    return h('div', { class: 'mix-row' }, onBtn, vol);
  }));

  const startBtn = button({ kind: 'primary', icon: 'playFill', label: 'Играть', onclick: () => toggle(), attrs: { 'data-action': 'start' } });
  d.add(running.watch(on => { startBtn.querySelector('span').textContent = on ? 'Стоп' : 'Играть'; startBtn.replaceChild(icon(on ? 'stopFill' : 'playFill', 20), startBtn.querySelector('svg')); }));
  const onKey = e => { if (e.code === 'Space' && !e.defaultPrevented && !/^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); toggle(); } };
  document.addEventListener('keydown', onKey);
  d.add(() => document.removeEventListener('keydown', onKey));

  const el = h('div', { class: 'screen tool backing' },
    screenHeader({ eyebrow: 'Играть', title: 'Подложка', back: r.query.from === 'today' ? '#/today' : '#/play' }),
    h('div', { class: 'row' }, keySel, modeSel),
    progSeg, custom,
    chordRow, bigChord,
    card({ cls: 'neckcard' }, fb.el, scaleLine),
    h('div', { class: 'row center' }, tempo),
    h('div', { class: 'setting' }, h('b', null, 'Грув'), grooveSeg, grooveHint),
    h('div', { class: 'setting' }, h('b', null, 'Дорожки'), mixer),
    h('div', { class: 'cta-sticky' }, startBtn),
    stepBar(r, d));
  requestAnimationFrame(() => fb.scrollTo(5));
  return { el, title: 'Подложка', dispose: () => d.dispose() };
}
