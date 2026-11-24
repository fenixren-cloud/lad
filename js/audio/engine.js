// engine.js — звуковой движок: один AudioContext на всё приложение, общая шина,
// компрессор на выходе и «отвод» для проверок высоты (AnalyserNode).
// Без Web Audio (например, WebKit под Windows) приложение работает «без звука» и не падает.

/** @typedef {{ ctx: AudioContext, master: GainNode, analyser: AnalyserNode }} Audio */
/** @type {Audio | null} */
let engine = null;

const AudioContextClass = () => /** @type {any} */ (globalThis).AudioContext || /** @type {any} */ (globalThis).webkitAudioContext || null;

/** Есть ли в браузере Web Audio */
export const hasWebAudio = () => typeof AudioContextClass() === 'function';

/** Движок (создаётся при первом обращении) или null, если звука нет */
export function getAudio() {
  if (engine) return engine;
  const AC = AudioContextClass();
  if (!AC) return null;
  try {
    const ctx = /** @type {AudioContext} */ (new AC({ latencyHint: 'interactive' }));
    const master = ctx.createGain();
    master.gain.value = 0.9;
    // Компрессор на выходе: громкие удары и аккорды не «рвут» наушники, тихое — слышно
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    master.connect(comp);
    comp.connect(ctx.destination);
    comp.connect(analyser);
    engine = { ctx, master, analyser };
    return engine;
  } catch (err) {
    console.warn('Звук недоступен:', err);
    return null;
  }
}

// «Себя не слушать»: до какого момента (часы AudioContext) звучит само приложение.
// Микрофон в это время не засчитывает ноты, иначе услышит себя из динамика.
let soundingUntil = 0;
/** Отметить, что приложение звучит до момента until */
export function markSounding(until) { if (until > soundingUntil) soundingUntil = until; }
/** Звучит ли приложение в момент t (по часам AudioContext) */
export const isSounding = t => t < soundingUntil;
/** Сбросить отметку (всё заглушено) */
export function clearSounding() { soundingUntil = 0; }

/**
 * Разбудить звук. Браузер разрешает звук только после нажатия, поэтому зовём это из обработчика нажатия.
 * @returns {Promise<Audio | null>}
 */
export async function unlockAudio() {
  const a = getAudio();
  if (a && a.ctx.state !== 'running') {
    try { await a.ctx.resume(); } catch { /* ещё нет нажатия — попробуем при следующем */ }
  }
  return a;
}
