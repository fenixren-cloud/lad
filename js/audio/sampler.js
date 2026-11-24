// sampler.js — инструмент на записанных сэмплах: нота, удар медиатором по аккорду, заглушить.
// Новый звук глушит предыдущий (как ладонь на струнах), если не попросить иначе.
import { pickSample, strumTimes, firstSoundIndex } from '../core/instrument.js';
import { loadBytes } from './assets.js';
import { markSounding } from './engine.js';

const RELEASE = 0.06; // затухание при глушении, с

/**
 * @param {AudioContext} ctx
 * @param {{ dir: string, map: Record<number, string>, output: AudioNode, gain?: number }} opts
 */
export function createSampler(ctx, { dir, map, output, gain = 1 }) {
  /** @type {Map<number, { buffer: AudioBuffer, offset: number }>} */
  const buffers = new Map();
  /** @type {Promise<void> | null} */
  let loading = null;
  /** @typedef {{ src: AudioBufferSourceNode, amp: GainNode, stopAt: number }} Voice */
  /** @type {Set<Voice>} */
  const voices = new Set();
  const bus = ctx.createGain();
  bus.gain.value = gain;
  bus.connect(output);

  /** Загрузить и разобрать все сэмплы (один раз) */
  function load() {
    loading ??= Promise.all(Object.entries(map).map(async ([m, name]) => {
      const buffer = await ctx.decodeAudioData(await loadBytes(`${dir}/${name}.mp3`));
      // тишину в начале записи пропускаем, оставив 2 мс до атаки
      const first = firstSoundIndex(buffer.getChannelData(0));
      const offset = Math.max(0, first - Math.round(0.002 * buffer.sampleRate)) / buffer.sampleRate;
      buffers.set(Number(m), { buffer, offset });
    })).then(() => undefined);
    return loading;
  }

  /** @param {Voice} v @param {number} at */
  function stopVoice(v, at) {
    const t = Math.max(at, ctx.currentTime);
    if (t + RELEASE >= v.stopAt) return;
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setTargetAtTime(0, t, RELEASE / 4);
    v.src.stop(t + RELEASE);
    v.stopAt = t + RELEASE;
  }

  /** Заглушить всё, что звучит, к моменту at */
  function choke(at = ctx.currentTime) {
    for (const v of voices) stopVoice(v, at);
  }

  /**
   * Сыграть ноту.
   * @param {number} midi
   * @param {number} [when]
   * @param {{ velocity?: number, duration?: number | null, choke?: boolean, dest?: AudioNode }} [opts] dest — своя шина (дорожка подложки)
   */
  function play(midi, when = ctx.currentTime, { velocity = 0.9, duration = null, choke: chokeOthers = false, dest = null } = {}) {
    const pick = pickSample(midi, map);
    const b = buffers.get(pick.sampleMidi);
    if (!b) return null;
    if (chokeOthers) choke(when);
    const src = ctx.createBufferSource();
    src.buffer = b.buffer;
    src.playbackRate.value = pick.rate;
    const amp = ctx.createGain();
    amp.gain.value = velocity;
    src.connect(amp);
    amp.connect(dest || bus);
    src.start(Math.max(when, ctx.currentTime), b.offset);
    /** @type {Voice} */
    const voice = { src, amp, stopAt: Infinity };
    voices.add(voice);
    src.onended = () => { voices.delete(voice); amp.disconnect(); };
    if (duration != null) stopVoice(voice, when + duration);
    markSounding(when + (duration ?? 1.5) + RELEASE);
    return voice;
  }

  /**
   * Удар медиатором по аккорду: струны с шагом ~20 мс, предыдущий звук глушится.
   * @param {number[]} midis от толстой струны к тонкой
   */
  function strum(midis, when = ctx.currentTime, { gap = 0.02, up = false, velocity = 0.8, duration = null, dest = null } = {}) {
    choke(when);
    const times = strumTimes(midis.length, when, { gap, up });
    midis.forEach((m, i) => play(m, times[i], { velocity, duration, dest }));
  }

  return { load, play, strum, choke, get loaded() { return buffers.size === Object.keys(map).length; }, get voices() { return voices.size; } };
}
