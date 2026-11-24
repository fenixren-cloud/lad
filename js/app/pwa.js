// pwa.js — установка и офлайн: service worker, плашка «Доступна новая версия → Обновить»,
// просьба браузеру не стирать данные. В офлайн-файле (file://) ничего этого нет и не нужно.
import { h } from '../ui/dom.js';

/**
 * Показывать ли плашку обновления. Новая версия — только если у страницы уже был хозяин (контроллер):
 * при самой первой установке service worker тоже «ждёт», но это не обновление (в «Гитарном круге»
 * здесь была ложная плашка).
 */
export const shouldOfferUpdate = ({ hadController, waiting }) => !!(hadController && waiting);

/** @param {HTMLElement} banner */
export async function startPwa(banner) {
  if (location.protocol === 'file:' || !('serviceWorker' in navigator)) return;
  try { await navigator.storage?.persist?.(); } catch { /* браузер решает сам */ }

  const hadController = !!navigator.serviceWorker.controller;
  const key = new URLSearchParams(location.search).get('swkey'); // только для автотестов: отдельная «версия»
  let reg;
  try {
    reg = await navigator.serviceWorker.register(key ? `sw.js?key=${encodeURIComponent(key)}` : 'sw.js', { updateViaCache: 'none' });
  } catch (err) {
    console.warn('Офлайн-режим недоступен:', err);
    return;
  }
  if (!reg) return;
  const offer = worker => {
    if (!shouldOfferUpdate({ hadController, waiting: worker })) return;
    banner.replaceChildren(
      h('span', null, 'Доступна новая версия'),
      h('button', { type: 'button', class: 'btn btn-plain', onclick: () => worker.postMessage('skip-waiting') }, 'Обновить'));
    banner.hidden = false;
  };
  if (reg.waiting) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // первая установка — не перезагружаем
    reloading = true;
    location.reload();
  });
  // проверять обновления, когда приложение снова на экране
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
}
