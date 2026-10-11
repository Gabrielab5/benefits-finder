import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type TestUser = { sb: SupabaseClient; id: string };

async function signIn(email: string): Promise<TestUser> {
  if (!/e2e/i.test(email)) throw new Error('test users must contain "e2e"');
  await admin.auth.admin.createUser({ email, email_confirm: true }); // fails harmlessly if it exists
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: e2 } = await sb.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' });
  if (e2) throw e2;
  return { sb, id: session.user!.id };
}

let a: TestUser;
let b: TestUser;
let sharedId: string;

beforeAll(async () => {
  a = await signIn('e2e-rls-a@example.com');
  b = await signIn('e2e-rls-b@example.com');
  for (const u of [a, b]) {
    await admin.from('programs').delete().eq('user_id', u.id);
    await admin.from('wallet_items').delete().eq('user_id', u.id);
    await admin.from('profile').upsert({ user_id: u.id, birth_month: 1, is_admin: false });
  }
  const { data, error } = await admin.from('programs').insert({ user_id: null, name: 'RLS shared', kind: 'club' }).select('id').single();
  if (error) throw error;
  sharedId = data.id;
});

afterAll(async () => {
  if (sharedId) await admin.from('programs').delete().eq('id', sharedId);
  for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
});

const names = async (u: TestUser) =>
  ((await u.sb.from('programs').select('name').like('name', 'RLS%')).data ?? []).map((r) => r.name as string).sort();

describe('row level security', () => {
  it('a user reads shared rows and only their own private rows', async () => {
    const { error } = await a.sb.from('programs').insert({ name: 'RLS-A private', kind: 'club' });
    expect(error).toBeNull();
    expect(await names(a)).toEqual(['RLS shared', 'RLS-A private']);
    expect(await names(b)).toEqual(['RLS shared']);
  });

  it('a normal user cannot create, change or delete shared rows', async () => {
    const insert = await a.sb.from('programs').insert({ user_id: null, name: 'RLS hack', kind: 'club' });
    expect(insert.error).not.toBeNull();
    await a.sb.from('programs').update({ name: 'RLS changed' }).eq('id', sharedId);
    await a.sb.from('programs').delete().eq('id', sharedId);
    const { data } = await admin.from('programs').select('name').eq('id', sharedId).single();
    expect(data?.name).toBe('RLS shared');
  });

  it('a user cannot make themselves admin', async () => {
    const { error } = await a.sb.from('profile').update({ is_admin: true }).eq('user_id', a.id);
    expect(error).not.toBeNull();
    const { data } = await admin.from('profile').select('is_admin').eq('user_id', a.id).single();
    expect(data?.is_admin).toBe(false);
  });

  it("a user cannot see another user's wallet", async () => {
    await b.sb.from('wallet_items').insert({ name: 'RLS-B card', type: 'card' });
    const { data } = await a.sb.from('wallet_items').select('name');
    expect((data ?? []).map((r) => r.name)).not.toContain('RLS-B card');
  });

  it('an admin can change shared rows', async () => {
    await admin.from('profile').update({ is_admin: true }).eq('user_id', a.id);
    const { error } = await a.sb.from('programs').update({ name: 'RLS shared 2' }).eq('id', sharedId);
    expect(error).toBeNull();
    const { data } = await admin.from('programs').select('name').eq('id', sharedId).single();
    expect(data?.name).toBe('RLS shared 2');
    await admin.from('profile').update({ is_admin: false }).eq('user_id', a.id);
  });

  it('push subscriptions are private to their owner', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-push-a';
    expect((await a.sb.from('push_subscriptions').insert({ endpoint, p256dh: 'k', auth: 's' })).error).toBeNull();
    expect((await b.sb.from('push_subscriptions').select('endpoint')).data).toEqual([]);
    await b.sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    expect((await a.sb.from('push_subscriptions').select('endpoint')).data).toEqual([{ endpoint }]);
    const forged = await b.sb.from('push_subscriptions').insert({ user_id: a.id, endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-push-b', p256dh: 'k', auth: 's' });
    expect(forged.error).not.toBeNull();
  });

  it('keeps at most 10 devices per user, dropping the oldest', async () => {
    for (let i = 0; i < 11; i++) {
      const { error } = await b.sb.from('push_subscriptions').insert({ endpoint: `https://fcm.googleapis.com/fcm/send/e2e-cap-${i}`, p256dh: 'k', auth: 's' });
      expect(error).toBeNull();
    }
    const { data } = await b.sb.from('push_subscriptions').select('endpoint');
    expect(data).toHaveLength(10);
    expect(data!.map((r) => r.endpoint)).not.toContain('https://fcm.googleapis.com/fcm/send/e2e-cap-0');
  });

  it('only accepts real push-service endpoints (the server posts to them)', async () => {
    const evil = await a.sb.from('push_subscriptions').insert({ endpoint: 'https://169.254.169.254/latest', p256dh: 'k', auth: 's' });
    expect(evil.error).not.toBeNull();
  });
});
