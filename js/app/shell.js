// shell.js — каркас: место для экрана, нижняя панель (на ноутбуке — боковая), мини-плеер,
// плашка обновления. Каркас строится один раз; при переходе меняется только содержимое <main>.
import { h, bindAttr } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { SECTIONS } from '../core/routes.js';
import { route } from './router.js';
import { nowPlaying } from './state.js';
import { APP_NAME } from './version.js';

/** Экраны грузятся лениво: открыл раздел — загрузился его код */
const SCREENS = {
  today: () => import('../screens/today.js'),
  theory: () => import('../screens/section.js'),
  play: () => import('../screens/section.js'),
  ear: () => import('../screens/section.js'),
  progress: () => import('../screens/section.js'),
  settings: () => import('../screens/settings.js'),
  page: () => import('../screens/soon.js'),
  // готовые инструменты и темы: «раздел/страница»
  'progress/data': () => import('../screens/data.js'),
  'progress/review': () => import('../screens/review.js'),
  'progress/journal': () => import('../screens/journal.js'),
  'progress/charts': () => import('../screens/charts.js'),
  'progress/map': () => import('../screens/neckmap.js'),
  'today/path': () => import('../screens/path.js'),
  'play/tuner': () => import('../screens/tuner.js'),
  'play/metronome': () => import('../screens/metronome.js'),
  'play/rhythm': () => import('../screens/rhythm.js'),
  'play/backing': () => import('../screens/backing.js'),
  'play/riffs': () => import('../screens/riffs.js'),
  'theory/neck': () => import('../screens/theory-neck.js'),
  'theory/chords': () => import('../screens/theory-chords.js'),
  'theory/fifths': () => import('../screens/theory-fifths.js'),
  'theory/penta': () => import('../screens/theory-penta.js'),
  'theory/modes': () => import('../screens/theory-modes.js'),
  'theory/sevenths': () => import('../screens/theory-sevenths.js'),
  'theory/lesson': () => import('../screens/lesson.js'),
  'ear/dictation': () => import('../screens/ear-dictation.js'),
  'ear/callback': () => import('../screens/ear-callback.js'),
  'ear/intervals': () => import('../screens/ear-intervals.js'),
  'ear/chords': () => import('../screens/ear-chords.js'),
  'ear/notes': () => import('../screens/ear-notes.js'),
};
const pickScreen = r => {
  if (r.section === 'settings') return 'settings';
  if (!r.page) return r.section === 'today' ? 'today' : r.section;
  const key = `${r.section}/${r.page}`;
  return key in SCREENS ? key : 'page';
};

function navItem(s) {
  const a = h('a', { class: 'nav-item', href: `#/${s.id}`, dataset: { section: s.id } }, icon(/** @type {any} */ (s.icon), 22), h('span', null, s.title));
  bindAttr(a, 'aria-current', route, r => (r.section === s.id ? 'page' : null));
  return a;
}

function miniPlayer() {
  const title = h('b');
  const detail = h('span', { class: 'muted' });
  const open = h('a', { class: 'mini-open', href: '#/play' }, h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', { class: 'mini-text' }, title, detail));
  const stop = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Остановить', onclick: () => nowPlaying.value?.stop() }, icon('stopFill', 18));
  const box = h('div', { class: 'mini', role: 'region', 'aria-label': 'Сейчас играет', hidden: true }, open, stop);
  nowPlaying.watch(p => {
    box.hidden = !p;
    document.body.classList.toggle('has-mini', !!p);
    if (!p) return;
    title.textContent = p.title;
    detail.textContent = p.detail;
    open.setAttribute('href', p.href);
  });
  return box;
}

/** @param {HTMLElement} root */
export function mountShell(root) {
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Разделы' },
    h('div', { class: 'brand', 'aria-hidden': 'true' }, h('span', { class: 'brand-mark' }), APP_NAME),
    ...SECTIONS.map(navItem));
  const banner = h('div', { class: 'banner', id: 'banner', hidden: true, role: 'status' });
  const live = h('div', { id: 'live', class: 'sr-only', 'aria-live': 'polite' });
  root.replaceChildren(
    h('a', { class: 'skip', href: '#main', onclick: e => { e.preventDefault(); main.focus(); } }, 'К содержимому'),
    banner, main, miniPlayer(), nav, live);

  let current = { key: '', dispose: () => {} };
  let seq = 0;
  route.watch(async r => {
    const key = r.path + '?' + new URLSearchParams(r.query).toString();
    if (key === current.key) return;
    const my = ++seq;
    const mod = await SCREENS[pickScreen(r)]();
    if (my !== seq) return; // пока грузилось, ушли на другой экран
    current.dispose();
    const view = mod.render(r);
    current = { key, dispose: view.dispose || (() => {}) };
    main.replaceChildren(view.el);
    main.scrollTop = 0;
    scrollTo(0, 0);
    document.title = `${view.title || APP_NAME} · ${APP_NAME}`;
    // фокус на заголовок — экранный диктор сразу говорит, куда пришли
    if (document.activeElement && document.activeElement !== document.body) /** @type {HTMLElement | null} */ (main.querySelector('h1'))?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('lad:screen', { detail: r.path }));
  });
  return { main, banner };
}
