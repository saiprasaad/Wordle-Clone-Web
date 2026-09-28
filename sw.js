// Service worker: lets the game load offline and be installed as an app.
//
// Requests go to the network first so a new deploy shows up on the next visit,
// and every response refreshes the cache. When the network is down, or slower
// than NETWORK_TIMEOUT_MS, the cached copy is served instead.

const CACHE = 'wordle-clone-v2';
const NETWORK_TIMEOUT_MS = 3000;

// Everything the game needs to start. tests/unit/sw.test.js keeps this in sync
// with the files on disk.
const APP_SHELL = [
  './',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/definition.js',
  'js/game.js',
  'js/main.js',
  'js/puzzle.js',
  'js/share.js',
  'js/stats.js',
  'js/storage.js',
  'js/theme.js',
  'js/words.js',
  'js/ui/a11y.js',
  'js/ui/board.js',
  'js/ui/dialogs.js',
  'js/ui/keyboard.js',
  'js/ui/toast.js',
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Drop old caches, including those left by the earlier Flutter build.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  // Every page load is the same app, whatever the path or query string.
  const key = request.mode === 'navigate' ? './' : request;

  const fromNetwork = fetch(request).then((response) => {
    if (response.ok) event.waitUntil(cache.put(key, response.clone()));
    return response;
  });
  // Keep the worker alive to finish updating the cache after a timeout.
  event.waitUntil(fromNetwork.catch(() => {}));

  try {
    return await withTimeout(fromNetwork, NETWORK_TIMEOUT_MS);
  } catch {
    const cached = await cache.match(key, { ignoreSearch: true });
    return cached ?? fromNetwork;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Network timeout')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
