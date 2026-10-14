'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Snapshot } from './core/types';
import { fetchSnapshot, idbGet, idbSet } from './snapshot';
import { supabaseBrowser } from './supabase/browser';

interface SnapshotState {
  snapshot: Snapshot | null;
  fresh: boolean;
  online: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SnapshotContext = createContext<SnapshotState | null>(null);

type Cached = Snapshot & { uid?: string }; // the account the cached copy belongs to

export function SnapshotProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [fresh, setFresh] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchSnapshot(supabaseBrowser());
      setSnapshot(s);
      setFresh(true);
      setError(null);
      await idbSet('snapshot', { ...s, uid: s.profile?.user_id } satisfies Cached);
    } catch {
      setError('לא הצלחנו לטעון נתונים עדכניים, אז ייתכן שמה שמוצג ישן. רעננו את הדף כדי לנסות שוב.');
    }
  }, []);

  useEffect(() => {
    // Show the cached copy immediately, then replace it with fresh data. Online, only to the account it belongs to, so
    // on a shared device the next person never sees the last one's wallet. Offline there's no session to check
    // without a network call, so the cache is shown as before (that is what keeps the app working in a basement).
    idbGet<Cached>('snapshot').then(async (cached) => {
      if (!cached) return;
      if (navigator.onLine && cached.uid !== (await supabaseBrowser().auth.getSession()).data.session?.user.id) return;
      setSnapshot((prev) => prev ?? cached);
    });
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if (navigator.onLine) refresh();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [refresh]);

  return (
    <SnapshotContext.Provider value={{ snapshot, fresh, online, error, refresh }}>{children}</SnapshotContext.Provider>
  );
}

export function useSnap(): SnapshotState {
  const ctx = useContext(SnapshotContext);
  if (!ctx) throw new Error('useSnap must be used inside <SnapshotProvider>');
  return ctx;
}
