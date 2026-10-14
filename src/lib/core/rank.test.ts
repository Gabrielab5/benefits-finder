import { describe, expect, it } from 'vitest';
import { rankForStore } from './rank';
import type { Benefit, Program, Snapshot, Store, WalletItem } from './types';

const day = (iso: string) => ({ iso, year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
const OCT = day('2026-10-06');
const SEP = day('2026-09-15');

const program = (id: string, kind: Program['kind']): Program => ({
  id, name: id, kind, logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never',
});
const item = (id: string, type: WalletItem['type'], program_ids: string[]): WalletItem => ({
  id, name: id, type, last4: null, nickname: null, color: null, program_ids, created_at: '2026-01-01T00:00:00Z',
});
let n = 0;
const benefit = (o: Partial<Benefit>): Benefit => ({
  id: `b${++n}`, program_id: 'cal', store_id: 'mango', category: null, title: 't', description: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'pay_with_card',
  coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '2026-10-01T00:00:00Z', status: 'active', created_at: '2026-10-01T00:00:00Z',
  ...o,
});

const mango: Store = { id: 'mango', name_he: 'מנגו', name_en: 'Mango', aliases: [], category: 'fashion', channel: 'both' };

const b1 = benefit({ id: 'hever10', program_id: 'hever', value: 10 });
const b2 = benefit({ id: 'calFixed', store_id: null, category: 'fashion', type: 'fixed_off', value: 50, min_spend: 300 });
const b3 = benefit({ id: 'isracard30', program_id: 'isracard', value: 30 });
const b4 = benefit({ id: 'heverBogo', program_id: 'hever', type: 'bogo', value: null });
const b5 = benefit({ id: 'heverCode', program_id: 'hever', value: 5, requires: 'coupon_code', coupon_code: 'X1' });
const b6 = benefit({ id: 'calBirthday', value: 15, timing: 'birthday_month' });
const b7 = benefit({ id: 'calExpired', value: 50, valid_until: '2026-09-01' }); // expired on both test dates
const b8 = benefit({ id: 'heverGeneral', program_id: 'hever', store_id: null, type: 'cashback_percent', value: 2 });
const b9 = benefit({ id: 'rebarCard', program_id: 'rebar', value: 20 }); // needs a rebar CARD; I only have membership
const b10 = benefit({ id: 'otherStore', store_id: 'castro', value: 40 });

const snapshot: Snapshot = {
  profile: { user_id: 'u', birth_month: 9, email_reminders: true, last_reminder_year: null },
  programs: [program('cal', 'card_issuer'), program('hever', 'club'), program('isracard', 'card_issuer'), program('rebar', 'store_club')],
  wallet: [item('calHeverCard', 'card', ['cal', 'hever']), item('rebarClub', 'membership', ['rebar'])],
  stores: [mango],
  benefits: [b1, b2, b3, b4, b5, b6, b7, b8, b9, b10],
  fetchedAt: '',
};
const ids = (rows: { benefit: Benefit }[]) => rows.map((r) => r.benefit.id);

describe('rankForStore', () => {
  it('sorts pay-with-card benefits by shekels saved, birthday-locked last', () => {
    const r = rankForStore(snapshot, mango, 400, OCT);
    expect(ids(r.pay)).toEqual(['calFixed', 'hever10', 'heverGeneral', 'calBirthday']);
    expect(r.pay[0].savings?.saved).toBe(50);
    expect(r.pay[3].dateLocked).toBe(true);
  });
  it('puts non-computable benefits in other and membership/coupon benefits in show', () => {
    const r = rankForStore(snapshot, mango, 400, OCT);
    expect(ids(r.other)).toEqual(['heverBogo']);
    expect(ids(r.show)).toEqual(['heverCode']);
    expect(r.show[0].savings?.saved).toBe(20);
  });
  it('excludes programs I do not hold, expired benefits, other stores and card benefits I have only a membership for', () => {
    const all = Object.values(rankForStore(snapshot, mango, 400, OCT)).flat().map((r) => r.benefit.id);
    expect(all).not.toContain('isracard30');
    expect(all).not.toContain('calExpired');
    expect(all).not.toContain('otherStore');
    expect(all).not.toContain('rebarCard');
  });
  it('without an amount sorts percent benefits by value, then fixed', () => {
    const r = rankForStore(snapshot, mango, null, OCT);
    expect(ids(r.pay)).toEqual(['hever10', 'heverGeneral', 'calFixed', 'calBirthday']);
    expect(r.pay[0].savings).toBeNull();
  });
  it('below the minimum spend the fixed benefit drops below the ones that apply', () => {
    const r = rankForStore(snapshot, mango, 250, OCT);
    expect(ids(r.pay)).toEqual(['hever10', 'heverGeneral', 'calFixed', 'calBirthday']);
    expect(r.pay[2].savings?.spendMore).toBe(50);
  });
  it('in the birth month the birthday benefit competes normally', () => {
    const r = rankForStore(snapshot, mango, 400, SEP);
    expect(ids(r.pay)[0]).toBe('calBirthday'); // 15% of 400 = 60
    expect(r.pay[0].dateLocked).toBe(false);
  });
  it('filters by channel', () => {
    const online = benefit({ id: 'onlineOnly', value: 90, channel: 'online' });
    const s = { ...snapshot, benefits: [online] };
    expect(ids(rankForStore(s, mango, 100, OCT, 'in_store').pay)).toEqual([]);
    expect(ids(rankForStore(s, mango, 100, OCT, 'online').pay)).toEqual(['onlineOnly']);
  });
  it('lists every wallet item that can be used', () => {
    const s = { ...snapshot, wallet: [...snapshot.wallet, item('secondCal', 'card', ['cal'])] };
    const row = rankForStore(s, mango, 400, OCT).pay.find((r) => r.benefit.id === 'calFixed');
    expect(row?.items.map((i) => i.id)).toEqual(['calHeverCard', 'secondCal']);
  });
});

describe('special dates in ranking', () => {
  it('reports the month a locked birthday benefit opens', () => {
    const r = rankForStore(snapshot, mango, 400, OCT);
    expect(r.pay.find((x) => x.benefit.id === 'calBirthday')?.lockedMonths).toEqual([9]);
  });
  it('uses a club-specific birthday month for that club', () => {
    const s = { ...snapshot, wallet: [{ ...snapshot.wallet[0], birthday_month: 10 }, snapshot.wallet[1]] };
    const row = rankForStore(s, mango, 400, OCT).pay.find((x) => x.benefit.id === 'calBirthday');
    expect(row?.dateLocked).toBe(false);
  });
});

import { bestRowId } from './rank';

describe('bestRowId', () => {
  it('picks the biggest shekel saving across pay-with-card and show-membership benefits', () => {
    const show = benefit({ id: 'dreamShow', program_id: 'hever', value: 12, requires: 'membership' });
    const s = { ...snapshot, benefits: [b1, show] };
    expect(bestRowId(rankForStore(s, mango, 300, OCT))).toBe('dreamShow'); // ₪36 (show) beats ₪30 (pay)
  });
  it('ignores birthday-locked benefits and ones below their minimum spend', () => {
    const s = { ...snapshot, benefits: [b2, b6, b8] }; // calFixed needs ₪300, birthday locked in October
    expect(bestRowId(rankForStore(s, mango, 250, OCT))).toBe('heverGeneral');
  });
  it('returns null when no amount was entered', () => {
    expect(bestRowId(rankForStore(snapshot, mango, null, OCT))).toBeNull();
  });
});

describe('single-item percent benefits', () => {
  const rebar: Store = { id: 'rebar', name_he: 'רי-בר', name_en: 'Rebar', aliases: [], category: 'restaurants', channel: 'both' };
  const drink = benefit({
    id: 'rebarDrink', program_id: 'hever', store_id: 'rebar', title: '30% הנחה על משקה או קערה ביום ההולדת', value: 30, requires: 'membership',
  });
  const whole = benefit({ id: 'rebarWhole', program_id: 'hever', store_id: 'rebar', title: '10% הנחה על כל הקנייה', value: 10, requires: 'membership' });
  const fixed = benefit({ id: 'rebarFixed', program_id: 'hever', store_id: 'rebar', type: 'fixed_off', value: 20, requires: 'membership' });
  const s = { ...snapshot, stores: [rebar], benefits: [drink, whole] };

  it('get no ₪ figure and never win best (Rebar, ₪300, 30% on a drink, no cap)', () => {
    const r = rankForStore(s, rebar, 300, OCT);
    expect(r.show.find((x) => x.benefit.id === 'rebarDrink')?.savings).toBeNull();
    expect(r.show.find((x) => x.benefit.id === 'rebarWhole')?.savings?.saved).toBe(30);
    expect(ids(r.show)).toEqual(['rebarWhole', 'rebarDrink']);
    expect(bestRowId(r)).toBe('rebarWhole');
  });
  it('alone, leave no best at all', () => {
    expect(bestRowId(rankForStore({ ...s, benefits: [drink] }, rebar, 300, OCT))).toBeNull();
  });
  it('get no ₪ figure even with a cap', () => {
    const capped = { ...drink, max_discount: 20 };
    const r = rankForStore({ ...s, benefits: [capped] }, rebar, 300, OCT);
    expect(r.show[0].savings).toBeNull();
    expect(bestRowId(r)).toBeNull();
  });
  it('paid by card, sit with the other unrankable benefits', () => {
    const r = rankForStore({ ...s, benefits: [{ ...drink, requires: 'pay_with_card' }] }, rebar, 300, OCT);
    expect(ids(r.pay)).toEqual([]);
    expect(ids(r.other)).toEqual(['rebarDrink']);
  });
  it('without an amount sort below whole-purchase percents and fixed discounts', () => {
    const r = rankForStore({ ...s, benefits: [drink, fixed, whole] }, rebar, null, OCT);
    expect(ids(r.show)).toEqual(['rebarWhole', 'rebarFixed', 'rebarDrink']);
    expect(bestRowId(r)).toBeNull();
  });
});
