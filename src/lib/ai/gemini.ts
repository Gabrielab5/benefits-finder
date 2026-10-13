// Google retires old Flash models for new keys (2.5 is gone, the -latest alias hangs); override with GEMINI_MODEL.
const MODELS = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

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
      signal: AbortSignal.any([AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]), // two tries fit in 60 s
    }).catch(() => null);
    if (res?.ok) break;
    console.error('gemini failed', model, res?.status, await res?.text().catch(() => ''));
  }
  return res;
}
