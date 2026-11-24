// cards.js — карточки повторений. Карточка — не одна зазубренная фраза, а правило: каждый показ — новый вариант
// (другая тоника, струна, лад), чтобы проверялось понимание. Ответ — выбором варианта или на грифе
// (касанием или игрой на гитаре). Карточки приходят из пройденных уроков; ноты на грифе — отдельной колодой,
// понемногу, струна за струной. Чистая логика.
import { mod12, noteName, ruName, spellPc, NATURAL_PC, INTERVALS } from './notes.js';
import { CHORD_TYPES, chordRoot, chordSymbol } from './chords.js';
import { MODES, BRIGHTNESS, keyTonic, parentMajor, diatonicChords, characteristicDegrees, FIFTHS } from './scales.js';
import { TUNINGS, shapesFor, placeShape, pentaPositions } from './neck.js';
import { chordInfo, pentaTable, relativeOf, keyLabel } from './theory.js';
import { LESSONS } from './lessons.js';

/**
 * @typedef {{ tuningId: string, tuning: number[], german: boolean, terms?: string }} CardCtx
 * @typedef {{ string: number, fret: number, label?: string, role?: string }} Spot
 * @typedef {{ notes: { midi: number }[], beats: number, strum?: boolean }} Sound
 * @typedef {{ id: string, title: string, prompt: string, kind: string, options?: string[], answer?: number,
 *   targets?: Spot[], show?: Spot[], range?: { from: number, to: number }, sound?: Sound[], explain: string }} Card
 */

// ---------- помощники ----------
const pickR = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
const nm = (c, pc, flat = false) => noteName(spellPc(pc, { flat }), { german: c.german });
const ru = (pc, flat = false) => ruName(spellPc(pc, { flat }), { long: true });
/** «ля (A)» */
const both = (c, pc, flat = false) => `${ru(pc, flat)} (${nm(c, pc, flat)})`;
const strNum = s => `${6 - s}-я`;
const strGen = s => `${6 - s}-й`;
const fretText = f => (f === 0 ? 'открытая' : `${f}-й лад`);
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
/** Варианты ответа: правильный + неверные (без повторов), перемешаны */
function choice(rand, right, wrong, n = 4) {
  const opts = [right];
  for (const w of wrong) if (opts.length < n && !opts.includes(w)) opts.push(w);
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { options: opts, answer: opts.indexOf(right) };
}
/** Все места высоты pc на струне s в ладах from…to */
const placesOn = (c, s, pc, from = 0, to = 12) => { const out = []; for (let f = from; f <= to; f++) if (mod12(c.tuning[s] + f) === pc) out.push({ string: s, fret: f }); return out; };
const one = midi => ({ notes: [{ midi }], beats: 1 });
const chordSound = midis => [{ notes: midis.map(m => ({ midi: m })), beats: 2.5, strum: true }];
const NAT_ROOTS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_KEYS = [9, 4, 2, 7, 0, 11]; // Am Em Dm Gm Cm Hm — привычные для гитары

// ---------- ноты на грифе ----------
export const NOTE_FRETS = 12;
export const noteCardId = (s, f) => `note:${s}:${f}`;
/** «note:0:5» → { string: 0, fret: 5 } */
export function parseNoteCard(id) {
  const m = /^note:([0-5]):(\d{1,2})$/.exec(id);
  return m ? { string: Number(m[1]), fret: Number(m[2]) } : null;
}
export const isNoteCard = id => id.startsWith('note:');

/**
 * Ноты на грифе входят в повторения группами: 6-я и 5-я струны (сначала ноты без знаков, потом все),
 * затем 4-я, 3-я, 2-я и 1-я. Следующая группа открывается, когда 80 % открытых нот уже держатся в памяти.
 */
export function noteGroups(tuning = TUNINGS.std.midi) {
  const all = s => Array.from({ length: NOTE_FRETS + 1 }, (_, f) => noteCardId(s, f));
  const nat = s => all(s).filter(id => NATURAL_PC.includes(mod12(tuning[s] + /** @type {any} */ (parseNoteCard(id)).fret)));
  const g1 = [...nat(0), ...nat(1)];
  const g2 = [...all(0), ...all(1)].filter(id => !g1.includes(id));
  return [g1, g2, all(2), all(3), all(4), all(5)];
}

/**
 * Какие ноты добавить в колоду: первая группа после урока «Ноты на 6-й и 5-й струнах»;
 * следующая — когда открытые ноты в основном выучены (коробка 2 и выше).
 * @param {Record<string, { box: number }>} deck @param {boolean} unlocked урок пройден
 */
export function nextNoteGroup(deck, unlocked, tuning = TUNINGS.std.midi) {
  if (!unlocked) return [];
  for (const g of noteGroups(tuning)) {
    const missing = g.filter(id => !deck[id]);
    if (missing.length) {
      const open = Object.keys(deck).filter(isNoteCard);
      const ok = open.filter(id => deck[id].box >= 2).length;
      return !open.length || ok >= open.length * 0.8 ? missing : [];
    }
  }
  return [];
}

