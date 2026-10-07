import { describe, expect, it } from 'vitest';
import { normalize, searchStores } from './core/normalize';
import { CATEGORIES, type Store } from './core/types';
import { SEED_STORES } from './seedStores';

const asStores: Store[] = SEED_STORES.map((s, i) => ({ id: `s${i}`, ...s }));

describe('SEED_STORES', () => {
  it('has well over 150 stores, each with both names and a valid category', () => {
    expect(SEED_STORES.length).toBeGreaterThan(150);
    for (const s of SEED_STORES) {
      expect(s.name_he.trim(), JSON.stringify(s)).not.toBe('');
      expect(s.name_en.trim(), JSON.stringify(s)).not.toBe('');
      expect(CATEGORIES).toContain(s.category);
    }
  });
  it('never uses the same name or alias for two stores', () => {
    const seen = new Map<string, string>();
    for (const s of SEED_STORES) {
      for (const key of new Set([s.name_he, s.name_en, ...s.aliases].map(normalize))) {
        expect(seen.get(key), `"${key}" used by ${seen.get(key)} and ${s.name_en}`).toBeUndefined();
        seen.set(key, s.name_en);
      }
    }
  });
  it.each([['סופרפארם', 'Super-Pharm'], ['zara', 'Zara'], ['מקדונלדס', "McDonald's"], ['ikea', 'IKEA'], ['yellow', 'Paz']])(
    '"%s" finds %s',
    (q, en) => {
      expect(searchStores(asStores, q)[0]?.name_en).toBe(en);
    },
  );
});
