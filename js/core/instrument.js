// instrument.js — чистая логика сэмплера: какой сэмпл взять для ноты и с какой скоростью,
// когда звучат струны при ударе медиатором, где в записи начинается звук.

/** Сэмплы электрогитары: MIDI → имя файла. Cs2 нет нарочно (в нём громче 3-я гармоника): D2 и D♯2 берутся из E2. */
export const GUITAR_SAMPLES = Object.freeze({
  40: 'E2', 42: 'Fs2', 45: 'A2', 48: 'C3', 51: 'Ds3', 54: 'Fs3', 57: 'A3', 60: 'C4',
  63: 'Ds4', 66: 'Fs4', 69: 'A4', 72: 'C5', 75: 'Ds5', 78: 'Fs5', 81: 'A5', 84: 'C6',
});
/** Сэмплы бас-гитары (обрезаны до 3,2 с с затуханием) */
export const BASS_SAMPLES = Object.freeze({
  25: 'Cs1', 28: 'E1', 31: 'G1', 34: 'As1', 37: 'Cs2', 40: 'E2', 43: 'G2', 46: 'As2', 49: 'Cs3',
});

/**
 * Ближайший сэмпл и скорость воспроизведения для нужной высоты.
 * При равном расстоянии берём сэмпл выше и опускаем его: так звук естественнее.
 * @param {number} midi @param {Record<number, string>} map
 */
export function pickSample(midi, map) {
  let best = null;
  for (const key of Object.keys(map)) {
    const m = Number(key), d = Math.abs(midi - m);
    if (!best || d < best.d || (d === best.d && m > best.sampleMidi)) best = { sampleMidi: m, d };
  }
  if (!best) throw new Error('Пустой набор сэмплов');
  return { sampleMidi: best.sampleMidi, name: map[best.sampleMidi], rate: 2 ** ((midi - best.sampleMidi) / 12) };
}

/**
 * Удар медиатором: струны звучат не разом, а с шагом ~20 мс. Удар вниз — от толстой струны к тонкой.
 * @param {number} count сколько струн @param {number} when @param {{ gap?: number, up?: boolean }} [opts]
 */
export function strumTimes(count, when, { gap = 0.02, up = false } = {}) {
  return Array.from({ length: count }, (_, i) => when + (up ? count - 1 - i : i) * gap);
}

/**
 * Индекс первого отсчёта, где начинается звук (в начале сэмплов ~12 мс тишины).
 * @param {ArrayLike<number>} samples @param {number} [threshold]
 */
export function firstSoundIndex(samples, threshold = 0.004) {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > threshold) return i;
  return 0;
}
