import { describe, expect, it } from 'vitest';
import { buildChatContext, cleanHistory } from './chat';
import type { Snapshot } from '@/lib/core/types';

const benefit = (id: string, program_id: string, valid_until: string | null) => ({
  id, program_id, store_id: 's1', category: null, title: `t-${id}`, description: null, type: 'percent_off' as const,
  value: 10, min_spend: null, max_discount: null, requires: 'membership' as const, coupon_code: null, channel: 'both' as const,
  timing: 'always' as const, valid_from: null, valid_until, conditions: null, source_url: null,
  last_verified_at: '', status: 'active' as const, created_at: '',
});

describe('chat', () => {
  it('lists only current benefits the wallet unlocks', () => {
    const snap: Snapshot = {
      profile: null, fetchedAt: '',
      programs: [{ id: 'p1', name: 'מועדון', kind: 'club', logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never' }],
      wallet: [{ id: 'w', name: 'חבר', type: 'membership', last4: null, nickname: null, color: null, program_ids: ['p1'], created_at: '' }],
      stores: [{ id: 's1', name_he: 'שופרסל', name_en: 'Shufersal', aliases: [], category: 'food', channel: 'both' }],
      benefits: [benefit('a', 'p1', null), benefit('b', 'p2', null), benefit('c', 'p1', '2020-01-01')],
    };
    const ctx = buildChatContext(snap, '2026-10-12');
    expect(ctx).toContain('t-a');
    expect(ctx).toContain('שופרסל');
    expect(ctx).not.toContain('t-b');
    expect(ctx).not.toContain('t-c');
  });

  it('cleans history: drops junk, starts and ends with user', () => {
    expect(cleanHistory('x')).toBeNull();
    expect(cleanHistory([{ role: 'assistant', content: 'hi' }])).toBeNull();
    expect(cleanHistory([{ role: 'assistant', content: 'a' }, { role: 'system', content: 'x' }, { role: 'user', content: 'q' }]))
      .toEqual([{ role: 'user', content: 'q' }]);
  });
});
