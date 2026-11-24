// tempo.js — названия темпа. Чистая логика.

/** below — верхняя граница (не включая); name — итальянское название; ru — как это по-русски */
const TEMPO_NAMES = Object.freeze([
  { below: 40, name: 'Grave', ru: 'очень медленно и тяжело' },
  { below: 60, name: 'Largo', ru: 'медленно, широко' },
  { below: 66, name: 'Larghetto', ru: 'медленно' },
  { below: 76, name: 'Adagio', ru: 'спокойно' },
  { below: 108, name: 'Andante', ru: 'шагом' },
  { below: 120, name: 'Moderato', ru: 'умеренно' },
  { below: 168, name: 'Allegro', ru: 'быстро и бодро' },
  { below: 200, name: 'Presto', ru: 'очень быстро' },
  { below: Infinity, name: 'Prestissimo', ru: 'на пределе' },
]);

/** @param {number} bpm @returns {{ name: string, ru: string }} */
export function tempoName(bpm) {
  const t = TEMPO_NAMES.find(x => bpm < x.below) || TEMPO_NAMES[TEMPO_NAMES.length - 1];
  return { name: t.name, ru: t.ru };
}

export const BPM_MIN = 30;
export const BPM_MAX = 300;
/** Темп в допустимых пределах, целым числом */
export const clampBpm = bpm => Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(Number(bpm) || 0)));
