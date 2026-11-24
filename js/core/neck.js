// neck.js — гриф: строи, формы аккордов, позиции пентатоники «линейками» и ладов. Чистая логика.
//
// Струны нумеруются индексом 0..5: 0 = 6-я (самая толстая), 5 = 1-я (самая тонкая).
// Лады — 0..22 (22 лада, как у большинства электрогитар).
import { mod12, degreeLabel } from './notes.js';
import { MODES, PENTATONICS } from './scales.js';

export const MAX_FRET = 22;
/** Номер струны для подписи по индексу */
export const STRING_NUMBER = Object.freeze(['6', '5', '4', '3', '2', '1']);
export const TUNINGS = Object.freeze({
  std: { id: 'std', name: 'Standard E', short: 'E A D G B E', midi: [40, 45, 50, 55, 59, 64] },
  dropd: { id: 'dropd', name: 'Drop D', short: 'D A D G B E', midi: [38, 45, 50, 55, 59, 64] },
});

// ---------- формы аккордов ----------
/**
 * Форма — смещения ладов от корня на корневой струне (rootString), null — струна не звучит.
 * Формы записаны для Standard; для Drop D формы от 6-й струны пересчитываются (shapesFor).
 */
const shape = (name, rootString, offsets) => ({ name, rootString, offsets });
const X = null;
const SHAPES = {
  power: [shape('от 6-й струны', 0, [0, 2, X, X, X, X]), shape('от 6-й, с октавой', 0, [0, 2, 2, X, X, X]),
    shape('от 5-й струны', 1, [X, 0, 2, X, X, X]), shape('от 5-й, с октавой', 1, [X, 0, 2, 2, X, X])],
  maj: [shape('E-форма, баррэ от 6-й', 0, [0, 2, 2, 1, 0, 0]), shape('A-форма, баррэ от 5-й', 1, [X, 0, 2, 2, 2, 0])],
  min: [shape('Em-форма, баррэ от 6-й', 0, [0, 2, 2, 0, 0, 0]), shape('Am-форма, баррэ от 5-й', 1, [X, 0, 2, 2, 1, 0])],
  sus4: [shape('Esus4-форма, от 6-й', 0, [0, 2, 2, 2, 0, 0]), shape('Asus4-форма, от 5-й', 1, [X, 0, 2, 2, 3, 0])],
  dim: [shape('от 6-й, 4 струны', 0, [0, 1, 2, 0, X, X]), shape('от 5-й, 4 струны', 1, [X, 0, 1, 2, 1, X])],
  aug: [shape('от 6-й, 4 струны', 0, [0, X, 2, 1, 1, X]), shape('от 5-й, 4 струны', 1, [X, 0, 3, 2, 2, X])],
  maj7: [shape('от 6-й', 0, [0, X, 1, 1, 0, X]), shape('от 5-й', 1, [X, 0, 2, 1, 2, X])],
  dom7: [shape('от 6-й', 0, [0, X, 0, 1, 0, X]), shape('E7-форма, баррэ', 0, [0, 2, 0, 1, 0, 0]), shape('от 5-й', 1, [X, 0, 2, 0, 2, X])],
  m7: [shape('от 6-й', 0, [0, X, 0, 0, 0, X]), shape('Em7-форма, баррэ', 0, [0, 2, 0, 0, 0, 0]), shape('от 5-й', 1, [X, 0, 2, 0, 1, X])],
  m7b5: [shape('от 6-й', 0, [0, X, 0, 0, -1, X]), shape('от 5-й', 1, [X, 0, 1, 0, 1, X])],
  dim7: [shape('от 6-й', 0, [0, X, -1, 0, -1, X]), shape('от 5-й', 1, [X, 0, 1, -1, 1, X])],
};
export const SHAPE_TYPES = Object.freeze(Object.keys(SHAPES));

/**
 * @typedef {{ id: string, name: string, rootString: number, offsets: (number | null)[], drop: boolean }} Shape
 * Формы аккорда в строе. В Drop D 6-я струна на тон ниже: корень на ней на 2 лада правее,
 * значит остальные струны — на 2 лада левее корня. Пауэр-аккорд от 6-й берётся одним пальцем.
 * @returns {Shape[]}
 */
export function shapesFor(type, tuningId) {
  return (SHAPES[type] || []).map((s, i) => {
    const id = `${type}-${i}`;
    if (tuningId !== 'dropd' || s.rootString !== 0) return { ...s, id, drop: false };
    const offsets = s.offsets.map((o, k) => (o == null ? null : k === 0 ? o : o - 2));
    const name = type === 'power' ? `Drop D: один палец (${i === 0 ? '6+5' : '6+5+4'})` : `Drop D: ${s.name.replace(', баррэ от 6-й', ' от 6-й')}`;
    return { ...s, id, name, offsets, drop: true };
  });
}

const playedFrets = frets => frets.filter(f => f != null);
/** Средний лад аппликатуры — «где на грифе» она находится */
export const voicingCenter = frets => { const u = playedFrets(frets); return u.reduce((a, b) => a + b, 0) / u.length; };
/** Высоты звучащих струн */
export const voicingMidis = (frets, tuning) => frets.flatMap((f, s) => (f == null ? [] : [tuning[s] + f]));

/**
 * Поставить форму на гриф так, чтобы корень был pc. Возможные места — на октаву ниже и выше;
 * берётся самое низкое (target = null) или ближайшее к ладу target. Лады — от 6-й струны к 1-й.
 * @param {Shape} s @param {number} rootPc @param {number[]} tuning @param {number | null} [target]
 * @returns {(number | null)[] | null}
 */
