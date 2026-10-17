// Service Worker: speichert die App-Dateien, damit sie auch ohne Internet startet.
// Online wird immer zuerst die neueste Version geladen.
const CACHE = 'vokabeltrainer-v1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'js/main.js',
  'js/ai.js',
  'js/answer.js',
  'js/ocr.js',
  'js/parser.js',
  'js/session.js',
  'js/srs.js',
  'js/stats.js',
  'js/store.js',
  'js/subjects.js',
  'js/ui.js',
  'js/views/home.js',
  'js/views/import.js',
  'js/views/lists.js',
  'js/views/practice.js',
  'js/views/sentences.js',
  'js/views/settings.js',
  'js/views/stats.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
