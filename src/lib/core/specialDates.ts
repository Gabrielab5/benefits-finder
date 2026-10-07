import { availability, datesOf, type IsraelDay } from './dates';
import { eligibleItems } from './rank';
import type { Benefit, Profile, Snapshot, Timing, WalletItem } from './types';

export interface DateWindow {
  key: string; // stable id used for "already reminded" bookkeeping
  kind: 'birthday' | 'anniversary' | 'child';
  label: string;
  month: number;
}

const TIMING_OF: Record<DateWindow['kind'], Timing> = {
  birthday: 'birthday_month',
  anniversary: 'anniversary_month',
  child: 'child_birthday_month',
};

/** Your birthday, each club that has a different birthday on file, your anniversary, and each child. */
export function dateWindows(profile: Profile | null, wallet: WalletItem[]): DateWindow[] {
  const windows: DateWindow[] = [];
  if (profile?.birth_month) windows.push({ key: 'birthday', kind: 'birthday', label: 'יום ההולדת שלך', month: profile.birth_month });
  for (const item of wallet) {
    if (item.birthday_month && item.birthday_month !== profile?.birth_month) {
      windows.push({ key: `birthday:${item.id}`, kind: 'birthday', label: `יום ההולדת שלך ב${item.nickname || item.name}`, month: item.birthday_month });
    }
  }
  if (profile?.anniversary_month) windows.push({ key: 'anniversary', kind: 'anniversary', label: 'יום הנישואין', month: profile.anniversary_month });
  for (const child of profile?.children ?? []) {
    windows.push({ key: `child:${child.name}`, kind: 'child', label: `יום ההולדת של ${child.name}`, month: child.birth_month });
  }
  return windows;
}

/** Windows open this month with the benefits each one unlocks right now. */
export function activeDateBenefits(snapshot: Snapshot, today: IsraelDay): { window: DateWindow; benefits: Benefit[] }[] {
  const dates = datesOf(snapshot.profile);
  const out: { window: DateWindow; benefits: Benefit[] }[] = [];
  for (const window of dateWindows(snapshot.profile, snapshot.wallet)) {
    if (window.month !== today.month) continue;
    const benefits = snapshot.benefits.filter((b) => {
      if (b.timing !== TIMING_OF[window.kind]) return false;
      let items = eligibleItems(b, snapshot.wallet);
      if (window.kind === 'birthday') {
        items = window.key === 'birthday'
          ? items.filter((i) => !i.birthday_month || i.birthday_month === window.month)
          : items.filter((i) => `birthday:${i.id}` === window.key);
      }
      return items.some((i) => availability(b, dates, today, i.birthday_month) === 'available');
    });
    if (benefits.length) out.push({ window, benefits });
  }
  return out;
}
