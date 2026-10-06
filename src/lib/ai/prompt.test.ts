import { describe, expect, it } from 'vitest';
import { buildContext } from './prompt';

describe('buildContext', () => {
  it('lists known stores with ids, both names and aliases', () => {
    const ctx = buildContext('חבר', [
      { id: 's1', name_he: 'מנגו', name_en: 'Mango', aliases: ['מנגו קידס'], category: 'fashion', channel: 'both' },
    ], '2026-10-06');
    expect(ctx).toContain('Program: חבר');
    expect(ctx).toContain('Today: 2026-10-06');
    expect(ctx).toContain('s1 | מנגו | Mango | מנגו קידס | fashion');
  });
  it('says when there are no stores yet', () => {
    expect(buildContext('חבר', [], '2026-10-06')).toContain('(none yet)');
  });
});
