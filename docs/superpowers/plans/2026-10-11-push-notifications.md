# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free web-push reminders for special-date windows, benefits expiring this week, and new shared benefits for the user's cards.

**Architecture:** Browsers subscribe via the service worker; subscriptions live in `push_subscriptions` (RLS, own rows).
The existing daily cron builds each user's snapshot, asks the pure `pushMessages()` what to send, and sends with
`web-push` (VAPID). Settings UI in the Sources tab; deep links open the matching benefits filter.

**Tech Stack:** Next.js 16 (route handlers, `proxy.ts`), Supabase Postgres + RLS, `web-push`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-push-notifications-design.md`

## Global Constraints

- No paid services; VAPID keys only in `.env.local` and Vercel env (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), never printed.
- All copy in Hebrew, RTL. Dates evaluated in Asia/Jerusalem.
- Push bookkeeping keys: `push:<window key>:<year>` in `profile.reminded` (email keeps `<key>:<year>`).
- One failing user or device never stops the cron run.
- Test users must contain "e2e".

## Review Focus

1. Shared device: user A enabled push, logs out, user B signs in on the same browser → B must not receive A's alerts and B's enable must not fail on the existing endpoint (Task 5: logout unsubscribes; enable always re-subscribes fresh).
2. User turns "new benefits" off for weeks then on → must not get a "120 new benefits" flood (Task 2: watermark advances while off).
3. A push service answers 410 for a dead phone → the row is deleted and the other devices still get the message (Task 3).
4. iPhone Safari tab (not installed) → clear "add to Home Screen" hint, never a broken button (Task 5).
5. `created_at` strings from Postgres (`+00:00`, microseconds) vs `toISOString()` → compared as dates, not text (Task 2 test).

---

### Task 1: Database: subscriptions table and profile switches

**Files:**
- Create: `supabase/migrations/20261011000000_push.sql`
- Modify: `src/lib/core/types.ts` (Profile)
- Test: `tests/db/rls.test.ts`

**Interfaces:**
- Produces: table `push_subscriptions(id, user_id, endpoint unique, p256dh, auth, created_at)`; `Profile.push_dates?`, `push_expiring?`, `push_new?: boolean`, `push_new_since?: string | null`.

- [ ] **Step 1: Write the migration**

<!-- file: supabase/migrations/20261011000000_push.sql -->
```sql
-- Web push: one row per subscribed device, plus per-user switches for each alert kind.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "read own" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add own" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "remove own" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.profile
  add column push_dates boolean not null default true,
  add column push_expiring boolean not null default true,
  add column push_new boolean not null default true,
  add column push_new_since timestamptz;
