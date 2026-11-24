// main.js — точка входа: тема, каркас, маршруты, офлайн-режим. Экраны и отладка грузятся лениво.
import { APP_VERSION } from './app/version.js';
import { applyTheme } from './app/theme.js';
import { mountShell } from './app/shell.js';
import { startRouter } from './app/router.js';
import { startPwa } from './app/pwa.js';
import { startActivity, enterScreen } from './app/activity.js';

document.documentElement.dataset.version = APP_VERSION;
applyTheme();

const root = document.getElementById('app');
if (root) {
  const { banner } = mountShell(root);
  startActivity();
  document.addEventListener('lad:screen', e => enterScreen(String(/** @type {CustomEvent} */ (e).detail).replace(/^\//, '')));
  startRouter();
  startPwa(banner);
}

if (new URLSearchParams(location.search).has('debug')) {
  import('./app/debug.js').then(m => m.installDebug()).catch(err => console.error(err));
}
