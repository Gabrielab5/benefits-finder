'use client';
import { useState } from 'react';
import { KIND_LABELS } from '@/lib/core/labels';
import type { WalletItem } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

interface Draft {
  id?: string;
  name: string;
  type: WalletItem['type'];
  last4: string;
  nickname: string;
  color: string;
  program_ids: string[];
}
const EMPTY: Draft = { name: '', type: 'card', last4: '', nickname: '', color: '#1d4ed8', program_ids: [] };

export default function WalletPage() {
  const { snapshot, online, refresh } = useSnap();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;
  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));

  async function save(d: Draft) {
    if (!d.name.trim()) return setError('חסר שם.');
    if (d.last4 && !/^\d{4}$/.test(d.last4)) return setError('אפשר לשמור רק 4 ספרות אחרונות.');
    const row = {
      name: d.name.trim(), type: d.type, last4: d.last4 || null, nickname: d.nickname.trim() || null,
      color: d.color, program_ids: d.program_ids,
    };
    const sb = supabaseBrowser();
    const { error } = d.id
      ? await sb.from('wallet_items').update(row).eq('id', d.id)
      : await sb.from('wallet_items').insert(row);
    if (error) return setError('השמירה נכשלה.');
    setDraft(null);
    setError(null);
    await refresh();
  }

  async function remove(item: WalletItem) {
    if (!confirm(`למחוק את "${item.name}" מהארנק?`)) return;
    const { error } = await supabaseBrowser().from('wallet_items').delete().eq('id', item.id);
    if (error) return setError('המחיקה נכשלה.');
    await refresh();
  }

  const edit = (w: WalletItem) =>
    setDraft({
      id: w.id, name: w.name, type: w.type, last4: w.last4 ?? '', nickname: w.nickname ?? '',
      color: w.color ?? EMPTY.color, program_ids: w.program_ids,
    });
  const toggleProgram = (id: string) =>
    setDraft((d) => d && {
      ...d,
      program_ids: d.program_ids.includes(id) ? d.program_ids.filter((x) => x !== id) : [...d.program_ids, id],
    });

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">הארנק שלי</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">אין חיבור — אפשר רק לצפות.</p>}

      {(['card', 'membership'] as const).map((type) => (
        <section key={type} className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">{type === 'card' ? 'כרטיסי אשראי' : 'חברויות'}</h2>
          <ul className="space-y-2">
            {snapshot.wallet.filter((w) => w.type === type).map((w) => (
              <li key={w.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="h-8 w-2 rounded" style={{ background: w.color ?? '#9ca3af' }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{w.nickname || w.name}{w.last4 ? ` ••${w.last4}` : ''}</p>
                  <p className="text-sm text-gray-600">
                    {w.program_ids.map((id) => programs.get(id)?.name).filter(Boolean).join(' · ') || 'לא משויך לתוכנית'}
                  </p>
                </div>
                <button disabled={!online} onClick={() => edit(w)} className="text-sm text-blue-700 disabled:opacity-40">עריכה</button>
                <button disabled={!online} onClick={() => remove(w)} className="text-sm text-red-700 disabled:opacity-40">מחיקה</button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!draft && (
        <button disabled={!online} onClick={() => setDraft(EMPTY)}
          className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">הוספה לארנק</button>
      )}

      {draft && (
        <section className="space-y-3 rounded-xl bg-white p-4 shadow">
          <label className="block">
            <span className="text-sm text-gray-600">שם</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">סוג</span>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as WalletItem['type'] })}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2">
              <option value="card">כרטיס אשראי</option>
              <option value="membership">חברות במועדון</option>
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-sm text-gray-600">כינוי</span>
              <input value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
            </label>
            <label className="w-28">
              <span className="text-sm text-gray-600">4 ספרות אחרונות</span>
              <input inputMode="numeric" maxLength={4} dir="ltr" value={draft.last4}
                onChange={(e) => setDraft({ ...draft, last4: e.target.value.replace(/\D/g, '') })}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
            </label>
            <label className="w-16">
              <span className="text-sm text-gray-600">צבע</span>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="mt-1 h-10 w-full" />
            </label>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm text-gray-600">אילו הטבות זה פותח?</legend>
            {snapshot.programs.length === 0 && <p className="text-sm text-gray-500">הוסיפו תוכנית בלשונית &quot;מקורות&quot;.</p>}
            {snapshot.programs.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" checked={draft.program_ids.includes(p.id)} onChange={() => toggleProgram(p.id)} />
                {p.name} <span className="text-xs text-gray-500">({KIND_LABELS[p.kind]})</span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button onClick={() => save(draft)} className="flex-1 rounded-xl bg-blue-700 p-3 font-semibold text-white">שמירה</button>
            <button onClick={() => { setDraft(null); setError(null); }} className="rounded-xl bg-gray-200 px-4">ביטול</button>
          </div>
        </section>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </main>
  );
}
