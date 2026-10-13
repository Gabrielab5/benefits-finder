import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { israelToday, type IsraelDay } from '@/lib/core/dates';
import { bundle, pruneReminded, pushMessages, type PushMessage } from '@/lib/core/pushPlan';
import { activeDateBenefits } from '@/lib/core/specialDates';
import type { Profile } from '@/lib/core/types';
import { buildDateEmail } from '@/lib/email/birthdayEmail';
import { pushConfigured, sendToDevices, type PushSub } from '@/lib/push/send';
import { selectAll } from '@/lib/selectAll';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchSharedCatalog, fetchUserSnapshot, type Catalog } from '@/lib/userSnapshot';

export const maxDuration = 60;
const BUDGET_MS = 50_000; // stop starting new users here; whoever is left is picked up by tomorrow's run
const PARALLEL = 5;

type Sb = ReturnType<typeof supabaseAdmin>;
interface Run { sb: Sb; now: Date; today: IsraelDay; shared: Catalog; resend: Resend | null; stats: { emailed: number; pushed: number; saveErrors: number } }

const hasNew = (m: PushMessage) => m.kind === 'new' || Boolean(m.parts?.includes('new'));

async function save(run: Run, uid: string, patch: Partial<Profile>) {
  const { error } = await run.sb.from('profile').update(patch).eq('user_id', uid);
  if (!error) return;
  run.stats.saveErrors++;
  console.error('reminder bookkeeping not saved', uid, (error as { message?: string }).message);
}

/** E-mail (when Resend is set up) and push for one user. Bookkeeping only records what was actually sent. */
async function remindUser(run: Run, profile: Profile, devices: PushSub[]) {
  const { sb, today, now, resend } = run;
  const uid = profile.user_id;
  const snapshot = await fetchUserSnapshot(sb, profile, run.shared);
  let reminded = pruneReminded(profile.reminded ?? [], today.year);

  if (resend && profile.email_reminders) {
    const sections = activeDateBenefits(snapshot, today).filter((s) => !reminded.includes(`${s.window.key}:${today.year}`));
    const { data: { user } } = sections.length ? await sb.auth.admin.getUserById(uid) : { data: { user: null } };
    if (user?.email) {
      const email = buildDateEmail(sections, snapshot, process.env.APP_URL!);
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM ?? 'onboarding@resend.dev', to: user.email, subject: email.subject, html: email.html,
      });
      if (error) console.error('date reminder failed', error);
      else {
        // Recorded right away, so a later push problem can never make tomorrow's run e-mail it again.
        reminded = [...reminded, ...sections.map((s) => `${s.window.key}:${today.year}`)];
        await save(run, uid, { reminded });
        run.stats.emailed++;
      }
    }
  }

  const patch: Partial<Profile> = {};
  if (devices.length) {
    const { messages, newSince } = pushMessages({ ...snapshot, profile: { ...profile, reminded } }, today, now);
    let newDelivered = false;
    for (const m of bundle(messages)) {
      if (!(await sendToDevices(sb, devices, m))) continue;
      run.stats.pushed++;
      reminded = [...reminded, ...m.remindKeys];
      if (hasNew(m)) newDelivered = true;
    }
    // Only move the "new benefits" watermark past benefits the user was actually told about.
    if (newSince && (newDelivered || !messages.some(hasNew))) patch.push_new_since = newSince;
  }
  if (reminded.join() !== (profile.reminded ?? []).join()) patch.reminded = reminded;
  if (Object.keys(patch).length) await save(run, uid, patch);
}

/** Daily: special-date e-mails and push alerts (dates, expiring on Sundays, gift cards about to expire, new benefits). */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  const now = new Date();
  const sb = supabaseAdmin();
  let profiles: Profile[];
  try {
    profiles = await selectAll<Profile>((a, b) => sb.from('profile').select('*').order('user_id').range(a, b));
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string }).message ?? 'profile read failed' }, { status: 500 });
  }

  const devicesOf = new Map<string, PushSub[]>();
  if (pushConfigured()) {
    try {
      const subs = await selectAll<PushSub>((a, b) => sb.from('push_subscriptions').select('*').order('id').range(a, b));
      for (const s of subs) devicesOf.set(s.user_id, [...(devicesOf.get(s.user_id) ?? []), s]);
    } catch (e) {
      console.error('push skipped: cannot read subscriptions', (e as { message?: string }).message); // e-mail still goes out
    }
  }
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const todo = profiles.filter((p) => devicesOf.has(p.user_id) || (resend && p.email_reminders));
  const run: Run = { sb, now, today: israelToday(now), shared: await fetchSharedCatalog(sb), resend, stats: { emailed: 0, pushed: 0, saveErrors: 0 } };

  let next = 0;
  let skipped = 0;
  const worker = async () => {
    while (next < todo.length) {
      if (Date.now() - started > BUDGET_MS) {
        skipped = todo.length - next;
        next = todo.length;
        return;
      }
      const profile = todo[next++];
      try {
        await remindUser(run, profile, devicesOf.get(profile.user_id) ?? []);
      } catch (e) {
        console.error('reminders failed for one user', profile.user_id, e);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return NextResponse.json({ ...run.stats, skipped });
}
