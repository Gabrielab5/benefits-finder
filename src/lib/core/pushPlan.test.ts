import { describe, expect, it } from 'vitest';
import { israelToday } from './dates';
import { bundle, israelWeekday, pruneReminded, pushMessages, type PushMessage } from './pushPlan';
import type { Benefit, GiftCard, Profile, Snapshot, WalletItem } from './types';

const SUNDAY = new Date('2026-10-11T06:00:00Z');
const MONDAY = new Date('2026-10-12T06:00:00Z');
const wallet: WalletItem[] = [{ id: 'w', name: 'כאל', type: 'card', last4: null, nickname: null, color: null, program_ids: ['cal'], created_at: '', birthday_month: null }];
const benefit = (id: string, o: Partial<Benefit> = {}): Benefit => ({
  id, program_id: 'cal', store_id: null, category: null, title: id, description: null, type: 'percent_off', value: 10,
  min_spend: null, max_discount: null, requires: 'pay_with_card', coupon_code: null, channel: 'both', timing: 'always',
  valid_from: null, valid_until: null, conditions: null, source_url: null, last_verified_at: '', status: 'active',
  created_at: '2026-09-01T00:00:00+00:00', user_id: null, ...o,
});
const profile = (o: Partial<Profile> = {}): Profile => ({
  user_id: 'u', birth_month: 3, email_reminders: false, last_reminder_year: null, reminded: [],
  push_new_since: '2026-10-05T00:00:00.000Z', ...o,
});
const snap = (p: Profile, benefits: Benefit[]): Snapshot => ({ profile: p, programs: [], stores: [], wallet, benefits, fetchedAt: '' });
const run = (p: Profile, benefits: Benefit[], now = SUNDAY) => pushMessages(snap(p, benefits), israelToday(now), now);
const kinds = (r: ReturnType<typeof run>) => r.messages.map((m) => m.kind);

describe('israelWeekday', () => {
  it('uses Israel time (Saturday 22:30 UTC is already Sunday in Israel)', () => {
    expect(israelWeekday(new Date('2026-10-10T22:30:00Z'))).toBe(0);
    expect(israelWeekday(MONDAY)).toBe(1);
  });
});

describe('dates alerts', () => {
  const bday = benefit('bday', { timing: 'birthday_month' });
  it('alerts once per window per year', () => {
    const r = run(profile({ birth_month: 10 }), [bday]);
    expect(r.messages[0]).toMatchObject({ kind: 'dates', url: '/benefits?birthday=1', remindKeys: ['push:birthday:2026'] });
    expect(kinds(run(profile({ birth_month: 10, reminded: ['push:birthday:2026'] }), [bday]))).toEqual([]);
  });
  it('is not blocked by the e-mail bookkeeping key', () => {
    expect(kinds(run(profile({ birth_month: 10, reminded: ['birthday:2026'] }), [bday]))).toEqual(['dates']);
  });
  it('respects the switch', () => {
    expect(kinds(run(profile({ birth_month: 10, push_dates: false }), [bday]))).toEqual([]);
  });
});

describe('expiring alerts', () => {
  const soon = benefit('soon', { valid_until: '2026-10-15' });
  it('lists my benefits ending within 7 days, on Sundays only', () => {
    const r = run(profile(), [soon, benefit('later', { valid_until: '2026-10-30' }), benefit('gone', { valid_until: '2026-10-10' }),
      benefit('notMine', { program_id: 'max', valid_until: '2026-10-14' })]);
    expect(r.messages).toEqual([expect.objectContaining({ kind: 'expiring', body: 'soon', url: '/benefits?expiring=1' })]);
    expect(kinds(run(profile(), [soon], MONDAY))).toEqual([]);
  });
  it('includes the last day of the week and respects the switch', () => {
    expect(kinds(run(profile(), [benefit('edge', { valid_until: '2026-10-18' })]))).toEqual(['expiring']);
    expect(kinds(run(profile({ push_expiring: false }), [soon]))).toEqual([]);
  });
});

describe('new benefit alerts', () => {
  const fresh = benefit('fresh', { created_at: '2026-10-08T10:00:00.123456+00:00' });
  it('counts shared benefits for my cards created after the watermark and moves it', () => {
    const r = run(profile(), [fresh, benefit('old'), benefit('private', { user_id: 'u', created_at: '2026-10-08T10:00:00+00:00' }),
      benefit('notMine', { program_id: 'max', created_at: '2026-10-08T10:00:00+00:00' })], MONDAY);
    expect(r.messages).toEqual([expect.objectContaining({ kind: 'new', title: '✨ הטבה חדשה לכרטיסים שלך', url: '/benefits?recent=1' })]);
    expect(r.newSince).toBe(MONDAY.toISOString());
  });
  it('without a watermark only sets one (no flood of the whole catalog)', () => {
    const r = run(profile({ push_new_since: null }), [fresh], MONDAY);
    expect(kinds(r)).toEqual([]);
    expect(r.newSince).toBe(MONDAY.toISOString());
  });
  it('while switched off keeps moving the watermark so turning it on later does not flood', () => {
    const r = run(profile({ push_new: false }), [fresh], MONDAY);
    expect(kinds(r)).toEqual([]);
    expect(r.newSince).toBe(MONDAY.toISOString());
  });
  it('leaves the watermark alone when nothing is new', () => {
    expect(run(profile(), [benefit('old')], MONDAY)).toEqual({ messages: [], newSince: null });
  });
});

