import { availability, type IsraelDay } from './dates';
import { computeSavings, type Savings } from './savings';
import { COMPUTABLE_TYPES, type Benefit, type Program, type Snapshot, type Store, type WalletItem } from './types';

export interface Row {
  benefit: Benefit;
  program: Program;
  items: WalletItem[]; // wallet items to pay with / show
  savings: Savings | null; // null when not computable or no amount entered
  birthdayLocked: boolean;
}

export interface RankResult {
  pay: Row[]; // pay with card, ₪ computable
  other: Row[]; // pay with card, not computable (1+1, gift, installments, points…)
  show: Row[]; // show membership / enter coupon code
}

export function appliesToStore(b: Benefit, store: Store): boolean {
  if (b.store_id) return b.store_id === store.id;
  if (b.category) return b.category === store.category;
  return true; // general benefit
}

export function eligibleItems(b: Benefit, wallet: WalletItem[]): WalletItem[] {
  return wallet.filter(
    (w) => w.program_ids.includes(b.program_id) && (b.requires !== 'pay_with_card' || w.type === 'card'),
  );
}

const OTHER_ORDER = ['bogo', 'gift', 'installments', 'points', 'other'];

/** [group, value]: percent types first by value, then fixed by value, then the rest grouped by type. */
function headline(b: Benefit): [number, number] {
  if (b.type === 'percent_off' || b.type === 'cashback_percent') return [0, b.value ?? 0];
  if (b.type === 'fixed_off') return [1, b.value ?? 0];
  return [2 + OTHER_ORDER.indexOf(b.type), 0];
}

function compareRows(a: Row, b: Row): number {
  if (a.birthdayLocked !== b.birthdayLocked) return a.birthdayLocked ? 1 : -1;
  if (a.savings && b.savings) {
    return b.savings.saved - a.savings.saved || (a.benefit.min_spend ?? 0) - (b.benefit.min_spend ?? 0);
  }
  if (a.savings || b.savings) return a.savings ? -1 : 1;
  const [ga, va] = headline(a.benefit);
  const [gb, vb] = headline(b.benefit);
  return ga - gb || vb - va;
}

export function rankForStore(
  snapshot: Snapshot,
  store: Store,
  amount: number | null,
  today: IsraelDay,
  channel?: 'in_store' | 'online',
): RankResult {
  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));
  const birthMonth = snapshot.profile?.birth_month ?? null;
  const result: RankResult = { pay: [], other: [], show: [] };

  for (const benefit of snapshot.benefits) {
    if (!appliesToStore(benefit, store)) continue;
    if (channel && benefit.channel !== 'both' && benefit.channel !== channel) continue;
    const avail = availability(benefit, birthMonth, today);
    if (avail === 'unavailable') continue;
    const program = programs.get(benefit.program_id);
    if (!program) continue;
    const items = eligibleItems(benefit, snapshot.wallet);
    if (items.length === 0) continue;

    const computable = COMPUTABLE_TYPES.includes(benefit.type);
    const row: Row = {
      benefit,
      program,
      items,
      savings: computable && amount != null && amount > 0 ? computeSavings(benefit, amount) : null,
      birthdayLocked: avail === 'birthday_locked',
    };
    if (benefit.requires !== 'pay_with_card') result.show.push(row);
    else if (computable) result.pay.push(row);
    else result.other.push(row);
  }

  result.pay.sort(compareRows);
  result.other.sort(compareRows);
  result.show.sort(compareRows);
  return result;
}

export function birthdayBenefits(snapshot: Snapshot, today: IsraelDay): Benefit[] {
  const birthMonth = snapshot.profile?.birth_month ?? null;
  return snapshot.benefits.filter(
    (b) =>
      b.timing === 'birthday_month' &&
      availability(b, birthMonth, today) === 'available' &&
      eligibleItems(b, snapshot.wallet).length > 0,
  );
}

/** The single best ₪ saving for the entered amount, across "pay with" and "show" benefits; null without an amount. */
export function bestRowId(result: RankResult): string | null {
  let best: Row | null = null;
  for (const row of [...result.pay, ...result.show]) {
    if (row.birthdayLocked || !row.savings || row.savings.spendMore > 0 || row.savings.saved <= 0) continue;
    if (!best || row.savings.saved > best.savings!.saved) best = row;
  }
  return best?.benefit.id ?? null;
}
