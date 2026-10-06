# Benefits Finder — Design Spec

Date: 2026-10-06
Status: Draft for review

## 1. Purpose

A personal, Hebrew (RTL), phone-first web app that collects every benefit and discount from my credit cards, clubs and store loyalty memberships (Israel) into one searchable place, and answers the question at the checkout: **"Which card / membership should I use at this store?"**

Success looks like:
- Standing in a store, I type the store name and within seconds see which card to pay with and which membership to show, best first.
- All benefits — small and big — are browsable with filters and search.
- Birthday-month benefits are never missed.

### Decisions made
- Single user (me). No family / shared accounts in v1.
- **No connection to bank or card accounts.** The app never stores bank/card-site passwords, full card numbers or CVV. Benefits are public per program, so they are imported from the programs' benefit pages instead.
- Data entry: **AI-assisted import** in v1; per-program **scrapers** later.
- Ranking: ₪-savings estimate where computable, labeled list for the rest (option "B").
- Platform: installable web app (PWA), Hebrew RTL.
- Stack: Next.js + Supabase on Vercel.

## 2. Tech stack

| Concern | Choice |
|---|---|
| App | Next.js (App Router), TypeScript, Tailwind CSS, `dir="rtl"`, PWA manifest + service worker |
| Hosting | Vercel (free tier) |
| DB / Auth / File storage | Supabase: Postgres, Auth (email magic link + Google), Storage (import screenshots) |
| AI extraction | Claude API (`claude-sonnet-5-5`, vision for screenshots), called only from server routes |
| Email | Resend (free tier) |
| Scheduled jobs | Vercel Cron (daily birthday check); GitHub Actions (scrapers, phase 2) |
| Tests | Vitest (unit), Playwright (one end-to-end smoke test) |

## 3. Data model

All tables have `id`, `user_id` (except shared reference rows noted), `created_at`, `updated_at`. Row Level Security on every table: a row is readable/writable only by its `user_id`.

### profile
- `user_id` (PK)
- `birth_month` (1–12, required)
- `birth_day` (1–31, optional)
- `email_reminders` (bool, default true)
- `last_reminder_year` (int, optional — prevents duplicate birthday emails)

### programs
Who gives benefits.
- `name` — e.g. Isracard, Max, Cal, Diners, Amex, Hever, Rebar club, Dream Card, Delta+
- `kind` — `card_issuer` | `club` | `store_club`
- `logo_url`, `benefits_url` (the page used for import/refresh)
- `last_refreshed_at`, `last_refresh_status` (`ok` | `failed` | `never`)

### wallet_items
What I actually hold.
- `name` — e.g. "Cal Hever Visa", "Rebar club"
- `type` — `card` | `membership`
- `last4` (optional, 4 digits only), `color`, `nickname`
- `wallet_item_programs` (join table) — which programs this item unlocks (a Cal-issued Hever card → Cal + Hever)

### stores
- `name` (canonical, Hebrew)
- `aliases` text[] — spellings in Hebrew and English (שופרסל, Shufersal, שופרסל דיל)
- `category` — fixed list: food, fuel, fashion, electronics, home, pharmacy & beauty, restaurants, entertainment, travel, online, other
- `channel` — `in_store` | `online` | `both`
- `search_key` — normalized text for search (see §5.3)

### benefits
- `program_id`
- Scope: `store_id` **or** `category` **or** neither (= general, applies everywhere). Exactly one scope.
- `title`, `description`
- `type` — `percent_off` | `fixed_off` | `cashback_percent` | `points` | `bogo` | `gift` | `installments` | `other`
- `value` (numeric, meaning depends on type: percent, ₪, or null)
- `min_spend` (₪, optional), `max_discount` (₪ cap, optional)
- `requires` — `pay_with_card` | `membership` | `coupon_code`
- `coupon_code` (optional)
- `channel` — `in_store` | `online` | `both`
- `when` — `always` | `birthday_month` | `birthday_week`
- `valid_from`, `valid_until` (optional dates)
- `conditions` (free text, shown as-is)
- `source_url`, `last_verified_at`
- `status` — `active` | `not_seen` (missing from last refresh, awaiting my confirmation) | `archived`

