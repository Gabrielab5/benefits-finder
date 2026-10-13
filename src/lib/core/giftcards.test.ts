import { describe, expect, it } from 'vitest';
import { giftCardPlan, usableGiftCards } from './giftcards';
import type { Benefit, GiftCard, Snapshot, Store } from './types';

const TODAY = { iso: '2026-10-13', year: 2026, month: 10 };
const mango: Store = { id: 'mango', name_he: 'מנגו', name_en: 'Mango', aliases: [], category: 'fashion', channel: 'both' };

const gift = (o: Partial<GiftCard>): GiftCard => ({
  id: 'g', name: 'g', amount: 200, balance: 200, received_on: null, expires_on: null, code: null, link: null,
  any_store: false, store_ids: ['mango'], stores_url: null, notes: null, created_at: '2026-01-01T00:00:00Z', ...o,
});
const benefit = (o: Partial<Benefit>): Benefit => ({
  id: 'b', program_id: 'cal', store_id: 'mango', category: null, title: 't', description: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'pay_with_card',
  coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '2026-10-01T00:00:00Z', status: 'active', created_at: '2026-10-01T00:00:00Z', ...o,
});
const snap = (giftCards: GiftCard[], benefits: Benefit[]): Snapshot => ({
  profile: null, stores: [mango], benefits, giftCards, fetchedAt: '',
  programs: [{ id: 'cal', name: 'cal', kind: 'card_issuer', logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never' }],
  wallet: [{ id: 'w', name: 'cal', type: 'card', last4: null, nickname: null, color: null, program_ids: ['cal'], created_at: '' }],
});

describe('usableGiftCards', () => {
  it('keeps cards with money left that this store accepts, soonest-expiring first', () => {
    const cards = [
      gift({ id: 'late', expires_on: '2027-05-01' }),
      gift({ id: 'soon', expires_on: '2026-11-01' }),
      gift({ id: 'never' }),
      gift({ id: 'expired', expires_on: '2026-10-12' }),
      gift({ id: 'empty', balance: 0 }),
      gift({ id: 'elsewhere', store_ids: ['castro'] }),
      gift({ id: 'anywhere', store_ids: [], any_store: true, expires_on: '2026-12-01' }),
    ];
    expect(usableGiftCards(cards, mango, TODAY.iso).map((c) => c.id)).toEqual(['soon', 'anywhere', 'late', 'never']);
  });
});

describe('giftCardPlan', () => {
  it('pays price − gift card − membership discount, the discount on the full price', () => {
    const club = benefit({ requires: 'membership', value: 10 }); // 10% of 500 = 50
    const p = giftCardPlan(snap([gift({ balance: 200 })], [club]), mango, 500, TODAY)!;
    expect(p.uses.map((u) => u.amount)).toEqual([200]);
    expect(p.discount?.saved).toBe(50);
    expect(p.pay).toBe(250);
  });
  it('applies a pay-with-card discount only to what the card pays', () => {
    const card = benefit({ value: 20 }); // 20% of the 300 left = 60
    const p = giftCardPlan(snap([gift({ balance: 200 })], [card]), mango, 500, TODAY)!;
    expect(p.discount?.saved).toBe(60);
    expect(p.pay).toBe(240);
  });
  it('splits across several cards and never charges below zero', () => {
    const p = giftCardPlan(snap([gift({ id: 'a', balance: 50 }), gift({ id: 'b', balance: 100, expires_on: '2026-12-01' })], []), mango, 120, TODAY)!;
    expect(p.uses.map((u) => [u.card.id, u.amount])).toEqual([['b', 100], ['a', 20]]);
    expect(p.pay).toBe(0);
  });
  it('is null without a usable gift card', () => {
    expect(giftCardPlan(snap([gift({ store_ids: ['castro'] })], []), mango, 100, TODAY)).toBeNull();
  });
});
