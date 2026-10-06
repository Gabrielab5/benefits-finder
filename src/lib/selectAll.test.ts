import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, selectAll } from './selectAll';

describe('selectAll', () => {
  it('loads every row past the 1000-row page limit', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const calls: [number, number][] = [];
    const result = await selectAll<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(result).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it('stops on an exact multiple of the page size', async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => i);
    const result = await selectAll<number>(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(result).toHaveLength(PAGE_SIZE);
  });
  it('throws the database error', async () => {
    await expect(selectAll(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });
});
