// dom.js — маленькие помощники для разметки без фреймворка и без строк-шаблонов.
// Элементы создаются один раз, а меняются точечно через bind/bindAttr при изменении сигналов.

/** @typedef {Node | string | number | null | undefined | false | Child[]} Child */

/**
 * Создать элемент: h('button', { class: 'btn', onclick: fn, 'aria-label': '…' }, 'Текст').
 * Свойства: class, style (объект), dataset (объект), on<событие> — обработчики, остальное — атрибуты
 * (true → пустой атрибут, false/null → нет атрибута).
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...Child} children
 * @returns {HTMLElement}
 */
export function h(tag, props = null, ...children) {
  const svg = tag.startsWith('svg:');
  const node = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.setAttribute('class', String(v));
    else if (k === 'style' && typeof v === 'object') Object.assign(/** @type {HTMLElement} */ (node).style, v);
    else if (k === 'dataset') Object.assign(/** @type {HTMLElement} */ (node).dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  append(node, children);
  return /** @type {HTMLElement} */ (node);
}

/** @param {Node} node @param {Child[]} children */
export function append(node, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else node.appendChild(typeof c === 'object' ? /** @type {Node} */ (c) : document.createTextNode(String(c)));
  }
  return node;
}

/**
 * Привязать текст узла к сигналу. Возвращает отписку.
 * @template T
 * @param {Node} node
 * @param {{ watch: (fn: (v: T) => void) => () => void }} sig
 * @param {(v: T) => string} [fmt]
 */
export function bindText(node, sig, fmt = v => String(v)) {
  return sig.watch(v => { const t = fmt(v); if (node.textContent !== t) node.textContent = t; });
}

/**
 * Привязать атрибут к сигналу; null/false — убрать атрибут.
 * @template T
 * @param {Element} node @param {string} attr
 * @param {{ watch: (fn: (v: T) => void) => () => void }} sig
 * @param {(v: T) => string | boolean | null} fmt
 */
export function bindAttr(node, attr, sig, fmt) {
  return sig.watch(v => {
    const a = fmt(v);
    if (a == null || a === false) node.removeAttribute(attr);
    else if (node.getAttribute(attr) !== String(a === true ? '' : a)) node.setAttribute(attr, a === true ? '' : String(a));
  });
}

/** Объявить что-то экранному диктору (и показать короткое сообщение) */
export function announce(text) {
  const live = document.getElementById('live');
  if (live) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); }
}
