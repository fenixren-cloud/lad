// latency.js — «что было слышно в момент касания». Время удара — это не запланированное время клика,
// а позиция звука, который выходил из динамика в момент нажатия: её даёт getOutputTimestamp
// (запасной вариант — currentTime минус задержка выхода). На этом сломался первый тест ритма в прошлом проекте.

/**
 * Время по часам AudioContext, которое звучало в момент события (performance.now(), мс).
 * @param {AudioContext} ctx @param {number} perfMs
 */
export function heardAt(ctx, perfMs) {
  try {
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime > 0 && Number.isFinite(ts.contextTime)) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
  } catch { /* старый браузер */ }
  const lag = /** @type {any} */ (ctx).outputLatency || ctx.baseLatency || 0;
  return ctx.currentTime - lag - (performance.now() - perfMs) / 1000;
}

/** Задержка микрофона до калибровки: выход + вход, если браузер их сообщает, иначе ~60 мс */
export const micLatencyGuess = (info) => (info && (info.outputLatency + info.inputLatency)) || 0.06;
