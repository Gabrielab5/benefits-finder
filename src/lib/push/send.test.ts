import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a), setVapidDetails: (...a: unknown[]) => setVapidDetails(...a) } }));

import { pushConfigured, sendToDevices, type PushSub } from './send';

const sub = (id: string): PushSub => ({ id, user_id: 'u', endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: 'k', auth: 's' });
const payload = { title: 't', body: 'b', url: '/', tag: 'x' };

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe('pushConfigured', () => {
  it('returns false instead of throwing when a VAPID value is malformed', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'pub\n');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    setVapidDetails.mockImplementation(() => { throw new Error('Vapid public key must be a URL safe Base 64'); });
    expect(pushConfigured()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('sendToDevices', () => {
  it('deletes a gone device, still delivers to the others, and never waits forever', async () => {
    sendNotification.mockImplementation((s: { endpoint: string }) =>
      s.endpoint.endsWith('/dead') ? Promise.reject({ statusCode: 410 }) : Promise.resolve());
    const deleted: string[] = [];
    const sb = { from: () => ({ delete: () => ({ eq: (_c: string, id: string) => { deleted.push(id); return Promise.resolve({}); } }) }) };
    expect(await sendToDevices(sb as never, [sub('dead'), sub('live')], payload)).toBe(1);
    expect(deleted).toEqual(['dead']);
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ timeout: expect.any(Number) });
  });
  it('also drops subscriptions the push service rejects as unauthorized (keys were changed)', async () => {
    sendNotification.mockImplementation((s: { endpoint: string }) =>
      Promise.reject({ statusCode: s.endpoint.endsWith('/a') ? 401 : 403 }));
    const deleted: string[] = [];
    const sb = { from: () => ({ delete: () => ({ eq: (_c: string, id: string) => { deleted.push(id); return Promise.resolve({}); } }) }) };
    expect(await sendToDevices(sb as never, [sub('a'), sub('b')], payload)).toBe(0);
    expect(deleted).toEqual(['a', 'b']);
  });
});
