import { describe, expect, it } from 'vitest';
import { browseBenefits, EMPTY_FILTERS } from './browse';
import type { Benefit, Snapshot } from './types';

const today = { iso: '2026-10-06', year: 2026, month: 10 };
const now = new Date('2026-10-06T12:00:00Z');
let n = 0;
const benefit = (o: Partial<Benefit>): Benefit => ({
  id: `b${++n}`, program_id: 'cal', store_id: 'mango', category: null, title: 'הנחה', description: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'pay_with_card',
  coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '2026-10-01T00:00:00Z', status: 'active', created_at: '2026-01-01T00:00:00Z',
  ...o,
});

const snapshot: Snapshot = {
  profile: { user_id: 'u', birth_month: 3, email_reminders: true, last_reminder_year: null },
  programs: [
    { id: 'cal', name: 'כאל', kind: 'card_issuer', logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never' },
    { id: 'max', name: 'מקס', kind: 'card_issuer', logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never' },
  ],
  wallet: [{ id: 'w1', name: 'כאל', type: 'card', last4: null, nickname: null, color: null, program_ids: ['cal'], created_at: '' }],
  stores: [
    { id: 'mango', name_he: 'מנגו', name_en: 'Mango', aliases: [], category: 'fashion', channel: 'both' },
    { id: 'mcd', name_he: 'מקדונלדס', name_en: "McDonald's", aliases: [], category: 'restaurants', channel: 'both' },
  ],
  benefits: [
    benefit({ id: 'mango10' }),
    benefit({ id: 'mcdBogo', store_id: 'mcd', type: 'bogo', value: null, created_at: '2026-10-01T00:00:00Z' }),
    benefit({ id: 'maxOnly', program_id: 'max' }),
    benefit({ id: 'bday', timing: 'birthday_month' }),
    benefit({ id: 'expiring', valid_until: '2026-10-12' }),
    benefit({ id: 'expired', valid_until: '2026-10-01' }),
  ],
  fetchedAt: '',
};
const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
  browseBenefits(snapshot, { ...EMPTY_FILTERS, ...f }, today, now).map((r) => r.benefit.id);

describe('browseBenefits', () => {
  it('by default shows only what my wallet unlocks, never expired, newest first', () => {
    expect(ids({})).toEqual(['mcdBogo', 'mango10', 'bday', 'expiring']);
  });
  it('can show everything', () => {
    expect(ids({ onlyMine: false })).toContain('maxOnly');
  });
  it('searches store names in Hebrew and English', () => {
    expect(ids({ q: 'mcdonalds' })).toEqual(['mcdBogo']);
    expect(ids({ q: 'מקדונלד׳ס' })).toEqual(['mcdBogo']);
  });
  it('filters by category, type, birthday and expiring this week', () => {
    expect(ids({ category: 'restaurants' })).toEqual(['mcdBogo']);
    expect(ids({ type: 'bogo' })).toEqual(['mcdBogo']);
    expect(ids({ birthday: true })).toEqual(['bday']);
    expect(ids({ expiringThisWeek: true })).toEqual(['expiring']);
  });
  it('filters recently added (14 days)', () => {
    expect(ids({ recent: true })).toEqual(['mcdBogo']);
  });
  it('marks birthday benefits outside the birth month as locked', () => {
    const row = browseBenefits(snapshot, EMPTY_FILTERS, today, now).find((r) => r.benefit.id === 'bday');
    expect(row?.birthdayLocked).toBe(true);
  });
});
