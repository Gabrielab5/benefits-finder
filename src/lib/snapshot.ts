import type { SupabaseClient } from '@supabase/supabase-js';
import type { Benefit, Profile, Program, Snapshot, Store, WalletItem } from './core/types';
import { selectAll } from './selectAll';

export async function fetchSnapshot(sb: SupabaseClient): Promise<Snapshot> {
  const [profile, programs, wallet, stores, benefits] = await Promise.all([
    sb.from('profile').select('*').maybeSingle(),
    selectAll<Program>((a, b) => sb.from('programs').select('*').order('name').order('id').range(a, b)),
    selectAll<WalletItem>((a, b) => sb.from('wallet_items').select('*').order('created_at').order('id').range(a, b)),
    selectAll<Store>((a, b) => sb.from('stores').select('*').order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').neq('status', 'archived').order('id').range(a, b)),
  ]);
  if (profile.error) throw profile.error;
  return {
    profile: (profile.data as Profile | null) ?? null,
    programs, wallet, stores, benefits,
    fetchedAt: new Date().toISOString(),
  };
}

const DB_NAME = 'benefits-finder';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private mode / blocked storage: the app still works online
  }
}

export const idbGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key));
export const idbSet = async (key: string, value: unknown) => { await run('readwrite', (s) => s.put(value, key)); };
export const idbClear = async () => { await run('readwrite', (s) => s.clear()); };