Expired benefits (`valid_until < today`) are hidden from results, never deleted.
Benefits with `last_verified_at` older than 60 days show a "may be outdated" badge.

### imports
- `program_id`
- `source` — `ai_link` | `ai_text` | `ai_screenshot` | `scraper`
- `raw_input` (URL / text / storage paths of screenshots)
- `extracted` (JSON: proposed benefits + proposed new stores)
- `status` — `pending_review` | `saved` | `rejected` | `failed`
- `error` (text, optional)

## 4. Pages

Bottom tab bar, RTL, phone-first. Login screen precedes everything.

1. **🔍 Where am I (home)** — store search with autocomplete (Hebrew + English), optional "How much am I spending? ₪" field, results (§5). Birthday banner during birthday month: "🎂 Birthday month — N birthday benefits waiting" → opens filtered list.
2. **📋 All benefits** — search bar + filters: program, wallet item, category, type, channel, "🎂 birthday benefits", "expiring this week", "recently added". Toggle: "only what my wallet unlocks" / "everything".
3. **💳 My wallet** — add / edit / remove cards and memberships; choose programs each unlocks.
4. **➕ Import** — paste link / paste text / upload screenshots → pick program → AI extraction → editable review table (approve, edit, delete per row; new stores shown for confirmation) → save.
5. **⚙️ Sources** — programs list: last refreshed, benefit count, status (⚠️ on failure), **Refresh** button (re-imports from `benefits_url`).

**Onboarding (first login):**
1. Birthday month (required) + day (optional).
2. "What do you have?" — checklist of seeded common Israeli programs grouped by kind (card issuers / clubs / store clubs), plus "add other". Ticked items become wallet items.
3. For each card: which programs it unlocks (pre-filled where the name makes it obvious, editable).

Seed data: about 30 common Israeli programs (name, kind, benefits URL). The final list is compiled during implementation and editable in the app.

## 5. Core logic

All of §5 lives in pure TypeScript modules (no DB/network), so it can be unit-tested and run on the phone offline.

### 5.1 Candidate benefits for a store S
A benefit is a candidate when all hold:
- scope matches: `store_id = S`, or `category = S.category`, or general;
- its program is unlocked by at least one wallet item;
- `status = active` and today is within `valid_from`..`valid_until` (missing bounds = open);
- if a channel filter is set, it matches.

### 5.2 Grouping and ranking
Each candidate is attached to the wallet item(s) that satisfy it:
- `requires = pay_with_card` → wallet items of `type = card` that unlock the program. Shown as **"Pay with X"**.
- `requires = membership` or `coupon_code` → any wallet item unlocking the program. Shown in the **"Show / enter"** group, with a copy button for codes.

The app does **not** assume benefits stack; card benefits and membership benefits are shown in separate groups.

Result groups, in order:
1. **Computable** (`percent_off`, `fixed_off`, `cashback_percent`):
   - With amount A entered: savings =
     - `percent_off` / `cashback_percent`: `min(A × value / 100, max_discount ?? ∞)`
     - `fixed_off`: `value`
     - If `A < min_spend`: savings = 0 and the row shows "Spend ₪(min_spend − A) more for ₪X".
     Sorted by savings descending, ties broken by lower `min_spend`.
   - Without amount: `percent_off` and `cashback_percent` sorted by value descending, then `fixed_off` by value descending, with a hint to enter the amount.
2. **Other benefits** (`points`, `bogo`, `gift`, `installments`, `other`) — grouped by type.
3. **Show / enter** (membership and coupon benefits).

