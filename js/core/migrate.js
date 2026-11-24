// migrate.js — перенос данных из «Гитарного круга» (версии 2). Чистая логика: на вход — данные старого
// приложения (ключи без префикса gk3.) и текущие данные «Лада», на выход — что записать и понятный отчёт.
//
// Правила:
//  • старые данные только читаются — ничего не удаляется и не меняется;
//  • перенос ничего не уменьшает: рекорды — большее из двух, риффы и история — добавляются, без дублей;
//  • настройки инструментов (метроном, тест ритма, подложка, тюнер) переносятся, только если в «Ладе» их ещё
//    не настраивал; общие настройки (строй, нотация, подписи) — по желанию;
//  • повторный перенос ничего не задваивает.
import { normalizeRiff } from './riff.js';
import { normalizeMetronome, EXERCISES } from './metronome.js';
import { mergeV2EarBest, v2EarPrefs } from './earquiz.js';
import { logTempo } from './progress.js';
import { isDay } from './dates.js';

export const V2_PREFIX = 'gk3.';
export const V2_APP = 'gitarnyy-krug';
const KEY_RE = /^[A-Za-z0-9_.-]{1,48}$/;
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const arr = v => (Array.isArray(v) ? v : []);
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

/**
 * Файл резервной копии «Гитарного круга» (gitarnyy-krug-ГГГГ-ММ-ДД.json, формат 1)
 * @param {string} text
 * @returns {{ ok: true, data: Record<string, any>, created: string | null } | { ok: false, error: string }}
 */
export function parseV2Backup(text) {
  let o;
  try { o = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return { ok: false, error: 'Это не файл резервной копии: внутри не JSON.' }; }
  if (!obj(o)) return { ok: false, error: 'Это не файл резервной копии.' };
  if (o.app === 'lad') return { ok: false, error: 'Это копия «Лада» — её открывает «Восстановить из файла».' };
  if (o.app !== V2_APP) return { ok: false, error: 'Это файл не от «Гитарного круга».' };
  if (!Number.isInteger(o.format) || o.format < 1) return { ok: false, error: 'Файл повреждён: нет версии формата.' };
  if (o.format > 1) return { ok: false, error: 'Копия сделана более новой версией «Гитарного круга» — такой формат пока не знаком.' };
  if (!obj(o.data)) return { ok: false, error: 'Файл повреждён: нет данных.' };
  if (Object.keys(o.data).some(k => !KEY_RE.test(k))) return { ok: false, error: 'Файл повреждён: непонятные записи.' };
  const created = typeof o.created === 'string' && !Number.isNaN(Date.parse(o.created)) ? o.created : null;
  return { ok: true, data: o.data, created };
}

/** Что есть в данных «Гитарного круга» — для предложения перенести */
export function summarizeV2(d = {}) {
  const records = EXERCISES.filter(e => { const r = obj(obj(d.records)?.[e.id]); return r && (r.best || r.target); }).length;
  const ear = Object.values(obj(d.earBest) || {}).filter(n => Number(n) > 0).length;
  return { riffs: arr(d.riffs).length, records, rhythmTests: arr(d.rhythmHist).length, ear, settings: !!obj(d.settings), any: Object.keys(d || {}).length > 0 };
}
export function describeV2(s) {
  const parts = [];
  if (s.riffs) parts.push(`${s.riffs} ${plural(s.riffs, 'рифф', 'риффа', 'риффов')}`);
  if (s.records) parts.push(`${s.records} ${plural(s.records, 'рекорд', 'рекорда', 'рекордов')} упражнений`);
  if (s.rhythmTests) parts.push(`${s.rhythmTests} ${plural(s.rhythmTests, 'тест', 'теста', 'тестов')} ритма`);
  if (s.ear) parts.push(`рекорды слуха (${s.ear})`);
  if (s.settings) parts.push('настройки');
  return parts.join(' · ') || 'почти ничего';
}

// ---------- по ключам ----------
/** Рифф «Гитарного круга»: ноты { c, s, f, len } по столбцам + списки pm, acc → события по шагам */
export function v2Riff(r) {
  const o = obj(r) || {};
  const byStep = new Map();
  for (const n of arr(o.notes)) {
    if (!n || !Number.isFinite(n.c)) continue;
    const e = byStep.get(n.c) || { step: n.c, notes: [], len: 1 };
    e.notes.push({ string: n.s, fret: n.f });
    e.len = Math.max(e.len, Number(n.len) || 1);
    byStep.set(n.c, e);
  }
  const pm = new Set(arr(o.pm)), acc = new Set(arr(o.acc));
  const LENS = [1, 2, 3, 4, 6, 8, 12, 16];
  const events = [...byStep.values()].map(e => ({ ...e, len: [...LENS].reverse().find(l => l <= e.len) || 1, pm: pm.has(e.step), acc: acc.has(e.step) }));
  const id = `gk${String(o.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 14)}`;
  return normalizeRiff({ id, name: o.name, tuning: o.tuning, bpm: o.bpm, bars: o.bars, events });
}

