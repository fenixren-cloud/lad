// sw.js — офлайн-режим. При установке сохраняет в кэш все файлы приложения, включая сэмплы;
// потом отдаёт их из кэша — приложение работает без интернета. Список файлов и версия — в sw-manifest.js
// (версия = хэш всех файлов: любое изменение даёт новую версию). Новая версия ждёт, пока пользователь
// нажмёт «Обновить» в плашке, — тогда страница перезагружается уже с ней.
/* global self, caches */
importScripts('sw-manifest.js' + self.location.search);

const { version, files } = self.LAD_PRECACHE;
const CACHE = `lad-${version}`;
const ROOT = new URL('./', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(files.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('lad-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return;
  if (/\/(sw|sw-manifest)\.js$/.test(url.pathname) || url.pathname.includes('/__')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // адреса с #хэшем и ?параметрами — это одна и та же страница
    const hit = await cache.match(req.mode === 'navigate' ? ROOT : req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') {
        const page = await cache.match(ROOT);
        if (page) return page;
      }
      throw err;
    }
  })());
});