describe('review follow-ups', () => {
  it('a benefit added while the run is going waits for tomorrow (never announced twice)', () => {
    const during = benefit('during', { created_at: '2026-10-12T06:00:05+00:00' });
    expect(run(profile(), [during], MONDAY)).toEqual({ messages: [], newSince: null });
  });
  it('sends the Sunday expiring alert at most once that day (cron re-run)', () => {
    const soon = benefit('soon', { valid_until: '2026-10-15' });
    expect(run(profile(), [soon]).messages[0].remindKeys).toEqual(['push:expiring:2026-10-11']);
    expect(kinds(run(profile({ reminded: ['push:expiring:2026-10-11'] }), [soon]))).toEqual([]);
  });
});

describe('gift card expiry alerts', () => {
  const gift = (id: string, expires_on: string | null, o: Partial<GiftCard> = {}): GiftCard => ({
    id, name: id, amount: 200, balance: 150, received_on: null, expires_on, code: null, link: null, any_store: true,
    store_ids: [], stores_url: null, notes: null, created_at: '', ...o,
  });
  const giftRun = (cards: GiftCard[], p = profile(), now = MONDAY) =>
    pushMessages({ ...snap(p, []), giftCards: cards }, israelToday(now), now);

  it('alerts any day at 30, 7 and 1 days left, once per stage', () => {
    const r = giftRun([gift('BuyMe', '2026-10-19')]); // Monday 12.10 → 7 days left
    expect(r.messages).toEqual([expect.objectContaining({
      kind: 'gift', title: '🎁 ₪150 בBuyMe פג בעוד 7 ימים', url: '/wallet/gift-cards',
      remindKeys: ['push:gift:BuyMe:7:2026-10-19'],
    })]);
    expect(kinds(giftRun([gift('BuyMe', '2026-10-19')], profile({ reminded: ['push:gift:BuyMe:7:2026-10-19'] })))).toEqual([]);
    expect(giftRun([gift('x', '2026-10-13')]).messages[0].title).toContain('מחר');
    expect(giftRun([gift('x', '2026-11-11')]).messages[0].remindKeys).toEqual(['push:gift:x:30:2026-11-11']);
  });
  it('skips cards far from expiry, already expired, used up, or without a date, and respects the switch', () => {
    expect(kinds(giftRun([gift('far', '2026-11-12'), gift('gone', '2026-10-11'), gift('used', '2026-10-13', { balance: 0 }), gift('none', null)]))).toEqual([]);
    expect(kinds(giftRun([gift('x', '2026-10-13')], profile({ push_expiring: false })))).toEqual([]);
  });
  it('groups several cards into one alert, soonest first', () => {
    const r = giftRun([gift('b', '2026-10-30'), gift('a', '2026-10-12')]);
    expect(r.messages[0]).toMatchObject({ title: '🎁 2 גיפטקארדים פגים בקרוב', body: 'a ₪150 עד 12.10.2026 · b ₪150 עד 30.10.2026' });
  });
});

describe('bundle', () => {
  const m = (kind: PushMessage['kind'], keys: string[] = []): PushMessage =>
    ({ kind, title: `t-${kind}`, body: 'b', url: `/${kind}`, tag: kind, remindKeys: keys });
  it('leaves a single alert as it is', () => {
    expect(bundle([m('new')])).toEqual([m('new')]);
    expect(bundle([])).toEqual([]);
  });
  it('turns several alerts into one summary that keeps every bookkeeping key', () => {
    expect(bundle([m('dates', ['push:birthday:2026']), m('expiring', ['push:expiring:2026-10-11']), m('new')])).toEqual([{
      kind: 'summary', parts: ['dates', 'expiring', 'new'], title: 'ההטבות שלי', body: 't-dates · t-expiring · t-new', url: '/',
      tag: 'summary', remindKeys: ['push:birthday:2026', 'push:expiring:2026-10-11'],
    }]);
  });
});

describe('pruneReminded', () => {
  it('drops bookkeeping from earlier years so the list never grows forever', () => {
    expect(pruneReminded(['birthday:2025', 'push:birthday:2025', 'push:expiring:2025-12-28', 'birthday:2026', 'push:expiring:2026-10-11'], 2026))
      .toEqual(['birthday:2026', 'push:expiring:2026-10-11']);
  });
  it('keeps gift card keys for a future expiry', () => {
    expect(pruneReminded(['push:gift:g:30:2027-01-20', 'push:gift:g:1:2025-12-31'], 2026)).toEqual(['push:gift:g:30:2027-01-20']);
  });
});
