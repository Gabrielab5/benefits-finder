import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { extractBenefits, ExtractError, type ContentBlock } from '@/lib/ai/extract';
import { chunkText, mergeExtractions } from '@/lib/ai/chunks';
import { buildContext } from '@/lib/ai/prompt';
import { israelToday } from '@/lib/core/dates';
import type { Store } from '@/lib/core/types';
import { fetchPageText, MAX_TEXT } from '@/lib/fetchPage';
import { selectAll } from '@/lib/selectAll';
import type { ImportRequest } from '@/lib/startImport';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 300; // seconds; long pages take minutes to extract

const CHUNK_CHARS = 20_000; // ~30-40 benefits per request: fits max_tokens and finishes well inside maxDuration
const IMAGE_TYPES =['image/png', 'image/jpeg', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const fail = (error: string, status = 422) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized', 401);
  if (!process.env.ANTHROPIC_API_KEY) return fail('ai_off', 503); // free mode: import through a chatbot instead
  const body = (await req.json()) as ImportRequest;

  const { data: program } = await supabase.from('programs').select('id,name').eq('id', body.programId).maybeSingle();
  if (!program) return fail('program_not_found', 404);

  const markRefreshFailed = async () => {
    if (body.refresh) {
      await supabase.from('programs')
        .update({ last_refresh_status: 'failed', last_refreshed_at: new Date().toISOString() })
        .eq('id', program.id);
    }
  };

  // One Claude request per entry; long pages are split so each answer stays well within limits.
  let requests: ContentBlock[][];
  let source: 'ai_link' | 'ai_text' | 'ai_screenshot';
  if (body.mode === 'link' || body.mode === 'text') {
    source = body.mode === 'link' ? 'ai_link' : 'ai_text';
    const text = body.mode === 'link'
      ? (body.url ? await fetchPageText(body.url).catch(() => null) : null)
      : typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      await markRefreshFailed();
      return fail(body.mode === 'link' ? 'unreadable' : 'empty');
    }
    if (text.length > MAX_TEXT) {
      await markRefreshFailed();
      return fail('too_long');
    }
    const chunks = chunkText(text, CHUNK_CHARS);
    const label = body.mode === 'link' ? `Benefits page ${body.url}` : 'Pasted benefits text';
    requests = chunks.map((c, i) => [
      { type: 'text', text: `${label}${chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : ''}:\n\n${c}` },
    ]);
  } else {
    const content: ContentBlock[] = [];
    requests = [content];
    source = 'ai_screenshot';
    const paths = body.paths ?? [];
    if (paths.length < 1 || paths.length > 5) return fail('bad_screenshots');
    for (const path of paths) {
      if (!path.startsWith(`${user.id}/`)) return fail('bad_screenshots', 403);
      const { data: file, error } = await supabase.storage.from('imports').download(path);
      if (error || !file || !IMAGE_TYPES.includes(file.type as ImageType)) return fail('bad_screenshots');
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: file.type as ImageType, data: Buffer.from(await file.arrayBuffer()).toString('base64') },
      });
    }
  }
  const stores = await selectAll<Store>((a, b) => supabase.from('stores').select('*').order('id').range(a, b));
  const raw_input = { url: body.url ?? null, text: body.mode === 'text' ? body.text ?? null : null, paths: body.paths ?? null };
  const base = { program_id: program.id, source, raw_input, is_refresh: !!body.refresh };

  try {
    const context = buildContext(program.name, stores, israelToday().iso);
    const extracted = mergeExtractions(await Promise.all(requests.map((content) => extractBenefits(content, context))));
    const { data: row, error } = await supabase.from('imports')
      .insert({ ...base, extracted, status: 'pending_review' }).select('id').single();
    if (error) throw error;
    return NextResponse.json({ importId: row.id });
  } catch (e) {
    const code = e instanceof ExtractError ? e.message : e instanceof Anthropic.APIError ? `api_${e.status}` : 'default';
    await supabase.from('imports').insert({ ...base, status: 'failed', error: code });
    await markRefreshFailed();
    return fail(code, 502);
  }
}
