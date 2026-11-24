// media.js — Media Session: что играет и кнопки паузы/стопа в шторке Android и на клавиатуре ноутбука.
// Для звука Web Audio шторка показывается не на всех телефонах — это проверяется руками.

/** @param {{ title: string, detail: string, onPlay?: () => void, onStop: () => void } | null} info */
export function setMediaSession(info) {
  const ms = /** @type {any} */ (navigator).mediaSession;
  if (!ms) return;
  try {
    if (!info) {
      ms.metadata = null;
      ms.playbackState = 'none';
      for (const a of ['play', 'pause', 'stop']) ms.setActionHandler(a, null);
      return;
    }
    const MM = /** @type {any} */ (globalThis).MediaMetadata;
    if (MM) ms.metadata = new MM({ title: info.title, artist: 'Лад', album: info.detail });
    ms.playbackState = 'playing';
    ms.setActionHandler('pause', info.onStop);
    ms.setActionHandler('stop', info.onStop);
    ms.setActionHandler('play', info.onPlay || null);
  } catch { /* не все действия поддерживаются — не страшно */ }
}
