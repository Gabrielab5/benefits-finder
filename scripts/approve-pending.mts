// Approves every "waiting for approval" import of the app's owner, exactly like tapping Save on the
// review screen: same validation, same store de-duplication, same merge rule.
// Usage: npx tsx scripts/approve-pending.mts
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { israelToday } from '../src/lib/core/dates';
import { mergeImport } from '../src/lib/core/merge';
import { planNewStores, rowProblems, toIncoming, type ImportRow, type ReviewRow } from '../src/lib/core/review';
import type { Benefit, Store } from '../src/lib/core/types';
import { selectAll } from '../src/lib/selectAll';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data: { users } } = await sb.auth.admin.listUsers();
const owner = users.filter((u) => !/e2e/i.test(u.email ?? ''));
if (owner.length !== 1) throw new Error(`expected exactly one real user, found ${owner.length}`);
const uid = owner[0].id;

const { data: imports, error } = await sb.from('imports').select('*, programs(name)')
  .eq('user_id', uid).eq('status', 'pending_review').order('created_at');
if (error) throw error;

for (const imp of imports as (ImportRow & { programs: { name: string } })[]) {
  const name = imp.programs.name;
  if (!imp.extracted) { console.log(`${name}: no data, skipped`); continue; }
  const nowIso = new Date().toISOString();

  // Read fresh every time so stores created by the previous import are reused.
  const [stores, existing] = await Promise.all([
    selectAll<Store>((a, b) => sb.from('stores').select('*').eq('user_id', uid).order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('program_id', imp.program_id).neq('status', 'archived').order('id').range(a, b)),
  ]);

  const rows: ReviewRow[] = imp.extracted.benefits.map((b) => ({ ...b, approved: true }));
  const ctx = { storeIds: new Set(stores.map((s) => s.id)), newStores: imp.extracted.new_stores, todayIso: israelToday().iso };
  const approved: ReviewRow[] = [];
  for (const row of rows) {
    // A cashback/discount whose rate isn't published (e.g. "varies by site") is kept as "other" instead of guessing a number.
    if ((row.type === 'percent_off' || row.type === 'cashback_percent') && row.value == null) row.type = 'other';
    const problems = rowProblems(row, ctx);
    if (problems.length) console.log(`  ${name}: skipped "${row.title}" — ${problems.join(', ')}`);
    else approved.push(row);
  }

  const newStoreIds: (string | undefined)[] = [];
  const used = [...new Set(approved.map((r) => r.new_store_index).filter((i): i is number => i != null))];
  let created = 0;
  for (const group of planNewStores(used, imp.extracted.new_stores, stores)) {
    let id = group.existingId;
    if (!id) {
      const { data, error: e } = await sb.from('stores').insert({
        user_id: uid, name_he: group.draft.name_he.trim(), name_en: group.draft.name_en.trim(),
        aliases: group.draft.aliases, category: group.draft.category, channel: group.draft.channel,
      }).select('id').single();
      if (e) throw e;
      id = data.id as string;
      created++;
    }
    for (const i of group.indexes) newStoreIds[i] = id;
  }

  const plan = mergeImport(existing, approved.map((r) => toIncoming(r, newStoreIds, imp.raw_input.url)), { isRefresh: imp.is_refresh, nowIso });
  if (plan.inserts.length) {
    const { error: e } = await sb.from('benefits').insert(plan.inserts.map((b) => ({ ...b, user_id: uid, program_id: imp.program_id, last_verified_at: nowIso })));
    if (e) throw e;
  }
  for (const u of plan.updates) {
    const { error: e } = await sb.from('benefits').update(u.patch).eq('id', u.id);
    if (e) throw e;
  }
  await sb.from('imports').update({ status: 'saved' }).eq('id', imp.id);
  await sb.from('programs').update({ last_refreshed_at: nowIso, last_refresh_status: 'ok' }).eq('id', imp.program_id);
  const merged = approved.length - plan.inserts.length - plan.updates.length;
  console.log(`${name}: saved ${plan.inserts.length} new, ${plan.updates.length} updated, ${created} new stores${merged ? `, ${merged} same-page duplicates merged` : ''}`);
}
