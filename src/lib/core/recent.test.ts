import { describe, expect, it } from 'vitest';
import { addRecent } from './recent';

describe('addRecent', () => {
  it('puts the picked store first', () => {
    expect(addRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('moves a store picked again to the front instead of listing it twice', () => {
    expect(addRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('keeps at most five, dropping the oldest', () => {
    expect(addRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });

  it('starts a list from nothing', () => {
    expect(addRecent([], 'a')).toEqual(['a']);
  });
});
