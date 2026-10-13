import { afterEach, describe, expect, it, vi } from 'vitest';
import { deadline, raceGemini } from './gemini';

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

describe('raceGemini', () => {
  const answer = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  const hang = (init?: RequestInit) => new Promise<Response>((_, reject) =>
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
  const parse = (json: unknown) => {
    const text = (json as { candidates: { content: { parts: { text: string }[] } }[] }).candidates[0].content.parts[0].text;
    if (text === 'bad') throw new Error('bad answer');
    return text;
  };
  const stubFetch = (byModel: Record<string, (init?: RequestInit) => Promise<Response>>) => {
    const aborted: string[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      const model = Object.keys(byModel).find((m) => url.includes(`/${m}:`))!;
      init?.signal?.addEventListener('abort', () => aborted.push(model));
      return byModel[model](init);
    });
    return aborted;
  };
  afterEach(() => vi.unstubAllGlobals());

  it('takes the first good answer and cancels the model still running (the production hang)', async () => {
    const aborted = stubFetch({ slow: hang, quick: async () => answer('from quick') });
    const started = Date.now();
    const r = await raceGemini('{}', 'k', parse, ['slow', 'quick'], 5_000);
    expect(r).toEqual({ ok: true, value: 'from quick', model: 'quick' });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(aborted).toEqual(['slow']);
  });
  it('skips a malformed or busy answer and uses the other model', async () => {
    stubFetch({ a: async () => answer('bad'), b: async () => new Response('busy', { status: 503 }), c: async () => answer('ok') });
    expect(await raceGemini('{}', 'k', parse, ['a', 'b', 'c'])).toMatchObject({ ok: true, value: 'ok' });
  });
  it('asks a busy model again after a pause instead of giving up', async () => {
    let calls = 0;
    stubFetch({ a: async () => (++calls < 3 ? new Response('busy', { status: 503 }) : answer('third time')) });
    expect(await raceGemini('{}', 'k', parse, ['a'], 10_000)).toMatchObject({ ok: true, value: 'third time' });
    expect(calls).toBe(3);
  });
  it('fails with the status when no model answers (rate limit wins) and stops waiting at the deadline', async () => {
    stubFetch({ a: async () => new Response('', { status: 503 }), b: async () => new Response('', { status: 429 }) });
    expect(await raceGemini('{}', 'k', parse, ['a', 'b'], 1_500)).toEqual({ ok: false, status: 429 });
    stubFetch({ a: hang });
    expect(await raceGemini('{}', 'k', parse, ['a'], 30)).toEqual({ ok: false, status: null });
  });
});
