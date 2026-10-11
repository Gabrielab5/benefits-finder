import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { israelToday } from '@/lib/core/dates';
import { pushMessages } from '@/lib/core/pushPlan';
import { activeDateBenefits } from '@/lib/core/specialDates';
import type { Profile } from '@/lib/core/types';
import { buildDateEmail } from '@/lib/email/birthdayEmail';
import { pushConfigured, sendToDevices, type PushSub } from '@/lib/push/send';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchUserSnapshot } from '@/lib/userSnapshot';

/** Daily: special-date e-mails (when Resend is set up) and push alerts (dates, expiring on Sundays, new benefits). */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const now = new Date();
  const today = israelToday(now);
  const sb = supabaseAdmin();
  const [{ data: profiles, error }, { data: subs, error: subsError }] = await Promise.all([
    sb.from('profile').select('*'),
    sb.from('push_subscriptions').select('*'),
  ]);
  if (error || subsError) return NextResponse.json({ error: (error ?? subsError)!.message }, { status: 500 });

  const devicesOf = new Map<string, PushSub[]>();
  if (pushConfigured()) for (const s of (subs ?? []) as PushSub[]) devicesOf.set(s.user_id, [...(devicesOf.get(s.user_id) ?? []), s]);
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  let emailed = 0;
  let pushed = 0;

  for (const profile of (profiles ?? []) as Profile[]) {
    const uid = profile.user_id;
    const devices = devicesOf.get(uid) ?? [];
    const wantsEmail = Boolean(resend && profile.email_reminders);
    if (!devices.length && !wantsEmail) continue;
    try {
      const snapshot = await fetchUserSnapshot(sb, profile);
      const before = profile.reminded ?? [];
      let reminded = before;
      const patch: Partial<Profile> = {};

      if (wantsEmail) {
        const sections = activeDateBenefits(snapshot, today).filter((s) => !reminded.includes(`${s.window.key}:${today.year}`));
        const { data: { user } } = sections.length ? await sb.auth.admin.getUserById(uid) : { data: { user: null } };
        if (user?.email) {
          const email = buildDateEmail(sections, snapshot, process.env.APP_URL!);
          const { error: sendError } = await resend!.emails.send({
            from: process.env.RESEND_FROM ?? 'onboarding@resend.dev', to: user.email, subject: email.subject, html: email.html,
          });
          if (sendError) console.error('date reminder failed', sendError);
          else {
            reminded = [...reminded, ...sections.map((s) => `${s.window.key}:${today.year}`)];
            emailed++;
          }
        }
      }

      if (devices.length) {
        const { messages, newSince } = pushMessages(snapshot, today, now);
        let newDelivered = false;
        for (const m of messages) {
          if (!(await sendToDevices(sb, devices, m))) continue;
          pushed++;
          reminded = [...reminded, ...m.remindKeys];
          if (m.kind === 'new') newDelivered = true;
        }
        // Only move the "new benefits" watermark past benefits the user was actually told about.
        if (newSince && (newDelivered || !messages.some((m) => m.kind === 'new'))) patch.push_new_since = newSince;
      }

      if (reminded !== before) patch.reminded = reminded;
      if (Object.keys(patch).length) await sb.from('profile').update(patch).eq('user_id', uid);
    } catch (e) {
      console.error('reminders failed for one user', e);
    }
  }
  return NextResponse.json({ emailed, pushed });
}
