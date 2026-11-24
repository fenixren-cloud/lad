// riffs.js — риффы и табы: редактор по сетке шестнадцатых (1–4 такта), длительности, паузы, PM, акценты;
// ввод касанием грифа или номером лада; проигрывание с барабанами, замедление 50–100 %, повтор, бегущий курсор;
// сохранённые риффы и 4 собственные заготовки; таб текстом (копировать/вставить), файлом (скачать, поделиться,
// открыть) и ссылкой (рифф целиком в адресе — без сервера).
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHeader, segmented, card, button } from '../ui/components.js';
import { createFretboard } from '../ui/fretboard.js';
import { signal, disposer } from '../core/signal.js';
import { STEPS_PER_BAR, LENGTHS, emptyRiff, normalizeRiff, setNote, patchStep, clearNote, toTabText, fromTabText, encodeRiff, decodeRiff, PRESETS, newId } from '../core/riff.js';
import { TUNINGS } from '../core/neck.js';
import { noteName, spellPc, mod12 } from '../core/notes.js';
import { clampBpm } from '../core/tempo.js';
import { playRiff, stopRiff, playing, cursor } from '../audio/riffplayer.js';
import { prepareInstruments } from '../audio/instruments.js';
import { store } from '../app/store.js';
import { settings } from '../app/state.js';
import { stepBar } from './step.js';

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const d = disposer();
  const german = () => settings.value.notation === 'german';
  const fromLink = r.query.riff ? decodeRiff(r.query.riff) : null;
  const riff = signal(fromLink || normalizeRiff(store().get('riffDraft') || { ...emptyRiff(settings.value.tuning) }));
  const sel = signal({ step: 0, string: 0 });
  const opts = signal({ speed: 1, loop: true, drums: true, ...store().get('riffOpts', {}) });
  const msg = h('p', { class: 'status muted', 'aria-live': 'polite' });
  const say = t => { msg.textContent = t; };
  const commit = next => { riff.value = next; store().set('riffDraft', next); };
  if (fromLink) say(`Открыт рифф по ссылке: «${fromLink.name}». Сохрани его, если нравится.`);

  // ---------- параметры риффа ----------
  const name = /** @type {HTMLInputElement} */ (h('input', { class: 'input-select name-input', 'aria-label': 'Название риффа', maxlength: '60', oninput: () => commit({ ...riff.value, name: name.value || 'Без названия' }) }));
  const field = key => ({ get value() { return String(riff.value[key]); }, watch: fn => riff.watch(v => fn(String(v[key]))) });
  const bpmOut = h('output', { class: 'mono meter' });
  const params = h('div', { class: 'row center' },
    segmented({ label: 'Строй', name: 'riff-tuning', options: [['std', 'Standard E'], ['dropd', 'Drop D']], sig: field('tuning'), onchange: v => commit(normalizeRiff({ ...riff.value, tuning: v })) }),
    h('div', { class: 'stepper', role: 'group', 'aria-label': 'Темп' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Медленнее', onclick: () => commit({ ...riff.value, bpm: clampBpm(riff.value.bpm - 5) }) }, '−'), bpmOut,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Быстрее', onclick: () => commit({ ...riff.value, bpm: clampBpm(riff.value.bpm + 5) }) }, '+')),
    segmented({ label: 'Тактов', name: 'riff-bars', options: [['1', '1 такт'], ['2', '2'], ['3', '3'], ['4', '4']], sig: field('bars'), onchange: v => commit(normalizeRiff({ ...riff.value, bars: Number(v) })) }));

  // ---------- сетка: 6 струн × шестнадцатые ----------
  const grid = h('div', { class: 'tabgrid', role: 'grid', 'aria-label': 'Таб: струны и шестнадцатые' });
  const gridWrap = h('div', { class: 'tabgrid-wrap' }, grid);
  const stringNames = () => TUNINGS[riff.value.tuning].midi.map((m, s) => { const n = noteName(spellPc(mod12(m)), { german: german() }); return s === 5 ? n.toLowerCase() : n; });
  const drawGrid = () => {
    const rf = riff.value, total = rf.bars * STEPS_PER_BAR, at = new Map(rf.events.map(e => [e.step, e])), names = stringNames();
    grid.style.setProperty('--cols', String(total));
    const cells = [h('span', { class: 'tg-corner' })];
    for (let st = 0; st < total; st++) {
      const e = at.get(st);
      cells.push(h('span', { class: `tg-mark${st % 4 === 0 ? ' tg-beat' : ''}`, dataset: { col: String(st) } }, e?.pm ? 'PM' : e?.acc ? '>' : st % 4 === 0 ? String(st / 4 % 4 + 1) : ''));
    }
    for (let s = 5; s >= 0; s--) {
      cells.push(h('span', { class: 'tg-name' }, names[s]));
      for (let st = 0; st < total; st++) {
        const n = at.get(st)?.notes.find(x => x.string === s);
        const on = sel.value.step === st && sel.value.string === s;
        const b = h('button', { type: 'button', role: 'gridcell', class: `tg-cell${on ? ' sel' : ''}${sel.value.step === st ? ' col' : ''}${st % STEPS_PER_BAR === 0 ? ' bar' : ''}${n ? ' has' : ''}`,
          dataset: { step: String(st), string: String(s) }, 'aria-label': `${6 - s}-я струна, шестнадцатая ${st + 1}${n ? `: лад ${n.fret}` : ''}` }, n ? String(n.fret) : '');
        b.addEventListener('click', () => { sel.value = { step: st, string: s }; });
        cells.push(b);
      }
    }
    grid.replaceChildren(...cells);
  };
  const markCursor = c => grid.querySelectorAll('.tg-mark').forEach(m => m.classList.toggle('play', Number(/** @type {HTMLElement} */ (m).dataset.col) === c));

  // ---------- шаг: длительность, PM, акцент, пауза ----------
  const stepEvent = () => riff.value.events.find(e => e.step === sel.value.step);
  const lenSig = { get value() { return String(stepEvent()?.len ?? 2); }, watch: fn => { const a = riff.watch(() => fn(lenSig.value)), b = sel.watch(() => fn(lenSig.value)); return () => { a(); b(); }; } };
  const pmBtn = h('button', { type: 'button', class: 'chip-btn', role: 'switch', 'data-action': 'pm', onclick: () => { const e = stepEvent(); if (e) commit(patchStep(riff.value, e.step, { pm: !e.pm })); } }, 'PM');
  const accBtn = h('button', { type: 'button', class: 'chip-btn', role: 'switch', 'data-action': 'acc', onclick: () => { const e = stepEvent(); if (e) commit(patchStep(riff.value, e.step, { acc: !e.acc })); } }, 'Акцент >');
  const tools = h('div', { class: 'step-tools' },
    segmented({ label: 'Длительность', name: 'len', options: LENGTHS, sig: lenSig, onchange: v => { const e = stepEvent(); if (e) commit(patchStep(riff.value, e.step, { len: Number(v) })); } }),
    pmBtn, accBtn,
    h('button', { type: 'button', class: 'chip-btn', 'data-action': 'rest', onclick: () => { commit(clearNote(riff.value, sel.value.step)); advance(1); } }, 'Пауза'));
  const pad = h('div', { class: 'numpad', role: 'group', 'aria-label': 'Лад для выбранной струны' },
    ...Array.from({ length: 16 }, (_, f) => h('button', { type: 'button', class: 'chip-btn', dataset: { fret: String(f) }, onclick: () => put(sel.value.string, f) }, String(f))),
    h('button', { type: 'button', class: 'chip-btn', 'aria-label': 'Убрать ноту', onclick: () => commit(clearNote(riff.value, sel.value.step, sel.value.string)) }, '⌫'));
  function advance(by) {
    const total = riff.value.bars * STEPS_PER_BAR;
    sel.value = { ...sel.value, step: (sel.value.step + by) % total };
  }
  async function put(string, fret) {
    const len = stepEvent()?.len ?? Number(lenSig.value) ?? 2;
    commit(setNote(riff.value, sel.value.step, string, fret, len));
    sel.value = { ...sel.value, string };
    const inst = await prepareInstruments();
    inst?.guitar.play(TUNINGS[riff.value.tuning].midi[string] + fret, undefined, { choke: true, duration: 0.6 });
    advance(len);
  }
  const fb = createFretboard({ tuning: TUNINGS[riff.value.tuning].midi, from: 0, to: 12, interactive: true, orientation: /** @type {any} */ (settings.value.orientation), german: german(), onTap: put, label: 'Гриф: нажми на место, чтобы поставить ноту' });

  // ---------- синхронизация ----------
  d.add(riff.watch(rf => {
    if (document.activeElement !== name) name.value = rf.name;
    bpmOut.textContent = String(rf.bpm);
    const e = stepEvent();
    pmBtn.setAttribute('aria-checked', String(!!e?.pm));
    accBtn.setAttribute('aria-checked', String(!!e?.acc));
    drawGrid();
    fb.update({ tuning: TUNINGS[rf.tuning].midi, german: german(), markers: (e?.notes || []).map(n => ({ string: n.string, fret: n.fret, label: String(n.fret), role: 'root' })) });
  }));
  d.add(sel.watch(() => { const e = stepEvent(); pmBtn.setAttribute('aria-checked', String(!!e?.pm)); accBtn.setAttribute('aria-checked', String(!!e?.acc)); drawGrid(); fb.update({ markers: (e?.notes || []).map(n => ({ string: n.string, fret: n.fret, label: String(n.fret), role: 'root' })) }); }));
  d.add(cursor.watch(markCursor));
  d.add(settings.watch(() => { fb.update({ orientation: /** @type {any} */ (settings.value.orientation), german: german() }); drawGrid(); }));

  // ---------- проигрывание ----------
  const setOpt = patch => { opts.value = { ...opts.value, ...patch }; store().set('riffOpts', opts.value); };
  const playBtn = button({ kind: 'primary', icon: 'playFill', label: 'Играть', attrs: { 'data-action': 'play' }, onclick: () => (playing.value ? stopRiff() : playRiff(riff.value, opts.value)) });
  d.add(playing.watch(on => { playBtn.querySelector('span').textContent = on ? 'Стоп' : 'Играть'; playBtn.replaceChild(icon(on ? 'stopFill' : 'playFill', 20), playBtn.querySelector('svg')); }));
  const playOpts = h('div', { class: 'row center' },
    segmented({ label: 'Скорость', name: 'speed', options: [['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %']], sig: { get value() { return String(opts.value.speed); }, watch: fn => opts.watch(o => fn(String(o.speed))) }, onchange: v => setOpt({ speed: Number(v) }) }),
    h('button', { type: 'button', class: 'chip-btn', role: 'switch', 'aria-checked': String(opts.value.loop), 'data-action': 'loop', onclick: e => { setOpt({ loop: !opts.value.loop }); /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-checked', String(opts.value.loop)); } }, 'Повтор'),
    h('button', { type: 'button', class: 'chip-btn', role: 'switch', 'aria-checked': String(opts.value.drums), 'data-action': 'drums', onclick: e => { setOpt({ drums: !opts.value.drums }); /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-checked', String(opts.value.drums)); } }, 'Барабаны'));

  // ---------- мои риффы и заготовки ----------
  const saved = signal(/** @type {any[]} */ (store().get('riffs', [])));
  const list = h('div', { class: 'list' });
  const open = rf => { stopRiff(); commit(normalizeRiff(rf)); sel.value = { step: 0, string: 0 }; say(`Открыт «${rf.name}».`); };
  const drawList = () => list.replaceChildren(
    ...saved.value.map(rf => h('div', { class: 'hist-row' },
      h('button', { type: 'button', class: 'row-text link-like', onclick: () => open(rf) }, h('b', null, rf.name), h('span', { class: 'muted' }, `${TUNINGS[rf.tuning].name} · ${rf.bpm} BPM · ${rf.bars} т.`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Удалить «${rf.name}»`, onclick: () => { if (confirm(`Удалить рифф «${rf.name}»?`)) { saved.value = saved.value.filter(x => x.id !== rf.id); store().set('riffs', saved.value); } } }, '×'))),
    h('p', { class: 'eyebrow pad' }, 'Заготовки'),
    ...PRESETS.map(p => h('div', { class: 'hist-row' }, h('button', { type: 'button', class: 'row-text link-like', dataset: { preset: p.id }, onclick: () => open({ ...p, id: newId() }) }, h('b', null, p.name), h('span', { class: 'muted' }, `${TUNINGS[p.tuning].name} · ${p.bpm} BPM`)))));
  d.add(saved.watch(drawList));
  const saveRiff = () => {
    const rf = riff.value, rest = saved.value.filter(x => x.id !== rf.id);
    saved.value = [rf, ...rest].slice(0, 100);
    store().set('riffs', saved.value);
    say(`Сохранено: «${rf.name}».`);
  };

  // ---------- таб текстом, файлом, ссылкой ----------
  const text = () => toTabText(riff.value, { german: german() });
  const link = () => `${location.href.split('#')[0]}#/play/riffs?riff=${encodeRiff(riff.value)}`;
  const copy = async (t, done) => { try { await navigator.clipboard.writeText(t); say(done); } catch { say('Не получилось скопировать — браузер не разрешил.'); } };
  const fileName = () => `${riff.value.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'riff'}.txt`;
  const download = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([text() + '\n'], { type: 'text/plain' })), download: fileName() });
    document.body.append(a); a.click(); a.remove();
    say(`Скачан файл ${fileName()}.`);
  };
  const share = async () => {
    const nav = /** @type {any} */ (navigator);
    const file = new File([text() + '\n'], fileName(), { type: 'text/plain' });
    try {
      if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: riff.value.name });
      else if (nav.share) await nav.share({ title: riff.value.name, text: text(), url: link() });
      else return copy(link(), 'Ссылка на рифф скопирована.');
    } catch { /* отменили — ничего страшного */ }
  };
  const loadText = t => { const rf = fromTabText(t); if (!rf) { say('Не похоже на таб «Лада»: нужны 6 строк струн с «|».'); return; } open(rf); };
  const fileIn = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.txt,text/plain', class: 'sr-only', id: 'riff-file', onchange: async () => { const f = fileIn.files?.[0]; fileIn.value = ''; if (f) loadText(await f.text()); } }));
  const pasteBox = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'paste', rows: '8', 'aria-label': 'Вставь таб текстом', placeholder: 'Вставь сюда таб «Лада» текстом' }));
  const pasteWrap = h('div', { class: 'stack', hidden: true }, pasteBox, button({ kind: 'ghost', label: 'Открыть этот таб', onclick: () => { loadText(pasteBox.value); pasteWrap.hidden = true; } }));

  const el = h('div', { class: 'screen tool riffs' },
    screenHeader({ eyebrow: 'Играть', title: 'Риффы и табы', back: r.query.from === 'today' ? '#/today' : '#/play' }),
    name, params,
    gridWrap, tools, pad,
    card({ cls: 'neckcard' }, fb.el, h('p', { class: 'muted note' }, 'Выбери клетку в табе, потом нажми на место на грифе или номер лада — нота встанет, курсор шагнёт дальше.')),
    playOpts,
    h('div', { class: 'cta-sticky' }, playBtn),
    msg,
    h('div', { class: 'row' },
      button({ kind: 'ghost', icon: 'download', label: 'Сохранить', onclick: saveRiff, attrs: { 'data-action': 'save' } }),
      button({ kind: 'ghost', label: 'Новый', onclick: () => open({ ...emptyRiff(settings.value.tuning) }), attrs: { 'data-action': 'new' } })),
    card({ title: 'Поделиться', id: 'riff-share' },
      h('div', { class: 'row' },
        button({ kind: 'ghost', label: 'Копировать таб', onclick: () => copy(text(), 'Таб скопирован текстом.'), attrs: { 'data-action': 'copy' } }),
        button({ kind: 'ghost', label: 'Вставить таб', onclick: () => { pasteWrap.hidden = !pasteWrap.hidden; pasteBox.focus(); }, attrs: { 'data-action': 'paste' } }),
        button({ kind: 'ghost', label: 'Ссылка', onclick: () => copy(link(), 'Ссылка скопирована: в ней весь рифф — открой на другом устройстве.'), attrs: { 'data-action': 'link' } }),
        button({ kind: 'ghost', label: 'Скачать .txt', onclick: download, attrs: { 'data-action': 'download' } }),
        button({ kind: 'ghost', label: 'Поделиться…', onclick: share, attrs: { 'data-action': 'share' } }),
        h('label', { class: 'btn btn-ghost', for: 'riff-file', tabindex: '0', role: 'button', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } } }, 'Открыть файл…'),
        fileIn),
      pasteWrap),
    card({ title: 'Мои риффы', id: 'riff-list', cls: 'flush-list' }, list),
    stepBar(r, d));
  return { el, title: 'Риффы и табы', dispose: () => { d.dispose(); } };
}
