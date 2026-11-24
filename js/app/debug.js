// debug.js — объект для автотестов и отладки: открывается только с ?debug в адресе.
import { getAudio, unlockAudio } from '../audio/engine.js';
import { getInstruments } from '../audio/instruments.js';
import { createClock } from '../audio/clock.js';
import { store } from './store.js';
import { settings, setSetting, nowPlaying } from './state.js';
import { route, go } from './router.js';
import { hooks } from './debughooks.js';

export function installDebug() {
  /** @type {any} */ (globalThis).__lad = {
    audio: getAudio,
    unlockAudio,
    instruments: getInstruments,
    createClock,
    store,
    settings,
    setSetting,
    nowPlaying,
    route,
    go,
    // «Слух»: текущее задание квиза и «услышанная» нота (как будто сыграна на гитаре)
    earTask: () => hooks.earTask?.(),
    earHear: midi => hooks.earHear?.(midi),
  };
}
