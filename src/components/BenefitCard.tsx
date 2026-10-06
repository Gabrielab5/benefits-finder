'use client';
import { useState } from 'react';
import { isOutdated, monthNameHe } from '@/lib/core/dates';
import { CHANNEL_LABELS, REQUIRES_LABELS, formatDate, headlineText, shekel } from '@/lib/core/labels';
import type { Savings } from '@/lib/core/savings';
import type { Benefit, Program, Store, WalletItem } from '@/lib/core/types';

interface Props {
  benefit: Benefit;
  program: Program;
  items: WalletItem[];
  store: Store | null;
  savings: Savings | null;
  birthdayLocked: boolean;
  birthMonth: number | null;
}

export default function BenefitCard({ benefit, program, items, store, savings, birthdayLocked, birthMonth }: Props) {
  const [copied, setCopied] = useState(false);
  const who = items.map((i) => i.nickname || i.name).join(' / ');
  const action = benefit.requires === 'pay_with_card' ? 'שלמו עם' : 'הציגו';

  async function copyCode() {
    if (!benefit.coupon_code) return;
    await navigator.clipboard.writeText(benefit.coupon_code);
    setCopied(true);
  }

  return (
    <li className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm ${birthdayLocked ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{benefit.timing === 'birthday_month' ? '🎂 ' : ''}{benefit.title}</p>
          <p className="text-sm text-gray-600">
            {action} <span className="font-medium text-gray-900">{who}</span> · {program.name}
            {store ? ` · ${store.name_he}` : ''}
          </p>
        </div>
        {savings && savings.spendMore === 0 ? (
          <span className="shrink-0 rounded-lg bg-green-100 px-2 py-1 text-sm font-bold text-green-800">
            חיסכון {shekel(savings.saved)}
          </span>
        ) : (
          <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-sm font-bold text-blue-800">{headlineText(benefit)}</span>
        )}
      </div>

      {birthdayLocked && (
        <p className="mt-1 text-sm">
          זמין בחודש יום ההולדת{birthMonth ? ` (${monthNameHe(birthMonth)})` : ''}
        </p>
      )}
      {savings && savings.spendMore > 0 && (
        <p className="mt-1 text-sm text-amber-700">
          הוסיפו {shekel(savings.spendMore)} לקנייה כדי לחסוך {shekel(savings.potential)}
        </p>
      )}
      {benefit.coupon_code && (
        <button onClick={copyCode} className="mt-2 rounded-lg bg-gray-100 px-2 py-1 font-mono text-sm" dir="ltr">
          {benefit.coupon_code} {copied ? '✓' : '⧉'}
        </button>
      )}
      {isOutdated(benefit.last_verified_at, new Date()) && (
        <p className="mt-1 text-xs text-amber-700">ייתכן שלא מעודכן</p>
      )}
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-blue-700">פרטים</summary>
        <div className="mt-1 space-y-1 text-gray-700">
          {benefit.description && <p>{benefit.description}</p>}
          {benefit.conditions && <p className="text-gray-600">{benefit.conditions}</p>}
          <p>
            {REQUIRES_LABELS[benefit.requires]} · {CHANNEL_LABELS[benefit.channel]}
            {benefit.min_spend ? ` · מינימום ${shekel(benefit.min_spend)}` : ''}
            {benefit.max_discount ? ` · עד ${shekel(benefit.max_discount)}` : ''}
            {benefit.valid_until ? ` · בתוקף עד ${formatDate(benefit.valid_until)}` : ''}
          </p>
          {benefit.source_url && (
            <a href={benefit.source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">למקור</a>
          )}
        </div>
      </details>
    </li>
  );
}
