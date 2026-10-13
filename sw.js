// Service worker: makes the game work offline once it has been opened online.
// Game files are network-first (always fresh when online, cached copy when offline), so a
// deploy needs no version bump. Google Fonts are cache-first since they never change.
// Keep SHELL in sync with the files the page loads; tests/pwa.test.js checks it.

const CACHE = 'man-run';
const FONT_CACHE = 'man-run-fonts';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'js/ai.js',
  'js/animals.js',
  'js/config.js',
  'js/fx.js',
  'js/game.js',
  'js/main.js',
  'js/paint.js',
  'js/physics.js',
  'js/render.js',
  'js/scenery.js',
  'js/sound.js',
  'js/themes.js',
  'js/track.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // 'no-cache' revalidates with the server, so the browser's HTTP cache can't hand out an
    // old module next to new ones right after a deploy.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const page = await cache.match('index.html');
      if (page) return page;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
});
