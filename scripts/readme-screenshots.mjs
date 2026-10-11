// Takes the README screenshots (docs/screenshots/*.png) from the live app, using a throwaway demo user
// that gets a few real catalog cards. The user is deleted at the end.
// Usage: node scripts/readme-screenshots.mjs [baseUrl]
import nextEnv from '@next/env';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

nextEnv.loadEnvConfig(process.cwd());
const BASE = process.argv[2] ?? 'https://benefits-finder-swart.vercel.app';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const EMAIL = 'e2e-readme-demo@example.com';
const CARDS = ['מקס', 'דרים קארד – כרטיס אשראי', 'שופרסל – כרטיס אשראי', 'רי-בר', 'מועדון דרים קארד', 'ביחד בשבילך'];
const OUT = 'docs/screenshots';
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

async function deleteUser() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === EMAIL);
  if (user) await admin.auth.admin.deleteUser(user.id);
}

await deleteUser();
const { data: created, error } = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
if (error) throw error;
const uid = created.user.id;
const browser = await chromium.launch();
try {
  const month = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jerusalem', month: 'numeric' }).format(new Date()));
  await admin.from('profile').insert({ user_id: uid, birth_month: month });
  const { data: products } = await admin.from('card_products').select('*').is('user_id', null).in('name', CARDS);
  await admin.from('wallet_items').insert(products.map((p) => ({
    user_id: uid, name: p.name, type: p.type, program_ids: p.program_ids, product_id: p.id,
  })));

  // The store where this wallet has the most benefits makes the best "which card?" shot.
  const programIds = products.flatMap((p) => p.program_ids);
  const { data: benefits } = await admin.from('benefits').select('store_id').is('user_id', null)
    .eq('status', 'active').in('program_id', programIds).not('store_id', 'is', null);
  const counts = {};
  for (const b of benefits) counts[b.store_id] = (counts[b.store_id] ?? 0) + 1;
  const topStore = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const { data: store } = await admin.from('stores').select('name_he,name_en').eq('id', topStore).single();

  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const jar = new Map();
  const sb = createServerClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) },
  });
  await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });

  const shot = async (page, name) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${name}.png` }); };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await shot(page, 'login');

  const host = new globalThis.URL(BASE).hostname;
  await ctx.addCookies([...jar].map(([name, value]) => ({ name, value, domain: host, path: '/', secure: true })));
  await page.goto(BASE);
  await page.getByPlaceholder('איפה אתם קונים?').waitFor({ timeout: 30_000 });
  await shot(page, 'home');

  await page.getByPlaceholder('איפה אתם קונים?').fill(store.name_en);
  await page.getByRole('button', { name: new RegExp(store.name_he) }).first().click();
  await page.getByLabel('כמה אתם מוציאים? (₪)').fill('300');
  await shot(page, 'store');

  for (const [path, name] of [['/benefits', 'benefits'], ['/wallet', 'wallet'], ['/import', 'import']]) {
    await page.goto(BASE + path);
    await page.waitForLoadState('networkidle');
    await shot(page, name);
  }
  console.log(`done — store shot: ${store.name_he}`);
} finally {
  await browser.close();
  await deleteUser(); // cascades the demo user's profile and wallet
}
