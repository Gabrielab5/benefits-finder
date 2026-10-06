'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { israelToday } from '@/lib/core/dates';
import { CATEGORY_LABELS, REQUIRES_LABELS, TIMING_LABELS, TYPE_LABELS } from '@/lib/core/labels';
import { mergeImport } from '@/lib/core/merge';
import { findStoreByName } from '@/lib/core/normalize';
import {
  blankRow, rowProblems, scopePatch, scopeValue, toIncoming, type ImportRow, type NewStoreDraft, type ReviewRow,
} from '@/lib/core/review';
import { BENEFIT_TYPES, CATEGORIES, REQUIRES, TIMINGS, type BenefitType, type Category, type Requires, type Timing } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

const field = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm';
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

  if (!snapshot || !imp) return <p className="p-4 text-gray-500">טוען…</p>;

  const program = snapshot.programs.find((p) => p.id === imp.program_id);
  const ctx = { storeIds: new Set(snapshot.stores.map((s) => s.id)), newStores, todayIso: israelToday().iso };
  const problems = rows.map((r) => (r.approved ? rowProblems(r, ctx) : []));
  const approvedCount = rows.filter((r) => r.approved).length;
  const canSave = imp.status === 'pending_review' && approvedCount > 0 && problems.every((p) => p.length === 0) && !busy;
  const stores = [...snapshot.stores].sort((a, b) => a.name_he.localeCompare(b.name_he, 'he'));
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

      const newStoreIds: (string | undefined)[] = [];
      const usedIndexes = new Set(approved.map((r) => r.new_store_index).filter((i): i is number => i != null));
      for (const i of usedIndexes) {
        const draft = newStores[i];
        const existing = findStoreByName(snapshot.stores, draft.name_he) ?? findStoreByName(snapshot.stores, draft.name_en);
        if (existing) {
          newStoreIds[i] = existing.id;
          continue;
        }
        const { data, error } = await sb.from('stores').insert({
          name_he: draft.name_he.trim(), name_en: draft.name_en.trim(), aliases: draft.aliases,
          category: draft.category, channel: draft.channel,
        }).select('id').single();
        if (error) throw error;
        newStoreIds[i] = data.id;
      }

      const incoming = approved.map((r) => toIncoming(r, newStoreIds, imp.raw_input.url));
      const existing = snapshot.benefits.filter((b) => b.program_id === imp.program_id);
      const plan = mergeImport(existing, incoming, { isRefresh: imp.is_refresh, nowIso });

      if (plan.inserts.length > 0) {
        const { error } = await sb.from('benefits')
          .insert(plan.inserts.map((b) => ({ ...b, program_id: imp.program_id, last_verified_at: nowIso })));
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
      <p className="p-4 text-red-700">
        הייבוא הזה נכשל ({imp.error ?? 'ללא פירוט'}). חזרו ללשונית &quot;ייבוא&quot; ונסו שוב, או בחרו &quot;ידני&quot; כדי להקליד את ההטבות בעצמכם.
      </p>
    );
  }

  return (
    <main className="space-y-4 p-4 pb-32">
      <h1 className="text-xl font-bold">בדיקת ייבוא · {program?.name}</h1>
      <p className="text-sm text-gray-600">
        {imp.source === 'manual' ? 'הוספה ידנית.' : `${rows.length} הטבות נמצאו${imp.is_refresh ? ' (רענון)' : ''}.`} בדקו, תקנו או בטלו סימון לפני שמירה.
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">חנויות חדשות</h2>
        {newStores.map((s, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-sm">
            <input aria-label="שם בעברית" placeholder="שם בעברית" value={s.name_he} onChange={(e) => updateStore(i, { name_he: e.target.value })} className={field} />
            <input aria-label="שם באנגלית" placeholder="English name" dir="ltr" value={s.name_en} onChange={(e) => updateStore(i, { name_en: e.target.value })} className={field} />
            <select aria-label="קטגוריה" value={s.category} onChange={(e) => updateStore(i, { category: e.target.value as Category })} className={field}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        ))}
        <button onClick={() => setNewStores((ss) => [...ss, EMPTY_STORE])} className="text-sm text-blue-700">➕ חנות חדשה</button>
      </section>

      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className={`space-y-2 rounded-xl bg-white p-3 shadow-sm ${r.approved ? '' : 'opacity-50'}`}>
            <label className="flex items-center gap-2 font-semibold">
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
              <label className="col-span-2 text-sm text-gray-600">
                בתוקף עד
                <input type="date" value={r.valid_until ?? ''} onChange={(e) => update(i, { valid_until: e.target.value || null })} className={field} />
              </label>
            </div>
            <textarea aria-label="תנאים" rows={2} placeholder="תנאים" value={r.conditions ?? ''}
              onChange={(e) => update(i, { conditions: e.target.value || null })} className={field} />
            {problems[i].length > 0 && (
              <ul className="text-sm text-red-700">{problems[i].map((p) => <li key={p}>⚠️ {p}</li>)}</ul>
            )}
          </li>
        ))}
      </ul>
      {imp.status === 'pending_review' && (
        <button onClick={() => setRows((rs) => [...rs, blankRow()])} className="w-full rounded-xl border border-dashed border-blue-400 p-3 text-blue-700">
          ➕ הוספת הטבה
        </button>
      )}

      <div className="fixed inset-x-0 bottom-16 mx-auto flex max-w-xl gap-2 bg-gray-50 p-3">
        {imp.status === 'pending_review' ? (
          <>
            <button disabled={!canSave} onClick={save} className="flex-1 rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
              {busy ? 'שומר…' : `שמירת ${approvedCount} הטבות`}
            </button>
            <button disabled={busy} onClick={reject} className="rounded-xl bg-gray-200 px-4">דחייה</button>
          </>
        ) : (
          <p className="flex-1 rounded-xl bg-green-50 p-3 text-green-800">{message ?? 'הייבוא הזה כבר טופל.'}</p>
        )}
      </div>
      {imp.status === 'pending_review' && message && <p className="text-sm text-red-700">{message}</p>}
    </main>
  );
}
