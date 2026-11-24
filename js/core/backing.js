// backing.js — подложка: аккорды по тактам, грувы (барабаны, бас, гитара), целевые ноты аккорда. Чистая логика.
import { mod12, pcOf, noteName } from './notes.js';
import { chordPcs, chordSymbol, CHORD_TYPES } from './chords.js';
import { diatonicChords, keyTonic, MODES, spellScale, modeDegrees } from './scales.js';

/** 5 грувов: у каждого — характер барабанов, баса и гитары */
/** @type {{ id: string, name: string, hint: string }[]} */
export const GROOVES = [
  { id: 'rock', name: 'Рок', hint: 'восьмые: бас корнем, гитара — пауэр-аккорды с глушением' },
  { id: 'half', name: 'Халфтайм', hint: 'тяжело и широко: малый на 3-ю долю' },
  { id: 'gallop', name: 'Галоп', hint: 'метал: «тыгыдык» бочкой, басом и гитарой' },
  { id: 'shuffle', name: 'Шаффл', hint: 'блюзовый свинг: корень и квинта баса' },
  { id: 'ballad', name: 'Баллада', hint: 'спокойно: перебор аккорда, бас на «раз» и «три»' },
];

/**
 * Что звучит на тике грува (4/4; beat — доля, sub — тик 0..11; bar — такт с начала, для крэша).
 * drums: голоса k/s/h/hs/c/r (core/drums.js); bass: root/fifth/octave;
 * guitar: power (удар пауэр-аккордом), chug (глушёный корень), chord, arp:N (N-я нота аккорда).
 * Крэш — на «раз» каждой фразы из 4 тактов (кроме баллады), в шаффле хэт заменяет райд.
 * @returns {{ drums: string[], bass: string | null, guitar: string | null }}
 */
export function grooveAt(groove, beat, sub, bar = 1) {
  const g = baseGroove(groove, beat, sub);
  const crash = groove !== 'ballad' && bar % 4 === 0 && beat === 0 && sub === 0;
  g.drums = g.drums.map(v => (v === 'h' && crash ? 'c' : v === 'h' && groove === 'shuffle' ? 'r' : v));
  return g;
}

/** @returns {{ drums: string[], bass: string | null, guitar: string | null }} */
function baseGroove(groove, beat, sub) {
  const two4 = beat % 2 === 1, e8 = sub === 0 || sub === 6;
  switch (groove) {
    case 'half':
      return {
        drums: [...(beat === 0 && sub === 0 ? ['k'] : []), ...(beat === 2 && sub === 0 ? ['s'] : []), ...(e8 ? ['h'] : [])],
        bass: sub === 0 && (beat === 0 || beat === 2) ? 'root' : null,
        guitar: sub === 0 && beat === 0 ? 'power' : sub === 0 && beat === 2 ? 'power' : null,
      };
    case 'gallop': {
      const g = sub === 0 || sub === 6 || sub === 9;
      return { drums: [...(g ? ['k'] : []), ...(two4 && sub === 0 ? ['s'] : []), ...(sub === 0 ? ['h'] : [])], bass: g ? 'root' : null, guitar: g ? (sub === 0 && beat === 0 ? 'power' : 'chug') : null };
    }
    case 'shuffle': {
      const sw = sub === 0 || sub === 8;
      return {
        drums: [...(sub === 0 && beat % 2 === 0 ? ['k'] : []), ...(two4 && sub === 0 ? ['s'] : []), ...(sw ? ['h'] : [])],
        bass: sw ? (beat % 2 === 0 ? 'root' : 'fifth') : null,
        guitar: sub === 0 ? 'chord' : null,
      };
    }
    case 'ballad':
      return {
        drums: [...(beat === 0 && sub === 0 ? ['k'] : []), ...(beat === 2 && sub === 0 ? ['s'] : []), ...(sub === 0 ? ['hs'] : [])],
        bass: sub === 0 && (beat === 0 || beat === 2) ? 'root' : null,
        guitar: e8 ? `arp:${beat * 2 + (sub === 6 ? 1 : 0)}` : null,
      };
    default: // rock
      return {
        drums: [...(sub === 0 && beat % 2 === 0 ? ['k'] : []), ...(beat === 2 && sub === 6 ? ['k'] : []), ...(two4 && sub === 0 ? ['s'] : []), ...(e8 ? ['h'] : [])],
        bass: e8 ? 'root' : null,
        guitar: e8 ? (sub === 0 && beat === 0 ? 'power' : 'chug') : null,
      };
  }
}

