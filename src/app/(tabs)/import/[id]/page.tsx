'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClipboardCheck, Plus, TriangleAlert } from 'lucide-react';
import { Button, Loading, Notice, PageHeader, SectionTitle, field as baseField } from '@/components/ui';
import { israelToday } from '@/lib/core/dates';
import { CATEGORY_LABELS, REQUIRES_LABELS, TIMING_LABELS, TYPE_LABELS } from '@/lib/core/labels';
import { mergeImport } from '@/lib/core/merge';
import {
  blankRow, existingForImport, planNewStores, storesForImport, rowProblems, scopePatch, scopeValue, toIncoming, type ImportRow, type NewStoreDraft, type ReviewRow,
} from '@/lib/core/review';
import {
  BENEFIT_TYPES, CATEGORIES, REQUIRES, TIMINGS,
  type Benefit, type BenefitType, type Category, type Requires, type Store, type Timing,
} from '@/lib/core/types';
import { selectAll } from '@/lib/selectAll';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

const field = `${baseField} px-2.5 py-2 text-sm`;
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const EMPTY_STORE: NewStoreDraft = { name_he: '', name_en: '', aliases: [], category: 'other', channel: 'both' };

export default function ReviewImportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { snapshot, refresh } = useSnap();
  const [imp, setImp] = useState<ImportRow | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [newStores, setNewStores] = useState<NewStoreDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().from('imports').select('*').eq('id', id).single().then(({ data }) => {
      const row = data as ImportRow | null;
      setImp(row);
      if (row?.extracted) {
        setRows(row.extracted.benefits.map((b) => ({ ...b, approved: true })));
        setNewStores(row.extracted.new_stores);
      }
    });
  }, [id]);

  if (!snapshot || !imp) return <Loading />;

  const program = snapshot.programs.find((p) => p.id === imp.program_id);
  const ctx = { storeIds: new Set(snapshot.stores.map((s) => s.id)), newStores, todayIso: israelToday().iso };
  const problems = rows.map((r) => (r.approved ? rowProblems(r, ctx) : []));
  const approvedCount = rows.filter((r) => r.approved).length;
  const canSave = imp.status === 'pending_review' && approvedCount > 0 && problems.every((p) => p.length === 0) && !busy;
  const stores = storesForImport(snapshot.stores, Boolean(imp.shared)).sort((a, b) => a.name_he.localeCompare(b.name_he, 'he'));
  const update = (i: number, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const updateStore = (i: number, patch: Partial<NewStoreDraft>) =>
    setNewStores((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    if (!snapshot || !imp) return;
    setBusy(true);
    setMessage(null);
    const sb = supabaseBrowser();
    try {
      const nowIso = new Date().toISOString();
      const approved = rows.filter((r) => r.approved);

      // Read straight from the database (not the possibly stale snapshot) so a retry after a
      // half-finished save, or a save from a second tab, sees what was already written.
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('not signed in');
      const shared = Boolean(imp.shared);
      const [stores, programBenefits] = await Promise.all([
        selectAll<Store>((a, b) => sb.from('stores').select('*').order('id').range(a, b)),
        selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('program_id', imp.program_id).order('id').range(a, b)),
      ]);
      // Shared imports merge with shared benefits only; private ones with your own only.
      const existing = existingForImport(programBenefits, imp.program_id, shared, user.id);

      const newStoreIds: (string | undefined)[] = [];
      const usedIndexes = [...new Set(approved.map((r) => r.new_store_index).filter((i): i is number => i != null))];
      for (const group of planNewStores(usedIndexes, newStores, storesForImport(stores, shared))) {
        let id = group.existingId;
        if (!id) {
          const { data, error } = await sb.from('stores').insert({
            ...(shared ? { user_id: null } : {}),
            name_he: group.draft.name_he.trim(), name_en: group.draft.name_en.trim(), aliases: group.draft.aliases,
            category: group.draft.category, channel: group.draft.channel,
          }).select('id').single();
          if (error) throw error;
          id = data.id as string;
        }
        for (const i of group.indexes) newStoreIds[i] = id;
      }

      const incoming = approved.map((r) => toIncoming(r, newStoreIds, imp.raw_input.url));
      const plan = mergeImport(existing, incoming, { isRefresh: imp.is_refresh, nowIso });

      if (plan.inserts.length > 0) {
        const { error } = await sb.from('benefits')
          .insert(plan.inserts.map((b) => ({ ...b, program_id: imp.program_id, last_verified_at: nowIso, ...(shared ? { user_id: null } : {}) })));
        if (error) throw error;
      }
      for (const u of plan.updates) {
        const { error } = await sb.from('benefits').update(u.patch).eq('id', u.id);
        if (error) throw error;
      }
      if (plan.notSeen.length > 0) {
        const { error } = await sb.from('benefits').update({ status: 'not_seen' }).in('id', plan.notSeen);
        if (error) throw error;
      }
      await sb.from('imports').update({ status: 'saved' }).eq('id', imp.id);
      await sb.from('programs').update({ last_refreshed_at: nowIso, last_refresh_status: 'ok' }).eq('id', imp.program_id);
      await refresh();
      setImp({ ...imp, status: 'saved' });
      setMessage(
        `נשמר: ${plan.inserts.length} חדשות, ${plan.updates.length} עודכנו` +
          (plan.notSeen.length ? `, ${plan.notSeen.length} לא נמצאו בדף (לאישור בלשונית "מקורות")` : '') + '.',
      );
    } catch {
      await refresh(); // so a retry merges against what was already saved — no duplicates
      setMessage('השמירה נכשלה. אפשר לנסות שוב — לא ייווצרו כפילויות.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!imp) return;
    await supabaseBrowser().from('imports').update({ status: 'rejected' }).eq('id', imp.id);
    router.push('/import');
  }

  if (imp.status === 'failed' || !imp.extracted) {
    return (
      <p className="rounded-2xl border border-bad/30 bg-bad/10 p-4 text-bad">
        הייבוא הזה נכשל ({imp.error ?? 'ללא פירוט'}). חזרו ללשונית &quot;ייבוא&quot; ונסו שוב, או בחרו &quot;ידני&quot; כדי להקליד את ההטבות בעצמכם.
      </p>
    );
  }

  return (
    <main className="space-y-5 pb-40">
      <PageHeader title={`בדיקת ייבוא · ${program?.name ?? ''}`} icon={ClipboardCheck} />
      <p className="text-xs text-dim">{imp.shared ? 'לקטלוג המשותף — כל המשתמשים יראו' : 'פרטי — רק אתם תראו'}</p>
      <p className="text-sm text-muted">
        {imp.source === 'manual' ? 'הוספה ידנית.' : `${rows.length} הטבות נמצאו${imp.is_refresh ? ' (רענון)' : ''}.`} בדקו, תקנו או בטלו סימון לפני שמירה.
      </p>

      <section className="space-y-2">
        <SectionTitle>חנויות חדשות</SectionTitle>
        {newStores.map((s, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-panel p-2">
            <input aria-label="שם בעברית" placeholder="שם בעברית" value={s.name_he} onChange={(e) => updateStore(i, { name_he: e.target.value })} className={field} />
            <input aria-label="שם באנגלית" placeholder="English name" dir="ltr" value={s.name_en} onChange={(e) => updateStore(i, { name_en: e.target.value })} className={field} />
            <select aria-label="קטגוריה" value={s.category} onChange={(e) => updateStore(i, { category: e.target.value as Category })} className={field}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        ))}
        <button onClick={() => setNewStores((ss) => [...ss, EMPTY_STORE])} className="flex items-center gap-1 text-sm text-mint"><Plus size={14} aria-hidden /> חנות חדשה</button>
      </section>

      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className={`space-y-2 rounded-2xl border bg-panel p-3 ${problems[i].length ? 'border-bad/50' : 'border-line'} ${r.approved ? '' : 'opacity-50'}`}>
            <label className="flex items-center gap-2 font-semibold accent-mint">
              <input type="checkbox" checked={r.approved} onChange={(e) => update(i, { approved: e.target.checked })} />
              לשמור
            </label>
            <input aria-label="כותרת" placeholder="כותרת, למשל: 10% הנחה" value={r.title} onChange={(e) => update(i, { title: e.target.value })} className={field} />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="חנות או קטגוריה" value={scopeValue(r)} onChange={(e) => update(i, scopePatch(e.target.value))} className={field}>
                <option value="">כל החנויות</option>
                <optgroup label="חנויות חדשות">
                  {newStores.map((s, j) => <option key={j} value={`n:${j}`}>{s.name_he || s.name_en || `חנות ${j + 1}`} (חדשה)</option>)}
                </optgroup>
                <optgroup label="קטגוריה">
                  {CATEGORIES.map((c) => <option key={c} value={`c:${c}`}>{CATEGORY_LABELS[c]}</option>)}
                </optgroup>
                <optgroup label="חנויות">
                  {stores.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name_he}</option>)}
                </optgroup>
              </select>
              <select aria-label="סוג" value={r.type} onChange={(e) => update(i, { type: e.target.value as BenefitType })} className={field}>
                {BENEFIT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
              <input aria-label="ערך (% או ₪)" inputMode="decimal" placeholder="ערך (% או ₪)" value={r.value ?? ''}
                onChange={(e) => update(i, { value: num(e.target.value) })} className={field} />
              <input aria-label="מינימום קנייה ₪" inputMode="decimal" placeholder="מינימום ₪" value={r.min_spend ?? ''}
                onChange={(e) => update(i, { min_spend: num(e.target.value) })} className={field} />
              <input aria-label="תקרת הנחה ₪" inputMode="decimal" placeholder="תקרה ₪" value={r.max_discount ?? ''}
                onChange={(e) => update(i, { max_discount: num(e.target.value) })} className={field} />
              <select aria-label="דרישה" value={r.requires} onChange={(e) => update(i, { requires: e.target.value as Requires })} className={field}>
                {REQUIRES.map((q) => <option key={q} value={q}>{REQUIRES_LABELS[q]}</option>)}
              </select>
              <input aria-label="קוד קופון" dir="ltr" placeholder="קוד קופון" value={r.coupon_code ?? ''}
                onChange={(e) => update(i, { coupon_code: e.target.value || null })} className={field} />
              <select aria-label="מתי" value={r.timing} onChange={(e) => update(i, { timing: e.target.value as Timing })} className={field}>
                {TIMINGS.map((t) => <option key={t} value={t}>{TIMING_LABELS[t]}</option>)}
              </select>
              <label className="col-span-2 text-sm text-muted">
                בתוקף עד
                <input type="date" value={r.valid_until ?? ''} onChange={(e) => update(i, { valid_until: e.target.value || null })} className={field} />
              </label>
            </div>
            <textarea aria-label="תנאים" rows={2} placeholder="תנאים" value={r.conditions ?? ''}
              onChange={(e) => update(i, { conditions: e.target.value || null })} className={field} />
            {problems[i].length > 0 && (
              <ul className="space-y-0.5 text-sm text-bad">{problems[i].map((p) => <li key={p} className="flex items-center gap-1"><TriangleAlert size={14} aria-hidden /> {p}</li>)}</ul>
            )}
          </li>
        ))}
      </ul>
      {imp.status === 'pending_review' && (
        <button onClick={() => setRows((rs) => [...rs, blankRow()])} className="flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-line p-3 text-mint hover:border-mint">
          <Plus size={16} aria-hidden /> הוספת הטבה
        </button>
      )}

      <div className="fixed inset-x-0 bottom-[84px] z-10 mx-auto flex max-w-xl gap-2 px-4"><div className="flex flex-1 gap-2 rounded-2xl border border-line bg-panel/95 p-2 backdrop-blur">
        {imp.status === 'pending_review' ? (
          <>
            <Button disabled={!canSave} loading={busy} onClick={save} className="flex-1">
              {busy ? 'שומר…' : `שמירת ${approvedCount} הטבות`}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={reject}>דחייה</Button>
          </>
        ) : (
          <p className="flex-1 rounded-xl bg-mint/10 p-3 text-mint">{message ?? 'הייבוא הזה כבר טופל.'}</p>
        )}
      </div>
      </div>
      {imp.status === 'pending_review' && message && <Notice tone="error">{message}</Notice>}
    </main>
  );
}
