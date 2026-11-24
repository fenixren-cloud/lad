// riffplayer.js — проигрывание риффа через общий транспорт: с барабанами, замедлением 50–100 %, повтором,
// бегущим курсором. Встаёт в сетку уже играющего метронома или подложки.
import { signal } from '../core/signal.js';
import { STEPS_PER_BAR, playable } from '../core/riff.js';
import { grooveAt } from '../core/backing.js';
import { unlockAudio } from './engine.js';
import { prepareInstruments } from './instruments.js';
import { join, leave } from './hub.js';
import { playVoice } from './percussion.js';
import { loadDrumKit } from './drumkit.js';
import { hitGain } from '../core/drums.js';
import { heardAt } from './latency.js';
import { nowPlaying } from '../app/state.js';
import { setMediaSession } from '../app/media.js';

export const playing = signal(false);
/** Шаг под курсором (−1 — стоит) — меняется в момент, когда шаг слышно */
export const cursor = signal(-1);

let drumsBus = null;
/**
 * @param {import('../core/riff.js').Riff} riff
 * @param {{ speed?: number, loop?: boolean, drums?: boolean }} [o]
 */
export async function playRiff(riff, { speed = 1, loop = true, drums = true } = {}) {
  stopRiff();
  const a = await unlockAudio();
  if (!a) return false;
  const [inst] = await Promise.all([prepareInstruments(), drums ? loadDrumKit(a.ctx) : null]);
  if (!inst) return false;
  if (!drumsBus) { drumsBus = a.ctx.createGain(); drumsBus.gain.value = 0.7; drumsBus.connect(a.master); }
  const bpm = Math.max(30, Math.round(riff.bpm * speed));
  const total = riff.bars * STEPS_PER_BAR, events = new Map(playable(riff).map(e => [e.step, e]));
  const sixteenth = 60 / bpm / 4;
  let startBar = 0, ended = false;
  const j = join('riff', evs => {
    for (const e of evs) {
      const bar = e.bar - startBar;
      if (bar < 0 || e.late || e.sub % 3) continue;
      const step = bar * STEPS_PER_BAR + e.beat * 4 + e.sub / 3;
      if (!loop && step >= total) { if (!ended) { ended = true; setTimeout(stopRiff, Math.max(0, (e.time - a.ctx.currentTime) * 1000)); } continue; }
      const s = step % total;
      if (drums) for (const v of grooveAt('rock', e.beat, e.sub, bar).drums) playVoice(a.ctx, drumsBus, v, 'drums', e.time, 0.8 * hitGain(v, e.sub));
      const n = events.get(s);
      if (n) inst.guitar.strum(n.midis, e.time, { velocity: n.acc ? 1 : n.pm ? 0.6 : 0.8, duration: n.pm ? Math.min(0.1, n.len * sixteenth) : n.len * sixteenth * 0.95, gap: n.midis.length > 1 ? 0.012 : 0.02 });
      setTimeout(() => { if (playing.value) cursor.value = s; }, Math.max(0, (e.time - heardAt(a.ctx, performance.now())) * 1000));
    }
  }, { bpm, beatsPerBar: 4 });
  if (!j) return false;
  startBar = j.startBar;
  playing.value = true;
  nowPlaying.value = { title: `Рифф · ${riff.name}`, detail: `${bpm} BPM${speed < 1 ? ` (${Math.round(speed * 100)} %)` : ''}`, href: '#/play/riffs', stop: stopRiff };
  setMediaSession({ title: `Рифф · ${riff.name}`, detail: `${bpm} BPM`, onStop: stopRiff });
  return true;
}

export function stopRiff() {
  if (!playing.value) return;
  leave('riff');
  playing.value = false;
  cursor.value = -1;
  if (nowPlaying.value?.href === '#/play/riffs') nowPlaying.value = null;
  setMediaSession(null);
}
