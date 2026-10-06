import { describe, expect, it } from 'vitest';
import type { ExtractedBenefit, Extraction, NewStoreDraft } from '@/lib/core/review';
import { chunkText, mergeExtractions } from './chunks';

describe('chunkText', () => {
  it('keeps short text in one piece', () => {
    expect(chunkText('שלום', 100)).toEqual(['שלום']);
  });
  it('splits on line breaks without exceeding the size', () => {
    expect(chunkText('a\nb\nc', 3)).toEqual(['a\nb', 'c']);
  });
  it('hard-splits a single line longer than the size', () => {
    expect(chunkText('xxxxxxx', 3)).toEqual(['xxx', 'xxx', 'x']);
  });
});

describe('mergeExtractions', () => {
  const store = (name_he: string, name_en: string): NewStoreDraft => ({ name_he, name_en, aliases: [], category: 'fashion', channel: 'both' });
  const b = (o: Partial<ExtractedBenefit>) => ({ new_store_index: null, store_id: null, title: 't', ...o }) as ExtractedBenefit;

  it('re-numbers new-store indexes and merges the same new store across parts', () => {
    const parts: Extraction[] = [
      { new_stores: [store('קסטרו', 'Castro')], benefits: [b({ new_store_index: 0 })] },
      { new_stores: [store('גולף', 'Golf'), store('קסטרו', 'castro')], benefits: [b({ new_store_index: 0 }), b({ new_store_index: 1 }), b({ store_id: 's1' })] },
    ];
    const merged = mergeExtractions(parts);
    expect(merged.new_stores.map((s) => s.name_en)).toEqual(['Castro', 'Golf']);
    expect(merged.benefits.map((x) => x.new_store_index)).toEqual([0, 1, 0, null]);
    expect(merged.benefits[3].store_id).toBe('s1');
  });
});
