import type { Benefit } from './types';

export interface Savings {
  saved: number;
  spendMore: number; // > 0 when the minimum spend is not reached
  potential: number; // saving once the minimum spend is reached
}

type Priced = Pick<Benefit, 'type' | 'value' | 'min_spend' | 'max_discount'>;

const round = (n: number) => Math.round(n * 100) / 100;

function rawSaving(b: Priced, amount: number): number {
  const v = b.value ?? 0;
  const raw = b.type === 'fixed_off' ? v : (amount * v) / 100;
  return Math.min(raw, b.max_discount ?? Infinity, amount);
}

/** Purchase amount as typed. Commas are thousands separators in Israel ("1,200" = 1200). */
export function parseAmount(text: string): number | null {
  const n = Number(text.replace(/[,\s₪]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function computeSavings(b: Priced, amount: number): Savings {
  const min = b.min_spend ?? 0;
  if (amount < min) {
    return { saved: 0, spendMore: round(min - amount), potential: round(rawSaving(b, min)) };
  }
  const saved = round(rawSaving(b, amount));
  return { saved, spendMore: 0, potential: saved };
}
