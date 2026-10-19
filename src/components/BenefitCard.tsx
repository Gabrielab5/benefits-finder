'use client';
import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, Sparkles } from 'lucide-react';
import CardFace from './CardFace';
import { faceArt } from '@/lib/core/cardArt';
import { isOutdated, monthNameHe } from '@/lib/core/dates';
import {
  CHANNEL_LABELS, REQUIRES_LABELS, TIMING_ICON, TIMING_LABELS, actionLine, formatDate, headlineText, savingsDerivation, shekel,
} from '@/lib/core/labels';
import type { Savings } from '@/lib/core/savings';
import type { Benefit, Program, Store, WalletItem } from '@/lib/core/types';
import { useSnap } from '@/lib/useSnapshot';

interface Props {
  benefit: Benefit;
  program: Program;
  items: WalletItem[];
  store?: Store | null; // left out inside a store result, where the store is already on screen
  savings: Savings | null;
  amount?: number | null; // the entered purchase amount the savings were computed for
  dateLocked: boolean;
  lockedMonths: number[];
  best?: boolean; // the hoisted answer: action first, mint border and glow
}

export default function BenefitCard({ benefit, program, items, store, savings, amount, dateLocked, lockedMonths, best = false }: Props) {
  const [copied, setCopied] = useState(false);
  const line = actionLine(benefit.requires, program.name, items.map((i) => i.nickname || i.name), store?.name_he);
  const { snapshot } = useSnap();
  const holder = items[0];
  const art = faceArt([holder?.name ?? program.name, program.name], holder?.color);
  const image = holder?.product_id ? snapshot?.products?.find((p) => p.id === holder.product_id)?.image_url : null;
  const met = savings !== null && savings.spendMore === 0 && savings.saved > 0;
  const how = met && amount ? savingsDerivation(benefit, amount, savings) : null;
  const outdated = isOutdated(benefit.last_verified_at, new Date());
  const isPrivate = Boolean(benefit.user_id);
  const title = (
    <>
      {benefit.timing !== 'always' && <><span role="img" aria-label={TIMING_LABELS[benefit.timing]}>{TIMING_ICON[benefit.timing]}</span> </>}
      {benefit.title}
    </>
  );
  const more = line.more.map((m) => ` · ${m}`).join('');

  async function copyCode() {
    if (!benefit.coupon_code) return;
    await navigator.clipboard.writeText(benefit.coupon_code);
    setCopied(true);
  }

  return (
    <li className={`rounded-2xl border bg-panel p-3.5 transition ${best ? 'answer border-mint' : 'border-line'}`}>
      {best && (
        <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-mint">
          <Sparkles size={14} aria-hidden /> הכי משתלם
          {amount ? <span className="font-normal text-muted">· החיסכון הגדול ביותר עבור {shekel(amount)}</span> : null}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        {/* Locked: the swatch goes grey (with the pink "available in" pill below); the text keeps full contrast. */}
        <CardFace art={art} image={image} type={holder?.type ?? 'membership'} small
          className={`mt-0.5 h-7 w-11 shrink-0 ${dateLocked ? 'opacity-40 grayscale' : ''}`} />
        {best ? (
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-snug text-fg">{line.verb} {line.who}</p>
            <p className="mt-0.5 text-sm text-muted">{title}{more}</p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className={`font-semibold leading-snug ${dateLocked ? 'text-muted' : 'text-fg'}`}>{title}</p>
            <p className="mt-0.5 text-sm text-muted">
              {line.verb} <span className="text-fg">{line.who}</span>
              {more}
            </p>
          </div>
        )}
        {/* Under 360px a value badge drops to its own row under the title (ps-14 = swatch + gap), so the title keeps the width. */}
        <div className={`max-w-[40%] shrink-0 text-end ${met ? '' : 'max-[360px]:max-w-none max-[360px]:basis-full max-[360px]:ps-14 max-[360px]:text-start'}`}>
          {met ? (
            <>
              <p className="text-lg font-bold leading-none text-mint">{shekel(savings.saved)}</p>
              <p className="mt-1 text-[11px] text-dim">חיסכון</p>
            </>
          ) : (
            <span className="inline-block rounded-lg bg-panel-2 px-2 py-1 text-xs font-semibold leading-snug text-fg">{headlineText(benefit)}</span>
          )}
        </div>
      </div>
      {how && <p className="mt-1 text-end text-[11px] text-dim">{how}</p>}

      {(dateLocked || (savings && savings.spendMore > 0) || benefit.coupon_code || outdated || isPrivate) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
          {dateLocked && (
            <span className="rounded-full bg-party/10 px-2 py-1 text-party">
              {lockedMonths.length ? `זמין ב${lockedMonths.map(monthNameHe).join(' / ')}` : 'הוסיפו את התאריך בהגדרות'}
            </span>
          )}
          {savings && savings.spendMore > 0 && (
            <span className="rounded-full bg-warn/10 px-2 py-1 text-warn">
              הוסיפו {shekel(savings.spendMore)} לקנייה כדי לחסוך {shekel(savings.potential)}
            </span>
          )}
          {benefit.coupon_code && (
            <button onClick={copyCode} dir="ltr"
              className="tap inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 font-mono text-fg">
              {benefit.coupon_code} {copied ? <Check size={12} aria-label="הועתק" /> : <Copy size={12} aria-label="העתקה" />}
            </button>
          )}
          {benefit.coupon_code && <span role="status" className="sr-only">{copied ? 'הקוד הועתק' : ''}</span>}
          {isPrivate && <span className="rounded-full border border-line px-2 py-1 text-dim">פרטי</span>}
          {outdated && <span className="rounded-full bg-panel-2 px-2 py-1 text-dim">ייתכן שלא מעודכן</span>}
        </div>
      )}

      <details className="group mt-2 text-sm">
        {/* py-1.5 + .tap give a 44px target; -mb-1.5 keeps the card's bottom spacing as it was. */}
        <summary className="tap -mb-1.5 flex cursor-pointer list-none items-center gap-1 py-1.5 text-xs text-dim hover:text-muted">
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
            <a href={benefit.source_url} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-1 text-xs text-mint">
              למקור <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </div>
      </details>
    </li>
  );
}
