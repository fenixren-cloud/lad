// session.js — занятие на сегодня: из каких шагов и сколько минут. Чистая логика.
// Подбор учитывает дорожку (что уже пройдено и что дальше), рекорды упражнений (темп разминки),
// повторения (сколько карточек ждут), слух (что давно не делал) и перерыв (после недели — мягкий возврат).
import { earDrill } from './earquiz.js';
import { trackState, unitOf } from './curriculum.js';
import { EXERCISES } from './metronome.js';
import { daysBetween } from './dates.js';

export const LENGTHS = Object.freeze([10, 25, 45]);

/**
 * Шаги занятия: что делать и где это открыть (query — как сразу настроить инструмент).
 * @typedef {{ id: string, title: string, detail: string, minutes: number, section: string, page: string | null, optional?: boolean, query?: Record<string, string>, track?: string }} Step
 */
const STEP = {
  tune: { title: 'Настрой гитару', detail: 'Тюнер · можно пропустить', section: 'play', page: 'tuner', optional: true },
  warmup: { title: 'Разминка', detail: 'Хроматика 1-2-3-4: лестница темпа', section: 'play', page: 'metronome', query: { ex: 'chrom' } },
  lesson: { title: 'Тема дня', detail: 'Урок теории', section: 'theory', page: 'lesson' },
  review: { title: 'Повторения', detail: 'Карточки, которые пора повторить', section: 'progress', page: 'review' },
  ear: { title: 'Слух', detail: 'Перекличка: услышь фразу — повтори на гитаре', section: 'ear', page: 'callback' },
  play: { title: 'Играй', detail: 'Импровизация над подложкой в ре миноре', section: 'play', page: 'backing', query: { tonic: '2', mode: 'aeolian' } },
  riff: { title: 'Свой рифф', detail: 'Сочини или повтори рифф в Drop D', section: 'play', page: 'riffs' },
};
/** Сколько минут на каждый шаг при разной длине занятия */
const PLAN = {
  10: [['tune', 1], ['warmup', 3], ['lesson', 4], ['play', 2]],
  25: [['tune', 2], ['warmup', 4], ['lesson', 8], ['review', 4], ['ear', 3], ['play', 4]],
  45: [['tune', 2], ['warmup', 6], ['lesson', 12], ['review', 6], ['ear', 6], ['play', 8], ['riff', 5]],
};
/** Подложка под тему ступени дорожки: играешь то, что сейчас учишь */
const PLAY_FOR_UNIT = {
  penta: { tonic: '9', mode: 'aeolian', text: 'Импровизация над подложкой в ля миноре: позиции пентатоники' },
  intervals: { tonic: '9', mode: 'aeolian', text: 'Импровизация в ля миноре: прыгай на терции и квинты' },
  fifths: { tonic: '2', mode: 'aeolian', text: 'Подложка в ре миноре: целевые ноты — ноты аккорда' },
  blues: { tonic: '9', mode: 'mixolydian', text: 'Блюз в ля: блюзовая нота — проскальзывай через неё' },
  modes: { tonic: '2', mode: 'dorian', text: 'Ре дорийский над подложкой: услышь большую сексту' },
  sevenths: { tonic: '9', mode: 'mixolydian', text: 'Блюз в ля: септаккорды и пентатоника' },
};
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

/**
 * @typedef {{ lesson?: { id: string, title: string } | null, earStats?: Record<string, { last?: string }>,
 *   track?: import('./curriculum.js').TrackData | null, cards?: { due: number, fresh: number } | null,
 *   today?: string, lastDay?: string | null }} PlanInput
 *   lesson — следующий урок (если дорожка не передана); track — все данные для дорожки; cards — сколько карточек
 *   ждут сегодня; lastDay — последний день занятий (после недели перерыва — мягкий возврат)
 */

/**
 * @param {number} minutes 10, 25 или 45 (другое — ближайшее)
 * @param {PlanInput} [o]
 * @returns {{ minutes: number, steps: Step[], comeback: boolean }}
 */
