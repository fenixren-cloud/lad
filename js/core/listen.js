// listen.js — «играй, приложение слушает»: из потока измерений высоты (~25 в секунду) делает отдельные
// сыгранные ноты и сравнивает их с ответом. Чистая логика.

/**
 * Нота засчитывается, когда несколько измерений подряд совпали (±35 центов): шум атаки не даёт ложных нот.
 * Та же нота ещё раз — только после паузы (звук затих) или нового удара (громкость резко выросла).
 * @param {{ a4?: number, stable?: number, spread?: number, minRms?: number, retrigger?: number, gap?: number }} [opts]
 */
export function createNoteListener({ a4 = 440, stable = 3, spread = 35, minRms = 0.006, retrigger = 1.8, gap = 2 } = {}) {
  let run = [], lastNote = null, quiet = gap, prevRms = 0, armed = true;
  return {
    reset() { run = []; armed = true; quiet = gap; prevRms = 0; lastNote = null; },
    /**
     * @param {{ freq: number | null, rms: number, t?: number } | null} r измерение
     * @returns {{ midi: number, note: number, cents: number, t?: number } | null} новая сыгранная нота
     */
    push(r) {
      const rms = (r && r.rms) || 0;
      if (!r || !r.freq || rms < minRms) {
        run = [];
        quiet++;
        prevRms = rms;
        if (quiet >= gap) armed = true;
        return null;
      }
      if (prevRms > 0 && rms > retrigger * prevRms) { run = []; armed = true; } // новый удар по струне
      quiet = 0;
      prevRms = rms;
      run.push(69 + 12 * Math.log2(r.freq / a4));
      if (run.length > stable) run.shift();
      if (run.length < stable) return null;
      const s = [...run].sort((x, y) => x - y), med = s[s.length >> 1];
      if ((s[s.length - 1] - s[0]) * 100 > 2 * spread) return null; // звук ещё «плывёт»
      const note = Math.round(med);
      if (!armed && note === lastNote) return null;
      armed = false;
      lastNote = note;
      return { midi: med, note, cents: (med - note) * 100, t: r.t };
    },
  };
}

/**
 * Совпадает ли сыгранное с нужной нотой: ok — в пределах ±40 центов, close — та же нота, но гитара
 * расстроена (40–60 центов, «почти, проверь тюнер»), no — другая нота.
 * @param {number} midi сыгранное (дробное) @param {number} target нужная нота @param {number} [tol]
 * @returns {'ok' | 'close' | 'no'}
 */
export function matchPitch(midi, target, tol = 40) {
  const d = Math.abs(midi - target) * 100;
  return d <= tol ? 'ok' : d <= 60 ? 'close' : 'no';
}
