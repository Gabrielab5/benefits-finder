import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { israelToday } from '@/lib/core/dates';
import type { Benefit, Profile, Snapshot } from '@/lib/core/types';

const updates: Record<string, unknown>[] = [];
let profiles: Profile[];
let subsResult: { data: unknown[] | null; error: unknown };
let updateError: unknown = null;
const month = israelToday().month;
const person = (id: string, o: Partial<Profile> = {}): Profile =>
  ({ user_id: id, birth_month: month, email_reminders: true, last_reminder_year: null, reminded: [], ...o });

/** Enough of the Supabase client for the cron: paged selects and updates. */
const fakeSb = {
  from: (table: string) => ({
    select: () => {
      const q = {
        order: () => q,
        range: (a: number, b: number) => {
          if (table === 'push_subscriptions') return Promise.resolve(subsResult.error ? subsResult : { data: (subsResult.data ?? []).slice(a, b + 1), error: null });
          return Promise.resolve({ data: profiles.slice(a, b + 1), error: null });
        },
      };
      return q;
    },
    update: (patch: Record<string, unknown>) => ({ eq: () => { updates.push(patch); return Promise.resolve({ error: updateError }); } }),
  }),
  auth: { admin: { getUserById: (id: string) => Promise.resolve({ data: { user: { email: `e2e-${id}@example.com` } } }) } },
};
const benefit = (o: Partial<Benefit>): Benefit => ({ id: 'b', program_id: 'p', store_id: null, category: null, title: 'מתנה', description: null,
  type: 'gift', value: null, min_spend: null, max_discount: null, requires: 'membership', coupon_code: null, channel: 'both',
  timing: 'birthday_month', valid_from: null, valid_until: null, conditions: null, source_url: null, last_verified_at: '',
  status: 'active', created_at: '2026-01-01T00:00:00Z', user_id: null, ...o });
let benefits: Benefit[];
const fetchUserSnapshot = vi.fn((_sb: unknown, profile: Profile): Promise<Snapshot> => Promise.resolve({
  profile, programs: [], stores: [], benefits, fetchedAt: '',
  wallet: [{ id: 'w', name: 'רי-בר', type: 'membership', last4: null, nickname: null, color: null, program_ids: ['p'], created_at: '', birthday_month: null }],
}));
const sendToDevices = vi.fn();
const emailSend = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => fakeSb }));
vi.mock('@/lib/userSnapshot', () => ({
  fetchSharedCatalog: () => Promise.resolve({ programs: [], stores: [], benefits: [] }),
  fetchUserSnapshot: (...a: [unknown, Profile]) => fetchUserSnapshot(...a),
}));
vi.mock('resend', () => ({ Resend: class { emails = { send: () => emailSend() }; } }));
vi.mock('@/lib/push/send', () => ({ pushConfigured: () => true, sendToDevices: (...a: unknown[]) => sendToDevices(...a) }));

import { GET } from './route';

const call = async () => (await GET(new Request('https://x/api/cron/birthday', { headers: { authorization: 'Bearer secret' } }))).json();
const device = (uid: string) => ({ id: `s-${uid}`, user_id: uid, endpoint: `https://fcm.googleapis.com/fcm/send/${uid}`, p256dh: 'k', auth: 'a' });

beforeEach(() => {
  updates.length = 0;
  updateError = null;
  profiles = [person('u')];
  subsResult = { data: [], error: null };
  benefits = [benefit({})];
  sendToDevices.mockReset();
  sendToDevices.mockResolvedValue(1);
  fetchUserSnapshot.mockClear();
  emailSend.mockClear();
  vi.stubEnv('CRON_SECRET', 'secret');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('APP_URL', 'https://app');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('daily reminders cron', () => {
  it('a broken push table does not stop the e-mail reminders', async () => {
    subsResult = { data: null, error: { message: 'relation push_subscriptions does not exist' } };
    expect(await call()).toMatchObject({ emailed: 1 });
  });

  it('records the e-mail before sending push, so a stuck push never re-sends the e-mail', async () => {
    subsResult = { data: [device('u')], error: null };
    let emailRecordedFirst = false;
    sendToDevices.mockImplementation(() => {
      emailRecordedFirst = updates.some((u) => JSON.stringify(u.reminded) === JSON.stringify([`birthday:${israelToday().year}`]));
      return Promise.resolve(1);
    });
    await call();
    expect(sendToDevices).toHaveBeenCalled();
    expect(emailRecordedFirst).toBe(true);
  });

  it('reads every user, past the 1000-row page limit', async () => {
    profiles = Array.from({ length: 1001 }, (_, i) => person(`u${i}`));
    expect(await call()).toMatchObject({ emailed: 1001 });
  });

  it('several alerts on one morning arrive as a single summary', async () => {
    profiles = [person('u', { email_reminders: false, push_new_since: '2026-01-01T00:00:00Z' })];
    subsResult = { data: [device('u')], error: null };
    benefits = [benefit({}), benefit({ id: 'n', timing: 'always', created_at: new Date(Date.now() - 60_000).toISOString() })];
    await call();
    expect(sendToDevices).toHaveBeenCalledTimes(1);
    expect(sendToDevices.mock.calls[0][2]).toMatchObject({ kind: 'summary', parts: ['dates', 'new'] });
    expect(updates.at(-1)).toMatchObject({ push_new_since: expect.any(String) }); // "new" counts as delivered inside the summary
  });

  it('logs and counts a failed bookkeeping save instead of ignoring it', async () => {
    updateError = { message: 'boom' };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await call()).toMatchObject({ saveErrors: 2 }); // right after the e-mail, then retried once at the end
    expect(log).toHaveBeenCalledWith('reminder bookkeeping not saved', 'u', 'boom');
  });

  it('stops starting new users when the time budget runs out; they are picked up tomorrow', async () => {
    profiles = Array.from({ length: 7 }, (_, i) => person(`u${i}`));
    vi.useFakeTimers({ toFake: ['Date'] });
    fetchUserSnapshot.mockImplementation((_sb, profile) => {
      if (fetchUserSnapshot.mock.calls.length === 5) vi.setSystemTime(Date.now() + 60_000); // the 5th parallel start
      return Promise.resolve({ profile, programs: [], stores: [], benefits, wallet: [], fetchedAt: '' });
    });
    const result = await call();
    expect(result.skipped).toBe(2); // 5 were already running in parallel
    expect(fetchUserSnapshot).toHaveBeenCalledTimes(5);
  });
});
