import { normalize } from '@/lib/core/normalize';
import type { Extraction, NewStoreDraft } from '@/lib/core/review';

/** Splits long page text on line breaks into pieces of at most `size` characters. */
export function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    for (let i = 0; i < Math.max(line.length, 1); i += size) {
      const piece = line.slice(i, i + size);
      if (current && current.length + 1 + piece.length > size) {
        chunks.push(current);
        current = piece;
      } else current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const storeKeys = (s: NewStoreDraft) => [normalize(s.name_he), normalize(s.name_en)].filter(Boolean);

/** Joins per-chunk extractions: one new_stores list (same store merged), indexes re-numbered. */
export function mergeExtractions(parts: Extraction[]): Extraction {
  const merged: Extraction = { new_stores: [], benefits: [] };
  for (const part of parts) {
    const remap = part.new_stores.map((s) => {
      const keys = storeKeys(s);
      const found = merged.new_stores.findIndex((m) => storeKeys(m).some((k) => keys.includes(k)));
      if (found >= 0) return found;
      merged.new_stores.push(s);
      return merged.new_stores.length - 1;
    });
    for (const b of part.benefits) {
      merged.benefits.push({ ...b, new_store_index: b.new_store_index != null ? remap[b.new_store_index] ?? null : null });
    }
  }
  return merged;
}
