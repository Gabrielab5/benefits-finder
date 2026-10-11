import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/** Loads public/sw.js with a fake `self` and returns its notificationclick handler. */
function clickHandler(clients: unknown) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = { addEventListener: (t: string, h: (e: unknown) => void) => { handlers[t] = h; }, location: { origin: 'https://app' }, clients };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL, Promise, setTimeout, caches: {}, fetch: () => {} });
  return async () => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.notificationclick({ notification: { close() {}, data: { url: '/benefits?recent=1' } }, waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
}

describe('notification click', () => {
  it('focuses the open app first (while the click still allows it), then navigates it', async () => {
    const order: string[] = [];
    const win = { url: 'https://app/', focus: vi.fn(() => { order.push('focus'); return Promise.resolve(win); }),
      navigate: vi.fn(() => { order.push('navigate'); return Promise.resolve(win); }) };
    const openWindow = vi.fn();
    await clickHandler({ matchAll: () => Promise.resolve([win]), openWindow })();
    expect(order).toEqual(['focus', 'navigate']);
    expect(openWindow).not.toHaveBeenCalled();
  });
  it('opens a window when the open one cannot be navigated (not controlled by the worker)', async () => {
    const win = { url: 'https://app/', focus: () => Promise.resolve(win), navigate: () => { throw new TypeError('not controlled'); } };
    const openWindow = vi.fn(() => Promise.resolve());
    await clickHandler({ matchAll: () => Promise.resolve([win]), openWindow })();
    expect(openWindow).toHaveBeenCalledWith('https://app/benefits?recent=1');
  });
});

/** Loads public/sw.js and returns all its handlers plus the fakes they talk to. */
function worker() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const fetches: { url: string; body: unknown }[] = [];
  const self = {
    addEventListener: (t: string, h: (e: unknown) => void) => { handlers[t] = h; }, location: { origin: 'https://app' }, clients: {},
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); return Promise.resolve(); },
      pushManager: { subscribe: () => Promise.resolve({ endpoint: 'https://fcm.googleapis.com/fcm/send/renewed', toJSON: () => ({ keys: { p256dh: 'k2', auth: 'a2' } }) }) },
    },
  };
  const fetch = (url: string, init: { body: string }) => { fetches.push({ url, body: JSON.parse(init.body) }); return Promise.resolve({ ok: true }); };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL, Promise, setTimeout, caches: {}, fetch, JSON });
  const fire = async (type: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
  return { fire, shown, fetches };
}
const data = (raw: string) => ({ json: () => JSON.parse(raw), text: () => raw });

describe('push event', () => {
  it('shows a plain-text push (e.g. from DevTools) instead of failing', async () => {
    const w = worker();
    await w.fire('push', { data: data('hello') });
    expect(w.shown[0]).toMatchObject({ title: 'ההטבות שלי', options: { body: 'hello' } });
  });
  it('re-alerts (sound) when a newer alert replaces an older one, but the test alert stays quiet; uses the monochrome badge', async () => {
    const w = worker();
    await w.fire('push', { data: data(JSON.stringify({ title: 't', body: 'b', url: '/', tag: 'new' })) });
    await w.fire('push', { data: data(JSON.stringify({ title: 't', body: 'b', url: '/', tag: 'test' })) });
    expect(w.shown.map((n) => n.options.renotify)).toEqual([true, false]);
    expect(w.shown[0].options.badge).toBe('/badge');
  });
});

describe('pushsubscriptionchange', () => {
  it("saves the browser's renewed subscription in place of the old one", async () => {
    const w = worker();
    await w.fire('pushsubscriptionchange', { oldSubscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/old', options: {} } });
    expect(w.fetches).toEqual([{ url: '/api/push/renew', body: {
      oldEndpoint: 'https://fcm.googleapis.com/fcm/send/old', endpoint: 'https://fcm.googleapis.com/fcm/send/renewed', p256dh: 'k2', auth: 'a2',
    } }]);
  });
});
