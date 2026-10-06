'use client';
import { useState } from 'react';
import Link from 'next/link';
import BenefitCard from '@/components/BenefitCard';
import { isBirthdayMonth, israelToday } from '@/lib/core/dates';
import { searchStores } from '@/lib/core/normalize';
import { birthdayBenefits, rankForStore, type Row } from '@/lib/core/rank';
import { parseAmount } from '@/lib/core/savings';
import type { Store } from '@/lib/core/types';
import { useSnap } from '@/lib/useSnapshot';

export default function WhereAmIPage() {
  const { snapshot, online, error } = useSnap();
  const [query, setQuery] = useState('');
  const [store, setStore] = useState<Store | null>(null);
  const [amountText, setAmountText] = useState('');

  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;

  const today = israelToday();
  const amount = parseAmount(amountText);
  const birthMonth = snapshot.profile?.birth_month ?? null;
  const matches = store ? [] : searchStores(snapshot.stores, query);
  const result = store ? rankForStore(snapshot, store, amount, today) : null;
  const birthdayCount = isBirthdayMonth(birthMonth, today) ? birthdayBenefits(snapshot, today).length : 0;

  const section = (title: string, rows: Row[], testId: string) =>
    rows.length > 0 && (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">{title}</h2>
        <ul data-testid={testId} className="space-y-2">
          {rows.map((r) => <BenefitCard key={r.benefit.id} {...r} store={store} birthMonth={birthMonth} />)}
        </ul>
      </section>
    );

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">איפה אני</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">אין חיבור — מוצגים הנתונים האחרונים שנשמרו.</p>}
      {online && error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {birthdayCount > 0 && (
        <Link href="/benefits?birthday=1" className="block rounded-xl bg-pink-50 p-3 font-semibold text-pink-800">
          🎂 חודש יום ההולדת — {birthdayCount} הטבות יום הולדת מחכות לכם
        </Link>
      )}

      {store ? (
        <div className="flex items-center justify-between rounded-xl bg-blue-50 p-3">
          <span className="font-semibold">{store.name_he} · {store.name_en}</span>
          <button onClick={() => { setStore(null); setQuery(''); }} className="text-sm text-blue-700">החלפת חנות ✕</button>
        </div>
      ) : (
        <div>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="איפה אתם קונים?"
            aria-label="חיפוש חנות" className="w-full rounded-xl border border-gray-300 p-3 text-lg" />
          {query.trim() && (
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {matches.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setStore(s)} className="w-full p-3 text-start">
                    {s.name_he} <span className="text-gray-500">· {s.name_en}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="p-3 text-sm text-gray-500">לא נמצאה חנות. אפשר לייבא את ההטבות שלה בלשונית &quot;ייבוא&quot;.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {store && (
        <label className="block">
          <span className="text-sm text-gray-600">כמה אתם מוציאים? (₪)</span>
          <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-lg" dir="ltr" />
        </label>
      )}

      {result && (
        <>
          {result.pay.length > 0 && !amount && (
            <p className="text-sm text-gray-500">הזינו סכום כדי לראות כמה תחסכו בכל כרטיס.</p>
          )}
          {section('שלמו עם', result.pay, 'pay-results')}
          {section('הטבות נוספות', result.other, 'other-results')}
          {section('הציגו או הזינו קוד', result.show, 'show-results')}
          {result.pay.length + result.other.length + result.show.length === 0 && (
            <p className="text-gray-500">אין לכם הטבות בחנות הזו.</p>
          )}
        </>
      )}
    </main>
  );
}
