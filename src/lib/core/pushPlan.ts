import { addDays, type IsraelDay } from './dates';
import { WINDOW_ICON, formatDate, shekel } from './labels';
import { eligibleItems } from './rank';
import { activeDateBenefits } from './specialDates';
import type { Benefit, Snapshot } from './types';

export interface PushMessage {
  kind: 'dates' | 'expiring' | 'gift' | 'new' | 'summary';
  parts?: PushMessage['kind'][]; // for a summary: the alerts it stands for
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
const GIFT_STAGES = [30, 7, 1]; // days before a gift card expires: one alert at each
const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
const inDays = (d: number) => (d === 0 ? 'היום' : d === 1 ? 'מחר' : `בעוד ${d} ימים`);

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

  const expiringKey = `push:expiring:${today.iso}`; // once a day even if the cron runs twice
  if (p.push_expiring !== false && israelWeekday(now) === 0 && !(p.reminded ?? []).includes(expiringKey)) {
    const weekEnd = addDays(today.iso, 7);
    const ending = s.benefits
      .filter((b) => mine(b) && b.valid_until && b.valid_until >= today.iso && b.valid_until <= weekEnd)
      .sort((a, b) => a.valid_until!.localeCompare(b.valid_until!));
    if (ending.length) {
      messages.push({
        kind: 'expiring', title: `⏳ ${count(ending.length, 'הטבה אחת מסתיימת', 'הטבות מסתיימות')} השבוע`,
        body: titles(ending), url: '/benefits?expiring=1', tag: 'expiring', remindKeys: [expiringKey],
      });
    }
  }

  if (p.push_expiring !== false) {
    // Each card alerts once per stage it reaches (30 / 7 / 1 days left); a new expiry date starts over.
    const due = (s.giftCards ?? []).flatMap((c) => {
      if (c.balance <= 0 || !c.expires_on || c.expires_on < today.iso) return [];
      const left = daysBetween(today.iso, c.expires_on);
      const stage = GIFT_STAGES.findLast((d) => left <= d);
      const key = `push:gift:${c.id}:${stage}:${c.expires_on}`;
      return stage === undefined || (p.reminded ?? []).includes(key) ? [] : [{ c, left, key }];
    }).sort((a, b) => a.left - b.left);
    if (due.length) {
      const [first] = due;
      messages.push({
        kind: 'gift',
        title: due.length === 1
          ? `🎁 ${shekel(first.c.balance)} ב${first.c.name} פג ${inDays(first.left)}`
          : `🎁 ${due.length} גיפטקארדים פגים בקרוב`,
        body: due.slice(0, 3).map(({ c }) => `${c.name} ${shekel(c.balance)} עד ${formatDate(c.expires_on!)}`).join(' · ')
          + (due.length > 3 ? ' …' : ''),
        url: '/wallet/gift-cards', tag: 'gift', remindKeys: due.map((d) => d.key),
      });
    }
  }

  // The watermark keeps moving while the switch is off, so switching it back on doesn't announce the backlog.
  if (p.push_new === false || !p.push_new_since) return { messages, newSince: now.toISOString() };
  const since = new Date(p.push_new_since).getTime();
  // Up to the run's start only: anything added while the run is going is tomorrow's news, not announced twice.
  const fresh = s.benefits.filter((b) => {
    const created = new Date(b.created_at).getTime();
    return b.user_id == null && mine(b) && created > since && created <= now.getTime();
  });
  if (!fresh.length) return { messages, newSince: null };
  messages.push({
    kind: 'new', title: `✨ ${count(fresh.length, 'הטבה חדשה', 'הטבות חדשות')} לכרטיסים שלך`,
    body: titles(fresh), url: '/benefits?recent=1', tag: 'new', remindKeys: [],
  });
  return { messages, newSince: now.toISOString() };
}

/** Several alerts on the same morning become one summary notification (one buzz, not three). */
export function bundle(messages: PushMessage[]): PushMessage[] {
  if (messages.length < 2) return messages;
  return [{
    kind: 'summary', parts: messages.map((m) => m.kind), title: 'ההטבות שלי', body: messages.map((m) => m.title).join(' · '),
    url: '/', tag: 'summary', remindKeys: messages.flatMap((m) => m.remindKeys),
  }];
}

/** Bookkeeping keys all end in ":<year>" or ":<year>-MM-DD"; earlier years can go (gift card keys end in a future expiry). */
export function pruneReminded(keys: string[], year: number): string[] {
  return keys.filter((k) => Number(/:(\d{4})(-\d\d-\d\d)?$/.exec(k)?.[1]) >= year);
}
