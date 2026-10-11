import type { SupabaseClient } from '@supabase/supabase-js';
import type { Benefit, Profile, Program, Snapshot, Store, WalletItem } from './core/types';
import { selectAll } from './selectAll';

/** What one user sees (shared catalog + their private rows), loaded with the admin client. Server-only. */
export async function fetchUserSnapshot(sb: SupabaseClient, profile: Profile): Promise<Snapshot> {
  const uid = profile.user_id;
  const visible = `user_id.is.null,user_id.eq.${uid}`;
  const [programs, wallet, stores, benefits] = await Promise.all([
    selectAll<Program>((a, b) => sb.from('programs').select('*').or(visible).order('id').range(a, b)),
    selectAll<WalletItem>((a, b) => sb.from('wallet_items').select('*').eq('user_id', uid).order('id').range(a, b)),
    selectAll<Store>((a, b) => sb.from('stores').select('*').or(visible).order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').or(visible).eq('status', 'active').order('id').range(a, b)),
  ]);
  return { profile, programs, wallet, stores, benefits, fetchedAt: '' };
}
