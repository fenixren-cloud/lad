// curriculum.js — учебная дорожка: 10 ступеней от грифа до септаккордов. На каждой — уроки теории и практика
// с понятной целью («лестница темпа palm mute до 88 BPM», «перекличка: уровень 3»). Цель засчитывается сама —
// по рекордам, тесту ритма, слуху и повторениям. Импровизацию и сочинение приложение не оценивает: их
// отмечаешь сам кнопкой «Сделано». Ступень открывается, когда пройдены уроки предыдущей. Чистая логика.
import { lessonById } from './lessons.js';
import { EXERCISES } from './metronome.js';
import { accuracy } from './earquiz.js';
import { isNoteCard } from './cards.js';
import { LEARNED_BOX } from './srs.js';

/**
 * Данные, по которым проверяются цели (всё — из хранилища)
 * @typedef {{ lessons?: { done?: Record<string, string> }, records?: Record<string, { best?: number, bpm?: number }>, rhythmHist?: { mode: string, score: number }[],
 *   earBest?: Record<string, number>, earStats?: Record<string, { right: number, total: number }>, ear?: Record<string, any>,
 *   riffs?: any[], deck?: Record<string, { box: number }>, track?: { done?: Record<string, string> } }} TrackData
 * @typedef {{ value: number, target: number, text: string }} Goal
 * @typedef {{ id: string, kind: 'lesson' | 'drill' | 'self', title: string, detail: string, section: string, page: string,
 *   query?: Record<string, string>, minutes: number, goal?: (d: TrackData) => Goal }} Item
 * @typedef {{ id: string, title: string, why: string, items: Item[] }} Unit
 */

const startOf = id => EXERCISES.find(e => e.id === id)?.start ?? 60;
/** Лестница темпа: рекорд не ниже старта + up BPM */
const tempo = (ex, up) => d => { const target = startOf(ex) + up, value = d.records?.[ex]?.best || 0; return { value, target, text: value ? `рекорд ${value} BPM, цель ${target}` : `цель — ${target} BPM` }; };
/** Тест ритма: лучший балл в режиме */
const rhythm = (mode, target) => d => { const value = Math.max(0, ...(d.rhythmHist || []).filter(h => h.mode === mode).map(h => h.score || 0)); return { value, target, text: value ? `лучший балл ${value}, цель ${target}` : `цель — ${target} баллов` }; };
/** Квиз слуха: точность после хотя бы n ответов */
const ear = (quiz, pct, n = 20) => d => {
  const s = d.earStats?.[quiz];
  const total = s?.total || 0, acc = accuracy(s) || 0;
  return total < n ? { value: total, target: n, text: `ответов ${total} из ${n}` } : { value: acc, target: pct, text: `точность ${acc} % (цель ${pct} %)` };
};
/** Перекличка: уровень в режиме */
const callback = (mode, level) => d => { const value = d.ear?.callback?.levels?.[mode]?.level || 1; return { value, target: level, text: `уровень ${value}, цель — ${level}` }; };
/** Серия правильных ответов */
const streak = (quiz, target) => d => { const value = d.earBest?.[quiz] || 0; return { value, target, text: `рекорд серии ${value}, цель — ${target}` }; };
/** Ноты на грифе: сколько выучено */
const notes = target => d => { const value = Object.entries(d.deck || {}).filter(([id, c]) => isNoteCard(id) && c.box >= LEARNED_BOX).length; return { value, target, text: `выучено нот ${value} из ${target}` }; };
/** Свои риффы */
const riffs = target => d => { const value = (d.riffs || []).length; return { value, target, text: `сохранено риффов ${value} из ${target}` }; };

/** @param {string} id @returns {Item} */
const L = id => { const l = /** @type {any} */ (lessonById(id)); return { id: `lesson:${id}`, kind: 'lesson', title: l.title, detail: `${l.minutes} мин`, section: 'theory', page: 'lesson', query: { id }, minutes: l.minutes }; };
/** @returns {Item} */
const D = (id, title, detail, section, page, goal, query = undefined, minutes = 5) => ({ id, kind: 'drill', title, detail, section, page, goal, query, minutes });
/** @returns {Item} */
const S = (id, title, detail, section, page, query = undefined, minutes = 5) => ({ id, kind: 'self', title, detail, section, page, query, minutes });

