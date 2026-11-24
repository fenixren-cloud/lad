// lessons.js — уроки раздела «Теория». Урок — 5–10 минут: что это и зачем → покажи (гриф или круг) →
// послушай → сыграй сам (микрофон проверяет) → мини-проверка → карточки (уходят в повторения на этапе 6).
// Чистая логика: тексты, сцены (что нарисовать и сыграть) и вопросы считаются из настроек (строй, нотация).
import { mod12, noteName, ruName, spellPc, spellAs, NATURAL_PC, INTERVALS } from './notes.js';
import { CHORD_TYPES } from './chords.js';
import { MODES, BRIGHTNESS, modeDegrees, keyTonic, spellScale, FIFTHS, diatonicChords } from './scales.js';
import { TUNINGS, shapesFor, placeShape, pentaPositions, modePositions, bestVoicing, voicingMidis } from './neck.js';
import { chordInfo, chordLabelMap, pentaLabelMap, modeLabelMap, markersFor, blueNotes, upAndDown, fifthsK, keyLabel, labelMap, stringNotes } from './theory.js';

/**
 * @typedef {{ tuningId: string, tuning: number[], german: boolean, terms: string, labels: 'degrees' | 'notes', rand?: () => number }} Ctx
 * @typedef {{ string: number, fret: number, label: string, role: string, dim?: boolean, ring?: boolean }} Marker
 * @typedef {{ from: [number, number], to: [number, number], label: string }} Link
 * @typedef {{ notes: { midi: number, string?: number, fret?: number }[], beats: number, strum?: boolean, dialPc?: number }} SeqItem
 * @typedef {{ neck?: { from: number, to: number, markers: Marker[], rulers?: { string: number, from: number, to: number, long?: boolean }[], links?: Link[], focus?: number },
 *   dial?: any, chips?: { label: string, sub?: string, on?: boolean }[], grid?: string[], seq?: SeqItem[], bpm?: number, caption?: string }} Scene
 * @typedef {{ text: string, targets: { midi?: number, pc?: number, label: string }[], scene?: Scene }} Task
 * @typedef {{ q: string, options: string[], answer: number, explain?: string }} Question
 * @typedef {{ kind: 'learn' | 'listen' | 'play' | 'quiz', title: string, text?: (string | ((c: Ctx) => string))[],
 *   scene?: (c: Ctx) => Scene, task?: (c: Ctx) => Task, quiz?: (c: Ctx) => Question[] }} Step
 * @typedef {{ id: string, topic: string, title: string, minutes: number, why: string, steps: Step[], cards: string[] }} Lesson
 */

// ---------- помощники ----------
const nm = (c, pc, flat = false) => noteName(spellPc(pc, { flat }), { german: c.german });
const ru = (pc, flat = false) => ruName(spellPc(pc, { flat }), { long: true });
const where = (s, f) => `${6 - s}-я струна, ${f === 0 ? 'открытая' : `${f}-й лад`}`;
const on = (c, s, midi) => ({ midi, string: s, fret: midi - c.tuning[s] });
/**
 * Значок «нота» с подписью: имя ноты или ступень (flat — писать бемолем)
 * @param {Ctx} c @param {number} s @param {number} f @param {string} deg @param {string} role
 * @param {{ flat?: boolean, ring?: boolean, dim?: boolean }} [o]
 */
const mk =(c, s, f, deg, role, { flat = false, ...extra } = {}) => ({ string: s, fret: f, label: c.labels === 'notes' ? nm(c, c.tuning[s] + f, flat) : deg, role, ...extra });
/** Аппликатура конкретной формой (по номеру в списке форм) */
const shapeAt = (c, type, idx, rootPc, target) => placeShape(shapesFor(type, c.tuningId)[idx], rootPc, c.tuning, target);
const one = (notes, beats = 1) => ({ notes: Array.isArray(notes) ? notes : [notes], beats });
const strum = (frets, c, beats = 2) => ({ notes: frets.flatMap((f, s) => (f == null ? [] : [{ midi: c.tuning[s] + f, string: s, fret: f }])), beats, strum: true });
/** Случайный выбор (в проверках можно подставить свой генератор) */
const pick = (c, list) => list[Math.floor((c.rand || Math.random)() * list.length) % list.length];
const uniq = list => [...new Set(list)];
/** Варианты ответа: правильный первым, остальные — без повторов */
const q = (text, right, wrong, explain = '') => ({ q: text, options: uniq([right, ...wrong]).slice(0, 4), answer: 0, explain });

/** Аппликатура аккорда формой с корнем на струне rootString ближе к ладу target */
function voicing(c, type, rootPc, rootString, target = 5) {
  const shape = shapesFor(type, c.tuningId).find(s => s.rootString === rootString) || shapesFor(type, c.tuningId)[0];
  return placeShape(shape, rootPc, c.tuning, target);
}
function chordMarkers(c, frets, rootPc, type) {
  const map = chordLabelMap(rootPc, type, c.german);
  const notes = frets.flatMap((f, s) => (f == null ? [] : [{ string: s, fret: f, pc: mod12(c.tuning[s] + f) }]));
  return markersFor(notes, map, { labels: c.labels });
}
const fretsSpan = (frets, pad = 1) => { const u = frets.filter(f => f != null); return { from: Math.max(0, Math.min(...u) - pad), to: Math.min(22, Math.max(...u) + pad + 1) }; };

