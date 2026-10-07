// Approves every "waiting for approval" import of the admin, exactly like tapping Save on the review screen:
// same validation, same store de-duplication, same merge rule, and the import's shared/private choice.
// Usage: npx tsx scripts/approve-pending.mts
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { israelToday } from '../src/lib/core/dates';
import { mergeImport } from '../src/lib/core/merge';
import { existingForImport, planNewStores, rowProblems, storesForImport, toIncoming, type ImportRow, type ReviewRow } from '../src/lib/core/review';
import type { Benefit, Store } from '../src/lib/core/types';
import { selectAll } from '../src/lib/selectAll';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data: admins } = await sb.from('profile').select('user_id').eq('is_admin', true);
if (!admins?.length) throw new Error('no admin user');
const uid = admins[0].user_id as string;
const visible = `user_id.is.null,user_id.eq.${uid}`;

const { data: imports, error } = await sb.from('imports').select('*, programs(name)')
  .eq('user_id', uid).eq('status', 'pending_review').order('created_at');
if (error) throw error;

for (const imp of imports as (ImportRow & { programs: { name: string } })[]) {
  const name = imp.programs.name;
  if (!imp.extracted) { console.log(`${name}: no data, skipped`); continue; }
  const shared = !!imp.shared;
  const nowIso = new Date().toISOString();

  // Read fresh every time so stores created by the previous import are reused.
  const [stores, programBenefits] = await Promise.all([
    selectAll<Store>((a, b) => sb.from('stores').select('*').or(visible).order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('program_id', imp.program_id).order('id').range(a, b)),
  ]);
  const existing = existingForImport(programBenefits, imp.program_id, shared, uid);

  const ctx = { storeIds: new Set(stores.map((s) => s.id)), newStores: imp.extracted.new_stores, todayIso: israelToday().iso };
  const approved: ReviewRow[] = [];
  for (const b of imp.extracted.benefits) {
    const row: ReviewRow = { ...b, approved: true };
    // A cashback/discount whose rate isn't published (e.g. "varies by site") is kept as "other" instead of guessing.
    if ((row.type === 'percent_off' || row.type === 'cashback_percent') && row.value == null) row.type = 'other';
    const problems = rowProblems(row, ctx);
    if (problems.length) console.log(`  ${name}: skipped "${row.title}" — ${problems.join(', ')}`);
    else approved.push(row);
  }

  const owner = shared ? null : uid;
  const newStoreIds: (string | undefined)[] = [];
  const used = [...new Set(approved.map((r) => r.new_store_index).filter((i): i is number => i != null))];
  let created = 0;
  for (const group of planNewStores(used, imp.extracted.new_stores, storesForImport(stores, shared))) {
    let id = group.existingId;
    if (!id) {
      const { data, error: e } = await sb.from('stores').insert({
        user_id: owner, name_he: group.draft.name_he.trim(), name_en: group.draft.name_en.trim(),
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
    const { error: e } = await sb.from('benefits').insert(plan.inserts.map((b) => ({ ...b, user_id: owner, program_id: imp.program_id, last_verified_at: nowIso })));
    if (e) throw e;
  }
  for (const u of plan.updates) {
    const { error: e } = await sb.from('benefits').update(u.patch).eq('id', u.id);
    if (e) throw e;
  }
  if (plan.notSeen.length) await sb.from('benefits').update({ status: 'not_seen' }).in('id', plan.notSeen);
  await sb.from('imports').update({ status: 'saved' }).eq('id', imp.id);
  await sb.from('programs').update({ last_refreshed_at: nowIso, last_refresh_status: 'ok' }).eq('id', imp.program_id);
  console.log(`${name} (${shared ? 'shared' : 'private'}): saved ${plan.inserts.length} new, ${plan.updates.length} updated, ${plan.notSeen.length} not seen, ${created} new stores`);
}