/** @type {Unit[]} */
export const TRACK = [
  { id: 'neck', title: 'Гриф', why: '12 нот как циферблат — и ноты на басовых струнах без зубрёжки.',
    items: [L('neck-clock'), L('neck-strings'), L('neck-low'),
      D('find-low', 'Найти ноту', 'Квиз «Ноты на грифе»: струна и нота — коснись или сыграй', 'ear', 'notes', ear('find', 80), { mode: 'find' }),
      D('notes-12', 'Ноты в повторениях', 'Карточки нот на 6-й и 5-й струнах: выучи первые 12', 'progress', 'review', notes(12), { deck: 'notes' })] },
  { id: 'power', title: 'Пауэр-аккорды и правая рука', why: 'Основа рока и метала: пауэр-аккорды, palm mute, галоп и первый свой рифф.',
    items: [L('chords-power'),
      D('pm-ladder', 'Palm mute', 'Метроном: лестница темпа — 3 раза чисто → +4 BPM', 'play', 'metronome', tempo('pm', 8), { ex: 'pm' }),
      D('power-ladder', 'Смена пауэр-аккордов', 'Метроном: лестница темпа', 'play', 'metronome', tempo('power', 8), { ex: 'power' }),
      D('gallop-ladder', 'Галоп', 'Метроном: «тыгыдык» с palm mute', 'play', 'metronome', tempo('gallop', 8), { ex: 'gallop' }),
      D('first-riff', 'Первый свой рифф', 'Риффы: 2 такта из D5, F5, G5, A5 в Drop D — сохрани', 'play', 'riffs', riffs(1))] },
  { id: 'rhythm', title: 'Ритм', why: 'Держать долю: четверти, восьмые, «и» — и честно мерить, насколько ровно.',
    items: [D('rh-quarters', 'Тест ритма: четверти', 'Бей в долю касанием, пробелом или по струнам', 'play', 'rhythm', rhythm('quarters', 70)),
      D('rh-eighths', 'Тест ритма: восьмые', 'Две доли на клик — «раз-и»', 'play', 'rhythm', rhythm('eighths', 70)),
      D('rh-offbeats', 'Тест ритма: только «и»', 'Самое трудное: удар между кликами', 'play', 'rhythm', rhythm('offbeats', 60)),
      D('count-ladder', 'Счёт и ритм', 'Метроном: четверти → восьмые → триоли → шестнадцатые без остановки', 'play', 'metronome', tempo('count', 8), { ex: 'count' })] },
  { id: 'penta', title: 'Пентатоника линейками', why: 'Главная гамма рока: позиция 1 линейками, потом все пять — и первые фразы на слух.',
    items: [L('penta-pos1'), L('penta-positions'),
      D('cb-penta', 'Перекличка в пентатонике', 'Повтори фразу на гитаре — дойди до уровня 3', 'ear', 'callback', callback('penta', 3)),
      D('alt-ladder', 'Переменный штрих', 'Метроном: по позиции пентатоники вниз-вверх', 'play', 'metronome', tempo('alt', 8), { ex: 'alt' }),
      S('impro-1', 'Импровизация в позиции 1', 'Подложка в ля миноре: играй позицию 1, заканчивай фразы на тонике', 'play', 'backing', { tonic: '9', mode: 'aeolian' })] },
  { id: 'intervals', title: 'Интервалы', why: 'Расстояния между нотами на грифе и на слух — основа подбора.',
    items: [L('neck-intervals'),
      D('iv-easy', 'Интервалы на слух', 'Лёгкий уровень: терции, квинта, октава', 'ear', 'intervals', ear('intervals', 75)),
      D('dict-2', 'Диктант на грифе', 'Услышь мелодию — найди на грифе', 'ear', 'dictation', ear('dictation', 70)),
      D('notes-30', 'Ноты в повторениях', 'Ещё нот на грифе: 30 выученных', 'progress', 'review', notes(30), { deck: 'notes' })] },
  { id: 'triads', title: 'Трезвучия как фигуры', why: 'Мажор 4+3 и минор 3+4 на круге, формы баррэ E и A.',
    items: [L('chords-triads'), L('chords-barre'),
      D('ch-easy', 'Аккорды на слух', 'Мажор или минор?', 'ear', 'chords', ear('chords', 80)),
      D('build', 'Собрать аккорд', 'Квиз «Ноты на грифе»: собери аккорд на круге', 'ear', 'notes', streak('build', 5), { mode: 'build' }),
      D('mute-ladder', 'Глушение лишних струн', 'Метроном: чистый звук под перегрузом', 'play', 'metronome', tempo('mute', 8), { ex: 'mute' })] },
  { id: 'fifths', title: 'Квинтовый круг', why: 'Тональности, знаки и аккорды тональности — особенно ре минор и V → I.',
    items: [L('fifths-circle'), L('fifths-degrees'),
      D('odd', 'Кто лишний в тональности', 'Квиз «Ноты на грифе»: найди чужой аккорд', 'ear', 'notes', streak('odd', 5), { mode: 'odd' }),
      S('impro-dm', 'Импровизация в ре миноре', 'Подложка i–VI–III–VII: целевые ноты — ноты аккорда', 'play', 'backing', { tonic: '2', mode: 'aeolian' })] },
  { id: 'blues', title: 'Пентатоника дальше', why: 'Соединение позиций, блюзовая нота, мажорная пентатоника и риффы на слух.',
    items: [L('penta-blues'),
      D('cb-riff', 'Перекличка: рифф на низких струнах', 'Повтори кусок риффа — уровень 3', 'ear', 'callback', callback('riff', 3)),
      D('bend-ladder', 'Бенды и вибрато', 'Метроном: бенд до высоты эталона', 'play', 'metronome', tempo('bend', 8), { ex: 'bend' }),
      S('impro-blues', 'Блюз в ля', 'Подложка: 12-тактовый блюз, проскальзывай через блюзовую ноту', 'play', 'backing', { tonic: '9', mode: 'mixolydian' })] },
  { id: 'modes', title: 'Лады', why: 'Дорийский, фригийский и другие: у каждого своя характерная нота и настроение.',
    items: [L('modes-minor'), L('modes-ladder'),
      S('impro-dorian', 'Дорийский над подложкой', 'Подложка в ре дорийском: найди на слух большую сексту', 'play', 'backing', { tonic: '2', mode: 'dorian' }),
      D('riff-phryg', 'Фригийский рифф', 'Риффы: ♭2 на 6-й струне (в Drop D — ре–ми♭) с palm mute; сохрани второй рифф', 'play', 'riffs', riffs(2))] },
  { id: 'sevenths', title: 'Септаккорды и блюз', why: 'maj7, 7, m7, блюз и ii–V–I — гармония дальше трезвучий.',
    items: [L('sevenths-types'), L('sevenths-blues'),
      D('ch-7', 'Септаккорды на слух', 'Аккорды на слух: уровень «септаккорды»', 'ear', 'chords', streak('chords', 10)),
      D('chrom-ladder', 'Хроматика 1-2-3-4', 'Метроном: ровность и синхронность рук', 'play', 'metronome', tempo('chrom', 16), { ex: 'chrom' })] },
];