// ---------- уроки ----------
/** @type {Lesson[]} */
export const LESSONS = [
  // ===== Гриф и интервалы =====
  {
    id: 'neck-clock', topic: 'neck', title: '12 нот по кругу', minutes: 6,
    why: 'Чтобы находить любую ноту без зубрёжки: гриф — это циферблат из 12 нот, который повторяется.',
    cards: ['neck:tight-pairs', 'neck:octave'],
    steps: [
      { kind: 'learn', title: 'Циферблат из 12 нот',
        text: ['В музыке всего 12 разных нот, дальше они повторяются выше или ниже — через октаву. Их удобно представить циферблатом: 12 «часов», один час — один полутон.',
          'На гитаре полутон — это один лад. Открытая струна и её 12-й лад — одна и та же нота, только на октаву выше: круг замкнулся.',
          'Семь нот без знаков — до, ре, ми, фа, соль, ля, си — стоят через 2 лада. Кроме двух пар: ми–фа и си–до стоят вплотную, через 1 лад. Между остальными есть промежуточные ноты с ♯ или ♭.'],
        scene: c => {
          const naturals = stringNotes(1, c.tuning, 0, 12);
          return {
            dial: { layout: 'chroma', nodes: Array.from({ length: 12 }, (_, pc) => ({ pc, label: nm(c, pc), role: NATURAL_PC.includes(pc) ? 'other' : 'none', ring: [4, 5, 11, 0].includes(pc) })), center: { big: '12', small: 'нот в октаве' } },
            neck: { from: 0, to: 12, markers: naturals.map(n => ({ string: 1, fret: n.fret, label: nm(c, n.pc), role: n.pc === 9 ? 'root' : 'other', dim: !!n.note.acc, ring: [4, 5, 11, 0].includes(n.pc) })) },
            caption: 'Обведены пары ми–фа и си–до: между ними нет промежуточной ноты. На грифе — 5-я струна: 13 ладов от ля до ля.',
          };
        } },
      { kind: 'listen', title: 'Хроматика по 5-й струне',
        text: ['13 нот подряд, каждый лад по очереди: от ля до ля на октаву выше. Следи, как точка идёт по кругу.'],
        scene: c => ({
          dial: { layout: 'chroma', nodes: Array.from({ length: 12 }, (_, pc) => ({ pc, label: nm(c, pc), role: NATURAL_PC.includes(pc) ? 'other' : 'none' })) },
          neck: { from: 0, to: 12, markers: [] },
          seq: Array.from({ length: 13 }, (_, f) => ({ notes: [on(c, 1, c.tuning[1] + f)], beats: 0.5, dialPc: mod12(c.tuning[1] + f) })), bpm: 100,
        }) },
      { kind: 'play', title: 'Сыграй сам',
        task: c => ({ text: 'Сыграй на 5-й струне по очереди: ля (открытая), си (2-й лад), до (3-й лад). Между си и до — всего один лад.',
          targets: [{ midi: 45, label: 'ля — открытая 5-я' }, { midi: 47, label: 'си — 5-я струна, 2-й лад' }, { midi: 48, label: 'до — 5-я струна, 3-й лад' }],
          scene: { neck: { from: 0, to: 5, markers: [mk(c, 1, 0, '1', 'root'), mk(c, 1, 2, '2', 'other'), mk(c, 1, 3, '♭3', 'third')] } } }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => {
          const base = pick(c, [0, 2, 5, 7, 9]); // до, ре, фа, соль, ля — через 2 лада будет натуральная нота
          return [
            q('Какая нота на 1 лад выше ми?', 'фа', ['фа-диез', 'ре'], 'Ми и фа стоят вплотную — между ними нет промежуточной ноты.'),
            q(`Какая нота на 2 лада выше ноты «${ru(base)}»?`, ru(base + 2), [ru(base + 1), ru(base + 3, true)], 'Два лада — два полутона, то есть два «часа» на круге.'),
            q('На каком ладу открытая струна звучит на октаву выше?', 'на 12-м', ['на 7-м', 'на 5-м'], '12 ладов — 12 полутонов — полный круг.'),
          ];
        } },
    ],
  },
  {
    id: 'neck-strings', topic: 'neck', title: 'Соседняя струна: +5, а G→B: +4', minutes: 6,
    why: 'Чтобы переносить ноты и фигуры со струны на струну — и понимать, почему на струне си всё сдвигается.',
    cards: ['neck:next-string', 'neck:gb-shift'],
    steps: [
      { kind: 'learn', title: 'Как настроены струны',
        text: ['Каждая следующая (более тонкая) струна звучит на 5 полутонов выше. Поэтому 5-й лад струны — та же нота, что открытая следующая струна. Так гитару и настраивают по слуху.',
          'Исключение одно: между 3-й (соль) и 2-й (си) — 4 полутона. Там та же нота — на 4-м ладу. Поэтому любая фигура — аккорд или гамма — при переходе на струну си сдвигается на лад правее.',
          c => (c.tuningId === 'dropd' ? 'У тебя сейчас Drop D: 6-я струна опущена до ре, и до 5-й струны 7 полутонов — квинта. Та же нота, что открытая 5-я, — на 7-м ладу 6-й струны.' : 'В Drop D 6-я струна опущена до ре — между 6-й и 5-й получается 7 полутонов (квинта): та же нота окажется на 7-м ладу.')],
        scene: c => {
          const markers = [], links = [];
          for (let s = 0; s < 5; s++) {
            const gap = c.tuning[s + 1] - c.tuning[s];
            markers.push({ string: s, fret: gap, label: nm(c, c.tuning[s + 1]), role: 'other', ring: gap !== 5 });
            markers.push({ string: s + 1, fret: 0, label: nm(c, c.tuning[s + 1]), role: 'other', ring: gap !== 5 });
            links.push({ from: [s, gap], to: [s + 1, 0], label: `+${gap}` });
          }
          return { neck: { from: 0, to: 8, markers, links }, caption: 'Одинаковые ноты на соседних струнах. Обведены исключения: переход G→B (+4)' + (c.tuningId === 'dropd' ? ' и 6-я → 5-я в Drop D (+7).' : '.') };
        } },
      { kind: 'listen', title: 'Пары звучат одинаково',
        text: ['Каждая пара — одна и та же нота: сначала на ладу, потом на открытой струне выше.'],
        scene: c => ({
          neck: { from: 0, to: 8, markers: [] },
          seq: [0, 1, 2, 3, 4].flatMap(s => { const gap = c.tuning[s + 1] - c.tuning[s]; return [one(on(c, s, c.tuning[s] + gap)), one(on(c, s + 1, c.tuning[s + 1]))]; }), bpm: 90,
        }) },
      { kind: 'play', title: 'Проверь сам',
        task: c => {
          const g = c.tuning[1] - c.tuning[0];
          return { text: `Сыграй ля дважды: на 6-й струне (${g}-й лад) и на открытой 5-й. Потом си дважды: 3-я струна, 4-й лад, и открытая 2-я.`,
            targets: [{ midi: 45, label: `ля — 6-я струна, ${g}-й лад` }, { midi: 45, label: 'ля — открытая 5-я' }, { midi: 59, label: 'си — 3-я струна, 4-й лад' }, { midi: 59, label: 'си — открытая 2-я' }],
            scene: { neck: { from: 0, to: 8, markers: [mk(c, 0, g, '1', 'root'), mk(c, 1, 0, '1', 'root'), mk(c, 3, 4, '1', 'char'), mk(c, 4, 0, '1', 'char')], links: [{ from: [0, g], to: [1, 0], label: `+${g}` }, { from: [3, 4], to: [4, 0], label: '+4' }] } } };
        } },
      { kind: 'quiz', title: 'Проверка',
        quiz: () => [
          q('5-й лад 2-й струны звучит как…', 'открытая 1-я (ми)', ['открытая 3-я (соль)', 'открытая 4-я (ре)'], 'Следующая струна — на 5 полутонов выше.'),
          q('На каком ладу 3-й струны звучит открытая 2-я?', 'на 4-м', ['на 5-м', 'на 3-м'], 'Между соль и си 4 полутона — единственное исключение.'),
          q('В Drop D та же нота, что открытая 5-я струна, — на каком ладу 6-й?', 'на 7-м', ['на 5-м', 'на 2-м'], 'Ре → ля — 7 полутонов, квинта.'),
        ] },
    ],
  },
  {
    id: 'neck-low', topic: 'neck', title: 'Ноты на 6-й и 5-й струнах', minutes: 7,
    why: 'На 6-й и 5-й струнах лежат корни пауэр-аккордов и баррэ: знаешь ноты здесь — найдёшь любой аккорд.',
    cards: ['neck:low-strings'],
    steps: [
      { kind: 'learn', title: 'Ориентиры — метки на грифе',
        text: ['Метки на 3, 5, 7, 9 и 12-м ладах — твои ориентиры. Запомни ноты возле них на двух нижних струнах, остальное найдётся от соседей.',
          c => `На 6-й струне: ${stringNotes(0, c.tuning, 1, 12, { naturals: true }).map(n => `${ruName(n.note)} (${n.fret})`).join(', ')}.`,
          c => `На 5-й струне: ${stringNotes(1, c.tuning, 1, 12, { naturals: true }).map(n => `${ruName(n.note)} (${n.fret})`).join(', ')}.`,
          'Промежуточные ноты — на ладу между соседями: например, фа-диез — между фа и соль.'],
        scene: c => ({ neck: { from: 0, to: 12, markers: [0, 1].flatMap(s => stringNotes(s, c.tuning, 0, 12, { naturals: true }).map(n => ({ string: s, fret: n.fret, label: nm(c, n.pc), role: 'other' }))) },
          caption: 'Ноты без знаков на 6-й и 5-й струнах. Подписаны всегда именами нот — здесь важны именно они.' }) },
      { kind: 'listen', title: 'Вверх по 6-й струне',
        text: ['Ноты без знаков на 6-й струне по порядку, до 12-го лада.'],
        scene: c => ({ neck: { from: 0, to: 12, markers: [] }, seq: stringNotes(0, c.tuning, 0, 12, { naturals: true }).map(n => one({ midi: n.midi, string: 0, fret: n.fret })), bpm: 96 }) },
      { kind: 'play', title: 'Найди и сыграй',
        task: c => ({ text: 'Сыграй соль на 6-й струне, потом до на 5-й струне.',
          targets: [{ midi: 43, label: `соль — ${where(0, 43 - c.tuning[0])}` }, { midi: 48, label: `до — ${where(1, 48 - c.tuning[1])}` }],
          scene: { neck: { from: 0, to: 8, markers: [] } } }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => {
          const pool = [0, 1].flatMap(s => stringNotes(s, c.tuning, 1, 12, { naturals: true }).map(n => ({ s, ...n })));
          const used = new Set();
          return [0, 1, 2].map(() => {
            let n = pick(c, pool), guard = 0;
            while (used.has(`${n.s}:${n.fret}`) && guard++ < 20) n = pick(c, pool);
            used.add(`${n.s}:${n.fret}`);
            const wrong = [n.fret + 2, n.fret - 1, n.fret + 1, n.fret - 2].filter(f => f >= 0 && f <= 12 && f !== n.fret).slice(0, 2);
            return q(`На каком ладу ${6 - n.s}-й струны нота ${ruName(n.note)}?`, `${n.fret}`, wrong.map(String), `${ruName(n.note)} — ${where(n.s, n.fret)}.`);
          });
        } },
    ],
  },
  {
    id: 'neck-intervals', topic: 'neck', title: 'Интервалы: квинта, октава, терции', minutes: 8,
    why: 'Интервалы — кирпичики аккордов и мелодий. На гитаре у каждого своя постоянная фигура.',
    cards: ['iv:fifth', 'iv:octave', 'iv:thirds'],
    steps: [
      { kind: 'learn', title: 'Расстояние в полутонах',
        text: ['Интервал — расстояние между двумя нотами в полутонах (ладах). Квинта (7) — устойчивая и мощная, октава (12) — та же нота выше, малая терция (3) — грустная, большая терция (4) — светлая.',
          'Квинта: соседняя струна, на 2 лада правее. Октава: через струну, на 2 лада правее (если по пути переход G→B — на 3). Корень, квинта и октава вместе — пауэр-аккорд.',
          'Малая терция — на той же струне +3 лада. Большая терция — на соседней струне, на 1 лад левее.'],
        scene: c => ({
          neck: { from: 0, to: 8, markers: [mk(c, 1, 3, '1', 'root'), mk(c, 2, 5, '5', 'fifth'), mk(c, 3, 5, '8', 'root'), mk(c, 1, 6, '♭3', 'third', { flat: true }), mk(c, 2, 2, '3', 'third')],
            links: [{ from: [1, 3], to: [2, 5], label: 'ч5' }, { from: [1, 3], to: [3, 5], label: 'ч8' }, { from: [1, 3], to: [1, 6], label: 'м3' }, { from: [1, 3], to: [2, 2], label: 'б3' }] },
          caption: 'От до на 5-й струне (3-й лад): квинта, октава, малая и большая терции.' }) },
      { kind: 'listen', title: 'Как звучат',
        text: ['Каждый интервал — сначала по очереди, потом вместе: квинта, октава, малая терция, большая терция.'],
        scene: c => {
          const root = on(c, 1, 48), pairs = [on(c, 2, 55), on(c, 3, 60), on(c, 1, 51), on(c, 2, 52)];
          return { neck: { from: 0, to: 8, markers: [] }, seq: pairs.flatMap(p => [one(root), one(p), { notes: [root, p], beats: 2 }]), bpm: 100 };
        } },
      { kind: 'play', title: 'Сыграй квинту',
        task: c => ({ text: 'Сыграй до (5-я струна, 3-й лад) и его квинту — соль (4-я струна, 5-й лад).',
          targets: [{ midi: 48, label: 'до — 5-я струна, 3-й лад' }, { midi: 55, label: 'соль — 4-я струна, 5-й лад' }],
          scene: { neck: { from: 0, to: 8, markers: [mk(c, 1, 3, '1', 'root'), mk(c, 2, 5, '5', 'fifth')], links: [{ from: [1, 3], to: [2, 5], label: '+7' }] } } }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => {
          const iv = pick(c, [3, 4, 5, 7, 12]);
          return [
            q(`Сколько полутонов в интервале «${INTERVALS[iv].name}»?`, String(iv), [String(iv === 12 ? 7 : iv + 1), String(iv === 3 ? 5 : iv - 1)], `${INTERVALS[iv].name}: ${iv} полутонов.`),
            q('Где квинта от ноты на 6-й струне (Standard)?', 'на 5-й струне, +2 лада', ['на 5-й струне, тот же лад', 'на 4-й струне, +2 лада'], 'Соседняя струна выше на 5, а квинта — 7: 7 − 5 = 2 лада правее.'),
            q('Малая терция звучит…', 'грустно — это ♭3', ['светло — это 3', 'пусто — это 5'], 'Малая терция делает аккорд и гамму минорными.'),
          ];
        } },
    ],
  },

  // ===== Аккорды =====
  {
    id: 'chords-power', topic: 'chords', title: 'Пауэр-аккорд: Standard и Drop D', minutes: 6,
    why: 'Основа рок- и метал-риффов. В Drop D он берётся одним пальцем — отсюда скорость и тяжесть.',
    cards: ['chord:power', 'chord:power-dropd'],
    steps: [
      { kind: 'learn', title: 'Корень и квинта',
        text: ['Пауэр-аккорд — корень и квинта (1 и 5), иногда с октавой сверху. Терции нет, поэтому он ни мажорный, ни минорный — и не «грязнится» даже на сильном перегрузе.',
          'В Standard: корень на 6-й или 5-й струне, квинта — на соседней струне на 2 лада правее. Указательный и безымянный пальцы.',
          'В Drop D 6-я струна опущена на тон, и квинта от неё — на 5-й струне на том же ладу. Пауэр-аккорд от 6-й берётся одним пальцем поперёк трёх струн.'],
        scene: c => {
          const low = c.tuningId === 'dropd' ? 2 : 4;
          const a = shapeAt(c, 'power', 1, low, 0), b = shapeAt(c, 'power', 1, 7, 4);
          return { neck: { from: 0, to: 8, markers: [...chordMarkers(c, a, low, 'power'), ...chordMarkers(c, b, 7, 'power')] },
            caption: c.tuningId === 'dropd' ? 'Drop D: D5 на открытых струнах и G5 на 5-м ладу — одним пальцем.' : 'Standard: E5 на открытых струнах и G5 на 3-м ладу — корень на 6-й, квинта на 5-й на 2 лада правее.' };
        } },
      { kind: 'listen', title: 'Маленький рифф',
        text: ['Четыре пауэр-аккорда от 6-й струны — тяжёлый рифф на нижних ладах.'],
        scene: c => {
          const roots = c.tuningId === 'dropd' ? [2, 5, 7, 2] : [4, 7, 9, 4];
          return { neck: { from: 0, to: 10, markers: [] }, seq: roots.map(r => strum(voicing(c, 'power', r, 0, 3), c, 1)), bpm: 90 };
        } },
      { kind: 'play', title: 'Корень и квинта',
        task: c => {
          const root = on(c, 0, 43), fifth = on(c, 1, 50);
          return { text: `Сыграй G5 по нотам: сначала корень соль (${where(0, root.fret)}), потом квинту ре (${where(1, fifth.fret)}).`,
            targets: [{ midi: 43, label: `соль — ${where(0, root.fret)}` }, { midi: 50, label: `ре — ${where(1, fifth.fret)}` }],
            scene: { neck: { from: 0, to: 8, markers: [mk(c, 0, root.fret, '1', 'root'), mk(c, 1, fifth.fret, '5', 'fifth')] } } };
        } },
      { kind: 'quiz', title: 'Проверка',
        quiz: () => [
          q('Из каких ступеней пауэр-аккорд?', '1 и 5', ['1 и 3', '1, 3 и 5'], 'Корень и квинта; октава — та же нота, что корень.'),
          q('Пауэр-аккорд от 6-й струны в Drop D берётся…', 'одним пальцем на одном ладу', ['как в Standard: квинта на 2 лада правее', 'только на открытых струнах'], 'Между 6-й и 5-й в Drop D — квинта, поэтому лад одинаковый.'),
          q('Почему пауэр-аккорд хорошо звучит с перегрузом?', 'в нём нет терции — меньше «грязи»', ['он громче обычного аккорда', 'в нём больше нот'], 'Терция на перегрузе даёт неровные биения; квинта — нет.'),
        ] },
    ],
  },
  {
    id: 'chords-triads', topic: 'chords', title: 'Мажор и минор: 4+3 и 3+4', minutes: 7,
    why: 'Мажор и минор отличаются одной нотой. Увидишь фигуру на круге — поймёшь любой аккорд.',
    cards: ['chord:maj', 'chord:min', 'chord:sus-dim-aug'],
    steps: [
      { kind: 'learn', title: 'Треугольник на круге',
        text: ['Трезвучие — три ноты через одну: 1, 3, 5. Мажор и минор различаются только терцией.',
          'На круге мажор — треугольник со сторонами 4, 3 и 5 полутонов. Минор — тот же треугольник, перевёрнутый: 3, 4 и 5. Терция ниже на полутон — и аккорд из светлого стал грустным.',
          'Ещё три фигуры: sus4 (5 + 2) — «подвешенный», хочет разрешиться в мажор; уменьшённый (3 + 3) — тесный, тревожный; увеличенный (4 + 4) — равносторонний, будто зависает.'],
        scene: c => {
          const ci = chordInfo(9, 'maj', c.german);
          return { dial: { layout: 'chroma', nodes: ci.pcs.map((pc, i) => ({ pc, label: ci.names[i], role: ['root', 'third', 'fifth'][i] })), polygon: { root: 9, type: 'maj' }, center: { big: nm(c, 9), small: '4 + 3 + 5' } },
            neck: { from: 3, to: 9, markers: chordMarkers(c, voicing(c, 'maj', 9, 0, 5), 9, 'maj') }, caption: 'Ля мажор: фигура на круге и форма E на 5-м ладу.' };
        } },
      { kind: 'listen', title: 'Мажор → минор → sus4',
        text: ['Ля мажор, ля минор, потом ля sus4 и снова мажор. В миноре меняется одна нота: до-диез → до.'],
        scene: c => {
          const ci = chordInfo(9, 'min', c.german);
          return { dial: { layout: 'chroma', nodes: ci.pcs.map((pc, i) => ({ pc, label: ci.names[i], role: ['root', 'third', 'fifth'][i] })), polygon: { root: 9, type: 'min' }, center: { big: `${nm(c, 9)}m`, small: '3 + 4 + 5' } },
            neck: { from: 3, to: 9, markers: chordMarkers(c, voicing(c, 'min', 9, 0, 5), 9, 'min') },
            seq: [['maj', 2], ['min', 2], ['sus4', 2], ['maj', 3]].map(([t, b]) => strum(voicing(c, /** @type {string} */ (t), 9, 0, 5), c, Number(b))), bpm: 80 };
        } },
      { kind: 'play', title: 'Ноты ля минора',
        task: () => ({ text: 'Сыграй по очереди ноты ля минора: ля, до, ми — в любом месте грифа.',
          targets: [{ pc: 9, label: 'ля' }, { pc: 0, label: 'до' }, { pc: 4, label: 'ми' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: () => [
          q('Стороны мажорного треугольника на круге:', '4, 3 и 5', ['3, 4 и 5', '4, 4 и 4'], 'Большая терция (4), малая (3) и обратно к корню (5).'),
          q('Чем минор отличается от мажора?', 'терция на полутон ниже', ['квинта на полутон ниже', 'другой корень'], '1 3 5 → 1 ♭3 5.'),
          q('Ступени уменьшённого трезвучия:', '1 ♭3 ♭5', ['1 3 ♯5', '1 4 5'], 'Две малые терции подряд: 3 + 3.'),
        ] },
    ],
  },
  {
    id: 'chords-barre', topic: 'chords', title: 'Баррэ: формы E и A', minutes: 8,
    why: 'Две формы — и любой мажорный или минорный аккорд в любом месте грифа.',
    cards: ['chord:e-shape', 'chord:a-shape'],
    steps: [
      { kind: 'learn', title: 'Одна фигура — двенадцать аккордов',
        text: ['Открытые аккорды E и Am можно перенести вверх по грифу: указательный палец зажимает все струны на одном ладу (баррэ) и заменяет порожек, остальные пальцы держат ту же фигуру.',
          'Форма E — корень на 6-й струне. На каком ладу корень, такой и аккорд: 3-й лад — соль мажор, 5-й — ля мажор. Форма Em — то же для минора.',
          'Форма A — корень на 5-й струне: 3-й лад — до мажор, 5-й — ре мажор. Нужен аккорд — найди корень на 6-й или 5-й струне.',
          c => (c.tuningId === 'dropd' ? 'В Drop D у формы E корень на 6-й струне на 2 лада правее остальной фигуры. Проще брать форму A или не играть 6-ю струну.' : '')],
        scene: c => {
          const v = voicing(c, 'maj', 7, 0, 3);
          return { neck: { ...fretsSpan(v), markers: chordMarkers(c, v, 7, 'maj') }, caption: 'Соль мажор формой E: корень на 6-й струне.' };
        } },
      { kind: 'listen', title: 'G → C → D → G',
        text: ['Соль формой E, до и ре формой A, снова соль. Корни: 6-я струна, 5-я, 5-я, 6-я.'],
        scene: c => {
          const chords = [[7, 0], [0, 1], [2, 1], [7, 0]].map(([pc, s]) => voicing(c, 'maj', pc, s, 4));
          return { neck: { from: 0, to: 10, markers: chordMarkers(c, chords[1], 0, 'maj') }, seq: chords.map(v => strum(v, c, 2)), bpm: 90 };
        } },
      { kind: 'play', title: 'Найди корни',
        task: c => ({ text: 'Сыграй корень формы E для соль (6-я струна) и корень формы A для до (5-я струна).',
          targets: [{ midi: 43, label: `соль — ${where(0, 43 - c.tuning[0])}` }, { midi: 48, label: 'до — 5-я струна, 3-й лад' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => {
          const fe = pick(c, [1, 3, 5, 7, 8, 10]), fa = pick(c, [2, 3, 5, 7, 8, 10]);
          const e = mod12(c.tuning[0] + fe), a = mod12(c.tuning[1] + fa);
          return [
            q(`Форма E с корнем на ${fe}-м ладу — какой мажор?`, nm(c, e), [nm(c, e + 2), nm(c, e - 1)], `${6}-я струна, ${fe}-й лад — ${nm(c, e)}.`),
            q(`Форма A с корнем на ${fa}-м ладу — какой мажор?`, nm(c, a), [nm(c, a + 1), nm(c, a - 2)], `5-я струна, ${fa}-й лад — ${nm(c, a)}.`),
            q('Где корень у формы A?', 'на 5-й струне', ['на 6-й струне', 'на 4-й струне'], 'Форма A — это открытый ля мажор, перенесённый по грифу.'),
          ];
        } },
    ],
  },

  // ===== Квинтовый круг =====
  {
    id: 'fifths-circle', topic: 'fifths', title: 'Квинтовый круг и знаки', minutes: 7,
    why: 'Карта тональностей: сколько знаков, какие аккорды рядом и какой минор живёт в тех же нотах.',
    cards: ['key:signatures', 'key:relative'],
    steps: [
      { kind: 'learn', title: 'Шаг — квинта',
        text: ['Если идти от до вверх по квинтам (+7 полутонов), пройдёшь все 12 нот и вернёшься в до. Это квинтовый круг — карта тональностей.',
          c => `По часовой стрелке у каждой мажорной тональности на один диез больше: ${nm(c, 7)} — 1♯, ${nm(c, 2)} — 2♯, ${nm(c, 9)} — 3♯, ${nm(c, 4)} — 4♯. Против часовой — бемоли: ${nm(c, 5)} — 1♭, ${nm(c, 10, true)} — 2♭, ${nm(c, 3, true)} — 3♭.`,
          c => `Внутри круга — параллельные миноры: те же ноты и знаки, тоника на малую терцию ниже. ${keyLabel(0, 'maj', c)} и ${keyLabel(9, 'min', c)} — без знаков, ${keyLabel(5, 'maj', c)} и ${keyLabel(2, 'min', c)} — один бемоль.`],
        scene: () => ({ dial: { layout: 'fifths', selected: { pc: 0, kind: 'maj' }, sector: true } }) },
      { kind: 'listen', title: 'По кругу',
        text: ['Тоники по кругу по часовой: до, соль, ре, ля, ми — каждая на квинту выше предыдущей.'],
        scene: c => ({ dial: { layout: 'fifths', selected: { pc: 0, kind: 'maj' } },
          seq: [0, 7, 2, 9, 4].map(pc => ({ notes: [{ midi: 43 + mod12(pc - 7) }], beats: 1, dialPc: pc })), bpm: 80 }) },
      { kind: 'play', title: 'Тоники по кругу',
        task: () => ({ text: 'Сыграй тоники по кругу: до, соль, ре — в любом месте грифа.', targets: [{ pc: 0, label: 'до' }, { pc: 7, label: 'соль' }, { pc: 2, label: 'ре' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => {
          const k = pick(c, [1, 2, 3, 4, 11, 10, 9]);
          const f = FIFTHS[k], n = f.signature.list.length, sign = f.signature.sharps ? '♯' : '♭';
          return [
            q(`Сколько знаков в тональности ${keyLabel(f.pc, 'maj', c)}?`, `${n}${sign}`, [`${n + 1}${sign}`, `${n}${sign === '♯' ? '♭' : '♯'}`], `${keyLabel(f.pc, 'maj', c)} — ${k <= 6 ? k : 12 - k}-й шаг от до ${k <= 6 ? 'по часовой' : 'против часовой'}.`),
            q(`Параллельный минор для ${keyLabel(5, 'maj', c)}:`, keyLabel(2, 'min', c), [keyLabel(5, 'min', c), keyLabel(9, 'min', c)], 'Тоника на малую терцию ниже, те же знаки.'),
            q('Что меняется при шаге по кругу по часовой?', 'на один диез больше', ['на один бемоль больше', 'тоника на полутон выше'], 'Каждый шаг — квинта вверх и +1♯.'),
          ];
        } },
    ],
  },
  {
    id: 'fifths-degrees', topic: 'fifths', title: 'Ступени: ре минор и V → I', minutes: 8,
    why: 'Чтобы знать, какие аккорды «свои» в тональности, и сочинять последовательности, а не гадать.',
    cards: ['key:dm-chords', 'key:v-i'],
    steps: [
      { kind: 'learn', title: 'Семь аккордов тональности',
        text: ['Из 7 нот тональности строятся 7 аккордов — по одному на каждой ступени. Их обозначают римскими цифрами: большие — мажорные, маленькие — минорные, ° — уменьшённые.',
          c => `В ре миноре: ${diatonicChords(keyTonic(2, 'aeolian'), 'aeolian').map(d => `${d.roman} — ${noteName(d.root, { german: c.german })}${CHORD_TYPES[d.type].sym}`).join(', ')}. Рок и метал любят i, VI и VII.`,
          'Аккорд на V ступени тянет домой, в I. В миноре тяга сильнее, если v сделать мажорным — так делает гармонический минор. A → Dm звучит как точка в конце фразы.'],
        scene: c => ({ dial: { layout: 'fifths', selected: { pc: 2, kind: 'min' }, sector: true },
          chips: diatonicChords(keyTonic(2, 'aeolian'), 'aeolian').map(d => ({ label: noteName(d.root, { german: c.german }) + CHORD_TYPES[d.type].sym, sub: d.roman })) }) },
      { kind: 'listen', title: 'Dm – B♭ – C – Dm, потом A → Dm',
        text: ['Эпичная минорная последовательность i–VI–VII–i, а потом мажорная доминанта A → Dm: «домой».'],
        scene: c => {
          const ch = [[2, 'min'], [10, 'maj'], [0, 'maj'], [2, 'min'], [9, 'maj'], [2, 'min']];
          return { dial: { layout: 'fifths', selected: { pc: 2, kind: 'min' }, sector: true },
            seq: ch.map(([pc, t], i) => ({ ...strum(bestVoicing(/** @type {string} */ (t), Number(pc), c.tuningId, 5).frets, c, i === 5 ? 4 : 2), dialPc: Number(pc) })), bpm: 90 };
        } },
      { kind: 'play', title: 'Корни последовательности',
        task: () => ({ text: 'Сыграй корни: ре, си-бемоль, до, ре — в любом месте грифа.', targets: [{ pc: 2, label: 'ре' }, { pc: 10, label: 'си-бемоль' }, { pc: 0, label: 'до' }, { pc: 2, label: 'ре' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => [
          q('Какой аккорд на VI ступени ре минора?', nm(c, 10, true), [nm(c, 11), nm(c, 7)], 'Ре минор: VI — си-бемоль мажор.'),
          q('Какая ступень сильнее всего тянет «домой»?', 'V', ['IV', 'VI'], 'Доминанта разрешается в тонику.'),
          q('Сколько аккордов в секторе тональности на квинтовом круге?', '6', ['7', '3'], 'Три мажорных соседа (IV, I, V) и их параллельные миноры; седьмой — уменьшённый — вне сектора.'),
        ] },
    ],
  },

  // ===== Пентатоника =====
  {
    id: 'penta-pos1', topic: 'penta', title: 'Позиция 1 линейками', minutes: 8,
    why: 'Пентатоника — основа рок-соло. Линейки делают позицию понятной фигурой, а не набором точек.',
    cards: ['penta:pos1', 'penta:rulers'],
    steps: [
      { kind: 'learn', title: '5 нот и линейки',
        text: ['Минорная пентатоника — 5 нот: 1, ♭3, 4, 5, ♭7. В ля миноре: ля, до, ре, ми, соль.',
          'Позиция — 10 нот подряд, по 2 на каждой струне. Две ноты на струне — «линейка»: длинная (3 лада) или короткая (2 лада).',
          c => {
            const p = pentaPositions(9, 'minor', c.tuning)[0];
            return `Позиция 1 начинается с тоники на 6-й струне: длинная → 3 короткие → 2 длинные. В ля: ${p.rulers.map(r => `${r.from}–${r.to}`).join(', ')}.`;
          }],
        scene: c => {
          const p = pentaPositions(9, 'minor', c.tuning)[0];
          return { neck: { from: Math.max(0, p.minFret - 1), to: p.maxFret + 2, markers: markersFor(p.notes, pentaLabelMap(9, 'minor', c.german), { labels: c.labels }), rulers: p.rulers.map(r => ({ ...r, long: r.length >= 3 })) },
            caption: 'Ля-минорная пентатоника, позиция 1. Светлые полосы — длинные линейки, тёмные — короткие.' };
        } },
      { kind: 'listen', title: 'Вверх и вниз',
        text: ['Позиция 1 вверх и обратно вниз — так её и учат.'],
        scene: c => {
          const p = pentaPositions(9, 'minor', c.tuning)[0];
          return { neck: { from: Math.max(0, p.minFret - 1), to: p.maxFret + 2, markers: markersFor(p.notes, pentaLabelMap(9, 'minor', c.german), { labels: c.labels, dim: () => true }), rulers: p.rulers.map(r => ({ ...r, long: r.length >= 3 })) },
            seq: upAndDown(p.notes).map(n => one(n, 0.5)), bpm: 90 };
        } },
      { kind: 'play', title: 'Сыграй позицию',
        task: c => {
          const p = pentaPositions(9, 'minor', c.tuning)[0];
          const up = upAndDown(p.notes).slice(0, p.notes.length);
          return { text: 'Сыграй позицию 1 вверх — 12 нот, от ля на 6-й струне. Приложение отметит каждую.',
            targets: up.map(n => ({ midi: n.midi, label: `${ru(n.pc)} — ${where(n.string, n.fret)}` })),
            scene: { neck: { from: Math.max(0, p.minFret - 1), to: p.maxFret + 2, markers: markersFor(p.notes, pentaLabelMap(9, 'minor', c.german), { labels: c.labels }), rulers: p.rulers.map(r => ({ ...r, long: r.length >= 3 })) } } };
        } },
      { kind: 'quiz', title: 'Проверка',
        quiz: () => [
          q('Сколько нот на каждой струне в позиции?', '2', ['3', '1'], 'Поэтому и линейки: две ноты — длинная или короткая.'),
          q('Линейки позиции 1 с 6-й по 1-ю струну:', 'Д К К К Д Д', ['К К Д Д К К', 'Д Д К К К Д'], 'Длинная → 3 короткие → 2 длинные.'),
          q('Ступени минорной пентатоники:', '1 ♭3 4 5 ♭7', ['1 2 3 5 6', '1 ♭3 5 ♭7'], 'Натуральный минор без 2 и ♭6.'),
        ] },
    ],
  },
  {
    id: 'penta-positions', topic: 'penta', title: 'Пять позиций: цикл 3-2-2-3-2', minutes: 9,
    why: 'Чтобы играть пентатонику по всему грифу и переходить из позиции в позицию без зубрёжки.',
    cards: ['penta:cycle', 'penta:b-shift', 'penta:pos2'],
    steps: [
      { kind: 'learn', title: 'Правило без зубрёжки',
        text: ['Соседние ноты минорной пентатоники отстоят на 3-2-2-3-2 полутона, и цикл повторяется. Поэтому позиций ровно пять.',
          'Следующая позиция начинается там, где кончилась линейка предыдущей: вторая нота на 6-й струне в позиции 1 — первая нота позиции 2.',
          'Линейка на 2-й струне (си) сдвинута на лад правее: переход G→B — 4 полутона, а не 5. Это единственное место, где фигура «ломается».'],
        scene: c => {
          const [p1, p2] = pentaPositions(9, 'minor', c.tuning);
          const map = pentaLabelMap(9, 'minor', c.german);
          const in2 = new Set(p2.notes.map(n => `${n.string}:${n.fret}`));
          const notes = [...p2.notes, ...p1.notes.filter(n => !in2.has(`${n.string}:${n.fret}`))];
          return { neck: { from: Math.max(0, p1.minFret - 1), to: p2.maxFret + 2, markers: markersFor(notes, map, { labels: c.labels, dim: n => !in2.has(`${n.string}:${n.fret}`) }), rulers: p2.rulers.map(r => ({ ...r, long: r.length >= 3 })) },
            caption: 'Позиция 2 (яркая) начинается там, где кончились линейки позиции 1 (тусклая).' };
        } },
      { kind: 'listen', title: 'Позиция 2',
        text: ['Позиция 2 вверх и вниз.'],
        scene: c => {
          const p = pentaPositions(9, 'minor', c.tuning)[1];
          return { neck: { from: Math.max(0, p.minFret - 1), to: p.maxFret + 2, markers: markersFor(p.notes, pentaLabelMap(9, 'minor', c.german), { labels: c.labels, dim: () => true }), rulers: p.rulers.map(r => ({ ...r, long: r.length >= 3 })) },
            seq: upAndDown(p.notes).map(n => one(n, 0.5)), bpm: 90 };
        } },
      { kind: 'play', title: 'Сыграй позицию 2',
        task: c => {
          const p = pentaPositions(9, 'minor', c.tuning)[1];
          const up = upAndDown(p.notes).slice(0, p.notes.length);
          return { text: 'Сыграй позицию 2 вверх, от до на 6-й струне.', targets: up.map(n => ({ midi: n.midi, label: `${ru(n.pc)} — ${where(n.string, n.fret)}` })),
            scene: { neck: { from: Math.max(0, p.minFret - 1), to: p.maxFret + 2, markers: markersFor(p.notes, pentaLabelMap(9, 'minor', c.german), { labels: c.labels }), rulers: p.rulers.map(r => ({ ...r, long: r.length >= 3 })) } } };
        } },
      { kind: 'quiz', title: 'Проверка',
        quiz: () => [
          q('Цикл шагов минорной пентатоники:', '3-2-2-3-2', ['2-2-3-2-3', '2-1-2-2-1'], 'От тоники: ♭3 (+3), 4 (+2), 5 (+2), ♭7 (+3), 1 (+2).'),
          q('Где начинается позиция 2 на 6-й струне?', 'где кончилась линейка позиции 1', ['на 12-м ладу', 'на открытой струне'], 'Позиции цепляются друг за друга.'),
          q('Почему линейка на струне си сдвинута на лад?', 'между G и B 4 полутона, а не 5', ['так удобнее пальцам', 'на струне си другая гамма'], 'Все фигуры при переходе на си сдвигаются на лад правее.'),
        ] },
    ],
  },
  {
    id: 'penta-blues', topic: 'penta', title: 'Блюзовая нота и мажорная пентатоника', minutes: 7,
    why: 'Одна нота добавляет «скрип» блюза, а мажорная пентатоника — та же фигура с другим домом.',
    cards: ['penta:blue', 'penta:major'],
    steps: [
      { kind: 'learn', title: '♭5 — нота-проход',
        text: ['Добавь к минорной пентатонике ♭5 между 4 и 5 — получится блюзовая гамма. Эту ноту не держат: через неё проходят, она «скрипит» и сразу уходит в 4 или 5.',
          c => {
            const p = pentaPositions(9, 'minor', c.tuning)[0];
            return `В позиции 1 ля минора блюзовые ноты: ${blueNotes(9, 'minor', p).map(b => where(b.string, b.fret)).join(' и ')}.`;
          },
          c => `Мажорная пентатоника (1 2 3 5 6) — те же ноты, что у параллельной минорной: ${keyLabel(0, 'maj', c)}-мажорная = ${keyLabel(9, 'min', c)}-минорная. Отличается, какая нота — дом: заканчиваешь фразы на до — и звучит светло.`],
        scene: c => {
          const p = pentaPositions(9, 'minor', c.tuning)[0];
          const map = pentaLabelMap(9, 'minor', c.german, true);
          const blues = blueNotes(9, 'minor', p).map(b => ({ string: b.string, fret: b.fret, pc: b.pc }));
          return { neck: { from: Math.max(0, p.minFret - 1), to: p.maxFret + 2, markers: [...markersFor(p.notes, map, { labels: c.labels }), ...markersFor(blues, map, { labels: c.labels, ring: () => true })], rulers: p.rulers.map(r => ({ ...r, long: r.length >= 3 })) },
            caption: 'Позиция 1 с блюзовыми нотами (обведены).' };
        } },
      { kind: 'listen', title: 'Блюзовый ход',
        text: ['Короткий ход: 4 → ♭5 → 5 → ♭7 → 5 → 4 → 1.'],
        scene: c => {
          const seq = [[1, 50], [1, 51], [1, 52], [2, 55], [1, 52], [1, 50], [0, 45]];
          return { neck: { from: 3, to: 9, markers: [] }, seq: seq.map(([s, m], i) => one(on(c, s, m), i === 6 ? 2 : 0.5)), bpm: 90 };
        } },
      { kind: 'play', title: 'Проход через ♭5',
        task: c => ({ text: 'Сыграй на 5-й струне: ре, ми-бемоль, ми (5, 6 и 7-й лады).',
          targets: [{ midi: 50, label: 'ре — 5-я струна, 5-й лад' }, { midi: 51, label: 'ми-бемоль — 5-я струна, 6-й лад' }, { midi: 52, label: 'ми — 5-я струна, 7-й лад' }],
          scene: { neck: { from: 3, to: 9, markers: [mk(c, 1, 5, '4', 'other'), mk(c, 1, 6, '♭5', 'other', { ring: true, flat: true }), mk(c, 1, 7, '5', 'fifth')] } } }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => [
          q('Блюзовая нота минорной пентатоники:', '♭5', ['♭2', '6'], 'Между 4 и 5.'),
          q(`${keyLabel(0, 'maj', c)}-мажорная пентатоника состоит из тех же нот, что…`, `${keyLabel(9, 'min', c)}-минорная`, [`${keyLabel(0, 'min', c)}-минорная`, `${keyLabel(4, 'min', c)}-минорная`], 'Параллельные тональности — одни ноты.'),
          q('Как играть блюзовую ноту?', 'проходя, не задерживаясь', ['держать как можно дольше', 'только в начале фразы'], 'Она звучит как напряжение, которое тут же разрешается.'),
        ] },
    ],
  },

  // ===== Лады =====
  {
    id: 'modes-minor', topic: 'modes', title: 'Три минора: эолийский, дорийский, фригийский', minutes: 8,
    why: 'Одна нота меняет настроение минора — от грувового до металлического. Это готовый словарь для риффов.',
    cards: ['mode:dorian', 'mode:phrygian'],
    steps: [
      { kind: 'learn', title: 'Одна нота — другое настроение',
        text: ['Натуральный минор (эолийский) — 1 2 ♭3 4 5 ♭6 ♭7. Поменяй одну ноту — и характер меняется.',
          'Дорийский: 6 вместо ♭6. Минор светлее и «круче» — грув, фанк, рок. Характерная нота — 6.',
          'Фригийский: ♭2 вместо 2. Нота на полутон выше тоники даёт напряжение — отсюда тяжёлое, восточное звучание метала. В Drop D: открытая 6-я (ре) и её 1-й лад (ми-бемоль) — готовый тяжёлый рифф.'],
        scene: c => {
          const p = modePositions(2, 'phrygian', c.tuning)[0];
          return { neck: { from: Math.max(0, p.minFret - 1), to: p.maxFret + 2, markers: markersFor(p.notes, modeLabelMap(2, 'phrygian', c.german), { labels: c.labels }) },
            caption: 'Ре фригийский, позиция 1. Лаймовая — характерная ♭2.' };
        } },
      { kind: 'listen', title: 'Ре: эолийский → дорийский → фригийский',
        text: ['Три гаммы от одной тоники. Слушай одну разную ноту: ♭6 → 6 у дорийского, 2 → ♭2 у фригийского.'],
        scene: c => {
          const scale = id => MODES[id].st.concat(12).map(st => 50 + st);
          return { neck: { from: 0, to: 12, markers: [] }, seq: ['aeolian', 'dorian', 'phrygian'].flatMap(id => scale(id).map((m, i) => one({ midi: m }, i === 7 ? 1.5 : 0.5))), bpm: 110 };
        } },
      { kind: 'play', title: 'Фригийский поворот',
        task: () => ({ text: 'Сыграй ре → ми-бемоль → ре. В Drop D это открытая 6-я и её 1-й лад; в Standard — 5-я струна, 5-й и 6-й лады.',
          targets: [{ pc: 2, label: 'ре' }, { pc: 3, label: 'ми-бемоль' }, { pc: 2, label: 'ре' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: () => [
          q('Характерная нота дорийского лада:', '6', ['♭2', '♯4'], 'Большая секста вместо малой.'),
          q('Характерная нота фригийского лада:', '♭2', ['6', '7'], 'Малая секунда — полутон над тоникой.'),
          q('Почему фригийский звучит «металлически»?', '♭2 — полутон над тоникой, напряжение', ['в нём нет квинты', 'он мажорный'], 'Полутон к тонике — тёмный, давящий ход.'),
        ] },
    ],
  },
  {
    id: 'modes-ladder', topic: 'modes', title: 'Лестница яркости и родительский мажор', minutes: 8,
    why: 'Чтобы видеть все лады как одну систему: одни и те же ноты, разный «дом» и разная яркость.',
    cards: ['mode:ladder', 'mode:parent', 'mode:exotic'],
    steps: [
      { kind: 'learn', title: 'Те же ноты — другой дом',
        text: ['Семь ладов мажора — одни и те же 7 нот, сыгранные от разных ступеней. Ре дорийский — ноты до мажора от ре. Поэтому у лада есть «родительский» мажор и место на квинтовом круге.',
          'Если играть лады от одной тоники, они выстраиваются по яркости: лидийский (♯4) → ионийский → миксолидийский (♭7) → дорийский (♭3) → эолийский (♭6) → фригийский (♭2) → локрийский (♭5). Каждый шаг понижает одну ноту на полутон.',
          'Отдельно — два «экзотических»: гармонический минор (натуральный минор с 7 вместо ♭7) и фригийский доминантовый (фригийский с большой терцией) — восточный колорит в метале.'],
        scene: () => ({ chips: BRIGHTNESS.map(id => ({ label: MODES[id].name, sub: { lydian: '♯4', ionian: '♯4 → 4', mixolydian: '7 → ♭7', dorian: '3 → ♭3', aeolian: '6 → ♭6', phrygian: '2 → ♭2', locrian: '5 → ♭5' }[id] })) }) },
      { kind: 'listen', title: 'От светлого к тёмному',
        text: ['Семь ладов от ре подряд: от лидийского до локрийского. С каждой гаммой — чуть темнее.'],
        scene: () => ({ chips: BRIGHTNESS.map(id => ({ label: MODES[id].name })), seq: BRIGHTNESS.flatMap(id => MODES[id].st.concat(12).map((st, i) => one({ midi: 50 + st }, i === 7 ? 1 : 0.5))), bpm: 150 }) },
      { kind: 'play', title: '♯4 лидийского',
        task: () => ({ text: 'Сыграй ре, а потом характерную ноту ре лидийского — соль-диез (♯4).', targets: [{ pc: 2, label: 'ре' }, { pc: 8, label: 'соль-диез' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => [
          q('Самый светлый лад:', 'лидийский', ['ионийский', 'локрийский'], 'В нём ♯4 — ни одной пониженной ноты.'),
          q('Ре дорийский — это ноты какого мажора?', nm(c, 0), [nm(c, 2), nm(c, 7)], 'Дорийский начинается со 2-й ступени мажора: ре — 2-я ступень до мажора.'),
          q('Фригийский доминантовый — это фригийский с…', 'большой терцией', ['большой секстой', '♯4'], '1 ♭2 3 4 5 ♭6 ♭7.'),
        ] },
    ],
  },

  // ===== Септаккорды =====
  {
    id: 'sevenths-types', topic: 'sevenths', title: 'Септаккорды: maj7, 7, m7', minutes: 8,
    why: 'Четвёртая нота добавляет аккорду цвет: мечтательность, напряжение или мягкость.',
    cards: ['chord:maj7', 'chord:dom7', 'chord:m7'],
    steps: [
      { kind: 'learn', title: 'Ещё одна нота через одну',
        text: ['Добавь к трезвучию ещё ноту через одну — септиму — и получится септаккорд. Септима бывает большая (7, на полутон ниже октавы) и малая (♭7, на тон ниже).',
          'maj7 = мажор + 7: мягкий, мечтательный. 7 (доминантсептаккорд) = мажор + ♭7: напряжённый, блюзовый, хочет разрешиться. m7 = минор + ♭7: мягкий минор, фанк и соул.',
          'Ещё два: m7♭5 (полууменьшённый) — уменьшённое трезвучие + ♭7; dim7 — одни малые терции, симметричный и очень напряжённый.'],
        scene: c => {
          const ci = chordInfo(9, 'dom7', c.german);
          const v = voicing(c, 'dom7', 9, 1, 0);
          return { dial: { layout: 'chroma', nodes: ci.pcs.map((pc, i) => ({ pc, label: ci.names[i], role: ['root', 'third', 'fifth', 'seventh'][i] })), polygon: { root: 9, type: 'dom7' }, center: { big: `${nm(c, 9)}7`, small: '4 + 3 + 3 + 2' } },
            neck: { ...fretsSpan(v), markers: chordMarkers(c, v, 9, 'dom7') }, caption: 'A7: фигура на круге и форма от 5-й струны.' };
        } },
      { kind: 'listen', title: 'A → A7 → Amaj7 → Am7',
        text: ['Трезвучие и три септаккорда от ля. Сравни: септима добавляет цвет, не меняя корень.'],
        scene: c => ({ neck: { from: 0, to: 8, markers: chordMarkers(c, voicing(c, 'maj7', 9, 1, 0), 9, 'maj7') },
          seq: [['maj', 2], ['dom7', 2], ['maj7', 2], ['m7', 3]].map(([t, b]) => strum(voicing(c, /** @type {string} */ (t), 9, 1, 0), c, Number(b))), bpm: 80 }) },
      { kind: 'play', title: 'Ноты A7',
        task: () => ({ text: 'Сыграй ноты A7 по очереди: ля, до-диез, ми, соль — в любом месте грифа.', targets: [{ pc: 9, label: 'ля' }, { pc: 1, label: 'до-диез' }, { pc: 4, label: 'ми' }, { pc: 7, label: 'соль' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: () => [
          q('Доминантсептаккорд (7) — это…', 'мажор + ♭7', ['мажор + 7', 'минор + ♭7'], '1 3 5 ♭7.'),
          q('Какой септаккорд мягкий и мечтательный?', 'maj7', ['7', 'dim7'], 'Большая септима на полутон ниже октавы.'),
          q('Ступени m7:', '1 ♭3 5 ♭7', ['1 3 5 7', '1 ♭3 ♭5 ♭7'], 'Минорное трезвучие и малая септима.'),
        ] },
    ],
  },
  {
    id: 'sevenths-blues', topic: 'sevenths', title: 'Блюз и ii–V–I', minutes: 8,
    why: 'Две главные «схемы» музыки: 12-тактовый блюз и ii–V–I. По ним сочиняют и импровизируют.',
    cards: ['prog:blues', 'prog:ii-v-i'],
    steps: [
      { kind: 'learn', title: 'Две схемы',
        text: [c => `12-тактовый блюз — три доминантсептаккорда: I7, IV7 и V7. В ля: ${nm(c, 9)}7 (4 такта), ${nm(c, 2)}7 (2), ${nm(c, 9)}7 (2), ${nm(c, 4)}7, ${nm(c, 2)}7, ${nm(c, 9)}7, ${nm(c, 4)}7. Сверху хорошо ложится ля-минорная пентатоника с блюзовой нотой.`,
          c => `ii–V–I — главный оборот джаза: m7 → 7 → maj7. В до мажоре: ${nm(c, 2)}m7 → ${nm(c, 7)}7 → ${nm(c, 0)}maj7. Каждый корень — на квинту ниже предыдущего: по квинтовому кругу домой.`,
          'Попробуй потом в «Подложке»: последовательность «12-тактовый блюз» в ля и импровизация пентатоникой.'],
        scene: c => ({ grid: [9, 9, 9, 9, 2, 2, 9, 9, 4, 2, 9, 4].map(pc => `${nm(c, pc)}7`) }) },
      { kind: 'listen', title: 'Блюз, потом ii–V–I',
        text: ['Быстрый проход по 12 тактам блюза (по 2 доли на такт), потом Dm7 – G7 – Cmaj7.'],
        scene: c => {
          const blues = [9, 9, 9, 9, 2, 2, 9, 9, 4, 2, 9, 4].map(pc => strum(bestVoicing('dom7', pc, c.tuningId, 5).frets, c, 2));
          const iiVI = [[2, 'm7'], [7, 'dom7'], [0, 'maj7']].map(([pc, t], i) => strum(bestVoicing(/** @type {string} */ (t), Number(pc), c.tuningId, 5).frets, c, i === 2 ? 4 : 2));
          return { grid: [9, 9, 9, 9, 2, 2, 9, 9, 4, 2, 9, 4].map(pc => `${nm(c, pc)}7`), seq: [...blues, ...iiVI], bpm: 120 };
        } },
      { kind: 'play', title: 'Корни блюза',
        task: () => ({ text: 'Сыграй корни блюза в ля: ля, ре, ми.', targets: [{ pc: 9, label: 'ля' }, { pc: 2, label: 'ре' }, { pc: 4, label: 'ми' }] }) },
      { kind: 'quiz', title: 'Проверка',
        quiz: c => [
          q('Из каких аккордов 12-тактовый блюз?', 'I7, IV7 и V7', ['i, VI и VII', 'ii, V и I'], 'Три доминантсептаккорда.'),
          q('ii–V–I в до мажоре:', `${nm(c, 2)}m7 – ${nm(c, 7)}7 – ${nm(c, 0)}maj7`, [`${nm(c, 0)} – ${nm(c, 5)} – ${nm(c, 7)}`, `${nm(c, 9)}m – ${nm(c, 2)}m – ${nm(c, 4)}`], 'Минорный, доминантовый и большой мажорный септаккорды.'),
          q('Как идут корни ii–V–I по квинтовому кругу?', 'каждый на квинту ниже', ['каждый на терцию выше', 'по полутону вниз'], 'Ре → соль → до: шаги против часовой, «домой».'),
        ] },
    ],
  },
];

/** Темы раздела по порядку */
export const TOPICS = Object.freeze(['neck', 'chords', 'fifths', 'penta', 'modes', 'sevenths']);
export const lessonById = id => LESSONS.find(l => l.id === id) || null;
export const lessonsOf = topic => LESSONS.filter(l => l.topic === topic);

/**
 * Следующий урок: первый непройденный по порядку тем. Все пройдены — null.
 * @param {Record<string, any>} done
 */
export const nextLesson = (done = {}) => LESSONS.find(l => !done[l.id]) || null;

/** Тексты шага с учётом настроек (пустые строки — убираем) */
export const stepText = (step, c) => (step.text || []).map(t => (typeof t === 'function' ? t(c) : t)).filter(Boolean);

/** Перемешать варианты ответа (правильный перестаёт быть первым) */
export function shuffleQuestion(question, rand = Math.random) {
  const order = question.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { ...question, options: order.map(i => question.options[i]), answer: order.indexOf(question.answer) };
}

/** Контекст для сцен из настроек */
export const lessonCtx = (settings, rand) => ({ tuningId: settings.tuning, tuning: TUNINGS[settings.tuning].midi, german: settings.notation === 'german', terms: settings.terms, labels: settings.labels, rand });

// для проверок: всё, что нужно, — экспортировано
export { spellScale, modeDegrees, fifthsK, labelMap, spellAs, voicingMidis };
