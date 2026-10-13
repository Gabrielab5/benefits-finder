import type { IsraelDay } from './dates';
import { rankForStore, type Row } from './rank';
import type { GiftCard, Snapshot, Store } from './types';

export interface GiftUse {
  card: GiftCard;
  amount: number;
}

export interface GiftPlan {
  uses: GiftUse[]; // which gift cards to use, and how much from each
  discount: { row: Row; saved: number } | null; // the best discount that still applies
  pay: number; // left to pay = price − gift cards − discount
}

const round = (n: number) => Math.round(n * 100) / 100;
const used = (uses: GiftUse[]) => round(uses.reduce((s, u) => s + u.amount, 0));

/** Gift cards with money left that this store accepts, soonest-expiring first (use those before they're lost). */
export function usableGiftCards(cards: GiftCard[], store: Store, todayIso: string): GiftCard[] {
  return cards
    .filter((c) => c.balance > 0 && (!c.expires_on || c.expires_on >= todayIso) && (c.any_store || c.store_ids.includes(store.id)))
    .sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999') || a.balance - b.balance);
}

function cover(cards: GiftCard[], amount: number): GiftUse[] {
  const uses: GiftUse[] = [];
  for (const card of cards) {
    if (amount <= 0) break;
    const take = round(Math.min(card.balance, amount));
    uses.push({ card, amount: take });
    amount = round(amount - take);
  }
  return uses;
}

function best(rows: Row[]): GiftPlan['discount'] {
  let top: GiftPlan['discount'] = null;
  for (const row of rows) {
    const s = row.savings;
    if (row.dateLocked || !s || s.spendMore > 0 || s.saved <= 0) continue;
    if (!top || s.saved > top.saved) top = { row, saved: s.saved };
  }
  return top;
}

/**
 * How to pay `price` at `store` with the user's gift cards plus their best discount.
 * A membership / coupon discount stacks with a gift card on the full price; a pay-with-card discount
 * only applies to what is left for the card to pay. Picks whichever saves more. Null = no usable gift card.
 */
export function giftCardPlan(snap: Snapshot, store: Store, price: number, today: IsraelDay): GiftPlan | null {
  const cards = usableGiftCards(snap.giftCards ?? [], store, today.iso);
  if (cards.length === 0 || price <= 0) return null;

  const show = best(rankForStore(snap, store, price, today).show);
  const due = round(price - (show?.saved ?? 0));
  const showUses = cover(cards, due);
  const withShow: GiftPlan = { uses: showUses, discount: show, pay: round(due - used(showUses)) };

  const payUses = cover(cards, price);
  const rest = round(price - used(payUses));
  const card = rest > 0 ? best(rankForStore(snap, store, rest, today).pay) : null;
  const withCard: GiftPlan = { uses: payUses, discount: card, pay: round(rest - (card?.saved ?? 0)) };

  return (card?.saved ?? 0) > (show?.saved ?? 0) ? withCard : withShow;
}

export interface GiftCardPreset {
  name: string;
  anyStore?: boolean; // prepaid credit card: works anywhere
  stores?: string[]; // catalog store names (he or en); none = many brands, the user picks / searches
}

/** Popular Israeli gift cards. Multi-brand ones change their store lists often, so we link to a search instead. */
export const GIFT_CARD_PRESETS: GiftCardPreset[] = [
  { name: 'BuyMe' },
  { name: 'תו הזהב' },
  { name: 'תו פלוס' },
  { name: 'נופשונית' },
  { name: 'דרים קארד' },
  { name: 'Max Gift Card', anyStore: true },
  { name: 'כרטיס מתנה נטען (ויזה / מאסטרקארד)', anyStore: true },
  { name: 'שופרסל', stores: ['Shufersal'] },
  { name: 'רמי לוי', stores: ['Rami Levy'] },
  { name: 'סופר-פארם', stores: ['Super-Pharm'] },
  { name: 'קבוצת פוקס', stores: ['Fox', 'Fox Home', 'Laline', 'American Eagle', 'Mango', 'Foot Locker', 'Terminal X'] },
  { name: 'איקאה', stores: ['IKEA'] },
  { name: 'קסטרו', stores: ['Castro'] },
];

/** Google search for the businesses that accept a gift card. */
export const storesSearchUrl = (name: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${name} גיפט קארד רשימת בתי עסק מכבדים`)}`;
