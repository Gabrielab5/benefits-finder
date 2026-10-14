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

// "על (ה)משקה", "מוצר אחד", "one drink": the item word must stand alone (not "מוצרים", "מוצרי", "על כל מוצר").
const HE = '(?:משקה|קערה|מנה|כוס|פריט|קפה|מוצר)';
const NOT_HE = '(?![\\u05D0-\\u05EA])';
const PER_ITEM = [
  new RegExp(`(?:^|[^\\u05D0-\\u05EA])על\\s+ה?${HE}${NOT_HE}`),
  new RegExp(`${HE}\\s+(?:אחד|אחת|בודד|בודדת)${NOT_HE}`),
  /\b(?:one|a|single|any)\s+(?:item|drink|bowl|product|coffee|dish|cup)\b/i,
];

/**
 * A percent benefit that covers one item (a drink, a bowl), not the whole purchase: no honest ₪ for a basket.
 * ponytail: keyword heuristic over title/description/conditions, calibrated on the catalog (10/2026); it misses
 * unusual wording and partial baskets ("10 מוצרים לבחירה"). Upgrade: an `applies_to` column set at import.
 */
export function isPerItem(b: Pick<Benefit, 'type'> & Partial<Pick<Benefit, 'title' | 'description' | 'conditions'>>): boolean {
  if (b.type !== 'percent_off' && b.type !== 'cashback_percent') return false;
  const text = [b.title, b.description, b.conditions].filter(Boolean).join(' \n ');
  return PER_ITEM.some((re) => re.test(text));
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
