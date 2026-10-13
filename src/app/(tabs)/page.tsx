'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Gift, Search, Store as StoreIcon, WifiOff, X } from 'lucide-react';
import BenefitCard from '@/components/BenefitCard';
import HomeGuide from '@/components/HomeGuide';
import { Chip, Loading, Notice, SectionTitle, field } from '@/components/ui';
import { israelToday } from '@/lib/core/dates';
import { giftCardPlan } from '@/lib/core/giftcards';
import { CATEGORY_LABELS, WINDOW_ICON, shekel } from '@/lib/core/labels';
import { searchStores } from '@/lib/core/normalize';
import { bestRowId, eligibleItems, rankForStore, type Row } from '@/lib/core/rank';
import { parseAmount } from '@/lib/core/savings';
import { activeDateBenefits } from '@/lib/core/specialDates';
import type { Store } from '@/lib/core/types';
import { useSnap } from '@/lib/useSnapshot';

const QUICK_AMOUNTS = [100, 300, 500];

export default function WhereAmIPage() {
  const { snapshot, online, error } = useSnap();
  const [query, setQuery] = useState('');
  const [store, setStore] = useState<Store | null>(null);
  const [amountText, setAmountText] = useState('');

  if (!snapshot) return <Loading />;

  const today = israelToday();
  const amount = parseAmount(amountText);
  const matches = store ? [] : searchStores(snapshot.stores, query);
  const result = store ? rankForStore(snapshot, store, amount, today) : null;
  const best = result ? bestRowId(result) : null;
  const plan = store && amount ? giftCardPlan(snapshot, store, amount, today) : null;
  const windows = activeDateBenefits(snapshot, today);

  const section = (title: string, rows: Row[], testId: string) =>
    rows.length > 0 && (
      <section className="space-y-2">
        <SectionTitle>{title}</SectionTitle>
        <ul data-testid={testId} className="space-y-2">
          {rows.map((r) => (
            <BenefitCard key={r.benefit.id} {...r} store={store} best={r.benefit.id === best} />
          ))}
        </ul>
      </section>
    );

  return (
    <main className="space-y-5">
      <header className="pt-2">
        <p className="text-sm text-muted">שלום 👋</p>
        <h1 className="text-2xl font-bold">איפה אני?</h1>
      </header>

      {!online && (
        <Notice tone="warn"><WifiOff size={14} className="me-1 inline" aria-hidden />אין חיבור — מוצגים הנתונים האחרונים שנשמרו.</Notice>
      )}
      {online && error && <Notice tone="error">{error}</Notice>}
      {windows.length > 0 && (
        <Link href="/benefits?birthday=1"
          className="flex items-center gap-3 rounded-2xl border border-party/30 bg-party/10 p-3.5 text-party">
          <span className="flex-1 space-y-1">
            {windows.map(({ window, benefits }) => (
              <span key={window.key} className="flex items-center gap-2 font-semibold">
                <span aria-hidden>{WINDOW_ICON[window.kind]}</span> {window.label} — {benefits.length} הטבות פעילות החודש
              </span>
            ))}
          </span>
          <ChevronLeft size={18} aria-hidden />
        </Link>
      )}

      {store ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-3.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-panel-2 text-mint"><StoreIcon size={20} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{store.name_he}</p>
            <p className="text-xs text-muted">{store.name_en} · {CATEGORY_LABELS[store.category]}</p>
          </div>
          <button onClick={() => { setStore(null); setQuery(''); }} aria-label="החלפת חנות"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-panel-2 hover:text-fg">
            <X size={18} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search size={20} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="איפה אתם קונים?"
              aria-label="חיפוש חנות" className={`${field} py-3.5 ps-11 text-lg`} />
          </div>
          {query.trim() && (
            <ul className="overflow-hidden rounded-2xl border border-line bg-panel">
              {matches.map((s) => (
                <li key={s.id} className="border-b border-line last:border-0">
                  <button onClick={() => setStore(s)} className="flex w-full items-center gap-3 p-3 text-start hover:bg-panel-2">
                    <StoreIcon size={16} className="text-dim" aria-hidden />
                    <span>{s.name_he} <span className="text-muted">· {s.name_en}</span></span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="p-3 text-sm text-muted">לא נמצאה חנות. אפשר לייבא את ההטבות שלה בלשונית &quot;ייבוא&quot;.</li>
              )}
            </ul>
          )}
          {!query.trim() && (
            <p className="px-1 text-sm text-dim">{snapshot.stores.length} חנויות · {snapshot.benefits.filter((b) => eligibleItems(b, snapshot.wallet).length > 0).length} הטבות שהארנק שלכם פותח</p>
          )}
        </div>
      )}

      <div hidden={!!store || !!query.trim()}><HomeGuide /></div>

      {store && (
        <div className="space-y-2">
          <label className="block">
            <span className="text-sm text-muted">כמה אתם מוציאים? (₪)</span>
            <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} dir="ltr"
              placeholder="0" className={`${field} mt-1 text-lg`} />
          </label>
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((n) => (
              <Chip key={n} active={amount === n} onClick={() => setAmountText(String(n))}>₪{n}</Chip>
            ))}
          </div>
        </div>
      )}

      {result && (
        <>
          {result.pay.length + result.show.length > 0 && !amount && (
            <p className="text-sm text-dim">הזינו סכום כדי לראות כמה תחסכו בכל כרטיס.</p>
          )}
          {plan && (
            <section data-testid="gift-plan" className="space-y-2 rounded-2xl border border-party/40 bg-party/10 p-3.5">
              <p className="flex items-center gap-2 font-semibold text-party"><Gift size={18} aria-hidden /> עם הגיפטקארד שלכם</p>
              <ul className="space-y-1 text-sm">
                {plan.uses.map((u) => (
                  <li key={u.card.id}>• ממשו <span className="font-semibold">{shekel(u.amount)}</span> מ{u.card.name}</li>
                ))}
                {plan.discount && (
                  <li>
                    • {plan.discount.row.benefit.requires === 'pay_with_card' ? 'את היתרה שלמו עם' : 'הציגו'}{' '}
                    {plan.discount.row.items.map((i) => i.nickname || i.name).join(' / ')} — חיסכון {shekel(plan.discount.saved)}
                  </li>
                )}
              </ul>
              <p className="text-sm text-muted">
                {shekel(amount!)} − {shekel(plan.uses.reduce((s, u) => s + u.amount, 0))} גיפטקארד
                {plan.discount ? ` − ${shekel(plan.discount.saved)} הנחה` : ''} ={' '}
                <span className="text-base font-bold text-fg">{shekel(plan.pay)} לתשלום</span>
              </p>
            </section>
          )}
          {section('שלמו עם', result.pay, 'pay-results')}
          {section('הציגו או הזינו קוד', result.show, 'show-results')}
          {section('הטבות נוספות', result.other, 'other-results')}
          {result.pay.length + result.other.length + result.show.length === 0 && (
            <Notice>אין לכם הטבות בחנות הזו.</Notice>
          )}
        </>
      )}
    </main>
  );
}