const V2_RHYTHM_MODES = { q: 'quarters', e: 'eighths', and: 'offbeats', gaps: 'gaps', fig: 'figures' };
const V2_INPUT = { touch: 'tap', key: 'tap', guitar: 'mic', mic: 'mic' };
/** Попытка теста ритма: мс → секунды, «ГГГГ-ММ-ДД ЧЧ:ММ» → ISO */
export function v2RhythmEntry(h) {
  const o = obj(h);
  if (!o || typeof o.d !== 'string' || !isDay(o.d.slice(0, 10))) return null;
  const mean = Number(o.mean), sd = Number(o.sd);
  if (!Number.isFinite(mean) || !Number.isFinite(sd)) return null;
  return { date: `${o.d.slice(0, 10)}T${(o.d.slice(11, 16) || '12:00')}:00`, mode: V2_RHYTHM_MODES[o.mode] || 'quarters', input: V2_INPUT[o.inp] || 'tap',
    bpm: Number(o.bpm) || 80, mean: mean / 1000, sd: sd / 1000, score: Number(o.score) || 0, grade: '', missed: Number(o.miss) || 0, v2: true };
}

const V2_SUBS = { none: 'quarter', eighths: 'eighth', triplets: 'triplet', sixteenths: 'sixteenth', sextuplets: 'sextuplet', swing: 'swing', gallop: 'gallop', revgallop: 'reverseGallop' };
export function v2Metronome(m) {
  const o = obj(m) || {};
  const [num, unit] = String(o.meter || '4/4').split('/').map(Number);
  const tr = obj(o.trainer), gaps = obj(o.gaps);
  return normalizeMetronome({
    bpm: o.bpm, beats: o.num || num, unit, accents: o.accents, sub: V2_SUBS[o.sub] || 'eighth', sound: o.sound,
    rhythm: o.rhythm, countIn: o.countIn ? 1 : 0, randomDrop: (Number(o.drop) || 0) / 100,
    gap: gaps?.on ? { play: Number(gaps.play) || 2, mute: Number(gaps.mute) || 2 } : null,
    trainer: tr?.on ? { step: Number(tr.step) || 4, every: Number(tr.every) || 4, max: Number(tr.to) || 120 } : null,
  });
}

const V2_GROOVES = { rock: 'rock', halftime: 'half', metal: 'gallop', shuffle: 'shuffle', ballad: 'ballad' };
export function v2Backing(b) {
  const o = obj(b) || {};
  const vol = obj(o.vol) || {}, mute = obj(o.mute) || {};
  const track = k => ({ on: !mute[k], vol: Number.isFinite(Number(vol[k])) ? Number(vol[k]) : 0.8 });
  return {
    tonic: Number(o.tonic) || 0, mode: o.minor === false ? 'ionian' : 'aeolian',
    prog: o.useCustom ? 'custom' : o.prog === 'mblues' ? 'ivv' : o.prog,
    custom: arr(o.custom).map(c => ({ degree: Number(c?.d) || 0, bars: Number(c?.bars) || 1 })),
    groove: V2_GROOVES[o.groove] || 'rock', bpm: o.bpm,
    tracks: { drums: track('drums'), bass: track('bass'), guitar: track('guitar') },
  };
}

/** @param {any} s @param {Record<string, any>} [mine] */
export function v2Settings(s, mine = {}) {
  const o = obj(s) || {};
  const out = /** @type {Record<string, any>} */ ({ ...(mine || {}) });
  if (o.tuning === 'std' || o.tuning === 'dropd') out.tuning = o.tuning;
  if (o.tone === 'clean' || o.tone === 'dist') out.tone = o.tone;
  if (typeof o.german === 'boolean') out.notation = o.german ? 'german' : 'english';
  if (o.labels === 'notes' || o.labels === 'degrees') out.labels = o.labels;
  if (o.orient === 'h') out.orientation = 'horizontal';
  if (o.orient === 'v') out.orientation = 'vertical';
  if (Number.isFinite(Number(o.volume)) && o.volume != null) out.volume = Math.min(1, Math.max(0, Number(o.volume)));
  return out;
}

/**
 * Перенос целиком
 * @param {Record<string, any>} v2 данные «Гитарного круга» (ключи без префикса)
 * @param {Record<string, any>} mine текущие данные «Лада»
 * @param {{ settings?: boolean, day?: string, source?: 'storage' | 'file' }} [o]
 * @returns {{ patch: Record<string, any>, report: string[] }}
 */
