// Google retires old Flash models for new keys (2.5 is gone, the -latest alias hangs); override with GEMINI_MODEL.
const MAIN = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const LITE = 'gemini-3.5-flash-lite';
/** Chat: the stronger model first. */
export const SMART = [MAIN, LITE];
/** Simple extraction: the light model answers in ~2 s while the free-tier main model is often busy (503 / hangs). */
export const FAST = [LITE, MAIN];

/**
 * Aborts after `ms` or when `outer` aborts. Not AbortSignal.any([AbortSignal.timeout(ms)]): Node can garbage-collect
 * that timeout before it fires (fetch only holds the signal weakly), so a slow answer hung for minutes.
 * The pending setTimeout keeps this controller alive.
 */
export function deadline(ms: number, outer?: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new DOMException('Gemini took too long', 'TimeoutError')), ms);
  outer?.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
  return ctrl.signal;
}

/** POSTs to Gemini, trying `models` in order: the free tier often answers 503 "high demand" or hangs. */
export async function callGemini(
  method: 'generateContent' | 'streamGenerateContent?alt=sse',
  body: string,
  key: string,
  signal?: AbortSignal,
  models = SMART,
): Promise<Response | null> {
  let res: Response | null = null;
  for (const model of models) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
      signal: deadline(25_000, signal), // two tries fit in 60 s; also bounds reading the body
    }).catch(() => null);
    if (res?.ok) break;
    console.error('gemini failed', model, res?.status, await res?.text().catch(() => ''));
  }
  return res;
}