function noteCard(c, s, f, rand) {
  const pc = mod12(c.tuning[s] + f);
  const flat = rand() < 0.3;
  const title = 'Нота на грифе';
  if (rand() < 0.5) {
    const wrong = [1, -1, 2, -2, 5].map(d => nm(c, pc + d, flat));
    return { id: noteCardId(s, f), title, kind: 'choice', prompt: `Какая нота: ${strNum(s)} струна, ${fretText(f)}?`,
      ...choice(rand, nm(c, pc, flat), wrong), show: [{ string: s, fret: f, label: '?', role: 'other' }], range: { from: 0, to: 12 },
      sound: [one(c.tuning[s] + f)], explain: `${strNum(s)} струна, ${fretText(f)} — ${both(c, pc, flat)}. Открытая струна — ${nm(c, c.tuning[s])}, дальше по ладу на полутон.` };
  }
  const targets = placesOn(c, s, pc);
  return { id: noteCardId(s, f), title, kind: 'neck', prompt: `Найди ${both(c, pc, flat)} на ${strGen(s)} струне`,
    targets, range: { from: 0, to: 12 }, sound: [one(c.tuning[s] + f)],
    explain: `${both(c, pc, flat)} на ${strGen(s)} струне: ${targets.map(t => fretText(t.fret)).join(' и ')}. Открытая струна — ${nm(c, c.tuning[s])}.` };
}

