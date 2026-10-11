# Push notifications — design

## Goal
Reminders that actually reach users' phones for free, without Resend: special-date windows, benefits expiring
this week, and new shared benefits for the user's cards.

## What is sent
All alerts come from the existing daily cron (06:00 UTC ≈ 09:00 Israel; Vercel Hobby allows one run a day).

| Kind | When | Body (Hebrew) | Opens |
|---|---|---|---|
| `dates` | a date window (birthday, club birthday, anniversary, child) is open this month and not yet pushed this year | "🎂 יום ההולדת שלך — 29 הטבות פעילות החודש" | `/benefits?birthday=1` |
| `expiring` | Sundays (Israel time), if ≥1 active benefit the wallet unlocks has `valid_until` in [today, today+7] | "⏳ 3 הטבות מסתיימות השבוע: …" (up to 3 titles) | `/benefits?expiring=1` |
| `new` | shared, active benefits the wallet unlocks with `created_at > push_new_since` | "✨ 5 הטבות חדשות לכרטיסים שלך" | `/benefits?recent=1` |

- One message per open date window; at most one `expiring` and one `new` per day.
- Each message goes to every subscribed device of the user.
- Bookkeeping only advances when at least one device accepted the message:
  - `dates`: append `push:<window key>:<year>` to `profile.reminded` (email keeps its own `<key>:<year>`).
  - `new`: set `push_new_since` to the run time.
- `expiring` needs no bookkeeping: it only runs on Sundays, once a day.
- A user whose `push_new_since` is null gets no `new` alert; the cron sets it to now (no flood of the whole catalog).
- A subscription answering 404/410 is deleted. Other send errors are logged and skipped; one failing user or
  device never stops the run.

## Settings (Sources → הגדרות → "התראות")
- Not supported (no `serviceWorker`/`PushManager`/`Notification`): "הדפדפן הזה לא תומך בהתראות."
- iPhone/iPad in a browser tab (not standalone): "באייפון צריך קודם להוסיף את האפליקציה למסך הבית: שיתוף ← הוספה למסך הבית, ולפתוח אותה משם."
- Permission denied: "ההתראות חסומות בהגדרות הדפדפן. אפשר לאפשר אותן בהגדרות האתר."
- Off on this device: button "הפעלת התראות במכשיר הזה" → request permission → `pushManager.subscribe` with the VAPID public
  key → insert into `push_subscriptions` (upsert on endpoint) → set `push_new_since = now()` if null.
- On: "✅ ההתראות פעילות במכשיר הזה", buttons "שליחת התראת בדיקה" and "כיבוי במכשיר הזה" (unsubscribe + delete row).
- Three checkboxes (per user, all devices), default on: 🎂 תאריכים מיוחדים · ⏳ הטבות שמסתיימות השבוע · ✨ הטבות חדשות.
- The email checkbox stays unchanged.

## Data (migration `20261011000000_push.sql`)
- `push_subscriptions(id uuid pk, user_id uuid not null default auth.uid() → auth.users on delete cascade,
  endpoint text unique not null, p256dh text not null, auth text not null, created_at timestamptz default now())`.
  RLS: select/insert/delete own rows only (`user_id = auth.uid()`).
- `profile`: `push_dates`, `push_expiring`, `push_new` boolean not null default true; `push_new_since timestamptz`.
  Users may insert/update these columns (column grants).

## Server
- `src/lib/core/pushPlan.ts` (pure): `pushMessages(snapshot, today, now)` → `{ messages, newSince }`, each message
  `{ kind, title, body, url, tag, remindKeys }`. Uses `activeDateBenefits`, `eligibleItems`, `addDays`.
  `israelWeekday(now)` for the Sunday check.
- `src/lib/push/send.ts`: `web-push` with `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`;
  `sendToUser(sb, subs, message)` → number delivered, deletes gone subscriptions.
- `src/lib/userSnapshot.ts`: the per-user snapshot loader the cron already inlines (shared + own rows), reused by email and push.
- Cron `/api/cron/birthday`: email part runs only when `RESEND_API_KEY` is set; push part runs for every user with ≥1 subscription.
- `POST /api/push/test`: signed-in user; sends "🔔 התראת בדיקה" to their devices; returns `{ delivered }`.

## Service worker
- `push`: `showNotification(title, { body, icon: '/icon', badge: '/icon', tag, data: { url }, dir: 'rtl', lang: 'he' })`.
- `notificationclick`: focus an open app window and navigate it to `url`, else `clients.openWindow(url)`.

## Benefits page deep links
`?birthday=1`, `?expiring=1`, `?recent=1` turn on the matching filter.

## Env
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` owner). Generated once, stored in
`.env.local` and Vercel, never printed.

## Testing
- Unit: `pushPlan` (date window once per year, toggles off, Sunday only, expiring window bounds, wallet filter,
  new-since watermark, null watermark), `israelWeekday`.
- DB: a user sees/deletes only their own `push_subscriptions`.
- Manual: the test button on a phone (Android Chrome; iPhone from the Home Screen).

## Out of scope
Per-device toggles, quiet hours, more than one cron run per day, holiday sale calendar.
