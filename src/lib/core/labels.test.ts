import { describe, expect, it } from 'vitest';
import { headlineText } from './labels';

describe('headlineText', () => {
  it('shows the accrual percent for points, the type label without one', () => {
    expect(headlineText({ type: 'points', value: 3 })).toBe('3% צבירה');
    expect(headlineText({ type: 'points', value: null })).toBe('נקודות');
  });
});
