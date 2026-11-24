// backing.js — двигатель подложки: барабаны, бас и гитара по груву, аккорды по тактам, через общий транспорт.
// Дорожки — с громкостью и выключением. Играет дальше в другом разделе (мини-плеер).
import { signal } from '../core/signal.js';
import { grooveAt, buildChords, chordIndexAt, bassMidi, chordLabel, GROOVES } from '../core/backing.js';
import { bestVoicing, voicingMidis, TUNINGS } from '../core/neck.js';
import { PROGRESSIONS, MODES } from '../core/scales.js';
import { clampBpm } from '../core/tempo.js';
import { unlockAudio, getAudio } from './engine.js';
import { prepareInstruments } from './instruments.js';
import { join, leave, hubClock } from './hub.js';
import { playVoice } from './percussion.js';
import { loadDrumKit } from './drumkit.js';
import { hitGain } from '../core/drums.js';
import { store } from '../app/store.js';
import { nowPlaying, settings } from '../app/state.js';
import { setMediaSession } from '../app/media.js';

/**
 * @typedef {{ tonic: number, mode: string, prog: string, custom: { degree: number, bars: number }[], groove: string, bpm: number,
 *   tracks: Record<'drums' | 'bass' | 'guitar', { on: boolean, vol: number }> }} BackingState
 */
const DEF = { tonic: 2, mode: 'aeolian', prog: 'vi', custom: [{ degree: 0, bars: 2 }, { degree: 5, bars: 1 }, { degree: 6, bars: 1 }], groove: 'rock', bpm: 100,
  tracks: { drums: { on: true, vol: 0.8 }, bass: { on: true, vol: 0.8 }, guitar: { on: true, vol: 0.7 } } };
function normalize(s) {
  const v = { ...DEF, ...(s && typeof s === 'object' ? s : {}) };
  v.tonic = ((Math.round(Number(v.tonic)) % 12) + 12) % 12 || 0;
  if (!(v.mode in MODES)) v.mode = DEF.mode;
  if (!GROOVES.some(g => g.id === v.groove)) v.groove = DEF.groove;
  v.bpm = clampBpm(v.bpm);
  v.custom = Array.isArray(v.custom) && v.custom.length ? v.custom.slice(0, 8).map(c => ({ degree: Math.min(6, Math.max(0, Number(c.degree) || 0)), bars: [1, 2, 4].includes(c.bars) ? c.bars : 1 })) : DEF.custom;
  v.tracks = { ...DEF.tracks, ...(v.tracks || {}) };
  return v;
}
/** Семья последовательностей лада: мажорные лады — мажорные последовательности, минорные — минорные */
export const familyOf = mode => (MODES[mode].family === 'major' ? 'major' : 'minor');
/** Ступени текущей последовательности (готовой или своей) */
export function progItems(b) {
  if (b.prog === 'custom') return b.custom;
  const p = PROGRESSIONS[familyOf(b.mode)].find(x => x.id === b.prog) || PROGRESSIONS[familyOf(b.mode)][0];
  return p.degrees.map(d => ({ degree: d, bars: 1 }));
}

export const backing = signal(normalize(store().get('backing')));
export const running = signal(false);
/** Текущий аккорд (меняется в момент, когда его слышно) */
export const current = signal(/** @type {null | { index: number, chord: any }} */ (null));

export function setBacking(patch) {
  backing.value = normalize({ ...backing.value, ...patch });
  store().set('backing', backing.value);
  applyMix();
  if (running.value) { if ('bpm' in patch) hubClock()?.setBpm(backing.value.bpm); update(); }
}
export const chords = () => buildChords(backing.value.tonic, backing.value.mode, progItems(backing.value));

let buses = null, startBar = 0, inst = null;
function applyMix() {
  if (!buses) return;
  for (const k of ['drums', 'bass', 'guitar']) buses[k].gain.value = backing.value.tracks[k].on ? backing.value.tracks[k].vol : 0;
}
function update() {
  const b = backing.value, list = chords();
  const info = { title: `Подложка · ${b.bpm}`, detail: list.map(c => chordLabel(c, settings.value.notation === 'german').symbol).join(' – '), href: '#/play/backing', stop };
  nowPlaying.value = info;
  setMediaSession({ title: info.title, detail: info.detail, onStop: stop });
}

