# Shared Catalog, Card Products and Special Dates — Design Spec

Date: 2026-10-07
Status: Approved in conversation (sections 1–4 + 2b), written for record
Builds on: `2026-10-06-benefits-finder-design.md`

## 1. Goal

Turn the single-user app into an **invite-only** app for friends and family where a new user ticks the cards and memberships they hold and **immediately sees the right benefits**, without importing anything. Also add special-date benefits beyond the birthday month.

Success:
- A newly invited user ticks "מקס" in onboarding and the Max benefits are ranked at a store right away.
- The owner (admin) maintains one shared catalog; each user can still add private benefits only they see.
- Benefits tied to a wedding anniversary, a child's birthday, or a club-specific ("fake") birthday month open in the right month.

## 2. Decisions

| Topic | Decision |
|---|---|
| Who joins | Invited people only. Public sign-up stays closed. |
| Catalog | Shared catalog edited by admins only, plus private programs/stores/benefits per user. |
| Invites | Admin-only screen in the app. |
| Data model | Approach A: existing tables; a row with `user_id = null` is **shared**, otherwise **private** to that user. |

## 3. Data model

### Shared-or-private tables
`programs`, `stores`, `benefits`, and new `card_products`:
- `user_id uuid null` — `null` = shared (everyone reads), otherwise private (only that user reads/writes).
- Default stays `auth.uid()`, so anything a normal user creates is private. Admins create shared rows by sending `user_id: null` explicitly.

### New table `card_products`
| column | |
|---|---|
| `id` | uuid |
| `user_id` | null = shared |
| `name` | e.g. "מקס של ביחד בשבילך" |
| `type` | `card` \| `membership` |
| `program_ids` | uuid[] — programs this product unlocks |

