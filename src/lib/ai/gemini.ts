// Google retires old Flash models for new keys (2.5 is gone, the -latest alias hangs); override with GEMINI_MODEL.
const MODELS = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

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

/** POSTs to Gemini; the free tier often answers 503 "high demand", then the lighter model is tried once. */
export async function callGemini(
  method: 'generateContent' | 'streamGenerateContent?alt=sse',
  body: string,
  key: string,
  signal?: AbortSignal,
): Promise<Response | null> {
  let res: Response | null = null;
  for (const model of MODELS) {
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
