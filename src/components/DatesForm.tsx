'use client';
import { Plus, X } from 'lucide-react';
import { field } from '@/components/ui';
import { monthNameHe } from '@/lib/core/dates';
import type { Child } from '@/lib/core/types';

export interface DatesValue {
  birth_month: number | null;
  anniversary_month: number | null;
  anniversary_day: number | null;
  children: Child[];
}

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function datesValid(v: DatesValue): boolean {
  return v.birth_month != null && v.children.every((c) => c.name.trim() !== '' && c.birth_month >= 1 && c.birth_month <= 12);
}

const num = (v: string) => (v ? Number(v) : null);

export default function DatesForm({ value, onChange }: { value: DatesValue; onChange: (v: DatesValue) => void }) {
  const set = (patch: Partial<DatesValue>) => onChange({ ...value, ...patch });
  const setChild = (i: number, patch: Partial<Child>) =>
    set({ children: value.children.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm text-muted">🎂 חודש יום ההולדת שלך</span>
        <select aria-label="חודש יום ההולדת" value={value.birth_month ?? ''} onChange={(e) => set({ birth_month: num(e.target.value) })}
          className={`${field} mt-1`}>
          <option value="">בחרו חודש</option>
          {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
        </select>
      </label>

      <fieldset>
        <legend className="text-sm text-muted">💍 יום נישואין (לא חובה)</legend>
        <div className="mt-1 flex gap-2">
          <select aria-label="חודש יום הנישואין" value={value.anniversary_month ?? ''}
            onChange={(e) => set({ anniversary_month: num(e.target.value), ...(e.target.value ? {} : { anniversary_day: null }) })}
            className={`${field} min-w-0 flex-1`}>
            <option value="">אין / לא לציין</option>
            {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
          </select>
          <input aria-label="יום בחודש" inputMode="numeric" placeholder="יום" value={value.anniversary_day ?? ''}
            disabled={!value.anniversary_month}
            onChange={(e) => {
              const d = Number(e.target.value.replace(/\D/g, ''));
              set({ anniversary_day: d >= 1 && d <= 31 ? d : null });
            }}
            className={`${field} w-20! shrink-0`} />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">🎈 ימי הולדת של ילדים (לא חובה)</legend>
        {value.children.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input aria-label={`שם ילד/ה ${i + 1}`} placeholder="שם" value={c.name}
              onChange={(e) => setChild(i, { name: e.target.value })} className={`${field} min-w-0 flex-1`} />
            <select aria-label={`חודש יום ההולדת של ילד/ה ${i + 1}`} value={c.birth_month || ''}
              onChange={(e) => setChild(i, { birth_month: Number(e.target.value) })} className={`${field} w-32! shrink-0`}>
              <option value="">חודש</option>
              {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
            </select>
            <button type="button" aria-label={`הסרת ילד/ה ${i + 1}`} onClick={() => set({ children: value.children.filter((_, j) => j !== i) })}
              className="grid w-10 shrink-0 place-items-center rounded-xl border border-line text-dim hover:text-bad">
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ children: [...value.children, { name: '', birth_month: 0 }] })}
          className="flex items-center gap-1 text-sm text-mint">
          <Plus size={14} aria-hidden /> הוספת ילד/ה
        </button>
      </fieldset>
    </div>
  );
}