### Personal tables (unchanged ownership)
- `wallet_items` + `product_id uuid null` (the product it came from) + `birthday_month int null` (club-specific birthday month).
- `profile` + `is_admin boolean`, `anniversary_month int null`, `anniversary_day int null`, `children jsonb` (`[{name, birth_month}]`), `reminded text[]` (reminder keys already sent, e.g. `anniversary:2026`). `last_reminder_year` is no longer used.
- `imports` + `shared boolean` (admin's choice; always `false` for non-admins).

### Benefit timing
`timing ∈ always | birthday_month | anniversary_month | child_birthday_month`.

### Privacy rules (Row Level Security)
- `programs`, `stores`, `benefits`, `card_products`:
  - read: `user_id is null or user_id = auth.uid()`
  - insert/update/delete: `user_id = auth.uid()` **or** (`user_id is null` **and** `is_admin()`)
- `profile`, `wallet_items`, `imports`: own rows only (as before).
- `is_admin()` is a `security definer` function reading the caller's `profile.is_admin`.
- Users cannot grant themselves admin: `insert`/`update` privileges on `profile` are granted per column and exclude `is_admin`. Admin changes go through server routes that use the secret key and check the caller is an admin.

## 4. Logic

### Special dates
- `PersonalDates = { birthMonth, anniversaryMonth, childMonths[] }` from the profile.
- A benefit's open months:
  - `always` → always open
  - `birthday_month` → the wallet item's `birthday_month` if set, else the profile birth month
  - `anniversary_month` → profile anniversary month
  - `child_birthday_month` → every child's birth month
  - no date set → never open (shown locked)
- A dated benefit is available if **any** eligible wallet item has its window open this month (Israel date). Otherwise it is shown greyed out with the month(s) when it opens.
- Date windows for banners and emails: your birthday; each club-specific birthday ("יום ההולדת שלך ב-X"); anniversary; each child. A window is active when its month is the current month.
- Reminder email: one email per day-run listing every newly active window; each window key is reminded once a year (`<key>:<year>` stored in `profile.reminded`).

### Catalog helpers
- `walletItemFromProduct(product)` → `{ name, type, program_ids, product_id }`.
- `needsCatalogUpdate(item, product)` → true when the item's programs differ from the product's (order-insensitive). The wallet shows "עדכון מהקטלוג".
- Import save: merge only against benefits of the same ownership (shared import ↔ shared benefits, private ↔ the user's private benefits); reuse any visible store (shared first) by normalized name.

### Ranking
Unchanged except: rows carry `dateLocked` and `lockedMonths` instead of `birthdayLocked`. Private benefits show a "פרטי" badge.

## 5. Screens

- **Onboarding:** (1) your dates — birth month (required), anniversary (optional month/day), children (name + birth month, any number); (2) tick card products, grouped by card/membership, with search; (3) optional private card/club by name. Finishing creates wallet items from products (+ private program and item for each private entry), then the profile.
- **Wallet:** add from the product list or "something else (private)"; edit adds "חודש יום הולדת במועדון הזה"; "עדכון מהקטלוג" when the product changed.
- **Sources:** badges משותף/פרטי; non-admins cannot edit or delete shared programs; settings gain anniversary and children; admins see **ניהול** (management): invite by email, access list (remove, make admin), card-products editor.
- **Import:** admins get a shared/private switch (default: shared when the program is shared). Non-admins always private.
- **Home / All benefits:** banner lists active date windows; dated benefits use 🎂 / 💍 / 🎈; the "birthday" filter covers all special dates.

## 6. Invites

- Admin enters an email → server route (secret key, admin check) creates the user as confirmed. The invitee logs in at the app with Google or an email code.
- The screen then offers "שליחת הזמנה" which opens the admin's own mail app with a prefilled Hebrew invitation and the app link. (Deviation from "they get an invite email" in the conversation: Supabase invite links use a token-in-URL flow the app does not handle, and Resend's free sender can only email the account owner. A personal email from the admin works with no extra setup.)
- Remove access deletes the user (their private rows cascade). Cannot remove yourself or the last admin. Make/unmake admin only for users who finished onboarding; cannot remove the last admin.

## 7. Catalog content

- Current owner data (10 programs, 65 stores, 167 benefits) becomes the shared catalog; the owner becomes admin.
- Starting card products: ישראכרט, מקס, כאל, דיינרס (cards); מקס של ביחד בשבילך → Max + ביחד בשבילך; דרים קארד – כרטיס אשראי; שופרסל – כרטיס אשראי (cards); מועדון דרים קארד, רי-בר, דלתא פלוס, מועדון שופרסל, ביחד בשבילך, עובדים בריא (memberships). The owner's wallet items are linked to them.
- ~170 well-known Israeli chains are added as shared stores (Hebrew + English names, aliases, category), skipping existing ones.
- Monthly refresh: a scheduled task on the owner's computer (1st of each month) researches the shared programs and loads results as **shared** imports for the admin to approve.

## 8. Switchover

1. Back up the owner's rows to a JSON file on the owner's computer.
2. Schema migration (one transaction, run in the Supabase SQL editor): columns, `card_products`, timing values, `is_admin()`, policies, column privileges.
3. Data script (secret key): move owner rows to shared, set admin, create products, link wallet items, seed stores.

## 9. Error handling

| Case | Behavior |
|---|---|
| Non-admin writes a shared row | Database refuses; the UI hides those controls |
| Duplicate private stores | Allowed; shared stores are reused first |
| Invite for an existing email | Message "כבר יש גישה" |
| Remove self / last admin | Refused with a message |
| Offline | Unchanged — cached shared + private snapshot |

## 10. Testing

- Unit: special-date windows (anniversary, children, club birthday override, Dec→Jan), ranking with mixed shared/private, `walletItemFromProduct`, `needsCatalogUpdate`, ownership-filtered merge input, store list integrity (both names, valid category, no duplicate normalized names), generalized reminder email.
- Database (real Supabase, two throwaway users): user sees shared + own private only; cannot write shared rows or read another user's rows; cannot set `is_admin`; admin can write shared rows.
- End-to-end: a new throwaway user ticks a test card product in onboarding and immediately sees its shared benefit ranked at a test store.
- Phone-size screenshots of every changed screen.
