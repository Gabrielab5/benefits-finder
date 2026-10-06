const CACHE = 'bf-v1';
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    // Content-hashed files never change: cache first.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  if (req.mode === 'navigate') {
    // Pages: network first, but with weak reception (request hangs) show the cached copy after 3 s.
    const network = fetch(req).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
    network.catch(() => {}); // a late failure after we already answered from the cache is fine
    const cached = () => caches.match(req).then((hit) => hit || caches.match('/'));
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    event.respondWith(
      Promise.race([network, timeout])
        .then((res) => res || cached().then((hit) => hit || network))
        .catch(() => cached().then((hit) => hit || Response.error())),
    );
  }
});
