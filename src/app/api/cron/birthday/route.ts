import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { israelToday } from '@/lib/core/dates';
import { activeDateBenefits } from '@/lib/core/specialDates';
import type { Benefit, Profile, Program, Store, WalletItem } from '@/lib/core/types';
import { buildDateEmail } from '@/lib/email/birthdayEmail';
import { selectAll } from '@/lib/selectAll';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Daily: e-mail each user once a year per special date (birthday, club birthday, anniversary, each child). */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const today = israelToday();
  const sb = supabaseAdmin();
  const { data: profiles, error } = await sb.from('profile').select('*').eq('email_reminders', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  for (const profile of (profiles ?? []) as Profile[]) {
    const uid = profile.user_id;
    const visible = `user_id.is.null,user_id.eq.${uid}`; // shared catalog + this user's private rows
    const [programs, wallet, stores, benefits] = await Promise.all([
      selectAll<Program>((a, b) => sb.from('programs').select('*').or(visible).order('id').range(a, b)),
      selectAll<WalletItem>((a, b) => sb.from('wallet_items').select('*').eq('user_id', uid).order('id').range(a, b)),
      selectAll<Store>((a, b) => sb.from('stores').select('*').or(visible).order('id').range(a, b)),
      selectAll<Benefit>((a, b) => sb.from('benefits').select('*').or(visible).eq('status', 'active').order('id').range(a, b)),
    ]);
    const reminded = profile.reminded ?? [];
    const sections = activeDateBenefits({ profile, programs, wallet, stores, benefits, fetchedAt: '' }, today)
      .filter((s) => !reminded.includes(`${s.window.key}:${today.year}`));
    if (sections.length === 0) continue; // nothing new; maybe benefits get imported later this month

    const { data: { user } } = await sb.auth.admin.getUserById(uid);
    if (!user?.email) continue;
    const email = buildDateEmail(sections, { programs, stores }, process.env.APP_URL!);
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
      to: user.email,
      subject: email.subject,
      html: email.html,
    });
    if (sendError) {
      console.error('date reminder failed', sendError);
      continue;
    }
    await sb.from('profile').update({ reminded: [...reminded, ...sections.map((s) => `${s.window.key}:${today.year}`)] }).eq('user_id', uid);
    sent++;
  }
  return NextResponse.json({ sent });
}
