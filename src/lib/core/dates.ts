import type { Benefit, Child, Timing } from './types';

const TZ = 'Asia/Jerusalem';
const DAY_MS = 86_400_000;

export interface IsraelDay {
  iso: string; // YYYY-MM-DD
  year: number;
  month: number; // 1-12
}

export function israelToday(now: Date = new Date()): IsraelDay {
  const iso = now.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA formats as YYYY-MM-DD
  return { iso, year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Both bounds inclusive; a missing bound is open. ISO date strings compare correctly as text. */
export function isWithinValidity(
  b: { valid_from: string | null; valid_until: string | null },
  todayIso: string,
): boolean {
  return (!b.valid_from || b.valid_from <= todayIso) && (!b.valid_until || todayIso <= b.valid_until);
}

export function isBirthdayMonth(birthMonth: number | null | undefined, today: IsraelDay): boolean {
  return birthMonth === today.month;
}

export interface PersonalDates {
  birthMonth: number | null;
  anniversaryMonth: number | null;
  childMonths: number[];
}

export function datesOf(
  profile: { birth_month?: number | null; anniversary_month?: number | null; children?: Child[] } | null | undefined,
): PersonalDates {
  return {
    birthMonth: profile?.birth_month ?? null,
    anniversaryMonth: profile?.anniversary_month ?? null,
    childMonths: (profile?.children ?? []).map((c) => c.birth_month),
  };
}

/** Months in which a dated benefit is open; null = no date restriction; [] = date not set, never open. */
export function openMonths(timing: Timing, dates: PersonalDates, itemBirthMonth?: number | null): number[] | null {
  switch (timing) {
    case 'always':
      return null;
    case 'birthday_month': {
      const m = itemBirthMonth ?? dates.birthMonth;
      return m ? [m] : [];
    }
    case 'anniversary_month':
      return dates.anniversaryMonth ? [dates.anniversaryMonth] : [];
    case 'child_birthday_month':
      return [...new Set(dates.childMonths)].sort((a, b) => a - b);
  }
}

export type Availability = 'available' | 'date_locked' | 'unavailable';

export function availability(
  b: Pick<Benefit, 'status' | 'timing' | 'valid_from' | 'valid_until'>,
  dates: PersonalDates,
  today: IsraelDay,
  itemBirthMonth?: number | null,
): Availability {
  if (b.status !== 'active' || !isWithinValidity(b, today.iso)) return 'unavailable';
  const months = openMonths(b.timing, dates, itemBirthMonth);
  if (months === null || months.includes(today.month)) return 'available';
  return 'date_locked';
}

export function isOutdated(lastVerifiedAt: string, now: Date): boolean {
  return now.getTime() - new Date(lastVerifiedAt).getTime() > 60 * DAY_MS;
}

export function monthNameHe(month: number): string {
  return new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
}
