// Google retires old Flash models for new keys (2.5 is gone, the -latest alias hangs); override with GEMINI_MODEL.
const MAIN = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const LITE = 'gemini-3.5-flash-lite';
/** Chat: the stronger model first. */
export const SMART = [MAIN, LITE];
/**
 * Simple extraction, raced (see raceGemini). Measured 13.10.2026 under free-tier "high demand": every model answered
 * 503 some of the time; the two lite models were the ones that got through, the 2.5 models are 404 for this key.
 */
export const FAST = [LITE, 'gemini-3.1-flash-lite', MAIN];
const RETRY_PAUSE_MS = [1_000, 2_000, 4_000, 6_000]; // then 6 s between tries until the deadline

const endpoint = (model: string, method: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`;
const why = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

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
    const started = Date.now();
    res = await fetch(endpoint(model, method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
      signal: deadline(25_000, signal), // two tries fit in 60 s; also bounds reading the body
    }).catch((e) => {
      console.error('gemini failed', model, why(e), `${Date.now() - started} ms`);
      return null;
    });
    if (res?.ok) break;
    if (res) console.error('gemini failed', model, res.status, `${Date.now() - started} ms`, await res.text().catch(() => ''));
  }
  return res;
}

export type RaceResult<T> = { ok: true; value: T; model: string } | { ok: false; status: number | null };

/**
 * Asks every model at once and keeps the first answer that `parse` accepts; the others are cancelled.
 * A model that answers "busy" (5xx) is asked again after a short pause until the deadline: under free-tier load
 * one try often fails in seconds while a retry gets through. `parse` throws to reject an answer.
 */
export async function raceGemini<T>(
  body: string,
  key: string,
  parse: (json: unknown) => T,
  models = FAST,
  ms = 50_000,
): Promise<RaceResult<T>> {
  const ctrls = models.map(() => new AbortController());
  const timer = setTimeout(() => ctrls.forEach((c) => c.abort(new DOMException('Gemini took too long', 'TimeoutError'))), ms);
  let status: number | null = null;
  try {
    const end = Date.now() + ms;
    return await Promise.any(models.map(async (model, i) => {
      const signal = ctrls[i].signal;
      for (let attempt = 0; ; attempt++) {
        const started = Date.now();
        try {
          const res = await fetch(endpoint(model, 'generateContent'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body,
            signal,
          });
          if (!res.ok) {
            status = status === 429 ? 429 : res.status; // keep "rate limited" if any model said so
            const err = new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
            if (res.status < 500) throw Object.assign(err, { final: true }); // 4xx: asking again won't help
            throw err;
          }
          const value = parse(await res.json());
          ctrls.forEach((c, j) => j !== i && c.abort()); // the winner is in; stop the rest
          return { ok: true as const, value, model };
        } catch (e) {
          if (signal.aborted && Date.now() < end) throw e; // another model won: stay quiet
          console.error('gemini failed', model, `try ${attempt + 1}`, why(e), `${Date.now() - started} ms`);
          const pause = RETRY_PAUSE_MS[Math.min(attempt, RETRY_PAUSE_MS.length - 1)];
          if ((e as { final?: boolean }).final || signal.aborted || Date.now() + pause >= end) throw e;
          await new Promise((r) => setTimeout(r, pause));
          if (signal.aborted) throw e;
        }
      }
    }));
  } catch {
    return { ok: false, status };
  } finally {
    clearTimeout(timer);
  }
}
