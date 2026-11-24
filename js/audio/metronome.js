// metronome.js — двигатель метронома: настройки, старт/стоп через общий транспорт, звук, «вспышки» для экрана.
// Живёт вне экрана: ушёл в другой раздел — метроном играет дальше, в мини-плеере видно и можно остановить.
import { signal } from '../core/signal.js';
import { normalizeMetronome, soundsAt, trainerBpm } from '../core/metronome.js';
import { tempoName } from '../core/tempo.js';
import { SUBDIVISIONS } from '../core/transport.js';
import { getAudio, unlockAudio } from './engine.js';
import { join, leave, hubClock } from './hub.js';
import { playVoice } from './percussion.js';
import { loadDrumKit } from './drumkit.js';
import { store } from '../app/store.js';
import { nowPlaying } from '../app/state.js';
import { setMediaSession } from '../app/media.js';

/** Настройки метронома (сохраняются) */
export const metro = signal({ ...normalizeMetronome(store().get('metro')), volume: Number(store().get('metro')?.volume ?? 0.8) });
export const running = signal(false);
/** Высокий клик (5 кГц), пока приложение слушает удары по струнам */
export const highClick = signal(false);
/** Сколько секунд идёт метроном — таймер занятия */
export const elapsed = signal(0);

/** @type {Set<(e: { time: number, bar: number, beat: number, sub: number, countIn: boolean }) => void>} */
const tickListeners = new Set();
/** Подписка на тики (для сетки долей, проверки «чисто ли», вспышки); время — по часам AudioContext */
export function onMetroTick(fn) { tickListeners.add(fn); return () => tickListeners.delete(fn); }

let bus = null, startBar = 0, startBpm = 84, timer = 0, wake = null;

/** Изменить настройки (на ходу тоже) */
export function setMetro(patch) {
  const next = normalizeMetronome({ ...metro.value, ...patch });
  const volume = Math.min(1, Math.max(0, Number(patch.volume ?? metro.value.volume)));
  metro.value = { ...next, volume };
  store().set('metro', metro.value);
  const c = hubClock();
  if (running.value && c) {
    if ('bpm' in patch) { c.setBpm(metro.value.bpm); startBpm = metro.value.bpm; }
    if ('beats' in patch) c.setBeatsPerBar(metro.value.beats);
  }
  if (bus) bus.gain.value = metro.value.volume;
  if (running.value) updatePlaying();
}

function updatePlaying() {
  const m = metro.value, t = tempoName(m.bpm);
  const info = { title: `Метроном · ${m.bpm}`, detail: `${m.beats}/${m.unit} · ${SUBDIVISIONS[m.sub].name} · ${t.name}`, href: '#/play/metronome', stop };
  nowPlaying.value = info;
  setMediaSession({ title: info.title, detail: info.detail, onStop: stop });
}

function onTicks(events) {
  const a = getAudio();
  if (!a || !bus) return;
  const m = metro.value;
  for (const e of events) {
    const bar = e.bar - startBar;
    if (bar < 0) continue;
    // тренажёр скорости: темп меняется на «раз» нового такта
    if (m.trainer && e.beat === 0 && e.sub === 0 && bar >= m.countIn) {
      const want = trainerBpm(startBpm, bar - m.countIn, m.trainer);
      if (want !== m.bpm) { metro.value = { ...m, bpm: want }; hubClock()?.setBpm(want); updatePlaying(); }
    }
    if (e.late) continue;
    const t = { bar, beat: e.beat, sub: e.sub };
    const sounds = soundsAt(t, m);
    for (const s of sounds) playVoice(a.ctx, bus, s.voice, m.sound, e.time, s.gain, highClick.value);
    if (e.sub === 0 || sounds.length) for (const fn of tickListeners) fn({ time: e.time, bar, beat: e.beat, sub: e.sub, countIn: bar < m.countIn });
  }
}

async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) wake = await /** @type {any} */ (navigator).wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}

export async function start() {
  const a = await unlockAudio();
  if (a) await loadDrumKit(a.ctx); // записанные удары («Палочки», «Колокол», «Барабаны»); уже загружены — мгновенно
  if (!a || running.value) return !!a;
  if (!bus) { bus = a.ctx.createGain(); bus.connect(a.master); }
  bus.gain.value = metro.value.volume;
  startBpm = metro.value.bpm;
  const j = join('metronome', onTicks, { bpm: metro.value.bpm, beatsPerBar: metro.value.beats });
  if (!j) return false;
  startBar = j.startBar;
  running.value = true;
  elapsed.value = 0;
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) elapsed.value++; }, 1000);
  keepAwake(true);
  updatePlaying();
  return true;
}

export function stop() {
  if (!running.value) return;
  leave('metronome');
  running.value = false;
  clearInterval(timer);
  keepAwake(false);
  if (metro.value.trainer && metro.value.bpm !== startBpm) setMetro({ bpm: startBpm }); // тренажёр вернул темп к началу
  if (nowPlaying.value?.href === '#/play/metronome') nowPlaying.value = null;
  setMediaSession(null);
}

export const toggle = () => (running.value ? (stop(), Promise.resolve(false)) : start());
document.addEventListener('visibilitychange', () => { if (running.value) keepAwake(!document.hidden); });