grant insert (push_dates, push_expiring, push_new, push_new_since) on public.profile to authenticated;
grant update (push_dates, push_expiring, push_new, push_new_since) on public.profile to authenticated;
```

- [ ] **Step 2: Add the fields to `Profile`**

<!-- patch -->
```python
p='src/lib/core/types.ts';s=open(p,encoding='utf-8').read()
old="  reminded?: string[]; // \"<window key>:<year>\" already e-mailed\n"
assert old in s
s=s.replace(old, old+"  push_dates?: boolean;\n  push_expiring?: boolean;\n  push_new?: boolean;\n  push_new_since?: string | null; // \"new benefits\" counts shared benefits created after this\n")
open(p,'w',encoding='utf-8',newline='\n').write(s)
```

- [ ] **Step 3: Add the RLS test**

<!-- patch -->
```python
p='tests/db/rls.test.ts';s=open(p,encoding='utf-8').read()
i=s.rindex('});')
s=s[:i]+'''
  it('push subscriptions are private to their owner', async () => {
    const endpoint = 'https://e2e.example/push-a';
    expect((await a.sb.from('push_subscriptions').insert({ endpoint, p256dh: 'k', auth: 's' })).error).toBeNull();
    expect((await b.sb.from('push_subscriptions').select('endpoint')).data).toEqual([]);
    await b.sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    expect((await a.sb.from('push_subscriptions').select('endpoint')).data).toEqual([{ endpoint }]);
    const forged = await b.sb.from('push_subscriptions').insert({ user_id: a.id, endpoint: 'https://e2e.example/push-b', p256dh: 'k', auth: 's' });
    expect(forged.error).not.toBeNull();
  });
'''+s[i:]
open(p,'w',encoding='utf-8',newline='\n').write(s)
```

- [ ] **Step 4: Owner runs the migration in the Supabase SQL editor**, then run `npm run test:db`. Expected: all pass (6 tests).

- [ ] **Step 5: Commit** `git add supabase/migrations/20261011000000_push.sql src/lib/core/types.ts tests/db/rls.test.ts && git commit -m "feat(push): subscriptions table and profile switches"`

---

### Task 2: Pure "what to send today" logic

**Files:**
- Create: `src/lib/core/pushPlan.ts`
- Test: `src/lib/core/pushPlan.test.ts`

**Interfaces:**
- Consumes: `activeDateBenefits(snapshot, today)` (specialDates), `eligibleItems(b, wallet)` (rank), `addDays(iso, n)`, `IsraelDay` (dates), `WINDOW_ICON` (labels).
- Produces: `interface PushMessage { kind: 'dates'|'expiring'|'new'; title: string; body: string; url: string; tag: string; remindKeys: string[] }`, `israelWeekday(now: Date): number` (0 = Sunday), `pushKey(windowKey: string, year: number): string`, `pushMessages(s: Snapshot, today: IsraelDay, now: Date): { messages: PushMessage[]; newSince: string | null }`.

- [ ] **Step 1: Write the failing tests**

<!-- file: src/lib/core/pushPlan.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { israelToday } from './dates';
import { israelWeekday, pushMessages } from './pushPlan';
import type { Benefit, Profile, Snapshot, WalletItem } from './types';

const SUNDAY = new Date('2026-10-11T06:00:00Z');
const MONDAY = new Date('2026-10-12T06:00:00Z');
const wallet: WalletItem[] = [{ id: 'w', name: 'כאל', type: 'card', last4: null, nickname: null, color: null, program_ids: ['cal'], created_at: '', birthday_month: null }];
const benefit = (id: string, o: Partial<Benefit> = {}): Benefit => ({
  id, program_id: 'cal', store_id: null, category: null, title: id, description: null, type: 'percent_off', value: 10,
  min_spend: null, max_discount: null, requires: 'pay_with_card', coupon_code: null, channel: 'both', timing: 'always',
  valid_from: null, valid_until: null, conditions: null, source_url: null, last_verified_at: '', status: 'active',
  created_at: '2026-09-01T00:00:00+00:00', user_id: null, ...o,
});
const profile = (o: Partial<Profile> = {}): Profile => ({
  user_id: 'u', birth_month: 3, email_reminders: false, last_reminder_year: null, reminded: [],
  push_new_since: '2026-10-05T00:00:00.000Z', ...o,
});
const snap = (p: Profile, benefits: Benefit[]): Snapshot => ({ profile: p, programs: [], stores: [], wallet, benefits, fetchedAt: '' });
const run = (p: Profile, benefits: Benefit[], now = SUNDAY) => pushMessages(snap(p, benefits), israelToday(now), now);
const kinds = (r: ReturnType<typeof run>) => r.messages.map((m) => m.kind);

describe('israelWeekday', () => {
  it('uses Israel time (Saturday 22:30 UTC is already Sunday in Israel)', () => {
    expect(israelWeekday(new Date('2026-10-10T22:30:00Z'))).toBe(0);
    expect(israelWeekday(MONDAY)).toBe(1);
  });
});

describe('dates alerts', () => {
  const bday = benefit('bday', { timing: 'birthday_month' });
  it('alerts once per window per year', () => {
    const r = run(profile({ birth_month: 10 }), [bday]);
    expect(r.messages[0]).toMatchObject({ kind: 'dates', url: '/benefits?birthday=1', remindKeys: ['push:birthday:2026'] });
    expect(kinds(run(profile({ birth_month: 10, reminded: ['push:birthday:2026'] }), [bday]))).toEqual([]);
  });
  it('is not blocked by the e-mail bookkeeping key', () => {
    expect(kinds(run(profile({ birth_month: 10, reminded: ['birthday:2026'] }), [bday]))).toEqual(['dates']);
  });
  it('respects the switch', () => {
    expect(kinds(run(profile({ birth_month: 10, push_dates: false }), [bday]))).toEqual([]);
  });
});

describe('expiring alerts', () => {
  const soon = benefit('soon', { valid_until: '2026-10-15' });
  it('lists my benefits ending within 7 days, on Sundays only', () => {
    const r = run(profile(), [soon, benefit('later', { valid_until: '2026-10-30' }), benefit('gone', { valid_until: '2026-10-10' }),
      benefit('notMine', { program_id: 'max', valid_until: '2026-10-14' })]);
    expect(r.messages).toEqual([expect.objectContaining({ kind: 'expiring', body: 'soon', url: '/benefits?expiring=1' })]);
    expect(kinds(run(profile(), [soon], MONDAY))).toEqual([]);
  });
  it('includes the last day of the week and respects the switch', () => {
    expect(kinds(run(profile(), [benefit('edge', { valid_until: '2026-10-18' })]))).toEqual(['expiring']);
    expect(kinds(run(profile({ push_expiring: false }), [soon]))).toEqual([]);
  });
});

describe('new benefit alerts', () => {
  const fresh = benefit('fresh', { created_at: '2026-10-08T10:00:00.123456+00:00' });
  it('counts shared benefits for my cards created after the watermark and moves it', () => {
    const r = run(profile(), [fresh, benefit('old'), benefit('private', { user_id: 'u', created_at: '2026-10-08T10:00:00+00:00' }),
      benefit('notMine', { program_id: 'max', created_at: '2026-10-08T10:00:00+00:00' })], MONDAY);
    expect(r.messages).toEqual([expect.objectContaining({ kind: 'new', title: '✨ הטבה חדשה לכרטיסים שלך', url: '/benefits?recent=1' })]);
    expect(r.newSince).toBe(MONDAY.toISOString());
  });
  it('without a watermark only sets one (no flood of the whole catalog)', () => {
    const r = run(profile({ push_new_since: null }), [fresh], MONDAY);
    expect(kinds(r)).toEqual([]);
    expect(r.newSince).toBe(MONDAY.toISOString());
  });
  it('while switched off keeps moving the watermark so turning it on later does not flood', () => {
    const r = run(profile({ push_new: false }), [fresh], MONDAY);
    expect(kinds(r)).toEqual([]);
    expect(r.newSince).toBe(MONDAY.toISOString());
  });
  it('leaves the watermark alone when nothing is new', () => {
    expect(run(profile(), [benefit('old')], MONDAY)).toEqual({ messages: [], newSince: null });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/core/pushPlan.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

<!-- file: src/lib/core/pushPlan.ts -->
```ts
import { addDays, type IsraelDay } from './dates';
import { WINDOW_ICON } from './labels';
import { eligibleItems } from './rank';
import { activeDateBenefits } from './specialDates';
import type { Benefit, Snapshot } from './types';

