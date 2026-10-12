'use client';
import { useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import AdminPanel from '@/components/AdminPanel';
import DatesForm, { datesValid, type DatesValue } from '@/components/DatesForm';
import PushSettings from '@/components/PushSettings';
import { Button, Loading, Notice, PageHeader } from '@/components/ui';
import { unsubscribeDevice } from '@/lib/push/client';
import { idbClear } from '@/lib/snapshot';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

export default function SettingsPage() {
  const { snapshot, online, refresh } = useSnap();
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<DatesValue | null>(null);
  const [saved, setSaved] = useState(false);
  if (!snapshot) return <Loading />;

  const sb = supabaseBrowser();
  const profile = snapshot.profile;
  const currentDates: DatesValue = dates ?? {
    birth_month: profile?.birth_month ?? null,
    anniversary_month: profile?.anniversary_month ?? null,
    anniversary_day: profile?.anniversary_day ?? null,
    children: profile?.children ?? [],
  };

  async function write(op: PromiseLike<{ error: unknown }>) {
    const { error } = await op;
    if (error) setError('הפעולה נכשלה.');
    else {
      setError(null);
      await refresh();
    }
  }

  async function saveDates() {
    if (!profile || !datesValid(currentDates)) return;
    await write(sb.from('profile').update({
      birth_month: currentDates.birth_month,
      anniversary_month: currentDates.anniversary_month,
      anniversary_day: currentDates.anniversary_day,
      children: currentDates.children.map((c) => ({ name: c.name.trim(), birth_month: c.birth_month })),
    }).eq('user_id', profile.user_id));
    setDates(null);
    setSaved(true);
  }

  async function logout() {
    await unsubscribeDevice(sb); // the next person on this device must not get this user's alerts
    await sb.auth.signOut();
    await idbClear();
    location.href = '/login';
  }

  return (
    <main className="space-y-6">
      <PageHeader title="הגדרות" subtitle="תאריכים, התראות וחשבון" icon={Settings} />
      {!online && <Notice tone="warn">אין חיבור — אפשר רק לצפות.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {profile && (
        <section className="space-y-4 rounded-2xl border border-line bg-panel p-4">
          <DatesForm value={currentDates} onChange={(v) => { setDates(v); setSaved(false); }} />
          {dates && (
            <Button disabled={!online || !datesValid(currentDates)} onClick={saveDates} className="w-full">שמירת התאריכים</Button>
          )}
          {saved && !dates && <Notice tone="success">התאריכים נשמרו.</Notice>}
          <PushSettings profile={profile} online={online} onChange={refresh} />
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-mint" disabled={!online} checked={profile.email_reminders}
              onChange={(e) => write(sb.from('profile').update({ email_reminders: e.target.checked }).eq('user_id', profile.user_id))} />
            תזכורת במייל כשמתחיל חודש של תאריך מיוחד
          </label>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-bad"><LogOut size={15} aria-hidden /> יציאה</button>
        </section>
      )}

      {profile?.is_admin && <AdminPanel programs={snapshot.programs} products={snapshot.products ?? []} onChange={refresh} />}
    </main>
  );
}
