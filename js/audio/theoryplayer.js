// theoryplayer.js — примеры теории: ноты, интервалы, аккорды и гаммы по очереди через общий транспорт.
// Если играет метроном или подложка — пример встаёт в их сетку со следующего такта, а не останавливает их.
// Бурдон для ладов: тоника басом и «пустая» квинта гитарой, пока не выключишь — над ним слышно характер лада.
import { signal } from '../core/signal.js';
import { PPQ } from '../core/transport.js';
import { bassMidi } from '../core/backing.js';
import { unlockAudio } from './engine.js';
import { prepareInstruments } from './instruments.js';
import { join, leave, hubClock } from './hub.js';
import { heardAt } from './latency.js';
import { nowPlaying } from '../app/state.js';
import { setMediaSession } from '../app/media.js';

/** Что играет сейчас: { title } или null */
export const example = signal(/** @type {null | { title: string }} */ (null));
/** Бурдон: { title, rootPc } или null */
export const drone = signal(/** @type {null | { title: string, rootPc: number }} */ (null));

let seqToken = 0;
let shown = false; // показан ли пример в мини-плеере и шторке (тихие фразы квизов — нет)
const timers = new Set();
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, ms)); timers.add(id); };

/**
 * Сыграть пример. items — по очереди: ноты (вместе, или «медиатором» при strum) и длительность в долях;
 * dur — сколько долей нота звучит (короче beats — пауза после неё: так приложение быстрее замолкает
 * и микрофон снова слушает игру). Пустой notes — пауза.
 * onStep(i) зовётся, когда i-й элемент слышно (−1 — конец), чтобы подсветить его на грифе и круге.
 * quiet — без мини-плеера и шторки (короткие фразы квизов «Слуха»: плеер на 2 секунды только мешает).
 * @param {{ notes: { midi: number }[], beats: number, dur?: number, strum?: boolean }[]} items
 * @param {{ title?: string, bpm?: number, loop?: boolean, onStep?: (i: number) => void, href?: string, quiet?: boolean }} [o]
 * @returns {Promise<boolean>}
 */
export async function playExample(items, { title = 'Пример', bpm = 90, loop = false, onStep = () => {}, href = location.hash, quiet = false } = {}) {
  stopExample();
  const my = ++seqToken;
  const a = await unlockAudio();
  if (!a) return false;
  const inst = await prepareInstruments();
  if (!inst || my !== seqToken || !items.length) return false;
  const starts = [];
  let acc = 0;
  for (const it of items) { starts.push(Math.round(acc * PPQ)); acc += it.beats; }
  const total = Math.max(1, Math.round(acc * PPQ));
  let first = null, ended = false, startBar = 0;
  const j = join('example', evs => {
    if (my !== seqToken) return;
    const c = hubClock(), spb = c ? 60 / c.transport.bpm : 60 / bpm;
    for (const e of evs) {
      if (e.bar < startBar) continue;
      first ??= e.tick;
      let rel = e.tick - first;
      if (loop) rel %= total;
      else if (rel >= total) {
        if (!ended) { ended = true; later(() => { if (my === seqToken) { onStep(-1); stopExample(); } }, (e.time - a.ctx.currentTime) * 1000 + 150); }
        continue;
      }
      const i = starts.indexOf(rel);
      if (i < 0 || e.late) continue;
      const it = items[i], dur = (it.dur ?? it.beats) * spb;
      const midis = it.notes.map(n => n.midi);
      if (it.strum) inst.guitar.strum(midis, e.time, { velocity: 0.75, duration: dur * 0.97 });
      else midis.forEach((m, k) => inst.guitar.play(m, e.time, { velocity: 0.8, duration: Math.max(0.12, dur * 0.95), choke: k === 0 && midis.length === 1 }));
      later(() => { if (my === seqToken) onStep(i); }, (e.time - heardAt(a.ctx, performance.now())) * 1000);
    }
  }, { bpm });
  if (!j) return false;
  startBar = j.startBar;
  example.value = { title };
  shown = !quiet;
  if (quiet) return true;
  nowPlaying.value = { title: `Теория · ${title}`, detail: loop ? 'по кругу' : `${items.length} ${items.length === 1 ? 'звук' : 'звуков'}`, href, stop: stopExample };
  setMediaSession({ title: `Теория · ${title}`, detail: 'пример', onStop: stopExample });
  return true;
}

export function stopExample() {
  seqToken++;
  for (const id of timers) clearTimeout(id);
  timers.clear();
  if (!example.value) return;
  leave('example');
  example.value = null;
  if (!shown) return;
  shown = false;
  if (nowPlaying.value?.title?.startsWith('Теория ·')) nowPlaying.value = null;
  setMediaSession(null);
}

/**
 * Бурдон: каждые 2 такта — тоника басом и тоника с квинтой и октавой гитарой (тихо). Выключается повторным вызовом.
 * @param {number} rootPc @param {{ title?: string, href?: string }} [o]
 */
export async function startDrone(rootPc, { title = 'Бурдон', href = location.hash } = {}) {
  stopDrone();
  const a = await unlockAudio();
  if (!a) return false;
  const inst = await prepareInstruments();
  if (!inst) return false;
  const bass = bassMidi(rootPc, 'root'), gtr = 40 + ((rootPc - 4 + 12) % 12);
  let startBar = 0;
  const j = join('drone', evs => {
    const c = hubClock(), bar = c ? (60 / c.transport.bpm) * c.transport.beatsPerBar : 2.4;
    for (const e of evs) {
      if (e.late || e.bar < startBar || e.beat !== 0 || e.sub !== 0 || (e.bar - startBar) % 2) continue;
      inst.bass.play(bass, e.time, { velocity: 0.75, duration: bar * 2.02 });
      inst.guitar.strum([gtr, gtr + 7, gtr + 12], e.time, { velocity: 0.45, duration: bar * 2.02, gap: 0.03 });
    }
  }, { bpm: 60, beatsPerBar: 4 });
  if (!j) return false;
  startBar = j.startBar;
  drone.value = { title, rootPc };
  nowPlaying.value = { title: `Бурдон · ${title}`, detail: 'импровизируй поверх', href, stop: stopDrone };
  setMediaSession({ title: `Бурдон · ${title}`, detail: 'импровизируй поверх', onStop: stopDrone });
  return true;
}

export function stopDrone() {
  if (!drone.value) return;
  leave('drone');
  drone.value = null;
  if (nowPlaying.value?.title?.startsWith('Бурдон ·')) nowPlaying.value = null;
  setMediaSession(null);
  getInstrumentsChoke();
}
function getInstrumentsChoke() {
  prepareInstruments().then(i => { i?.bass.choke(); i?.guitar.choke(); }).catch(() => {});
}
