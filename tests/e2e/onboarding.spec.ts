import { expect, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const EMAIL = 'e2e-onboard@example.com';
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function deleteUser() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === EMAIL);
  if (user) await admin.auth.admin.deleteUser(user.id);
}

test('a new user ticks a card in onboarding and immediately sees its shared benefit', async ({ page, context }) => {
  const created: { table: string; id: string }[] = [];
  const add = async (table: string, row: object) => {
    const { data, error } = await admin.from(table).insert(row).select('id').single();
    if (error) throw error;
    created.push({ table, id: data.id });
    return data.id as string;
  };
  await deleteUser();
  try {
    // Shared test fixtures, removed again at the end.
    const programId = await add('programs', { user_id: null, name: 'תוכנית בדיקה E2E', kind: 'card_issuer' });
    const storeId = await add('stores', { user_id: null, name_he: 'חנות בדיקה', name_en: 'E2E Test Store', category: 'other' });
    await add('benefits', {
      user_id: null, program_id: programId, store_id: storeId, title: '20% הנחת בדיקה', type: 'percent_off', value: 20,
      requires: 'pay_with_card', timing: 'always',
    });
    await add('card_products', { user_id: null, name: 'כרטיס בדיקה E2E', type: 'card', program_ids: [programId] });

    await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
    if (error) throw error;
    const jar = new Map<string, string>();
    const sb = createServerClient(URL, KEY, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    });
    await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' })));

    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    // Cards first, then the birth month (the only required question).
    await page.getByLabel('כרטיס בדיקה E2E').check();
    await page.getByRole('button', { name: 'המשך' }).click();
    await page.getByLabel('חודש יום ההולדת', { exact: true }).selectOption('5');
    await page.getByRole('button', { name: 'סיום' }).click();

    await page.getByPlaceholder('איפה אתם קונים?').fill('E2E Test Store');
    await page.getByRole('button', { name: /חנות בדיקה/ }).click();
    await page.getByLabel('כמה אתם מוציאים? (₪)').fill('100');
    const first = page.getByTestId('pay-results').getByRole('listitem').first();
    await expect(first).toContainText('כרטיס בדיקה E2E');
    await expect(first).toContainText('₪20');
  } finally {
    for (const { table, id } of created.reverse()) await admin.from(table).delete().eq('id', id);
    await deleteUser();
  }
});
