// assets.js — загрузка файлов (сэмплов). В офлайн-файле они вшиты в window.__LAD_ASSETS,
// на сайте — грузятся по сети (и кэшируются service worker'ом для офлайна).

/** @param {string} b64 */
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * @param {string} path путь от корня приложения, например 'samples/guitar/A2.mp3'
 * @returns {Promise<ArrayBuffer>}
 */
export async function loadBytes(path) {
  const embedded = /** @type {any} */ (globalThis).__LAD_ASSETS?.[path];
  if (embedded) return base64ToBuffer(embedded);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Не загрузился ${path}: ${res.status}`);
  return res.arrayBuffer();
}
