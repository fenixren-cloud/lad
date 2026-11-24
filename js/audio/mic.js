// mic.js — «ухо» приложения: микрофон или вход звуковой карты → высота, удары, уровень.
//  • Звук обрабатывается только на устройстве и никуда не отправляется.
//  • Тяжёлое — в AudioWorklet (отдельный звуковой поток). Его код собирается из тех же функций,
//    что проверены в Node (core/pitch.js, core/onset.js), через toString() — работает и в офлайн-файле.
//  • У двухвходовой звуковой карты гитара обычно во 2-м канале (1-й — микрофонный): по умолчанию берём
//    громкий канал сам, можно выбрать вход 1 или 2.
//  • Микрофон выключается, когда не нужен: свернул приложение, ушёл с экрана, закончил упражнение.
//  • Пока звучит само приложение, ноты не засчитываются (иначе оно услышит себя).
import { createPitchDetector, decimate2 } from '../core/pitch.js';
import { createOnsetDetector } from '../core/onset.js';
import { getAudio, unlockAudio, isSounding } from './engine.js';

const workletSource = () => `
const createPitchDetector = ${createPitchDetector.toString()};
const decimate2 = ${decimate2.toString()};
const createOnsetDetector = ${createOnsetDetector.toString()};
class LadEar extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.channel = o.channel == null ? 'auto' : o.channel;
    this.pitchOn = o.pitch !== false;
    this.onsetOn = o.onsets !== false;
    this.dec = sampleRate >= 88200 ? 4 : sampleRate >= 44100 ? 2 : 1;
    this.rate = sampleRate / this.dec;
    this.det = createPitchDetector({ sampleRate: this.rate, minFreq: o.minFreq || 60, maxFreq: o.maxFreq || 1400 });
    this.buf = new Float32Array(this.det.need);
    this.hopIn = Math.round(sampleRate * 0.04 / this.dec) * this.dec; // ~25 измерений в секунду
    this.stage = new Float32Array(this.hopIn + 4096);
    this.n = 0;
    this.onset = createOnsetDetector({ sampleRate });
    this.chRms = [0, 0];
    this.pick = 0;
    this.lvlAcc = 0; this.lvlCnt = 0; this.lvlEvery = Math.round(sampleRate * 0.05);
    this.on = true;
    this.port.onmessage = e => {
      if (e.data === 'stop') this.on = false;
      else if (e.data && e.data.channel != null) this.channel = e.data.channel;
    };
  }
  process(inputs) {
    const ins = inputs[0];
    if (!ins || !ins.length) return this.on;
    // какой канал слушать: выбранный или громкий (с запасом, чтобы не прыгать туда-сюда)
    for (let c = 0; c < Math.min(2, ins.length); c++) {
      let e = 0; const x = ins[c];
      for (let i = 0; i < x.length; i++) e += x[i] * x[i];
      this.chRms[c] = 0.95 * this.chRms[c] + 0.05 * Math.sqrt(e / x.length);
    }
    if (this.channel === 'auto') {
      const other = 1 - this.pick;
      if (ins.length > 1 && this.chRms[other] > 2 * this.chRms[this.pick] + 1e-4) this.pick = other;
      if (ins.length < 2) this.pick = 0;
    } else this.pick = Math.min(this.channel, ins.length - 1);
    const ch = ins[this.pick];
    if (this.onsetOn) for (const f of this.onset.push(ch, currentFrame)) this.port.postMessage({ k: 'o', t: f / sampleRate });
    for (let i = 0; i < ch.length; i++) this.lvlAcc += ch[i] * ch[i];
    this.lvlCnt += ch.length;
    if (this.lvlCnt >= this.lvlEvery) {
      this.port.postMessage({ k: 'l', rms: Math.sqrt(this.lvlAcc / this.lvlCnt), ch: this.pick, chans: ins.length, t: currentTime });
      this.lvlAcc = 0; this.lvlCnt = 0;
    }
    if (!this.pitchOn) return this.on;
    if (this.n + ch.length <= this.stage.length) { this.stage.set(ch, this.n); this.n += ch.length; }
    if (this.n >= this.hopIn) {
      let fresh = this.stage.subarray(0, this.hopIn);
      for (let d = this.dec; d > 1; d >>= 1) fresh = decimate2(fresh);
      const B = this.buf, L = Math.min(fresh.length, B.length);
      B.copyWithin(0, L);
      B.set(fresh.subarray(fresh.length - L), B.length - L);
      this.stage.copyWithin(0, this.hopIn, this.n);
      this.n -= this.hopIn;
      const r = this.det.detect(B);
      this.port.postMessage({ k: 'p', freq: r.freq, clarity: r.clarity, rms: r.rms, t: currentTime });
    }
    return this.on;
  }
}
registerProcessor('lad-ear', LadEar);`;

/** Ошибки микрофона — с кодом, по которому показывается понятный совет */
export class MicError extends Error {
  /** @param {'insecure' | 'nomic' | 'noaudio' | 'denied' | 'notfound' | 'busy' | 'noworklet' | 'other'} code */
  constructor(code, message = '') { super(message || code); this.code = code; }
}

/** Что случилось и что делать — простыми словами */
export const MIC_HELP = Object.freeze({
  insecure: 'Микрофон работает только по защищённому адресу (https) или на этом же компьютере (localhost). Открой приложение по такому адресу.',
  nomic: 'Этот браузер не даёт доступ к микрофону. Открой приложение в Chrome.',
  noaudio: 'В этом браузере нет звукового движка (Web Audio) — слушать игру не получится.',
  denied: 'Доступ к микрофону запрещён. Разреши его: значок слева от адреса → «Микрофон» → «Разрешить», потом нажми «Слушать» ещё раз.',
  notfound: 'Микрофон или вход звуковой карты не найден. Подключи его и нажми «Слушать» ещё раз; если выбран вход, которого больше нет, выбери другой.',
  busy: 'Вход занят другой программой. Если звуковую карту держит DAW через ASIO — закрой DAW или включи в её настройках звука освобождение устройства, когда окно не активно. Частота везде — 48 кГц.',
  noworklet: 'Браузер слишком старый, чтобы слушать удары. Обнови Chrome.',
  other: 'Не получилось включить микрофон. Попробуй ещё раз или выбери другой вход.',
});