export function placeShape(s, rootPc, tuning, target = null) {
  const base = mod12(rootPc - tuning[s.rootString]);
  let best = null, bestScore = Infinity;
  for (const b of [base, base + 12, base - 12]) {
    const frets = s.offsets.map(o => (o == null ? null : o + b));
    const u = playedFrets(frets);
    if (Math.min(...u) < 0 || Math.max(...u) > MAX_FRET) continue;
    const score = target == null ? voicingCenter(frets) : Math.abs(voicingCenter(frets) - target);
    if (score < bestScore) { best = frets; bestScore = score; }
  }
  return best;
}

/** Аппликатура аккорда, ближайшая к нужному ладу, из всех форм этого типа */
export function bestVoicing(type, rootPc, tuningId, target = 5) {
  const tuning = TUNINGS[tuningId].midi;
  let best = null;
  for (const s of shapesFor(type, tuningId)) {
    const frets = placeShape(s, rootPc, tuning, target);
    if (!frets) continue;
    const d = Math.abs(voicingCenter(frets) - target);
    if (!best || d < best.distance) best = { shape: s, frets, distance: d };
  }
  return best && { shape: best.shape, frets: best.frets };
}

// ---------- пентатоника линейками ----------
/**
 * @typedef {{ string: number, fret: number, midi: number, pc: number, degree: string, degreeIndex: number }} NeckNote
 * @typedef {{ string: number, from: number, to: number, length: number }} Ruler
 * @typedef {{ index: number, notes: NeckNote[], rulers: Ruler[], minFret: number, maxFret: number }} PentaPosition
 */

/**
 * 5 позиций пентатоники методом «линеек»: позиция — 10 нот гаммы подряд, по 2 на каждой струне.
 * Две ноты на струне образуют линейку: длинную (3 лада) или короткую (2 лада).
 * Позиция 1 начинается с тоники на 6-й струне; каждая следующая — со второй ноты 6-й струны
 * предыдущей позиции («там, где кончилась линейка»).
 * Октаву позиции выбираем по Standard: в Drop D те же ноты на 6-й струне на 2 лада правее.
 * @param {number} rootPc @param {'minor' | 'major'} kind @param {number[]} tuning
 * @returns {PentaPosition[]}
 */
export function pentaPositions(rootPc, kind, tuning) {
  const P = PENTATONICS[kind];
  const std = TUNINGS.std.midi;
  const out = [];
  let start = std[0] + mod12(rootPc - std[0]);
  for (let index = 0; index < 5; index++) {
    // 12 нот подряд по гамме: ступень index, index+1 … по две на струну
    const raw = [];
    let pitch = start, deg = index;
    for (let i = 0; i < 12; i++) {
      if (i > 0) pitch += P.steps[deg++ % 5];
      raw.push({ string: Math.floor(i / 2), midi: pitch, degreeIndex: deg % 5 });
    }
    let shift = raw.some(n => n.midi < std[n.string]) ? 12 : 0;
    const frets = raw.map(n => n.midi + shift - tuning[n.string]);
    if (Math.max(...frets) > MAX_FRET && Math.min(...frets) >= 12) shift -= 12;
    const notes = raw.map(n => {
      const midi = n.midi + shift;
      return { string: n.string, fret: midi - tuning[n.string], midi, pc: mod12(midi), degreeIndex: n.degreeIndex, degree: degreeLabel(P.st[n.degreeIndex], P.letters[n.degreeIndex]) };
    });
    const rulers = [0, 1, 2, 3, 4, 5].map(s => {
      const [a, b] = notes.filter(n => n.string === s);
      return { string: s, from: a.fret, to: b.fret, length: b.fret - a.fret };
    });
    const fs = notes.map(n => n.fret);
    out.push({ index, notes, rulers, minFret: Math.min(...fs), maxFret: Math.max(...fs) });
    start = notes[1].midi;
  }
  return out;
}

/**
 * 5 позиций 7-нотного лада: окно позиции пентатоники той же «семьи» (минорной или мажорной),
 * расширенное на лад в обе стороны; в окне — все ноты лада, каждая высота один раз
 * (из двух мест выбирается ближнее к линейке, при равенстве — на более толстой струне).
 */
export function modePositions(rootPc, modeId, tuning) {
  const m = MODES[modeId];
  const pcs = m.st.map(s => mod12(rootPc + s));
  return pentaPositions(rootPc, m.family === 'major' ? 'major' : 'minor', tuning).map(pos => {
    const byMidi = new Map();
    for (const r of pos.rulers) {
      for (let f = Math.max(0, r.from - 1); f <= Math.min(MAX_FRET, r.to + 1); f++) {
        const midi = tuning[r.string] + f, i = pcs.indexOf(mod12(midi));
        if (i < 0) continue;
        const dist = f < r.from ? r.from - f : f > r.to ? f - r.to : 0;
        const prev = byMidi.get(midi);
        if (!prev || dist < prev.dist) byMidi.set(midi, { string: r.string, fret: f, midi, pc: mod12(midi), degreeIndex: i, degree: degreeLabel(m.st[i], i), dist });
      }
    }
    const notes = [...byMidi.values()].sort((a, b) => a.midi - b.midi).map(({ dist, ...n }) => n);
    const fs = notes.map(n => n.fret);
    return { index: pos.index, notes, minFret: Math.min(...fs), maxFret: Math.max(...fs), penta: pos };
  });
}

/** Все места на грифе, где звучат высоты из набора pcs */
export function neckNotes(pcs, tuning, from = 0, to = MAX_FRET) {
  const set = new Set(pcs.map(mod12));
  const out = [];
  for (let s = 0; s < 6; s++) {
    for (let f = from; f <= to; f++) {
      const midi = tuning[s] + f;
      if (set.has(mod12(midi))) out.push({ string: s, fret: f, midi, pc: mod12(midi) });
    }
  }
  return out;
}