function onTicks(events) {
  const a = getAudio();
  if (!a || !buses || !inst) return;
  const b = backing.value, list = chords(), tuning = TUNINGS[settings.value.tuning].midi;
  for (const e of events) {
    const bar = e.bar - startBar;
    if (bar < 0 || e.late) continue;
    const idx = chordIndexAt(list, bar), c = list[idx];
    if (e.beat === 0 && e.sub === 0) {
      const delay = Math.max(0, (e.time - a.ctx.currentTime) * 1000);
      setTimeout(() => { if (running.value) current.value = { index: idx, chord: c }; }, delay);
    }
    const g = grooveAt(b.groove, e.beat, e.sub, bar);
    for (const v of g.drums) playVoice(a.ctx, buses.drums, v, 'drums', e.time, 0.9 * hitGain(v, e.sub));
    if (g.bass) inst.bass.play(bassMidi(c.rootPc, g.bass), e.time, { velocity: 0.9, duration: 60 / b.bpm * (b.groove === 'ballad' ? 1.9 : 0.45), choke: true, dest: buses.bass });
    if (g.guitar) {
      const power = bestVoicing('power', c.rootPc, settings.value.tuning, 4);
      if (g.guitar === 'power' && power) inst.guitar.strum(voicingMidis(power.frets, tuning), e.time, { velocity: 0.75, duration: 60 / b.bpm * 0.9, dest: buses.guitar });
      else if (g.guitar === 'chug' && power) inst.guitar.strum(voicingMidis(power.frets, tuning).slice(0, 2), e.time, { velocity: 0.55, duration: 0.09, gap: 0.008, dest: buses.guitar });
      else if (g.guitar === 'chord') {
        const v = bestVoicing(c.type, c.rootPc, settings.value.tuning, 5) || power;
        if (v) inst.guitar.strum(voicingMidis(v.frets, tuning), e.time, { velocity: 0.6, duration: 60 / b.bpm * 0.55, dest: buses.guitar });
      } else if (g.guitar.startsWith('arp:')) {
        const v = bestVoicing(c.type, c.rootPc, settings.value.tuning, 5) || power;
        if (v) {
          const notes = voicingMidis(v.frets, tuning), order = [0, 2, 3, 4, 1, 3, 4, 2];
          inst.guitar.play(notes[order[Number(g.guitar.slice(4)) % 8] % notes.length], e.time, { velocity: 0.6, duration: 60 / b.bpm * 1.5, dest: buses.guitar });
        }
      }
    }
  }
}

export async function start() {
  const a = await unlockAudio();
  if (!a || running.value) return !!a;
  [inst] = await Promise.all([prepareInstruments(), loadDrumKit(a.ctx)]);
  if (!inst || running.value) return !!inst;
  if (!buses) {
    buses = { drums: a.ctx.createGain(), bass: a.ctx.createGain(), guitar: a.ctx.createGain() };
    buses.drums.connect(a.master);
    buses.bass.connect(inst.bassOutput);
    buses.guitar.connect(inst.guitarInput); // гитара подложки — тоже через чистый звук или перегруз
  }
  applyMix();
  const j = join('backing', onTicks, { bpm: backing.value.bpm, beatsPerBar: 4 });
  if (!j) return false;
  startBar = j.startBar;
  running.value = true;
  update();
  return true;
}

export function stop() {
  if (!running.value) return;
  leave('backing');
  running.value = false;
  current.value = null;
  inst?.guitar.choke();
  inst?.bass.choke();
  if (nowPlaying.value?.href === '#/play/backing') nowPlaying.value = null;
  setMediaSession(null);
}
export const toggle = () => (running.value ? (stop(), Promise.resolve(false)) : start());