export interface PushMessage {
  kind: 'dates' | 'expiring' | 'new';
  title: string;
  body: string;
  url: string; // opened when the notification is tapped
  tag: string; // a newer notification with the same tag replaces the older one
  remindKeys: string[]; // added to profile.reminded once delivered
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 0 = Sunday, in Israel time. */
export function israelWeekday(now: Date): number {
  return WEEKDAYS.indexOf(now.toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }));
}

export const pushKey = (windowKey: string, year: number) => `push:${windowKey}:${year}`;

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
const titles = (list: Benefit[]) => list.slice(0, 3).map((b) => b.title).join(' · ') + (list.length > 3 ? ' …' : '');

/** What one user should get today. `newSince` is the new "new benefits" watermark, or null to keep it. */
export function pushMessages(s: Snapshot, today: IsraelDay, now: Date): { messages: PushMessage[]; newSince: string | null } {
  const p = s.profile;
  const messages: PushMessage[] = [];
  if (!p) return { messages, newSince: null };
  const mine = (b: Benefit) => b.status === 'active' && eligibleItems(b, s.wallet).length > 0;

  if (p.push_dates !== false) {
    for (const { window, benefits } of activeDateBenefits(s, today)) {
      const key = pushKey(window.key, today.year);
      if ((p.reminded ?? []).includes(key)) continue;
      messages.push({
        kind: 'dates', title: `${WINDOW_ICON[window.kind]} ${window.label}`,
        body: `${count(benefits.length, 'הטבה אחת פעילה', 'הטבות פעילות')} החודש — כדאי לנצל!`,
        url: '/benefits?birthday=1', tag: `dates:${window.key}`, remindKeys: [key],
      });
    }
  }

  if (p.push_expiring !== false && israelWeekday(now) === 0) {
    const weekEnd = addDays(today.iso, 7);
    const ending = s.benefits
      .filter((b) => mine(b) && b.valid_until && b.valid_until >= today.iso && b.valid_until <= weekEnd)
      .sort((a, b) => a.valid_until!.localeCompare(b.valid_until!));
    if (ending.length) {
      messages.push({
        kind: 'expiring', title: `⏳ ${count(ending.length, 'הטבה אחת מסתיימת', 'הטבות מסתיימות')} השבוע`,
        body: titles(ending), url: '/benefits?expiring=1', tag: 'expiring', remindKeys: [],
      });
    }
  }

  // The watermark keeps moving while the switch is off, so switching it back on doesn't announce the backlog.
  if (p.push_new === false || !p.push_new_since) return { messages, newSince: now.toISOString() };
  const since = new Date(p.push_new_since).getTime();
  const fresh = s.benefits.filter((b) => b.user_id == null && mine(b) && new Date(b.created_at).getTime() > since);
  if (!fresh.length) return { messages, newSince: null };
  messages.push({
    kind: 'new', title: `✨ ${count(fresh.length, 'הטבה חדשה', 'הטבות חדשות')} לכרטיסים שלך`,
    body: titles(fresh), url: '/benefits?recent=1', tag: 'new', remindKeys: [],
  });
  return { messages, newSince: now.toISOString() };
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/core/pushPlan.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `git add src/lib/core/pushPlan.ts src/lib/core/pushPlan.test.ts && git commit -m "feat(push): decide which alerts each user gets today"`

---

### Task 3: Sending: web-push, shared snapshot loader, cron, test endpoint

**Files:**
- Create: `src/lib/push/send.ts`, `src/lib/userSnapshot.ts`, `src/app/api/push/test/route.ts`
- Modify: `src/app/api/cron/birthday/route.ts` (rewrite), `package.json` (`web-push`, `@types/web-push`), `.env.example`

**Interfaces:**
- Consumes: `pushMessages`, `PushMessage` (Task 2); `push_subscriptions` (Task 1).
- Produces: `pushConfigured(): boolean`, `sendToDevices(sb, subs: PushSub[], payload: PushPayload): Promise<number>`, `PushSub`, `PushPayload { title; body; url; tag }`, `fetchUserSnapshot(sb, profile): Promise<Snapshot>`, `POST /api/push/test → { delivered: number }` (401 signed out, 503 `{ error: 'push_off' }` without keys).

- [ ] **Step 1: Install** `npm install web-push && npm install -D @types/web-push`

- [ ] **Step 2: Sender**

<!-- file: src/lib/push/send.ts -->
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export interface PushSub { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
export interface PushPayload { title: string; body: string; url: string; tag: string }

let configured = false;

/** False when the VAPID keys are missing (push then silently does nothing). Server-only. */
export function pushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  configured = true;
  return true;
}

/** Sends to every device; deletes subscriptions the push service reports as gone. Returns how many accepted it. */
export async function sendToDevices(sb: SupabaseClient, subs: PushSub[], payload: PushPayload): Promise<number> {
  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag });
  const results = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86_400 });
      return 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', status);
      return 0;
    }
  }));
  return results.reduce<number>((a, b) => a + b, 0);
}
```

- [ ] **Step 3: Per-user snapshot loader (moved out of the cron)**

<!-- file: src/lib/userSnapshot.ts -->
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Benefit, Profile, Program, Snapshot, Store, WalletItem } from './core/types';
import { selectAll } from './selectAll';

/** What one user sees (shared catalog + their private rows), loaded with the admin client. Server-only. */
export async function fetchUserSnapshot(sb: SupabaseClient, profile: Profile): Promise<Snapshot> {
  const uid = profile.user_id;
  const visible = `user_id.is.null,user_id.eq.${uid}`;
  const [programs, wallet, stores, benefits] = await Promise.all([
    selectAll<Program>((a, b) => sb.from('programs').select('*').or(visible).order('id').range(a, b)),
    selectAll<WalletItem>((a, b) => sb.from('wallet_items').select('*').eq('user_id', uid).order('id').range(a, b)),
    selectAll<Store>((a, b) => sb.from('stores').select('*').or(visible).order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').or(visible).eq('status', 'active').order('id').range(a, b)),
  ]);
  return { profile, programs, wallet, stores, benefits, fetchedAt: '' };
}
```

