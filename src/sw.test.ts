import fs from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: unknown) => void;

/** Runs public/sw.js in a sandbox with fake caches/fetch and returns its event listeners. */
function loadSw(fetchImpl: () => Promise<Response>, cached: Record<string, string>) {
  const listeners: Record<string, Listener> = {};
  const context = {
    self: {
      addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; },
      location: { origin: 'https://app.test' },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      match: async (req: string | { url: string }) => {
        const path = typeof req === 'string' ? req : new URL(req.url).pathname;
        return path in cached ? new Response(cached[path]) : undefined;
      },
      open: async () => ({ put: async () => {} }),
    },
    fetch: fetchImpl,
    URL,
    Response,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), context);
  return listeners;
}

function navigate(listeners: Record<string, Listener>): Promise<Response> {
  let responded: Promise<Response> | undefined;
  listeners.fetch({
    request: { method: 'GET', url: 'https://app.test/', mode: 'navigate' },
    respondWith: (p: Promise<Response>) => { responded = p; },
  });
  return responded!;
}

describe('service worker page loads', () => {
  afterEach(() => vi.useRealTimers());

  it('serves the cached page after 3 seconds when the network hangs (weak reception)', async () => {
    vi.useFakeTimers();
    const listeners = loadSw(() => new Promise<Response>(() => {}), { '/': 'cached page' });
    let body: string | undefined;
    navigate(listeners).then(async (r) => { body = await r.text(); });
    await vi.advanceTimersByTimeAsync(3000);
    expect(body).toBe('cached page');
  });

  it('uses the network when it answers quickly', async () => {
    const listeners = loadSw(async () => new Response('fresh page'), { '/': 'cached page' });
    expect(await (await navigate(listeners)).text()).toBe('fresh page');
  });

  it('falls back to the cache when the network fails', async () => {
    const listeners = loadSw(async () => { throw new TypeError('offline'); }, { '/': 'cached page' });
    expect(await (await navigate(listeners)).text()).toBe('cached page');
  });
});
