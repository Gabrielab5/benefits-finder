'use client';
import { useState } from 'react';
import { CreditCard, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { Button, Card, Loading, Notice, PageHeader, SectionTitle, field } from '@/components/ui';
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
const EMPTY: Draft = { name: '', type: 'card', last4: '', nickname: '', color: '#3b5bdb', program_ids: [] };

export default function WalletPage() {
  const { snapshot, online, refresh } = useSnap();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!snapshot) return <Loading />;
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
    <main className="space-y-6">
      <PageHeader title="הארנק שלי" subtitle="הכרטיסים והחברויות שלכם" icon={Wallet} />
      {!online && <Notice tone="warn">אין חיבור — אפשר רק לצפות.</Notice>}

      {(['card', 'membership'] as const).map((type) => {
        const list = snapshot.wallet.filter((w) => w.type === type);
        if (list.length === 0) return null;
        return (
          <section key={type} className="space-y-3">
            <SectionTitle>{type === 'card' ? 'כרטיסי אשראי' : 'חברויות ומועדונים'}</SectionTitle>
            <ul className="grid grid-cols-2 gap-3">
              {list.map((w) => {
                const color = w.color ?? '#3b5bdb';
                return (
                  <li key={w.id} className="aspect-[1.6] overflow-hidden rounded-2xl p-3 text-white shadow-lg shadow-black/30"
                    style={{ background: `linear-gradient(140deg, ${color}, ${color}88 60%, #0e1424)` }}>
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-bold drop-shadow">{w.nickname || w.name}</p>
                        <div className="flex shrink-0 gap-1">
                          <button disabled={!online} onClick={() => edit(w)} aria-label={`עריכת ${w.name}`}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-black/25 backdrop-blur disabled:opacity-40">
                            <Pencil size={13} aria-hidden />
                          </button>
                          <button disabled={!online} onClick={() => remove(w)} aria-label={`מחיקת ${w.name}`}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-black/25 backdrop-blur disabled:opacity-40">
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p className="mt-auto line-clamp-1 text-[11px] opacity-80">
                        {w.program_ids.map((id) => programs.get(id)?.name).filter(Boolean).join(' · ') || 'לא משויך לתוכנית'}
                      </p>
                      <div className="flex items-center justify-between">
                        {type === 'card' ? <CreditCard size={16} className="opacity-70" aria-hidden /> : <span />}
                        <p className="font-mono text-xs tracking-widest opacity-90" dir="ltr">{w.last4 ? `•••• ${w.last4}` : ''}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!draft && (
        <Button disabled={!online} onClick={() => setDraft(EMPTY)} className="w-full py-3">
          <Plus size={18} aria-hidden /> הוספה לארנק
        </Button>
      )}

      {draft && (
        <Card className="space-y-4">
          <h2 className="font-semibold">{draft.id ? 'עריכה' : 'הוספה לארנק'}</h2>
          <label className="block">
            <span className="text-sm text-muted">שם</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="סוג">
            {(['card', 'membership'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={draft.type === t} onClick={() => setDraft({ ...draft, type: t })}
                className={`rounded-xl border p-2.5 text-sm ${draft.type === t ? 'border-mint bg-mint/10 text-mint' : 'border-line text-muted'}`}>
                {t === 'card' ? 'כרטיס אשראי' : 'חברות במועדון'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-sm text-muted">כינוי</span>
              <input value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="w-28">
              <span className="text-sm text-muted">4 ספרות</span>
              <input inputMode="numeric" maxLength={4} dir="ltr" value={draft.last4}
                onChange={(e) => setDraft({ ...draft, last4: e.target.value.replace(/\D/g, '') })} className={`${field} mt-1`} />
            </label>
            <label className="w-16">
              <span className="text-sm text-muted">צבע</span>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="mt-1 h-[46px] w-full cursor-pointer rounded-xl border border-line bg-panel-2 p-1" />
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted">אילו הטבות זה פותח?</legend>
            {snapshot.programs.length === 0 && <p className="text-sm text-dim">הוסיפו תוכנית בלשונית &quot;מקורות&quot;.</p>}
            <div className="flex flex-wrap gap-2">
              {snapshot.programs.map((p) => {
                const on = draft.program_ids.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleProgram(p.id)} title={KIND_LABELS[p.kind]}
                    className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-mint bg-mint/10 text-mint' : 'border-line text-muted'}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button onClick={() => save(draft)} className="flex-1">שמירה</Button>
            <Button variant="secondary" onClick={() => { setDraft(null); setError(null); }}>ביטול</Button>
          </div>
        </Card>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </main>
  );
}
