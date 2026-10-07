// One-off switchover to the shared catalog. Run AFTER supabase/migrations/20261007000000_shared_catalog.sql.
// Usage: npx tsx scripts/migrate-to-shared.mts        (safe to re-run)
import fs from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { findStoreByName } from '../src/lib/core/normalize';
import type { Store } from '../src/lib/core/types';
import { SEED_STORES } from '../src/lib/seedStores';
import { selectAll } from '../src/lib/selectAll';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const probe = await sb.from('card_products').select('id').limit(1);
if (probe.error) throw new Error(`Run the SQL migration first (${probe.error.message})`);

const { data: { users } } = await sb.auth.admin.listUsers();
const owners = users.filter((u) => !/e2e/i.test(u.email ?? ''));
if (owners.length !== 1) throw new Error(`expected exactly one real user (the owner), found ${owners.length}`);
const uid = owners[0].id;

// 1. Backup everything the owner has, before changing anything.
const backup: Record<string, unknown[]> = {};
for (const t of ['profile', 'programs', 'wallet_items', 'stores', 'benefits', 'imports']) {
  backup[t] = await selectAll((a, b) => sb.from(t).select('*').eq('user_id', uid).range(a, b));
}
fs.mkdirSync('backups', { recursive: true });
const file = `backups/before-shared-catalog-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(backup, null, 2));
console.log(`backup: ${file}`);

// 2. The owner's catalog becomes the shared catalog; the owner becomes admin.
for (const t of ['programs', 'stores', 'benefits']) {
  const { error } = await sb.from(t).update({ user_id: null }).eq('user_id', uid);
  if (error) throw error;
}
await sb.from('profile').update({ is_admin: true }).eq('user_id', uid);

// 3. Starting card products.
const programs = await selectAll<{ id: string; name: string }>((a, b) => sb.from('programs').select('id,name').is('user_id', null).range(a, b));
const pid = (name: string) => {
  const p = programs.find((x) => x.name === name);
  if (!p) throw new Error(`missing shared program "${name}"`);
  return p.id;
};
const PRODUCTS: [string, 'card' | 'membership', string[]][] = [
  ['ישראכרט', 'card', ['ישראכרט']],
  ['מקס', 'card', ['מקס']],
  ['מקס של ביחד בשבילך', 'card', ['מקס', 'ביחד בשבילך']],
  ['כאל', 'card', ['כאל']],
  ['דיינרס', 'card', ['דיינרס']],
  ['דרים קארד – כרטיס אשראי', 'card', ['דרים קארד']],
  ['שופרסל – כרטיס אשראי', 'card', ['שופרסל']],
  ['מועדון דרים קארד', 'membership', ['דרים קארד']],
  ['רי-בר', 'membership', ['רי-בר']],
  ['דלתא פלוס', 'membership', ['דלתא פלוס']],
  ['מועדון שופרסל', 'membership', ['שופרסל']],
  ['ביחד בשבילך', 'membership', ['ביחד בשבילך']],
  ['עובדים בריא', 'membership', ['עובדים בריא']],
];
const existingProducts = await selectAll<{ id: string; name: string }>((a, b) => sb.from('card_products').select('id,name').is('user_id', null).range(a, b));
for (const [name, type, progs] of PRODUCTS) {
  if (existingProducts.some((p) => p.name === name)) continue;
  const { error } = await sb.from('card_products').insert({ user_id: null, name, type, program_ids: progs.map(pid) });
  if (error) throw error;
}

// 4. Link the owner's wallet items to their products (programs stay as they are).
const LINKS: Record<string, string> = {
  'ישראכרט': 'ישראכרט', 'מקס': 'מקס של ביחד בשבילך', 'כאל': 'כאל', 'דיינרס': 'דיינרס',
  'דרים קארד – כרטיס אשראי': 'דרים קארד – כרטיס אשראי', 'שופרסל – כרטיס אשראי': 'שופרסל – כרטיס אשראי',
  'דרים קארד': 'מועדון דרים קארד', 'שופרסל': 'מועדון שופרסל', 'רי-בר': 'רי-בר', 'דלתא פלוס': 'דלתא פלוס',
  'ביחד בשבילך': 'ביחד בשבילך', 'עובדים בריא': 'עובדים בריא',
};
const products = await selectAll<{ id: string; name: string }>((a, b) => sb.from('card_products').select('id,name').is('user_id', null).range(a, b));
const { data: wallet } = await sb.from('wallet_items').select('id,name,product_id').eq('user_id', uid);
let linked = 0;
for (const w of wallet ?? []) {
  const product = products.find((p) => p.name === LINKS[w.name]);
  if (product && !w.product_id) {
    await sb.from('wallet_items').update({ product_id: product.id }).eq('id', w.id);
    linked++;
  }
}

// 5. Well-known stores (skip ones that already exist under any spelling).
const shared = await selectAll<Store>((a, b) => sb.from('stores').select('*').is('user_id', null).order('id').range(a, b));
const toAdd = SEED_STORES.filter((s) => !findStoreByName(shared, s.name_he) && !findStoreByName(shared, s.name_en));
for (let i = 0; i < toAdd.length; i += 100) {
  const { error } = await sb.from('stores').insert(toAdd.slice(i, i + 100).map((s) => ({ ...s, user_id: null })));
  if (error) throw error;
}

console.log(`shared programs: ${programs.length}; products: ${products.length}; wallet items linked: ${linked}; stores added: ${toAdd.length}`);
