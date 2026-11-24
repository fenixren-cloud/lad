// state.js — общее состояние приложения: настройки (с сохранением) и «что сейчас играет» для мини-плеера.
import { signal } from '../core/signal.js';
import { normalizeSettings } from '../core/settings.js';
import { store } from './store.js';

/** Глобальные настройки — один сигнал на всё приложение */
export const settings = signal(normalizeSettings(store().get('settings')));

/** Поменять одну настройку и сохранить */
export function setSetting(key, value) {
  const next = normalizeSettings({ ...settings.value, [key]: value });
  if (next[key] === settings.value[key]) return;
  settings.value = next;
  store().set('settings', next);
}

/** Сигнал одной настройки — для переключателей (меняется только когда меняется она) */
export function settingSignal(key) {
  const s = signal(settings.value[key]);
  settings.watch(v => { s.value = v[key]; });
  return s;
}

/** @typedef {{ title: string, detail: string, href: string, stop: () => void }} Playing */
/** Что сейчас играет: метроном, подложка, рифф… Мини-плеер показывает это над панелью. */
export const nowPlaying = signal(/** @type {Playing | null} */ (null));
