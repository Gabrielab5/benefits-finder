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