/**
 * Аккорды последовательности в тональности: ступени (0 = I) с числом тактов и, если нужно, своим типом.
 * @param {number} tonicPc @param {string} modeId
 * @param {{ degree: number, bars: number, type?: string | null }[]} items
 */
export function buildChords(tonicPc, modeId, items) {
  const tonic = keyTonic(tonicPc, modeId);
  const dia = diatonicChords(tonic, modeId);
  return items.map(it => {
    const c = dia[it.degree % 7];
    const type = it.type && CHORD_TYPES[it.type] ? it.type : c.type || 'maj';
    return { degree: c.degree, root: c.root, rootPc: c.rootPc, type, roman: c.roman, bars: [1, 2, 4].includes(it.bars) ? it.bars : 1 };
  });
}

/** Какой аккорд звучит в такте bar (последовательность повторяется по кругу) */
export function chordIndexAt(chords, bar) {
  const total = chords.reduce((s, c) => s + c.bars, 0);
  let b = ((bar % total) + total) % total;
  for (let i = 0; i < chords.length; i++) { if (b < chords[i].bars) return i; b -= chords[i].bars; }
  return 0;
}

/** Высота баса (E1…D♯2) для партии: корень, квинта или октава */
export function bassMidi(rootPc, part) {
  const root = 28 + mod12(rootPc - 4);
  return part === 'fifth' ? root + 7 : part === 'octave' ? root + 12 : root;
}

/**
 * Целевые ноты аккорда на грифе: ноты аккорда — с его ступенями (1, 3, 5, 7), остальные ноты лада —
 * тусклые, со ступенью относительно тоники. Для значков грифа.
 * @param {{ rootPc: number, type: string }} chord @param {number} tonicPc @param {string} modeId @param {number[]} tuning
 */
export function targetMarkers(chord, tonicPc, modeId, tuning, from = 0, to = 12) {
  const tones = chordPcs(chord.rootPc, chord.type);
  const toneDeg = CHORD_TYPES[chord.type].st.map((st, i) => ({ pc: mod12(chord.rootPc + st), deg: ['1', '3', '5', '7'][i] || '' }));
  const sc = MODES[modeId].st.map(s => mod12(tonicPc + s)), degs = modeDegrees(modeId);
  const out = [];
  for (let s = 0; s < 6; s++) for (let f = from; f <= to; f++) {
    const pc = mod12(tuning[s] + f);
    const ti = tones.indexOf(pc);
    if (ti >= 0) {
      const lab = CHORD_TYPES[chord.type].st[ti];
      const label = lab === 3 ? '♭3' : lab === 6 ? '♭5' : lab === 10 ? '♭7' : lab === 8 ? '♯5' : lab === 5 ? '4' : toneDeg[ti].deg;
      out.push({ string: s, fret: f, label, role: ['root', 'third', 'fifth', 'seventh'][ti] || 'other' });
    } else if (sc.includes(pc)) out.push({ string: s, fret: f, label: degs[sc.indexOf(pc)], role: 'other', dim: true });
  }
  return /** @type {import('../ui/fretboard.js').Marker[]} */ (/** @type {any} */ (out));
}

/** Подпись аккорда: символ (с немецкой нотацией) и римская ступень */
export const chordLabel = (c, german = false) => ({ symbol: chordSymbol(c.root, c.type, { german }), roman: c.roman });
/** Название тональности: «ре минор», «D dorian» по-русски */
export function keyName(tonicPc, modeId, german = false) {
  const t = keyTonic(tonicPc, modeId);
  return `${noteName(t, { german })} — ${MODES[modeId].name.toLowerCase()}`;
}
/** Ноты лада подписями — для подсказки над грифом */
export const scaleNames = (tonicPc, modeId, german = false) => spellScale(keyTonic(tonicPc, modeId), MODES[modeId].st).map(n => noteName(n, { german }));
export { pcOf };