- [ ] **Step 4: Rewrite the cron**

<!-- file: src/app/api/cron/birthday/route.ts -->
```ts
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
```

- [ ] **Step 5: Test endpoint**

<!-- file: src/app/api/push/test/route.ts -->
```ts
import { NextResponse } from 'next/server';
import { pushConfigured, sendToDevices, type PushSub } from '@/lib/push/send';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

/** Sends a test notification to the signed-in user's devices. */
export async function POST() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'push_off' }, { status: 503 });
  const { data: subs } = await sb.from('push_subscriptions').select('*'); // RLS: only this user's devices
  const delivered = await sendToDevices(supabaseAdmin(), (subs ?? []) as PushSub[], {
    title: '🔔 התראת בדיקה', body: 'ההתראות עובדות! כך ייראו התזכורות שלך.', url: '/', tag: 'test',
  });
  return NextResponse.json({ delivered });
}
```

- [ ] **Step 6: Env example**

<!-- patch -->
```python
p='.env.example';s=open(p,encoding='utf-8').read()
s=s.replace("CRON_SECRET=\n","CRON_SECRET=\n# Push notifications (free). Generate once: npx web-push generate-vapid-keys\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nVAPID_SUBJECT=mailto:you@example.com\n")
open(p,'w',encoding='utf-8',newline='\n').write(s)
```

