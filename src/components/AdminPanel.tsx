'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { Button, Notice, SectionTitle, field } from '@/components/ui';
import { isShared } from '@/lib/core/catalog';
import { normalize } from '@/lib/core/normalize';
import type { CardProduct, Program } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';

interface AdminUser {
  id: string;
  email: string;
  last_sign_in_at: string | null;
  onboarded: boolean;
  is_admin: boolean;
}

const PAGE = 12;

const ERRORS: Record<string, string> = {
  exists: 'לכתובת הזו כבר יש גישה.',
  invalid_email: 'כתובת אימייל לא תקינה.',
  self: 'אי אפשר להסיר את עצמכם.',
  last_admin: 'חייב להישאר לפחות מנהל אחד.',
  not_onboarded: 'המשתמש עוד לא סיים הרשמה.',
  forbidden: 'אין הרשאה.',
};

function inviteMail(to: string): string {
  const body = `היי! הזמנתי אותך לאפליקציה שמראה באיזה כרטיס כדאי לשלם בכל חנות.\nנכנסים כאן עם Google או עם קוד שנשלח למייל:\n${window.location.origin}/login`;
  return `mailto:${to}?subject=${encodeURIComponent('הזמנה לאפליקציית ההטבות')}&body=${encodeURIComponent(body)}`;
}

