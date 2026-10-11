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

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data.text() }; // plain text (e.g. DevTools "Push"): still show something
  }
  const tag = data.tag || 'message';
  event.waitUntil(self.registration.showNotification(data.title || 'ההטבות שלי', {
    body: data.body, icon: '/icon', badge: '/badge', tag, dir: 'rtl', lang: 'he', data: { url: data.url || '/' },
    renotify: tag !== 'test', // a newer alert replacing an older one still makes a sound; the test alert doesn't
  }));
});

// The browser replaced the subscription (Chrome does this now and then): store the new one in place of the old.
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription;
  if (!old) return; // nothing to match it to; the app re-checks on next open
  event.waitUntil(
    (event.newSubscription ? Promise.resolve(event.newSubscription) : self.registration.pushManager.subscribe(old.options))
      .then((sub) => {
        const keys = sub.toJSON().keys;
        return fetch('/api/push/renew', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldEndpoint: old.endpoint, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth }),
        });
      })
      .catch(() => {}),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (!win) return self.clients.openWindow(url);
    // Focus first, while the click still allows it; a window the worker doesn't control can't be navigated.
    return win.focus().then((c) => (c || win).navigate(url)).catch(() => self.clients.openWindow(url));
  }));
});