// ---------- карточки уроков ----------
/** @type {Record<string, { title: string, make: (c: CardCtx, rand: () => number) => Omit<Card, 'id' | 'title'> }>} */
const MAKERS = {
  'neck:tight-pairs': { title: 'Ми–фа и си–до', make: (c, rand) => {
    if (rand() < 0.5) {
      return { kind: 'choice', prompt: 'Какие соседние ноты без знаков стоят вплотную — через 1 лад?',
        ...choice(rand, 'ми–фа и си–до', ['до–ре и фа–соль', 'ре–ми и ля–си', 'соль–ля и до–ре']),
        explain: 'Ми–фа и си–до — без промежуточной ноты. Остальные соседние ноты без знаков — через 2 лада.' };
    }
    const [from, to] = pickR(rand, [[4, 5], [11, 0], [2, 4], [9, 11], [5, 7], [0, 2]]);
    const gap = mod12(to - from);
    return { kind: 'choice', prompt: `Сколько ладов от ${ru(from)} до ${ru(to)} на одной струне?`, ...choice(rand, String(gap), ['1', '2', '3']),
      explain: gap === 1 ? `${ru(from)} и ${ru(to)} стоят вплотную — это одна из двух пар без промежуточной ноты.` : `Между ними есть промежуточная нота с ♯ или ♭ — значит, 2 лада.` };
  } },
  'neck:octave': { title: 'Октава: 12-й лад', make: (c, rand) => {
    const s = Math.floor(rand() * 6);
    const pc = mod12(c.tuning[s]);
    return { kind: 'neck', prompt: `Открытая ${strNum(s)} струна — ${both(c, pc)}. Где на этой же струне та же нота на октаву выше?`,
      targets: [{ string: s, fret: 12 }], show: [{ string: s, fret: 0, label: nm(c, pc), role: 'other' }], range: { from: 0, to: 13 },
      sound: [one(c.tuning[s]), one(c.tuning[s] + 12)], explain: '12 ладов — 12 полутонов — полный круг: на 12-м ладу та же нота, на октаву выше.' };
  } },
  'neck:next-string': { title: 'Соседняя струна: +5', make: (c, rand) => {
    const s = pickR(rand, [0, 1, 2, 4].filter(x => c.tuning[x + 1] - c.tuning[x] === 5));
    const f = 5 + Math.floor(rand() * 5);
    const midi = c.tuning[s] + f;
    return { kind: 'neck', prompt: `${strNum(s)} струна, ${fretText(f)}. Найди ту же ноту на соседней, более тонкой струне.`,
      targets: [{ string: s + 1, fret: f - 5 }], show: [{ string: s, fret: f, label: nm(c, midi), role: 'other' }], range: { from: 0, to: 12 },
      sound: [one(midi), one(midi)], explain: `Соседняя струна выше на 5 полутонов — та же нота на 5 ладов левее: ${fretText(f - 5)}.` };
  } },
  'neck:gb-shift': { title: 'Переход G→B: +4', make: (c, rand) => {
    if (rand() < 0.4) {
      return { kind: 'choice', prompt: 'На каком ладу 3-й струны звучит открытая 2-я?', ...choice(rand, 'на 4-м', ['на 5-м', 'на 3-м', 'на 7-м']),
        sound: [one(59), one(59)], explain: 'Между соль и си 4 полутона — единственное такое место в Standard.' };
    }
    const f = 4 + Math.floor(rand() * 7);
    return { kind: 'neck', prompt: `3-я струна, ${fretText(f)}. Найди ту же ноту на 2-й струне.`,
      targets: [{ string: 4, fret: f - 4 }], show: [{ string: 3, fret: f, label: nm(c, 55 + f), role: 'other' }], range: { from: 0, to: 12 },
      sound: [one(55 + f), one(55 + f)], explain: `Соль → си — 4 полутона, поэтому та же нота на 4 лада левее: ${fretText(f - 4)}.` };
  } },
  'neck:low-strings': { title: 'Ноты на 6-й и 5-й', make: (c, rand) => {
    const s = rand() < 0.5 ? 0 : 1;
    const pc = pickR(rand, NAT_ROOTS);
    const targets = placesOn(c, s, pc);
    return { kind: 'neck', prompt: `Найди ${both(c, pc)} на ${strGen(s)} струне`, targets, range: { from: 0, to: 12 },
      sound: [one(c.tuning[s] + targets[0].fret)], explain: `${both(c, pc)}: ${targets.map(t => fretText(t.fret)).join(' и ')}. Ориентиры: на 5-м ладу — нота следующей струны, на 12-м — открытая.` };
  } },
  'iv:fifth': { title: 'Квинта на грифе', make: (c, rand) => {
    const s = pickR(rand, [0, 1, 2]);
    const f = 2 + Math.floor(rand() * 7);
    const root = c.tuning[s] + f, tf = root + 7 - c.tuning[s + 1];
    return { kind: 'neck', prompt: `Корень — ${strNum(s)} струна, ${fretText(f)} (${nm(c, root)}). Где квинта на соседней струне?`,
      targets: [{ string: s + 1, fret: tf }], show: [{ string: s, fret: f, label: '1', role: 'root' }], range: { from: 0, to: 12 },
      sound: [one(root), one(root + 7), { notes: [{ midi: root }, { midi: root + 7 }], beats: 1.5 }],
      explain: `Квинта — 7 полутонов. Соседняя струна выше на ${c.tuning[s + 1] - c.tuning[s]}, значит квинта — ${tf === f ? 'на том же ладу' : `на ${fretText(tf)}`}. Корень + квинта — это пауэр-аккорд.` };
  } },
  'iv:octave': { title: 'Октава через струну', make: (c, rand) => {
    const s = pickR(rand, [0, 1]);
    const f = 1 + Math.floor(rand() * 8);
    const root = c.tuning[s] + f, tf = root + 12 - c.tuning[s + 2];
    return { kind: 'neck', prompt: `Корень — ${strNum(s)} струна, ${fretText(f)} (${nm(c, root)}). Где октава через одну струну?`,
      targets: [{ string: s + 2, fret: tf }], show: [{ string: s, fret: f, label: '1', role: 'root' }], range: { from: 0, to: 14 },
      sound: [one(root), one(root + 12)], explain: `Октава через струну — на ${tf - f} ${plural(tf - f, 'лад', 'лада', 'ладов')} правее корня (${fretText(tf)}). Это та же фигура, что у пауэр-аккорда с октавой.` };
  } },
  'iv:thirds': { title: 'Большая и малая терция', make: (c, rand) => {
    const big = rand() < 0.5;
    const root = 45 + Math.floor(rand() * 10);
    if (rand() < 0.5) {
      return { kind: 'choice', prompt: 'Послушай: какая это терция?', ...choice(rand, big ? 'большая (светлая)' : 'малая (грустная)', ['большая (светлая)', 'малая (грустная)']),
        sound: [one(root), one(root + (big ? 4 : 3)), { notes: [{ midi: root }, { midi: root + (big ? 4 : 3) }], beats: 1.5 }],
        explain: big ? 'Большая терция — 4 полутона: светлая, мажорная.' : 'Малая терция — 3 полутона: грустная, минорная.' };
    }
    return { kind: 'choice', prompt: `Сколько полутонов в ${big ? 'большой' : 'малой'} терции?`, ...choice(rand, big ? '4' : '3', ['3', '4', '5', '2']),
      explain: 'Малая терция — 3 полутона (минор), большая — 4 (мажор). Разница в один лад меняет настроение аккорда.' };
  } },
  'chord:power': { title: 'Пауэр-аккорд', make: (c, rand) => {
    const s = pickR(rand, [0, 1]);
    const f = 1 + Math.floor(rand() * 8);
    const root = c.tuning[s] + f;
    const tf = root + 7 - c.tuning[s + 1];
    return { kind: 'neck', prompt: `Пауэр-аккорд ${nm(c, root)}5 от ${strGen(s)} струны: корень на ${fretText(f)}. Где вторая нота?`,
      targets: [{ string: s + 1, fret: tf }], show: [{ string: s, fret: f, label: '1', role: 'root' }], range: { from: 0, to: 12 },
      sound: chordSound([root, root + 7]), explain: `Пауэр-аккорд — корень и квинта (1 и 5), без терции: поэтому он ни мажорный, ни минорный. Квинта — ${tf === f ? 'на том же ладу соседней струны (Drop D)' : 'на 2 лада правее, на соседней струне'}.` };
  } },
  'chord:power-dropd': { title: 'Пауэр-аккорд в Drop D', make: (c, rand) => {
    const pc = pickR(rand, [2, 4, 5, 7, 9, 0, 3, 10]);
    const f = mod12(pc - 2);
    if (rand() < 0.5) {
      return { kind: 'choice', prompt: `Drop D: на каком ладу 6-й струны берётся пауэр-аккорд ${nm(c, pc, [3, 10].includes(pc))}5?`, ...choice(rand, `${f}-й`, [`${f + 2}-й`, `${Math.max(1, f - 2)}-й`, `${f + 1}-й`].map(x => (x === '0-й' ? 'открытые' : x))),
        sound: chordSound([38 + f, 45 + f, 50 + f]),
        explain: `6-я струна в Drop D — ре: ${nm(c, pc, [3, 10].includes(pc))} на ${f === 0 ? 'открытой' : `${f}-м ладу`}. Один палец на 6-й, 5-й и 4-й струнах на одном ладу — пауэр-аккорд с октавой.` };
    }
    return { kind: 'choice', prompt: 'Почему в Drop D пауэр-аккорд от 6-й струны берётся одним пальцем?',
      ...choice(rand, 'между 6-й и 5-й струной квинта', ['6-я струна на тон выше', 'так звучит громче', 'между струнами кварта']),
      explain: '6-я струна опущена до ре — до ля на 5-й струне ровно 7 полутонов, квинта. Значит, корень и квинта — на одном ладу.' };
  } },
  'chord:maj': { title: 'Мажорное трезвучие', make: (c, rand) => triadCard(c, rand, 'maj') },
  'chord:min': { title: 'Минорное трезвучие', make: (c, rand) => triadCard(c, rand, 'min') },
  'chord:sus-dim-aug': { title: 'Sus4, dim и aug', make: (c, rand) => {
    const type = pickR(rand, ['sus4', 'dim', 'aug', 'maj', 'min']);
    const sides = chordInfo(0, type).sides.join(' + ');
    const name = { sus4: 'sus4', dim: 'уменьшённый', aug: 'увеличенный', maj: 'мажор', min: 'минор' };
    return { kind: 'choice', prompt: `Фигура на круге со сторонами ${sides} — какой это аккорд?`, ...choice(rand, name[type], Object.values(name)),
      sound: chordSound(CHORD_TYPES[type].st.map(st => 48 + st)), explain: `${name[type][0].toUpperCase() + name[type].slice(1)}: ${sides}. Мажор 4+3, минор 3+4, уменьшённый 3+3 (тесно), увеличенный 4+4 (зыбко), sus4 5+2 (без терции, «подвешенный»).` };
  } },
  'chord:e-shape': { title: 'Баррэ формы E', make: (c, rand) => barreCard(c, rand, 0) },
  'chord:a-shape': { title: 'Баррэ формы A', make: (c, rand) => barreCard(c, rand, 1) },
  'key:signatures': { title: 'Знаки тональностей', make: (c, rand) => {
    const minor = rand() < 0.5;
    const k = Math.floor(rand() * 12);
    const f = FIFTHS[k];
    const pc = minor ? f.minorPc : f.pc;
    const sig = f.signature;
    const right = sig.sharps ? `${sig.sharps}♯` : sig.flats ? `${sig.flats}♭` : 'без знаков';
    const n = Math.max(sig.sharps, sig.flats);
    const wrong = [`${n + 1}♯`, `${n + 1}♭`, `${Math.max(1, n - 1)}♯`, `${Math.max(1, n - 1)}♭`, `${n}♯`, `${n}♭`, 'без знаков'];
    return { kind: 'choice', prompt: `Сколько знаков при ключе у ${keyLabel(pc, minor ? 'min' : 'maj', c)}?`, ...choice(rand, right, wrong.filter(w => w !== '0♯' && w !== '0♭')),
      explain: `${keyLabel(pc, minor ? 'min' : 'maj', c)} — ${right}${minor ? ` (как у параллельного ${keyLabel(f.pc, 'maj', c)})` : ''}. По кругу по часовой — +1♯, против — +1♭.` };
  } },
  'key:relative': { title: 'Параллельные тональности', make: (c, rand) => {
    const minor = rand() < 0.5;
    const pc = minor ? pickR(rand, MINOR_KEYS) : pickR(rand, [0, 7, 2, 9, 4, 5, 10]);
    const rel = relativeOf(pc, minor ? 'min' : 'maj');
    const wrongPcs = [mod12(rel.pc + 2), mod12(rel.pc - 2), mod12(pc + 5), mod12(pc + 7), pc];
    return { kind: 'choice', prompt: `Параллельная тональность для ${keyLabel(pc, minor ? 'min' : 'maj', c)} (те же ноты)?`,
      ...choice(rand, keyLabel(rel.pc, rel.kind, c), wrongPcs.map(p => keyLabel(p, rel.kind, c))),
      explain: `Параллельный минор — на малую терцию (3 лада) ниже мажора: ${keyLabel(minor ? rel.pc : pc, 'maj', c)} ↔ ${keyLabel(minor ? pc : rel.pc, 'min', c)}. Ноты и знаки те же.` };
  } },
  'key:dm-chords': { title: 'Аккорды ре минора', make: (c, rand) => {
    const pc = rand() < 0.6 ? 2 : pickR(rand, [9, 4]);
    const chords = diatonicChords(keyTonic(pc, 'aeolian'), 'aeolian');
    const i = pickR(rand, [0, 2, 3, 4, 5, 6]);
    const sym = ch => chordSymbol(ch.root, ch.type, { german: c.german });
    return { kind: 'choice', prompt: `${keyLabel(pc, 'min', c)}: какой аккорд на ступени ${chords[i].roman}?`, ...choice(rand, sym(chords[i]), chords.filter((_, k) => k !== i).map(sym)),
      explain: `Аккорды ${keyLabel(pc, 'min', c)}: ${chords.map(ch => `${ch.roman} ${sym(ch)}`).join(' · ')}.` };
  } },
  'key:v-i': { title: 'V → I «домой»', make: (c, rand) => {
    const minor = rand() < 0.5;
    const pc = minor ? pickR(rand, MINOR_KEYS) : pickR(rand, [0, 7, 2, 9, 4, 5]);
    const v = mod12(pc + 7);
    const vName = chordSymbol(chordRoot(v, 'maj'), 'maj', { german: c.german });
    return { kind: 'choice', prompt: `В ${keyLabel(pc, minor ? 'min' : 'maj', c)} какой аккорд ведёт «домой» — V?`,
      ...choice(rand, vName, [mod12(pc + 5), mod12(pc + 2), mod12(pc + 9)].map(p => chordSymbol(chordRoot(p, 'maj'), 'maj', { german: c.german }))),
      sound: [...chordSound([pc + 43, pc + 47, pc + 50].map(m => m + 7 > 60 ? m - 5 : m + 7)).map(x => ({ ...x, beats: 1.5 })), ...chordSound([pc + 43, pc + 47 - (minor ? 1 : 0), pc + 50])],
      explain: `V — на квинту выше тоники: ${vName}. Его терция — вводный тон, на полутон ниже тоники, — тянет «домой».${minor ? ' В миноре V обычно берут мажорным, ради этого вводного тона.' : ''}` };
  } },
  'penta:pos1': { title: 'Позиция 1 пентатоники', make: (c, rand) => pentaStartCard(c, rand, 0) },
  'penta:pos2': { title: 'Позиция 2 пентатоники', make: (c, rand) => pentaStartCard(c, rand, 1) },
  'penta:rulers': { title: 'Линейки позиции 1', make: (c, rand) => {
    const s = Math.floor(rand() * 6);
    const t = pentaTable(9, 'minor', TUNINGS.std.midi)[0];
    const long = t.rulers[s] === 'Д';
    return { kind: 'choice', prompt: `Позиция 1 минорной пентатоники: на ${strGen(s)} струне линейка длинная или короткая?`,
      ...choice(rand, long ? 'длинная (3 лада)' : 'короткая (2 лада)', ['длинная (3 лада)', 'короткая (2 лада)']),
      explain: `Позиция 1 с 6-й по 1-ю: ${t.rulers.join(' ')} — длинная, три короткие, две длинные.` };
  } },
  'penta:cycle': { title: 'Цикл линеек 3-2-2-3-2', make: (c, rand) => {
    const pc = pickR(rand, MINOR_KEYS);
    const pos = pentaPositions(pc, 'minor', TUNINGS.std.midi);
    const i = Math.floor(rand() * 4);
    const end = pos[i].rulers[0].to, next = pos[i + 1].rulers[0].from;
    return { kind: 'choice', prompt: `${keyLabel(pc, 'min', c)}, позиция ${i + 1}: на 6-й струне линейка ${pos[i].rulers[0].from}–${end}. С какого лада 6-й струны начинается позиция ${i + 2}?`,
      ...choice(rand, `с ${next}-го`, [`с ${next + 1}-го`, `с ${next + 2}-го`, `с ${Math.max(1, next - 2)}-го`]),
      explain: 'Следующая позиция начинается там, где кончилась линейка: вторая нота 6-й струны становится первой.' };
  } },
  'penta:b-shift': { title: 'Сдвиг на струне си', make: (c, rand) => ({ kind: 'choice',
    prompt: 'Почему в позиции пентатоники на 2-й струне ноты на лад правее, чем «по рисунку»?',
    ...choice(rand, 'между 3-й и 2-й струной 4 полутона, а не 5', ['на 2-й струне меньше ладов', 'так удобнее мизинцу', 'это блюзовая нота']),
    explain: 'Струна си настроена на 4 полутона выше соль — на 1 меньше обычного, поэтому всё на ней сдвигается на лад правее.' }) },
  'penta:blue': { title: 'Блюзовая нота', make: (c, rand) => {
    const pc = pickR(rand, MINOR_KEYS);
    const blue = mod12(pc + 6);
    return { kind: 'choice', prompt: `Какая нота — блюзовая в минорной пентатонике ${keyLabel(pc, 'min', c)}?`,
      ...choice(rand, nm(c, blue, true), [nm(c, pc + 5), nm(c, pc + 7), nm(c, pc + 3), nm(c, pc + 10)]),
      sound: [one(45 + mod12(pc - 9) + 5), one(45 + mod12(pc - 9) + 6), one(45 + mod12(pc - 9) + 7)],
      explain: `Блюзовая нота — ♭5, между 4 и 5: в ${keyLabel(pc, 'min', c)} это ${nm(c, blue, true)}. Через неё проскальзывают, на ней не останавливаются.` };
  } },
  'penta:major': { title: 'Мажорная пентатоника', make: (c, rand) => {
    const pc = pickR(rand, [0, 7, 2, 5, 10, 3]);
    const rel = mod12(pc + 9);
    return { kind: 'choice', prompt: `Мажорная пентатоника ${keyLabel(pc, 'maj', c)} — те же ноты, что минорная пентатоника…`,
      ...choice(rand, keyLabel(rel, 'min', c), [mod12(pc + 2), mod12(pc + 4), pc].map(p => keyLabel(p, 'min', c))),
      explain: `Параллельный минор — на 3 лада ниже: ${keyLabel(rel, 'min', c)}. Те же позиции, другая «домашняя» нота.` };
  } },
  'mode:dorian': { title: 'Дорийский лад', make: (c, rand) => modeCharCard(c, rand, 'dorian') },
  'mode:phrygian': { title: 'Фригийский лад', make: (c, rand) => modeCharCard(c, rand, 'phrygian') },
  'mode:ladder': { title: 'Лестница яркости', make: (c, rand) => {
    const minorish = ['dorian', 'aeolian', 'phrygian', 'mixolydian', 'ionian'];
    const a = pickR(rand, minorish);
    let b = pickR(rand, minorish);
    if (b === a) b = minorish[(minorish.indexOf(a) + 1) % minorish.length];
    const brighter = BRIGHTNESS.indexOf(a) < BRIGHTNESS.indexOf(b) ? a : b;
    return { kind: 'choice', prompt: `Какой лад светлее: ${MODES[a].name.toLowerCase()} или ${MODES[b].name.toLowerCase()}?`,
      ...choice(rand, MODES[brighter].name, [MODES[a].name, MODES[b].name]),
      explain: `Лестница от светлого к тёмному: ${BRIGHTNESS.map(id => MODES[id].name.toLowerCase()).join(' → ')}. Каждая ступенька — одна нота на полутон ниже.` };
  } },
  'mode:parent': { title: 'Родительский мажор', make: (c, rand) => {
    const id = pickR(rand, ['dorian', 'phrygian', 'mixolydian', 'lydian', 'aeolian']);
    const pc = pickR(rand, [2, 4, 9, 7, 0]);
    const tonic = keyTonic(pc, id);
    const parent = /** @type {any} */ (parentMajor(tonic, id));
    const right = noteName(parent, { german: c.german });
    const pp = mod12(NATURAL_PC[parent.letter] + parent.acc);
    return { kind: 'choice', prompt: `${noteName(tonic, { german: c.german })} ${MODES[id].name.toLowerCase()}: от какого мажора он «родом» (те же ноты)?`,
      ...choice(rand, `${right} мажор`, [pp + 2, pp + 5, pp + 7, pc].map(p => `${nm(c, p, [1, 3, 8, 10].includes(mod12(p)))} мажор`)),
      explain: `${MODES[id].name} начинается с ${MODES[id].parentStep === 2 ? '2-й' : MODES[id].parentStep === 4 ? '3-й' : MODES[id].parentStep === 5 ? '4-й' : MODES[id].parentStep === 7 ? '5-й' : '6-й'} ступени мажора: ноты ${right} мажора, «дом» — ${noteName(tonic, { german: c.german })}.` };
  } },
  'mode:exotic': { title: 'Гармонический минор и фригийский доминантовый', make: (c, rand) => {
    const harm = rand() < 0.5;
    return harm
      ? { kind: 'choice', prompt: 'Чем гармонический минор отличается от натурального?', ...choice(rand, 'большая септима (7 вместо ♭7)', ['малая секунда (♭2)', 'большая секста (6)', 'большая терция (3)']),
        explain: 'Гармонический минор — натуральный минор с поднятой 7-й ступенью: вводный тон тянет к тонике, звучит «восточно» и классически.' }
      : { kind: 'choice', prompt: 'Чем фригийский доминантовый отличается от фригийского?', ...choice(rand, 'большая терция (3 вместо ♭3)', ['большая септима (7)', 'большая секунда (2)', 'тритон (♭5)']),
        explain: 'Фригийский доминантовый — ♭2 и большая 3 рядом: полтора тона между ними. Это 5-й лад гармонического минора, любимец метала.' };
  } },
  'chord:maj7': { title: 'Maj7', make: (c, rand) => seventhCard(c, rand, 'maj7') },
  'chord:dom7': { title: 'Доминантсептаккорд (7)', make: (c, rand) => seventhCard(c, rand, 'dom7') },
  'chord:m7': { title: 'Минорный септаккорд (m7)', make: (c, rand) => seventhCard(c, rand, 'm7') },
  'prog:blues': { title: '12-тактовый блюз', make: (c, rand) => {
    const pc = pickR(rand, [9, 4, 2, 7, 0]);
    const s = p => chordSymbol(chordRoot(mod12(p), 'dom7'), 'dom7', { german: c.german });
    const right = `${s(pc)} · ${s(pc + 5)} · ${s(pc + 7)}`;
    return { kind: 'choice', prompt: `Блюз в ${nm(c, pc)}: какие три аккорда (I, IV, V)?`,
      ...choice(rand, right, [`${s(pc)} · ${s(pc + 3)} · ${s(pc + 7)}`, `${s(pc)} · ${s(pc + 5)} · ${s(pc + 9)}`, `${s(pc)} · ${s(pc + 2)} · ${s(pc + 7)}`]),
      explain: `I – IV – V — все доминантсептаккорды: ${right}. Схема 12 тактов: I I I I · IV IV I I · V IV I V.` };
  } },
  'prog:ii-v-i': { title: 'ii–V–I', make: (c, rand) => {
    const pc = pickR(rand, [0, 7, 2, 5, 10]);
    const ch = diatonicChords(keyTonic(pc, 'ionian'), 'ionian', { sevenths: true });
    const sym = x => chordSymbol(x.root, x.type, { german: c.german });
    const right = `${sym(ch[1])} – ${sym(ch[4])} – ${sym(ch[0])}`;
    return { kind: 'choice', prompt: `ii–V–I в ${keyLabel(pc, 'maj', c)}?`,
      ...choice(rand, right, [`${sym(ch[3])} – ${sym(ch[4])} – ${sym(ch[0])}`, `${sym(ch[1])} – ${sym(ch[3])} – ${sym(ch[0])}`, `${sym(ch[5])} – ${sym(ch[1])} – ${sym(ch[0])}`]),
      explain: `ii — m7, V — 7, I — maj7: ${right}. Самый частый оборот в джазе: каждый аккорд на квинту ниже предыдущего.` };
  } },
};

