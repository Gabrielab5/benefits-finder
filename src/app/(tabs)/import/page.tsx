'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Copy, ExternalLink, Plus } from 'lucide-react';
import { Button, Loading, Notice, PageHeader, SectionTitle, field } from '@/components/ui';
import { buildChatPrompt, parseChatAnswer } from '@/lib/ai/chatImport';
import { isShared } from '@/lib/core/catalog';
import { israelToday } from '@/lib/core/dates';
import { formatDate, IMPORT_ERRORS } from '@/lib/core/labels';
import { blankRow } from '@/lib/core/review';
import { startImport, type ImportRequest } from '@/lib/startImport';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

type Mode = ImportRequest['mode'] | 'chat' | 'manual';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** Paid automatic import (Claude API) only when explicitly switched on; otherwise free chatbot import. */
const AI_ON = process.env.NEXT_PUBLIC_AI_API === 'on';
const MODES: [Mode, string][] = [
  ...(AI_ON ? ([['link', 'קישור'], ['text', 'טקסט'], ['screenshot', 'צילומי מסך']] as [Mode, string][]) : []),
  ['chat', 'בעזרת צ׳אט'],
  ['manual', 'ידני'],
];
const CHATBOTS = [['Claude', 'https://claude.ai/new'], ['ChatGPT', 'https://chatgpt.com'], ['Gemini', 'https://gemini.google.com']];