/** Что учить после дорожки — следующие темы (из плана «Гитарного круга») */
export const NEXT_TOPICS = Object.freeze([
  ['Система CAGED', '5 форм аккордов = 5 позиций пентатоники. Формы E и A ты уже знаешь — осталось три.'],
  ['Гаммы по 3 ноты на струну', 'Те же лады, но удобнее для быстрых пассажей и легато.'],
  ['Синкопы и неровные размеры', 'Смещённые акценты в риффах, 7/8 как 2+2+3 — метроном умеет такие акценты.'],
  ['Техника', 'Легато (хаммеры и пуллы), слайды, флажолеты, тремоло; свип — позже.'],
  ['Гармония', 'Заимствованные аккорды (♭VI, ♭VII в мажоре), вторичные доминанты, гармонический минор в метале.'],
  ['Слух', 'Снимай риффы любимых песен сам: сначала корни и бас, потом ритм, потом детали.'],
  ['Запись', 'Запиши ритм-гитару дважды и разведи дубли влево и вправо — звук станет плотным.'],
]);

export const ALL_ITEMS = Object.freeze(TRACK.flatMap(u => u.items));
export const itemById = id => ALL_ITEMS.find(i => i.id === id) || null;
export const unitOf = id => TRACK.find(u => u.items.some(i => i.id === id)) || null;

/**
 * Пройден ли шаг дорожки
 * @param {Item} item @param {TrackData} d
 */
export function itemDone(item, d) {
  if (d.track?.done?.[item.id]) return true;
  if (item.kind === 'lesson') return !!d.lessons?.done?.[/** @type {any} */ (item.query).id];
  if (item.kind === 'drill') { const g = /** @type {any} */ (item.goal)(d); return g.value >= g.target; }
  return false;
}

/**
 * Состояние всей дорожки: что пройдено, что открыто, что следующее.
 * Ступень открыта, если пройдены уроки всех предыдущих (практику можно догонять параллельно).
 * @param {TrackData} d
 */
export function trackState(d) {
  let lessonsBefore = true;
  /** @type {Item | null} */
  let next = null;
  const units = TRACK.map(u => {
    const open = lessonsBefore;
    const items = u.items.map(item => {
      const done = itemDone(item, d);
      const goal = item.kind === 'drill' ? /** @type {any} */ (item.goal)(d) : null;
      return { item, done, goal };
    });
    if (items.some(x => x.item.kind === 'lesson' && !x.done)) lessonsBefore = false;
    if (open && !next) next = items.find(x => !x.done)?.item || null;
    return { unit: u, open, items, done: items.filter(x => x.done).length };
  });
  const total = ALL_ITEMS.length, done = units.reduce((s, u) => s + u.done, 0);
  /** Первый непройденный шаг в открытых ступенях, подходящий под условие */
  const nextWhere = pred => { for (const u of units) if (u.open) for (const x of u.items) if (!x.done && pred(x.item)) return x.item; return null; };
  return { units, next, done, total, nextWhere, current: units.find(u => u.open && u.done < u.items.length)?.unit || TRACK[TRACK.length - 1] };
}
