import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { patch: unknown; old: string }[] = [];
let result: { data: { id: string }[] | null; error: unknown };
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({ update: (patch: unknown) => ({ eq: (_c: string, old: string) => ({ select: () => { calls.push({ patch, old }); return Promise.resolve(result); } }) }) }),
  }),
}));

import { POST } from './route';

const post = (body: unknown) => POST(new Request('https://app/api/push/renew', { method: 'POST', body: JSON.stringify(body) }));
const valid = { oldEndpoint: 'https://fcm.googleapis.com/fcm/send/old', endpoint: 'https://fcm.googleapis.com/fcm/send/new', p256dh: 'k', auth: 'a' };

beforeEach(() => {
  calls.length = 0;
  result = { data: [{ id: 's' }], error: null };
});

describe('POST /api/push/renew', () => {
  it('moves the row from the old endpoint to the renewed one', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ patch: { endpoint: valid.endpoint, p256dh: 'k', auth: 'a' }, old: valid.oldEndpoint }]);
  });
  it('rejects incomplete input without touching the database', async () => {
    expect((await post({ ...valid, auth: '' })).status).toBe(400);
    expect((await POST(new Request('https://app/api/push/renew', { method: 'POST', body: 'not json' }))).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it('404 when the old endpoint is unknown, 400 when the database refuses the new one', async () => {
    result = { data: [], error: null };
    expect((await post(valid)).status).toBe(404);
    result = { data: null, error: { message: 'violates check constraint' } };
    expect((await post(valid)).status).toBe(400);
  });
});
