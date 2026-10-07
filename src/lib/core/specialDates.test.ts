import { describe, expect, it } from 'vitest';
import { activeDateBenefits, dateWindows } from './specialDates';
import type { Benefit, Snapshot, WalletItem } from './types';

const day = (m: number) => ({ iso: `2026-${String(m).padStart(2, '0')}-15`, year: 2026, month: m });
const item = (id: string, type: WalletItem['type'], program_ids: string[], birthday_month: number | null = null): WalletItem =>
  ({ id, name: id, type, last4: null, nickname: null, color: null, program_ids, created_at: '', birthday_month });
const benefit = (id: string, program_id: string, timing: Benefit['timing'], requires: Benefit['requires'] = 'pay_with_card'): Benefit => ({
  id, program_id, store_id: null, category: null, title: id, description: null, type: 'percent_off', value: 10, min_spend: null,
  max_discount: null, requires, coupon_code: null, channel: 'both', timing, valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '2026-10-01T00:00:00Z', status: 'active', created_at: '2026-10-01T00:00:00Z',
});
const profile = {
  user_id: 'u', birth_month: 9, email_reminders: true, last_reminder_year: null,
  anniversary_month: 6, children: [{ name: 'נועה', birth_month: 3 }],
};
const wallet = [item('cal', 'card', ['cal']), item('dream', 'membership', ['dream'], 3)];
const snapshot: Snapshot = {
  profile, programs: [], stores: [], wallet, fetchedAt: '',
  benefits: [
    benefit('calBday', 'cal', 'birthday_month'), benefit('dreamBday', 'dream', 'birthday_month', 'membership'),
    benefit('calKid', 'cal', 'child_birthday_month'), benefit('calAnniv', 'cal', 'anniversary_month'),
    benefit('calAlways', 'cal', 'always'),
  ],
};
const summary = (m: number) => activeDateBenefits(snapshot, day(m)).map((w) => [w.window.key, w.benefits.map((b) => b.id)]);

describe('dateWindows', () => {
  it('lists your birthday, club-specific birthdays, anniversary and each child', () => {
    expect(dateWindows(profile, wallet).map((w) => [w.key, w.month])).toEqual([
      ['birthday', 9], ['birthday:dream', 3], ['anniversary', 6], ['child:נועה', 3],
    ]);
  });
  it('skips a club birthday that equals your real birthday', () => {
    expect(dateWindows(profile, [item('x', 'card', [], 9)]).map((w) => w.key)).toEqual(['birthday', 'anniversary', 'child:נועה']);
  });
});

describe('activeDateBenefits', () => {
  it('in March opens the club-specific birthday and the child birthday', () => {
    expect(summary(3)).toEqual([['birthday:dream', ['dreamBday']], ['child:נועה', ['calKid']]]);
  });
  it('in your birth month opens only clubs without their own birthday month', () => {
    expect(summary(9)).toEqual([['birthday', ['calBday']]]);
  });
  it('in the anniversary month opens anniversary benefits', () => {
    expect(summary(6)).toEqual([['anniversary', ['calAnniv']]]);
  });
  it('opens nothing in other months', () => {
    expect(summary(11)).toEqual([]);
  });
});
