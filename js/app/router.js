// router.js — переходы по #хэшу: текущий маршрут — сигнал, экран слушает его.
import { signal } from '../core/signal.js';
import { parseRoute } from '../core/routes.js';

export const route = signal(parseRoute(location.hash));

export function startRouter() {
  const sync = () => {
    const r = parseRoute(location.hash);
    // неизвестный адрес — тихо заменяем на «Сегодня», без лишней записи в историю
    if (r.redirected) history.replaceState(null, '', '#/today');
    route.value = r;
  };
  addEventListener('hashchange', sync);
  sync();
}

/** Перейти по адресу вида '#/play/tuner' */
export function go(href) {
  if (location.hash === href) return;
  location.hash = href;
}