- [ ] **Step 7: Verify** `npx tsc --noEmit && npm test && npm run lint`. Expected: no errors, all tests pass. Check `buildDateEmail` accepts the snapshot (it reads `programs`/`stores`).

- [ ] **Step 8: Commit** `git add -A src package.json package-lock.json .env.example && git commit -m "feat(push): send alerts from the daily cron, test endpoint"`

---

### Task 4: Service worker and deep links

**Files:**
- Modify: `public/sw.js`, `src/app/(tabs)/benefits/page.tsx:26-29`

- [ ] **Step 1: Push handlers**

<!-- patch -->
```python
p='public/sw.js';s=open(p,encoding='utf-8').read()
s+='''
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'ההטבות שלי', {
    body: data.body, icon: '/icon', badge: '/icon', tag: data.tag, dir: 'rtl', lang: 'he', data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (!win) return self.clients.openWindow(url);
    return win.navigate(url).then((c) => (c || win).focus()).catch(() => self.clients.openWindow(url));
  }));
});
'''
open(p,'w',encoding='utf-8',newline='\n').write(s)
```

- [ ] **Step 2: Deep links**

<!-- patch -->
```python
p='src/app/(tabs)/benefits/page.tsx';s=open(p,encoding='utf-8').read()
old="    if (new URLSearchParams(window.location.search).get('birthday')) setF((x) => ({ ...x, birthday: true }));\n"
assert old in s
s=s.replace(old,"""    const q = new URLSearchParams(window.location.search);
    setF((x) => ({ ...x, birthday: x.birthday || q.has('birthday'), expiringThisWeek: x.expiringThisWeek || q.has('expiring'),
      recent: x.recent || q.has('recent') }));
""")
open(p,'w',encoding='utf-8',newline='\n').write(s)
```

- [ ] **Step 3: Verify** `npx tsc --noEmit && npm run lint`, then open `/benefits?expiring=1` and `/benefits?recent=1` in dev: the matching chip is active.

- [ ] **Step 4: Commit** `git add public/sw.js "src/app/(tabs)/benefits/page.tsx" && git commit -m "feat(push): show notifications and open the matching filter"`

---

### Task 5: Settings UI

**Files:**
- Create: `src/lib/push/client.ts`, `src/components/PushSettings.tsx`
- Modify: `src/app/(tabs)/sources/page.tsx` (render block, logout)

