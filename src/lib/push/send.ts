import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export interface PushSub { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
export interface PushPayload { title: string; body: string; url: string; tag: string }

let configured = false;

/** False when the VAPID keys are missing (push then silently does nothing). Server-only. */
export function pushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (configured) return true;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  } catch (e) {
    console.error('push disabled: bad VAPID settings', (e as Error).message); // never take e-mail reminders down with it
    return false;
  }
  configured = true;
  return true;
}

/** Sends to every device; deletes subscriptions the push service reports as gone. Returns how many accepted it. */
export async function sendToDevices(sb: SupabaseClient, subs: PushSub[], payload: PushPayload): Promise<number> {
  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag });
  const results = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86_400, timeout: 10_000 });
      return 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', status);
      return 0;
    }
  }));
  return results.reduce<number>((a, b) => a + b, 0);
}