export default function AdminPanel({ programs, products, onChange }: {
  programs: Program[];
  products: CardProduct[];
  onChange: () => Promise<void>;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState('');
  const [invited, setInvited] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CardProduct['type']>('card');
  const [productQuery, setProductQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pager = useRef<HTMLDivElement>(null);

  const load = useCallback(() => fetch('/api/admin/users').then(async (res) => {
    if (res.ok) setUsers(((await res.json()) as { users: AdminUser[] }).users);
  }), []);
  useEffect(() => { load(); }, [load]);

  async function call(method: string, body?: object, query = ''): Promise<boolean> {
    const res = await fetch(`/api/admin/users${query}`, {
      method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(ERRORS[result.error ?? ''] ?? 'הפעולה נכשלה.');
      return false;
    }
    setMessage(null);
    await load();
    return true;
  }

  async function invite() {
    const to = email.trim();
    if (await call('POST', { email: to })) {
      setInvited(to);
      setEmail('');
    }
  }

  const sb = supabaseBrowser();
  async function write(op: PromiseLike<{ error: unknown }>) {
    const { error } = await op;
    if (error) setMessage('השמירה נכשלה.');
    else {
      setMessage(null);
      await onChange();
    }
  }
  const sharedPrograms = programs.filter(isShared);
  const q = normalize(productQuery);
  const sharedProducts = products.filter((p) => isShared(p) && (!q || normalize(p.name).includes(q)));
  const pages = Array.from({ length: Math.ceil(sharedProducts.length / PAGE) }, (_, i) => sharedProducts.slice(i * PAGE, (i + 1) * PAGE));
  const selected = products.find((p) => p.id === selectedId);

  return (
    <section className="space-y-5 rounded-2xl border border-mint/30 bg-panel p-4">
      <h2 className="flex items-center gap-2 font-semibold text-mint"><ShieldCheck size={18} aria-hidden /> ניהול</h2>
      {message && <Notice tone="error">{message}</Notice>}

      <div className="space-y-2">
        <SectionTitle>הזמנת משתמש</SectionTitle>
        <div className="flex gap-2">
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
            aria-label="אימייל להזמנה" className={`${field} min-w-0 flex-1`} />
          <Button onClick={invite} disabled={!email.trim()}><UserPlus size={16} aria-hidden /> הזמנה</Button>
        </div>
        {invited && (
          <Notice tone="success">
            {invited} יכול/ה להיכנס עכשיו. <a href={inviteMail(invited)} className="underline">שליחת הזמנה במייל</a>
          </Notice>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle>משתמשים עם גישה</SectionTitle>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate" dir="ltr">{u.email}</span>
              <span className="text-xs text-dim">{u.onboarded ? 'הצטרף/ה' : 'טרם נכנס/ה'}{u.is_admin ? ' · מנהל/ת' : ''}</span>
              {!u.onboarded && (
                <a href={inviteMail(u.email)} aria-label={`שליחת הזמנה ל-${u.email}`} className="text-mint"><Mail size={15} aria-hidden /></a>
              )}
              {u.onboarded && (
                <button onClick={() => call('PATCH', { id: u.id, is_admin: !u.is_admin })} className="text-xs text-mint">
                  {u.is_admin ? 'הסרת ניהול' : 'הפיכה למנהל/ת'}
                </button>
              )}
              <button onClick={() => confirm(`להסיר את הגישה של ${u.email}? המידע הפרטי שלו/ה יימחק.`) && call('DELETE', undefined, `?id=${u.id}`)}
                aria-label={`הסרת ${u.email}`} className="text-bad"><Trash2 size={15} aria-hidden /></button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <SectionTitle>כרטיסים ומועדונים בקטלוג</SectionTitle>
        <p className="text-xs text-dim">משתמשים בוחרים מהרשימה הזו בהרשמה, וכל פריט פותח את ההטבות של התוכניות שמסומנות בו.</p>
        <input type="search" value={productQuery} onChange={(e) => { setProductQuery(e.target.value); pager.current?.scrollTo({ left: 0 }); }}
          placeholder="חיפוש בקטלוג" aria-label="חיפוש בקטלוג" className={field} />
        <div ref={pager} onScroll={(e) => setPage(Math.round(Math.abs(e.currentTarget.scrollLeft) / e.currentTarget.clientWidth))}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
          {pages.map((chunk, i) => (
            <ul key={i} className="grid w-full shrink-0 snap-start auto-rows-min grid-cols-3 gap-1.5">
              {chunk.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setSelectedId(selectedId === p.id ? null : p.id)} aria-pressed={selectedId === p.id}
                    className={`flex h-16 w-full flex-col justify-between rounded-xl border p-2 text-start ${selectedId === p.id ? 'border-mint bg-mint/10' : 'border-line bg-panel-2'}`}>
                    <span className="line-clamp-2 text-xs leading-tight">{p.name}</span>
                    <span className="text-[10px] text-dim">{p.type === 'card' ? 'כרטיס' : 'מועדון'} · {p.program_ids.length === 1 ? 'תוכנית אחת' : `${p.program_ids.length} תוכניות`}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </div>
        {pages.length > 1 && (
          <div className="flex flex-wrap justify-center gap-1">
            {pages.map((_, i) => (
              <button key={i} aria-label={`עמוד ${i + 1}`} aria-current={page === i}
                onClick={() => pager.current?.children[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })}
                className={`h-7 min-w-7 rounded-full text-xs ${page === i ? 'bg-mint text-mint-ink' : 'border border-line text-dim'}`}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div key={selected.id} className="space-y-2 rounded-xl border border-mint/40 bg-panel-2 p-3">
            <div className="flex gap-2">
              <input defaultValue={selected.name} aria-label="שם" className={`${field} min-w-0 flex-1`}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== selected.name &&
                  write(sb.from('card_products').update({ name: e.target.value.trim() }).eq('id', selected.id))} />
              <select value={selected.type} aria-label="סוג" className={`${field} w-28! shrink-0`}
                onChange={(e) => write(sb.from('card_products').update({ type: e.target.value }).eq('id', selected.id))}>
                <option value="card">כרטיס</option>
                <option value="membership">מועדון</option>
              </select>
              <button aria-label={`מחיקת ${selected.name}`} className="text-bad"
                onClick={() => confirm(`למחוק את "${selected.name}" מהקטלוג?`) && write(sb.from('card_products').delete().eq('id', selected.id))}>
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {sharedPrograms.filter((prog) => selected.program_ids.includes(prog.id)).map((prog) => (
                <button key={prog.id} aria-label={`הסרת ${prog.name} מ-${selected.name}`}
                  onClick={() => write(sb.from('card_products').update({ program_ids: selected.program_ids.filter((x) => x !== prog.id) }).eq('id', selected.id))}
                  className="flex items-center gap-1 rounded-full border border-mint bg-mint/10 px-2.5 py-1 text-xs text-mint">
                  {prog.name} <X size={11} aria-hidden />
                </button>
              ))}
              <select value="" aria-label={`הוספת תוכנית ל-${selected.name}`}
                onChange={(e) => e.target.value && write(sb.from('card_products').update({ program_ids: [...selected.program_ids, e.target.value] }).eq('id', selected.id))}
                className="w-28 rounded-full border border-line bg-panel-2 px-2 py-1 text-xs text-dim">
                <option value="">+ תוכנית</option>
                {sharedPrograms.filter((prog) => !selected.program_ids.includes(prog.id)).map((prog) => (
                  <option key={prog.id} value={prog.id}>{prog.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="כרטיס או מועדון חדש" aria-label="שם פריט חדש"
            className={`${field} min-w-0 flex-1`} />
          <select value={newType} onChange={(e) => setNewType(e.target.value as CardProduct['type'])} aria-label="סוג פריט חדש"
            className={`${field} w-28! shrink-0`}>
            <option value="card">כרטיס</option>
            <option value="membership">מועדון</option>
          </select>
          <button aria-label="הוספה לקטלוג" disabled={!newName.trim()}
            onClick={async () => { await write(sb.from('card_products').insert({ user_id: null, name: newName.trim(), type: newType })); setNewName(''); }}
            className="grid w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 disabled:opacity-40">
            <Plus size={16} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
