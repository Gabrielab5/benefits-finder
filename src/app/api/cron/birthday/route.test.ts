import { beforeEach, describe, expect, it, vi } from 'vitest';
import { israelToday } from '@/lib/core/dates';
import type { Benefit, Snapshot } from '@/lib/core/types';

const updates: Record<string, unknown>[] = [];
let subsResult: { data: unknown; error: unknown };
const month = israelToday().month;
const profile = { user_id: 'u', birth_month: month, email_reminders: true, last_reminder_year: null, reminded: [] };
const fakeSb = {
  from: (table: string) => ({
    select: () => Promise.resolve(table === 'profile' ? { data: [profile], error: null } : subsResult),
    update: (patch: Record<string, unknown>) => ({ eq: () => { updates.push(patch); return Promise.resolve({ error: null }); } }),
  }),
  auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { email: 'e2e@example.com' } } }) } },
};
const benefit = { id: 'b', program_id: 'p', store_id: null, category: null, title: 'מתנה', description: null, type: 'gift',
  value: null, min_spend: null, max_discount: null, requires: 'membership', coupon_code: null, channel: 'both',
  timing: 'birthday_month', valid_from: null, valid_until: null, conditions: null, source_url: null, last_verified_at: '',
  status: 'active', created_at: '2026-01-01T00:00:00Z', user_id: null } as Benefit;
const snapshot: Snapshot = {
  profile, programs: [{ id: 'p', name: 'רי-בר', kind: 'club', benefits_url: null } as never], stores: [], benefits: [benefit], fetchedAt: '',
  wallet: [{ id: 'w', name: 'רי-בר', type: 'membership', last4: null, nickname: null, color: null, program_ids: ['p'], created_at: '', birthday_month: null }],
};
const sendToDevices = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => fakeSb }));
vi.mock('@/lib/userSnapshot', () => ({ fetchUserSnapshot: () => Promise.resolve(snapshot) }));
vi.mock('resend', () => ({ Resend: class { emails = { send: () => Promise.resolve({ error: null }) }; } }));
vi.mock('@/lib/push/send', () => ({ pushConfigured: () => true, sendToDevices: (...a: unknown[]) => sendToDevices(...a) }));

import { GET } from './route';

const call = () => GET(new Request('https://x/api/cron/birthday', { headers: { authorization: 'Bearer secret' } }));

beforeEach(() => {
  updates.length = 0;
  sendToDevices.mockReset();
  vi.stubEnv('CRON_SECRET', 'secret');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('APP_URL', 'https://app');
});

describe('daily reminders cron', () => {
  it('a broken push table does not stop the e-mail reminders', async () => {
    subsResult = { data: null, error: { message: 'relation push_subscriptions does not exist' } };
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ emailed: 1 });
  });

  it('records the e-mail before sending push, so a stuck push never re-sends the e-mail', async () => {
    subsResult = { data: [{ id: 's', user_id: 'u', endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'k', auth: 'a' }], error: null };
    let emailRecordedFirst = false;
    sendToDevices.mockImplementation(() => {
      emailRecordedFirst = updates.some((u) => JSON.stringify(u.reminded) === JSON.stringify([`birthday:${israelToday().year}`]));
      return Promise.resolve(1);
    });
    await call();
    expect(sendToDevices).toHaveBeenCalled();
    expect(emailRecordedFirst).toBe(true);
  });
});
