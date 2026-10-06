import type { Benefit } from './types';

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

export type Availability = 'available' | 'birthday_locked' | 'unavailable';

export function availability(
  b: Pick<Benefit, 'status' | 'timing' | 'valid_from' | 'valid_until'>,
  birthMonth: number | null,
  today: IsraelDay,
): Availability {
  if (b.status !== 'active' || !isWithinValidity(b, today.iso)) return 'unavailable';
  if (b.timing === 'birthday_month' && !isBirthdayMonth(birthMonth, today)) return 'birthday_locked';
  return 'available';
}

export function isOutdated(lastVerifiedAt: string, now: Date): boolean {
  return now.getTime() - new Date(lastVerifiedAt).getTime() > 60 * DAY_MS;
}

export function monthNameHe(month: number): string {
  return new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
}