/** Можно ли вообще просить микрофон */
export function micStatus() {
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'nomic';
  return 'ok';
}

/** @type {null | { stop: (reason?: string) => void }} */
let current = null;
const loaded = new WeakMap();

async function loadWorklet(ctx) {
  if (!ctx.audioWorklet || typeof AudioWorkletNode !== 'function') throw new MicError('noworklet');
  if (!loaded.has(ctx)) {
    const url = URL.createObjectURL(new Blob([workletSource()], { type: 'text/javascript' }));
    loaded.set(ctx, ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
  }
  return loaded.get(ctx);
}

/** Входы (названия видны только после разрешения на микрофон) */
export async function listInputs() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Вход ${i + 1}` }));
  } catch {
    return [];
  }
}

export const micRunning = () => !!current;
/** Выключить микрофон (значок записи в браузере гаснет) */
export function stopMic(reason = 'stop') { current?.stop(reason); }

/**
 * Включить «ухо». Колбэки получают:
 *  onReading({ freq, clarity, rms, t, selfSound }) — ~25 раз в секунду; freq = null, если ноты нет;
 *  onOnset(t) — момент удара по часам AudioContext; onLevel({ rms, channel, channels }) — ~20 раз в секунду;
 *  onEnded(reason) — микрофон выключился сам ('hidden' — приложение свернули, 'ended' — вход пропал).
 * @param {{ deviceId?: string, channel?: 'auto' | 0 | 1, pitch?: boolean, onsets?: boolean, ignoreSelf?: boolean,
 *   minFreq?: number, maxFreq?: number, onReading?: Function, onOnset?: Function, onLevel?: Function, onEnded?: Function }} [o]
 */
export async function startMic(o = {}) {
  stopMic('restart');
  const status = micStatus();
  if (status !== 'ok') throw new MicError(/** @type {any} */ (status));
  const a = await unlockAudio();
  if (!a) throw new MicError('noaudio');
  const { ctx } = a;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // «улучшения» для звонков портят высоту и атаку — выключаем
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: { ideal: 2 },
        ...(o.deviceId ? { deviceId: { exact: o.deviceId } } : {}),
      },
    });
  } catch (e) {
    const n = e && /** @type {any} */ (e).name;
    throw new MicError(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied'
      : n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'NotSupportedError' ? 'notfound'
        : n === 'NotReadableError' || n === 'AbortError' ? 'busy' : 'other', e && /** @type {any} */ (e).message);
  }
  const src = ctx.createMediaStreamSource(stream);
  const sink = ctx.createGain(); // беззвучный выход: граф должен куда-то вести, чтобы обрабатываться
  sink.gain.value = 0;
  sink.connect(ctx.destination);
  const ignoreSelf = o.ignoreSelf !== false;
  let node;
  try {
    await loadWorklet(ctx);
    node = new AudioWorkletNode(ctx, 'lad-ear', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'max',
      processorOptions: { channel: o.channel ?? 'auto', pitch: o.pitch !== false, onsets: o.onsets !== false, minFreq: o.minFreq, maxFreq: o.maxFreq },
    });
  } catch (e) {
    stream.getTracks().forEach(t => t.stop());
    sink.disconnect();
    throw e instanceof MicError ? e : new MicError('noworklet', String(e));
  }
  node.port.onmessage = e => {
    const d = e.data;
    if (d.k === 'p') o.onReading?.({ freq: d.freq, clarity: d.clarity, rms: d.rms, t: d.t, selfSound: ignoreSelf && isSounding(d.t) });
    else if (d.k === 'o') { if (!(ignoreSelf && isSounding(d.t))) o.onOnset?.(d.t); }
    else if (d.k === 'l') o.onLevel?.({ rms: d.rms, channel: d.ch, channels: d.chans });
  };
  src.connect(node);
  node.connect(sink);

  const track = stream.getAudioTracks()[0];
  const settings = (() => { try { return track.getSettings(); } catch { return {}; } })();
  const onHidden = () => { if (document.hidden) session.stop('hidden'); };
  const session = {
    stop(reason = 'stop') {
      if (current !== session) return;
      current = null;
      document.removeEventListener('visibilitychange', onHidden);
      try { node.port.postMessage('stop'); node.disconnect(); src.disconnect(); sink.disconnect(); } catch { /* уже отключено */ }
      stream.getTracks().forEach(t => t.stop());
      if (reason !== 'stop' && reason !== 'restart') o.onEnded?.(reason);
    },
    /** Сменить канал на ходу: 'auto', 0 или 1 */
    setChannel(ch) { node.port.postMessage({ channel: ch }); },
    info: {
      label: track ? track.label : '',
      sampleRate: ctx.sampleRate,
      // задержки, если браузер их сообщает, — для начальной поправки теста ритма до калибровки
      inputLatency: Number(/** @type {any} */ (settings).latency) || 0,
      outputLatency: /** @type {any} */ (ctx).outputLatency || ctx.baseLatency || 0,
    },
  };
  track?.addEventListener('ended', () => session.stop('ended'));
  document.addEventListener('visibilitychange', onHidden);
  current = session;
  return session;
}

/** Есть ли звук у движка (для экранов, которым нужен только «ухо» без своего звука) */
export const audioReady = () => !!getAudio();
