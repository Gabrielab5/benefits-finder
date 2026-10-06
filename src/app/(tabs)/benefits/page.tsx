'use client';
import { useEffect, useState } from 'react';
import BenefitCard from '@/components/BenefitCard';
import { browseBenefits, EMPTY_FILTERS, type BrowseFilters } from '@/lib/core/browse';
import { israelToday } from '@/lib/core/dates';
import { CATEGORY_LABELS, TYPE_LABELS } from '@/lib/core/labels';
import { BENEFIT_TYPES, CATEGORIES, type BenefitType, type Category } from '@/lib/core/types';
import { useSnap } from '@/lib/useSnapshot';

const PAGE = 100;
const field = 'w-full rounded-lg border border-gray-300 bg-white p-2';
type BoolKey = 'birthday' | 'expiringThisWeek' | 'recent' | 'onlyMine';
const CHECKS: [BoolKey, string][] = [
  ['birthday', '🎂 הטבות יום הולדת'],
  ['expiringThisWeek', 'פגות השבוע'],
  ['recent', 'נוספו לאחרונה'],
  ['onlyMine', 'רק מה שהארנק שלי פותח'],
];

export default function BenefitsPage() {
  const { snapshot } = useSnap();
  const [f, setF] = useState<BrowseFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    // Read the query string without useSearchParams (which would need a Suspense boundary).
    if (new URLSearchParams(window.location.search).get('birthday')) setF((x) => ({ ...x, birthday: true }));
  }, []);

  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;

  const set = <K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) => {
    setF((x) => ({ ...x, [key]: value }));
    setLimit(PAGE);
  };
  const rows = browseBenefits(snapshot, f, israelToday(), new Date());
  const birthMonth = snapshot.profile?.birth_month ?? null;

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">כל ההטבות</h1>
      <input type="search" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="חיפוש חנות, תוכנית או הטבה"
        aria-label="חיפוש" className="w-full rounded-xl border border-gray-300 p-3" />

      <details className="rounded-xl bg-white p-3 shadow-sm">
        <summary className="cursor-pointer font-semibold">סינון</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select aria-label="תוכנית" value={f.programId ?? ''} onChange={(e) => set('programId', e.target.value || null)} className={field}>
            <option value="">כל התוכניות</option>
            {snapshot.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="כרטיס או חברות" value={f.walletItemId ?? ''} onChange={(e) => set('walletItemId', e.target.value || null)} className={field}>
            <option value="">כל הארנק</option>
            {snapshot.wallet.map((w) => <option key={w.id} value={w.id}>{w.nickname || w.name}</option>)}
          </select>
          <select aria-label="קטגוריה" value={f.category ?? ''} onChange={(e) => set('category', (e.target.value || null) as Category | null)} className={field}>
            <option value="">כל הקטגוריות</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <select aria-label="סוג הטבה" value={f.type ?? ''} onChange={(e) => set('type', (e.target.value || null) as BenefitType | null)} className={field}>
            <option value="">כל הסוגים</option>
            {BENEFIT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select aria-label="איפה" value={f.channel ?? ''} onChange={(e) => set('channel', (e.target.value || null) as BrowseFilters['channel'])} className={field}>
            <option value="">בחנות ואונליין</option>
            <option value="in_store">בחנות</option>
            <option value="online">אונליין</option>
          </select>
        </div>
        <div className="mt-3 space-y-1">
          {CHECKS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={f[key]} onChange={(e) => set(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <button onClick={() => { setF(EMPTY_FILTERS); setLimit(PAGE); }} className="mt-3 text-sm text-blue-700">ניקוי סינון</button>
      </details>

      <p className="text-sm text-gray-500">{rows.length} הטבות</p>
      <ul className="space-y-2">
        {rows.slice(0, limit).map((r) => (
          <BenefitCard key={r.benefit.id} benefit={r.benefit} program={r.program} items={r.items} store={r.store}
            savings={null} birthdayLocked={r.birthdayLocked} birthMonth={birthMonth} />
        ))}
      </ul>
      {rows.length > limit && (
        <button onClick={() => setLimit(limit + PAGE)} className="w-full rounded-xl bg-gray-200 p-3">עוד הטבות</button>
      )}
    </main>
  );
}
