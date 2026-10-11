'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { Button, Notice } from '@/components/ui';
import type { Profile } from '@/lib/core/types';
import { pushSupport, subscribeDevice, syncDevice, unsubscribeDevice } from '@/lib/push/client';
import { supabaseBrowser } from '@/lib/supabase/browser';

type State = 'loading' | 'unsupported' | 'ios_install' | 'denied' | 'off' | 'on';
const SWITCHES = [
  ['push_dates', '🎂 תאריכים מיוחדים'],
  ['push_expiring', '⏳ הטבות שמסתיימות השבוע (בימי ראשון)'],
  ['push_new', '✨ הטבות חדשות לכרטיסים שלי'],
] as const;

async function detect(sb: ReturnType<typeof supabaseBrowser>): Promise<State> {
  const support = pushSupport();
  if (support !== 'ok') return support;
  try {
    return await syncDevice(sb);
  } catch {
    return 'unsupported';
  }
}

export default function PushSettings({ profile, online, onChange }: { profile: Profile; online: boolean; onChange: () => Promise<void> }) {
  const sb = supabaseBrowser();
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    detect(supabaseBrowser()).then(setState);
  }, []);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch {
      setMessage({ tone: 'error', text: 'הפעולה נכשלה. נסו שוב.' });
    } finally {
      setBusy(false);
    }
  }

  const enable = () => act(async () => {
    if (await subscribeDevice(sb, profile)) {
      setState('on');
      await onChange();
    } else setState(Notification.permission === 'denied' ? 'denied' : 'off');
  });
  const disable = () => act(async () => {
    await unsubscribeDevice(sb);
    setState('off');
  });
  const test = () => act(async () => {
    const res = await fetch('/api/push/test', { method: 'POST' });
    const { delivered } = (await res.json()) as { delivered?: number };
    setMessage(delivered
      ? { tone: 'success', text: 'נשלחה התראת בדיקה.' }
      : { tone: 'error', text: 'ההתראה לא נשלחה. נסו לכבות ולהפעיל מחדש.' });
  });
  const toggle = (key: (typeof SWITCHES)[number][0], value: boolean) => act(async () => {
    const { error } = await sb.from('profile').update({ [key]: value }).eq('user_id', profile.user_id);
    if (error) throw error;
    await onChange();
  });

  return (
    <div className="space-y-3 rounded-xl border border-line bg-panel-2/40 p-3">
      <p className="flex items-center gap-2 font-medium"><Bell size={16} className="text-mint" aria-hidden /> התראות</p>
      {state === 'unsupported' && <Notice>הדפדפן הזה לא תומך בהתראות.</Notice>}
      {state === 'ios_install' && (
        <Notice>באייפון צריך קודם להוסיף את האפליקציה למסך הבית: שיתוף ← הוספה למסך הבית, ולפתוח אותה משם.</Notice>
      )}
      {state === 'denied' && <Notice tone="warn">ההתראות חסומות בהגדרות הדפדפן. אפשר לאפשר אותן בהגדרות האתר.</Notice>}
      {state === 'off' && (
        <Button disabled={!online || busy} onClick={enable} className="w-full">הפעלת התראות במכשיר הזה</Button>
      )}
      {state === 'on' && (
        <>
          <p className="text-sm text-mint">✅ ההתראות פעילות במכשיר הזה</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!online || busy} onClick={test} className="flex-1">
              <Send size={15} aria-hidden /> שליחת התראת בדיקה
            </Button>
            <Button variant="secondary" disabled={busy} onClick={disable} className="flex-1">
              <BellOff size={15} aria-hidden /> כיבוי במכשיר הזה
            </Button>
          </div>
        </>
      )}
      {(state === 'on' || state === 'off') && SWITCHES.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-mint" disabled={!online || busy} checked={profile[key] !== false}
            onChange={(e) => toggle(key, e.target.checked)} />
          {label}
        </label>
      ))}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
