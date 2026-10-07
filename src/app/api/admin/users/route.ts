import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/core/catalog';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** The signed-in user's id if they are an admin, otherwise null. */
async function currentAdmin(): Promise<string | null> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profile').select('is_admin').eq('user_id', user.id).maybeSingle();
  return data?.is_admin ? user.id : null;
}

async function adminIds(): Promise<string[]> {
  const { data } = await supabaseAdmin().from('profile').select('user_id').eq('is_admin', true);
  return (data ?? []).map((r) => r.user_id as string);
}

export async function GET() {
  if (!(await currentAdmin())) return json({ error: 'forbidden' }, 403);
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) return json({ error: 'failed' }, 500);
  const { data: profiles } = await sb.from('profile').select('user_id,is_admin');
  const byId = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const users = data.users
    .filter((u) => !/e2e/i.test(u.email ?? '')) // automated-test accounts stay out of the list
    .map((u) => ({
      id: u.id, email: u.email ?? '', last_sign_in_at: u.last_sign_in_at ?? null,
      onboarded: byId.has(u.id), is_admin: Boolean(byId.get(u.id)?.is_admin),
    }));
  return json({ users });
}

/** Invite: create the user as confirmed; they log in with Google or an e-mail code. */
export async function POST(req: Request) {
  if (!(await currentAdmin())) return json({ error: 'forbidden' }, 403);
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const clean = (email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return json({ error: 'invalid_email' }, 422);
  const { error } = await supabaseAdmin().auth.admin.createUser({ email: clean, email_confirm: true });
  if (error) return json({ error: error.code === 'email_exists' || /already/i.test(error.message) ? 'exists' : 'failed' }, 409);
  return json({ ok: true });
}

export async function PATCH(req: Request) {
  const actor = await currentAdmin();
  if (!actor) return json({ error: 'forbidden' }, 403);
  const { id, is_admin } = (await req.json().catch(() => ({}))) as { id?: string; is_admin?: boolean };
  if (!id || typeof is_admin !== 'boolean') return json({ error: 'failed' }, 422);
  if (!is_admin) {
    const refused = adminGuard('demote', actor, id, await adminIds());
    if (refused) return json({ error: refused }, 409);
  }
  const { data, error } = await supabaseAdmin().from('profile').update({ is_admin }).eq('user_id', id).select('user_id');
  if (error) return json({ error: 'failed' }, 500);
  if (!data?.length) return json({ error: 'not_onboarded' }, 409);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const actor = await currentAdmin();
  if (!actor) return json({ error: 'forbidden' }, 403);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'failed' }, 422);
  const refused = adminGuard('remove', actor, id, await adminIds());
  if (refused) return json({ error: refused }, 409);
  const { error } = await supabaseAdmin().auth.admin.deleteUser(id); // private rows are removed by cascade
  if (error) return json({ error: 'failed' }, 500);
  return json({ ok: true });
}