function triadCard(c, rand, type) {
  const pc = pickR(rand, [0, 2, 4, 5, 7, 9, 11, 10, 3]);
  const info = chordInfo(pc, type, c.german);
  const other = type === 'maj' ? 'min' : 'maj';
  const alt = chordInfo(pc, other, c.german);
  const sym = chordSymbol(info.root, type, { german: c.german });
  if (rand() < 0.4) {
    const root = 45 + mod12(pc - 9);
    return { kind: 'choice', prompt: 'Послушай: мажор или минор?', ...choice(rand, type === 'maj' ? 'мажор' : 'минор', ['мажор', 'минор']),
      sound: chordSound(CHORD_TYPES[type].st.map(st => root + st)), explain: type === 'maj' ? 'Мажор — большая терция снизу (4+3): светло.' : 'Минор — малая терция снизу (3+4): грустно.' };
  }
  const shift = [...info.names.slice(0, 1), noteName(spellPc(pc + (type === 'maj' ? 5 : 2)), { german: c.german }), info.names[2]].join(' ');
  return { kind: 'choice', prompt: `Ноты аккорда ${sym}?`, ...choice(rand, info.names.join(' '), [alt.names.join(' '), shift, chordInfo(mod12(pc + 2), type, c.german).names.join(' ')]),
    sound: chordSound(CHORD_TYPES[type].st.map(st => 48 + mod12(pc) + st)),
    explain: `${sym}: ${info.names.join(' ')} — ступени ${info.degrees.join(' ')}, на круге ${info.sides.join(' + ')}.` };
}

