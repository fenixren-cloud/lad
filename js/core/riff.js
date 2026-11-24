// riff.js — рифф: ноты по сетке шестнадцатых, таб текстом (туда и обратно), ссылка на рифф, свои заготовки.
// Чистая логика. Только собственные риффы — никаких табов реальных песен.
import { mod12, noteName, spellPc } from './notes.js';
import { TUNINGS, MAX_FRET } from './neck.js';

export const STEPS_PER_BAR = 16;
/** @type {[string, string][]} длительности в шестнадцатых */
export const LENGTHS = [['1', '1/16'], ['2', '1/8'], ['4', '1/4'], ['8', '1/2']];

/**
 * @typedef {{ string: number, fret: number }} RiffNote
 * @typedef {{ step: number, notes: RiffNote[], len: number, pm?: boolean, acc?: boolean }} RiffEvent
 * @typedef {{ v: 1, id: string, name: string, tuning: 'std' | 'dropd', bpm: number, bars: number, events: RiffEvent[] }} Riff
 */

export const newId = () => Math.random().toString(36).slice(2, 10);
/** @returns {Riff} */
export const emptyRiff = (tuning = 'std') => normalizeRiff({ name: 'Мой рифф', tuning, bpm: 100, bars: 1, events: [] });

/**
 * Привести рифф к правильному виду (из хранилища, текста, ссылки)
 * @returns {Riff}
 */
export function normalizeRiff(src) {
  const r = src && typeof src === 'object' ? src : {};
  const bars = Math.min(4, Math.max(1, Math.round(Number(r.bars) || 1)));
  const total = bars * STEPS_PER_BAR;
  const events = (Array.isArray(r.events) ? r.events : []).map(e => ({
    step: Math.round(Number(e.step)),
    notes: (Array.isArray(e.notes) ? e.notes : []).map(n => ({ string: Math.round(Number(n.string)), fret: Math.round(Number(n.fret)) }))
      .filter(n => n.string >= 0 && n.string <= 5 && n.fret >= 0 && n.fret <= MAX_FRET)
      .filter((n, i, a) => a.findIndex(x => x.string === n.string) === i)
      .sort((a, b) => a.string - b.string),
    len: [1, 2, 3, 4, 6, 8, 12, 16].includes(Number(e.len)) ? Number(e.len) : 1,
    pm: !!e.pm, acc: !!e.acc,
  })).filter(e => e.step >= 0 && e.step < total && e.notes.length)
    .sort((a, b) => a.step - b.step)
    .filter((e, i, a) => i === 0 || a[i - 1].step !== e.step);
  return {
    v: /** @type {1} */ (1), id: typeof r.id === 'string' && r.id ? r.id.slice(0, 16) : newId(),
    name: String(r.name || 'Мой рифф').slice(0, 60), tuning: /** @type {'std' | 'dropd'} */ (r.tuning === 'dropd' ? 'dropd' : 'std'),
    bpm: Math.min(300, Math.max(30, Math.round(Number(r.bpm) || 100))), bars, events,
  };
}

/** Поставить ноту (струна, лад) в шаг: на той же струне заменяет; остальное сохраняет */
export function setNote(riff, step, string, fret, len = 2) {
  const events = riff.events.filter(e => e.step !== step);
  const old = riff.events.find(e => e.step === step);
  const notes = [...(old ? old.notes.filter(n => n.string !== string) : []), { string, fret }].sort((a, b) => a.string - b.string);
  events.push({ step, notes, len: old ? old.len : len, pm: old?.pm, acc: old?.acc });
  return normalizeRiff({ ...riff, events });
}
/** Изменить свойства шага (длительность, PM, акцент) */
export function patchStep(riff, step, patch) {
  return normalizeRiff({ ...riff, events: riff.events.map(e => (e.step === step ? { ...e, ...patch } : e)) });
}
/** Убрать ноту струны из шага (или весь шаг, если string = null) — пауза */
export function clearNote(riff, step, string = null) {
  return normalizeRiff({ ...riff, events: riff.events.map(e => (e.step !== step ? e : { ...e, notes: string == null ? [] : e.notes.filter(n => n.string !== string) })) });
}