**Interfaces:**
- Produces: `pushSupport(): 'unsupported' | 'ios_install' | 'denied' | 'ok'`, `currentSubscription(): Promise<PushSubscription | null>`, `subscribeDevice(sb, profile): Promise<void>`, `unsubscribeDevice(sb): Promise<void>`.

- [ ] **Step 1: Browser helpers**

<!-- file: src/lib/push/client.ts -->
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/lib/core/types';

/** Why push can't be turned on here, or 'ok'. iPhone only supports it in the app added to the Home Screen. */
export function pushSupport(): 'unsupported' | 'ios_install' | 'denied' | 'ok' {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios_install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function base64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks permission and saves this device. Always starts a fresh subscription, so a device another user
 * signed in on earlier never stays tied to that user. Returns false when permission was not given. */
export async function subscribeDevice(sb: SupabaseClient, profile: Profile): Promise<boolean> {
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: base64UrlToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
  const keys = sub.toJSON().keys!;
  const { error } = await sb.from('push_subscriptions').insert({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth });
  if (error) {
    await sub.unsubscribe();
    throw error;
  }
  if (!profile.push_new_since) await sb.from('profile').update({ push_new_since: new Date().toISOString() }).eq('user_id', profile.user_id);
  return true;
}

/** Stops push on this device (also used on logout). Best effort. */
export async function unsubscribeDevice(sb: SupabaseClient): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // no service worker (dev) or already gone
  }
}
```

- [ ] **Step 2: Component**

<!-- file: src/components/PushSettings.tsx -->
```tsx
'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { Button, Notice } from '@/components/ui';
import type { Profile } from '@/lib/core/types';
import { currentSubscription, pushSupport, subscribeDevice, unsubscribeDevice } from '@/lib/push/client';
import { supabaseBrowser } from '@/lib/supabase/browser';

type State = 'loading' | 'unsupported' | 'ios_install' | 'denied' | 'off' | 'on';
const SWITCHES = [
  ['push_dates', '🎂 תאריכים מיוחדים'],
  ['push_expiring', '⏳ הטבות שמסתיימות השבוע (בימי ראשון)'],
  ['push_new', '✨ הטבות חדשות לכרטיסים שלי'],
] as const;

export default function PushSettings({ profile, online, onChange }: { profile: Profile; online: boolean; onChange: () => Promise<void> }) {
  const sb = supabaseBrowser();
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const support = pushSupport();
    if (support !== 'ok') setState(support);
    else currentSubscription().then((s) => setState(s ? 'on' : 'off'), () => setState('unsupported'));
  }, []);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch {
      setMessage({ tone: 'error', text: 'הפעולה נכשלה. נסו שוב.' });
    } finally {
      setBusy(false);
    }
  }

  const enable = () => act(async () => {
    if (await subscribeDevice(sb, profile)) {
      setState('on');
      await onChange();
    } else setState(Notification.permission === 'denied' ? 'denied' : 'off');
  });
  const disable = () => act(async () => {
    await unsubscribeDevice(sb);
    setState('off');
  });
  const test = () => act(async () => {
    const res = await fetch('/api/push/test', { method: 'POST' });
    const { delivered } = (await res.json()) as { delivered?: number };
    setMessage(delivered
      ? { tone: 'success', text: 'נשלחה התראת בדיקה.' }
      : { tone: 'error', text: 'ההתראה לא נשלחה. נסו לכבות ולהפעיל מחדש.' });
  });
  const toggle = (key: (typeof SWITCHES)[number][0], value: boolean) => act(async () => {
    const { error } = await sb.from('profile').update({ [key]: value }).eq('user_id', profile.user_id);
    if (error) throw error;
    await onChange();
  });

  return (
    <div className="space-y-3 rounded-xl border border-line bg-panel-2/40 p-3">
      <p className="flex items-center gap-2 font-medium"><Bell size={16} className="text-mint" aria-hidden /> התראות</p>
      {state === 'unsupported' && <Notice>הדפדפן הזה לא תומך בהתראות.</Notice>}
      {state === 'ios_install' && (
        <Notice>באייפון צריך קודם להוסיף את האפליקציה למסך הבית: שיתוף ← הוספה למסך הבית, ולפתוח אותה משם.</Notice>
      )}
      {state === 'denied' && <Notice tone="warn">ההתראות חסומות בהגדרות הדפדפן. אפשר לאפשר אותן בהגדרות האתר.</Notice>}
      {state === 'off' && (
        <Button disabled={!online || busy} onClick={enable} className="w-full">הפעלת התראות במכשיר הזה</Button>
      )}
      {state === 'on' && (
        <>
          <p className="text-sm text-mint">✅ ההתראות פעילות במכשיר הזה</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!online || busy} onClick={test} className="flex-1">
              <Send size={15} aria-hidden /> שליחת התראת בדיקה
            </Button>
            <Button variant="secondary" disabled={busy} onClick={disable} className="flex-1">
              <BellOff size={15} aria-hidden /> כיבוי במכשיר הזה
            </Button>
          </div>
        </>
      )}
      {(state === 'on' || state === 'off') && SWITCHES.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-mint" disabled={!online || busy} checked={profile[key] !== false}
            onChange={(e) => toggle(key, e.target.checked)} />
          {label}
        </label>
      ))}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
