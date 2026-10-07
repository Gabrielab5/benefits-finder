'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, RefreshCw, Settings, Trash2, TriangleAlert } from 'lucide-react';
import { Loading, Notice, PageHeader, SectionTitle, field } from '@/components/ui';
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
  if (!snapshot) return <Loading />;

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
    if (process.env.NEXT_PUBLIC_AI_API !== 'on') {
      // Free mode: refresh through a chatbot on the import page, with the link and refresh flag filled in.
      router.push(`/import?program=${p.id}&refresh=1&url=${encodeURIComponent(p.benefits_url)}`);
      return;
    }
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
    <main className="space-y-6">
      <PageHeader title="מקורות והגדרות" subtitle="מאיפה מגיעות ההטבות" icon={Settings} />
      {!online && <Notice tone="warn">אין חיבור — אפשר רק לצפות.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {PROGRAM_KINDS.map((kind) => {
        const list = snapshot.programs.filter((p) => p.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="space-y-2">
            <SectionTitle>{KIND_LABELS[kind]}</SectionTitle>
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.id} className="space-y-2.5 rounded-2xl border border-line bg-panel p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 font-semibold">{p.last_refresh_status === 'failed' && <TriangleAlert size={15} className="text-warn" aria-label="הרענון האחרון נכשל" />}{p.name}</p>
                    <p className="text-xs text-muted">
                      {activeCount(p.id)} הטבות · {p.last_refreshed_at ? `עודכן ${formatDate(p.last_refreshed_at)}` : 'טרם עודכן'}
                    </p>
                  </div>
                  <input dir="ltr" type="url" placeholder="קישור לדף ההטבות" defaultValue={p.benefits_url ?? ''}
                    aria-label={`קישור להטבות של ${p.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== p.benefits_url) write(sb.from('programs').update({ benefits_url: v }).eq('id', p.id));
                    }}
                    className={`${field} text-sm`} />
                  <div className="flex gap-2">
                    <button disabled={!online || !p.benefits_url || busyId !== null} onClick={() => refreshProgram(p)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-mint py-2 text-sm font-semibold text-mint-ink disabled:opacity-40"><RefreshCw size={14} aria-hidden />
                      {busyId === p.id ? 'מרענן… (עד כמה דקות)' : 'רענון'}
                    </button>
                    <button disabled={!online}
                      onClick={() => {
                        if (confirm(`למחוק את ${p.name} וכל ההטבות שלה?`)) write(sb.from('programs').delete().eq('id', p.id));
                      }}
                      aria-label={`מחיקת ${p.name}`} className="grid w-10 place-items-center rounded-xl border border-line text-bad disabled:opacity-40"><Trash2 size={15} aria-hidden /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="space-y-2">
        <SectionTitle>הוספת תוכנית</SectionTitle>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם" aria-label="שם התוכנית"
            className={`${field} min-w-0 flex-1`} />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as ProgramKind)} aria-label="סוג"
            className={`${field} w-36! shrink-0`}>
            {PROGRAM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
          <button disabled={!online || !newName.trim()}
            onClick={async () => { await write(sb.from('programs').insert({ name: newName.trim(), kind: newKind })); setNewName(''); }}
            className="rounded-xl border border-line bg-panel-2 px-3 disabled:opacity-40">הוספה</button>
        </div>
      </section>

      {notSeen.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>לא נמצאו ברענון האחרון</SectionTitle>
          <ul className="space-y-2">
            {notSeen.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-3">
                <p className="min-w-0 flex-1 text-sm">{b.title} · {programName.get(b.program_id)}</p>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'archived' }).eq('id', b.id))}
                  className="text-sm text-bad">הסרה</button>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'active' }).eq('id', b.id))}
                  className="text-sm text-mint">עדיין קיימת</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile && (
        <section className="space-y-2.5 rounded-2xl border border-line bg-panel p-3.5">
          <h2 className="font-semibold">הגדרות</h2>
          <label className="flex items-center justify-between gap-2">
            חודש יום ההולדת
            <select disabled={!online} value={profile.birth_month}
              onChange={(e) => write(sb.from('profile').update({ birth_month: Number(e.target.value) }).eq('user_id', profile.user_id))}
              className={`${field} w-36! shrink-0`}>
              {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-mint" disabled={!online} checked={profile.email_reminders}
              onChange={(e) => write(sb.from('profile').update({ email_reminders: e.target.checked }).eq('user_id', profile.user_id))} />
            תזכורת במייל בתחילת חודש יום ההולדת
          </label>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-bad"><LogOut size={15} aria-hidden /> יציאה</button>
        </section>
      )}
    </main>
  );
}
