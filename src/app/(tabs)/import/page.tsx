'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildChatPrompt, parseChatAnswer } from '@/lib/ai/chatImport';
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

  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
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
      program_id: programId, source: 'chat', raw_input: { url: url.trim() || null, text: null, paths: null },
      is_refresh: isRefresh, extracted: result.extraction, status: 'pending_review',
    }).select('id').single();
    if (error) throw error;
    router.push(`/import/${data.id}`);
  }

  /** Manual entry: no AI, opens the review screen with one empty row. Free and always available. */
  async function startManual() {
    const { data, error } = await supabaseBrowser().from('imports').insert({
      program_id: programId, source: 'manual', raw_input: { url: null, text: null, paths: null },
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
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">ייבוא הטבות</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">ייבוא דורש חיבור לאינטרנט.</p>}

      <select aria-label="תוכנית" value={programId} onChange={(e) => setProgramId(e.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white p-3">
        <option value="">של איזו תוכנית ההטבות?</option>
        {snapshot.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div className="flex rounded-xl bg-gray-200 p-1" role="tablist">
        {MODES.map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex-1 rounded-lg p-2 text-sm ${mode === m ? 'bg-white font-semibold shadow' : ''}`}>{label}</button>
        ))}
      </div>

      {mode === 'link' && (
        <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
          aria-label="קישור לדף ההטבות" className="w-full rounded-xl border border-gray-300 p-3" />
      )}
      {mode === 'text' && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="הדביקו כאן את הטקסט מדף ההטבות"
          aria-label="טקסט" className="w-full rounded-xl border border-gray-300 p-3" />
      )}
      {mode === 'screenshot' && (
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="צילומי מסך"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="w-full" />
      )}
      {mode === 'chat' && (
        <div className="space-y-3">
          {isRefresh && <p className="rounded-lg bg-blue-50 p-2 text-sm text-blue-800">רענון: הטבות שלא יופיעו בתשובה יסומנו לבדיקה.</p>}
          <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (לא חובה)"
            aria-label="קישור לדף ההטבות (לא חובה)" className="w-full rounded-xl border border-gray-300 p-3" />
          <button disabled={!programId} onClick={copyPrompt}
            className="w-full rounded-xl border border-blue-700 bg-white p-3 font-semibold text-blue-700 disabled:opacity-50">
            1. העתקת הוראות לצ׳אט {copied ? '✓ הועתק' : ''}
          </button>
          {promptFallback && (
            <textarea readOnly value={promptFallback} rows={4} aria-label="הוראות להעתקה" onFocus={(e) => e.target.select()}
              className="w-full rounded-xl border border-gray-300 p-2 text-xs" dir="ltr" />
          )}
          <p className="text-sm text-gray-600">
            2. הדביקו את ההוראות בצ׳אט חינמי. אם לא הוספתם קישור — הדביקו אחריהן גם את טקסט הדף או צילום מסך:
          </p>
          <div className="flex gap-2">
            {CHATBOTS.map(([name, href]) => (
              <a key={name} href={href} target="_blank" rel="noreferrer"
                className="flex-1 rounded-lg bg-gray-100 p-2 text-center text-sm text-blue-700">{name}</a>
            ))}
          </div>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} dir="ltr"
            placeholder="3. הדביקו כאן את כל התשובה של הצ׳אט" aria-label="התשובה של הצ׳אט"
            className="w-full rounded-xl border border-gray-300 p-3 text-sm" />
        </div>
      )}
      {mode === 'manual' && (
        <p className="text-sm text-gray-600">הקלדת הטבות בעצמכם, בלי AI. תמיד עובד ובחינם.</p>
      )}

      <button disabled={!ready} onClick={submit}
        className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
        {mode === 'manual' ? 'הוספה ידנית' : mode === 'chat' ? '4. המשך לבדיקה'
          : busy ? 'מחלץ הטבות… זה יכול לקחת כמה דקות' : 'חילוץ הטבות'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">ממתינים לאישור</h2>
          <ul className="space-y-1">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={`/import/${p.id}`} className="block rounded-lg bg-white p-2 text-blue-700">
                  {programName.get(p.program_id) ?? 'תוכנית'} · {formatDate(p.created_at)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
