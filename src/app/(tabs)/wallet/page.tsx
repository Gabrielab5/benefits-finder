'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Gift, Pencil, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react';
import CardFace from '@/components/CardFace';
import { MONTHS } from '@/components/DatesForm';
import { Button, Card, Loading, Notice, PageHeader, SectionTitle, field, reveal } from '@/components/ui';
import { needsCatalogUpdate, walletItemFromProduct } from '@/lib/core/catalog';
import { cardMatches, faceArt } from '@/lib/core/cardArt';
import { monthNameHe } from '@/lib/core/dates';
import { KIND_LABELS, retryHint, shekel } from '@/lib/core/labels';
import type { CardProduct, WalletItem } from '@/lib/core/types';
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
  birthday_month: number | null;
}
const EMPTY: Draft = { name: '', type: 'card', last4: '', nickname: '', color: '#3b5bdb', program_ids: [], birthday_month: null };

export default function WalletPage() {
  const { snapshot, online, refresh } = useSnap();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!snapshot) return <Loading />;

  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));
  const products = snapshot.products ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));

  async function run(op: PromiseLike<{ error: unknown }>, fail: string): Promise<boolean> {
    const { error } = await op;
    if (error) {
      setError(`${fail} ${retryHint(navigator.onLine)}`);
      return false;
    }
    setError(null);
    await refresh();
    return true;
  }

  async function save(d: Draft) {
    if (!d.name.trim()) return setError('חסר שם.');
    if (d.last4 && !/^\d{4}$/.test(d.last4)) return setError('אפשר לשמור רק 4 ספרות אחרונות.');
    const row = {
      name: d.name.trim(), type: d.type, last4: d.last4 || null, nickname: d.nickname.trim() || null,
      color: d.color, program_ids: d.program_ids, birthday_month: d.birthday_month,
    };
    const sb = supabaseBrowser();
    const ok = await run(d.id ? sb.from('wallet_items').update(row).eq('id', d.id) : sb.from('wallet_items').insert(row), 'הכרטיס לא נשמר.');
    if (ok) setDraft(null);
  }

  async function addProduct(p: CardProduct) {
    if (await run(supabaseBrowser().from('wallet_items').insert(walletItemFromProduct(p)), 'הכרטיס לא נוסף לארנק.')) {
      setPicking(false);
      setQuery('');
    }
  }

  async function remove(item: WalletItem) {
    if (!confirm(`למחוק את "${item.name}" מהארנק?`)) return;
    if (await run(supabaseBrowser().from('wallet_items').delete().eq('id', item.id), 'הכרטיס לא נמחק.')) setDraft(null);
  }

  const syncFromCatalog = (item: WalletItem, product: CardProduct) =>
    run(supabaseBrowser().from('wallet_items').update({ program_ids: product.program_ids }).eq('id', item.id), 'התוכניות של הכרטיס לא עודכנו.');

  const edit = (w: WalletItem) =>
    setDraft({
      id: w.id, name: w.name, type: w.type, last4: w.last4 ?? '', nickname: w.nickname ?? '',
      color: w.color ?? EMPTY.color, program_ids: w.program_ids, birthday_month: w.birthday_month ?? null,
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

      <Link href="/wallet/gift-cards" className="flex items-center gap-3 rounded-2xl border border-party/30 bg-party/10 p-3.5 text-party">
        <Gift size={20} aria-hidden />
        <span className="flex-1 font-semibold">
          גיפטקארדים
          {(snapshot.giftCards ?? []).length > 0 && (
            <span className="font-normal"> · {shekel((snapshot.giftCards ?? []).reduce((s, c) => s + c.balance, 0))}</span>
          )}
        </span>
        <ChevronLeft size={18} aria-hidden />
      </Link>

      {(['card', 'membership'] as const).map((type) => {
        const list = snapshot.wallet.filter((w) => w.type === type);
        if (list.length === 0) return null;
        return (
          <section key={type} className="space-y-3">
            <SectionTitle>{type === 'card' ? 'כרטיסי אשראי' : 'חברויות ומועדונים'}</SectionTitle>
            <ul className="grid grid-cols-2 gap-3">
              {list.map((w) => {
                const product = w.product_id ? productById.get(w.product_id) : undefined;
                const art = faceArt([w.name, ...w.program_ids.map((id) => programs.get(id)?.name ?? '')], w.color);
                return (
                  <li key={w.id} className="space-y-1.5">
                    {/* The face is the card's picture (or a drawn card); name and programs sit under it, never over a photo. */}
                    <div className="relative">
                      <CardFace art={art} image={product?.image_url} type={w.type} className="aspect-[1.6] shadow-lg shadow-black/30" />
                      <button disabled={!online} onClick={() => edit(w)} aria-label={`עריכת ${w.name}`}
                        className="tap absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/45 text-white backdrop-blur disabled:opacity-40">
                        <Pencil size={13} aria-hidden />
                      </button>
                      {w.last4 && (
                        <p className="absolute bottom-2 end-2 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-xs tracking-widest text-white" dir="ltr">
                          •••• {w.last4}
                        </p>
                      )}
                    </div>
                    <div className="px-0.5">
                      <p className="truncate text-sm font-bold">{w.nickname || w.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {w.birthday_month ? `🎂 ${monthNameHe(w.birthday_month)} · ` : ''}
                        {w.program_ids.map((id) => programs.get(id)?.name).filter(Boolean).join(' · ') || 'לא משויך לתוכנית'}
                      </p>
                    </div>
                    {product && needsCatalogUpdate(w, product) && (
                      <button disabled={!online} onClick={() => syncFromCatalog(w, product)}
                        className="tap flex w-full items-center justify-center gap-1 rounded-xl border border-mint/40 py-1.5 text-xs text-mint">
                        <RefreshCw size={12} aria-hidden /> עדכון מהקטלוג
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {snapshot.wallet.length === 0 && !draft && !picking && (
        <p className="text-sm text-muted">הארנק עדיין ריק. הוסיפו את הכרטיס או המועדון הראשון, ונראה לכם בכל חנות באיזה מהם להשתמש.</p>
      )}
      {!draft && !picking && (
        <Button disabled={!online} onClick={() => setPicking(true)} className="w-full py-3">
          <Plus size={18} aria-hidden /> הוספה לארנק
        </Button>
      )}

      {picking && (
        <Card className="space-y-3">
          <h2 className="font-semibold">מה להוסיף?</h2>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input ref={reveal} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש כרטיס או מועדון"
              aria-label="חיפוש כרטיס או מועדון" className={`${field} ps-10`} />
          </div>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {products.filter((p) => cardMatches(p.name, query)).map((p) => {
              return (
                <li key={p.id}>
                  <button onClick={() => addProduct(p)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 p-2.5 text-start hover:border-mint">
                    <CardFace art={faceArt([p.name])} image={p.image_url} type={p.type} small className="h-7 w-11 shrink-0" />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-dim">{p.type === 'card' ? 'כרטיס' : 'מועדון'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setPicking(false); setDraft(EMPTY); }} className="flex-1">משהו אחר (פרטי)</Button>
            <Button variant="ghost" onClick={() => { setPicking(false); setQuery(''); }}>ביטול</Button>
          </div>
        </Card>
      )}

      {draft && (
        <Card key={draft.id ?? 'new'} className="space-y-4">
          <h2 className="font-semibold">{draft.id ? 'עריכה' : 'הוספה לארנק'}</h2>
          <label className="block">
            <span className="text-sm text-muted">שם</span>
            <input ref={reveal} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} mt-1`} />
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
                onChange={(e) => setDraft({ ...draft, last4: e.target.value.replace(/\D/g, '') })} className={`${field} mt-1 text-end`} />
            </label>
            <label className="w-16">
              <span className="text-sm text-muted">צבע</span>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="mt-1 h-[46px] w-full cursor-pointer rounded-xl border border-line bg-panel-2 p-1" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-muted">🎂 חודש יום הולדת במועדון הזה</span>
            <select value={draft.birthday_month ?? ''} onChange={(e) => setDraft({ ...draft, birthday_month: e.target.value ? Number(e.target.value) : null })}
              aria-label="חודש יום הולדת במועדון הזה" className={`${field} mt-1`}>
              <option value="">כמו יום ההולדת שלי</option>
              {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted">אילו הטבות זה פותח?</legend>
            {snapshot.programs.length === 0 && <p className="text-sm text-dim">הוסיפו תוכנית בעמוד &quot;הקטלוג&quot; (בלשונית &quot;עוד&quot;).</p>}
            <div className="flex flex-wrap gap-2">
              {snapshot.programs.map((p) => {
                const on = draft.program_ids.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleProgram(p.id)} title={KIND_LABELS[p.kind]}
                    className={`tap rounded-full border px-3 py-1.5 text-sm ${on ? 'border-mint bg-mint/10 text-mint' : 'border-line text-muted'}`}>
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
          {/* Delete lives here, not on the card face, so a tap meant for edit can't hit it. */}
          {draft.id && (
            <Button variant="danger" disabled={!online} onClick={() => { const w = snapshot.wallet.find((x) => x.id === draft.id); if (w) remove(w); }} className="w-full">
              <Trash2 size={16} aria-hidden /> מחיקה מהארנק
            </Button>
          )}
        </Card>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </main>
  );
}
