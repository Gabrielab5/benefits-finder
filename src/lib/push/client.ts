import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/lib/core/types';

/** Why push can't be turned on here, or 'ok'. iPhone only supports it in the app added to the Home Screen. */
export function pushSupport(): 'unsupported' | 'ios_install' | 'denied' | 'ok' {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios_install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function base64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks permission and saves this device. Always starts a fresh subscription, so a device another user
 * signed in on earlier never stays tied to that user. Returns false when permission was not given. */
export async function subscribeDevice(sb: SupabaseClient, profile: Profile): Promise<boolean> {
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: base64UrlToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
  const keys = sub.toJSON().keys!;
  const { error } = await sb.from('push_subscriptions').insert({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth });
  if (error) {
    await sub.unsubscribe();
    throw error;
  }
  if (!profile.push_new_since) await sb.from('profile').update({ push_new_since: new Date().toISOString() }).eq('user_id', profile.user_id);
  return true;
}

/** Stops push on this device (also used on logout). Best effort. */
export async function unsubscribeDevice(sb: SupabaseClient): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // no service worker (dev) or already gone
  }
}
