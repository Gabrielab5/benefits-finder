'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notice, field } from '@/components/ui';
import { monthNameHe } from '@/lib/core/dates';
import { KIND_LABELS } from '@/lib/core/labels';
import { PROGRAM_KINDS, type ProgramKind } from '@/lib/core/types';
import { buildWalletItems, SEED_PROGRAMS, type SeedProgram } from '@/lib/seedPrograms';
import { supabaseBrowser } from '@/lib/supabase/browser';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [month, setMonth] = useState<number | null>(null);
  const [picked, setPicked] = useState<SeedProgram[]>([]);
  const [otherName, setOtherName] = useState('');
  const [otherKind, setOtherKind] = useState<ProgramKind>('club');
  const [links, setLinks] = useState<Record<string, string[]>>({}); // card key -> club keys it unlocks
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPicked = (key: string) => picked.some((p) => p.key === key);
  const toggle = (p: SeedProgram) =>
    setPicked((ps) => (ps.some((x) => x.key === p.key) ? ps.filter((x) => x.key !== p.key) : [...ps, p]));
  const options = [...SEED_PROGRAMS, ...picked.filter((p) => p.key.startsWith('other-'))];
  const cards = picked.filter((p) => p.kind === 'card_issuer');
  const clubs = picked.filter((p) => p.kind !== 'card_issuer'); // clubs and store clubs a card can belong to

  function addOther() {
    const name = otherName.trim();
    if (!name) return;
    setPicked((ps) => [...ps, { key: `other-${Date.now()}`, name, kind: otherKind }]);
    setOtherName('');
  }

  function toggleLink(cardKey: string, clubKey: string) {
    setLinks((l) => {
      const cur = l[cardKey] ?? [];
      return { ...l, [cardKey]: cur.includes(clubKey) ? cur.filter((k) => k !== clubKey) : [...cur, clubKey] };
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user || month == null) throw new Error('missing user or month');

      const { data: existing, error: e1 } = await sb.from('programs').select('id,name');
      if (e1) throw e1;
      const idByName = new Map<string, string>((existing ?? []).map((p) => [p.name, p.id]));
      const toCreate = picked.filter((p) => !idByName.has(p.name));
      if (toCreate.length > 0) {
        const { data, error } = await sb.from('programs').insert(toCreate.map((p) => ({ name: p.name, kind: p.kind }))).select('id,name');
        if (error) throw error;
        for (const p of data) idByName.set(p.name, p.id);
      }
      const idOf = (p: SeedProgram) => idByName.get(p.name)!;

      const { count, error: e2 } = await sb.from('wallet_items').select('id', { count: 'exact', head: true });
      if (e2) throw e2;
      if (!count) {
        const items = buildWalletItems(picked, links, idOf);
        if (items.length > 0) {
          const { error } = await sb.from('wallet_items').insert(items);
          if (error) throw error;
        }
      }

      const { error: e3 } = await sb.from('profile').upsert({ user_id: user.id, birth_month: month });
      if (e3) throw e3;
      router.replace('/');
    } catch {
      setError('השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  const lastStep = step === 3 || (step === 2 && (cards.length === 0 || clubs.length === 0));

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div className="space-y-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel text-2xl font-bold text-mint">₪</div>
        <h1 className="text-2xl font-bold">ברוכים הבאים</h1>
        <div className="flex gap-1.5" aria-label={`שלב ${step} מתוך 3`}>
          {[1, 2, 3].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-mint' : 'bg-line'}`} />)}
        </div>
      </div>

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="font-semibold">באיזה חודש יום ההולדת שלכם?</h2>
          <p className="text-sm text-muted">הטבות יום הולדת תקפות לכל החודש.</p>
          <select value={month ?? ''} onChange={(e) => setMonth(Number(e.target.value) || null)}
            className={`${field} py-3`} aria-label="חודש יום ההולדת">
            <option value="">בחרו חודש</option>
            {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
          </select>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-semibold">מה יש לכם?</h2>
          {PROGRAM_KINDS.map((kind) => (
            <fieldset key={kind} className="space-y-2">
              <legend className="mb-2 text-xs font-semibold text-dim">{KIND_LABELS[kind]}</legend>
              {options.filter((p) => p.kind === kind).map((p) => (
                <label key={p.key} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition ${isPicked(p.key) ? 'border-mint bg-mint/10' : 'border-line bg-panel'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-mint" checked={isPicked(p.key)} onChange={() => toggle(p)} />
                  {p.name}
                </label>
              ))}
            </fieldset>
          ))}
          <div className="flex gap-2">
            <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="משהו אחר…"
              aria-label="שם תוכנית אחרת" className={`${field} min-w-0 flex-1`} />
            <select value={otherKind} onChange={(e) => setOtherKind(e.target.value as ProgramKind)}
              aria-label="סוג" className={`${field} w-36! shrink-0`}>
              {PROGRAM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
            <button type="button" onClick={addOther} className="rounded-xl border border-line bg-panel-2 px-3">הוספה</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="font-semibold">אילו מועדונים כל כרטיס פותח?</h2>
          <p className="text-sm text-muted">
            לדוגמה: כרטיס כאל של מועדון חבר פותח גם את הטבות חבר, וכרטיס אשראי של דרים קארד פותח את הטבות דרים קארד
            שדורשות תשלום בכרטיס. סמנו כדי שהטבות כאלה יופיעו.
          </p>
          {cards.map((card) => (
            <fieldset key={card.key} className="space-y-2 rounded-2xl border border-line bg-panel p-3">
              <legend className="font-semibold">{card.name}</legend>
              {clubs.map((club) => (
                <label key={club.key} className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-mint" checked={(links[card.key] ?? []).includes(club.key)}
                    onChange={() => toggleLink(card.key, club.key)} />
                  {club.name}
                </label>
              ))}
            </fieldset>
          ))}
        </section>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)}>חזרה</Button>}
        <button disabled={busy || (step === 1 && month == null)} onClick={lastStep ? finish : () => setStep(step + 1)}
          className="flex-1 rounded-xl bg-mint p-3 font-semibold text-mint-ink disabled:opacity-40">
          {lastStep ? 'סיום' : 'המשך'}
        </button>
      </div>
    </main>
  );
}
