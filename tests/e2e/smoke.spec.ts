import { expect, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { israelToday } from '../../src/lib/core/dates';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const EMAIL = process.env.E2E_EMAIL!;

async function check<T>(op: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await op;
  if (error) throw error;
  return data as T;
}

/** Signs the test user in without sending email and returns the auth cookies @supabase/ssr would set. */
async function signIn() {
  // seed() deletes all of this user's data, so never let it point at a real account.
  if (!/e2e/i.test(EMAIL ?? '')) throw new Error('E2E_EMAIL must contain "e2e" (the test wipes that user\'s data)');
  const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true }); // fails harmlessly if it exists
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (error) throw error;

  const jar = new Map<string, string>();
  const sb = createServerClient(URL, KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  await check(sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' }));
  const cookies = [...jar].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' }));
  return { sb: sb as unknown as SupabaseClient, cookies };
}

async function seed(sb: SupabaseClient) {
  const { data: { user } } = await sb.auth.getUser();
  const uid = user!.id;
  for (const table of ['benefits', 'imports', 'wallet_items', 'stores', 'programs', 'profile']) {
    await check(sb.from(table).delete().eq('user_id', uid));
  }
  const notThisMonth = (israelToday().month % 12) + 1;
  await check(sb.from('profile').insert({ user_id: uid, birth_month: notThisMonth }));
  const programs = (await check(
    sb.from('programs').insert([{ name: 'כאל', kind: 'card_issuer' }, { name: 'חבר', kind: 'club' }]).select('id,name'),
  )) as { id: string; name: string }[];
  const pid = (name: string) => programs.find((p) => p.name === name)!.id;
  await check(sb.from('wallet_items').insert([
    { name: 'כרטיס בדיקה א', type: 'card', program_ids: [pid('כאל')] },
    { name: 'כרטיס בדיקה ב', type: 'card', program_ids: [pid('חבר')] },
  ]));
  const store = (await check(
    sb.from('stores').insert({ name_he: 'מנגו בדיקה', name_en: 'Mango E2E', category: 'fashion' }).select('id').single(),
  )) as { id: string };
  await check(sb.from('benefits').insert([
    { program_id: pid('כאל'), store_id: store.id, title: '10% הנחה', type: 'percent_off', value: 10, requires: 'pay_with_card' },
    { program_id: pid('חבר'), store_id: store.id, title: '₪50 הנחה מעל ₪100', type: 'fixed_off', value: 50, min_spend: 100, requires: 'pay_with_card' },
  ]));
}

test('search a store in English and see the best card first', async ({ page, context }) => {
  const { sb, cookies } = await signIn();
  await seed(sb);
  await context.addCookies(cookies);

  await page.goto('/');
  await page.getByPlaceholder('איפה אתם קונים?').fill('mango e2e');
  await page.getByRole('button', { name: /מנגו בדיקה/ }).click();
  await page.getByLabel('כמה אתם מוציאים? (₪)').fill('400');

  const answer = page.getByTestId('answer'); // the winner, hoisted above the other options
  await expect(answer).toContainText('הכי משתלם');
  await expect(answer).toContainText('כרטיס בדיקה ב'); // ₪50 beats 10% of ₪400 = ₪40
  await expect(answer).toContainText('₪50');
  await expect(page.getByTestId('pay-results').getByRole('listitem').first()).toContainText('₪40');

  // Store and amount survive a tab switch (and sit in the URL as a shareable link).
  await expect(page).toHaveURL(/store=.+&amount=400/);
  await page.getByRole('link', { name: 'הטבות', exact: true }).click();
  await expect(page).toHaveURL(/\/benefits/);
  await page.getByRole('link', { name: 'איפה אני' }).click();
  await expect(page.getByTestId('answer')).toContainText('₪50');
});
