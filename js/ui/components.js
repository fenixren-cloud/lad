// components.js — компоненты дизайн-системы «Графит»: кнопки, переключатель-сегменты, карточки,
// строки списка, заголовок экрана, значок ступени. Все зоны нажатия — от 44 px.
import { h, bindAttr } from './dom.js';
import { icon } from './icons.js';

/**
 * Кнопка. kind: primary (главная, на всю ширину), ghost (контур), plain (тихая).
 * @param {{ kind?: 'primary' | 'ghost' | 'plain', icon?: any, label: string, onclick?: (e: Event) => void, attrs?: Record<string, any> }} p
 */
export function button({ kind = 'ghost', icon: ic = null, label, onclick, attrs = {} }) {
  return h('button', { type: 'button', class: `btn btn-${kind}`, onclick, ...attrs }, ic ? icon(ic, 20) : null, h('span', null, label));
}

/** Круглая кнопка-иконка (обязательна подпись для диктора) */
export function iconButton({ icon: ic, label, onclick, attrs = {} }) {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick, ...attrs }, icon(ic, 22));
}

/**
 * Переключатель-сегменты, привязанный к сигналу: выбор сразу виден и не пересоздаёт кнопки.
 * @param {{ label: string, options: [string, string][], sig: { value: any, watch: Function }, onchange: (v: string) => void, name?: string }} p
 */
export function segmented({ label, options, sig, onchange, name = '' }) {
  const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label, dataset: { setting: name } });
  for (const [value, text] of options) {
    const b = h('button', { type: 'button', role: 'radio', dataset: { value }, onclick: () => onchange(value) }, text);
    bindAttr(b, 'aria-checked', /** @type {any} */ (sig), v => String(v === value));
    group.append(b);
  }
  // стрелки клавиатуры двигают выбор, как в настоящей группе радиокнопок
  group.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const i = options.findIndex(([v]) => v === sig.value);
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = options[(i + d + options.length) % options.length][0];
    onchange(next);
    /** @type {HTMLElement | null} */ (group.querySelector(`[data-value="${next}"]`))?.focus();
    e.preventDefault();
  });
  return group;
}

/** Карточка с необязательным заголовком */
export function card({ title = null, cls = '', id = null } = {}, ...children) {
  const head = title ? h('h2', { class: 'card-title', id: id ? `${id}-h` : null }, title) : null;
  return h('section', { class: `card ${cls}`.trim(), 'aria-labelledby': head ? `${id}-h` : null, id }, head, ...children);
}

/**
 * Строка-ссылка списка: заголовок, пояснение, справа — метка и стрелка.
 * @param {{ href: string, title: string, hint?: string, badge?: string | null, lead?: any }} p
 */
export function linkRow({ href, title, hint = '', badge = null, lead = null }) {
  return h('a', { class: 'row-link', href },
    lead,
    h('span', { class: 'row-text' }, h('b', null, title), hint ? h('span', { class: 'muted' }, hint) : null),
    badge ? h('span', { class: 'badge' }, badge) : null,
    icon('next', 20));
}

/**
 * Заголовок экрана: надзаголовок, заголовок, кнопки справа, «назад».
 * @param {{ eyebrow?: string, title: string, back?: string | null, actions?: any[] }} p
 */
export function screenHeader({ eyebrow = '', title, back = null, actions = [] }) {
  return h('header', { class: 'screen-head' },
    back ? h('a', { class: 'icon-btn back', href: back, 'aria-label': 'Назад' }, icon('back', 22)) : null,
    h('div', { class: 'head-text' }, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h1', { tabindex: '-1' }, title)),
    actions.length ? h('div', { class: 'head-actions' }, ...actions) : null);
}

/** Значок ступени: цвет + подпись (ступень узнаётся не только по цвету) */
export function degreeBadge(label, role) {
  return h('span', { class: `deg deg-${role}`, 'aria-label': `ступень ${label}` }, label);
}
