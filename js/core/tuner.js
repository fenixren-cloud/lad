// tuner.js — логика тюнера: какая струна, на сколько центов, когда струна «настроена». Чистая логика.
import { freqToMidi, median } from './pitch.js';

export const A4_MIN = 430;
export const A4_MAX = 450;
export const IN_TUNE_CENTS = 5; // зелёная зона ±5 центов
export const HOLD_READINGS = 10; // ≈ 0,4 с подряд в строю — только тогда «настроена» (не на одной атаке)

/**
 * Разобрать одно измерение. tuning — MIDI открытых струн (0 = 6-я); lock — номер струны или null (автовыбор).
 * Струна выбирается ближайшая, но не дальше трёх с половиной полутонов: дальше — это уже не «почти эта струна».
 * @returns {null | { freq: number, midi: number, note: number, cents: number, string: number | null, target: number | null, stringCents: number | null, inTune: boolean }}
 */
export function analyzeReading(freq, { a4 = 440, tuning = [40, 45, 50, 55, 59, 64], lock = null } = {}) {
  if (!freq || !(freq > 0)) return null;
  const m = freqToMidi(freq, a4);
  const note = Math.round(m);
  const cents = (m - note) * 100;
  let string = lock;
  if (string == null) {
    let best = 0;
    for (let s = 1; s < tuning.length; s++) if (Math.abs(m - tuning[s]) < Math.abs(m - tuning[best])) best = s;
    string = Math.abs(m - tuning[best]) <= 3.5 ? best : null;
  }
  const target = string == null ? null : tuning[string];
  const stringCents = target == null ? null : (m - target) * 100;
  return { freq, midi: m, note, cents, string, target, stringCents, inTune: target != null && note === target && Math.abs(cents) <= IN_TUNE_CENTS };
}

/**
 * Сглаживание стрелки: медиана последних N измерений одной ноты; новая нота — начинаем заново.
 * @param {number} [n]
 */
export function createSmoother(n = 5) {
  let hist = [];
  return {
    /** @param {number | null} midi */
    push(midi) {
      if (midi == null) return null;
      if (hist.length && Math.abs(midi - median(hist)) > 0.5) hist = [];
      hist.push(midi);
      if (hist.length > n) hist.shift();
      return median(hist);
    },
    reset() { hist = []; },
  };
}

/**
 * «Настроена»: струна держится в зелёной зоне HOLD_READINGS измерений подряд.
 * Отметки копятся по струнам — видно, какие уже готовы.
 */
export function createTunedTracker(hold = HOLD_READINGS) {
  let streakString = null, streak = 0;
  const done = new Set();
  return {
    /** @param {ReturnType<typeof analyzeReading>} r @returns {number | null} струна, которая только что стала «настроенной» */
    push(r) {
      if (!r || !r.inTune || r.string == null) { streak = 0; streakString = null; return null; }
      if (r.string !== streakString) { streakString = r.string; streak = 0; }
      streak++;
      if (streak === hold && !done.has(r.string)) { done.add(r.string); return r.string; }
      return null;
    },
    /** насколько близко к отметке (0..1) — для заполняющегося кольца */
    get progress() { return Math.min(1, streak / hold); },
    get tuned() { return new Set(done); },
    reset() { done.clear(); streak = 0; streakString = null; },
  };
}
