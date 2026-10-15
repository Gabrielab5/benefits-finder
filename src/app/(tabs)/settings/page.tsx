'use client';
import { useState, type FormEvent } from 'react';
import { LogOut, Settings } from 'lucide-react';
import AdminPanel from '@/components/AdminPanel';
import DatesForm, { datesValid, type DatesValue } from '@/components/DatesForm';
import PushSettings from '@/components/PushSettings';
import { Button, Loading, Notice, PageHeader, field } from '@/components/ui';
import { retryHint } from '@/lib/core/labels';
import { unsubscribeDevice } from '@/lib/push/client';
import { idbClear } from '@/lib/snapshot';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

export default function SettingsPage() {
  const { snapshot, online, refresh } = useSnap();
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<DatesValue | null>(null);
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
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
    if (error) setError(`השינוי לא נשמר. ${retryHint(navigator.onLine)}`);
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

  /** Lets someone who came in with Google or an e-mail code sign in with a password next time. */
  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const { error } = await sb.auth.updateUser({ password: String(new FormData(form).get('password')) });
    if (error) {
      setError(error.code === 'weak_password' ? 'הסיסמה קלה מדי לניחוש. נסו סיסמה ארוכה יותר.' : `הסיסמה לא נשמרה. ${retryHint(navigator.onLine)}`);
      return;
    }
    setError(null);
    form.reset();
    setPasswordSaved(true);
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
          <form onSubmit={savePassword} className="space-y-2">
            <label className="block">
              <span className="text-sm text-muted">סיסמה לכניסה עם אימייל</span>
              <input name="password" type="password" required minLength={8} dir="ltr" autoComplete="new-password"
                aria-describedby="password-hint" onChange={() => setPasswordSaved(false)} className={`${field} mt-1 text-start`} />
            </label>
            <p id="password-hint" className="text-xs text-dim">לפחות 8 תווים. מחליפה סיסמה קודמת, אם הייתה.</p>
            <Button variant="secondary" disabled={!online} className="w-full">שמירת הסיסמה</Button>
          </form>
          {passwordSaved && <Notice tone="success">הסיסמה נשמרה. מעכשיו אפשר להיכנס גם איתה.</Notice>}
          <button onClick={logout} className="tap flex items-center gap-1.5 text-sm text-bad"><LogOut size={15} aria-hidden /> יציאה</button>
        </section>
      )}

      {profile?.is_admin && <AdminPanel programs={snapshot.programs} products={snapshot.products ?? []} onChange={refresh} />}
    </main>
  );
}
