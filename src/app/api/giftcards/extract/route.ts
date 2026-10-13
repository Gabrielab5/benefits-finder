import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callGemini } from '@/lib/ai/gemini';
import { israelToday } from '@/lib/core/dates';
import { findStoreByName } from '@/lib/core/normalize';
import type { Store } from '@/lib/core/types';
import { fetchPageText } from '@/lib/fetchPage';
import { selectAll } from '@/lib/selectAll';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE = 6_000_000; // base64 chars (~4.5 MB, the request body limit)
const fail = (error: string, status = 422) => NextResponse.json({ error }, { status });

const Extracted = z.object({
  name: z.string().nullable().describe('Gift card brand / name, e.g. "BuyMe", "תו הזהב", "שופרסל"'),
  amount: z.number().nullable().describe('Original value in ₪'),
  balance: z.number().nullable().describe('Remaining balance in ₪, if shown'),
  received_on: z.string().nullable().describe('Purchase / issue date, YYYY-MM-DD'),
  expires_on: z.string().nullable().describe('Expiry date, YYYY-MM-DD'),
  code: z.string().nullable().describe('Voucher / card code or number'),
  any_store: z.boolean().describe('True only if it works in any business (e.g. a prepaid credit-card gift card)'),
  stores: z.array(z.string()).max(40).describe('Store / chain names that accept it, as written (at most 40)'),
});

const PROMPT = `Extract the details of this Israeli gift card / voucher (שובר, גיפט קארד, תו קנייה). Hebrew is common.
Dates are usually DD/MM/YYYY in Israel; answer as YYYY-MM-DD. Use null for anything not shown. Do not guess.`;

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized', 401);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fail('ai_off', 503);
  const body = (await req.json().catch(() => null)) as { url?: string; image?: { type: string; data: string } } | null;

  let part: object;
  if (body?.url) {
    const text = await fetchPageText(body.url).catch(() => null);
    if (!text) return fail('unreadable');
    part = { text: `Gift card page ${body.url}:\n\n${text.slice(0, 50_000)}` };
  } else if (body?.image && IMAGE_TYPES.includes(body.image.type) && body.image.data.length <= MAX_IMAGE) {
    part = { inlineData: { mimeType: body.image.type, data: body.image.data } };
  } else {
    return fail('bad_request', 400);
  }

  const res = await callGemini('generateContent', JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: `${PROMPT}\nToday is ${israelToday().iso}.` }, part] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(Extracted),
      thinkingConfig: { thinkingLevel: 'low' },
      maxOutputTokens: 4096, // includes thinking; a busy voucher must not turn into minutes of output
    },
  }), key, req.signal);
  if (!res?.ok) return fail(res?.status === 429 ? 'rate_limited' : 'ai_failed', 502);

  const parts: { text?: string; thought?: boolean }[] = (await res.json()).candidates?.[0]?.content?.parts ?? [];
  let parsed;
  try {
    parsed = Extracted.safeParse(JSON.parse(parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('')));
  } catch {
    return fail('ai_failed', 502);
  }
  if (!parsed.success) return fail('ai_failed', 502);

  // Map the names to catalog stores; the rest go back as text for the user to see.
  const stores = await selectAll<Store>((a, b) => supabase.from('stores').select('*').order('id').range(a, b));
  const { stores: names, ...details } = parsed.data;
  const found = names.map((n) => [n, findStoreByName(stores, n)] as const);
  return NextResponse.json({
    ...details,
    store_ids: [...new Set(found.flatMap(([, s]) => (s ? [s.id] : [])))],
    unmatched: found.flatMap(([n, s]) => (s ? [] : [n])),
  });
}
