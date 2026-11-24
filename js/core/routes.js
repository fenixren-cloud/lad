// routes.js — разделы и маршруты приложения. Адрес — через #хэш: так работает и на GitHub Pages,
// и в офлайн-файле с диска. Чистая логика.

/** Пять разделов нижней панели */
export const SECTIONS = Object.freeze([
  { id: 'today', title: 'Сегодня', icon: 'today' },
  { id: 'theory', title: 'Теория', icon: 'theory' },
  { id: 'play', title: 'Играть', icon: 'play' },
  { id: 'ear', title: 'Слух', icon: 'ear' },
  { id: 'progress', title: 'Прогресс', icon: 'progress' },
]);

/**
 * Инструменты и темы внутри разделов. stage — на каком этапе появятся.
 * Каждый работает и сам по себе, и как шаг занятия «Сегодня».
 */
export const PAGES = Object.freeze({
  // у «Сегодня» нет списка страниц: дорожка открывается с главного экрана
  today: [
    { id: 'path', title: 'Учебная дорожка', hint: '10 ступеней: уроки и практика с целями', stage: 6, hidden: true },
  ],
  theory: [
    { id: 'neck', title: 'Гриф и интервалы', hint: '12 нот как циферблат, интервалы на грифе', stage: 4 },
    { id: 'chords', title: 'Аккорды', hint: 'фигуры на круге, баррэ, Drop D', stage: 4 },
    { id: 'fifths', title: 'Квинтовый круг', hint: 'тональности, знаки, ступени, V → I', stage: 4 },
    { id: 'penta', title: 'Пентатоника', hint: '5 позиций линейками, блюзовая нота', stage: 4 },
    { id: 'modes', title: 'Лады', hint: 'дорийский, фригийский и другие', stage: 4 },
    { id: 'sevenths', title: 'Септаккорды', hint: 'maj7, 7, m7, блюз, ii–V–I', stage: 4 },
    // урок открывается из темы или «Сегодня» (#/theory/lesson?id=…); в списке раздела его нет
    { id: 'lesson', title: 'Урок', hint: 'урок теории', stage: 4, hidden: true },
  ],
  play: [
    { id: 'tuner', title: 'Тюнер', hint: 'Standard и Drop D, вход звуковой карты', stage: 3 },
    { id: 'metronome', title: 'Метроном', hint: 'деления, ритмы, лестница темпа', stage: 3 },
    { id: 'backing', title: 'Подложка', hint: 'играй поверх барабанов, баса и гитары', stage: 3 },
    { id: 'riffs', title: 'Риффы и табы', hint: 'свои риффы, редактор, проигрывание', stage: 3 },
    { id: 'rhythm', title: 'Тест ритма', hint: 'насколько ровно ты попадаешь в долю', stage: 3 },
  ],
  ear: [
    { id: 'dictation', title: 'Диктант на грифе', hint: 'услышь мелодию — найди на грифе', stage: 5 },
    { id: 'callback', title: 'Перекличка', hint: 'приложение играет фразу — повтори на гитаре', stage: 5 },
    { id: 'intervals', title: 'Интервалы', hint: 'узнай расстояние на слух', stage: 5 },
    { id: 'chords', title: 'Аккорды на слух', hint: 'мажор, минор, пауэр, септаккорды', stage: 5 },
    { id: 'notes', title: 'Ноты на грифе', hint: 'найди ноту, собери аккорд, кто лишний в тональности', stage: 5 },
  ],
  progress: [
    { id: 'review', title: 'Повторения', hint: 'карточки, которые пора повторить', stage: 6 },
    { id: 'journal', title: 'Журнал', hint: 'минуты и упражнения по дням, серия дней', stage: 6 },
    { id: 'charts', title: 'Графики', hint: 'темп, ритм, слух', stage: 6 },
    { id: 'map', title: 'Карта грифа', hint: 'какие ноты уже знаешь', stage: 6 },
    { id: 'data', title: 'Мои данные', hint: 'резервная копия, восстановление', stage: 2 },
  ],
});

/** Страницы, которые уже работают (остальные честно показывают, когда появятся) */
export const READY = new Set(['progress/data', 'progress/review', 'progress/journal', 'progress/charts', 'progress/map', 'today/path', 'play/tuner', 'play/metronome', 'play/rhythm', 'play/backing', 'play/riffs',
  'theory/neck', 'theory/chords', 'theory/fifths', 'theory/penta', 'theory/modes', 'theory/sevenths', 'theory/lesson',
  'ear/dictation', 'ear/callback', 'ear/intervals', 'ear/chords', 'ear/notes']);
export const isReady = (section, page) => READY.has(`${section}/${page}`);

/**
 * @typedef {{ path: string, section: string, page: string | null, query: Record<string, string>, redirected: boolean }} Route
 */

/**
 * Разобрать адрес: '#/play/tuner?bpm=90' → { section: 'play', page: 'tuner', query: { bpm: '90' } }.
 * Неизвестный адрес ведёт на «Сегодня».
 * @param {string} hash
 * @returns {Route}
 */
export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  const fallback = { path: '/today', section: 'today', page: null, query, redirected: true };
  if (!parts.length) return { ...fallback, redirected: raw !== '' && raw !== '/' };
  const [section, page = null, ...rest] = parts;
  if (rest.length) return fallback;
  if (section === 'settings' && !page) return { path: '/settings', section: 'settings', page: null, query, redirected: false };
  if (!SECTIONS.some(s => s.id === section)) return fallback;
  if (page && !(PAGES[section] || []).some(p => p.id === page)) return fallback;
  return { path: page ? `/${section}/${page}` : `/${section}`, section, page, query, redirected: false };
}

/** Адрес для перехода: ('play', 'tuner') → '#/play/tuner' */
export function routeHref(section, page = null, query = null) {
  const q = query && Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
  return `#/${section}${page ? '/' + page : ''}${q}`;
}

/** Описание страницы раздела или null */
export const pageInfo = (section, page) => (PAGES[section] || []).find(p => p.id === page) || null;

/** Все адреса приложения — для проверок «каждый экран открывается» */
export function allRoutes() {
  const out = SECTIONS.map(s => routeHref(s.id));
  for (const [section, list] of Object.entries(PAGES)) for (const p of list) out.push(routeHref(section, p.id));
  out.push('#/settings');
  return out;
}
