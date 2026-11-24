// percussion.js — звуки метронома и барабанов. Барабаны, «палочки» и «колокол» — записанные удары (drumkit.js);
// клик, дерево и бип — синтез. Пока записи не загрузились (или не загрузились вовсе), барабаны тоже синтез.
// В режиме «слушаю игру» клик высокий (5 кГц): детектор ударов слушает полосу до 1,2 кГц и его не услышит.
import { DRUM_KIT, metroDrum, SYNTH_STANDIN } from '../core/drums.js';
import { playDrum } from './drumkit.js';

/** @type {WeakMap<BaseAudioContext, AudioBuffer>} */
const noiseCache = new WeakMap();
function noise(ctx) {
  if (!noiseCache.has(ctx)) {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 2147483648) - 1; }
    noiseCache.set(ctx, b);
  }
  return /** @type {AudioBuffer} */ (noiseCache.get(ctx));
}

function env(ctx, out, t, gain, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay / 3);
  g.connect(out);
  return g;
}
function tone(ctx, out, t, freq, gain, attack, decay, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(env(ctx, out, t, gain, attack, decay));
  o.start(t);
  o.stop(t + attack + decay * 2 + 0.05);
  return o;
}
function hiss(ctx, out, t, gain, decay, type, freq, q = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f);
  f.connect(env(ctx, out, t, gain, 0.001, decay));
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay * 2 + 0.05);
}

/**
 * Сыграть голос метронома или барабанов в момент t.
 * voice: accent, beat, sub (клик) или голос барабанов (k, s, h, hs, c, r… — см. core/drums.js);
 * sound: click, wood, beep, sticks, bell, drums; high — режим «слушаю игру»: клик 5 кГц.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {string} voice
 * @param {string} sound
 * @param {number} t
 * @param {number} [gain]
 * @param {boolean} [high]
 */
export function playVoice(ctx, out, voice, sound, t, gain = 1, high = false) {
  const drum = voice in DRUM_KIT;
  if (high && !drum) {
    tone(ctx, out, t, voice === 'sub' ? 4500 : 5000, gain * (voice === 'sub' ? 0.25 : 0.45), 0.001, 0.015);
    return;
  }
  if (drum) {
    if (playDrum(ctx, out, voice, t, gain)) return;
  } else {
    const m = metroDrum(sound, voice); // «Палочки» и «Колокол» — записанные удары
    if (m && playDrum(ctx, out, m[0], t, gain * m[1])) return;
  }
  const v = SYNTH_STANDIN[voice] || voice;
  switch (v) {
    case 'k': { // бочка: синус со спадом высоты + щелчок колотушки
      const o = tone(ctx, out, t, 150, gain * 0.95, 0.002, 0.28);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      hiss(ctx, out, t, gain * 0.12, 0.01, 'bandpass', 2500, 1);
      return;
    }
    case 's': // малый: шум (пружины) + тело 190 Гц
      hiss(ctx, out, t, gain * 0.5, 0.14, 'highpass', 1200);
      tone(ctx, out, t, 190, gain * 0.35, 0.001, 0.07, 'triangle');
      return;
    case 'h':
    case 'hs':
      hiss(ctx, out, t, gain * (v === 'hs' ? 0.16 : 0.28), v === 'hs' ? 0.025 : 0.04, 'highpass', 7000);
      return;
  }
  const level = voice === 'accent' ? 2 : voice === 'beat' ? 1 : 0;
  if (sound === 'beep' || sound === 'bell') {
    tone(ctx, out, t, [990, 1320, 1760][level], gain * [0.22, 0.35, 0.45][level], 0.002, 0.07);
  } else if (sound === 'wood' || sound === 'sticks') {
    hiss(ctx, out, t, gain * [0.5, 0.8, 1][level], 0.03, 'bandpass', [1600, 1100, 1400][level], 9);
    tone(ctx, out, t, [1000, 820, 1050][level], gain * [0.12, 0.2, 0.25][level], 0.001, 0.025);
  } else { // click
    hiss(ctx, out, t, gain * [0.35, 0.6, 0.8][level], 0.008, 'bandpass', [3000, 2400, 3200][level], 1.5);
    tone(ctx, out, t, [1500, 1800, 2400][level], gain * [0.12, 0.2, 0.3][level], 0.0005, 0.012);
  }
}