/** Ноты с высотами для проигрывания: [{ step, midis, len, pm, acc }] */
export function playable(riff) {
  const tuning = TUNINGS[riff.tuning].midi;
  return riff.events.map(e => ({ step: e.step, midis: e.notes.map(n => tuning[n.string] + n.fret), len: e.len, pm: !!e.pm, acc: !!e.acc }));
}

// ---------- таб текстом ----------
const W = 3; // ширина колонки шестнадцатой
/**
 * Таб текстом: шапка, строки PM и акцентов, 6 струн от 1-й к 6-й. Каждая шестнадцатая — 3 символа.
 * @param {Riff} riff @param {{ german?: boolean }} [o]
 */
export function toTabText(riff, { german = false } = {}) {
  const tuning = TUNINGS[riff.tuning].midi, total = riff.bars * STEPS_PER_BAR;
  const names = tuning.map((m, s) => { const n = noteName(spellPc(mod12(m)), { german }); return s === 5 ? n.toLowerCase() : n; });
  const cell = (txt, fill) => (txt + fill.repeat(W)).slice(0, W);
  const at = new Map(riff.events.map(e => [e.step, e]));
  const lines = [];
  lines.push(`# ${riff.name} · ${riff.bpm} BPM · ${TUNINGS[riff.tuning].name} · ${riff.bars} ${riff.bars === 1 ? 'такт' : 'такта'}`);
  let pm = '  |', acc = '  |';
  for (let st = 0; st < total; st++) { const e = at.get(st); pm += cell(e?.pm ? 'PM' : '', ' '); acc += cell(e?.acc ? '>' : '', ' '); if (st % STEPS_PER_BAR === STEPS_PER_BAR - 1) { pm += '|'; acc += '|'; } }
  lines.push(pm.trimEnd(), acc.trimEnd());
  for (let s = 5; s >= 0; s--) {
    let line = `${names[s].padEnd(2)}|`;
    for (let st = 0; st < total; st++) {
      const e = at.get(st), n = e?.notes.find(x => x.string === s);
      line += cell(n ? String(n.fret) : '-', '-');
      if (st % STEPS_PER_BAR === STEPS_PER_BAR - 1) line += '|';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Обратно из текста (тот же формат). Длительность ноты — до следующей ноты (не больше половинной).
 * @returns {Riff | null}
 */
export function fromTabText(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const head = lines.find(l => l.startsWith('#')) || '';
  const strings = lines.filter(l => /^[A-Ha-h][♯♭#b]?\s?\|/.test(l));
  if (strings.length !== 6) return null;
  const strip = l => l.slice(l.indexOf('|') + 1).replace(/\|/g, '');
  const pmLine = lines.find((l, i) => l.startsWith('  |') && lines.indexOf(l) === i && /PM/.test(l));
  const accLine = lines.find(l => l.startsWith('  |') && />/.test(l));
  const cols = strip(strings[0]).length / W;
  if (!Number.isInteger(cols) || cols < STEPS_PER_BAR) return null;
  const events = [];
  for (let st = 0; st < cols; st++) {
    const notes = [];
    strings.forEach((l, k) => { const t = strip(l).slice(st * W, st * W + W).replace(/-/g, '').trim(); if (/^\d+$/.test(t)) notes.push({ string: 5 - k, fret: Number(t) }); });
    if (!notes.length) continue;
    const pm = pmLine ? strip(pmLine).slice(st * W, st * W + W).includes('PM') : false;
    const acc = accLine ? strip(accLine).slice(st * W, st * W + W).includes('>') : false;
    events.push({ step: st, notes, len: 1, pm, acc });
  }
  events.forEach((e, i) => { const next = events[i + 1]?.step ?? cols; e.len = [8, 6, 4, 3, 2, 1].find(x => x <= next - e.step) || 1; });
  const m = head.match(/^#\s*(.*?)\s*·\s*(\d+)\s*BPM\s*·\s*(Standard E|Drop D)/);
  return normalizeRiff({ name: m ? m[1] : 'Рифф из текста', bpm: m ? Number(m[2]) : 100, tuning: m && m[3] === 'Drop D' ? 'dropd' : 'std', bars: Math.ceil(cols / STEPS_PER_BAR), events });
}

// ---------- ссылка на рифф: без сервера, всё в адресе ----------
const toB64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
/** Рифф → короткая строка для адреса (#/play/riffs?riff=…) */
export function encodeRiff(riff) {
  const r = normalizeRiff(riff);
  return toB64url(JSON.stringify([r.name, r.tuning === 'dropd' ? 1 : 0, r.bpm, r.bars, r.events.map(e => [e.step, e.len, (e.pm ? 1 : 0) | (e.acc ? 2 : 0), ...e.notes.flatMap(n => [n.string, n.fret])])]));
}
/** Строка из адреса → рифф (или null, если строка испорчена) */
export function decodeRiff(code) {
  try {
    const [name, dropd, bpm, bars, evs] = JSON.parse(fromB64url(String(code)));
    const events = evs.map(([step, len, flags, ...nf]) => ({ step, len, pm: !!(flags & 1), acc: !!(flags & 2), notes: Array.from({ length: nf.length / 2 }, (_, i) => ({ string: nf[2 * i], fret: nf[2 * i + 1] })) }));
    return normalizeRiff({ name, tuning: dropd ? 'dropd' : 'std', bpm, bars, events });
  } catch {
    return null;
  }
}

// ---------- 4 собственные заготовки ----------
const ev = (step, len, notes, extra = {}) => ({ step, len, notes: notes.map(([string, fret]) => ({ string, fret })), ...extra });
const p5 = (f, dropd = true) => (dropd ? [[0, f], [1, f], [2, f]] : [[0, f], [1, f + 2]]);
/** @type {Riff[]} */
export const PRESETS = [
  normalizeRiff({ id: 'preset-gallop', name: 'Ре-галоп', tuning: 'dropd', bpm: 120, bars: 2, events: [
    ...[0, 4, 8].flatMap(b => [ev(b, 2, [[0, 0]], { pm: true, acc: b === 0 }), ev(b + 2, 1, [[0, 0]], { pm: true }), ev(b + 3, 1, [[0, 0]], { pm: true })]),
    ev(12, 2, p5(3), { acc: true }), ev(14, 2, p5(5)),
    ...[16, 20, 24].flatMap(b => [ev(b, 2, [[0, 0]], { pm: true, acc: b === 16 }), ev(b + 2, 1, [[0, 0]], { pm: true }), ev(b + 3, 1, [[0, 0]], { pm: true })]),
    ev(28, 2, p5(5), { acc: true }), ev(30, 2, p5(3)),
  ] }),
  normalizeRiff({ id: 'preset-phryg', name: 'Фригийская тень', tuning: 'dropd', bpm: 96, bars: 1, events: [
    ev(0, 2, [[0, 0]], { pm: true, acc: true }), ev(2, 2, [[0, 0]], { pm: true }), ev(4, 4, p5(1), { acc: true }),
    ev(8, 2, [[0, 0]], { pm: true }), ev(10, 2, [[0, 0]], { pm: true }), ev(12, 2, p5(1)), ev(14, 2, p5(0)),
  ] }),
  normalizeRiff({ id: 'preset-boogie', name: 'Буги в E', tuning: 'std', bpm: 110, bars: 1, events: [
    ev(0, 2, [[0, 0], [1, 2]], { acc: true }), ev(2, 2, [[0, 0], [1, 2]]), ev(4, 2, [[0, 0], [1, 4]]), ev(6, 2, [[0, 0], [1, 4]]),
    ev(8, 2, [[0, 0], [1, 5]]), ev(10, 2, [[0, 0], [1, 5]]), ev(12, 2, [[0, 0], [1, 4]]), ev(14, 2, [[0, 0], [1, 4]]),
  ] }),
  normalizeRiff({ id: 'preset-penta', name: 'Линейка вверх (ля минор)', tuning: 'std', bpm: 90, bars: 1, events: [
    ev(0, 2, [[0, 5]], { acc: true }), ev(2, 2, [[0, 8]]), ev(4, 2, [[1, 5]]), ev(6, 2, [[1, 7]]),
    ev(8, 2, [[2, 5]]), ev(10, 2, [[2, 7]]), ev(12, 4, [[3, 5]], { acc: true }),
  ] }),
];
export { p5 };
