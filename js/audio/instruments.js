// instruments.js — гитара (чистый звук или перегруз) и бас на общей шине движка.
import { getAudio, unlockAudio } from './engine.js';
import { createSampler } from './sampler.js';
import { GUITAR_SAMPLES, BASS_SAMPLES } from '../core/instrument.js';
import { settings } from '../app/state.js';

/** Кривая перегруза: мягкое ограничение tanh — «ламповый» характер без резких щелчков */
function driveCurve(amount = 18, n = 2048) {
  const curve = new Float32Array(n);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / norm;
  }
  return curve;
}

/**
 * Тракт гитары: чистый канал и перегруз параллельно, переключаются громкостью.
 * Перегруз: срез низа → WaveShaper (с передискретизацией) → «кабинет» — фильтры, которые
 * срезают жужжащий верх и ровняют середину, как динамик гитарного кабинета.
 * @param {AudioContext} ctx @param {AudioNode} out
 */
function createGuitarTone(ctx, out) {
  const input = ctx.createGain();
  const clean = ctx.createGain();
  const dist = ctx.createGain();
  input.connect(clean);
  clean.connect(out);

  const pre = ctx.createBiquadFilter();
  pre.type = 'highpass';
  pre.frequency.value = 110;
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve();
  shaper.oversample = '4x';
  const cabLow = ctx.createBiquadFilter();
  cabLow.type = 'lowpass';
  cabLow.frequency.value = 4600;
  cabLow.Q.value = 0.7;
  const cabMid = ctx.createBiquadFilter();
  cabMid.type = 'peaking';
  cabMid.frequency.value = 900;
  cabMid.Q.value = 0.9;
  cabMid.gain.value = 3;
  const cabHigh = ctx.createBiquadFilter();
  cabHigh.type = 'highpass';
  cabHigh.frequency.value = 80;
  const drive = ctx.createGain();
  drive.gain.value = 3;
  input.connect(pre);
  pre.connect(drive);
  drive.connect(shaper);
  shaper.connect(cabHigh);
  cabHigh.connect(cabMid);
  cabMid.connect(cabLow);
  cabLow.connect(dist);
  dist.connect(out);

  /** @param {'clean' | 'dist'} tone */
  function setTone(tone) {
    const t = ctx.currentTime;
    clean.gain.setTargetAtTime(tone === 'clean' ? 1 : 0, t, 0.02);
    dist.gain.setTargetAtTime(tone === 'dist' ? 0.32 : 0, t, 0.02);
  }
  setTone('clean');
  return { input, setTone };
}

let cache = null;
/** Гитара и бас (создаются при первом обращении; null — если звука нет). Звук и громкость следуют настройкам. */
export function getInstruments() {
  if (cache) return cache;
  const a = getAudio();
  if (!a) return null;
  const tone = createGuitarTone(a.ctx, a.master);
  const guitar = createSampler(a.ctx, { dir: 'samples/guitar', map: GUITAR_SAMPLES, output: tone.input, gain: 0.9 });
  const bass = createSampler(a.ctx, { dir: 'samples/bass', map: BASS_SAMPLES, output: a.master, gain: 0.8 });
  cache = { ctx: a.ctx, guitar, bass, setTone: tone.setTone, load: () => Promise.all([guitar.load(), bass.load()]),
    /** вход гитарного тракта (чистый/перегруз) — для своих шин с громкостью */
    guitarInput: tone.input, bassOutput: a.master };
  settings.watch(s => {
    tone.setTone(/** @type {'clean' | 'dist'} */ (s.tone));
    a.master.gain.setTargetAtTime(s.volume, a.ctx.currentTime, 0.02);
  });
  return cache;
}

/** @type {Promise<any> | null} */
let preparing = null;
/**
 * Разбудить звук (из обработчика нажатия), загрузить сэмплы и сообщить, как дела.
 * @param {(msg: string) => void} [onStatus]
 */
export async function prepareInstruments(onStatus = () => {}) {
  await unlockAudio();
  const inst = getInstruments();
  if (!inst) {
    onStatus('Без звука: этот браузер не умеет Web Audio. Всё остальное работает.');
    return null;
  }
  if (!inst.guitar.loaded || !inst.bass.loaded) {
    onStatus('Загружаю сэмплы…');
    preparing ??= inst.load().catch(err => { preparing = null; throw err; });
    try {
      await preparing;
    } catch (err) {
      console.error(err);
      onStatus('Сэмплы не загрузились. Проверь интернет и попробуй ещё раз.');
      return null;
    }
  }
  return inst;
}
