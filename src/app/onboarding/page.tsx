'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import DatesForm, { datesValid, type DatesValue } from '@/components/DatesForm';
import { Button, Notice, field } from '@/components/ui';
import { productGroup, walletItemFromProduct, type ProductGroup } from '@/lib/core/catalog';
import { cardArtFor, cardMatches } from '@/lib/core/cardArt';
import { TRUST_LINES, retryHint } from '@/lib/core/labels';
import type { CardProduct, ProgramKind } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Extra = { name: string; type: 'card' | 'membership' };
const GROUPS: [ProductGroup, string][] = [['card', 'כרטיסי אשראי'], ['club', 'מועדונים וחברויות'], ['store_club', 'מועדוני לקוחות של חנויות']];
const HOW_IT_WORKS = ['מסמנים כאן את הכרטיסים והמועדונים שלכם.', 'בקופה מקלידים את שם החנות.', 'רואים באיזה כרטיס לשלם וכמה ₪ חוסכים.'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dates, setDates] = useState<DatesValue>({ birth_month: null, anniversary_month: null, anniversary_day: null, children: [] });
  const [products, setProducts] = useState<CardProduct[]>([]);
  const [kinds, setKinds] = useState<Map<string, ProgramKind>>(new Map());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraName, setExtraName] = useState('');
  const [extraType, setExtraType] = useState<Extra['type']>('membership');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.from('card_products').select('*').order('name')
      .then(({ data }) => setProducts((data ?? []) as CardProduct[]));
    // Only to split the clubs into groups; without it every membership is listed as a club.
    sb.from('programs').select('id,kind')
      .then(({ data }) => setKinds(new Map((data ?? []).map((p) => [p.id as string, p.kind as ProgramKind]))));
  }, []);

  const visible = products.filter((p) => cardMatches(p.name, query));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function addExtra() {
    const name = extraName.trim();
    if (!name) return;
    setExtras((x) => [...x, { name, type: extraType }]);
    setExtraName('');
  }

  async function finish() {
    if (!datesValid(dates)) return;
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('not signed in');

      const { count, error: e1 } = await sb.from('wallet_items').select('id', { count: 'exact', head: true });
      if (e1) throw e1;
      if (!count) { // only on the first run, so a retry after a failure never duplicates the wallet
        const items: { name: string; type: Extra['type']; program_ids: string[]; product_id: string | null }[] =
          products.filter((p) => picked.has(p.id)).map(walletItemFromProduct);
        if (extras.length) {
          const { data: mine } = await sb.from('programs').select('id,name').eq('user_id', user.id);
          for (const x of extras) {
            let id = (mine ?? []).find((p) => p.name === x.name)?.id as string | undefined;
            if (!id) {
              const { data, error } = await sb.from('programs')
                .insert({ name: x.name, kind: x.type === 'card' ? 'card_issuer' : 'club' }).select('id').single();
              if (error) throw error;
              id = data.id as string;
            }
            items.push({ name: x.name, type: x.type, program_ids: [id], product_id: null });
          }
        }
        if (items.length) {
          const { error } = await sb.from('wallet_items').insert(items);
          if (error) throw error;
        }
      }

      const { error: e2 } = await sb.from('profile').upsert({
        user_id: user.id,
        birth_month: dates.birth_month,
        anniversary_month: dates.anniversary_month,
        anniversary_day: dates.anniversary_day,
        children: dates.children.map((c) => ({ name: c.name.trim(), birth_month: c.birth_month })),
      });
      if (e2) throw e2;
      router.replace('/');
    } catch {
      setError(`לא הצלחנו לשמור את הפרטים. ${retryHint(navigator.onLine)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 pt-8">
      <div className="space-y-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel text-2xl font-bold text-mint">₪</div>
        <h1 className="text-2xl font-bold">ברוכים הבאים</h1>
        <div className="space-y-1.5">
          <p className="text-xs text-dim">שלב {step} מתוך 2</p>
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-mint/60' : 'bg-line'}`} />)}
          </div>
        </div>
      </div>

      {step === 1 && (
        <>
          <section aria-label="איך זה עובד" className="space-y-3">
            <ol className="space-y-1.5">
              {HOW_IT_WORKS.map((t, i) => (
                <li key={t} className="flex gap-2"><span className="font-semibold text-dim">{i + 1}.</span>{t}</li>
              ))}
            </ol>
            <div className="space-y-1 text-xs text-dim">
              {TRUST_LINES.map((t) => <p key={t}>{t}</p>)}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">אילו כרטיסים ומועדונים יש לכם?</h2>
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש: מקס, דרים קארד…"
                aria-label="חיפוש כרטיס או מועדון" className={`${field} ps-10`} />
            </div>
            {products.length === 0 && <Notice>טוען את רשימת הכרטיסים…</Notice>}
            {products.length > 0 && visible.length === 0 && (
              <p className="text-sm text-muted">&quot;{query.trim()}&quot; לא ברשימה. אפשר להוסיף אותו למטה, ב&quot;משהו חסר?&quot;.</p>
            )}
            {GROUPS.map(([group, title]) => {
              const list = visible.filter((p) => productGroup(p, (id) => kinds.get(id)) === group);
              if (list.length === 0) return null;
              return (
                <fieldset key={group} className="space-y-2">
                  <legend className="mb-2 text-xs font-semibold text-dim">{title}</legend>
                  {list.map((p) => {
                    const art = cardArtFor([p.name]);
                    const on = picked.has(p.id);
                    return (
                      <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${on ? 'border-mint bg-mint/10' : 'border-line bg-panel'}`}>
                        <input type="checkbox" className="h-4 w-4 accent-mint" checked={on} onChange={() => toggle(p.id)} />
                        <span aria-hidden className="h-6 w-10 shrink-0 rounded"
                          style={{ background: art ? `linear-gradient(135deg, ${art.from}, ${art.to})` : 'var(--color-panel-2)' }} />
                        <span className="flex-1">{p.name}</span>
                      </label>
                    );
                  })}
                </fieldset>
              );
            })}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">משהו חסר?</h2>
            <p className="text-sm text-muted">כרטיס או מועדון שלא ברשימה (למשל מועדון של מקום העבודה). הוא יופיע רק אצלכם, ותוכלו לייבא את ההטבות שלו.</p>
            {extras.map((x, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-3">
                <span className="flex-1">{x.name} <span className="text-xs text-dim">· {x.type === 'card' ? 'כרטיס אשראי' : 'מועדון'} · פרטי</span></span>
                <button type="button" aria-label={`הסרת ${x.name}`} onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}
                  className="tap text-dim hover:text-bad"><X size={16} aria-hidden /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="שם" aria-label="שם כרטיס או מועדון"
                className={`${field} min-w-0 flex-1`} />
              <select value={extraType} onChange={(e) => setExtraType(e.target.value as Extra['type'])} aria-label="סוג"
                className={`${field} w-36! shrink-0`}>
                <option value="membership">מועדון</option>
                <option value="card">כרטיס אשראי</option>
              </select>
              <button type="button" onClick={addExtra} aria-label="הוספה" className="grid w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel-2">
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </section>
        </>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h2 className="font-semibold">התאריכים שלכם</h2>
          <p className="text-sm text-muted">כדי שלא תפספסו הטבות של חודש יום ההולדת. הן תקפות לכל החודש, אז מספיק לבחור חודש.</p>
          <DatesForm value={dates} onChange={setDates} />
        </section>
      )}

      {/* Pinned, so "continue" stays in reach under a long card list. */}
      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-line bg-ink px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        {error && <Notice tone="error">{error}</Notice>}
        {step === 1 && <p className="text-sm text-dim">נבחרו {picked.size + extras.length}</p>}
        {step === 2 && !datesValid(dates) && (
          <p id="finish-hint" className="text-sm text-dim">
            {dates.birth_month == null ? 'בחרו חודש יום הולדת כדי לסיים.' : 'השלימו שם וחודש לכל ילד/ה, או הסירו את השורה.'}
          </p>
        )}
        <div className="flex gap-2">
          {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)}>חזרה</Button>}
          <Button loading={busy} disabled={step === 2 && !datesValid(dates)} aria-describedby={step === 2 && !datesValid(dates) ? 'finish-hint' : undefined}
            onClick={step === 2 ? finish : () => setStep(step + 1)} className="flex-1 py-3">
            {step === 2 ? 'סיום' : 'המשך'}
          </Button>
        </div>
      </div>
    </main>
  );
}
