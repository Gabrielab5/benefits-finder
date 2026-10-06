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
      await idbSet('snapshot', s);
    } catch {
      setError('לא הצלחנו לטעון נתונים עדכניים.');
    }
  }, []);

  useEffect(() => {
    // Show the cached copy immediately (works offline), then replace it with fresh data.
    idbGet<Snapshot>('snapshot').then((cached) => {
      if (cached) setSnapshot((prev) => prev ?? cached);
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
