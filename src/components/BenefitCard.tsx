'use client';
import { useState } from 'react';
import { Cake, Check, ChevronDown, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { cardArtFor } from '@/lib/core/cardArt';
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
  best?: boolean;
}

export default function BenefitCard({ benefit, program, items, store, savings, birthdayLocked, birthMonth, best = false }: Props) {
  const [copied, setCopied] = useState(false);
  const who = items.map((i) => i.nickname || i.name).join(' / ');
  const action = benefit.requires === 'pay_with_card' ? 'שלמו עם' : 'הציגו';
  const art = cardArtFor([items[0]?.name ?? '', program.name]);
  const swatch = items[0]?.color ?? '#5d6782';
  const swatchBg = art ? `linear-gradient(135deg, ${art.from}, ${art.to})` : `linear-gradient(135deg, ${swatch}, ${swatch}99)`;
  const met = savings !== null && savings.spendMore === 0 && savings.saved > 0;

  async function copyCode() {
    if (!benefit.coupon_code) return;
    await navigator.clipboard.writeText(benefit.coupon_code);
    setCopied(true);
  }

  return (
    <li className={`rounded-2xl border bg-panel p-3.5 transition ${best ? 'border-mint' : 'border-line'} ${birthdayLocked ? 'opacity-50' : ''}`}>
      {best && (
        <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-mint">
          <Sparkles size={14} aria-hidden /> הכי משתלם
        </p>
      )}
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid h-7 w-11 shrink-0 place-items-center overflow-hidden rounded-md px-0.5 text-[6px] font-black leading-none tracking-wider text-white/90"
          style={{ background: swatchBg }}>{art?.mark}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-fg">
            {benefit.timing === 'birthday_month' && <Cake size={15} className="me-1 inline text-party" aria-label="יום הולדת" />}
            {benefit.title}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {action} <span className="text-fg">{who}</span> · {program.name}
            {store ? ` · ${store.name_he}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-end">
          {met ? (
            <>
              <p className="text-lg font-bold leading-none text-mint">{shekel(savings.saved)}</p>
              <p className="mt-1 text-[11px] text-dim">חיסכון</p>
            </>
          ) : (
            <span className="rounded-lg bg-panel-2 px-2 py-1 text-xs font-semibold text-fg">{headlineText(benefit)}</span>
          )}
        </div>
      </div>

      {(birthdayLocked || (savings && savings.spendMore > 0) || benefit.coupon_code || isOutdated(benefit.last_verified_at, new Date())) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
          {birthdayLocked && (
            <span className="rounded-full bg-party/10 px-2 py-1 text-party">
              זמין בחודש יום ההולדת{birthMonth ? ` (${monthNameHe(birthMonth)})` : ''}
            </span>
          )}
          {savings && savings.spendMore > 0 && (
            <span className="rounded-full bg-warn/10 px-2 py-1 text-warn">
              הוסיפו {shekel(savings.spendMore)} לקנייה כדי לחסוך {shekel(savings.potential)}
            </span>
          )}
          {benefit.coupon_code && (
            <button onClick={copyCode} dir="ltr"
              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 font-mono text-fg">
              {benefit.coupon_code} {copied ? <Check size={12} aria-label="הועתק" /> : <Copy size={12} aria-label="העתקה" />}
            </button>
          )}
          {isOutdated(benefit.last_verified_at, new Date()) && (
            <span className="rounded-full bg-panel-2 px-2 py-1 text-dim">ייתכן שלא מעודכן</span>
          )}
        </div>
      )}

      <details className="group mt-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-dim hover:text-muted">
          פרטים <ChevronDown size={14} className="transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2 space-y-1.5 border-t border-line pt-2 text-muted">
          {benefit.description && <p>{benefit.description}</p>}
          {benefit.conditions && <p>{benefit.conditions}</p>}
          <p className="text-xs text-dim">
            {REQUIRES_LABELS[benefit.requires]} · {CHANNEL_LABELS[benefit.channel]}
            {benefit.min_spend ? ` · מינימום ${shekel(benefit.min_spend)}` : ''}
            {benefit.max_discount ? ` · עד ${shekel(benefit.max_discount)}` : ''}
            {benefit.valid_until ? ` · בתוקף עד ${formatDate(benefit.valid_until)}` : ''}
          </p>
          {benefit.source_url && (
            <a href={benefit.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-mint">
              למקור <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </div>
      </details>
    </li>
  );
}
