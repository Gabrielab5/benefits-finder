import { describe, expect, it } from 'vitest';
import { findStoreByName, normalize, searchStores } from './normalize';
import type { Store } from './types';

const store = (id: string, name_he: string, name_en: string, aliases: string[] = []): Store => ({
  id, name_he, name_en, aliases, category: 'other', channel: 'both',
});
const mango = store('mango', 'מנגו', 'Mango');
const mcd = store('mcd', 'מקדונלדס', "McDonald's");
const shufersal = store('shufersal', 'שופרסל', 'Shufersal', ['שופרסל דיל']);
const stores = [mango, mcd, shufersal];

describe('normalize', () => {
  it('lowercases and removes spaces and punctuation', () => {
    expect(normalize(" McDonald's ")).toBe('mcdonalds');
  });
  it('turns Hebrew final letters into regular letters', () => {
    expect(normalize('שלום')).toBe('שלומ');
  });
  it('removes niqqud, geresh and gershayim', () => {
    expect(normalize('שָׁלוֹם')).toBe('שלומ');
    expect(normalize('מקדונלד׳ס')).toBe('מקדונלדס');
    expect(normalize('צה״ל')).toBe('צהל');
  });
});

describe('searchStores', () => {
  it.each(['Mango', 'mango', 'MANGO', 'מנגו', 'מנג'])('"%s" finds Mango first', (q) => {
    expect(searchStores(stores, q)[0]?.id).toBe('mango');
  });
  it.each(['מקדונלדס', "מקדונלד'ס", 'מקדונלד׳ס', 'מק דונלדס', "McDonald's", 'mcdonalds', 'McDonalds'])(
    '"%s" finds McDonald\'s first',
    (q) => {
      expect(searchStores(stores, q)[0]?.id).toBe('mcd');
    },
  );
  it('matches aliases', () => {
    expect(searchStores(stores, 'דיל')[0]?.id).toBe('shufersal');
  });
  it('tolerates a small typo', () => {
    expect(searchStores(stores, 'מקדונלס')[0]?.id).toBe('mcd');
  });
  it('returns nothing for an empty query', () => {
    expect(searchStores(stores, '  ')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(searchStores(stores, 'ו', 1)).toHaveLength(1);
  });
});

describe('findStoreByName', () => {
  it('finds a store by exact normalized Hebrew or English name', () => {
    expect(findStoreByName(stores, 'mcdonalds')?.id).toBe('mcd');
    expect(findStoreByName(stores, 'מנגו')?.id).toBe('mango');
  });
  it('does not match partial names', () => {
    expect(findStoreByName(stores, 'Mang')).toBeUndefined();
  });
});
