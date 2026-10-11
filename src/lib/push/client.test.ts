import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushSupport, subscribeDevice, syncDevice, testResultMessage } from './client';

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

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

describe('pushSupport', () => {
  it('reports a build without the public push key as not configured, instead of offering a button that fails', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    vi.stubGlobal('navigator', { userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5, serviceWorker: {} });
    vi.stubGlobal('window', { PushManager: {}, Notification: {} });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('Notification', { permission: 'default' });
    expect(pushSupport()).toBe('not_configured');
  });
});

describe('subscribeDevice without a working service worker', () => {
  it('registers the worker if it is missing, and fails clearly if that fails (permission is still asked at the tap, as Safari requires)', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BBBB');
    const requestPermission = vi.fn(() => Promise.resolve('granted'));
    const register = vi.fn(() => Promise.reject(new Error('blocked')));
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: () => Promise.resolve(undefined), register } });
    vi.stubGlobal('Notification', { requestPermission });
    await expect(subscribeDevice(fakeSb([]).sb, { user_id: 'u', birth_month: 1, email_reminders: false, last_reminder_year: null }))
      .rejects.toThrow('sw_unavailable');
    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
  it('gives up after 10 seconds instead of spinning forever', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BBBB');
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: () => new Promise(() => {}) } });
    vi.stubGlobal('Notification', { requestPermission: vi.fn() });
    const result = subscribeDevice(fakeSb([]).sb, { user_id: 'u', birth_month: 1, email_reminders: false, last_reminder_year: null });
    const check = expect(result).rejects.toThrow('sw_unavailable');
    await vi.advanceTimersByTimeAsync(10_000);
    await check;
  });
});

describe('testResultMessage', () => {
  it('tells apart: server not set up, sent, and not delivered', () => {
    const off = testResultMessage(503, 0);
    expect(off.tone).toBe('error');
    expect(off.text).toContain('שרת');
    const sent = testResultMessage(200, 1);
    expect(sent.tone).toBe('success');
    expect(sent.text).toContain('הגדרות'); // points to the phone's own notification settings if nothing shows up
    expect(testResultMessage(200, 0).tone).toBe('error');
    expect(testResultMessage(500, 0).tone).toBe('error');
  });
});
