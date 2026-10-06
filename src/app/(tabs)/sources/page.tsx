'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { monthNameHe } from '@/lib/core/dates';
import { formatDate, KIND_LABELS } from '@/lib/core/labels';
import { PROGRAM_KINDS, type Program, type ProgramKind } from '@/lib/core/types';
import { idbClear } from '@/lib/snapshot';
import { startImport } from '@/lib/startImport';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function SourcesPage() {
  const { snapshot, online, refresh } = useSnap();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProgramKind>('club');
  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;

  const sb = supabaseBrowser();
  const profile = snapshot.profile;
  const activeCount = (programId: string) =>
    snapshot.benefits.filter((b) => b.program_id === programId && b.status === 'active').length;
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
  const notSeen = snapshot.benefits.filter((b) => b.status === 'not_seen');

  async function write(op: PromiseLike<{ error: unknown }>) {
    const { error } = await op;
    if (error) setError('הפעולה נכשלה.');
    else {
      setError(null);
      await refresh();
    }
  }

  async function refreshProgram(p: Program) {
    if (!p.benefits_url) return;
    setBusyId(p.id);
    const result = await startImport({ programId: p.id, mode: 'link', url: p.benefits_url, refresh: true });
    setBusyId(null);
    if ('error' in result) {
      setError(`${p.name}: ${result.error}`);
      await refresh();
    } else router.push(`/import/${result.importId}`);
  }

  async function logout() {
    await sb.auth.signOut();
    await idbClear();
    location.href = '/login';
  }

  return (
    <main className="space-y-6 p-4">
      <h1 className="text-xl font-bold">מקורות והגדרות</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">אין חיבור — אפשר רק לצפות.</p>}
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {PROGRAM_KINDS.map((kind) => {
        const list = snapshot.programs.filter((p) => p.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500">{KIND_LABELS[kind]}</h2>
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.id} className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{p.last_refresh_status === 'failed' ? '⚠️ ' : ''}{p.name}</p>
                    <p className="text-sm text-gray-600">
                      {activeCount(p.id)} הטבות · {p.last_refreshed_at ? `עודכן ${formatDate(p.last_refreshed_at)}` : 'טרם עודכן'}
                    </p>
                  </div>
                  <input dir="ltr" type="url" placeholder="קישור לדף ההטבות" defaultValue={p.benefits_url ?? ''}
                    aria-label={`קישור להטבות של ${p.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== p.benefits_url) write(sb.from('programs').update({ benefits_url: v }).eq('id', p.id));
                    }}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                  <div className="flex gap-2">
                    <button disabled={!online || !p.benefits_url || busyId !== null} onClick={() => refreshProgram(p)}
                      className="flex-1 rounded-lg bg-blue-700 p-2 text-sm font-semibold text-white disabled:opacity-40">
                      {busyId === p.id ? 'מרענן… (עד כמה דקות)' : 'רענון'}
                    </button>
                    <button disabled={!online}
                      onClick={() => {
                        if (confirm(`למחוק את ${p.name} וכל ההטבות שלה?`)) write(sb.from('programs').delete().eq('id', p.id));
                      }}
                      className="rounded-lg bg-gray-100 px-3 text-sm text-red-700 disabled:opacity-40">מחיקה</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">הוספת תוכנית</h2>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם" aria-label="שם התוכנית"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 p-2" />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as ProgramKind)} aria-label="סוג"
            className="rounded-lg border border-gray-300 p-2">
            {PROGRAM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
          <button disabled={!online || !newName.trim()}
            onClick={async () => { await write(sb.from('programs').insert({ name: newName.trim(), kind: newKind })); setNewName(''); }}
            className="rounded-lg bg-gray-200 px-3 disabled:opacity-40">הוספה</button>
        </div>
      </section>

      {notSeen.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">לא נמצאו ברענון האחרון</h2>
          <ul className="space-y-2">
            {notSeen.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm">
                <p className="min-w-0 flex-1 text-sm">{b.title} · {programName.get(b.program_id)}</p>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'archived' }).eq('id', b.id))}
                  className="text-sm text-red-700">הסרה</button>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'active' }).eq('id', b.id))}
                  className="text-sm text-blue-700">עדיין קיימת</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile && (
        <section className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <h2 className="font-semibold">הגדרות</h2>
          <label className="flex items-center justify-between gap-2">
            חודש יום ההולדת
            <select disabled={!online} value={profile.birth_month}
              onChange={(e) => write(sb.from('profile').update({ birth_month: Number(e.target.value) }).eq('user_id', profile.user_id))}
              className="rounded-lg border border-gray-300 p-2">
              {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled={!online} checked={profile.email_reminders}
              onChange={(e) => write(sb.from('profile').update({ email_reminders: e.target.checked }).eq('user_id', profile.user_id))} />
            תזכורת במייל בתחילת חודש יום ההולדת
          </label>
          <button onClick={logout} className="text-sm text-red-700">יציאה</button>
        </section>
      )}
    </main>
  );
}
