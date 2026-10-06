'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate, IMPORT_ERRORS } from '@/lib/core/labels';
import { blankRow } from '@/lib/core/review';
import { startImport, type ImportRequest } from '@/lib/startImport';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

type Mode = ImportRequest['mode'] | 'manual';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MODES: [Mode, string][] = [['link', 'קישור'], ['text', 'טקסט'], ['screenshot', 'צילומי מסך'], ['manual', 'ידני']];

export default function ImportPage() {
  const { snapshot, online } = useSnap();
  const router = useRouter();
  const [programId, setProgramId] = useState('');
  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; program_id: string; created_at: string }[]>([]);

  useEffect(() => {
    supabaseBrowser().from('imports').select('id,program_id,created_at').eq('status', 'pending_review')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setPending(data ?? []));
  }, []);

  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
  const hasInput = mode === 'link' ? url.trim() : mode === 'text' ? text.trim() : mode === 'screenshot' ? files.length > 0 : true;
  const ready = online && !busy && !!programId && !!hasInput;

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
      {mode === 'manual' && (
        <p className="text-sm text-gray-600">הקלדת הטבות בעצמכם, בלי AI. תמיד עובד ובחינם.</p>
      )}

      <button disabled={!ready} onClick={submit}
        className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
        {mode === 'manual' ? 'הוספה ידנית' : busy ? 'מחלץ הטבות… זה יכול לקחת כמה דקות' : 'חילוץ הטבות'}
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
