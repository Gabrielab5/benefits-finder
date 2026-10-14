'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Gift, Search, Store as StoreIcon, WifiOff, X } from 'lucide-react';
import BenefitCard from '@/components/BenefitCard';
import HomeGuide from '@/components/HomeGuide';
import { Chip, Loading, Notice, SectionTitle, field } from '@/components/ui';
import { addDays, israelToday } from '@/lib/core/dates';
import { giftCardPlan } from '@/lib/core/giftcards';
import { CATEGORY_LABELS, WINDOW_ICON, formatDate, shekel } from '@/lib/core/labels';
import { searchStores } from '@/lib/core/normalize';
import { bestRowId, eligibleItems, rankForStore, type Row } from '@/lib/core/rank';
import { parseAmount } from '@/lib/core/savings';
import { activeDateBenefits } from '@/lib/core/specialDates';
import { useSnap } from '@/lib/useSnapshot';

const QUICK_AMOUNTS = [100, 300, 500];

// The store and amount live in the URL (?store=<id>&amount=<n>): it survives a reload and makes a shareable link.
// The nav links to a bare "/", so the last query is also kept here and restored when you come back from another tab.
let lastQuery = '';

export default function WhereAmIPage() {
  return (
    <Suspense fallback={<Loading />}>
      <WhereAmI />
    </Suspense>
  );
}

function WhereAmI() {
  const { snapshot, online, error } = useSnap();
  const params = useSearchParams();
  const initial = () => (params.has('store') ? params : new URLSearchParams(lastQuery));
  const [query, setQuery] = useState('');
  const [storeId, setStoreId] = useState(() => initial().get('store'));
  const [amountText, setAmountText] = useState(() => initial().get('amount') ?? '');
  const amountInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (storeId) q.set('store', storeId);
    if (storeId && amountText) q.set('amount', amountText);
    lastQuery = q.toString();
    const search = lastQuery ? `?${lastQuery}` : '';
    // The native call syncs with Next's router without scrolling or a server round trip, so it also works offline.
    if (location.search !== search) history.replaceState(null, '', search || location.pathname);
  }, [storeId, amountText]);

  if (!snapshot) return <Loading />;

  const today = israelToday();
  const amount = parseAmount(amountText);
  const store = (storeId && snapshot.stores.find((s) => s.id === storeId)) || null;
  const matches = store ? [] : searchStores(snapshot.stores, query);
  const result = store ? rankForStore(snapshot, store, amount, today) : null;
  const best = result ? bestRowId(result) : null;
  const bestRow = result && best ? [...result.pay, ...result.show].find((r) => r.benefit.id === best) ?? null : null;
  const others = result ? result.pay.length + result.show.length + result.other.length - (bestRow ? 1 : 0) : 0;
  const plan = store && amount ? giftCardPlan(snapshot, store, amount, today) : null;
  const windows = activeDateBenefits(snapshot, today);
  const monthAhead = addDays(today.iso, 30);
  const expiringGifts = (snapshot.giftCards ?? []).filter((c) => c.balance > 0 && c.expires_on && c.expires_on >= today.iso && c.expires_on <= monthAhead);

  // The winner is the answer above, so the groups list everything else.
  const section = (title: string, rows: Row[], testId: string) => {
    const rest = rows.filter((r) => r !== bestRow);
    return rest.length > 0 && (
      <section className="space-y-2">
        <SectionTitle as={bestRow ? 'h3' : 'h2'}>{title}</SectionTitle>
        <ul data-testid={testId} className="space-y-2">
          {rest.map((r) => (
            <BenefitCard key={r.benefit.id} {...r} amount={amount} />
          ))}
        </ul>
      </section>
    );
  };

  const groups = result && (
    <>
      {section('שלמו עם', result.pay, 'pay-results')}
      {section('הציגו או הזינו קוד', result.show, 'show-results')}
      {section('הטבות נוספות', result.other, 'other-results')}
    </>
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

      {expiringGifts.length > 0 && (
        <Link href="/wallet/gift-cards" className="flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-3.5 text-warn">
          <Gift size={18} aria-hidden />
          <span className="flex-1 font-semibold">
            {expiringGifts.length === 1
              ? `${shekel(expiringGifts[0].balance)} ב${expiringGifts[0].name} פג עד ${formatDate(expiringGifts[0].expires_on!)}`
              : `${expiringGifts.length} גיפטקארדים פגים החודש — ${shekel(expiringGifts.reduce((s, c) => s + c.balance, 0))}`}
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
          <button onClick={() => { setStoreId(null); setQuery(''); }} aria-label="החלפת חנות"
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
                  <button onClick={() => setStoreId(s.id)} className="flex w-full items-center gap-3 p-3 text-start hover:bg-panel-2">
                    <StoreIcon size={16} className="text-dim" aria-hidden />
                    <span>{s.name_he} <span className="text-muted">· {s.name_en}</span></span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="space-y-1 p-3 text-sm">
                  <p className="text-fg">לא מצאנו חנות בשם הזה. נסו כתיב אחר או את השם באנגלית.</p>
                  <p className="text-muted">
                    עדיין חסרה? אפשר <Link href="/import" className="text-mint underline underline-offset-2">לייבא את ההטבות שלה</Link>.
                  </p>
                </li>
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
            <input ref={amountInput} inputMode="decimal" enterKeyHint="done" value={amountText} dir="ltr"
              onChange={(e) => setAmountText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              placeholder="0" className={`${field} mt-1 text-lg`} />
          </label>
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((n) => (
              // Drop the phone keyboard so the answer below is in view.
              <Chip key={n} active={amount === n} onClick={() => { setAmountText(String(n)); amountInput.current?.blur(); }}>₪{n}</Chip>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {bestRow && (
            <ul data-testid="answer">
              <BenefitCard {...bestRow} amount={amount} best />
            </ul>
          )}
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
          {bestRow ? (
            others > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-muted">עוד אפשרויות</h2>
                <div className="space-y-5">{groups}</div>
              </section>
            )
          ) : groups}
          {result.pay.length + result.other.length + result.show.length === 0 && (
            <Notice>אין לכם הטבות בחנות הזו.</Notice>
          )}
        </div>
      )}
    </main>
  );
}
