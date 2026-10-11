import type { SupabaseClient } from '@supabase/supabase-js';
import type { Benefit, Profile, Program, Snapshot, Store, WalletItem } from './core/types';
import { selectAll } from './selectAll';

export type Catalog = Pick<Snapshot, 'programs' | 'stores' | 'benefits'>;

/** The shared catalog (rows with no owner). Loaded once per cron run. Server-only. */
export async function fetchSharedCatalog(sb: SupabaseClient): Promise<Catalog> {
  const [programs, stores, benefits] = await Promise.all([
    selectAll<Program>((a, b) => sb.from('programs').select('*').is('user_id', null).order('id').range(a, b)),
    selectAll<Store>((a, b) => sb.from('stores').select('*').is('user_id', null).order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').is('user_id', null).eq('status', 'active').order('id').range(a, b)),
  ]);
  return { programs, stores, benefits };
}

/** What one user sees: the shared catalog plus their own wallet and private rows. Server-only. */
export async function fetchUserSnapshot(sb: SupabaseClient, profile: Profile, shared: Catalog): Promise<Snapshot> {
  const uid = profile.user_id;
  const [programs, wallet, stores, benefits] = await Promise.all([
    selectAll<Program>((a, b) => sb.from('programs').select('*').eq('user_id', uid).order('id').range(a, b)),
    selectAll<WalletItem>((a, b) => sb.from('wallet_items').select('*').eq('user_id', uid).order('id').range(a, b)),
    selectAll<Store>((a, b) => sb.from('stores').select('*').eq('user_id', uid).order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('user_id', uid).eq('status', 'active').order('id').range(a, b)),
  ]);
  return {
    profile, wallet, fetchedAt: '',
    programs: [...shared.programs, ...programs], stores: [...shared.stores, ...stores], benefits: [...shared.benefits, ...benefits],
  };
}