```

- [ ] **Step 3: Wire into Sources**

<!-- patch -->
```python
p='src/app/(tabs)/sources/page.tsx';s=open(p,encoding='utf-8').read()
s=s.replace("import DatesForm, { datesValid, type DatesValue } from '@/components/DatesForm';\n",
  "import DatesForm, { datesValid, type DatesValue } from '@/components/DatesForm';\nimport PushSettings from '@/components/PushSettings';\n")
s=s.replace("import { idbClear } from '@/lib/snapshot';\n","import { unsubscribeDevice } from '@/lib/push/client';\nimport { idbClear } from '@/lib/snapshot';\n")
old="  async function logout() {\n    await sb.auth.signOut();\n"
assert old in s
s=s.replace(old,"  async function logout() {\n    await unsubscribeDevice(sb); // the next person on this device must not get this user's alerts\n    await sb.auth.signOut();\n")
old="          <label className=\"flex items-center gap-2\">\n            <input type=\"checkbox\" className=\"h-4 w-4 accent-mint\" disabled={!online} checked={profile.email_reminders}"
assert old in s
s=s.replace(old,"          <PushSettings profile={profile} online={online} onChange={refresh} />\n"+old)
open(p,'w',encoding='utf-8',newline='\n').write(s)
```

- [ ] **Step 4: Verify** `npx tsc --noEmit && npm run lint && npm test`; check `Button` supports `variant="secondary"` and `Notice` supports `tone="warn"|"success"|"error"` (both used elsewhere). Expected: clean.

- [ ] **Step 5: Commit** `git add -A src && git commit -m "feat(push): notification settings on the Sources tab"`

---

### Task 6: Keys, deploy, end-to-end check

- [ ] **Step 1:** Generate VAPID keys with `npx web-push generate-vapid-keys --json` piped straight into `.env.local` and into `vercel env add` (production + preview) without printing the private key. `VAPID_SUBJECT=mailto:<owner email>`.
- [ ] **Step 2:** Push `master` (auto-deploys production). Wait for READY.
- [ ] **Step 3:** Call the production cron with `CRON_SECRET`; expected `{"emailed":0,"pushed":0}` and status 200 (nobody subscribed yet).
- [ ] **Step 4:** Owner enables notifications on their phone and taps "שליחת התראת בדיקה"; the notification arrives and tapping it opens the app.
- [ ] **Step 5:** Update README roadmap: mark push notifications ✅. Commit and push.

## Self-Review

- Spec coverage: data (T1), plan logic + bookkeeping (T2/T3), sending + 404/410 cleanup + per-user isolation (T3), test endpoint (T3), SW + deep links (T4), settings states + switches (T5), env + deploy (T6). Email part kept, gated on `RESEND_API_KEY`.
- Types: `PushMessage`, `PushSub`, `PushPayload`, `pushMessages`, `fetchUserSnapshot`, `subscribeDevice/unsubscribeDevice` names consistent across tasks.
- Review Focus 1 → T5 `subscribeDevice` re-subscribes + logout; 2 → T2 test "while switched off"; 3 → T3 `sendToDevices`; 4 → T5 `pushSupport`; 5 → T2 microsecond `created_at` fixture.
