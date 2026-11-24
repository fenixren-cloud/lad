// clock.js — транспорт на часах AudioContext. Таймер раз в 25 мс спрашивает у транспорта,
// какие тики попадают в окно упреждения, и раздаёт их источникам звука (метроном, подложка, рифф).
// Таймер живёт в Worker: в свёрнутой вкладке его не «усыпляют» так сильно, как таймеры страницы,
// а окно упреждения там само растёт до 1,5 с.
import { createTransport, LOOKAHEAD } from '../core/transport.js';

const TICK_MS = 25;

/** Таймер в отдельном потоке; если Worker недоступен — обычный setInterval */
function createTicker(fn) {
  try {
    const src = `let id=null;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = fn;
    return { start: () => worker.postMessage(TICK_MS), stop: () => worker.postMessage(0) };
  } catch {
    let id = 0;
    return { start: () => { clearInterval(id); id = setInterval(fn, TICK_MS); }, stop: () => clearInterval(id) };
  }
}

/**
 * @param {AudioContext} ctx
 * @param {{ bpm?: number, beatsPerBar?: number }} [opts]
 */
export function createClock(ctx, opts = {}) {
  const transport = createTransport(opts);
  /** @type {Set<(events: import('../core/transport.js').TickEvent[]) => void>} */
  const listeners = new Set();
  const hidden = () => typeof document !== 'undefined' && document.hidden;

  function pump() {
    const now = ctx.currentTime;
    const events = transport.pull(now, now + (hidden() ? LOOKAHEAD.hidden : LOOKAHEAD.visible));
    if (events.length) for (const fn of listeners) fn(events);
  }
  const ticker = createTicker(pump);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (transport.running) pump(); });

  return {
    transport,
    /** Подписаться на тики; вернёт функцию отписки */
    onTicks(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Старт с небольшой задержкой, чтобы первый тик успел запланироваться */
    start(at = ctx.currentTime + 0.06) { transport.start(at); pump(); ticker.start(); },
    stop() { transport.stop(); ticker.stop(); },
    setBpm(bpm) { transport.setBpm(bpm); },
    setBeatsPerBar(n) { transport.setBeatsPerBar(n); },
    get running() { return transport.running; },
  };
}
