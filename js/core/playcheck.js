// playcheck.js — «сыграй сам»: сравнивает сыгранные ноты (от слушателя нот) с заданием по порядку. Чистая логика.
// Цель — точная высота (midi: та же нота в той же октаве) или любая октава (pc: «сыграй до где угодно»).
// Неверная нота не сбрасывает прогресс: новичок просто пробует ещё раз, а приложение подсказывает, что услышало.
import { matchPitch } from './listen.js';
import { mod12 } from './notes.js';

/**
 * @typedef {{ midi?: number, pc?: number, label?: string }} Target
 * @typedef {{ index: number, done: boolean, result: 'ok' | 'close' | 'no' | 'octave', heard: number, expected: Target }} Step
 */

/**
 * @param {Target[]} targets
 * @param {{ tol?: number }} [o]
 */
export function createPlayCheck(targets, { tol = 40 } = {}) {
  let index = 0, misses = 0;
  return {
    get index() { return index; },
    get done() { return index >= targets.length; },
    get misses() { return misses; },
    reset() { index = 0; misses = 0; },
    /**
     * Сыгранная нота (дробный midi от слушателя).
     * @param {number} midi
     * @returns {Step | null} null — задание уже выполнено
     */
    push(midi) {
      if (index >= targets.length) return null;
      const t = targets[index];
      let result;
      if (t.pc != null) {
        const near = Math.round(midi);
        result = mod12(near) === mod12(t.pc) ? matchPitch(midi, near, tol) : 'no';
      } else {
        result = matchPitch(midi, /** @type {number} */ (t.midi), tol);
        // та же нота, но в другой октаве — подсказываем, а не просто «нет»
        if (result === 'no' && mod12(Math.round(midi)) === mod12(/** @type {number} */ (t.midi))) result = 'octave';
      }
      const step = { index, done: false, result, heard: midi, expected: t };
      if (result === 'ok') index++;
      else misses++;
      step.done = index >= targets.length;
      return /** @type {Step} */ (step);
    },
  };
}

/** Подсказка по результату: что сказать новичку */
export function playHint(step, name) {
  if (!step) return '';
  if (step.result === 'ok') return step.done ? 'Всё сыграно — отлично!' : 'Есть! Дальше.';
  if (step.result === 'close') return `Это ${name(step.heard)}, но гитара чуть расстроена — проверь тюнер.`;
  if (step.result === 'octave') return `Это ${name(step.heard)}, но в другой октаве — посмотри на гриф, на какой струне и ладу.`;
  return `Слышу ${name(step.heard)}, а нужно: ${step.expected.label || 'другая нота'}.`;
}
