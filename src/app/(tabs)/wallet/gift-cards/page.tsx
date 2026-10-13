'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Copy, ExternalLink, Gift, Image as ImageIcon, ImageUp, Link2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Button, Card, Chip, Loading, Notice, PageHeader, SectionTitle, field } from '@/components/ui';
import Waiting from '@/components/Waiting';
import { addDays, israelToday } from '@/lib/core/dates';
import { GIFT_CARD_PRESETS, storesSearchUrl, type GiftCardPreset } from '@/lib/core/giftcards';
import { formatDate, shekel } from '@/lib/core/labels';
import { findStoreByName, searchStores } from '@/lib/core/normalize';
import { parseAmount } from '@/lib/core/savings';
import type { GiftCard } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

interface Draft {
  id?: string;
  name: string;
  amount: string;
  balance: string;
  received_on: string;
  expires_on: string;
  code: string;
  link: string;
  any_store: boolean;
  store_ids: string[];
  stores_url: string;
  notes: string;
  image_path: string | null; // saved photo
  image: Shot | null; // new photo, uploaded on save
}
const EMPTY: Draft = {
  name: '', amount: '', balance: '', received_on: '', expires_on: '', code: '', link: '',
  any_store: false, store_ids: [], stores_url: '', notes: '', image_path: null, image: null,
};

type Shot = { type: string; data: string }; // base64 JPEG
const BUCKET = 'imports'; // private, owner-only folders "<user_id>/..."

interface Extracted {
  name: string | null;
  amount: number | null;
  balance: number | null;
  received_on: string | null;
  expires_on: string | null;
  code: string | null;
  any_store: boolean;
  store_ids: string[];
  unmatched: string[];
}

const ERRORS: Record<string, string> = {
  unreadable: 'לא הצלחנו לקרוא את הקישור (אולי צריך להתחבר כדי לראות אותו). הקישור נשמר — השלימו את הפרטים ידנית או העלו צילום מסך.',
  ai_off: 'החילוץ האוטומטי כבוי. מלאו את הפרטים ידנית.',
  rate_limited: 'הגענו למכסת ה-AI החינמית לרגע. נסו שוב בעוד דקה, או מלאו ידנית.',
  ai_failed: 'ה-AI של Google עמוס כרגע ולא הספיק לקרוא את הגיפטקארד. הצילום נשמר בטופס — נסו שוב, או מלאו ידנית.',
  default: 'לא הצלחנו לחלץ את הפרטים. נסו שוב, או מלאו אותם ידנית.',
};

/** Phone screenshots can pass the 4.5 MB request limit; a 1600 px JPEG keeps text readable and stays small. */
async function shrink(file: File): Promise<Shot> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

