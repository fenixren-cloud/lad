// drumkit.js — записанные барабаны (набор Virtuosity Drums, CC0): загрузка один раз на AudioContext,
// удар по голосу и силе, открытый хай-хэт глушится закрытым. Пока записи не загрузились, играет синтез.
import { DRUM_FILES, drumHit, HAT_CHOKERS } from '../core/drums.js';
import { loadBytes } from './assets.js';

// Записи выровнены с запасом по пику (атака бочки −14 дБFS), чтобы не обрезать вершины при пересохранении.
// Здесь их поднимаем на +4 дБ: ближе к громкости синтеза, но атака малого с крэшем не пробивает потолок
// (компрессор на выходе с атакой 4 мс короткие пики не ловит; проверено: при ×2,5 пик был 1,03).
const MAKEUP = 1.6;

/** @typedef {{ buffers: Map<string, AudioBuffer>, ready: Promise<boolean>, openHat: { src: AudioBufferSourceNode, amp: GainNode } | null }} Kit */
/** @type {WeakMap<BaseAudioContext, Kit>} */
const kits = new WeakMap();

/**
 * Загрузить набор (повторный вызов вернёт тот же Promise). true — записи готовы, false — не вышло (останется синтез).
 * @param {BaseAudioContext} ctx
 */
export function loadDrumKit(ctx) {
  let kit = kits.get(ctx);
  if (!kit) {
    /** @type {Map<string, AudioBuffer>} */
    const buffers = new Map();
    const ready = Promise.all(DRUM_FILES.map(async f => {
      buffers.set(f, await ctx.decodeAudioData(await loadBytes(`samples/drums/${f}.wav`)));
    })).then(() => true, err => { console.warn('Барабаны: записи не загрузились, играет синтез.', err); return false; });
    kit = { buffers, ready, openHat: null };
    kits.set(ctx, kit);
  }
  return kit.ready;
}

/** Записи загружены? */
export const drumsLoaded = ctx => (kits.get(ctx)?.buffers.size ?? 0) === DRUM_FILES.length;

/**
 * Сыграть удар записью. false — записи ещё нет (тогда звучит синтез).
 * @param {BaseAudioContext} ctx @param {AudioNode} out @param {string} voice @param {number} t @param {number} [gain]
 */
export function playDrum(ctx, out, voice, t, gain = 1) {
  const kit = kits.get(ctx);
  const hit = drumHit(voice, gain);
  const buffer = hit && kit?.buffers.get(hit.file);
  if (!kit || !hit || !buffer) return false;
  const at = Math.max(t, ctx.currentTime);
  if (HAT_CHOKERS.includes(voice) && kit.openHat) { // хэт сомкнулся — открытый звук обрывается
    const { src, amp } = kit.openHat;
    amp.gain.setTargetAtTime(0, at, 0.012);
    src.stop(at + 0.08);
    kit.openHat = null;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const amp = ctx.createGain();
  amp.gain.value = hit.gain * MAKEUP;
  src.connect(amp);
  amp.connect(out);
  src.start(at);
  src.onended = () => { amp.disconnect(); if (kit.openHat?.src === src) kit.openHat = null; };
  if (voice === 'ho') kit.openHat = { src, amp };
  return true;
}
