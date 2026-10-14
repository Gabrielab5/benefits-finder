import { describe, expect, it } from 'vitest';
import { headlineText } from './labels';

describe('headlineText', () => {
  it('shows the accrual percent for points, the type label without one', () => {
    expect(headlineText({ type: 'points', value: 3 })).toBe('3% צבירה');
    expect(headlineText({ type: 'points', value: null })).toBe('נקודות');
  });
});

describe('headlineText for single-item percents', () => {
  const b = { title: '30% הנחה על משקה או קערה', description: null, conditions: null, max_discount: null };
  it('says the percent covers one item, with the cap when there is one', () => {
    expect(headlineText({ ...b, type: 'percent_off', value: 30 })).toBe('30% על פריט אחד');
    expect(headlineText({ ...b, type: 'percent_off', value: 30, max_discount: 20 })).toBe('30% על פריט אחד, עד ₪20');
    expect(headlineText({ ...b, type: 'cashback_percent', value: 5 })).toBe('5% החזר על פריט אחד');
  });
  it('keeps the plain headline for whole-purchase percents', () => {
    expect(headlineText({ ...b, title: '10% הנחה', type: 'percent_off', value: 10 })).toBe('10% הנחה');
  });
});
