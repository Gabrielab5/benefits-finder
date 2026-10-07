// One-off loader: takes researched benefit files (one JSON per program, in the chat-answer format)
// and creates one "waiting for approval" import per program for the app's owner.
// Usage: node scripts/load-researched-benefits.mjs <dir> key=<program name> [key=<program name> ...]
import fs from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const [dir, ...pairs] = process.argv.slice(2);
const files = Object.fromEntries(pairs.map((p) => p.split('=')));

const TYPES = ['percent_off', 'fixed_off', 'cashback_percent', 'points', 'bogo', 'gift', 'installments', 'other'];
const REQUIRES = ['pay_with_card', 'membership', 'coupon_code'];
const CHANNELS = ['in_store', 'online', 'both'];
const TIMINGS = ['always', 'birthday_month'];
const CATEGORIES = ['food', 'fuel', 'fashion', 'electronics', 'home', 'pharmacy_beauty', 'restaurants', 'entertainment', 'travel', 'online', 'other'];

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function normalize(raw) {
  const new_stores = (raw.new_stores ?? []).map((s) => ({
    name_he: String(s.name_he ?? ''), name_en: String(s.name_en ?? ''), aliases: Array.isArray(s.aliases) ? s.aliases : [],
    category: pick(s.category, CATEGORIES, 'other'), channel: pick(s.channel, CHANNELS, 'both'),
  }));
  const benefits = (raw.benefits ?? []).filter((b) => str(b.title) && TYPES.includes(b.type)).map((b) => ({
    title: str(b.title), description: str(b.description), store_id: null,
    new_store_index: Number.isInteger(b.new_store_index) && new_stores[b.new_store_index] ? b.new_store_index : null,
    category: b.new_store_index != null ? null : CATEGORIES.includes(b.category) ? b.category : null,
    type: b.type, value: num(b.value), min_spend: num(b.min_spend), max_discount: num(b.max_discount),
    requires: pick(b.requires, REQUIRES, 'pay_with_card'), coupon_code: str(b.coupon_code),
    channel: pick(b.channel, CHANNELS, 'both'), timing: pick(b.timing, TIMINGS, 'always'),
    valid_from: str(b.valid_from), valid_until: str(b.valid_until), conditions: str(b.conditions),
  }));
  return { dropped: (raw.benefits ?? []).length - benefits.length, extraction: { new_stores, benefits } };
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: { users } } = await sb.auth.admin.listUsers();
const owner = users.filter((u) => !/e2e/i.test(u.email ?? ''));
if (owner.length !== 1) throw new Error(`expected exactly one real user, found ${owner.length}`);
const uid = owner[0].id;
const { data: programs } = await sb.from('programs').select('id,name,benefits_url').eq('user_id', uid);

for (const [key, programName] of Object.entries(files)) {
  const file = path.join(dir, `${key}.json`);
  if (!fs.existsSync(file)) { console.log(`${programName}: no file`); continue; }
  const program = programs.find((p) => p.name === programName);
  if (!program) { console.log(`${programName}: program not found`); continue; }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { dropped, extraction } = normalize(raw);
  if (extraction.benefits.length === 0) { console.log(`${programName}: 0 benefits, skipped`); continue; }
  const { error } = await sb.from('imports').insert({
    user_id: uid, program_id: program.id, source: 'chat', is_refresh: false, status: 'pending_review',
    raw_input: { url: raw.source_url ?? null, text: null, paths: null }, extracted: extraction,
  });
  if (error) { console.log(`${programName}: FAILED ${error.message}`); continue; }
  if (!program.benefits_url && raw.source_url) await sb.from('programs').update({ benefits_url: raw.source_url }).eq('id', program.id);
  console.log(`${programName}: ${extraction.benefits.length} benefits, ${extraction.new_stores.length} stores waiting for review${dropped ? ` (${dropped} malformed rows dropped)` : ''}`);
}