function barreCard(c, rand, rootString) {
  const minor = rand() < 0.4;
  const type = minor ? 'min' : 'maj';
  const pc = pickR(rand, NAT_ROOTS.filter(p => mod12(p - c.tuning[rootString]) >= 1));
  const sh = shapesFor(type, c.tuningId).find(s => s.rootString === rootString);
  const frets = /** @type {any} */ (placeShape(/** @type {any} */ (sh), pc, c.tuning, null));
  const f = frets[rootString];
  const sym = chordSymbol(chordRoot(pc, type), type, { german: c.german });
  const form = rootString === 0 ? (minor ? 'Em' : 'E') : (minor ? 'Am' : 'A');
  return { kind: 'choice', prompt: `${sym} формой ${form} (корень на ${strGen(rootString)} струне): на каком ладу баррэ?`,
    ...choice(rand, `${f}-й`, [f + 1, f + 2, Math.max(1, f - 1), f + 5].map(x => `${x}-й`)),
    sound: chordSound(frets.flatMap((x, s) => (x == null ? [] : [c.tuning[s] + x]))),
    explain: `Корень формы ${form} — на ${strGen(rootString)} струне: ${both(c, pc)} там на ${f}-м ладу. Форма та же, что открытый ${form}, — только указательный пальцем вместо порожка.` };
}

