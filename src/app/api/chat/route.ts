import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { buildChatContext, CHAT_MODEL, CHAT_SYSTEM, cleanHistory } from '@/lib/ai/chat';
import { israelToday } from '@/lib/core/dates';
import { fetchSnapshot } from '@/lib/snapshot';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
let client: Anthropic | null = null;

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized', 401);
  if (!process.env.ANTHROPIC_API_KEY) return fail('ai_off', 503);
  const messages = cleanHistory((await req.json().catch(() => null))?.messages);
  if (!messages) return fail('bad_request', 400);

  const context = buildChatContext(await fetchSnapshot(supabase), israelToday().iso);
  client ??= new Anthropic();
  const stream = client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1024,
    // The benefits list repeats on every turn, so cache it.
    system: [{ type: 'text', text: `${CHAT_SYSTEM}\n\n${context}`, cache_control: { type: 'ephemeral' } }],
    messages,
  });

  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const enc = new TextEncoder();
      stream.on('text', (t) => ctrl.enqueue(enc.encode(t)));
      try {
        await stream.finalMessage();
      } catch (e) {
        console.error('chat failed', e);
        ctrl.enqueue(enc.encode('\n\n⚠️ משהו השתבש. נסו שוב.'));
      }
      ctrl.close();
    },
    cancel() { stream.abort(); },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
