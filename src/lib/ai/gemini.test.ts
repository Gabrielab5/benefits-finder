import { describe, expect, it } from 'vitest';
import { deadline } from './gemini';

describe('deadline', () => {
  it('aborts after the time limit', async () => {
    const s = deadline(20);
    await new Promise((r) => setTimeout(r, 50));
    expect(s.aborted).toBe(true);
    expect((s.reason as DOMException).name).toBe('TimeoutError');
  });
  it('aborts at once when the request is cancelled', () => {
    const outer = new AbortController();
    const s = deadline(10_000, outer.signal);
    outer.abort();
    expect(s.aborted).toBe(true);
  });
});
