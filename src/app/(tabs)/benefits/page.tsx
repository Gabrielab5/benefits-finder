'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, List, Search, SlidersHorizontal } from 'lucide-react';
import BenefitCard from '@/components/BenefitCard';
import { Button, Chip, Loading, PageHeader, field } from '@/components/ui';
import { browseBenefits, EMPTY_FILTERS, type BrowseFilters } from '@/lib/core/browse';
import { israelToday } from '@/lib/core/dates';
import { CATEGORY_LABELS, TYPE_LABELS } from '@/lib/core/labels';
import { BENEFIT_TYPES, CATEGORIES, type BenefitType, type Category } from '@/lib/core/types';
import { useSnap } from '@/lib/useSnapshot';

const PAGE = 100;
type BoolKey = 'birthday' | 'expiringThisWeek' | 'recent' | 'onlyMine';
const CHECKS: [BoolKey, string][] = [
  ['onlyMine', 'רק שלי'],
  ['birthday', '🎉 תאריכים מיוחדים'],
  ['expiringThisWeek', 'פגות השבוע'],
  ['recent', 'חדשות'],
];

export default function BenefitsPage() {
  const { snapshot } = useSnap();
  const [f, setF] = useState<BrowseFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    // Read the query string without useSearchParams (which would need a Suspense boundary).
    const q = new URLSearchParams(window.location.search);
    setF((x) => ({ ...x, birthday: x.birthday || q.has('birthday'), expiringThisWeek: x.expiringThisWeek || q.has('expiring'),
      recent: x.recent || q.has('recent') }));
  }, []);

  if (!snapshot) return <Loading />;

  const set = <K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) => {
    setF((x) => ({ ...x, [key]: value }));
    setLimit(PAGE);
  };
  const rows = browseBenefits(snapshot, f, israelToday(), new Date());
  const extraFilters = [f.programId, f.walletItemId, f.category, f.type, f.channel].filter(Boolean).length;

  return (
    <main className="space-y-4">
      <PageHeader title="כל ההטבות" subtitle={`${rows.length} הטבות`} icon={List} />

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
        <input type="search" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="חנות, תוכנית או הטבה"
          aria-label="חיפוש" className={`${field} ps-10`} />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHECKS.map(([key, label]) => (
          <Chip key={key} active={f[key]} onClick={() => set(key, !f[key])}>{label}</Chip>
        ))}
      </div>

      <details className="group rounded-2xl border border-line bg-panel">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm text-muted">
          <SlidersHorizontal size={16} aria-hidden /> עוד סינונים{extraFilters ? ` (${extraFilters})` : ''}
          <ChevronDown size={16} className="ms-auto transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
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
          <Button variant="ghost" onClick={() => { setF(EMPTY_FILTERS); setLimit(PAGE); }}>ניקוי הכל</Button>
        </div>
      </details>

      <ul className="space-y-2">
        {rows.slice(0, limit).map((r) => (
          <BenefitCard key={r.benefit.id} benefit={r.benefit} program={r.program} items={r.items} store={r.store}
            savings={null} dateLocked={r.dateLocked} lockedMonths={r.lockedMonths} />
        ))}
      </ul>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-dim">לא נמצאו הטבות בסינון הזה.</p>}
      {rows.length > limit && (
        <Button variant="secondary" onClick={() => setLimit(limit + PAGE)} className="w-full">עוד הטבות</Button>
      )}
    </main>
  );
}
