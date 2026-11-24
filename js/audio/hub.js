// hub.js — один транспорт на всё приложение: метроном, подложка и рифф играют в одной сетке.
// Источник «присоединяется» к часам; часы идут, пока есть хоть один источник. Новый источник
// подхватывает уже идущую сетку (теория и рифф встают в сетку метронома, а не останавливают его).
import { getAudio } from './engine.js';
import { createClock } from './clock.js';

/** @type {ReturnType<typeof createClock> | null} */
let clock = null;
/** @type {Map<string, () => void>} источник → отписка от тиков */
const sources = new Map();

/** Общие часы (null — нет звука) */
export function hubClock() {
  const a = getAudio();
  if (!a) return null;
  clock ??= createClock(a.ctx);
  return clock;
}

/**
 * Присоединить источник. onTicks получает тики транспорта (с временем каждого).
 * @param {string} name @param {(events: import('../core/transport.js').TickEvent[]) => void} onTicks
 * @param {{ bpm?: number, beatsPerBar?: number }} [opts] темп и размер, если часы ещё стоят
 * @returns {{ startBar: number } | null} с какого такта источник вступает
 */
export function join(name, onTicks, opts = {}) {
  const c = hubClock();
  if (!c) return null;
  leave(name);
  let startBar = 0;
  if (!c.running) {
    if (opts.bpm) c.setBpm(opts.bpm);
    if (opts.beatsPerBar) c.setBeatsPerBar(opts.beatsPerBar);
    sources.set(name, c.onTicks(onTicks));
    c.start();
  } else {
    // уже играет: вступаем с начала следующего такта
    startBar = c.transport.nextBarAt(c.transport.timeOfTick(c.transport.nextTick)).bar;
    sources.set(name, c.onTicks(onTicks));
  }
  return { startBar };
}

/** Отсоединить источник; последний — останавливает часы */
export function leave(name) {
  const off = sources.get(name);
  if (!off) return;
  off();
  sources.delete(name);
  if (!sources.size) clock?.stop();
}

export const playing = name => sources.has(name);
export const anyPlaying = () => sources.size > 0;
