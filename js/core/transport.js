// transport.js — общие музыкальные часы: такты, доли, деления и их точное время.
// Чистая логика без звука и таймеров: время приходит снаружи (часы AudioContext),
// а модуль только отвечает «какие события попадают в окно до такого-то момента».
//
// Как устроено:
//  • Сетка — тики: PPQ = 12 тиков на долю. Этого хватает на восьмые (6), шестнадцатые (3),
//    триоли (4), секстоли (2), свинг (тик 8 из 12) и галоп (тики 0, 6, 9).
//  • Время тика считается от «якоря» умножением: time = anchorTime + (tick − anchorTick) · длительность тика.
//    Ничего не складывается по шагу — поэтому ошибка не копится: за 100 тактов дрейф 0.
//  • Смена темпа на ходу: якорь переносится на первый ещё не выданный тик. Уже запланированное
//    не сдвигается, дальше — новый темп, без скачка.
//  • Смена размера — с начала следующего такта.
//  • Пропущенное окно (фоновая вкладка, подвисание): события в прошлом помечаются late — звуковой слой
//    их пропускает, а сетка остаётся на месте.

export const PPQ = 12;
/** Окно упреждения: обычное и для свёрнутой вкладки (таймеры там засыпают до секунды) */
/** @type {Readonly<{ visible: number, hidden: number }>} */
export const LOOKAHEAD = Object.freeze({ visible: 0.1, hidden: 1.5 });
/** Насколько событие может опоздать и всё же прозвучать (с), иначе пропускаем */
export const LATE_TOLERANCE = 0.03;

/**
 * @typedef {{ tick: number, time: number, bar: number, beat: number, sub: number, beatsPerBar: number, late: boolean }} TickEvent
 * bar — номер такта с 0; beat — доля в такте с 0; sub — тик внутри доли 0..11.
 */

/**
 * @param {{ bpm?: number, beatsPerBar?: number }} [opts]
 */
export function createTransport({ bpm = 120, beatsPerBar = 4 } = {}) {
  let running = false;
  let tempo = bpm;
  let anchorTime = 0, anchorTick = 0;
  let nextTick = 0;
  // размер: с какого тика и какого такта действует текущий beatsPerBar; отложенная смена
  let meter = { fromTick: 0, fromBar: 0, beatsPerBar };
  /** @type {{ fromTick: number, fromBar: number, beatsPerBar: number } | null} */
  let pendingMeter = null;

  const tickDur = () => 60 / (tempo * PPQ);
  const timeOfTick = tick => anchorTime + (tick - anchorTick) * tickDur();

  function position(tick) {
    const m = pendingMeter && tick >= pendingMeter.fromTick ? pendingMeter : meter;
    const perBar = PPQ * m.beatsPerBar;
    const inMeter = tick - m.fromTick;
    const bar = m.fromBar + Math.floor(inMeter / perBar);
    const inBar = inMeter - Math.floor(inMeter / perBar) * perBar;
    return { bar, beat: Math.floor(inBar / PPQ), sub: inBar % PPQ, beatsPerBar: m.beatsPerBar };
  }
  /** Первый тик такта, начинающегося не раньше tick */
  function barStartAtOrAfter(tick) {
    const m = pendingMeter && tick >= pendingMeter.fromTick ? pendingMeter : meter;
    const perBar = PPQ * m.beatsPerBar;
    const k = Math.ceil((tick - m.fromTick) / perBar);
    return { tick: m.fromTick + k * perBar, bar: m.fromBar + k };
  }

  return {
    get running() { return running; },
    get bpm() { return tempo; },
    get beatsPerBar() { return (pendingMeter || meter).beatsPerBar; },
    /** Следующий тик, который ещё не выдан */
    get nextTick() { return nextTick; },

    /** Запуск: тик 0 (начало такта 0) звучит в момент time */
    start(time) {
      running = true;
      anchorTime = time;
      anchorTick = 0;
      nextTick = 0;
      meter = { fromTick: 0, fromBar: 0, beatsPerBar: (pendingMeter || meter).beatsPerBar };
      pendingMeter = null;
    },
    stop() { running = false; },

    /** Новый темп — с первого ещё не запланированного тика */
    setBpm(next) {
      if (!(next > 0)) throw new RangeError('Темп должен быть больше нуля');
      if (running) {
        anchorTime = timeOfTick(nextTick);
        anchorTick = nextTick;
      }
      tempo = next;
    },

    /** Новый размер — с начала следующего такта (если стоим — сразу) */
    setBeatsPerBar(n) {
      if (!Number.isInteger(n) || n < 1 || n > 32) throw new RangeError('Размер — от 1 до 32 долей');
      if (!running) { meter = { fromTick: 0, fromBar: 0, beatsPerBar: n }; pendingMeter = null; return; }
      if (pendingMeter && nextTick >= pendingMeter.fromTick) { meter = pendingMeter; pendingMeter = null; }
      const at = barStartAtOrAfter(nextTick);
      pendingMeter = { fromTick: at.tick, fromBar: at.bar, beatsPerBar: n };
    },

    timeOfTick,
    /** Дробный тик в момент time */
    tickAt: time => anchorTick + (time - anchorTime) / tickDur(),
    position,
    /** Начало следующего такта от момента time: с него теория «встаёт в сетку» */
    nextBarAt(time) {
      const at = barStartAtOrAfter(Math.max(nextTick, Math.ceil(anchorTick + (time - anchorTime) / tickDur() - 1e-9)));
      return { ...at, time: timeOfTick(at.tick) };
    },

    /**
     * Все тики с временем раньше horizon, которые ещё не выдавались.
     * @param {number} now текущее время часов
     * @param {number} horizon до какого момента планировать (now + упреждение)
     * @returns {TickEvent[]}
     */
    pull(now, horizon) {
      /** @type {TickEvent[]} */
      const out = [];
      if (!running) return out;
      for (let t = timeOfTick(nextTick); t < horizon; t = timeOfTick(nextTick)) {
        if (pendingMeter && nextTick >= pendingMeter.fromTick) { meter = pendingMeter; pendingMeter = null; }
        out.push({ tick: nextTick, time: t, ...position(nextTick), late: t < now - LATE_TOLERANCE });
        nextTick++;
      }
      return out;
    },
  };
}

/**
 * Деления доли в тиках (из 12). Метроном и тест ритма берут отсюда, где звучат клики.
 */
export const SUBDIVISIONS = Object.freeze({
  quarter: { name: 'четверти', ticks: [0] },
  eighth: { name: 'восьмые', ticks: [0, 6] },
  triplet: { name: 'триоли', ticks: [0, 4, 8] },
  sixteenth: { name: 'шестнадцатые', ticks: [0, 3, 6, 9] },
  sextuplet: { name: 'секстоли', ticks: [0, 2, 4, 6, 8, 10] },
  swing: { name: 'свинг', ticks: [0, 8] },
  gallop: { name: 'галоп', ticks: [0, 6, 9] },
  reverseGallop: { name: 'обратный галоп', ticks: [0, 3, 6] },
});
