import { describe, expect, it } from 'vitest';
import { computeSavings, isFxFee, isPerItem, parseAmount } from './savings';

describe('isFxFee', () => {
  it('catches the catalog FX-fee benefits (10/2026)', () => {
    for (const t of ['50% הנחה בעמלת עסקאות מט"ח', 'פטור מלא מעמלת מט״ח', '25% הנחה בעמלת המרת מטבע חוץ', 'עמלת מט"ח מוזלת 1% במקום 3%']) {
      expect(isFxFee({ title: t }), t).toBe(true);
    }
  });
  it('leaves other fees and purchases abroad alone', () => {
    expect(isFxFee({ title: 'ללא עמלת הזמנה' })).toBe(false);
    expect(isFxFee({ title: '3% החזר על קניות במט"ח' })).toBe(false);
  });
});

describe('parseAmount', () => {
  it('treats commas as thousands separators (Israeli format)', () => {
    expect(parseAmount('1,200')).toBe(1200);
  });
  it('accepts shekel signs, spaces and decimals', () => {
    expect(parseAmount(' ₪ 99.90 ')).toBe(99.9);
  });
  it('returns null for empty, zero or non-numeric input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

const b = (type: 'percent_off' | 'fixed_off' | 'cashback_percent', value: number | null, min_spend: number | null = null, max_discount: number | null = null) =>
  ({ type, value, min_spend, max_discount });

describe('computeSavings', () => {
  it('percent off', () => {
    expect(computeSavings(b('percent_off', 10), 200)).toEqual({ saved: 20, spendMore: 0, potential: 20 });
  });
  it('percent off with a maximum discount', () => {
    expect(computeSavings(b('percent_off', 10, null, 15), 200).saved).toBe(15);
  });
  it('fixed off below the minimum spend reports how much more to spend', () => {
    expect(computeSavings(b('fixed_off', 50, 300), 250)).toEqual({ saved: 0, spendMore: 50, potential: 50 });
  });
  it('fixed off exactly at the minimum spend applies', () => {
    expect(computeSavings(b('fixed_off', 50, 300), 300).saved).toBe(50);
  });
  it('a fixed discount larger than the purchase saves only the purchase amount', () => {
    expect(computeSavings(b('fixed_off', 50), 30).saved).toBe(30);
  });
  it('cashback percent rounds to agorot', () => {
    expect(computeSavings(b('cashback_percent', 3), 99.99).saved).toBe(3);
  });
  it('potential below the minimum respects the cap', () => {
    expect(computeSavings(b('percent_off', 20, 100, 30), 80)).toEqual({ saved: 0, spendMore: 20, potential: 20 });
  });
  it('missing value saves nothing', () => {
    expect(computeSavings(b('percent_off', null), 100).saved).toBe(0);
  });
});

describe('isPerItem', () => {
  const p = (title: string, o: { description?: string; conditions?: string; type?: 'percent_off' | 'cashback_percent' | 'fixed_off' } = {}) =>
    ({ type: 'percent_off' as const, title, description: null, conditions: null, ...o });
  it('catches a percent off one drink or bowl (Rebar)', () => {
    expect(isPerItem(p('30% הנחה על משקה או קערה ביום ההולדת'))).toBe(true);
  });
  it('reads the description and conditions too', () => {
    expect(isPerItem(p('20% הנחה', { description: 'הנחה על מוצר אחד לבחירה' }))).toBe(true);
    expect(isPerItem(p('הטבת יום הולדת', { conditions: 'על פריט בודד בלבד' }))).toBe(true);
    expect(isPerItem(p('5% החזר', { type: 'cashback_percent', description: 'על הכוס הראשונה' }))).toBe(true);
  });
  it('catches English single-item wording', () => {
    expect(isPerItem(p('Birthday: 20% off one drink'))).toBe(true);
  });
  it('leaves whole-purchase and many-item discounts alone', () => {
    for (const t of ['10% הנחה על כל הקנייה', '10% הנחה על כל מוצר', '10% הנחה על מוצרים נבחרים', '15% הנחה על מוצרי חשמל',
      'עד 6% בהתאם לסוג המוצר', 'האחוז משתנה לפי מוצר', 'ההנחה על מחיר המחירון בלבד', '10% off your whole order']) {
      expect(isPerItem(p(t)), t).toBe(false);
    }
  });
  it('only applies to percent benefits', () => {
    expect(isPerItem(p('₪10 הנחה על משקה', { type: 'fixed_off' }))).toBe(false);
  });
});
