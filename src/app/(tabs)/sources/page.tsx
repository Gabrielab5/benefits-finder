'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Layers, Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { Chip, Loading, Notice, PageHeader, SectionTitle, field } from '@/components/ui';
import Waiting from '@/components/Waiting';
import { isShared } from '@/lib/core/catalog';
import { CATEGORY_LABELS, formatDate, KIND_LABELS } from '@/lib/core/labels';
import { listSources, type SourceSort } from '@/lib/core/sources';
import { CATEGORIES, PROGRAM_KINDS, type Category, type Program, type ProgramKind } from '@/lib/core/types';
import { startImport } from '@/lib/startImport';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

const TAB_LABELS: Record<ProgramKind, string> = { card_issuer: 'כרטיסי אשראי', store_club: 'מועדוני חנויות', club: 'מועדוני צרכנים' };
const TABS: ProgramKind[] = ['card_issuer', 'store_club', 'club'];
const SORT_LABELS: Record<SourceSort, string> = { name: 'לפי שם', benefits: 'הכי הרבה הטבות', updated: 'עודכן לאחרונה' };

export default function SourcesPage() {
  const { snapshot, online, refresh } = useSnap();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ProgramKind>('card_issuer');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [sort, setSort] = useState<SourceSort>('name');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProgramKind>('club');
  const [newShared, setNewShared] = useState(true);
  if (!snapshot) return <Loading />;

  const sb = supabaseBrowser();
  const isAdmin = Boolean(snapshot.profile?.is_admin);
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
  const notSeen = snapshot.benefits.filter((b) => b.status === 'not_seen' && (isAdmin || !isShared(b)));
  const kindCount = (k: ProgramKind) => snapshot.programs.filter((p) => p.kind === k).length;
  const rows = listSources(snapshot, { kind, query, category, sort });
  // Only offer categories that some program of this tab is in.
  const tabCategories = new Set(listSources(snapshot, { kind, query: '', category: null, sort }).map((r) => r.category));

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

  async function addProgram() {
    const row = { name: newName.trim(), kind: newKind, ...(isAdmin && newShared ? { user_id: null } : {}) };
    await write(sb.from('programs').insert(row));
    setNewName('');
  }

  return (
    <main className="space-y-4">
      <PageHeader title="מקורות" subtitle="מאיפה מגיעות ההטבות" icon={Layers} />
      {!online && <Notice tone="warn">אין חיבור — אפשר רק לצפות.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div role="tablist" aria-label="סוג" className="grid grid-cols-3 gap-1.5">
        {TABS.map((k) => (
          <Chip key={k} role="tab" aria-selected={kind === k} active={kind === k} className="px-1! text-[13px]!"
            onClick={() => { setKind(k); setCategory(null); }}>
            {TAB_LABELS[k]} <span className="opacity-70">{kindCount(k)}</span>
          </Chip>
        ))}
      </div>

      <div className="space-y-2">
        <label className="relative block">
          <Search size={16} aria-hidden className="pointer-events-none absolute inset-y-0 right-3 my-auto text-dim" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם"
            aria-label="חיפוש מקור" className={`${field} pr-9`} />
        </label>
        <div className="flex gap-2">
          <select value={category ?? ''} onChange={(e) => setCategory((e.target.value || null) as Category | null)}
            aria-label="סינון לפי קטגוריה" className={`${field} min-w-0 flex-1 text-sm`}>
            <option value="">כל הקטגוריות</option>
            {CATEGORIES.filter((c) => tabCategories.has(c)).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SourceSort)} aria-label="מיון"
            className={`${field} min-w-0 flex-1 text-sm`}>
            {(Object.keys(SORT_LABELS) as SourceSort[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-dim">לא נמצאו מקורות.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-panel">
          {rows.map(({ program: p, count, category: cat }) => {
            const editable = !isShared(p) || isAdmin;
            const meta = (
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {p.last_refresh_status === 'failed' && <TriangleAlert size={14} className="shrink-0 text-warn" aria-label="הרענון האחרון נכשל" />}
                <span className="truncate font-medium">{p.name}</span>
                {!isShared(p) && <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] text-dim">פרטי</span>}
              </span>
            );
            const info = (
              <span className="shrink-0 text-xs text-muted">
                {count} הטבות{cat ? ` · ${CATEGORY_LABELS[cat]}` : ''}
              </span>
            );
            if (!editable) return <li key={p.id} className="flex items-center gap-2 px-3.5 py-3">{meta}{info}</li>;
            return (
              <li key={p.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
                    {meta}{info}
                    <ChevronDown size={15} aria-hidden className="shrink-0 text-dim transition group-open:rotate-180" />
                  </summary>
                  <div className="space-y-2 px-3.5 pb-3.5">
                    <p className="text-xs text-dim">
                      {isShared(p) ? 'משותף לכל המשתמשים' : 'פרטי'} · {p.last_refreshed_at ? `עודכן ${formatDate(p.last_refreshed_at)}` : 'טרם עודכן'}
                    </p>
                    <input dir="ltr" type="url" placeholder="קישור לדף ההטבות" defaultValue={p.benefits_url ?? ''}
                      aria-label={`קישור להטבות של ${p.name}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== p.benefits_url) write(sb.from('programs').update({ benefits_url: v }).eq('id', p.id));
                      }}
                      className={`${field} text-sm`} />
                    <div className="flex gap-2">
                      <button disabled={!online || !p.benefits_url || busyId !== null} onClick={() => refreshProgram(p)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-mint py-2 text-sm font-semibold text-mint-ink disabled:opacity-40">
                        <RefreshCw size={14} aria-hidden />
                        {busyId === p.id ? 'מרענן… (עד כמה דקות)' : 'רענון'}
                      </button>
                      <button disabled={!online}
                        onClick={() => {
                          if (confirm(`למחוק את ${p.name} וכל ההטבות שלה?`)) write(sb.from('programs').delete().eq('id', p.id));
                        }}
                        aria-label={`מחיקת ${p.name}`} className="grid w-10 place-items-center rounded-xl border border-line text-bad disabled:opacity-40">
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <details className="group rounded-2xl border border-line bg-panel">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <Plus size={15} aria-hidden className="text-mint" /> הוספת תוכנית
        </summary>
        <div className="space-y-2 px-3.5 pb-3.5">
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם" aria-label="שם התוכנית"
              className={`${field} min-w-0 flex-1`} />
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as ProgramKind)} aria-label="סוג"
              className={`${field} w-36! shrink-0`}>
              {PROGRAM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
            <button disabled={!online || !newName.trim()} onClick={addProgram}
              className="rounded-xl border border-line bg-panel-2 px-3 disabled:opacity-40">הוספה</button>
          </div>
          {isAdmin ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="h-4 w-4 accent-mint" checked={newShared} onChange={(e) => setNewShared(e.target.checked)} />
              משותף לכל המשתמשים
            </label>
          ) : (
            <p className="text-xs text-dim">תוכניות שתוסיפו יופיעו רק אצלכם.</p>
          )}
        </div>
      </details>

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
      {busyId && <Waiting overlay label="מרעננים את ההטבות — עד כמה דקות" />}
    </main>
  );
}
