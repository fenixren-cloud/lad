// theme.js — тема на экране: тёмная, светлая или «как в системе».
import { resolveTheme } from '../core/settings.js';
import { settings } from './state.js';

export function applyTheme() {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const set = () => {
    const theme = resolveTheme(settings.value.theme, mq ? mq.matches : true);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1012' : '#f4f3ef');
  };
  mq?.addEventListener?.('change', set);
  settings.watch(set);
}