function pentaStartCard(c, rand, index) {
  const pc = pickR(rand, MINOR_KEYS);
  const t = pentaTable(pc, 'minor', c.tuning)[index];
  return { kind: 'choice', prompt: `Минорная пентатоника ${keyLabel(pc, 'min', c)}, позиция ${index + 1}: с какого лада 6-й струны она начинается?`,
    ...choice(rand, `с ${t.startFret}-го`, [t.startFret + 2, t.startFret + 3, Math.max(0, t.startFret - 2), t.startFret + 5].map(x => `с ${x}-го`)),
    explain: index === 0 ? `Позиция 1 начинается с тоники на 6-й струне: ${both(c, pc)} — ${t.startFret}-й лад. Линейки: ${t.rulers.join(' ')}.` : `Позиция 2 начинается там, где кончилась линейка позиции 1 на 6-й струне: ${t.startFret}-й лад. Линейки: ${t.rulers.join(' ')}.` };
}

function modeCharCard(c, rand, id) {
  const deg = characteristicDegrees(id).join(' и ');
  if (rand() < 0.6) {
    return { kind: 'choice', prompt: `Характерная нота лада «${MODES[id].name.toLowerCase()}» — какая ступень?`, ...choice(rand, deg, ['6', '♭2', '♭6', '♯4', '♭7', '7']),
      explain: `${MODES[id].name} — ${MODES[id].alt}: от натурального минора его отличает ${deg}.` };
  }
  return { kind: 'choice', prompt: `Минор с ${id === 'dorian' ? 'большой секстой (6)' : 'малой секундой (♭2)'} — какой это лад?`,
    ...choice(rand, MODES[id].name, [MODES.dorian.name, MODES.phrygian.name, MODES.aeolian.name, MODES.locrian.name]),
    explain: id === 'dorian' ? 'Дорийский — минор с большой секстой: светлее натурального, «фанковый».' : 'Фригийский — минор с ♭2: полутон над тоникой звучит тяжело и «металлически».' };
}

