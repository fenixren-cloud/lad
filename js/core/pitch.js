// pitch.js — определение высоты звука (тюнер, ответы игрой, перекличка). Чистая логика.
//
// Алгоритм YIN: ищем период — сдвиг, при котором сигнал сильнее всего похож сам на себя.
// Для гитары это надёжнее спектра: у низких струн обертоны громче основного тона.
//  1. разностная функция d(τ) = Σ (x[i] − x[i+τ])²;
//  2. нормировка накопленным средним — убирает ложный ноль при τ = 0;
//  3. первый провал ниже порога — основной период (кратные периоды проваливаются позже);
//  4. параболическое уточнение между отсчётами — точность до долей цента.
//
// ВАЖНО: функции ниже самодостаточны (без внешних переменных и импортов): их текст через toString()
// вставляется в AudioWorklet — отдельный звуковой поток, который не видит модулей приложения.
// Так один и тот же код проверяется в Node и работает в браузере, в том числе в офлайн-файле.

/**
 * @param {{ sampleRate: number, minFreq?: number, maxFreq?: number, threshold?: number, minRms?: number }} opts
 */
export function createPitchDetector({ sampleRate, minFreq = 60, maxFreq = 1400, threshold = 0.12, minRms = 0.003 }) {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.ceil(sampleRate / minFreq);
  const win = Math.ceil(tauMax * 1.6); // окно сравнения длиннее самого длинного периода
  const need = win + tauMax + 2; // столько последних отсчётов нужно на одно измерение
  const d = new Float32Array(tauMax + 2);

  /**
   * @param {Float32Array} buf последние отсчёты (берутся последние need)
   * @returns {{ freq: number | null, clarity: number, rms: number }}
   */
  function detect(buf) {
    const off = buf.length - need;
    if (off < 0) return { freq: null, clarity: 0, rms: 0 };
    let energy = 0;
    for (let i = 0; i < need; i++) { const x = buf[off + i]; energy += x * x; }
    const rms = Math.sqrt(energy / need);
    if (rms < minRms) return { freq: null, clarity: 0, rms };
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let s = 0;
      for (let i = 0; i < win; i++) { const x = buf[off + i] - buf[off + i + tau]; s += x * x; }
      d[tau] = s;
    }
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) { running += d[tau]; d[tau] = running > 0 ? (d[tau] * tau) / running : 1; }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      // чёткого провала нет: берём самый глубокий, если он достаточно глубок
      let best = tauMin;
      for (let t = tauMin; t <= tauMax; t++) if (d[t] < d[best]) best = t;
      if (d[best] > 0.3) return { freq: null, clarity: 1 - d[best], rms };
      tau = best;
    }
    if (tau <= tauMin || tau >= tauMax) return { freq: null, clarity: 1 - d[tau], rms };
    const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a + c - 2 * b;
    const shift = den > 0 ? (0.5 * (a - c)) / den : 0;
    return { freq: sampleRate / (tau + shift), clarity: 1 - b, rms };
  }
  return { detect, need, tauMin, tauMax };
}

/**
 * Понижение частоты дискретизации вдвое (среднее пар): вчетверо меньше вычислений, гитаре хватает.
 * @param {Float32Array} input @param {Float32Array} [out]
 */
export function decimate2(input, out = new Float32Array(input.length >> 1)) {
  for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = 0.5 * (input[i] + input[i + 1]);
  return out;
}

/** Частота → дробный MIDI-номер */
export const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);
/** Медиана массива чисел */
export function median(values) {
  const s = [...values].sort((x, y) => x - y), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}
