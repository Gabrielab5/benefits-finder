import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bad = (status: number) => NextResponse.json({ error: 'bad request' }, { status });

/** Called by the service worker when the browser renews a subscription; it may have no session then.
 * The old endpoint is an unguessable URL only that device knows, so it is what proves ownership. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { oldEndpoint, endpoint, p256dh, auth } = body ?? {};
  if (![oldEndpoint, endpoint, p256dh, auth].every((v) => typeof v === 'string' && v)) return bad(400);
  const { data, error } = await supabaseAdmin().from('push_subscriptions')
    .update({ endpoint, p256dh, auth }).eq('endpoint', oldEndpoint as string).select('id');
  if (error) return bad(400); // e.g. the new endpoint is not a known push service
  if (!data?.length) return bad(404);
  return NextResponse.json({ renewed: true });
}