function seventhCard(c, rand, type) {
  const pc = pickR(rand, NAT_ROOTS);
  const info = chordInfo(pc, type, c.german);
  const sym = chordSymbol(info.root, type, { german: c.german });
  if (rand() < 0.5) {
    const types = { maj7: 'maj7', dom7: '7', m7: 'm7' };
    return { kind: 'choice', prompt: `Ступени аккорда ${sym}?`, ...choice(rand, info.degrees.join(' '), ['1 3 5 7', '1 3 5 ♭7', '1 ♭3 5 ♭7', '1 ♭3 ♭5 ♭7']),
      sound: chordSound(CHORD_TYPES[type].st.map(st => 48 + mod12(pc) + st)), explain: `${types[type]} — ${info.degrees.join(' ')}: ${info.names.join(' ')}.` };
  }
  const names = { maj7: 'maj7 — мягкий, мечтательный', dom7: '7 — напряжённый, блюзовый', m7: 'm7 — мягкий минор' };
  return { kind: 'choice', prompt: `${info.names.join(' ')} — какой это септаккорд?`, ...choice(rand, names[type], Object.values(names)),
    sound: chordSound(CHORD_TYPES[type].st.map(st => 48 + mod12(pc) + st)), explain: `${sym}: ступени ${info.degrees.join(' ')}.` };
}

