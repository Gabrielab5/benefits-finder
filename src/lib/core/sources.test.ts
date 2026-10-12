import { describe, expect, it } from 'vitest';
import { listSources, type SourceFilters } from './sources';
import type { Benefit, Program, Snapshot } from './types';

const program = (id: string, name: string, kind: Program['kind'], last_refreshed_at: string | null = null): Program =>
  ({ id, name, kind, logo_url: null, benefits_url: null, last_refreshed_at, last_refresh_status: 'never' });
let n = 0;
const benefit = (program_id: string, o: Partial<Benefit>): Benefit => ({
  id: `b${++n}`, program_id, store_id: null, category: null, title: 'הנחה', description: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'membership',
  coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '', status: 'active', created_at: '', ...o,
});

const snapshot: Snapshot = {
  profile: null, wallet: [], fetchedAt: '',
  programs: [
    program('ramilevy', 'רמי לוי', 'store_club', '2026-10-01'),
    program('castro', 'קסטרו', 'store_club', '2026-10-09'),
    program('paz', 'פז Yellow', 'store_club'),
    program('cal', 'כאל', 'card_issuer'),
  ],
  stores: [
    { id: 'rl', name_he: 'רמי לוי', name_en: 'Rami Levy', aliases: [], category: 'food', channel: 'both' },
    { id: 'ca', name_he: 'קסטרו', name_en: 'Castro', aliases: [], category: 'fashion', channel: 'both' },
  ],
  benefits: [
    benefit('ramilevy', { store_id: 'rl' }),
    benefit('castro', { store_id: 'ca' }),
    benefit('castro', { store_id: 'ca' }),
    benefit('castro', { category: 'food' }),
    benefit('castro', { store_id: 'ca', status: 'not_seen' }),
    benefit('paz', { category: 'fuel' }),
  ],
};
const names = (f: Partial<SourceFilters>) =>
  listSources(snapshot, { kind: 'store_club', query: '', category: null, sort: 'name', ...f }).map((r) => r.program.name);

describe('listSources', () => {
  it('keeps one kind, sorted by name', () => {
    expect(names({})).toEqual(['פז Yellow', 'קסטרו', 'רמי לוי']);
    expect(names({ kind: 'card_issuer' })).toEqual(['כאל']);
  });
  it('searches by name, ignoring final letters and spaces', () => {
    expect(names({ query: 'רמילו' })).toEqual(['רמי לוי']);
  });
  it('filters by the category most active benefits are in', () => {
    expect(names({ category: 'food' })).toEqual(['רמי לוי']);
    expect(names({ category: 'fashion' })).toEqual(['קסטרו']);
  });
  it('sorts by active benefit count or last update', () => {
    expect(names({ sort: 'benefits' })).toEqual(['קסטרו', 'פז Yellow', 'רמי לוי']);
    expect(names({ sort: 'updated' })).toEqual(['קסטרו', 'רמי לוי', 'פז Yellow']);
  });
});
