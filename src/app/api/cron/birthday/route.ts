import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { israelToday, monthNameHe } from '@/lib/core/dates';
import { birthdayBenefits } from '@/lib/core/rank';
import type { Benefit, Profile, Program, Store, WalletItem } from '@/lib/core/types';
import { buildBirthdayEmail } from '@/lib/email/birthdayEmail';
import { selectAll } from '@/lib/selectAll';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const today = israelToday();
  const sb = supabaseAdmin();
  const { data: profiles, error } = await sb.from('profile').select('*')
    .eq('birth_month', today.month).eq('email_reminders', true)
    .or(`last_reminder_year.is.null,last_reminder_year.lt.${today.year}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  for (const profile of (profiles ?? []) as Profile[]) {
    const uid = profile.user_id;
    const [programs, wallet, stores, benefits] = await Promise.all([
      selectAll<Program>((a, b) => sb.from('programs').select('*').eq('user_id', uid).order('id').range(a, b)),
      selectAll<WalletItem>((a, b) => sb.from('wallet_items').select('*').eq('user_id', uid).order('id').range(a, b)),
      selectAll<Store>((a, b) => sb.from('stores').select('*').eq('user_id', uid).order('id').range(a, b)),
      selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('user_id', uid).eq('status', 'active').order('id').range(a, b)),
    ]);
    const list = birthdayBenefits({ profile, programs, wallet, stores, benefits, fetchedAt: '' }, today);
    if (list.length === 0) continue; // try again tomorrow; maybe benefits get imported later this month

    const { data: { user } } = await sb.auth.admin.getUserById(uid);
    if (!user?.email) continue;
    const email = buildBirthdayEmail(list, { programs, stores }, process.env.APP_URL!, monthNameHe(today.month));
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
      to: user.email,
      subject: email.subject,
      html: email.html,
    });
    if (sendError) {
      console.error('birthday email failed', sendError);
      continue;
    }
    await sb.from('profile').update({ last_reminder_year: today.year }).eq('user_id', uid);
    sent++;
  }
  return NextResponse.json({ sent });
}
