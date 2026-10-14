import { describe, expect, it } from 'vitest';
import { adminGuard, isShared, needsCatalogUpdate, productGroup, walletItemFromProduct } from './catalog';
import type { CardProduct, ProgramKind } from './types';

const product: CardProduct = { id: 'prod-max-histadrut', user_id: null, name: 'מקס של ביחד בשבילך', type: 'card', program_ids: ['max', 'histadrut'] };

describe('isShared', () => {
  it('treats rows without an owner as shared', () => {
    expect(isShared({ user_id: null })).toBe(true);
    expect(isShared({})).toBe(true);
    expect(isShared({ user_id: 'u1' })).toBe(false);
  });
});

describe('walletItemFromProduct', () => {
  it('copies the name, type and programs and remembers the product', () => {
    expect(walletItemFromProduct(product)).toEqual({ name: 'מקס של ביחד בשבילך', type: 'card', program_ids: ['max', 'histadrut'], product_id: 'prod-max-histadrut' });
  });
  it('does not share the programs list with the product', () => {
    const item = walletItemFromProduct(product);
    item.program_ids.push('x');
    expect(product.program_ids).toEqual(['max', 'histadrut']);
  });
});

describe('needsCatalogUpdate', () => {
  it('is false when the programs match in any order', () => {
    expect(needsCatalogUpdate({ product_id: product.id, program_ids: ['histadrut', 'max'] }, product)).toBe(false);
  });
  it('is true when the product gained or lost a program', () => {
    expect(needsCatalogUpdate({ product_id: product.id, program_ids: ['max'] }, product)).toBe(true);
  });
  it('is false for items from another product or without one', () => {
    expect(needsCatalogUpdate({ product_id: 'other', program_ids: [] }, product)).toBe(false);
    expect(needsCatalogUpdate({ product_id: product.id, program_ids: [] }, undefined)).toBe(false);
  });
});

describe('adminGuard', () => {
  it('refuses removing yourself', () => {
    expect(adminGuard('remove', 'me', 'me', ['me', 'other'])).toBe('self');
  });
  it('refuses removing or demoting the last admin', () => {
    expect(adminGuard('demote', 'me', 'me', ['me'])).toBe('last_admin');
    expect(adminGuard('remove', 'me', 'solo', ['solo'])).toBe('last_admin');
  });
  it('allows other changes', () => {
    expect(adminGuard('remove', 'me', 'friend', ['me'])).toBeNull();
    expect(adminGuard('demote', 'me', 'other', ['me', 'other'])).toBeNull();
  });
});

describe('productGroup', () => {
  const kinds: Record<string, ProgramKind> = { max: 'card_issuer', hever: 'club', rebar: 'store_club', castro: 'store_club' };
  const kindOf = (id: string) => kinds[id];
  const membership = (program_ids: string[]) => ({ type: 'membership' as const, program_ids });

  it('keeps credit cards together, whatever programs they unlock', () => {
    expect(productGroup({ type: 'card', program_ids: ['rebar'] }, kindOf)).toBe('card');
  });
  it('puts a membership whose programs are all store clubs under store clubs', () => {
    expect(productGroup(membership(['rebar', 'castro']), kindOf)).toBe('store_club');
  });
  it('treats any other membership as a club, including mixed or unknown programs', () => {
    expect(productGroup(membership(['hever']), kindOf)).toBe('club');
    expect(productGroup(membership(['hever', 'rebar']), kindOf)).toBe('club');
    expect(productGroup(membership(['gone']), kindOf)).toBe('club');
    expect(productGroup(membership([]), kindOf)).toBe('club');
  });
});