export default function GiftCardsPage() {
  const { snapshot, online, refresh } = useSnap();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<'menu' | 'link' | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [storeQuery, setStoreQuery] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null); // last failed extraction, same input
  if (!snapshot) return <Loading />;

  const cards = snapshot.giftCards ?? [];
  const storeById = new Map(snapshot.stores.map((s) => [s.id, s]));
  const today = israelToday().iso;
  const soon = addDays(today, 30);

  const open = (d: Draft) => {
    setDraft(d);
    setAdding(null);
    setStoreQuery('');
  };

  function fromPreset(p: GiftCardPreset) {
    const store_ids = (p.stores ?? []).flatMap((n) => findStoreByName(snapshot!.stores, n)?.id ?? []);
    setUnmatched([]);
    open({ ...EMPTY, name: p.name, any_store: !!p.anyStore, store_ids, stores_url: p.stores || p.anyStore ? '' : storesSearchUrl(p.name) });
  }

  async function extract(input: { url: string } | { image: Shot }) {
    setBusy(true);
    setError(null);
    setRetry(null);
    const base = { ...EMPTY, link: 'url' in input ? input.url : '', image: 'image' in input ? input.image : null };
    try {
      const res = await fetch('/api/giftcards/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const x = json as Extracted;
      const amount = x.amount ?? x.balance;
      setUnmatched(x.unmatched);
      open({
        ...base, name: x.name ?? '', amount: amount ? String(amount) : '', balance: String(x.balance ?? amount ?? ''),
        received_on: x.received_on ?? '', expires_on: x.expires_on ?? '', code: x.code ?? '',
        any_store: x.any_store, store_ids: x.store_ids, stores_url: x.name && !x.any_store ? storesSearchUrl(x.name) : '',
      });
    } catch (e) {
      const code = (e as Error).message;
      setError(ERRORS[code] ?? ERRORS.default);
      if (code !== 'unreadable' && code !== 'ai_off') setRetry(() => () => extract(input));
      setUnmatched([]);
      open(base);
    } finally {
      setBusy(false);
    }
  }

  async function onScreenshot(file: File | undefined, attachOnly = false) {
    if (!file) return;
    let image: Shot;
    try {
      image = await shrink(file);
    } catch {
      return setError('לא הצלחנו לקרוא את התמונה.');
    }
    if (attachOnly) set({ image });
    else await extract({ image });
  }

  async function showImage(path: string) {
    const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 300);
    if (data) setViewing(data.signedUrl);
    else setError('לא הצלחנו לפתוח את התמונה.');
  }

  async function run(op: PromiseLike<{ error: unknown }>, msg: string): Promise<boolean> {
    const { error } = await op;
    if (error) {
      setError(msg);
      return false;
    }
    setError(null);
    await refresh();
    return true;
  }

  async function save(d: Draft) {
    setSaving(true);
    try {
      await persist(d);
    } finally {
      setSaving(false);
    }
  }

  async function persist(d: Draft) {
    const amount = parseAmount(d.amount);
    const balance = d.balance.trim() === '' ? amount : d.balance.trim() === '0' ? 0 : parseAmount(d.balance);
    if (!d.name.trim()) return setError('חסר שם.');
    if (!amount) return setError('חסר סכום.');
    if (balance == null || balance > amount) return setError('היתרה צריכה להיות בין 0 לסכום הגיפטקארד.');
    for (const u of [d.link, d.stores_url]) if (u && !/^https?:\/\//.test(u)) return setError('קישור צריך להתחיל ב-https://');
    const row = {
      name: d.name.trim(), amount, balance, received_on: d.received_on || null, expires_on: d.expires_on || null,
      code: d.code.trim() || null, link: d.link.trim() || null, any_store: d.any_store,
      store_ids: d.any_store ? [] : d.store_ids, stores_url: d.stores_url.trim() || null, notes: d.notes.trim() || null,
    };
    const sb = supabaseBrowser();
    const old = cards.find((c) => c.id === d.id)?.image_path ?? null;
    let image_path = d.image_path;
    if (d.image) {
      const uid = (await sb.auth.getSession()).data.session?.user.id; // local, no round trip; storage RLS checks it anyway
      if (!uid) return setError('צריך להתחבר מחדש.');
      const bytes = Uint8Array.from(atob(d.image.data), (ch) => ch.charCodeAt(0));
      image_path = `${uid}/gift-cards/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(image_path, new Blob([bytes], { type: d.image.type }));
      if (error) return setError('העלאת התמונה נכשלה.');
    }
    const op = d.id ? sb.from('gift_cards').update({ ...row, image_path }).eq('id', d.id) : sb.from('gift_cards').insert({ ...row, image_path });
    if (await run(op, 'השמירה נכשלה.')) {
      if (old && old !== image_path) await sb.storage.from(BUCKET).remove([old]);
      setDraft(null);
    }
  }

  async function remove(c: GiftCard) {
    if (!confirm(`למחוק את "${c.name}"?`)) return;
    const sb = supabaseBrowser();
    if (await run(sb.from('gift_cards').delete().eq('id', c.id), 'המחיקה נכשלה.') && c.image_path) {
      await sb.storage.from(BUCKET).remove([c.image_path]);
    }
  }

  const edit = (c: GiftCard) => {
    setUnmatched([]);
    open({
      id: c.id, name: c.name, amount: String(c.amount), balance: String(c.balance), received_on: c.received_on ?? '',
      expires_on: c.expires_on ?? '', code: c.code ?? '', link: c.link ?? '', any_store: c.any_store,
      store_ids: c.store_ids, stores_url: c.stores_url ?? '', notes: c.notes ?? '',
      image_path: c.image_path ?? null, image: null,
    });
  };

  const total = cards.filter((c) => !c.expires_on || c.expires_on >= today).reduce((s, c) => s + c.balance, 0);
  const set = (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch });

  return (
    <main className="space-y-6">
      <Link href="/wallet" className="inline-flex items-center gap-1 pt-2 text-sm text-muted hover:text-fg">
        <ChevronRight size={16} aria-hidden /> לארנק
      </Link>
      <PageHeader title="גיפטקארדים" subtitle={cards.length ? `${shekel(total)} זמינים לשימוש` : 'שוברים ותווי קנייה שלכם'} icon={Gift} />
      {!online && <Notice tone="warn">אין חיבור — אפשר רק לצפות.</Notice>}

      {cards.length > 0 && (
        <ul className="space-y-2">
          {cards.map((c) => {
            const expired = !!c.expires_on && c.expires_on < today;
            const expiring = !expired && !!c.expires_on && c.expires_on <= soon;
            const where = c.any_store ? 'בכל בית עסק' : c.store_ids.map((id) => storeById.get(id)?.name_he).filter(Boolean).join(' · ');
            return (
              <li key={c.id} className={`rounded-2xl border border-line bg-panel p-3.5 ${expired || c.balance === 0 ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-party/30 to-mint/20 text-party">
                    <Gift size={18} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="line-clamp-2 text-xs text-muted">{where || 'לא נבחרו חנויות'}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-lg font-bold leading-none text-mint">{shekel(c.balance)}</p>
                    {c.balance !== c.amount && <p className="mt-1 text-[11px] text-dim">מתוך {shekel(c.amount)}</p>}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  {c.expires_on && (
                    <span className={`rounded-full px-2 py-1 ${expired ? 'bg-bad/10 text-bad' : expiring ? 'bg-warn/10 text-warn' : 'bg-panel-2 text-dim'}`}>
                      {expired ? 'פג תוקף' : 'בתוקף עד'} {formatDate(c.expires_on)}
                    </span>
                  )}
                  {c.code && (
                    <button onClick={() => navigator.clipboard.writeText(c.code!)} dir="ltr"
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 font-mono text-fg">
                      {c.code} <Copy size={12} aria-label="העתקה" />
                    </button>
                  )}
                  {c.image_path && (
                    <button onClick={() => showImage(c.image_path!)} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-mint">
                      <ImageIcon size={12} aria-hidden /> תמונה
                    </button>
                  )}
                  {c.link && (
                    <a href={c.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-mint">
                      לשובר <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                  {c.stores_url && (
                    <a href={c.stores_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-mint">
                      איפה מכבדים <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                  <span className="flex-1" />
                  <button disabled={!online} onClick={() => edit(c)} aria-label={`עריכת ${c.name}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-panel-2 disabled:opacity-40">
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button disabled={!online} onClick={() => remove(c)} aria-label={`מחיקת ${c.name}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-panel-2 disabled:opacity-40">
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                {c.notes && <p className="mt-2 text-xs text-muted">{c.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {!draft && !adding && (
        <Button disabled={!online} onClick={() => setAdding('menu')} className="w-full py-3">
          <Plus size={18} aria-hidden /> הוספת גיפטקארד
        </Button>
      )}

      {adding && (
        <Card className="space-y-4">
          <h2 className="font-semibold">איך להוסיף?</h2>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setAdding('link')}><Link2 size={16} aria-hidden /> קישור</Button>
            <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm hover:border-mint/60 ${busy ? 'pointer-events-none opacity-40' : ''}`}>
              <ImageUp size={16} aria-hidden /> צילום מסך
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="צילום מסך של הגיפטקארד"
                onChange={(e) => onScreenshot(e.target.files?.[0])} />
            </label>
            <Button variant="secondary" disabled={busy} onClick={() => { setUnmatched([]); open(EMPTY); }}><Pencil size={16} aria-hidden /> ידני</Button>
          </div>
          {adding === 'link' && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) extract({ url: url.trim() }); }}>
              <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" placeholder="https://buyme.co.il/..."
                aria-label="קישור לגיפטקארד" className={field} />
              <Button type="submit" loading={busy}>חילוץ</Button>
            </form>
          )}
          <div className="space-y-2">
            <SectionTitle>הנפוצים</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {GIFT_CARD_PRESETS.map((p) => <Chip key={p.name} disabled={busy} onClick={() => fromPreset(p)}>{p.name}</Chip>)}
            </div>
          </div>
          <Button variant="ghost" onClick={() => setAdding(null)}>ביטול</Button>
        </Card>
      )}

      {draft && (
        <Card className="space-y-4">
          <h2 className="font-semibold">{draft.id ? 'עריכת גיפטקארד' : 'גיפטקארד חדש'}</h2>
          <label className="block">
            <span className="text-sm text-muted">שם</span>
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="BuyMe, תו הזהב…" className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="text-sm text-muted">סכום (₪)</span>
              <input inputMode="decimal" dir="ltr" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label>
              <span className="text-sm text-muted">נשאר (₪)</span>
              <input inputMode="decimal" dir="ltr" value={draft.balance} placeholder={draft.amount || 'כמו הסכום'}
                onChange={(e) => set({ balance: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label>
              <span className="text-sm text-muted">תאריך קבלה</span>
              <input type="date" value={draft.received_on} onChange={(e) => set({ received_on: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label>
              <span className="text-sm text-muted">תוקף עד</span>
              <input type="date" value={draft.expires_on} onChange={(e) => set({ expires_on: e.target.value })} className={`${field} mt-1`} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-muted">קוד / מספר שובר</span>
            <input dir="ltr" value={draft.code} onChange={(e) => set({ code: e.target.value })} className={`${field} mt-1 font-mono`} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">קישור לשובר</span>
            <input type="url" dir="ltr" value={draft.link} onChange={(e) => set({ link: e.target.value })} className={`${field} mt-1`} />
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted">איפה אפשר לממש?</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.any_store} onChange={(e) => set({ any_store: e.target.checked })} className="accent-mint" />
              בכל בית עסק (כרטיס מתנה נטען)
            </label>
            {!draft.any_store && (
              <>
                {draft.store_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.store_ids.map((id) => (
                      <button key={id} type="button" onClick={() => set({ store_ids: draft.store_ids.filter((x) => x !== id) })}
                        className="inline-flex items-center gap-1 rounded-full border border-mint bg-mint/10 px-2.5 py-1 text-sm text-mint">
                        {storeById.get(id)?.name_he ?? id} <X size={12} aria-label="הסרה" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
                  <input type="search" value={storeQuery} onChange={(e) => setStoreQuery(e.target.value)} placeholder="הוספת חנות"
                    aria-label="הוספת חנות" className={`${field} ps-9`} />
                </div>
                {storeQuery.trim() && (
                  <ul className="overflow-hidden rounded-xl border border-line">
                    {searchStores(snapshot.stores, storeQuery, 6).filter((s) => !draft.store_ids.includes(s.id)).map((s) => (
                      <li key={s.id} className="border-b border-line last:border-0">
                        <button type="button" onClick={() => { set({ store_ids: [...draft.store_ids, s.id] }); setStoreQuery(''); }}
                          className="w-full p-2.5 text-start text-sm hover:bg-panel-2">
                          {s.name_he} <span className="text-muted">· {s.name_en}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {unmatched.length > 0 && (
                  <p className="text-xs text-dim">נמצאו בשובר אך לא בקטלוג: {unmatched.join(', ')}</p>
                )}
                <label className="block">
                  <span className="text-sm text-muted">קישור לרשימת בתי העסק</span>
                  <input type="url" dir="ltr" value={draft.stores_url} onChange={(e) => set({ stores_url: e.target.value })} className={`${field} mt-1`} />
                </label>
                {draft.name.trim() && (
                  <a href={storesSearchUrl(draft.name.trim())} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-mint">
                    חיפוש בגוגל: איפה מכבדים את {draft.name.trim()} <ExternalLink size={12} aria-hidden />
                  </a>
                )}
              </>
            )}
          </fieldset>
          <div className="flex items-center gap-3">
            {draft.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of a data URL
              <img src={`data:${draft.image.type};base64,${draft.image.data}`} alt="תמונת הגיפטקארד" className="h-16 w-16 rounded-lg object-cover" />
            ) : draft.image_path ? (
              <button type="button" onClick={() => showImage(draft.image_path!)} className="grid h-16 w-16 place-items-center rounded-lg border border-line text-mint">
                <ImageIcon size={20} aria-label="הצגת התמונה" />
              </button>
            ) : null}
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-mint">
              <ImageUp size={16} aria-hidden /> {draft.image || draft.image_path ? 'החלפת תמונה' : 'צירוף תמונה / צילום מסך'}
              <input type="file" accept="image/*" className="sr-only" aria-label="תמונת הגיפטקארד"
                onChange={(e) => onScreenshot(e.target.files?.[0], true)} />
            </label>
            {(draft.image || draft.image_path) && (
              <button type="button" onClick={() => set({ image: null, image_path: null })} className="text-sm text-bad">הסרה</button>
            )}
          </div>
          <label className="block">
            <span className="text-sm text-muted">הערות</span>
            <textarea rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={`${field} mt-1`} />
          </label>
          <div className="flex gap-2">
            <Button onClick={() => save(draft)} className="flex-1">שמירה</Button>
            <Button variant="secondary" onClick={() => { setDraft(null); setError(null); }}>ביטול</Button>
          </div>
        </Card>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {error && retry && (
        <Button variant="secondary" onClick={retry} className="w-full">נסו לקרוא שוב</Button>
      )}
      {busy && <Waiting overlay label="קוראים את הגיפטקארד" />}
      {saving && <Waiting overlay label="שומרים" />}
      {viewing && (
        <button onClick={() => setViewing(null)} aria-label="סגירה" className="fixed inset-0 z-30 grid place-items-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={viewing} alt="תמונת הגיפטקארד" className="max-h-full max-w-full rounded-xl bg-white" />
        </button>
      )}
    </main>
  );
}
