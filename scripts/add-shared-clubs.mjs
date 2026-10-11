// Adds clubs to the shared catalog: one program plus one wallet membership each. Existing names are skipped.
// Usage: node scripts/add-shared-clubs.mjs <clubs.json>   — file: [{ "name", "kind"?, "benefits_url"?, "product_type"? }]
// product_type "card" for clubs that exist only as a credit card (default "membership").
import fs from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const clubs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: existing, error } = await sb.from('programs').select('name').is('user_id', null);
if (error) throw error;
const have = new Set(existing.map((p) => p.name));

for (const c of clubs) {
  if (have.has(c.name)) { console.log(`${c.name}: exists`); continue; }
  const { data: program, error: e1 } = await sb.from('programs')
    .insert({ user_id: null, name: c.name, kind: c.kind ?? 'store_club', benefits_url: c.benefits_url ?? null })
    .select('id').single();
  if (e1) { console.log(`${c.name}: FAILED ${e1.message}`); continue; }
  const { error: e2 } = await sb.from('card_products')
    .insert({ user_id: null, name: c.name, type: c.product_type ?? 'membership', program_ids: [program.id] });
  console.log(`${c.name}: ${e2 ? `program added, membership FAILED ${e2.message}` : 'added'}`);
}