export default function ImportPage() {
  const { snapshot, online } = useSnap();
  const router = useRouter();
  const [programId, setProgramId] = useState('');
  const [mode, setMode] = useState<Mode>(AI_ON ? 'link' : 'chat');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [answer, setAnswer] = useState('');
  const [copied, setCopied] = useState(false);
  const [promptFallback, setPromptFallback] = useState<string | null>(null);
  const [isRefresh, setIsRefresh] = useState(false);
  const [shareChoice, setShareChoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; program_id: string; created_at: string }[]>([]);

  useEffect(() => {
    supabaseBrowser().from('imports').select('id,program_id,created_at').eq('status', 'pending_review')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setPending(data ?? []));
    // "Refresh" from Sources opens this page as /import?program=…&url=…&refresh=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('program')) {
      setProgramId(params.get('program')!);
      setUrl(params.get('url') ?? '');
      setIsRefresh(params.get('refresh') === '1');
      setMode('chat');
    }
  }, []);

  if (!snapshot) return <Loading />;
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
  const isAdmin = Boolean(snapshot.profile?.is_admin);
  const selected = snapshot.programs.find((p) => p.id === programId);
  const toShared = isAdmin && shareChoice && Boolean(selected && isShared(selected));
  const hasInput = mode === 'link' ? url.trim() : mode === 'text' ? text.trim() : mode === 'screenshot' ? files.length > 0
    : mode === 'chat' ? answer.trim() : true;
  const ready = online && !busy && !!programId && !!hasInput;

  async function copyPrompt() {
    if (!snapshot) return;
    const prompt = buildChatPrompt({
      programName: programName.get(programId) ?? '', stores: snapshot.stores, todayIso: israelToday().iso,
      url: url.trim() || undefined,
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setPromptFallback(null);
    } catch {
      setPromptFallback(prompt); // clipboard blocked: show it so it can be copied by hand
    }
  }

  /** Free import: check the chatbot's pasted answer, then open the normal review screen. */
  async function startChat() {
    const result = parseChatAnswer(answer);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { data, error } = await supabaseBrowser().from('imports').insert({
      program_id: programId, source: 'chat', shared: toShared, raw_input: { url: url.trim() || null, text: null, paths: null },
      is_refresh: isRefresh, extracted: result.extraction, status: 'pending_review',
    }).select('id').single();
    if (error) throw error;
    router.push(`/import/${data.id}`);
  }

  /** Manual entry: no AI, opens the review screen with one empty row. Free and always available. */
  async function startManual() {
    const { data, error } = await supabaseBrowser().from('imports').insert({
      program_id: programId, source: 'manual', shared: toShared, raw_input: { url: null, text: null, paths: null },
      extracted: { new_stores: [], benefits: [(({ approved: _a, ...rest }) => rest)(blankRow())] },
      status: 'pending_review',
    }).select('id').single();
    if (error) throw error;
    router.push(`/import/${data.id}`);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'manual') return await startManual();
      if (mode === 'chat') return await startChat();
      let paths: string[] | undefined;
      if (mode === 'screenshot') {
        if (files.length > 5 || files.some((f) => !IMAGE_TYPES.includes(f.type))) {
          setError(IMPORT_ERRORS.bad_screenshots);
          return;
        }
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error('unauthorized');
        paths = [];
        for (const f of files) {
          const path = `${user.id}/${crypto.randomUUID()}.${f.type.split('/')[1]}`;
          const { error } = await sb.storage.from('imports').upload(path, f, { contentType: f.type });
          if (error) throw error;
          paths.push(path);
        }
      }
      const result = await startImport({ programId, mode, url: url.trim(), text, paths });
      if ('error' in result) setError(result.error);
      else router.push(`/import/${result.importId}`);
    } catch {
      setError(IMPORT_ERRORS.default);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-5">
      <PageHeader title="ייבוא הטבות" subtitle="בעזרת צ׳אט חינמי או ידנית" icon={Plus} />
      {!online && <Notice tone="warn">ייבוא דורש חיבור לאינטרנט.</Notice>}

      <label className="block">
        <span className="text-sm text-muted">של איזו תוכנית ההטבות?</span>
        <select aria-label="תוכנית" value={programId} onChange={(e) => setProgramId(e.target.value)} className={`${field} mt-1`}>
          <option value="">בחרו תוכנית</option>
          {snapshot.programs.map((p) => <option key={p.id} value={p.id}>{p.name}{isShared(p) ? '' : ' (פרטי)'}</option>)}
        </select>
      </label>
      {isAdmin && selected && isShared(selected) && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-mint" checked={shareChoice} onChange={(e) => setShareChoice(e.target.checked)} />
          לקטלוג המשותף (כל המשתמשים יראו)
        </label>
      )}

      <div className="flex rounded-2xl border border-line bg-panel p-1" role="tablist">
        {MODES.map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex-1 rounded-xl p-2 text-sm transition ${mode === m ? 'bg-panel-2 font-semibold text-mint' : 'text-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'link' && (
        <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
          aria-label="קישור לדף ההטבות" className={field} />
      )}
      {mode === 'text' && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="הדביקו כאן את הטקסט מדף ההטבות"
          aria-label="טקסט" className={field} />
      )}
      {mode === 'screenshot' && (
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="צילומי מסך"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="w-full text-sm text-muted file:me-3 file:rounded-xl file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:text-fg" />
      )}
      {mode === 'chat' && (
        <ol className="space-y-3">
          {isRefresh && <Notice>רענון: הטבות שלא יופיעו בתשובה יסומנו לבדיקה.</Notice>}
          <Step n={1} title="קישור לדף ההטבות (לא חובה)">
            <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
              aria-label="קישור לדף ההטבות (לא חובה)" className={field} />
          </Step>
          <Step n={2} title="העתקת ההוראות">
            <Button variant="secondary" disabled={!programId} onClick={copyPrompt} className="w-full">
              {copied ? <><Check size={16} aria-hidden /> הועתק</> : <><Copy size={16} aria-hidden /> העתקת הוראות לצ׳אט</>}
            </Button>
            {promptFallback && (
              <textarea readOnly value={promptFallback} rows={4} aria-label="הוראות להעתקה" onFocus={(e) => e.target.select()}
                className={`${field} mt-2 text-xs`} dir="ltr" />
            )}
          </Step>
          <Step n={3} title="הדביקו בצ׳אט חינמי">
            <p className="mb-2 text-xs text-dim">אם לא הוספתם קישור — הדביקו אחרי ההוראות גם את טקסט הדף או צילום מסך.</p>
            <div className="flex gap-2">
              {CHATBOTS.map(([name, href]) => (
                <a key={name} href={href} target="_blank" rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-line bg-panel-2 p-2 text-sm text-fg hover:border-mint">
                  {name} <ExternalLink size={12} className="text-dim" aria-hidden />
                </a>
              ))}
            </div>
          </Step>
          <Step n={4} title="הדביקו כאן את התשובה">
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} dir="ltr"
              placeholder="{ … }" aria-label="התשובה של הצ׳אט" className={`${field} font-mono text-xs`} />
          </Step>
        </ol>
      )}
      {mode === 'manual' && <Notice>הקלדת הטבות בעצמכם, בלי AI. תמיד עובד ובחינם.</Notice>}

      <Button disabled={!ready} onClick={submit} className="w-full py-3">
        {mode === 'manual' ? 'הוספה ידנית' : mode === 'chat' ? 'המשך לבדיקה'
          : busy ? 'מחלץ הטבות… זה יכול לקחת כמה דקות' : 'חילוץ הטבות'}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}

      {pending.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>ממתינים לאישור</SectionTitle>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={`/import/${p.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-panel p-3 hover:border-mint">
                  <span>{programName.get(p.program_id) ?? 'תוכנית'}</span>
                  <span className="flex items-center gap-1 text-xs text-dim">{formatDate(p.created_at)} <ChevronLeft size={14} aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-panel p-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mint text-sm font-bold text-mint-ink">{n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-semibold">{title}</p>
        {children}
      </div>
    </li>
  );
}
