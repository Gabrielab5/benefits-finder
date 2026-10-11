import { addDays, type IsraelDay } from './dates';
import { WINDOW_ICON } from './labels';
import { eligibleItems } from './rank';
import { activeDateBenefits } from './specialDates';
import type { Benefit, Snapshot } from './types';

export interface PushMessage {
  kind: 'dates' | 'expiring' | 'new';
  title: string;
  body: string;
  url: string; // opened when the notification is tapped
  tag: string; // a newer notification with the same tag replaces the older one
  remindKeys: string[]; // added to profile.reminded once delivered
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 0 = Sunday, in Israel time. */
export function israelWeekday(now: Date): number {
  return WEEKDAYS.indexOf(now.toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }));
}

export const pushKey = (windowKey: string, year: number) => `push:${windowKey}:${year}`;

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
const titles = (list: Benefit[]) => list.slice(0, 3).map((b) => b.title).join(' · ') + (list.length > 3 ? ' …' : '');

/** What one user should get today. `newSince` is the new "new benefits" watermark, or null to keep it. */
export function pushMessages(s: Snapshot, today: IsraelDay, now: Date): { messages: PushMessage[]; newSince: string | null } {
  const p = s.profile;
  const messages: PushMessage[] = [];
  if (!p) return { messages, newSince: null };
  const mine = (b: Benefit) => b.status === 'active' && eligibleItems(b, s.wallet).length > 0;

  if (p.push_dates !== false) {
    for (const { window, benefits } of activeDateBenefits(s, today)) {
      const key = pushKey(window.key, today.year);
      if ((p.reminded ?? []).includes(key)) continue;
      messages.push({
        kind: 'dates', title: `${WINDOW_ICON[window.kind]} ${window.label}`,
        body: `${count(benefits.length, 'הטבה אחת פעילה', 'הטבות פעילות')} החודש — כדאי לנצל!`,
        url: '/benefits?birthday=1', tag: `dates:${window.key}`, remindKeys: [key],
      });
    }
  }

  if (p.push_expiring !== false && israelWeekday(now) === 0) {
    const weekEnd = addDays(today.iso, 7);
    const ending = s.benefits
      .filter((b) => mine(b) && b.valid_until && b.valid_until >= today.iso && b.valid_until <= weekEnd)
      .sort((a, b) => a.valid_until!.localeCompare(b.valid_until!));
    if (ending.length) {
      messages.push({
        kind: 'expiring', title: `⏳ ${count(ending.length, 'הטבה אחת מסתיימת', 'הטבות מסתיימות')} השבוע`,
        body: titles(ending), url: '/benefits?expiring=1', tag: 'expiring', remindKeys: [],
      });
    }
  }

  // The watermark keeps moving while the switch is off, so switching it back on doesn't announce the backlog.
  if (p.push_new === false || !p.push_new_since) return { messages, newSince: now.toISOString() };
  const since = new Date(p.push_new_since).getTime();
  const fresh = s.benefits.filter((b) => b.user_id == null && mine(b) && new Date(b.created_at).getTime() > since);
  if (!fresh.length) return { messages, newSince: null };
  messages.push({
    kind: 'new', title: `✨ ${count(fresh.length, 'הטבה חדשה', 'הטבות חדשות')} לכרטיסים שלך`,
    body: titles(fresh), url: '/benefits?recent=1', tag: 'new', remindKeys: [],
  });
  return { messages, newSince: now.toISOString() };
}
