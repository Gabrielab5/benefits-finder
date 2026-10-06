import { describe, expect, it } from 'vitest';
import { buildWalletItems, type SeedProgram } from './seedPrograms';

describe('buildWalletItems', () => {
  const cal: SeedProgram = { key: 'cal', name: 'כאל', kind: 'card_issuer' };
  const dream: SeedProgram = { key: 'dream', name: 'דרים קארד', kind: 'store_club' };
  const hever: SeedProgram = { key: 'hever', name: 'חבר', kind: 'club' };
  const idOf = (p: SeedProgram) => `id-${p.key}`;

  it('lets a credit card unlock both clubs and store clubs it is linked to', () => {
    const items = buildWalletItems([cal, dream, hever], { cal: ['dream', 'hever'] }, idOf);
    expect(items).toEqual([
      { name: 'כאל', type: 'card', program_ids: ['id-cal', 'id-dream', 'id-hever'] },
      { name: 'דרים קארד', type: 'membership', program_ids: ['id-dream'] },
      { name: 'חבר', type: 'membership', program_ids: ['id-hever'] },
    ]);
  });
});