// ---------- общее ----------
/** Все карточки уроков (по порядку дорожки) */
export const LESSON_CARDS = Object.freeze(LESSONS.flatMap(l => l.cards));
/** Название колоды карточки */
export function cardTitle(id) {
  if (isNoteCard(id)) { const p = /** @type {any} */ (parseNoteCard(id)); return `Нота: ${6 - p.string}-я струна, ${p.fret === 0 ? 'открытая' : `${p.fret}-й лад`}`; }
  return MAKERS[id]?.title || id;
}
export const knownCard = id => !!MAKERS[id] || !!parseNoteCard(id);
/** Из какого урока карточка */
export const lessonOfCard = id => LESSONS.find(l => l.cards.includes(id)) || null;

/**
 * Вариант карточки на этот показ
 * @param {string} id @param {CardCtx} c @param {() => number} [rand]
 * @returns {Card | null}
 */
export function makeCard(id, c, rand = Math.random) {
  const note = parseNoteCard(id);
  if (note) return noteCard(c, note.string, note.fret, rand);
  const m = MAKERS[id];
  if (!m) return null;
  return /** @type {Card} */ ({ id, title: m.title, ...m.make(c, rand) });
}

/** Ответ на карточку «на грифе»: попал ли (струна + лад) */
export const neckHit = (card, spot) => (card.targets || []).some(t => t.string === spot.string && t.fret === spot.fret);
/** Высоты, которые засчитываются, если ответить игрой */
export const cardMidis = (card, tuning) => [...new Set((card.targets || []).map(t => tuning[t.string] + t.fret))];

export { INTERVALS };