export function fromV2(v2, mine = {}, { settings = true, day = '', source = 'storage' } = {}) {
  const d = obj(v2) || {};
  /** @type {Record<string, any>} */
  const patch = {};
  const report = [];

  // риффы — добавляются, без дублей
  const myRiffs = arr(mine.riffs);
  const have = new Set(myRiffs.map(r => r?.id));
  const newRiffs = arr(d.riffs).map(v2Riff).filter(r => r.events.length && !have.has(r.id));
  if (newRiffs.length) { patch.riffs = [...myRiffs, ...newRiffs]; report.push(`Риффы: +${newRiffs.length}`); }

  // рекорды упражнений и история темпа
  const recs = obj(d.records);
  if (recs) {
    const out = { ...(obj(mine.records) || {}) };
    let tempoLog = obj(mine.tempoLog) || {};
    let n = 0;
    for (const e of EXERCISES) {
      const r = obj(recs[e.id]);
      if (!r) continue;
      const cur = out[e.id] || { bpm: e.start, streak: 0, best: 0 };
      const best = Math.max(cur.best || 0, Number(r.best) || 0);
      out[e.id] = { bpm: Math.max(cur.bpm || 0, Number(r.target) || 0, e.start), streak: cur.streak || 0, best };
      for (const h of arr(r.history)) if (isDay(h?.d) && Number(h.bpm) > 0) tempoLog = logTempo(tempoLog, e.id, h.d, Number(h.bpm));
      n++;
    }
    const same = JSON.stringify(out) === JSON.stringify(obj(mine.records) || {}) && JSON.stringify(tempoLog) === JSON.stringify(obj(mine.tempoLog) || {});
    if (n && !same) { patch.records = out; patch.tempoLog = tempoLog; report.push(`Рекорды упражнений: ${n}`); }
  }

  // история теста ритма — добавляется, без дублей
  const hist = arr(d.rhythmHist).map(v2RhythmEntry).filter(Boolean);
  if (hist.length) {
    const mineH = arr(mine.rhythmHist);
    const key = h => `${String(h.date).slice(0, 16)}|${h.score}|${h.mode}`;
    const seen = new Set(mineH.map(key));
    const add = hist.filter(h => !seen.has(key(h)));
    if (add.length) {
      patch.rhythmHist = [...mineH, ...add].sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1)).slice(-200);
      report.push(`Тест ритма: +${add.length} ${plural(add.length, 'попытка', 'попытки', 'попыток')}`);
    }
  }

  // настройки теста ритма и калибровка — если своих нет
  const rh = obj(d.rhythm);
  if (rh) {
    const m = obj(mine.rhythm) || {};
    const next = { ...m };
    if (!('mode' in m) && V2_RHYTHM_MODES[rh.mode]) next.mode = V2_RHYTHM_MODES[rh.mode];
    if (!('bpm' in m) && Number(rh.bpm) > 0) next.bpm = Number(rh.bpm);
    if (!('input' in m) && V2_INPUT[rh.input]) next.input = V2_INPUT[rh.input];
    if (!('tapLatency' in m) && Number.isFinite(Number(rh.latency)) && rh.latency) next.tapLatency = Number(rh.latency);
    if (!('micLatency' in m) && Number.isFinite(Number(rh.latencyMic)) && rh.latencyMic != null) next.micLatency = Number(rh.latencyMic);
    if (Object.keys(next).length > Object.keys(m).length) { patch.rhythm = next; report.push('Тест ритма: настройки и калибровка'); }
  }

  // слух
  if (obj(d.earBest)) {
    const best = mergeV2EarBest(d.earBest, obj(mine.earBest) || {});
    if (JSON.stringify(best) !== JSON.stringify(obj(mine.earBest) || {})) { patch.earBest = best; report.push('Рекорды слуха'); }
  }
  if (obj(d.ear)) {
    const prefs = v2EarPrefs(d.ear), m = obj(mine.ear) || {};
    const next = { ...m };
    for (const [k, v] of Object.entries(prefs)) if (!m[k]) next[k] = v;
    if (Object.keys(next).length > Object.keys(m).length) { patch.ear = next; report.push('Настройки квизов слуха'); }
  }

  // инструменты — если в «Ладе» ещё не настраивал
  if (obj(d.metro) && !mine.metro) { patch.metro = v2Metronome(d.metro); report.push('Метроном: настройки'); }
  if (obj(d.backing) && !mine.backing) { patch.backing = v2Backing(d.backing); report.push('Подложка: тональность, последовательность, грув'); }
  if (obj(d.tuner) && !mine.tuner && Number(d.tuner.a4) >= 430 && Number(d.tuner.a4) <= 450) { patch.tuner = { a4: Number(d.tuner.a4), mode: 'auto' }; report.push(`Тюнер: A4 = ${d.tuner.a4} Гц`); }
  if (settings && obj(d.settings)) {
    const next = v2Settings(d.settings, obj(mine.settings) || {});
    if (JSON.stringify(next) !== JSON.stringify(obj(mine.settings) || {})) { patch.settings = next; report.push('Настройки: строй, нотация, подписи'); }
  }
  if (obj(d.plan) && Object.values(d.plan).some(Boolean)) report.push('План на 4 недели теперь — учебная дорожка: она сама видит, что уже получилось');

  patch.migratedV2 = { day, source, report };
  return { patch, report };
}
