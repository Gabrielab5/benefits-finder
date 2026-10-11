import { NextResponse } from 'next/server';
import { pushConfigured, sendToDevices, type PushSub } from '@/lib/push/send';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

/** Sends a test notification to the signed-in user's devices. */
export async function POST() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'push_off' }, { status: 503 });
  const { data: subs } = await sb.from('push_subscriptions').select('*'); // RLS: only this user's devices
  const delivered = await sendToDevices(supabaseAdmin(), (subs ?? []) as PushSub[], {
    title: '🔔 התראת בדיקה', body: 'ההתראות עובדות! כך ייראו התזכורות שלך.', url: '/', tag: 'test',
  });
  return NextResponse.json({ delivered });
}
