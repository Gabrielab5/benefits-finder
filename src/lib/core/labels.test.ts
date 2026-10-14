import { describe, expect, it } from 'vitest';
import { actionLine, headlineText, retryHint, savingsDerivation } from './labels';
import { computeSavings } from './savings';

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

describe('savingsDerivation', () => {
  const p = (type: 'percent_off' | 'fixed_off' | 'cashback_percent', value: number, min_spend: number | null = null, max_discount: number | null = null) =>
    ({ type, value, min_spend, max_discount });
  const say = (b: ReturnType<typeof p>, amount: number) => savingsDerivation(b, amount, computeSavings(b, amount));
  it('shows the percent times the amount, with the cap when there is one', () => {
    expect(say(p('percent_off', 30), 300)).toBe('30% × ₪300');
    expect(say(p('percent_off', 10, null, 50), 300)).toBe('10% × ₪300, עד ₪50');
    expect(say(p('cashback_percent', 5), 300)).toBe('5% החזר × ₪300');
  });
  it('shows a fixed discount with its minimum spend, or capped at the purchase', () => {
    expect(say(p('fixed_off', 20, 100), 300)).toBe('₪20 בקנייה מעל ₪100');
    expect(say(p('fixed_off', 20), 300)).toBe('₪20 הנחה קבועה');
    expect(say(p('fixed_off', 50), 30)).toBe('₪50 הנחה, עד גובה הקנייה');
  });
  it('says nothing when there is no saving yet (the spend-more nudge covers it)', () => {
    expect(say(p('fixed_off', 50, 300), 250)).toBeNull();
  });
});

describe('actionLine', () => {
  it('drops the program when the wallet item already names it', () => {
    expect(actionLine('membership', 'רי-בר', ['רי-בר'])).toEqual({ verb: 'הציגו', who: 'רי-בר', more: [] });
    expect(actionLine('pay_with_card', 'ביחד בשבילך', ['כרטיס ביחד בשבילך'])).toEqual({ verb: 'שלמו עם', who: 'כרטיס ביחד בשבילך', more: [] });
  });
  it('keeps a different program and the store', () => {
    expect(actionLine('pay_with_card', 'ביחד בשבילך', ['מקס', 'דרים קארד'], 'שופרסל'))
      .toEqual({ verb: 'שלמו עם', who: 'מקס / דרים קארד', more: ['ביחד בשבילך', 'שופרסל'] });
  });
  it('names the program as a requirement when the wallet has nothing for it', () => {
    expect(actionLine('pay_with_card', 'ביחד בשבילך', [], 'שופרסל')).toEqual({ verb: 'דורש:', who: 'ביחד בשבילך', more: ['שופרסל'] });
  });
});

describe('retryHint', () => {
  it('blames the connection only when offline', () => {
    expect(retryHint(false)).toContain('אין חיבור');
    expect(retryHint(true)).not.toContain('אין חיבור');
  });
});