export function planSession(minutes, { lesson = null, earStats = {}, track = null, cards = null, today = '', lastDay = null } = {}) {
  const len = LENGTHS.reduce((best, l) => (Math.abs(l - minutes) < Math.abs(best - minutes) ? l : best), LENGTHS[1]);
  const state = track ? trackState(track) : null;
  const comeback = !!(today && lastDay && daysBetween(lastDay, today) >= 7);
  const records = track?.records || {};

  const steps = PLAN[len].map(([id, m]) => {
    /** @type {Step} */
    const base = { id, minutes: m, ...STEP[id] };
    const fromItem = (item, extra = {}) => ({ ...base, title: base.title, detail: `${item.title}: ${item.detail}`, section: item.section, page: item.page, query: item.query, track: item.id, ...extra });

    if (id === 'warmup') {
      const drill = state?.nextWhere(i => i.kind === 'drill' && i.page === 'metronome');
      // нет цели дорожки — хроматика для начала, а когда есть рекорды — по очереди среди своих упражнений
      const mine = EXERCISES.filter(e => records[e.id]);
      const exId = drill?.query?.ex || (mine.length ? mine[(today ? Math.abs(daysBetween('2026-01-01', today)) : 0) % mine.length].id : 'chrom');
      const ex = /** @type {any} */ (EXERCISES.find(e => e.id === exId));
      const bpm = records[exId]?.bpm || ex.start;
      return { ...base, detail: comeback ? `${ex.name}: спокойно, ${Math.max(ex.start, bpm - 8)} BPM — разогрей руки` : `${ex.name}: лестница темпа с ${bpm} BPM`, query: { ex: exId }, track: drill?.id };
    }
    if (id === 'lesson') {
      if (comeback && state && state.done > 0) return { ...base, title: 'С возвращением', detail: 'Повтори пройденное: карточки освежат память', section: 'progress', page: 'review', query: undefined };
      if (state) {
        const item = state.nextWhere(i => i.kind === 'lesson') || state.nextWhere(i => i.kind === 'drill' && i.page !== 'metronome' && i.section !== 'ear');
        if (item) return item.kind === 'lesson' ? { ...base, detail: `Урок: ${item.title}`, query: item.query, track: item.id } : fromItem(item);
        return { ...base, detail: 'Дорожка пройдена: пентатоника по всему грифу', page: 'penta' };
      }
      return lesson ? { ...base, detail: `Урок: ${lesson.title}`, query: { id: lesson.id } } : { ...base, detail: 'Пентатоника: позиции линейками', page: 'penta' };
    }
    if (id === 'review' && cards) {
      const n = cards.due + cards.fresh;
      if (n) return { ...base, detail: `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}${cards.fresh ? `, из них новых ${cards.fresh}` : ''}` };
      return { ...base, title: 'Гриф', detail: 'Карточек на сегодня нет — найди ноты на грифе', section: 'ear', page: 'notes', query: { mode: 'find' } };
    }
    if (id === 'ear') {
      const drill = state?.nextWhere(i => i.kind === 'drill' && i.section === 'ear');
      return drill ? fromItem(drill) : { ...base, ...earDrill(earStats) };
    }
    if (id === 'play') {
      const self = state?.nextWhere(i => i.kind === 'self');
      if (self) return fromItem(self);
      const unit = state?.current && PLAY_FOR_UNIT[state.current.id];
      if (unit) return { ...base, detail: unit.text, query: { tonic: unit.tonic, mode: unit.mode } };
    }
    return base;
  });
  return { minutes: len, steps, comeback };
}

/** Тема ступени дорожки, к которой относится шаг */
export const stepUnit = step => (step.track ? unitOf(step.track) : null);

/** «23 ноября, понедельник» → «Понедельник, 23 ноября» */
export function dayTitle(date = new Date()) {
  const s = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
