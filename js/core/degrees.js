// degrees.js — цвета ступеней. Они одинаковые во всём приложении и не меняются без вопроса автору.
// Ступень всегда подписана числом или буквой: цвет — подсказка, а не единственный признак.
// Чистый модуль: без DOM и звука, проверяется в Node.

/** @typedef {'root' | 'third' | 'fifth' | 'seventh' | 'characteristic'} DegreeRole */

/** @type {Readonly<Record<DegreeRole, string>>} */
export const DEGREE_COLORS = Object.freeze({
  root: '#f5a524', // 1 — оранжевый
  third: '#9d8cff', // терция — фиолетовый
  fifth: '#38bdf8', // квинта — голубой
  seventh: '#f43f5e', // септима — красный
  characteristic: '#a3e635', // характерная нота лада — лаймовый
});

/** Подпись и объяснение для каждой роли — для легенды и экранного диктора. */
export const DEGREE_LEGEND = Object.freeze([
  { role: 'root', label: '1', name: 'тоника' },
  { role: 'third', label: '3', name: 'терция' },
  { role: 'fifth', label: '5', name: 'квинта' },
  { role: 'seventh', label: '7', name: 'септима' },
  { role: 'characteristic', label: '★', name: 'характерная нота лада' },
]);
