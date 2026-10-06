import type { Store } from './types';

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Lowercase, Hebrew final letters → regular, drop niqqud/accents/punctuation/spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common / (A.size + B.size - common);
}

function storeKeys(store: Store): string[] {
  return [store.name_he, store.name_en, ...store.aliases].map(normalize).filter(Boolean);
}

/** Prefix match beats substring match beats fuzzy (trigram) match. */
export function searchStores(stores: Store[], query: string, limit = 8): Store[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { store: Store; score: number }[] = [];
  for (const store of stores) {
    let score = 0;
    for (const key of storeKeys(store)) {
      if (key.startsWith(q)) score = Math.max(score, 3);
      else if (key.includes(q)) score = Math.max(score, 2);
      else if (q.length >= 3) {
        const sim = similarity(q, key);
        if (sim >= 0.3) score = Math.max(score, sim);
      }
    }
    if (score > 0) scored.push({ store, score });
  }
  scored.sort((a, b) => b.score - a.score || a.store.name_he.localeCompare(b.store.name_he, 'he'));
  return scored.slice(0, limit).map((s) => s.store);
}

/** Exact match on normalized Hebrew name, English name or alias. Used to avoid duplicate stores. */
export function findStoreByName(stores: Store[], name: string): Store | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  return stores.find((s) => storeKeys(s).includes(n));
}
