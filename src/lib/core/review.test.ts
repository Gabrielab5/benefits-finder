import { describe, expect, it } from 'vitest';
import { blankRow, planNewStores, rowProblems, scopePatch, scopeValue, toIncoming, type NewStoreDraft, type ReviewRow } from './review';
import type { Store } from './types';

const row = (o: Partial<ReviewRow> = {}): ReviewRow => ({
  approved: true, title: '10% הנחה', description: null, store_id: 'mango', new_store_index: null, category: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'pay_with_card', coupon_code: null,
  channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null, ...o,
});
const ctx = {
  storeIds: new Set(['mango']),
  newStores: [{ name_he: 'קסטרו', name_en: 'Castro', aliases: [], category: 'fashion' as const, channel: 'both' as const }],
  todayIso: '2026-10-06',
};

describe('rowProblems', () => {
  it('accepts a valid row', () => {
    expect(rowProblems(row(), ctx)).toEqual([]);
  });
  it('rejects an unknown store and a missing title', () => {
    expect(rowProblems(row({ store_id: 'gone', title: ' ' }), ctx)).toEqual(['חסרה כותרת', 'חנות לא מוכרת']);
  });
  it('requires both names on a new store', () => {
    const noEnglish = { ...ctx, newStores: [{ ...ctx.newStores[0], name_en: '' }] };
    expect(rowProblems(row({ store_id: null, new_store_index: 0 }), noEnglish)).toContain('לחנות חדשה חסר שם בעברית או באנגלית');
    expect(rowProblems(row({ store_id: null, new_store_index: 0 }), ctx)).toEqual([]);
  });
  it('rejects more than one scope', () => {
    expect(rowProblems(row({ category: 'food' }), ctx)).toContain('יש לבחור חנות או קטגוריה, לא את שתיהן');
  });
  it('checks percent and fixed values', () => {
    expect(rowProblems(row({ value: 120 }), ctx)).toContain('אחוז חייב להיות בין 0 ל-100');
    expect(rowProblems(row({ type: 'fixed_off', value: null }), ctx)).toContain('חסר סכום ההנחה');
    expect(rowProblems(row({ type: 'bogo', value: null }), ctx)).toEqual([]);
  });
  it('rejects values that are not numbers (e.g. "10%" typed into the value box)', () => {
    expect(rowProblems(row({ value: NaN }), ctx)).toContain('ערך לא תקין');
    expect(rowProblems(row({ type: 'bogo', value: null, min_spend: NaN }), ctx)).toContain('ערך לא תקין');
  });
  it('checks dates', () => {
    expect(rowProblems(row({ valid_until: '31.12.2026' }), ctx)).toContain('תאריך לא תקין');
    expect(rowProblems(row({ valid_from: '2026-12-01', valid_until: '2026-11-01' }), ctx)).toContain('תאריך הסיום לפני תאריך ההתחלה');
    expect(rowProblems(row({ valid_until: '2026-10-05' }), ctx)).toContain('ההטבה כבר פגה');
    expect(rowProblems(row({ valid_until: '2026-10-06' }), ctx)).toEqual([]);
  });
});

describe('blankRow (manual entry)', () => {
  it('starts approved and needs only a title to be valid as a general benefit', () => {
    expect(blankRow().approved).toBe(true);
    expect(rowProblems(blankRow(), ctx)).toEqual(['חסרה כותרת', 'אחוז חייב להיות בין 0 ל-100']);
    expect(rowProblems({ ...blankRow(), title: 'הנחה', value: 10 }, ctx)).toEqual([]);
  });
});

describe('toIncoming', () => {
  it('resolves a new store index to the saved store id and drops review-only fields', () => {
    const inc = toIncoming(row({ store_id: null, new_store_index: 0, title: ' כותרת ' }), ['new-id'], 'https://x');
    expect(inc.store_id).toBe('new-id');
    expect(inc.title).toBe('כותרת');
    expect(inc.source_url).toBe('https://x');
    expect(inc).not.toHaveProperty('approved');
    expect(inc).not.toHaveProperty('new_store_index');
  });
});

describe('planNewStores', () => {
  const draft = (name_he: string, name_en: string): NewStoreDraft => ({ name_he, name_en, aliases: [], category: 'fashion', channel: 'both' });
  const existing: Store[] = [{ id: 's-mango', name_he: 'מנגו', name_en: 'Mango', aliases: [], category: 'fashion', channel: 'both' }];
  const drafts = [draft('קסטרו', 'Castro'), draft('מנגו', 'Mango'), draft('קסטרו ', 'castro'), draft('גולף', 'Golf')];

  it('reuses existing stores and creates each new store only once per save', () => {
    expect(planNewStores([0, 1, 2], drafts, existing)).toEqual([
      { indexes: [0, 2], existingId: null, draft: drafts[0] },
      { indexes: [1], existingId: 's-mango', draft: drafts[1] },
    ]);
  });
  it('on a retry reuses the store the failed attempt already created', () => {
    const created: Store = { id: 's-castro', name_he: 'קסטרו', name_en: 'Castro', aliases: [], category: 'fashion', channel: 'both' };
    expect(planNewStores([0], drafts, [...existing, created])[0].existingId).toBe('s-castro');
  });
});

describe('scope select encoding', () => {
  it('round-trips', () => {
    for (const v of ['', 's:mango', 'n:2', 'c:food']) expect(scopeValue(scopePatch(v))).toBe(v);
  });
});
