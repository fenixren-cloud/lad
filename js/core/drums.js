// drums.js — какой записанный удар звучит за голосом барабанов и с какой силой. Чистая логика.
// Голоса: k — бочка, s — малый, sr — римшот, x — удар по ободу («палочки»), h — хай-хэт, hs — тихий хай-хэт,
// ho — открытый хай-хэт, hp — хай-хэт ногой, c — крэш, r — райд, rb — колокол райда, t1/t2 — высокий и низкий том.

/** Голос → файлы samples/drums/<имя>.wav, от тихого слоя к громкому */
export const DRUM_KIT = Object.freeze({
  k: ['kick-soft', 'kick'],
  s: ['snare-soft', 'snare'],
  sr: ['rim'],
  x: ['stick'],
  h: ['hat-soft', 'hat'],
  hs: ['hat-soft'],
  ho: ['hat-open'],
  hp: ['hat-foot'],
  c: ['crash'],
  r: ['ride'],
  rb: ['bell'],
  t1: ['tom-hi'],
  t2: ['tom-lo'],
});
/** Все файлы набора — грузятся один раз */
export const DRUM_FILES = Object.freeze([...new Set(Object.values(DRUM_KIT).flat())]);
/** С какой силы удара звучит громкий слой (у громкого удара другой тембр, а не только громкость) */
export const LOUD_FROM = 0.75;
/** Голоса, которые глушат открытый хай-хэт (тарелки хэта сомкнулись) */
export const HAT_CHOKERS = Object.freeze(['h', 'hs', 'hp']);

/**
 * Что сыграть: файл и громкость. Тихий удар — тихий слой; он и так записан тише,
 * поэтому громкость тянем к 1, чтобы тихий удар не превращался в шёпот.
 * @param {string} voice @param {number} [gain]
 * @returns {{ file: string, gain: number } | null}
 */
export function drumHit(voice, gain = 1) {
  const files = DRUM_KIT[voice];
  if (!files) return null;
  const g = Math.min(1, Math.max(0, gain));
  if (files.length === 1) return { file: files[0], gain: g };
  return g >= LOUD_FROM ? { file: files[files.length - 1], gain: g } : { file: files[0], gain: Math.min(1, g / LOUD_FROM) };
}

/**
 * Звуки метронома на записанных барабанах: «Палочки» (удар по ободу малого) и «Колокол» (райд,
 * сильная доля — колокол). Деления доли — тихим хай-хэтом. Возвращает [голос, множитель громкости] или null.
 * @param {string} sound @param {string} voice accent | beat | sub
 * @returns {[string, number] | null}
 */
export function metroDrum(sound, voice) {
  const kit = METRO_KITS[sound];
  return kit ? kit[voice] || null : null;
}
/** @type {Record<string, Record<string, [string, number]>>} */
const METRO_KITS = {
  sticks: { accent: ['x', 1], beat: ['x', 0.7], sub: ['hs', 0.9] },
  bell: { accent: ['rb', 1], beat: ['r', 0.9], sub: ['hs', 0.9] },
};
/**
 * Сила удара в груве: хай-хэт между долями тише, чем на доле (так играют барабанщики — грув «дышит»).
 * @param {string} voice @param {number} sub тик доли (0 — на долю)
 */
export const hitGain = (voice, sub) => (voice === 'hs' ? 0.45 : voice === 'h' && sub !== 0 ? 0.65 : 1);

/** Для чего синтез, пока записи не загрузились: ближайший синтезированный голос */
export const SYNTH_STANDIN = Object.freeze({ sr: 's', x: 's', ho: 'h', hp: 'hs', c: 'h', r: 'h', rb: 'h', t1: 'k', t2: 'k' });
