import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeDevice, syncDevice } from './client';

function fakeSb(rows: { endpoint: string }[]) {
  const profileUpdates: Record<string, unknown>[] = [];
  const sb = {
    from: (table: string) => ({
      select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: () => Promise.resolve({ data: rows.find((r) => r.endpoint === v) ?? null, error: null }) }) }),
      insert: () => Promise.resolve({ error: null }),
      update: (patch: Record<string, unknown>) => ({ eq: () => { if (table === 'profile') profileUpdates.push(patch); return Promise.resolve({ error: null }); } }),
    }),
  };
  return { sb: sb as never, profileUpdates };
}

function browserWith(sub: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
  const pushManager = {
    getSubscription: () => Promise.resolve(sub),
    subscribe: () => Promise.resolve({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', unsubscribe: vi.fn(), toJSON: () => ({ keys: { p256dh: 'k', auth: 'a' } }) }),
  };
  const reg = { pushManager };
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: () => Promise.resolve(reg), ready: Promise.resolve(reg) } });
  vi.stubGlobal('Notification', { requestPermission: () => Promise.resolve('granted') });
}

afterEach(() => vi.unstubAllGlobals());

describe('syncDevice', () => {
  it('drops a browser subscription that is not this user\'s (shared device, or row removed after 410)', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve(true));
    browserWith({ endpoint: 'https://fcm.googleapis.com/fcm/send/other-user', unsubscribe });
    expect(await syncDevice(fakeSb([]).sb)).toBe('off');
    expect(unsubscribe).toHaveBeenCalled();
  });
  it('keeps this user\'s own subscription', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve(true));
    browserWith({ endpoint: 'https://fcm.googleapis.com/fcm/send/mine', unsubscribe });
    expect(await syncDevice(fakeSb([{ endpoint: 'https://fcm.googleapis.com/fcm/send/mine' }]).sb)).toBe('on');
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});

describe('subscribeDevice', () => {
  it('restarts the "new benefits" count on enable, so an old watermark cannot announce a backlog', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BBBB');
    browserWith(null);
    const { sb, profileUpdates } = fakeSb([]);
    await subscribeDevice(sb, { user_id: 'u', birth_month: 1, email_reminders: false, last_reminder_year: null, push_new_since: '2026-01-01T00:00:00Z' });
    expect(profileUpdates).toEqual([{ push_new_since: expect.any(String) }]);
    vi.unstubAllEnvs();
  });
});
