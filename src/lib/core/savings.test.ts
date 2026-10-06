import { describe, expect, it } from 'vitest';
import { computeSavings } from './savings';

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
