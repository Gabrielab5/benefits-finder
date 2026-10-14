// Adds the chains in src/lib/seedStores.ts that the shared catalog doesn't have yet (under any spelling). Safe to re-run.
// Usage: npx tsx scripts/add-seed-stores.mts
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { findStoreByName } from '../src/lib/core/normalize';
import type { Store } from '../src/lib/core/types';
import { SEED_STORES } from '../src/lib/seedStores';
import { selectAll } from '../src/lib/selectAll';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const shared = await selectAll<Store>((a, b) => sb.from('stores').select('*').is('user_id', null).order('id').range(a, b));
const toAdd = SEED_STORES.filter((s) => ![s.name_he, s.name_en, ...s.aliases].some((n) => findStoreByName(shared, n)));
for (let i = 0; i < toAdd.length; i += 100) {
  const { error } = await sb.from('stores').insert(toAdd.slice(i, i + 100).map((s) => ({ ...s, user_id: null })));
  if (error) throw error;
}
console.log(`stores added: ${toAdd.length} (already there: ${SEED_STORES.length - toAdd.length})`);