### 5.3 Birthday rules
- `birthday_month`: active when the current month = `birth_month`.
- `birthday_week`: if `birth_day` is set, active from 7 days before to 7 days after the birthday (lenient; the benefit's `conditions` text is shown); if `birth_day` is not set, treated as `birthday_month`.
- Outside their window, birthday benefits still appear in store results, greyed out with "Available in your birthday month (<month name>)".

### 5.4 Store search normalization
`normalize(text)`: lowercase, strip Hebrew niqqud, final letters → regular letters (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ), remove punctuation and spaces. The match is a substring or trigram similarity against the normalized `name` and `aliases`. The same function runs in Postgres (`search_key`, `pg_trgm` index) and on the client (offline).

### 5.5 Import merge rule
An extracted benefit **updates** an existing one when program, scope (store or category), `type`, `value` and `when` are equal: it refreshes `last_verified_at` and overwrites text fields. Otherwise it is **new**. On a refresh, active benefits of that program not present in the new extraction become `not_seen` until I confirm (archive) or restore them.

## 6. AI import pipeline

1. Input: URL, text, or 1–5 screenshots, plus the chosen program.
2. For a URL, the server fetches the page and extracts its readable text. If the result is under ~500 characters (JS-rendered sites), it returns "Couldn't read this page — paste the text or a screenshot."
3. Server calls Claude with: the content, the store list (name + aliases + category), the category list, and a strict output schema matching `benefits` + proposed new stores (with Hebrew name, English alias, category).
4. The response is validated against the schema (zod). Invalid rows are kept and flagged in the review table, not dropped.
5. Saved to `imports` as `pending_review`. Nothing reaches `benefits` until I approve in the review table.
6. Failures (`failed` status + error) show a retry button.

## 7. Birthday reminder email

A Vercel Cron job runs daily at 09:00 Israel time. On the 1st of `birth_month`, if `email_reminders` is true, it sends an email via Resend: "🎂 Your birthday month started — N birthday benefits", listing them grouped by program, with links into the app. It sends at most once per year (`profile.last_reminder_year`).

## 8. Offline

The service worker caches the app shell. On every online open, the client downloads a snapshot (wallet items, programs, stores, active benefits, profile) into IndexedDB. The home search and ranking run on the client from that snapshot, so they work identically online and offline. Offline mode is read-only: import, wallet edits and refresh are disabled with a "you're offline" note.

## 9. Security

- Supabase Auth with public sign-ups disabled; only my email can log in.
- RLS on every table.
- Claude, Resend and Supabase service keys exist only on the server (Vercel env vars) and, in phase 2, in GitHub Actions secrets.
- Never stored: full card numbers, CVV, bank or card-site credentials.
- Uploaded screenshots go to a private Supabase Storage bucket.

## 10. Error handling summary

| Failure | Behavior |
|---|---|
| URL fetch yields little/no text | Ask for pasted text or screenshot |
| AI output invalid | Flag rows in review; retry button |
| AI call fails | Import marked `failed`, retry button |
| Offline | Search works from snapshot; writes disabled |
| Scraper fails (phase 2) | ⚠️ on program, data untouched; email after 3 consecutive failed nights |

## 11. Testing

- **Unit (Vitest):** savings calculation (min spend, cap, percent vs fixed vs cashback), grouping/ranking (pay-with vs show), birthday windows (month, week with/without day, year boundary Dec/Jan), store-search normalization (final letters, niqqud, Hebrew/English aliases), import merge rule.
- **AI extraction regression:** 3–5 saved real benefit pages with expected extracted output, run on demand when the prompt changes.
- **End-to-end (Playwright):** log in → search a store → the expected card is ranked first.

## 12. Phases

**v1:** everything in §§3–11 except scrapers.

**Phase 2 — scrapers:** one Playwright script per chosen program, run nightly by GitHub Actions. Each writes into `imports` with `source = scraper`. Unchanged benefits are auto-approved; new or changed ones wait for review, with optional per-program auto-approve. Failure handling per §10.

**Out of scope (later, if needed):** family/shared accounts, converting points/miles to ₪, push notifications, day-of-week benefits.
