import { NextResponse } from 'next/server';
import { buildChatContext, CHAT_SYSTEM, cleanHistory } from '@/lib/ai/chat';
import { callGemini } from '@/lib/ai/gemini';
import { israelToday } from '@/lib/core/dates';
import { fetchSnapshot } from '@/lib/snapshot';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized', 401);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fail('ai_off', 503);
  const messages = cleanHistory((await req.json().catch(() => null))?.messages);
  if (!messages) return fail('bad_request', 400);

  const context = buildChatContext(await fetchSnapshot(supabase), israelToday().iso);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: `${CHAT_SYSTEM}\n\n${context}` }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    // Light thinking keeps answers to a few seconds; maxOutputTokens includes the thinking tokens.
    generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } },
  });
  const upstream = await callGemini('streamGenerateContent?alt=sse', body, key, req.signal);
  if (!upstream?.ok || !upstream.body) {
    return fail(upstream?.status === 429 ? 'rate_limited' : 'ai_failed', 502);
  }

  // Gemini streams SSE lines "data: {json}"; forward only the answer text.
  const enc = new TextEncoder();
  let buf = '';
  const out = upstream.body.pipeThrough(new TextDecoderStream()).pipeThrough(new TransformStream<string, Uint8Array>({
    transform(chunk, ctrl) {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const parts = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts ?? [];
          for (const p of parts) if (p.text && !p.thought) ctrl.enqueue(enc.encode(p.text));
        } catch { /* partial or non-JSON line */ }
      }
    },
  }));
  return new Response(out, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
