import { describe, expect, it } from 'vitest';
import {
  addDays, availability, isBirthdayMonth, isOutdated, isWithinValidity, israelToday, monthNameHe,
} from './dates';

const day = (iso: string) => ({ iso, year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
const active = { status: 'active' as const, timing: 'always' as const, valid_from: null, valid_until: null };

describe('israelToday', () => {
  it('uses the Israel date late in the evening (UTC is still the previous day)', () => {
    // 21:30 UTC on 30.9 = 00:30 on 1.10 in Israel (UTC+3)
    expect(israelToday(new Date('2026-09-30T21:30:00Z'))).toEqual({ iso: '2026-10-01', year: 2026, month: 10 });
  });
  it('keeps the same date at 23:30 Israel time', () => {
    expect(israelToday(new Date('2026-10-06T20:30:00Z')).iso).toBe('2026-10-06');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('isWithinValidity', () => {
  it('includes the last valid day', () => {
    expect(isWithinValidity({ valid_from: null, valid_until: '2026-10-06' }, '2026-10-06')).toBe(true);
    expect(isWithinValidity({ valid_from: null, valid_until: '2026-10-06' }, '2026-10-07')).toBe(false);
  });
  it('respects the start date', () => {
    expect(isWithinValidity({ valid_from: '2026-10-10', valid_until: null }, '2026-10-09')).toBe(false);
    expect(isWithinValidity({ valid_from: '2026-10-10', valid_until: null }, '2026-10-10')).toBe(true);
  });
});

describe('birthday month', () => {
  it('is active for the whole birth month', () => {
    expect(isBirthdayMonth(9, day('2026-09-01'))).toBe(true);
    expect(isBirthdayMonth(9, day('2026-09-30'))).toBe(true);
    expect(isBirthdayMonth(9, day('2026-08-31'))).toBe(false);
    expect(isBirthdayMonth(9, day('2026-10-01'))).toBe(false);
  });
  it('handles December/January', () => {
    expect(isBirthdayMonth(12, day('2026-12-31'))).toBe(true);
    expect(isBirthdayMonth(12, day('2027-01-01'))).toBe(false);
  });
  it('is never active without a birth month', () => {
    expect(isBirthdayMonth(null, day('2026-09-15'))).toBe(false);
  });
});

describe('availability', () => {
  it('available for an active, valid, non-birthday benefit', () => {
    expect(availability(active, 9, day('2026-10-06'))).toBe('available');
  });
  it('birthday_locked outside the birth month', () => {
    expect(availability({ ...active, timing: 'birthday_month' }, 9, day('2026-10-06'))).toBe('birthday_locked');
    expect(availability({ ...active, timing: 'birthday_month' }, 10, day('2026-10-06'))).toBe('available');
  });
  it('unavailable when expired or not active', () => {
    expect(availability({ ...active, valid_until: '2026-10-05' }, 9, day('2026-10-06'))).toBe('unavailable');
    expect(availability({ ...active, status: 'not_seen' }, 9, day('2026-10-06'))).toBe('unavailable');
  });
});

describe('isOutdated', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  it('flags benefits unverified for more than 60 days', () => {
    expect(isOutdated('2026-08-06T11:00:00Z', now)).toBe(true); // 61 days
    expect(isOutdated('2026-08-08T12:00:00Z', now)).toBe(false); // 59 days
  });
});

describe('monthNameHe', () => {
  it('returns Hebrew month names', () => {
    expect(monthNameHe(3)).toBe('מרץ');
    expect(monthNameHe(9)).toBe('ספטמבר');
  });
});
