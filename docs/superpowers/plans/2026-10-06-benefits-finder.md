# Benefits Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal Hebrew (RTL) installable web app that collects every benefit from my Israeli cards, clubs and store clubs and tells me which card or membership to use at a given store.

**Architecture:** Next.js (App Router) on Vercel with Supabase for login, Postgres and file storage. All business logic (search, savings, ranking, birthday rules, import merge) lives in pure TypeScript modules under `src/lib/core/`. The phone downloads a snapshot of all my data, keeps it in IndexedDB, and runs search and ranking locally, so it works offline. Only two server routes exist: AI import (Claude) and the daily birthday-email cron.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS 4, `@supabase/ssr` + `@supabase/supabase-js`, `@anthropic-ai/sdk` + `zod`, `resend`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-benefits-finder-design.md`

## Global Constraints

- UI language Hebrew, right-to-left: `<html lang="he" dir="rtl">`. Every user-facing string is Hebrew.
- Never store full card numbers, CVV, or bank/card-site credentials. `last4` is exactly 4 digits or null.
- "Today" is always the **Asia/Jerusalem** calendar date (`israelToday()` from Task 2), never UTC.
- Birthday benefits are valid for the **whole birth month** (birthday 21.9 → 1.9–30.9). Only the month is stored.
- Every store has a non-empty Hebrew name **and** English name.
- Store search must match: `Mango`, `mango`, `MANGO`, `מנגו`, `מנג` → Mango; `מקדונלדס`, `מקדונלד'ס`, `מק דונלדס`, `McDonald's`, `mcdonalds`, `McDonalds` → McDonald's.
- Expired benefits are hidden, never deleted. Benefits unverified for more than 60 days show "ייתכן שלא מעודכן".
- Nothing reaches the `benefits` table without my approval in the review screen.
- Claude is called only from server code with model `claude-opus-5-5`; `ANTHROPIC_API_KEY`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY` and `CRON_SECRET` never get a `NEXT_PUBLIC_` prefix.
- Supabase public sign-ups are disabled; Row Level Security is on for every table.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Deliberate deviations from the spec (internal, no behavior change):**
- Search runs on the phone over the snapshot for every page, so there is no `search_key` column or `pg_trgm` index.
- `wallet_items.program_ids uuid[]` replaces the `wallet_item_programs` join table.
- The benefit column `when` is named `timing` (`when` is an SQL reserved word).
- No `updated_at` columns (nothing reads them). `imports` gets an `is_refresh` flag.
- Login sends a 6-digit email code as well as the link, because an iPhone home-screen app cannot receive a magic-link session opened in Safari.
- The AI model is `claude-opus-5-5` (the current default per the Claude API guidance) at effort `low`, instead of `claude-sonnet-5-5`.
- The birthday email goes out on the first daily run in the birth month that finds at least one birthday benefit (normally the 1st).

## Review Focus

1. **More than 1,000 benefits or stores** (big clubs list hundreds of offers): Supabase returns at most 1,000 rows per request, so a naive load silently drops data. Expected: everything loads. → Task 10 tests `selectAll` with 2,500 rows.
2. **A fixed ₪ discount larger than the purchase** (₪50 off, ₪30 purchase): expected saving ₪30, not ₪50. → Task 3.
3. **Saving the same import twice, or retrying after a save failed half-way:** expected no duplicate benefits and no duplicate stores. → Task 6 (merge is idempotent) and Task 1 (`findStoreByName` reuses an existing store).
4. **Using the app at 23:30 Israel time on a benefit's last valid day:** expected the benefit is still shown (validity is inclusive and uses the Israel date). → Task 2.
5. **The same benefit listed twice on one page** (under "new" and under "fashion"): expected it is saved once. → Task 6.

---

## File Map

```
benefits-finder/
  .env.example                      env var names (no values)
  vercel.json                       daily cron for the birthday email
  vitest.config.ts                  unit tests (src/**/*.test.ts)
  vitest.ai.config.ts               AI regression tests (real API, on demand)
  playwright.config.ts              end-to-end smoke test
  supabase/migrations/20261006000000_init.sql   tables, RLS, storage bucket
  public/sw.js                      service worker (offline app shell)
  src/proxy.ts                      auth gate (Next 16 "proxy", formerly middleware)
  src/lib/core/                     PURE logic, no network/DB/browser APIs
    types.ts                        domain types + enum value lists
    normalize.ts                    normalize, searchStores, findStoreByName
    dates.ts                        israelToday, validity, birthday, availability
    savings.ts                      computeSavings
    rank.ts                         rankForStore, eligibleItems, birthdayBenefits
    browse.ts                       browseBenefits (filters for "All benefits")
    merge.ts                        benefitKey, mergeImport
    review.ts                       ReviewRow, rowProblems, toIncoming, scope helpers
    labels.ts                       Hebrew labels, shekel(), formatDate(), import error texts
  src/lib/selectAll.ts              paginated Supabase select
  src/lib/snapshot.ts               fetchSnapshot + IndexedDB cache
  src/lib/useSnapshot.tsx           React context provider for the snapshot
  src/lib/seedPrograms.ts           onboarding checklist
  src/lib/startImport.ts            client helper calling /api/import
  src/lib/fetchPage.ts              URL → readable text
  src/lib/ai/schema.ts              zod schema of the extraction
  src/lib/ai/prompt.ts              system prompt + context builder
  src/lib/ai/extract.ts             Claude call
  src/lib/email/birthdayEmail.ts    birthday email HTML
  src/lib/supabase/{browser,server,admin}.ts
  src/components/{BottomNav,BenefitCard,SwRegister}.tsx
  src/app/layout.tsx, globals.css, manifest.ts, icon.tsx, apple-icon.tsx
  src/app/login/page.tsx, auth/callback/route.ts, onboarding/page.tsx
  src/app/(tabs)/layout.tsx         snapshot provider + bottom nav + onboarding gate
  src/app/(tabs)/page.tsx           🔍 Where am I
  src/app/(tabs)/benefits/page.tsx  📋 All benefits
  src/app/(tabs)/wallet/page.tsx    💳 My wallet
  src/app/(tabs)/import/page.tsx    ➕ Import
  src/app/(tabs)/import/[id]/page.tsx  review an import
  src/app/(tabs)/sources/page.tsx   ⚙️ Sources + settings
  src/app/api/import/route.ts
  src/app/api/cron/birthday/route.ts
  tests/e2e/smoke.spec.ts
  tests/ai/regression.test.ts + tests/ai/fixtures/*
```

Tasks 1–7 are pure logic and need no accounts. Task 8 onward needs the accounts from the **Prerequisites** section (between Task 7 and Task 8).

---

### Task 1: Scaffold, core types and store search

**Files:**
- Create: Next.js app (via `create-next-app`), `vitest.config.ts`
- Create: `src/lib/core/types.ts`, `src/lib/core/normalize.ts`
- Test: `src/lib/core/normalize.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `types.ts`: const tuples `PROGRAM_KINDS`, `BENEFIT_TYPES`, `REQUIRES`, `CHANNELS`, `TIMINGS`, `CATEGORIES`; types `ProgramKind`, `BenefitType`, `Requires`, `Channel`, `Timing`, `Category`, `BenefitStatus`; `COMPUTABLE_TYPES: readonly BenefitType[]`; interfaces `Profile`, `Program`, `WalletItem`, `Store`, `Benefit`, `Snapshot`.
  - `normalize(text: string): string`
  - `searchStores(stores: Store[], query: string, limit?: number): Store[]`
  - `findStoreByName(stores: Store[], name: string): Store | undefined`

- [ ] **Step 1: Scaffold Next.js into this folder**

Run (from `benefits-finder/`):
```bash
npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```
Expected: "Success! Created benefits-finder". If it refuses because the folder is not empty, run the same command with `../bf-tmp` instead of `.`, then move every file and folder from `../bf-tmp` (including dotfiles, excluding its `.git` if any) into `benefits-finder/` and delete `../bf-tmp`.

- [ ] **Step 2: Install Vitest and add scripts**

```bash
npm install -D vitest
npm pkg set scripts.test="vitest run"
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 3: Write the domain types**

Create `src/lib/core/types.ts`:
```ts
export const PROGRAM_KINDS = ['card_issuer', 'club', 'store_club'] as const;
export const BENEFIT_TYPES = [
  'percent_off', 'fixed_off', 'cashback_percent', 'points', 'bogo', 'gift', 'installments', 'other',
] as const;
export const REQUIRES = ['pay_with_card', 'membership', 'coupon_code'] as const;
export const CHANNELS = ['in_store', 'online', 'both'] as const;
export const TIMINGS = ['always', 'birthday_month'] as const;
export const CATEGORIES = [
  'food', 'fuel', 'fashion', 'electronics', 'home', 'pharmacy_beauty',
  'restaurants', 'entertainment', 'travel', 'online', 'other',
] as const;

export type ProgramKind = (typeof PROGRAM_KINDS)[number];
export type BenefitType = (typeof BENEFIT_TYPES)[number];
export type Requires = (typeof REQUIRES)[number];
export type Channel = (typeof CHANNELS)[number];
export type Timing = (typeof TIMINGS)[number];
export type Category = (typeof CATEGORIES)[number];
export type BenefitStatus = 'active' | 'not_seen' | 'archived';

/** Types whose ₪ saving can be calculated from a purchase amount. */
export const COMPUTABLE_TYPES: readonly BenefitType[] = ['percent_off', 'fixed_off', 'cashback_percent'];

export interface Profile {
  user_id: string;
  birth_month: number; // 1-12
  email_reminders: boolean;
  last_reminder_year: number | null;
}

export interface Program {
  id: string;
  name: string;
  kind: ProgramKind;
  logo_url: string | null;
  benefits_url: string | null;
  last_refreshed_at: string | null;
  last_refresh_status: 'ok' | 'failed' | 'never';
}

export interface WalletItem {
  id: string;
  name: string;
  type: 'card' | 'membership';
  last4: string | null;
  nickname: string | null;
  color: string | null;
  program_ids: string[];
  created_at: string;
}

export interface Store {
  id: string;
  name_he: string;
  name_en: string;
  aliases: string[];
  category: Category;
  channel: Channel;
}

export interface Benefit {
  id: string;
  program_id: string;
  store_id: string | null; // at most one of store_id / category is set; neither = applies everywhere
  category: Category | null;
  title: string;
  description: string | null;
  type: BenefitType;
  value: number | null; // percent for percent_off/cashback_percent, ₪ for fixed_off
  min_spend: number | null;
  max_discount: number | null;
  requires: Requires;
  coupon_code: string | null;
  channel: Channel;
  timing: Timing;
  valid_from: string | null; // YYYY-MM-DD
  valid_until: string | null; // YYYY-MM-DD, inclusive
  conditions: string | null;
  source_url: string | null;
  last_verified_at: string; // ISO timestamp
  status: BenefitStatus;
  created_at: string;
}

export interface Snapshot {
  profile: Profile | null;
  programs: Program[];
  wallet: WalletItem[];
  stores: Store[];
  benefits: Benefit[]; // never includes archived
  fetchedAt: string;
}
```

- [ ] **Step 4: Write the failing search tests**

Create `src/lib/core/normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { findStoreByName, normalize, searchStores } from './normalize';
import type { Store } from './types';

const store = (id: string, name_he: string, name_en: string, aliases: string[] = []): Store => ({
  id, name_he, name_en, aliases, category: 'other', channel: 'both',
});
const mango = store('mango', 'מנגו', 'Mango');
const mcd = store('mcd', 'מקדונלדס', "McDonald's");
const shufersal = store('shufersal', 'שופרסל', 'Shufersal', ['שופרסל דיל']);
const stores = [mango, mcd, shufersal];

describe('normalize', () => {
  it('lowercases and removes spaces and punctuation', () => {
    expect(normalize(" McDonald's ")).toBe('mcdonalds');
  });
  it('turns Hebrew final letters into regular letters', () => {
    expect(normalize('שלום')).toBe('שלומ');
  });
  it('removes niqqud, geresh and gershayim', () => {
    expect(normalize('שָׁלוֹם')).toBe('שלומ');
    expect(normalize('מקדונלד׳ס')).toBe('מקדונלדס');
    expect(normalize('צה״ל')).toBe('צהל');
  });
});

describe('searchStores', () => {
  it.each(['Mango', 'mango', 'MANGO', 'מנגו', 'מנג'])('"%s" finds Mango first', (q) => {
    expect(searchStores(stores, q)[0]?.id).toBe('mango');
  });
  it.each(['מקדונלדס', "מקדונלד'ס", 'מקדונלד׳ס', 'מק דונלדס', "McDonald's", 'mcdonalds', 'McDonalds'])(
    '"%s" finds McDonald\'s first',
    (q) => {
      expect(searchStores(stores, q)[0]?.id).toBe('mcd');
    },
  );
  it('matches aliases', () => {
    expect(searchStores(stores, 'דיל')[0]?.id).toBe('shufersal');
  });
  it('tolerates a small typo', () => {
    expect(searchStores(stores, 'מקדונלס')[0]?.id).toBe('mcd');
  });
  it('returns nothing for an empty query', () => {
    expect(searchStores(stores, '  ')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(searchStores(stores, 'ו', 1)).toHaveLength(1);
  });
});

describe('findStoreByName', () => {
  it('finds a store by exact normalized Hebrew or English name', () => {
    expect(findStoreByName(stores, 'mcdonalds')?.id).toBe('mcd');
    expect(findStoreByName(stores, 'מנגו')?.id).toBe('mango');
  });
  it('does not match partial names', () => {
    expect(findStoreByName(stores, 'Mang')).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- src/lib/core/normalize.test.ts`
Expected: FAIL — `Failed to resolve import "./normalize"`.

- [ ] **Step 6: Implement**

Create `src/lib/core/normalize.ts`:
```ts
import type { Store } from './types';

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Lowercase, Hebrew final letters → regular, drop niqqud/accents/punctuation/spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common / (A.size + B.size - common);
}

function storeKeys(store: Store): string[] {
  return [store.name_he, store.name_en, ...store.aliases].map(normalize).filter(Boolean);
}

/** Prefix match beats substring match beats fuzzy (trigram) match. */
export function searchStores(stores: Store[], query: string, limit = 8): Store[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { store: Store; score: number }[] = [];
  for (const store of stores) {
    let score = 0;
    for (const key of storeKeys(store)) {
      if (key.startsWith(q)) score = Math.max(score, 3);
      else if (key.includes(q)) score = Math.max(score, 2);
      else if (q.length >= 3) {
        const sim = similarity(q, key);
        if (sim >= 0.3) score = Math.max(score, sim);
      }
    }
    if (score > 0) scored.push({ store, score });
  }
  scored.sort((a, b) => b.score - a.score || a.store.name_he.localeCompare(b.store.name_he, 'he'));
  return scored.slice(0, limit).map((s) => s.store);
}

/** Exact match on normalized Hebrew name, English name or alias. Used to avoid duplicate stores. */
export function findStoreByName(stores: Store[], name: string): Store | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  return stores.find((s) => storeKeys(s).includes(n));
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/lib/core/normalize.test.ts`
Expected: PASS (all tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app, core types and bilingual store search" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dates, validity and birthday rules

**Files:**
- Create: `src/lib/core/dates.ts`
- Test: `src/lib/core/dates.test.ts`

**Interfaces:**
- Consumes: `Benefit`, `Timing`, `BenefitStatus` from Task 1
- Produces:
  - `interface IsraelDay { iso: string; year: number; month: number }`
  - `israelToday(now?: Date): IsraelDay`
  - `addDays(iso: string, days: number): string`
  - `isWithinValidity(b: { valid_from: string|null; valid_until: string|null }, todayIso: string): boolean`
  - `isBirthdayMonth(birthMonth: number | null | undefined, today: IsraelDay): boolean`
  - `type Availability = 'available' | 'birthday_locked' | 'unavailable'`
  - `availability(b: Pick<Benefit,'status'|'timing'|'valid_from'|'valid_until'>, birthMonth: number | null, today: IsraelDay): Availability`
  - `isOutdated(lastVerifiedAt: string, now: Date): boolean`
  - `monthNameHe(month: number): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/core/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  addDays, availability, isBirthdayMonth, isOutdated, isWithinValidity, israelToday, monthNameHe,
} from './dates';

const day = (iso: string) => ({ iso, year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
const active = { status: 'active' as const, timing: 'always' as const, valid_from: null, valid_until: null };

describe('israelToday', () => {
  it('uses the Israel date late in the evening (UTC is still the previous day)', () => {
    // 21:30 UTC on 30.9 = 00:30 on 1.10 in Israel (UTC+3)
    expect(israelToday(new Date('2026-09-30T21:30:00Z'))).toEqual({ iso: '2026-10-01', year: 2026, month: 10 });
  });
  it('keeps the same date at 23:30 Israel time', () => {
    expect(israelToday(new Date('2026-10-06T20:30:00Z')).iso).toBe('2026-10-06');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('isWithinValidity', () => {
  it('includes the last valid day', () => {
    expect(isWithinValidity({ valid_from: null, valid_until: '2026-10-06' }, '2026-10-06')).toBe(true);
    expect(isWithinValidity({ valid_from: null, valid_until: '2026-10-06' }, '2026-10-07')).toBe(false);
  });
  it('respects the start date', () => {
    expect(isWithinValidity({ valid_from: '2026-10-10', valid_until: null }, '2026-10-09')).toBe(false);
    expect(isWithinValidity({ valid_from: '2026-10-10', valid_until: null }, '2026-10-10')).toBe(true);
  });
});

describe('birthday month', () => {
  it('is active for the whole birth month', () => {
    expect(isBirthdayMonth(9, day('2026-09-01'))).toBe(true);
    expect(isBirthdayMonth(9, day('2026-09-30'))).toBe(true);
    expect(isBirthdayMonth(9, day('2026-08-31'))).toBe(false);
    expect(isBirthdayMonth(9, day('2026-10-01'))).toBe(false);
  });
  it('handles December/January', () => {
    expect(isBirthdayMonth(12, day('2026-12-31'))).toBe(true);
    expect(isBirthdayMonth(12, day('2027-01-01'))).toBe(false);
  });
  it('is never active without a birth month', () => {
    expect(isBirthdayMonth(null, day('2026-09-15'))).toBe(false);
  });
});

describe('availability', () => {
  it('available for an active, valid, non-birthday benefit', () => {
    expect(availability(active, 9, day('2026-10-06'))).toBe('available');
  });
  it('birthday_locked outside the birth month', () => {
    expect(availability({ ...active, timing: 'birthday_month' }, 9, day('2026-10-06'))).toBe('birthday_locked');
    expect(availability({ ...active, timing: 'birthday_month' }, 10, day('2026-10-06'))).toBe('available');
  });
  it('unavailable when expired or not active', () => {
    expect(availability({ ...active, valid_until: '2026-10-05' }, 9, day('2026-10-06'))).toBe('unavailable');
    expect(availability({ ...active, status: 'not_seen' }, 9, day('2026-10-06'))).toBe('unavailable');
  });
});

describe('isOutdated', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  it('flags benefits unverified for more than 60 days', () => {
    expect(isOutdated('2026-08-06T11:00:00Z', now)).toBe(true); // 61 days
    expect(isOutdated('2026-08-08T12:00:00Z', now)).toBe(false); // 59 days
  });
});

describe('monthNameHe', () => {
  it('returns Hebrew month names', () => {
    expect(monthNameHe(3)).toBe('מרץ');
    expect(monthNameHe(9)).toBe('ספטמבר');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/core/dates.test.ts`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 3: Implement**

Create `src/lib/core/dates.ts`:
```ts
import type { Benefit } from './types';

const TZ = 'Asia/Jerusalem';
const DAY_MS = 86_400_000;

export interface IsraelDay {
  iso: string; // YYYY-MM-DD
  year: number;
  month: number; // 1-12
}

export function israelToday(now: Date = new Date()): IsraelDay {
  const iso = now.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA formats as YYYY-MM-DD
  return { iso, year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Both bounds inclusive; a missing bound is open. ISO date strings compare correctly as text. */
export function isWithinValidity(
  b: { valid_from: string | null; valid_until: string | null },
  todayIso: string,
): boolean {
  return (!b.valid_from || b.valid_from <= todayIso) && (!b.valid_until || todayIso <= b.valid_until);
}

export function isBirthdayMonth(birthMonth: number | null | undefined, today: IsraelDay): boolean {
  return birthMonth === today.month;
}

export type Availability = 'available' | 'birthday_locked' | 'unavailable';

export function availability(
  b: Pick<Benefit, 'status' | 'timing' | 'valid_from' | 'valid_until'>,
  birthMonth: number | null,
  today: IsraelDay,
): Availability {
  if (b.status !== 'active' || !isWithinValidity(b, today.iso)) return 'unavailable';
  if (b.timing === 'birthday_month' && !isBirthdayMonth(birthMonth, today)) return 'birthday_locked';
  return 'available';
}

export function isOutdated(lastVerifiedAt: string, now: Date): boolean {
  return now.getTime() - new Date(lastVerifiedAt).getTime() > 60 * DAY_MS;
}

export function monthNameHe(month: number): string {
  return new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/core/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/dates.ts src/lib/core/dates.test.ts
git commit -m "feat: Israel-time dates, validity and birthday-month rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ₪ savings calculation

**Files:**
- Create: `src/lib/core/savings.ts`
- Test: `src/lib/core/savings.test.ts`

**Interfaces:**
- Consumes: `Benefit` from Task 1
- Produces:
  - `interface Savings { saved: number; spendMore: number; potential: number }` — `spendMore > 0` means the minimum spend is not reached; `potential` is what you'd save at the minimum spend.
  - `computeSavings(b: Pick<Benefit,'type'|'value'|'min_spend'|'max_discount'>, amount: number): Savings` — only meaningful for `COMPUTABLE_TYPES`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/core/savings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeSavings } from './savings';

const b = (type: 'percent_off' | 'fixed_off' | 'cashback_percent', value: number | null, min_spend: number | null = null, max_discount: number | null = null) =>
  ({ type, value, min_spend, max_discount });

describe('computeSavings', () => {
  it('percent off', () => {
    expect(computeSavings(b('percent_off', 10), 200)).toEqual({ saved: 20, spendMore: 0, potential: 20 });
  });
  it('percent off with a maximum discount', () => {
    expect(computeSavings(b('percent_off', 10, null, 15), 200).saved).toBe(15);
  });
  it('fixed off below the minimum spend reports how much more to spend', () => {
    expect(computeSavings(b('fixed_off', 50, 300), 250)).toEqual({ saved: 0, spendMore: 50, potential: 50 });
  });
  it('fixed off exactly at the minimum spend applies', () => {
    expect(computeSavings(b('fixed_off', 50, 300), 300).saved).toBe(50);
  });
  it('a fixed discount larger than the purchase saves only the purchase amount', () => {
    expect(computeSavings(b('fixed_off', 50), 30).saved).toBe(30);
  });
  it('cashback percent rounds to agorot', () => {
    expect(computeSavings(b('cashback_percent', 3), 99.99).saved).toBe(3);
  });
  it('potential below the minimum respects the cap', () => {
    expect(computeSavings(b('percent_off', 20, 100, 30), 80)).toEqual({ saved: 0, spendMore: 20, potential: 20 });
  });
  it('missing value saves nothing', () => {
    expect(computeSavings(b('percent_off', null), 100).saved).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/core/savings.test.ts`
Expected: FAIL — cannot resolve `./savings`.

- [ ] **Step 3: Implement**

Create `src/lib/core/savings.ts`:
```ts
import type { Benefit } from './types';

export interface Savings {
  saved: number;
  spendMore: number; // > 0 when the minimum spend is not reached
  potential: number; // saving once the minimum spend is reached
}

type Priced = Pick<Benefit, 'type' | 'value' | 'min_spend' | 'max_discount'>;

const round = (n: number) => Math.round(n * 100) / 100;

function rawSaving(b: Priced, amount: number): number {
  const v = b.value ?? 0;
  const raw = b.type === 'fixed_off' ? v : (amount * v) / 100;
  return Math.min(raw, b.max_discount ?? Infinity, amount);
}

export function computeSavings(b: Priced, amount: number): Savings {
  const min = b.min_spend ?? 0;
  if (amount < min) {
    return { saved: 0, spendMore: round(min - amount), potential: round(rawSaving(b, min)) };
  }
  const saved = round(rawSaving(b, amount));
  return { saved, spendMore: 0, potential: saved };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/core/savings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/savings.ts src/lib/core/savings.test.ts
git commit -m "feat: shekel savings calculation with minimum spend and caps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ranking — which card at this store

**Files:**
- Create: `src/lib/core/rank.ts`
- Test: `src/lib/core/rank.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `COMPUTABLE_TYPES`; Task 2 `availability`, `IsraelDay`; Task 3 `computeSavings`, `Savings`
- Produces:
  - `interface Row { benefit: Benefit; program: Program; items: WalletItem[]; savings: Savings | null; birthdayLocked: boolean }`
  - `interface RankResult { pay: Row[]; other: Row[]; show: Row[] }` — `pay`: computable, pay-with-card; `other`: non-computable pay-with-card; `show`: membership or coupon benefits.
  - `appliesToStore(b: Benefit, store: Store): boolean`
  - `eligibleItems(b: Benefit, wallet: WalletItem[]): WalletItem[]`
  - `rankForStore(snapshot: Snapshot, store: Store, amount: number | null, today: IsraelDay, channel?: 'in_store' | 'online'): RankResult`
  - `birthdayBenefits(snapshot: Snapshot, today: IsraelDay): Benefit[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/core/rank.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { birthdayBenefits, rankForStore } from './rank';
import type { Benefit, Program, Snapshot, Store, WalletItem } from './types';

const day = (iso: string) => ({ iso, year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
const OCT = day('2026-10-06');
const SEP = day('2026-09-15');

const program = (id: string, kind: Program['kind']): Program => ({
  id, name: id, kind, logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never',
});
const item = (id: string, type: WalletItem['type'], program_ids: string[]): WalletItem => ({
  id, name: id, type, last4: null, nickname: null, color: null, program_ids, created_at: '2026-01-01T00:00:00Z',
});
let n = 0;
const benefit = (o: Partial<Benefit>): Benefit => ({
  id: `b${++n}`, program_id: 'cal', store_id: 'mango', category: null, title: 't', description: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'pay_with_card',
  coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '2026-10-01T00:00:00Z', status: 'active', created_at: '2026-10-01T00:00:00Z',
  ...o,
});

const mango: Store = { id: 'mango', name_he: 'מנגו', name_en: 'Mango', aliases: [], category: 'fashion', channel: 'both' };

const b1 = benefit({ id: 'hever10', program_id: 'hever', value: 10 });
const b2 = benefit({ id: 'calFixed', store_id: null, category: 'fashion', type: 'fixed_off', value: 50, min_spend: 300 });
const b3 = benefit({ id: 'isracard30', program_id: 'isracard', value: 30 });
const b4 = benefit({ id: 'heverBogo', program_id: 'hever', type: 'bogo', value: null });
const b5 = benefit({ id: 'heverCode', program_id: 'hever', value: 5, requires: 'coupon_code', coupon_code: 'X1' });
const b6 = benefit({ id: 'calBirthday', value: 15, timing: 'birthday_month' });
const b7 = benefit({ id: 'calExpired', value: 50, valid_until: '2026-10-05' });
const b8 = benefit({ id: 'heverGeneral', program_id: 'hever', store_id: null, type: 'cashback_percent', value: 2 });
const b9 = benefit({ id: 'rebarCard', program_id: 'rebar', value: 20 }); // needs a rebar CARD; I only have membership
const b10 = benefit({ id: 'otherStore', store_id: 'castro', value: 40 });

const snapshot: Snapshot = {
  profile: { user_id: 'u', birth_month: 9, email_reminders: true, last_reminder_year: null },
  programs: [program('cal', 'card_issuer'), program('hever', 'club'), program('isracard', 'card_issuer'), program('rebar', 'store_club')],
  wallet: [item('calHeverCard', 'card', ['cal', 'hever']), item('rebarClub', 'membership', ['rebar'])],
  stores: [mango],
  benefits: [b1, b2, b3, b4, b5, b6, b7, b8, b9, b10],
  fetchedAt: '',
};
const ids = (rows: { benefit: Benefit }[]) => rows.map((r) => r.benefit.id);

describe('rankForStore', () => {
  it('sorts pay-with-card benefits by shekels saved, birthday-locked last', () => {
    const r = rankForStore(snapshot, mango, 400, OCT);
    expect(ids(r.pay)).toEqual(['calFixed', 'hever10', 'heverGeneral', 'calBirthday']);
    expect(r.pay[0].savings?.saved).toBe(50);
    expect(r.pay[3].birthdayLocked).toBe(true);
  });
  it('puts non-computable benefits in other and membership/coupon benefits in show', () => {
    const r = rankForStore(snapshot, mango, 400, OCT);
    expect(ids(r.other)).toEqual(['heverBogo']);
    expect(ids(r.show)).toEqual(['heverCode']);
    expect(r.show[0].savings?.saved).toBe(20);
  });
  it('excludes programs I do not hold, expired benefits, other stores and card benefits I have only a membership for', () => {
    const all = Object.values(rankForStore(snapshot, mango, 400, OCT)).flat().map((r) => r.benefit.id);
    expect(all).not.toContain('isracard30');
    expect(all).not.toContain('calExpired');
    expect(all).not.toContain('otherStore');
    expect(all).not.toContain('rebarCard');
  });
  it('without an amount sorts percent benefits by value, then fixed', () => {
    const r = rankForStore(snapshot, mango, null, OCT);
    expect(ids(r.pay)).toEqual(['hever10', 'heverGeneral', 'calFixed', 'calBirthday']);
    expect(r.pay[0].savings).toBeNull();
  });
  it('below the minimum spend the fixed benefit drops below the ones that apply', () => {
    const r = rankForStore(snapshot, mango, 250, OCT);
    expect(ids(r.pay)).toEqual(['hever10', 'heverGeneral', 'calFixed', 'calBirthday']);
    expect(r.pay[2].savings?.spendMore).toBe(50);
  });
  it('in the birth month the birthday benefit competes normally', () => {
    const r = rankForStore(snapshot, mango, 400, SEP);
    expect(ids(r.pay)[0]).toBe('calBirthday'); // 15% of 400 = 60
    expect(r.pay[0].birthdayLocked).toBe(false);
  });
  it('filters by channel', () => {
    const online = benefit({ id: 'onlineOnly', value: 90, channel: 'online' });
    const s = { ...snapshot, benefits: [online] };
    expect(ids(rankForStore(s, mango, 100, OCT, 'in_store').pay)).toEqual([]);
    expect(ids(rankForStore(s, mango, 100, OCT, 'online').pay)).toEqual(['onlineOnly']);
  });
  it('lists every wallet item that can be used', () => {
    const s = { ...snapshot, wallet: [...snapshot.wallet, item('secondCal', 'card', ['cal'])] };
    const row = rankForStore(s, mango, 400, OCT).pay.find((r) => r.benefit.id === 'calFixed');
    expect(row?.items.map((i) => i.id)).toEqual(['calHeverCard', 'secondCal']);
  });
});

describe('birthdayBenefits', () => {
  it('returns usable birthday benefits only in the birth month', () => {
    expect(birthdayBenefits(snapshot, SEP).map((b) => b.id)).toEqual(['calBirthday']);
    expect(birthdayBenefits(snapshot, OCT)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/core/rank.test.ts`
Expected: FAIL — cannot resolve `./rank`.

- [ ] **Step 3: Implement**

Create `src/lib/core/rank.ts`:
```ts
import { availability, type IsraelDay } from './dates';
import { computeSavings, type Savings } from './savings';
import { COMPUTABLE_TYPES, type Benefit, type Program, type Snapshot, type Store, type WalletItem } from './types';

export interface Row {
  benefit: Benefit;
  program: Program;
  items: WalletItem[]; // wallet items to pay with / show
  savings: Savings | null; // null when not computable or no amount entered
  birthdayLocked: boolean;
}

export interface RankResult {
  pay: Row[]; // pay with card, ₪ computable
  other: Row[]; // pay with card, not computable (1+1, gift, installments, points…)
  show: Row[]; // show membership / enter coupon code
}

export function appliesToStore(b: Benefit, store: Store): boolean {
  if (b.store_id) return b.store_id === store.id;
  if (b.category) return b.category === store.category;
  return true; // general benefit
}

export function eligibleItems(b: Benefit, wallet: WalletItem[]): WalletItem[] {
  return wallet.filter(
    (w) => w.program_ids.includes(b.program_id) && (b.requires !== 'pay_with_card' || w.type === 'card'),
  );
}

const OTHER_ORDER = ['bogo', 'gift', 'installments', 'points', 'other'];

/** [group, value]: percent types first by value, then fixed by value, then the rest grouped by type. */
function headline(b: Benefit): [number, number] {
  if (b.type === 'percent_off' || b.type === 'cashback_percent') return [0, b.value ?? 0];
  if (b.type === 'fixed_off') return [1, b.value ?? 0];
  return [2 + OTHER_ORDER.indexOf(b.type), 0];
}

function compareRows(a: Row, b: Row): number {
  if (a.birthdayLocked !== b.birthdayLocked) return a.birthdayLocked ? 1 : -1;
  if (a.savings && b.savings) {
    return b.savings.saved - a.savings.saved || (a.benefit.min_spend ?? 0) - (b.benefit.min_spend ?? 0);
  }
  if (a.savings || b.savings) return a.savings ? -1 : 1;
  const [ga, va] = headline(a.benefit);
  const [gb, vb] = headline(b.benefit);
  return ga - gb || vb - va;
}

export function rankForStore(
  snapshot: Snapshot,
  store: Store,
  amount: number | null,
  today: IsraelDay,
  channel?: 'in_store' | 'online',
): RankResult {
  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));
  const birthMonth = snapshot.profile?.birth_month ?? null;
  const result: RankResult = { pay: [], other: [], show: [] };

  for (const benefit of snapshot.benefits) {
    if (!appliesToStore(benefit, store)) continue;
    if (channel && benefit.channel !== 'both' && benefit.channel !== channel) continue;
    const avail = availability(benefit, birthMonth, today);
    if (avail === 'unavailable') continue;
    const program = programs.get(benefit.program_id);
    if (!program) continue;
    const items = eligibleItems(benefit, snapshot.wallet);
    if (items.length === 0) continue;

    const computable = COMPUTABLE_TYPES.includes(benefit.type);
    const row: Row = {
      benefit,
      program,
      items,
      savings: computable && amount != null && amount > 0 ? computeSavings(benefit, amount) : null,
      birthdayLocked: avail === 'birthday_locked',
    };
    if (benefit.requires !== 'pay_with_card') result.show.push(row);
    else if (computable) result.pay.push(row);
    else result.other.push(row);
  }

  result.pay.sort(compareRows);
  result.other.sort(compareRows);
  result.show.sort(compareRows);
  return result;
}

export function birthdayBenefits(snapshot: Snapshot, today: IsraelDay): Benefit[] {
  const birthMonth = snapshot.profile?.birth_month ?? null;
  return snapshot.benefits.filter(
    (b) =>
      b.timing === 'birthday_month' &&
      availability(b, birthMonth, today) === 'available' &&
      eligibleItems(b, snapshot.wallet).length > 0,
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/core/rank.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/rank.ts src/lib/core/rank.test.ts
git commit -m "feat: rank benefits per store into pay / other / show groups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browse filters

**Files:**
- Create: `src/lib/core/browse.ts`
- Test: `src/lib/core/browse.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `normalize`; Task 2 `availability`, `addDays`, `IsraelDay`; Task 4 `eligibleItems`
- Produces:
  - `interface BrowseFilters { q: string; programId: string | null; walletItemId: string | null; category: Category | null; type: BenefitType | null; channel: 'in_store' | 'online' | null; birthday: boolean; expiringThisWeek: boolean; recent: boolean; onlyMine: boolean }`
  - `EMPTY_FILTERS: BrowseFilters` (onlyMine = true, everything else empty/false)
  - `interface BrowseRow { benefit: Benefit; program: Program; store: Store | null; items: WalletItem[]; birthdayLocked: boolean }`
  - `browseBenefits(snapshot: Snapshot, f: BrowseFilters, today: IsraelDay, now: Date): BrowseRow[]` — newest first.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/core/browse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { browseBenefits, EMPTY_FILTERS } from './browse';
import type { Benefit, Snapshot } from './types';

const today = { iso: '2026-10-06', year: 2026, month: 10 };
const now = new Date('2026-10-06T12:00:00Z');
let n = 0;
const benefit = (o: Partial<Benefit>): Benefit => ({
  id: `b${++n}`, program_id: 'cal', store_id: 'mango', category: null, title: 'הנחה', description: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'pay_with_card',
  coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '2026-10-01T00:00:00Z', status: 'active', created_at: '2026-01-01T00:00:00Z',
  ...o,
});

const snapshot: Snapshot = {
  profile: { user_id: 'u', birth_month: 3, email_reminders: true, last_reminder_year: null },
  programs: [
    { id: 'cal', name: 'כאל', kind: 'card_issuer', logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never' },
    { id: 'max', name: 'מקס', kind: 'card_issuer', logo_url: null, benefits_url: null, last_refreshed_at: null, last_refresh_status: 'never' },
  ],
  wallet: [{ id: 'w1', name: 'כאל', type: 'card', last4: null, nickname: null, color: null, program_ids: ['cal'], created_at: '' }],
  stores: [
    { id: 'mango', name_he: 'מנגו', name_en: 'Mango', aliases: [], category: 'fashion', channel: 'both' },
    { id: 'mcd', name_he: 'מקדונלדס', name_en: "McDonald's", aliases: [], category: 'restaurants', channel: 'both' },
  ],
  benefits: [
    benefit({ id: 'mango10' }),
    benefit({ id: 'mcdBogo', store_id: 'mcd', type: 'bogo', value: null, created_at: '2026-10-01T00:00:00Z' }),
    benefit({ id: 'maxOnly', program_id: 'max' }),
    benefit({ id: 'bday', timing: 'birthday_month' }),
    benefit({ id: 'expiring', valid_until: '2026-10-12' }),
    benefit({ id: 'expired', valid_until: '2026-10-01' }),
  ],
  fetchedAt: '',
};
const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
  browseBenefits(snapshot, { ...EMPTY_FILTERS, ...f }, today, now).map((r) => r.benefit.id);

describe('browseBenefits', () => {
  it('by default shows only what my wallet unlocks, never expired, newest first', () => {
    expect(ids({})).toEqual(['mcdBogo', 'mango10', 'bday', 'expiring']);
  });
  it('can show everything', () => {
    expect(ids({ onlyMine: false })).toContain('maxOnly');
  });
  it('searches store names in Hebrew and English', () => {
    expect(ids({ q: 'mcdonalds' })).toEqual(['mcdBogo']);
    expect(ids({ q: 'מקדונלד׳ס' })).toEqual(['mcdBogo']);
  });
  it('filters by category, type, birthday and expiring this week', () => {
    expect(ids({ category: 'restaurants' })).toEqual(['mcdBogo']);
    expect(ids({ type: 'bogo' })).toEqual(['mcdBogo']);
    expect(ids({ birthday: true })).toEqual(['bday']);
    expect(ids({ expiringThisWeek: true })).toEqual(['expiring']);
  });
  it('filters recently added (14 days)', () => {
    expect(ids({ recent: true })).toEqual(['mcdBogo']);
  });
  it('marks birthday benefits outside the birth month as locked', () => {
    const row = browseBenefits(snapshot, EMPTY_FILTERS, today, now).find((r) => r.benefit.id === 'bday');
    expect(row?.birthdayLocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/core/browse.test.ts`
Expected: FAIL — cannot resolve `./browse`.

- [ ] **Step 3: Implement**

Create `src/lib/core/browse.ts`:
```ts
import { addDays, availability, type IsraelDay } from './dates';
import { normalize } from './normalize';
import { eligibleItems } from './rank';
import type { Benefit, BenefitType, Category, Program, Snapshot, Store, WalletItem } from './types';

export interface BrowseFilters {
  q: string;
  programId: string | null;
  walletItemId: string | null;
  category: Category | null;
  type: BenefitType | null;
  channel: 'in_store' | 'online' | null;
  birthday: boolean;
  expiringThisWeek: boolean;
  recent: boolean;
  onlyMine: boolean;
}

export const EMPTY_FILTERS: BrowseFilters = {
  q: '', programId: null, walletItemId: null, category: null, type: null, channel: null,
  birthday: false, expiringThisWeek: false, recent: false, onlyMine: true,
};

export interface BrowseRow {
  benefit: Benefit;
  program: Program;
  store: Store | null;
  items: WalletItem[];
  birthdayLocked: boolean;
}

const RECENT_MS = 14 * 86_400_000;

export function browseBenefits(snapshot: Snapshot, f: BrowseFilters, today: IsraelDay, now: Date): BrowseRow[] {
  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));
  const stores = new Map(snapshot.stores.map((s) => [s.id, s]));
  const birthMonth = snapshot.profile?.birth_month ?? null;
  const q = normalize(f.q);
  const weekEnd = addDays(today.iso, 7);
  const rows: BrowseRow[] = [];

  for (const b of snapshot.benefits) {
    const avail = availability(b, birthMonth, today);
    if (avail === 'unavailable') continue;
    const program = programs.get(b.program_id);
    if (!program) continue;
    const store = b.store_id ? stores.get(b.store_id) ?? null : null;
    const items = eligibleItems(b, snapshot.wallet);

    if (f.onlyMine && items.length === 0) continue;
    if (f.programId && b.program_id !== f.programId) continue;
    if (f.walletItemId && !items.some((i) => i.id === f.walletItemId)) continue;
    if (f.category && (store?.category ?? b.category) !== f.category) continue;
    if (f.type && b.type !== f.type) continue;
    if (f.channel && b.channel !== 'both' && b.channel !== f.channel) continue;
    if (f.birthday && b.timing !== 'birthday_month') continue;
    if (f.expiringThisWeek && !(b.valid_until && b.valid_until <= weekEnd)) continue;
    if (f.recent && now.getTime() - new Date(b.created_at).getTime() > RECENT_MS) continue;
    if (q) {
      const texts = [b.title, program.name, store?.name_he, store?.name_en, ...(store?.aliases ?? [])];
      if (!texts.some((t) => t && normalize(t).includes(q))) continue;
    }
    rows.push({ benefit: b, program, store, items, birthdayLocked: avail === 'birthday_locked' });
  }
  return rows.sort((a, b) => b.benefit.created_at.localeCompare(a.benefit.created_at));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/core/browse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/browse.ts src/lib/core/browse.test.ts
git commit -m "feat: filters and search for the all-benefits page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Import merge rule

**Files:**
- Create: `src/lib/core/merge.ts`
- Test: `src/lib/core/merge.test.ts`

**Interfaces:**
- Consumes: `Benefit` from Task 1
- Produces:
  - `type IncomingBenefit = Omit<Benefit, 'id' | 'program_id' | 'last_verified_at' | 'status' | 'created_at'>`
  - `interface MergePlan { inserts: IncomingBenefit[]; updates: { id: string; patch: Partial<Benefit> }[]; notSeen: string[] }`
  - `benefitKey(b: Pick<Benefit,'store_id'|'category'|'type'|'value'|'timing'>): string`
  - `mergeImport(existing: Benefit[], incoming: IncomingBenefit[], opts: { isRefresh: boolean; nowIso: string }): MergePlan` — `existing` must be the benefits of the same program.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/core/merge.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mergeImport, type IncomingBenefit } from './merge';
import type { Benefit } from './types';

const NOW = '2026-10-06T10:00:00.000Z';
const incoming = (o: Partial<IncomingBenefit> = {}): IncomingBenefit => ({
  store_id: 'mango', category: null, title: '10% הנחה', description: null, type: 'percent_off', value: 10,
  min_spend: null, max_discount: null, requires: 'pay_with_card', coupon_code: null, channel: 'both',
  timing: 'always', valid_from: null, valid_until: null, conditions: null, source_url: null, ...o,
});
const existing = (id: string, o: Partial<Benefit> = {}): Benefit => ({
  ...incoming(), id, program_id: 'cal', last_verified_at: '2026-01-01T00:00:00Z', status: 'active',
  created_at: '2026-01-01T00:00:00Z', ...o,
});

describe('mergeImport', () => {
  it('inserts a new benefit', () => {
    const plan = mergeImport([], [incoming()], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toEqual([]);
  });
  it('updates a benefit with the same store, type, value and timing', () => {
    const plan = mergeImport([existing('e1')], [incoming({ title: 'כותרת חדשה' })], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([
      { id: 'e1', patch: expect.objectContaining({ title: 'כותרת חדשה', last_verified_at: NOW, status: 'active' }) },
    ]);
  });
  it('restores a not_seen benefit that appears again', () => {
    const plan = mergeImport([existing('e1', { status: 'not_seen' })], [incoming()], { isRefresh: true, nowIso: NOW });
    expect(plan.updates[0].patch.status).toBe('active');
    expect(plan.notSeen).toEqual([]);
  });
  it('treats a different value as a different benefit', () => {
    const plan = mergeImport([existing('e1')], [incoming({ value: 15 })], { isRefresh: true, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.notSeen).toEqual(['e1']);
  });
  it('ignores archived benefits', () => {
    const plan = mergeImport([existing('e1', { status: 'archived' })], [incoming()], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
  });
  it('saves a benefit listed twice on the same page once', () => {
    const plan = mergeImport([], [incoming(), incoming({ title: 'שוב' })], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
  });
  it('marks missing benefits as not seen only on a refresh', () => {
    const other = existing('e2', { store_id: 'castro' });
    expect(mergeImport([other], [incoming()], { isRefresh: true, nowIso: NOW }).notSeen).toEqual(['e2']);
    expect(mergeImport([other], [incoming()], { isRefresh: false, nowIso: NOW }).notSeen).toEqual([]);
  });
  it('is idempotent: saving the same import again creates nothing new', () => {
    const first = mergeImport([], [incoming(), incoming({ store_id: null, category: 'food', value: 5 })], { isRefresh: false, nowIso: NOW });
    const saved = first.inserts.map((b, i) => existing(`e${i}`, b));
    const second = mergeImport(saved, [incoming(), incoming({ store_id: null, category: 'food', value: 5 })], { isRefresh: false, nowIso: NOW });
    expect(second.inserts).toEqual([]);
    expect(second.updates).toHaveLength(2);
  });
  it('keeps category and general benefits apart', () => {
    const plan = mergeImport([], [incoming({ store_id: null, category: 'food' }), incoming({ store_id: null })], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/core/merge.test.ts`
Expected: FAIL — cannot resolve `./merge`.

- [ ] **Step 3: Implement**

Create `src/lib/core/merge.ts`:
```ts
import type { Benefit } from './types';

export type IncomingBenefit = Omit<Benefit, 'id' | 'program_id' | 'last_verified_at' | 'status' | 'created_at'>;

export interface MergePlan {
  inserts: IncomingBenefit[];
  updates: { id: string; patch: Partial<Benefit> }[];
  notSeen: string[]; // ids of active benefits missing from a refresh
}

/** Identity of a benefit within one program (spec §5.5). */
export function benefitKey(b: Pick<Benefit, 'store_id' | 'category' | 'type' | 'value' | 'timing'>): string {
  const scope = b.store_id ? `s:${b.store_id}` : b.category ? `c:${b.category}` : 'g';
  return [scope, b.type, b.value ?? '', b.timing].join('|');
}

export function mergeImport(
  existing: Benefit[],
  incoming: IncomingBenefit[],
  opts: { isRefresh: boolean; nowIso: string },
): MergePlan {
  const byKey = new Map<string, Benefit>();
  for (const b of existing) if (b.status !== 'archived') byKey.set(benefitKey(b), b);

  const plan: MergePlan = { inserts: [], updates: [], notSeen: [] };
  const seen = new Set<string>();
  for (const inc of incoming) {
    const key = benefitKey(inc);
    if (seen.has(key)) continue;
    seen.add(key);
    const match = byKey.get(key);
    if (match) plan.updates.push({ id: match.id, patch: { ...inc, last_verified_at: opts.nowIso, status: 'active' } });
    else plan.inserts.push(inc);
  }
  if (opts.isRefresh) {
    for (const [key, b] of byKey) if (!seen.has(key) && b.status === 'active') plan.notSeen.push(b.id);
  }
  return plan;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/core/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/merge.ts src/lib/core/merge.test.ts
git commit -m "feat: idempotent import merge with not-seen detection on refresh" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Review-row validation and Hebrew labels

**Files:**
- Create: `src/lib/core/review.ts`, `src/lib/core/labels.ts`
- Test: `src/lib/core/review.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `IncomingBenefit` from Task 6
- Produces (`review.ts`):
  - `interface NewStoreDraft { name_he: string; name_en: string; aliases: string[]; category: Category; channel: Channel }`
  - `interface ExtractedBenefit` — every `IncomingBenefit` field except `source_url`, plus `new_store_index: number | null`
  - `interface ReviewRow extends ExtractedBenefit { approved: boolean }`
  - `interface Extraction { new_stores: NewStoreDraft[]; benefits: ExtractedBenefit[] }`
  - `interface ImportRow { id: string; program_id: string; source: 'ai_link'|'ai_text'|'ai_screenshot'|'scraper'; raw_input: { url: string|null; text: string|null; paths: string[]|null }; is_refresh: boolean; extracted: Extraction | null; status: 'pending_review'|'saved'|'rejected'|'failed'; error: string|null; created_at: string }`
  - `rowProblems(row: ReviewRow, ctx: { storeIds: Set<string>; newStores: NewStoreDraft[]; todayIso: string }): string[]` — Hebrew messages; empty = OK.
  - `toIncoming(row: ReviewRow, newStoreIds: (string | undefined)[], sourceUrl: string | null): IncomingBenefit`
  - `scopeValue(row: Pick<ReviewRow,'store_id'|'new_store_index'|'category'>): string` and `scopePatch(value: string): Pick<ReviewRow,'store_id'|'new_store_index'|'category'>` — encode the store/category select (`''` general, `s:<id>`, `n:<index>`, `c:<category>`).
- Produces (`labels.ts`): `TYPE_LABELS`, `CATEGORY_LABELS`, `KIND_LABELS`, `REQUIRES_LABELS`, `CHANNEL_LABELS`, `TIMING_LABELS`, `IMPORT_ERRORS`, `shekel(n: number): string`, `formatDate(iso: string): string`, `headlineText(b: Pick<Benefit,'type'|'value'>): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/core/review.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rowProblems, scopePatch, scopeValue, toIncoming, type ReviewRow } from './review';

const row = (o: Partial<ReviewRow> = {}): ReviewRow => ({
  approved: true, title: '10% הנחה', description: null, store_id: 'mango', new_store_index: null, category: null,
  type: 'percent_off', value: 10, min_spend: null, max_discount: null, requires: 'pay_with_card', coupon_code: null,
  channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null, ...o,
});
const ctx = {
  storeIds: new Set(['mango']),
  newStores: [{ name_he: 'קסטרו', name_en: 'Castro', aliases: [], category: 'fashion' as const, channel: 'both' as const }],
  todayIso: '2026-10-06',
};

describe('rowProblems', () => {
  it('accepts a valid row', () => {
    expect(rowProblems(row(), ctx)).toEqual([]);
  });
  it('rejects an unknown store and a missing title', () => {
    expect(rowProblems(row({ store_id: 'gone', title: ' ' }), ctx)).toEqual(['חסרה כותרת', 'חנות לא מוכרת']);
  });
  it('requires both names on a new store', () => {
    const noEnglish = { ...ctx, newStores: [{ ...ctx.newStores[0], name_en: '' }] };
    expect(rowProblems(row({ store_id: null, new_store_index: 0 }), noEnglish)).toContain('לחנות חדשה חסר שם בעברית או באנגלית');
    expect(rowProblems(row({ store_id: null, new_store_index: 0 }), ctx)).toEqual([]);
  });
  it('rejects more than one scope', () => {
    expect(rowProblems(row({ category: 'food' }), ctx)).toContain('יש לבחור חנות או קטגוריה, לא את שתיהן');
  });
  it('checks percent and fixed values', () => {
    expect(rowProblems(row({ value: 120 }), ctx)).toContain('אחוז חייב להיות בין 0 ל-100');
    expect(rowProblems(row({ type: 'fixed_off', value: null }), ctx)).toContain('חסר סכום ההנחה');
    expect(rowProblems(row({ type: 'bogo', value: null }), ctx)).toEqual([]);
  });
  it('checks dates', () => {
    expect(rowProblems(row({ valid_until: '31.12.2026' }), ctx)).toContain('תאריך לא תקין');
    expect(rowProblems(row({ valid_from: '2026-12-01', valid_until: '2026-11-01' }), ctx)).toContain('תאריך הסיום לפני תאריך ההתחלה');
    expect(rowProblems(row({ valid_until: '2026-10-05' }), ctx)).toContain('ההטבה כבר פגה');
    expect(rowProblems(row({ valid_until: '2026-10-06' }), ctx)).toEqual([]);
  });
});

describe('toIncoming', () => {
  it('resolves a new store index to the saved store id and drops review-only fields', () => {
    const inc = toIncoming(row({ store_id: null, new_store_index: 0, title: ' כותרת ' }), ['new-id'], 'https://x');
    expect(inc.store_id).toBe('new-id');
    expect(inc.title).toBe('כותרת');
    expect(inc.source_url).toBe('https://x');
    expect(inc).not.toHaveProperty('approved');
    expect(inc).not.toHaveProperty('new_store_index');
  });
});

describe('scope select encoding', () => {
  it('round-trips', () => {
    for (const v of ['', 's:mango', 'n:2', 'c:food']) expect(scopeValue(scopePatch(v))).toBe(v);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/core/review.test.ts`
Expected: FAIL — cannot resolve `./review`.

- [ ] **Step 3: Implement `review.ts`**

Create `src/lib/core/review.ts`:
```ts
import type { IncomingBenefit } from './merge';
import type { Category, Channel } from './types';

export interface NewStoreDraft {
  name_he: string;
  name_en: string;
  aliases: string[];
  category: Category;
  channel: Channel;
}

export interface ExtractedBenefit extends Omit<IncomingBenefit, 'source_url'> {
  new_store_index: number | null;
}

export interface ReviewRow extends ExtractedBenefit {
  approved: boolean;
}

export interface Extraction {
  new_stores: NewStoreDraft[];
  benefits: ExtractedBenefit[];
}

export interface ImportRow {
  id: string;
  program_id: string;
  source: 'ai_link' | 'ai_text' | 'ai_screenshot' | 'scraper';
  raw_input: { url: string | null; text: string | null; paths: string[] | null };
  is_refresh: boolean;
  extracted: Extraction | null;
  status: 'pending_review' | 'saved' | 'rejected' | 'failed';
  error: string | null;
  created_at: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function rowProblems(
  row: ReviewRow,
  ctx: { storeIds: Set<string>; newStores: NewStoreDraft[]; todayIso: string },
): string[] {
  const p: string[] = [];
  if (!row.title.trim()) p.push('חסרה כותרת');
  if (row.store_id && !ctx.storeIds.has(row.store_id)) p.push('חנות לא מוכרת');
  if (row.new_store_index != null) {
    const s = ctx.newStores[row.new_store_index];
    if (!s) p.push('חנות לא מוכרת');
    else if (!s.name_he.trim() || !s.name_en.trim()) p.push('לחנות חדשה חסר שם בעברית או באנגלית');
  }
  const scopes = [row.store_id != null, row.new_store_index != null, row.category != null].filter(Boolean).length;
  if (scopes > 1) p.push('יש לבחור חנות או קטגוריה, לא את שתיהן');
  if (row.type === 'percent_off' || row.type === 'cashback_percent') {
    if (row.value == null || row.value <= 0 || row.value > 100) p.push('אחוז חייב להיות בין 0 ל-100');
  }
  if (row.type === 'fixed_off' && (row.value == null || row.value <= 0)) p.push('חסר סכום ההנחה');
  const dates = [row.valid_from, row.valid_until].filter((d): d is string => !!d);
  if (dates.some((d) => !DATE_RE.test(d))) p.push('תאריך לא תקין');
  else {
    if (row.valid_from && row.valid_until && row.valid_from > row.valid_until) p.push('תאריך הסיום לפני תאריך ההתחלה');
    if (row.valid_until && row.valid_until < ctx.todayIso) p.push('ההטבה כבר פגה');
  }
  return p;
}

export function toIncoming(
  row: ReviewRow,
  newStoreIds: (string | undefined)[],
  sourceUrl: string | null,
): IncomingBenefit {
  const { approved: _approved, new_store_index, ...rest } = row;
  return {
    ...rest,
    title: row.title.trim(),
    store_id: row.store_id ?? (new_store_index != null ? newStoreIds[new_store_index] ?? null : null),
    source_url: sourceUrl,
  };
}

type Scope = Pick<ReviewRow, 'store_id' | 'new_store_index' | 'category'>;

export function scopeValue(r: Scope): string {
  if (r.store_id) return `s:${r.store_id}`;
  if (r.new_store_index != null) return `n:${r.new_store_index}`;
  if (r.category) return `c:${r.category}`;
  return '';
}

export function scopePatch(value: string): Scope {
  const kind = value.slice(0, 1);
  const rest = value.slice(2);
  return {
    store_id: kind === 's' ? rest : null,
    new_store_index: kind === 'n' ? Number(rest) : null,
    category: kind === 'c' ? (rest as Category) : null,
  };
}
```

- [ ] **Step 4: Create `labels.ts`**

Create `src/lib/core/labels.ts`:
```ts
import type { Benefit, BenefitType, Category, Channel, ProgramKind, Requires, Timing } from './types';

export const TYPE_LABELS: Record<BenefitType, string> = {
  percent_off: 'הנחה באחוזים', fixed_off: 'הנחה בשקלים', cashback_percent: 'החזר כספי', points: 'נקודות',
  bogo: '1+1 / מבצע', gift: 'מתנה', installments: 'תשלומים', other: 'אחר',
};
export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'מזון', fuel: 'דלק', fashion: 'אופנה', electronics: 'אלקטרוניקה', home: 'בית',
  pharmacy_beauty: 'פארם ויופי', restaurants: 'מסעדות', entertainment: 'בילוי ופנאי', travel: 'תיירות',
  online: 'אונליין', other: 'אחר',
};
export const KIND_LABELS: Record<ProgramKind, string> = {
  card_issuer: 'חברות אשראי', club: 'מועדונים', store_club: 'מועדוני לקוחות של חנויות',
};
export const REQUIRES_LABELS: Record<Requires, string> = {
  pay_with_card: 'תשלום בכרטיס', membership: 'הצגת חברות', coupon_code: 'קוד קופון',
};
export const CHANNEL_LABELS: Record<Channel, string> = { in_store: 'בחנות', online: 'אונליין', both: 'בחנות ואונליין' };
export const TIMING_LABELS: Record<Timing, string> = { always: 'תמיד', birthday_month: 'חודש יום ההולדת' };

export const IMPORT_ERRORS: Record<string, string> = {
  unreadable: 'לא הצלחנו לקרוא את הדף. הדביקו את הטקסט או העלו צילום מסך.',
  too_long: 'התוכן ארוך מדי. ייבאו חלק מהדף בכל פעם.',
  refused: 'לא ניתן לעבד את התוכן הזה.',
  invalid_output: 'החילוץ נכשל. נסו שוב, ואם הדף ארוך — ייבאו חלק ממנו בכל פעם.',
  empty: 'אין תוכן לייבוא.',
  bad_screenshots: 'בחרו 1–5 צילומי מסך (PNG, JPG או WEBP).',
  program_not_found: 'התוכנית לא נמצאה.',
  default: 'הייבוא נכשל. נסו שוב.',
};

export function shekel(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

/** 2026-12-31 → 31.12.2026 */
export function formatDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('.');
}

export function headlineText(b: Pick<Benefit, 'type' | 'value'>): string {
  if (b.type === 'percent_off' && b.value != null) return `${b.value}% הנחה`;
  if (b.type === 'fixed_off' && b.value != null) return `${shekel(b.value)} הנחה`;
  if (b.type === 'cashback_percent' && b.value != null) return `${b.value}% החזר`;
  return TYPE_LABELS[b.type];
}
```

- [ ] **Step 5: Run all unit tests**

Run: `npm test`
Expected: PASS — all files from Tasks 1–7.

- [ ] **Step 6: Commit**

```bash
git add src/lib/core/review.ts src/lib/core/review.test.ts src/lib/core/labels.ts
git commit -m "feat: review-row validation and Hebrew labels" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Prerequisites (you do these once, before Task 8)

These need your own accounts and browser, so they can't be automated. Values go into `benefits-finder/.env.local` (never committed; `create-next-app` already ignores `.env*`).

1. **Supabase project:** at supabase.com create a project (region: Frankfurt `eu-central-1`, the closest to Israel). From *Project Settings → API keys* copy the project URL, the **publishable** key and a **secret** key.
2. **Close sign-ups:** *Authentication → Sign In / Providers* → turn off "Allow new users to sign up". Then *Authentication → Users → Add user → Create new user* with your email and "Auto confirm user" ticked.
3. **Login email with a code:** *Authentication → Emails → Magic Link* template. Replace the body with:
   ```html
   <h2>הקוד שלך: {{ .Token }}</h2>
   <p>או <a href="{{ .ConfirmationURL }}">היכנסו בלחיצה</a></p>
   ```
4. **Redirect URLs:** *Authentication → URL Configuration*: Site URL `http://localhost:3000`; add redirect URL `http://localhost:3000/auth/callback`. (Production URLs are added in Task 20.)
5. **Anthropic API key:** console.anthropic.com → API keys → create.
6. **Resend:** sign up at resend.com **with the email address that should receive the birthday reminder** (the free sender `onboarding@resend.dev` can only send to the account owner), then create an API key.
7. **Cron secret:** run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and keep the output.

Create `benefits-finder/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
RESEND_FROM=onboarding@resend.dev
CRON_SECRET=<the hex string>
APP_URL=http://localhost:3000
E2E_EMAIL=e2e-test@example.com
```

---
### Task 8: Database schema, RLS and storage bucket

**Files:**
- Create: `supabase/migrations/20261006000000_init.sql`, `.env.example`

**Interfaces:**
- Consumes: enum value lists from Task 1 (`types.ts`) — the SQL `check` lists must match them exactly.
- Produces: tables `profile`, `programs`, `wallet_items`, `stores`, `benefits`, `imports` with the columns of the Task 1 / Task 7 interfaces; every row has `user_id uuid default auth.uid()`; private storage bucket `imports` where files live under `<user_id>/…`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261006000000_init.sql`:
```sql
-- Benefits Finder initial schema. Every table is private to its owner (RLS at the bottom).

create table profile (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  birth_month int not null check (birth_month between 1 and 12),
  email_reminders boolean not null default true,
  last_reminder_year int,
  created_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (btrim(name) <> ''),
  kind text not null check (kind in ('card_issuer', 'club', 'store_club')),
  logo_url text,
  benefits_url text,
  last_refreshed_at timestamptz,
  last_refresh_status text not null default 'never' check (last_refresh_status in ('ok', 'failed', 'never')),
  created_at timestamptz not null default now()
);

create table wallet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('card', 'membership')),
  last4 text check (last4 ~ '^[0-9]{4}$'), -- never a full card number
  nickname text,
  color text,
  program_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name_he text not null check (btrim(name_he) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  aliases text[] not null default '{}',
  category text not null check (category in ('food', 'fuel', 'fashion', 'electronics', 'home', 'pharmacy_beauty',
    'restaurants', 'entertainment', 'travel', 'online', 'other')),
  channel text not null default 'both' check (channel in ('in_store', 'online', 'both')),
  created_at timestamptz not null default now()
);

create table benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  program_id uuid not null references programs on delete cascade,
  store_id uuid references stores on delete cascade,
  category text check (category in ('food', 'fuel', 'fashion', 'electronics', 'home', 'pharmacy_beauty',
    'restaurants', 'entertainment', 'travel', 'online', 'other')),
  title text not null check (btrim(title) <> ''),
  description text,
  type text not null check (type in ('percent_off', 'fixed_off', 'cashback_percent', 'points', 'bogo', 'gift',
    'installments', 'other')),
  value numeric,
  min_spend numeric,
  max_discount numeric,
  requires text not null check (requires in ('pay_with_card', 'membership', 'coupon_code')),
  coupon_code text,
  channel text not null default 'both' check (channel in ('in_store', 'online', 'both')),
  timing text not null default 'always' check (timing in ('always', 'birthday_month')),
  valid_from date,
  valid_until date,
  conditions text,
  source_url text,
  last_verified_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'not_seen', 'archived')),
  created_at timestamptz not null default now(),
  check (store_id is null or category is null)
);
create index benefits_program_idx on benefits (program_id);
create index benefits_store_idx on benefits (store_id);

create table imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  program_id uuid not null references programs on delete cascade,
  source text not null check (source in ('ai_link', 'ai_text', 'ai_screenshot', 'scraper')),
  raw_input jsonb not null,
  is_refresh boolean not null default false,
  extracted jsonb,
  status text not null default 'pending_review' check (status in ('pending_review', 'saved', 'rejected', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

-- Row Level Security: each row is visible and writable only by its owner.
grant select, insert, update, delete on profile, programs, wallet_items, stores, benefits, imports
  to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['profile', 'programs', 'wallet_items', 'stores', 'benefits', 'imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Private bucket for import screenshots; files live under "<user_id>/...".
insert into storage.buckets (id, name, public) values ('imports', 'imports', false);
create policy "own import files" on storage.objects for all to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

- [ ] **Step 2: Write `.env.example`**

Create `.env.example` (names only, no values):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
RESEND_FROM=onboarding@resend.dev
CRON_SECRET=
APP_URL=http://localhost:3000
E2E_EMAIL=e2e-test@example.com
```
Then run `git check-ignore .env.local .env.example`. Expected output: only `.env.local`. If `.env.example` is also printed, add the line `!.env.example` to `.gitignore`.

- [ ] **Step 3: 👤 You — apply the migration**

In the Supabase dashboard open *SQL Editor → New query*, paste the whole migration file, and click *Run*. Expected: "Success. No rows returned".

- [ ] **Step 4: 👤 You — verify RLS**

In the SQL Editor run:
```sql
select relname, relrowsecurity from pg_class
where relname in ('profile', 'programs', 'wallet_items', 'stores', 'benefits', 'imports') order by relname;
```
Expected: 6 rows, `relrowsecurity` = `true` on every row.

- [ ] **Step 5: Commit**

```bash
git add supabase .env.example .gitignore
git commit -m "feat: database schema with row level security and screenshot bucket" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Supabase clients, auth gate and login

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
- Create: `src/proxy.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: env vars from Prerequisites
- Produces:
  - `supabaseBrowser(): SupabaseClient` (client components)
  - `supabaseServer(): Promise<SupabaseClient>` (route handlers, uses the request cookies)
  - `supabaseAdmin(): SupabaseClient` (server only, secret key, bypasses RLS — cron only)
  - Unauthenticated requests to anything except `/login`, `/auth/*`, `/api/cron/*` and static files redirect to `/login` (API routes get 401 JSON).

- [ ] **Step 1: Install**

```bash
npm install @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2: Create the three clients**

`src/lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a context that cannot set cookies; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}
```

`src/lib/supabase/admin.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

/** Bypasses RLS. Server-only (cron). Never import from a client component. */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 3: Create the auth gate**

Next.js 16 renamed `middleware.ts` to `proxy.ts` with an exported `proxy` function. Create `src/proxy.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PREFIXES = ['/login', '/auth/', '/api/cron/'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon|apple-icon).*)'],
};
```

- [ ] **Step 4: Create the login page (email code + link, Google)**

The 6-digit code matters on iPhone: a home-screen app does not share its session with Safari, so a link opened from the Mail app would log in Safari, not the app. Create `src/app/login/page.tsx`:
```tsx
'use client';
import { useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError('לא ניתן לשלוח קוד לכתובת הזו.');
    else setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('הקוד שגוי או שפג תוקפו.');
    else location.href = '/';
  }

  async function google() {
    await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <h1 className="text-2xl font-bold">ההטבות שלי</h1>
      {!sent ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-600">אימייל</span>
            <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3" autoComplete="email" />
          </label>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
            שלחו לי קוד כניסה
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-gray-600">שלחנו קוד ל-{email}. הקלידו אותו כאן (או לחצו על הקישור במייל במחשב).</p>
          <label className="block">
            <span className="text-sm text-gray-600">קוד</span>
            <input inputMode="numeric" autoComplete="one-time-code" dir="ltr" required value={code}
              onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-center text-2xl tracking-widest" />
          </label>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
            כניסה
          </button>
          <button type="button" onClick={() => setSent(false)} className="w-full text-sm text-blue-700">
            לשלוח שוב / לשנות אימייל
          </button>
        </form>
      )}
      <button onClick={google} className="w-full rounded-xl border border-gray-300 bg-white p-3">כניסה עם Google</button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 5: Create the callback route (link and Google)**

Create `src/app/auth/callback/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }
  return NextResponse.redirect(`${origin}/login`);
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: "Compiled successfully", no type errors.

- [ ] **Step 7: Manual check**

Run `npm run dev`, open http://localhost:3000.
Expected: redirected to `/login`. Enter your email → the email arrives with a 6-digit code → enter it → you land on `/` (still the default Next.js page; replaced in Task 11). Opening http://localhost:3000/login again redirects to `/`. A different email gets "לא ניתן לשלוח קוד לכתובת הזו." (sign-ups are closed).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Supabase auth with email code login and route protection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Snapshot loading and offline cache

**Files:**
- Create: `src/lib/selectAll.ts`, `src/lib/snapshot.ts`, `src/lib/useSnapshot.tsx`
- Test: `src/lib/selectAll.test.ts`

**Interfaces:**
- Consumes: Task 1 types; Task 9 `supabaseBrowser`
- Produces:
  - `selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]>`
  - `fetchSnapshot(sb: SupabaseClient): Promise<Snapshot>`
  - `idbGet<T>(key: string): Promise<T | undefined>`, `idbSet(key: string, value: unknown): Promise<void>`, `idbClear(): Promise<void>` — never throw.
  - `<SnapshotProvider>` and `useSnap(): { snapshot: Snapshot | null; fresh: boolean; online: boolean; error: string | null; refresh: () => Promise<void> }` — `fresh` is true once data came from the network in this session.

- [ ] **Step 1: Write the failing test**

Create `src/lib/selectAll.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, selectAll } from './selectAll';

describe('selectAll', () => {
  it('loads every row past the 1000-row page limit', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const calls: [number, number][] = [];
    const result = await selectAll<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(result).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it('stops on an exact multiple of the page size', async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => i);
    const result = await selectAll<number>(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(result).toHaveLength(PAGE_SIZE);
  });
  it('throws the database error', async () => {
    await expect(selectAll(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/selectAll.test.ts`
Expected: FAIL — cannot resolve `./selectAll`.

- [ ] **Step 3: Implement `selectAll`**

Create `src/lib/selectAll.ts`:
```ts
export const PAGE_SIZE = 1000; // Supabase's default max rows per request

/** Reads every page. `page` must apply a stable .order(...) and .range(from, to). */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return out;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/selectAll.test.ts`
Expected: PASS.

- [ ] **Step 5: Snapshot fetch + IndexedDB**

Create `src/lib/snapshot.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Benefit, Profile, Program, Snapshot, Store, WalletItem } from './core/types';
import { selectAll } from './selectAll';

export async function fetchSnapshot(sb: SupabaseClient): Promise<Snapshot> {
  const [profile, programs, wallet, stores, benefits] = await Promise.all([
    sb.from('profile').select('*').maybeSingle(),
    selectAll<Program>((a, b) => sb.from('programs').select('*').order('name').order('id').range(a, b)),
    selectAll<WalletItem>((a, b) => sb.from('wallet_items').select('*').order('created_at').order('id').range(a, b)),
    selectAll<Store>((a, b) => sb.from('stores').select('*').order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').neq('status', 'archived').order('id').range(a, b)),
  ]);
  if (profile.error) throw profile.error;
  return {
    profile: (profile.data as Profile | null) ?? null,
    programs, wallet, stores, benefits,
    fetchedAt: new Date().toISOString(),
  };
}

const DB_NAME = 'benefits-finder';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private mode / blocked storage: the app still works online
  }
}

export const idbGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key));
export const idbSet = async (key: string, value: unknown) => { await run('readwrite', (s) => s.put(value, key)); };
export const idbClear = async () => { await run('readwrite', (s) => s.clear()); };
```

- [ ] **Step 6: React provider**

Create `src/lib/useSnapshot.tsx`:
```tsx
'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Snapshot } from './core/types';
import { fetchSnapshot, idbGet, idbSet } from './snapshot';
import { supabaseBrowser } from './supabase/browser';

interface SnapshotState {
  snapshot: Snapshot | null;
  fresh: boolean;
  online: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SnapshotContext = createContext<SnapshotState | null>(null);

export function SnapshotProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [fresh, setFresh] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchSnapshot(supabaseBrowser());
      setSnapshot(s);
      setFresh(true);
      setError(null);
      await idbSet('snapshot', s);
    } catch {
      setError('לא הצלחנו לטעון נתונים עדכניים.');
    }
  }, []);

  useEffect(() => {
    // Show the cached copy immediately (works offline), then replace it with fresh data.
    idbGet<Snapshot>('snapshot').then((cached) => {
      if (cached) setSnapshot((prev) => prev ?? cached);
    });
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if (navigator.onLine) refresh();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [refresh]);

  return (
    <SnapshotContext.Provider value={{ snapshot, fresh, online, error, refresh }}>{children}</SnapshotContext.Provider>
  );
}

export function useSnap(): SnapshotState {
  const ctx = useContext(SnapshotContext);
  if (!ctx) throw new Error('useSnap must be used inside <SnapshotProvider>');
  return ctx;
}
```

- [ ] **Step 7: Build and test**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/selectAll.ts src/lib/selectAll.test.ts src/lib/snapshot.ts src/lib/useSnapshot.tsx
git commit -m "feat: paginated snapshot loading with IndexedDB offline cache" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: App shell — RTL layout, bottom tabs, installable PWA

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Delete: `src/app/page.tsx`, `src/app/favicon.ico`
- Create: `src/app/manifest.ts`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `public/sw.js`
- Create: `src/components/SwRegister.tsx`, `src/components/BottomNav.tsx`
- Create: `src/app/(tabs)/layout.tsx`, `src/app/(tabs)/page.tsx` (placeholder, replaced in Task 14)

**Interfaces:**
- Consumes: Task 10 `SnapshotProvider`, `useSnap`
- Produces: every page under `src/app/(tabs)/` gets the snapshot context, the bottom nav, and a redirect to `/onboarding` when fresh data shows no profile.

- [ ] **Step 1: Root layout and CSS**

Replace `src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import SwRegister from '@/components/SwRegister';
import './globals.css';

const heebo = Heebo({ subsets: ['hebrew', 'latin'] });

export const metadata: Metadata = {
  title: 'ההטבות שלי',
  description: 'איזה כרטיס להוציא בקופה',
  appleWebApp: { capable: true, title: 'הטבות', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#1d4ed8', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.className} bg-gray-50 text-gray-900 antialiased`}>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
```

Replace `src/app/globals.css` with exactly:
```css
@import "tailwindcss";
```

Delete `src/app/page.tsx` and `src/app/favicon.ico` (the generated icon below replaces it).

- [ ] **Step 2: Manifest and icons**

`src/app/manifest.ts`:
```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ההטבות שלי',
    short_name: 'הטבות',
    start_url: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'he',
    background_color: '#f9fafb',
    theme_color: '#1d4ed8',
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }],
  };
}
```

`src/app/icon.tsx`:
```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1d4ed8', color: 'white', fontSize: 320, fontWeight: 700 }}>
        ₪
      </div>
    ),
    size,
  );
}
```

`src/app/apple-icon.tsx`:
```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1d4ed8', color: 'white', fontSize: 112, fontWeight: 700 }}>
        ₪
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 3: Service worker**

Create `public/sw.js`. Caches the app shell and built assets; Supabase and `/api/` requests are never cached (the snapshot lives in IndexedDB):
```js
const CACHE = 'bf-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    // Content-hashed files never change: cache first.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  if (req.mode === 'navigate') {
    // Pages: network first, cached copy when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
    );
  }
});
```

`src/components/SwRegister.tsx`:
```tsx
'use client';
import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
```

- [ ] **Step 4: Bottom navigation**

`src/components/BottomNav.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'איפה אני', icon: '🔍' },
  { href: '/benefits', label: 'כל ההטבות', icon: '📋' },
  { href: '/wallet', label: 'הארנק', icon: '💳' },
  { href: '/import', label: 'ייבוא', icon: '➕' },
  { href: '/sources', label: 'מקורות', icon: '⚙️' },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((t) => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center py-2 text-xs ${active ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>
                <span className="text-xl" aria-hidden>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Tabs layout with onboarding gate, placeholder home**

`src/app/(tabs)/layout.tsx`:
```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { SnapshotProvider, useSnap } from '@/lib/useSnapshot';

function OnboardingGate() {
  const { snapshot, fresh } = useSnap();
  const router = useRouter();
  useEffect(() => {
    if (fresh && snapshot && !snapshot.profile) router.replace('/onboarding');
  }, [fresh, snapshot, router]);
  return null;
}

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SnapshotProvider>
      <OnboardingGate />
      <div className="mx-auto max-w-xl pb-24">{children}</div>
      <BottomNav />
    </SnapshotProvider>
  );
}
```

`src/app/(tabs)/page.tsx` (placeholder):
```tsx
export default function Home() {
  return <main className="p-4">בקרוב</main>;
}
```

- [ ] **Step 6: Build and check**

Run: `npm run build`
Expected: success.

Run `npm run dev`, log in, and check: the page is right-to-left in Heebo font with the 5-tab bar at the bottom; you are redirected to `/onboarding` (404 until Task 12 — expected); http://localhost:3000/icon returns a blue PNG with ₪; http://localhost:3000/manifest.webmanifest returns the JSON above.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: RTL app shell, bottom tabs, manifest, icons and service worker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Onboarding

**Files:**
- Create: `src/lib/seedPrograms.ts`, `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: Task 1 `ProgramKind`, `PROGRAM_KINDS`; Task 2 `monthNameHe`; Task 7 `KIND_LABELS`; Task 9 `supabaseBrowser`
- Produces: `SEED_PROGRAMS: SeedProgram[]` where `interface SeedProgram { key: string; name: string; kind: ProgramKind }`. On finish: rows in `programs`, `wallet_items` (card issuers → `card`, clubs and store clubs → `membership`), then `profile` last. Safe to re-run after a partial failure (existing program names are reused; wallet items are created only when the wallet is empty).

- [ ] **Step 1: Seed list**

Create `src/lib/seedPrograms.ts`:
```ts
import type { ProgramKind } from './core/types';

export interface SeedProgram {
  key: string;
  name: string;
  kind: ProgramKind;
}

/** Onboarding checklist. Anything missing is added with "add other" or later in Sources. */
export const SEED_PROGRAMS: SeedProgram[] = [
  { key: 'isracard', name: 'ישראכרט', kind: 'card_issuer' },
  { key: 'max', name: 'מקס', kind: 'card_issuer' },
  { key: 'cal', name: 'כאל', kind: 'card_issuer' },
  { key: 'diners', name: 'דיינרס', kind: 'card_issuer' },
  { key: 'amex', name: 'אמריקן אקספרס', kind: 'card_issuer' },
  { key: 'hever', name: 'חבר', kind: 'club' },
  { key: 'lahav', name: 'להב', kind: 'club' },
  { key: 'ashmoret', name: 'אשמורת', kind: 'club' },
  { key: 'behatsdaa', name: 'בהצדעה', kind: 'club' },
  { key: 'flycard', name: 'פלאי קארד', kind: 'club' },
  { key: 'rebar', name: 'רי-בר', kind: 'store_club' },
  { key: 'dreamcard', name: 'דרים קארד', kind: 'store_club' },
  { key: 'deltaplus', name: 'דלתא פלוס', kind: 'store_club' },
  { key: 'superpharm', name: 'סופר-פארם לייף סטייל', kind: 'store_club' },
  { key: 'shufersal', name: 'שופרסל', kind: 'store_club' },
  { key: 'golf', name: 'גולף', kind: 'store_club' },
  { key: 'castro', name: 'קסטרו', kind: 'store_club' },
  { key: 'renuar', name: 'רנואר', kind: 'store_club' },
  { key: 'ho', name: 'H&O', kind: 'store_club' },
];
```

- [ ] **Step 2: Onboarding page**

Create `src/app/onboarding/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { monthNameHe } from '@/lib/core/dates';
import { KIND_LABELS } from '@/lib/core/labels';
import { PROGRAM_KINDS, type ProgramKind } from '@/lib/core/types';
import { SEED_PROGRAMS, type SeedProgram } from '@/lib/seedPrograms';
import { supabaseBrowser } from '@/lib/supabase/browser';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [month, setMonth] = useState<number | null>(null);
  const [picked, setPicked] = useState<SeedProgram[]>([]);
  const [otherName, setOtherName] = useState('');
  const [otherKind, setOtherKind] = useState<ProgramKind>('club');
  const [links, setLinks] = useState<Record<string, string[]>>({}); // card key -> club keys it unlocks
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPicked = (key: string) => picked.some((p) => p.key === key);
  const toggle = (p: SeedProgram) =>
    setPicked((ps) => (ps.some((x) => x.key === p.key) ? ps.filter((x) => x.key !== p.key) : [...ps, p]));
  const options = [...SEED_PROGRAMS, ...picked.filter((p) => p.key.startsWith('other-'))];
  const cards = picked.filter((p) => p.kind === 'card_issuer');
  const clubs = picked.filter((p) => p.kind === 'club');

  function addOther() {
    const name = otherName.trim();
    if (!name) return;
    setPicked((ps) => [...ps, { key: `other-${Date.now()}`, name, kind: otherKind }]);
    setOtherName('');
  }

  function toggleLink(cardKey: string, clubKey: string) {
    setLinks((l) => {
      const cur = l[cardKey] ?? [];
      return { ...l, [cardKey]: cur.includes(clubKey) ? cur.filter((k) => k !== clubKey) : [...cur, clubKey] };
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user || month == null) throw new Error('missing user or month');

      const { data: existing, error: e1 } = await sb.from('programs').select('id,name');
      if (e1) throw e1;
      const idByName = new Map<string, string>((existing ?? []).map((p) => [p.name, p.id]));
      const toCreate = picked.filter((p) => !idByName.has(p.name));
      if (toCreate.length > 0) {
        const { data, error } = await sb.from('programs').insert(toCreate.map((p) => ({ name: p.name, kind: p.kind }))).select('id,name');
        if (error) throw error;
        for (const p of data) idByName.set(p.name, p.id);
      }
      const idOf = (p: SeedProgram) => idByName.get(p.name)!;

      const { count, error: e2 } = await sb.from('wallet_items').select('id', { count: 'exact', head: true });
      if (e2) throw e2;
      if (!count) {
        const items = picked.map((p) => ({
          name: p.name,
          type: p.kind === 'card_issuer' ? 'card' : 'membership',
          program_ids: [
            idOf(p),
            ...(links[p.key] ?? []).flatMap((k) => picked.filter((c) => c.key === k)).map(idOf),
          ],
        }));
        if (items.length > 0) {
          const { error } = await sb.from('wallet_items').insert(items);
          if (error) throw error;
        }
      }

      const { error: e3 } = await sb.from('profile').upsert({ user_id: user.id, birth_month: month });
      if (e3) throw e3;
      router.replace('/');
    } catch {
      setError('השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  const next = () => (step === 2 && (cards.length === 0 || clubs.length === 0) ? finish() : setStep(step + 1));

  return (
    <main className="mx-auto max-w-xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">ברוכים הבאים</h1>

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="font-semibold">באיזה חודש יום ההולדת שלכם?</h2>
          <p className="text-sm text-gray-600">הטבות יום הולדת תקפות לכל החודש.</p>
          <select value={month ?? ''} onChange={(e) => setMonth(Number(e.target.value) || null)}
            className="w-full rounded-xl border border-gray-300 p-3">
            <option value="">בחרו חודש</option>
            {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
          </select>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-semibold">מה יש לכם?</h2>
          {PROGRAM_KINDS.map((kind) => (
            <fieldset key={kind} className="space-y-2">
              <legend className="text-sm font-semibold text-gray-500">{KIND_LABELS[kind]}</legend>
              {options.filter((p) => p.kind === kind).map((p) => (
                <label key={p.key} className="flex items-center gap-2 rounded-lg bg-white p-2">
                  <input type="checkbox" checked={isPicked(p.key)} onChange={() => toggle(p)} />
                  {p.name}
                </label>
              ))}
            </fieldset>
          ))}
          <div className="flex gap-2">
            <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="משהו אחר…"
              className="min-w-0 flex-1 rounded-xl border border-gray-300 p-2" />
            <select value={otherKind} onChange={(e) => setOtherKind(e.target.value as ProgramKind)}
              className="rounded-xl border border-gray-300 p-2">
              {PROGRAM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
            <button type="button" onClick={addOther} className="rounded-xl bg-gray-200 px-3">הוספה</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="font-semibold">אילו מועדונים כל כרטיס פותח?</h2>
          <p className="text-sm text-gray-600">לדוגמה: כרטיס כאל של מועדון חבר פותח גם את הטבות חבר.</p>
          {cards.map((card) => (
            <fieldset key={card.key} className="space-y-2 rounded-xl bg-white p-3">
              <legend className="font-semibold">{card.name}</legend>
              {clubs.map((club) => (
                <label key={club.key} className="flex items-center gap-2">
                  <input type="checkbox" checked={(links[card.key] ?? []).includes(club.key)}
                    onChange={() => toggleLink(card.key, club.key)} />
                  {club.name}
                </label>
              ))}
            </fieldset>
          ))}
        </section>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        {step > 1 && <button onClick={() => setStep(step - 1)} className="rounded-xl bg-gray-200 px-4 py-3">חזרה</button>}
        <button disabled={busy || (step === 1 && month == null)} onClick={step === 3 ? finish : next}
          className="flex-1 rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
          {step === 3 || (step === 2 && (cards.length === 0 || clubs.length === 0)) ? 'סיום' : 'המשך'}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Build and check**

Run: `npm run build` → success.
Run `npm run dev`, log in. Expected: redirected to `/onboarding`. Pick a month, tick כאל, חבר and רי-בר, add "מועדון העבודה" as a club, link כאל → חבר, finish. In Supabase *Table Editor*: `profile` has your month; `programs` has 4 rows; `wallet_items` has 4 rows and the כאל row's `program_ids` holds 2 ids. You land on `/` (placeholder).

- [ ] **Step 4: Commit**

```bash
git add src/lib/seedPrograms.ts src/app/onboarding
git commit -m "feat: onboarding with birth month, program checklist and card-club links" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: My wallet page

**Files:**
- Create: `src/app/(tabs)/wallet/page.tsx`

**Interfaces:**
- Consumes: `useSnap` (Task 10), `supabaseBrowser` (Task 9), `KIND_LABELS` (Task 7)
- Produces: add / edit / delete wallet items; `last4` must be empty or exactly 4 digits; writes are disabled offline.

- [ ] **Step 1: Wallet page**

Create `src/app/(tabs)/wallet/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { KIND_LABELS } from '@/lib/core/labels';
import type { WalletItem } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

interface Draft {
  id?: string;
  name: string;
  type: WalletItem['type'];
  last4: string;
  nickname: string;
  color: string;
  program_ids: string[];
}
const EMPTY: Draft = { name: '', type: 'card', last4: '', nickname: '', color: '#1d4ed8', program_ids: [] };

export default function WalletPage() {
  const { snapshot, online, refresh } = useSnap();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;
  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));

  async function save(d: Draft) {
    if (!d.name.trim()) return setError('חסר שם.');
    if (d.last4 && !/^\d{4}$/.test(d.last4)) return setError('אפשר לשמור רק 4 ספרות אחרונות.');
    const row = {
      name: d.name.trim(), type: d.type, last4: d.last4 || null, nickname: d.nickname.trim() || null,
      color: d.color, program_ids: d.program_ids,
    };
    const sb = supabaseBrowser();
    const { error } = d.id
      ? await sb.from('wallet_items').update(row).eq('id', d.id)
      : await sb.from('wallet_items').insert(row);
    if (error) return setError('השמירה נכשלה.');
    setDraft(null);
    setError(null);
    await refresh();
  }

  async function remove(item: WalletItem) {
    if (!confirm(`למחוק את "${item.name}" מהארנק?`)) return;
    const { error } = await supabaseBrowser().from('wallet_items').delete().eq('id', item.id);
    if (error) return setError('המחיקה נכשלה.');
    await refresh();
  }

  const toggleProgram = (id: string) =>
    setDraft((d) => d && {
      ...d,
      program_ids: d.program_ids.includes(id) ? d.program_ids.filter((x) => x !== id) : [...d.program_ids, id],
    });

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">הארנק שלי</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">אין חיבור — אפשר רק לצפות.</p>}

      {(['card', 'membership'] as const).map((type) => (
        <section key={type} className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">{type === 'card' ? 'כרטיסי אשראי' : 'חברויות'}</h2>
          <ul className="space-y-2">
            {snapshot.wallet.filter((w) => w.type === type).map((w) => (
              <li key={w.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="h-8 w-2 rounded" style={{ background: w.color ?? '#9ca3af' }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{w.nickname || w.name}{w.last4 ? ` ••${w.last4}` : ''}</p>
                  <p className="text-sm text-gray-600">
                    {w.program_ids.map((id) => programs.get(id)?.name).filter(Boolean).join(' · ') || 'לא משויך לתוכנית'}
                  </p>
                </div>
                <button disabled={!online} onClick={() => setDraft({ ...EMPTY, ...w, last4: w.last4 ?? '', nickname: w.nickname ?? '', color: w.color ?? EMPTY.color })}
                  className="text-sm text-blue-700 disabled:opacity-40">עריכה</button>
                <button disabled={!online} onClick={() => remove(w)} className="text-sm text-red-700 disabled:opacity-40">מחיקה</button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!draft && (
        <button disabled={!online} onClick={() => setDraft(EMPTY)}
          className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">הוספה לארנק</button>
      )}

      {draft && (
        <section className="space-y-3 rounded-xl bg-white p-4 shadow">
          <label className="block">
            <span className="text-sm text-gray-600">שם</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">סוג</span>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as WalletItem['type'] })}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2">
              <option value="card">כרטיס אשראי</option>
              <option value="membership">חברות במועדון</option>
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-sm text-gray-600">כינוי</span>
              <input value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
            </label>
            <label className="w-28">
              <span className="text-sm text-gray-600">4 ספרות אחרונות</span>
              <input inputMode="numeric" maxLength={4} dir="ltr" value={draft.last4}
                onChange={(e) => setDraft({ ...draft, last4: e.target.value.replace(/\D/g, '') })}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
            </label>
            <label className="w-16">
              <span className="text-sm text-gray-600">צבע</span>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="mt-1 h-10 w-full" />
            </label>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm text-gray-600">אילו הטבות זה פותח?</legend>
            {snapshot.programs.length === 0 && <p className="text-sm text-gray-500">הוסיפו תוכנית בלשונית "מקורות".</p>}
            {snapshot.programs.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" checked={draft.program_ids.includes(p.id)} onChange={() => toggleProgram(p.id)} />
                {p.name} <span className="text-xs text-gray-500">({KIND_LABELS[p.kind]})</span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button onClick={() => save(draft)} className="flex-1 rounded-xl bg-blue-700 p-3 font-semibold text-white">שמירה</button>
            <button onClick={() => { setDraft(null); setError(null); }} className="rounded-xl bg-gray-200 px-4">ביטול</button>
          </div>
        </section>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: Build and check**

Run: `npm run build` → success.
In `npm run dev` → *הארנק*: the 4 items from onboarding are listed; edit כאל to nickname "הכרטיס הכחול" and last4 "1234" → saved and shown as "הכרטיס הכחול ••1234"; typing letters into last4 is ignored; add and delete a test item.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/wallet"
git commit -m "feat: wallet page to add, edit and remove cards and memberships" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: "Where am I" home page

**Files:**
- Create: `src/components/BenefitCard.tsx`
- Modify: `src/app/(tabs)/page.tsx` (replace the placeholder)

**Interfaces:**
- Consumes: `useSnap` (Task 10); `searchStores` (Task 1); `israelToday`, `isBirthdayMonth`, `isOutdated`, `monthNameHe` (Task 2); `Savings` (Task 3); `rankForStore`, `birthdayBenefits`, `Row` (Task 4); labels (Task 7)
- Produces: `<BenefitCard benefit program items store savings birthdayLocked birthMonth />` (an `<li>`), reused by Task 15. Home page test ids used by Task 20: input placeholder `איפה אתם קונים?`, amount label `כמה אתם מוציאים? (₪)`, result lists `data-testid="pay-results" | "other-results" | "show-results"`.

- [ ] **Step 1: Benefit card**

Create `src/components/BenefitCard.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { isOutdated, monthNameHe } from '@/lib/core/dates';
import { CHANNEL_LABELS, REQUIRES_LABELS, formatDate, headlineText, shekel } from '@/lib/core/labels';
import type { Savings } from '@/lib/core/savings';
import type { Benefit, Program, Store, WalletItem } from '@/lib/core/types';

interface Props {
  benefit: Benefit;
  program: Program;
  items: WalletItem[];
  store: Store | null;
  savings: Savings | null;
  birthdayLocked: boolean;
  birthMonth: number | null;
}

export default function BenefitCard({ benefit, program, items, store, savings, birthdayLocked, birthMonth }: Props) {
  const [copied, setCopied] = useState(false);
  const who = items.map((i) => i.nickname || i.name).join(' / ');
  const action = benefit.requires === 'pay_with_card' ? 'שלמו עם' : 'הציגו';

  async function copyCode() {
    if (!benefit.coupon_code) return;
    await navigator.clipboard.writeText(benefit.coupon_code);
    setCopied(true);
  }

  return (
    <li className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm ${birthdayLocked ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{benefit.timing === 'birthday_month' ? '🎂 ' : ''}{benefit.title}</p>
          <p className="text-sm text-gray-600">
            {action} <span className="font-medium text-gray-900">{who}</span> · {program.name}
            {store ? ` · ${store.name_he}` : ''}
          </p>
        </div>
        {savings && savings.spendMore === 0 ? (
          <span className="shrink-0 rounded-lg bg-green-100 px-2 py-1 text-sm font-bold text-green-800">
            חיסכון {shekel(savings.saved)}
          </span>
        ) : (
          <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-sm font-bold text-blue-800">{headlineText(benefit)}</span>
        )}
      </div>

      {birthdayLocked && (
        <p className="mt-1 text-sm">
          זמין בחודש יום ההולדת{birthMonth ? ` (${monthNameHe(birthMonth)})` : ''}
        </p>
      )}
      {savings && savings.spendMore > 0 && (
        <p className="mt-1 text-sm text-amber-700">
          הוסיפו {shekel(savings.spendMore)} לקנייה כדי לחסוך {shekel(savings.potential)}
        </p>
      )}
      {benefit.coupon_code && (
        <button onClick={copyCode} className="mt-2 rounded-lg bg-gray-100 px-2 py-1 font-mono text-sm" dir="ltr">
          {benefit.coupon_code} {copied ? '✓' : '⧉'}
        </button>
      )}
      {isOutdated(benefit.last_verified_at, new Date()) && (
        <p className="mt-1 text-xs text-amber-700">ייתכן שלא מעודכן</p>
      )}
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-blue-700">פרטים</summary>
        <div className="mt-1 space-y-1 text-gray-700">
          {benefit.description && <p>{benefit.description}</p>}
          {benefit.conditions && <p className="text-gray-600">{benefit.conditions}</p>}
          <p>
            {REQUIRES_LABELS[benefit.requires]} · {CHANNEL_LABELS[benefit.channel]}
            {benefit.min_spend ? ` · מינימום ${shekel(benefit.min_spend)}` : ''}
            {benefit.max_discount ? ` · עד ${shekel(benefit.max_discount)}` : ''}
            {benefit.valid_until ? ` · בתוקף עד ${formatDate(benefit.valid_until)}` : ''}
          </p>
          {benefit.source_url && (
            <a href={benefit.source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">למקור</a>
          )}
        </div>
      </details>
    </li>
  );
}
```

- [ ] **Step 2: Home page**

Replace `src/app/(tabs)/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import BenefitCard from '@/components/BenefitCard';
import { isBirthdayMonth, israelToday } from '@/lib/core/dates';
import { searchStores } from '@/lib/core/normalize';
import { birthdayBenefits, rankForStore, type Row } from '@/lib/core/rank';
import type { Store } from '@/lib/core/types';
import { useSnap } from '@/lib/useSnapshot';

export default function WhereAmIPage() {
  const { snapshot, online, error } = useSnap();
  const [query, setQuery] = useState('');
  const [store, setStore] = useState<Store | null>(null);
  const [amountText, setAmountText] = useState('');

  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;

  const today = israelToday();
  const parsed = Number(amountText.replace(',', '.'));
  const amount = parsed > 0 ? parsed : null;
  const birthMonth = snapshot.profile?.birth_month ?? null;
  const matches = store ? [] : searchStores(snapshot.stores, query);
  const result = store ? rankForStore(snapshot, store, amount, today) : null;
  const birthdayCount = isBirthdayMonth(birthMonth, today) ? birthdayBenefits(snapshot, today).length : 0;

  const section = (title: string, rows: Row[], testId: string) =>
    rows.length > 0 && (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">{title}</h2>
        <ul data-testid={testId} className="space-y-2">
          {rows.map((r) => <BenefitCard key={r.benefit.id} {...r} store={store} birthMonth={birthMonth} />)}
        </ul>
      </section>
    );

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">איפה אני</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">אין חיבור — מוצגים הנתונים האחרונים שנשמרו.</p>}
      {online && error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {birthdayCount > 0 && (
        <Link href="/benefits?birthday=1" className="block rounded-xl bg-pink-50 p-3 font-semibold text-pink-800">
          🎂 חודש יום ההולדת — {birthdayCount} הטבות יום הולדת מחכות לכם
        </Link>
      )}

      {store ? (
        <div className="flex items-center justify-between rounded-xl bg-blue-50 p-3">
          <span className="font-semibold">{store.name_he} · {store.name_en}</span>
          <button onClick={() => { setStore(null); setQuery(''); }} className="text-sm text-blue-700">החלפת חנות ✕</button>
        </div>
      ) : (
        <div>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="איפה אתם קונים?"
            aria-label="חיפוש חנות" className="w-full rounded-xl border border-gray-300 p-3 text-lg" />
          {query.trim() && (
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {matches.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setStore(s)} className="w-full p-3 text-start">
                    {s.name_he} <span className="text-gray-500">· {s.name_en}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="p-3 text-sm text-gray-500">לא נמצאה חנות. אפשר לייבא את ההטבות שלה בלשונית "ייבוא".</li>
              )}
            </ul>
          )}
        </div>
      )}

      {store && (
        <label className="block">
          <span className="text-sm text-gray-600">כמה אתם מוציאים? (₪)</span>
          <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-lg" dir="ltr" />
        </label>
      )}

      {result && (
        <>
          {result.pay.length > 0 && !amount && (
            <p className="text-sm text-gray-500">הזינו סכום כדי לראות כמה תחסכו בכל כרטיס.</p>
          )}
          {section('שלמו עם', result.pay, 'pay-results')}
          {section('הטבות נוספות', result.other, 'other-results')}
          {section('הציגו או הזינו קוד', result.show, 'show-results')}
          {result.pay.length + result.other.length + result.show.length === 0 && (
            <p className="text-gray-500">אין לכם הטבות בחנות הזו.</p>
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Build and check with test data**

Run: `npm run build` → success.
In the Supabase *SQL Editor* add one store and two benefits for your user (replace the email):
```sql
with u as (select id from auth.users where email = 'YOUR_EMAIL'),
s as (insert into stores (user_id, name_he, name_en, category) select id, 'מנגו', 'Mango', 'fashion' from u returning id, user_id)
insert into benefits (user_id, program_id, store_id, title, type, value, min_spend, requires)
select s.user_id, p.id, s.id, t.title, t.type, t.value, t.min_spend, 'pay_with_card'
from s
join programs p on p.user_id = s.user_id and p.name = 'כאל'
cross join (values ('10% הנחה', 'percent_off', 10, null), ('₪50 הנחה מעל ₪300', 'fixed_off', 50, 300)) as t(title, type, value, min_spend);
```
In `npm run dev` on *איפה אני*: type `mango` → "מנגו · Mango" appears → tap it → two benefits under "שלמו עם", with the hint to enter an amount. Enter `250` → 10% shows "חיסכון ₪25" first; ₪50 shows "הוסיפו ₪50 לקנייה כדי לחסוך ₪50". Enter `400` → ₪50 is first. Then in DevTools → Network → Offline, reload: the same search still works with the "אין חיבור" banner (requires `npm run build && npm start` for the service worker).

- [ ] **Step 4: Commit**

```bash
git add src/components/BenefitCard.tsx "src/app/(tabs)/page.tsx"
git commit -m "feat: where-am-I page with store search and ranked cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: "All benefits" page

**Files:**
- Create: `src/app/(tabs)/benefits/page.tsx`

**Interfaces:**
- Consumes: `browseBenefits`, `EMPTY_FILTERS`, `BrowseFilters` (Task 5); `BenefitCard` (Task 14); labels (Task 7); `useSnap` (Task 10)
- Produces: `/benefits` page; `/benefits?birthday=1` opens with the birthday filter on (linked from the home banner and the email).

- [ ] **Step 1: Page**

Create `src/app/(tabs)/benefits/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import BenefitCard from '@/components/BenefitCard';
import { browseBenefits, EMPTY_FILTERS, type BrowseFilters } from '@/lib/core/browse';
import { israelToday } from '@/lib/core/dates';
import { CATEGORY_LABELS, TYPE_LABELS } from '@/lib/core/labels';
import { BENEFIT_TYPES, CATEGORIES, type BenefitType, type Category } from '@/lib/core/types';
import { useSnap } from '@/lib/useSnapshot';

const PAGE = 100;
const field = 'w-full rounded-lg border border-gray-300 bg-white p-2';

export default function BenefitsPage() {
  const { snapshot } = useSnap();
  const [f, setF] = useState<BrowseFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('birthday')) setF((x) => ({ ...x, birthday: true }));
  }, []);

  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;

  const set = <K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) => {
    setF((x) => ({ ...x, [key]: value }));
    setLimit(PAGE);
  };
  const rows = browseBenefits(snapshot, f, israelToday(), new Date());
  const birthMonth = snapshot.profile?.birth_month ?? null;
  const checks: [keyof BrowseFilters, string][] = [
    ['birthday', '🎂 הטבות יום הולדת'],
    ['expiringThisWeek', 'פגות השבוע'],
    ['recent', 'נוספו לאחרונה'],
    ['onlyMine', 'רק מה שהארנק שלי פותח'],
  ];

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">כל ההטבות</h1>
      <input type="search" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="חיפוש חנות, תוכנית או הטבה"
        aria-label="חיפוש" className="w-full rounded-xl border border-gray-300 p-3" />

      <details className="rounded-xl bg-white p-3 shadow-sm">
        <summary className="cursor-pointer font-semibold">סינון</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select aria-label="תוכנית" value={f.programId ?? ''} onChange={(e) => set('programId', e.target.value || null)} className={field}>
            <option value="">כל התוכניות</option>
            {snapshot.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="כרטיס או חברות" value={f.walletItemId ?? ''} onChange={(e) => set('walletItemId', e.target.value || null)} className={field}>
            <option value="">כל הארנק</option>
            {snapshot.wallet.map((w) => <option key={w.id} value={w.id}>{w.nickname || w.name}</option>)}
          </select>
          <select aria-label="קטגוריה" value={f.category ?? ''} onChange={(e) => set('category', (e.target.value || null) as Category | null)} className={field}>
            <option value="">כל הקטגוריות</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <select aria-label="סוג הטבה" value={f.type ?? ''} onChange={(e) => set('type', (e.target.value || null) as BenefitType | null)} className={field}>
            <option value="">כל הסוגים</option>
            {BENEFIT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select aria-label="איפה" value={f.channel ?? ''} onChange={(e) => set('channel', (e.target.value || null) as BrowseFilters['channel'])} className={field}>
            <option value="">בחנות ואונליין</option>
            <option value="in_store">בחנות</option>
            <option value="online">אונליין</option>
          </select>
        </div>
        <div className="mt-3 space-y-1">
          {checks.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={f[key] as boolean} onChange={(e) => set(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <button onClick={() => { setF(EMPTY_FILTERS); setLimit(PAGE); }} className="mt-3 text-sm text-blue-700">ניקוי סינון</button>
      </details>

      <p className="text-sm text-gray-500">{rows.length} הטבות</p>
      <ul className="space-y-2">
        {rows.slice(0, limit).map((r) => (
          <BenefitCard key={r.benefit.id} benefit={r.benefit} program={r.program} items={r.items} store={r.store}
            savings={null} birthdayLocked={r.birthdayLocked} birthMonth={birthMonth} />
        ))}
      </ul>
      {rows.length > limit && (
        <button onClick={() => setLimit(limit + PAGE)} className="w-full rounded-xl bg-gray-200 p-3">עוד הטבות</button>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build and check**

Run: `npm run build` → success.
In `npm run dev` → *כל ההטבות*: the two Mango test benefits from Task 14 are listed; searching `מנגו` or `Mango` keeps them, `xyz` shows "0 הטבות"; filter type "הנחה בשקלים" leaves one; http://localhost:3000/benefits?birthday=1 opens with the birthday box ticked.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/benefits"
git commit -m "feat: all-benefits page with search and filters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: AI extraction and the import API

**Files:**
- Create: `src/lib/fetchPage.ts`, `src/lib/ai/schema.ts`, `src/lib/ai/prompt.ts`, `src/lib/ai/extract.ts`, `src/lib/startImport.ts`
- Create: `src/app/api/import/route.ts`
- Create: `vitest.ai.config.ts`, `tests/ai/regression.test.ts`, `tests/ai/fixtures/sample-club.txt`, `tests/ai/fixtures/sample-club.expected.json`
- Test: `src/lib/fetchPage.test.ts`, `src/lib/ai/prompt.test.ts`

**Interfaces:**
- Consumes: `Extraction` (Task 7), types (Task 1), `israelToday` (Task 2), `selectAll` (Task 10), `supabaseServer` (Task 9), `IMPORT_ERRORS` (Task 7)
- Produces:
  - `htmlToText(html: string): string`; `fetchPageText(url: string): Promise<string | null>` (null = unreadable / under `MIN_TEXT`); `MIN_TEXT = 500`; `MAX_TEXT = 300_000`
  - `ExtractionSchema` (zod); `SYSTEM_PROMPT`; `buildContext(programName: string, stores: Store[], todayIso: string): string`
  - `extractBenefits(content: Anthropic.ContentBlockParam[], context: string): Promise<Extraction>`; `class ExtractError` with message `'refused' | 'too_long' | 'invalid_output'`
  - `interface ImportRequest { programId: string; mode: 'link' | 'text' | 'screenshot'; url?: string; text?: string; paths?: string[]; refresh?: boolean }`; `startImport(body: ImportRequest): Promise<{ importId: string } | { error: string }>` (error is a Hebrew message)
  - `POST /api/import` → `200 { importId }` with an `imports` row in `pending_review`, or `4xx/5xx { error: code }` (codes are keys of `IMPORT_ERRORS`); a failed extraction also writes an `imports` row with `status: 'failed'`; a failed refresh sets the program's `last_refresh_status` to `failed`.

- [ ] **Step 1: Install**

```bash
npm install @anthropic-ai/sdk zod
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/fetchPage.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPageText, htmlToText, MIN_TEXT } from './fetchPage';

describe('htmlToText', () => {
  it('drops scripts and styles, keeps text on separate lines, decodes entities', () => {
    const html = '<html><style>.a{}</style><script>alert(1)</script><h1>הטבות</h1><p>10% הנחה &amp; משלוח&nbsp;חינם</p><ul><li>מנגו</li><li>קסטרו</li></ul></html>';
    expect(htmlToText(html)).toBe('הטבות\n10% הנחה & משלוח חינם\nמנגו\nקסטרו');
  });
});

describe('fetchPageText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null when the page has almost no text (JavaScript-rendered sites)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div id="root"></div>')));
    expect(await fetchPageText('https://example.com')).toBeNull();
  });
  it('returns the text of a real page', async () => {
    const body = `<p>${'הטבה '.repeat(MIN_TEXT)}</p>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
    expect((await fetchPageText('https://example.com'))?.startsWith('הטבה')).toBe(true);
  });
  it('returns null on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect(await fetchPageText('https://example.com')).toBeNull();
  });
  it('rejects non-web URLs', async () => {
    await expect(fetchPageText('file:///etc/passwd')).rejects.toThrow('bad_url');
  });
});
```

Create `src/lib/ai/prompt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildContext } from './prompt';

describe('buildContext', () => {
  it('lists known stores with ids, both names and aliases', () => {
    const ctx = buildContext('חבר', [
      { id: 's1', name_he: 'מנגו', name_en: 'Mango', aliases: ['מנגו קידס'], category: 'fashion', channel: 'both' },
    ], '2026-10-06');
    expect(ctx).toContain('Program: חבר');
    expect(ctx).toContain('Today: 2026-10-06');
    expect(ctx).toContain('s1 | מנגו | Mango | מנגו קידס | fashion');
  });
  it('says when there are no stores yet', () => {
    expect(buildContext('חבר', [], '2026-10-06')).toContain('(none yet)');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/lib/fetchPage.test.ts src/lib/ai/prompt.test.ts`
Expected: FAIL — cannot resolve `./fetchPage` and `./prompt`.

- [ ] **Step 4: Implement `fetchPage.ts`**

Create `src/lib/fetchPage.ts`:
```ts
export const MIN_TEXT = 500; // less than this = page is rendered by JavaScript; ask for text/screenshot
export const MAX_TEXT = 300_000;

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/g, (e) => ENTITIES[e])
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export async function fetchPageText(url: string): Promise<string | null> {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad_url');
  const res = await fetch(u, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; BenefitsFinder/1.0)', 'accept-language': 'he-IL,he;q=0.9' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) return null;
  const text = htmlToText(await res.text());
  return text.length < MIN_TEXT ? null : text;
}
```

- [ ] **Step 5: Implement the schema and prompt**

Create `src/lib/ai/schema.ts` (all fields required and nullable — the structured-output format requires every property to be listed):
```ts
import { z } from 'zod';
import { BENEFIT_TYPES, CATEGORIES, CHANNELS, REQUIRES, TIMINGS } from '@/lib/core/types';

export const ExtractionSchema = z.object({
  new_stores: z.array(
    z.object({
      name_he: z.string(),
      name_en: z.string(),
      aliases: z.array(z.string()),
      category: z.enum(CATEGORIES),
      channel: z.enum(CHANNELS),
    }),
  ),
  benefits: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
      store_id: z.string().nullable(),
      new_store_index: z.number().int().nullable(),
      category: z.enum(CATEGORIES).nullable(),
      type: z.enum(BENEFIT_TYPES),
      value: z.number().nullable(),
      min_spend: z.number().nullable(),
      max_discount: z.number().nullable(),
      requires: z.enum(REQUIRES),
      coupon_code: z.string().nullable(),
      channel: z.enum(CHANNELS),
      timing: z.enum(TIMINGS),
      valid_from: z.string().nullable(),
      valid_until: z.string().nullable(),
      conditions: z.string().nullable(),
    }),
  ),
});
```

Create `src/lib/ai/prompt.ts`:
```ts
import { CATEGORIES, type Store } from '@/lib/core/types';

export const SYSTEM_PROMPT = `You extract shopping benefits and discounts from Israeli credit-card, club and store-loyalty benefit pages (text or screenshots, usually in Hebrew).

Return every distinct benefit on the page as one item. Never invent benefits, values, dates or codes that are not on the page; use null when a field is not stated.

Field rules:
- title: a short Hebrew title as it would appear in a list, e.g. "15% הנחה על כל הקולקציה".
- Store: if the benefit is for one store or chain that is in the known-store list (match Hebrew name, English name or alias, ignoring spelling differences), set store_id to its id. If the store is not in the list, add it to new_stores - both name_he and name_en are required (transliterate when the page gives only one) - and set new_store_index to its index in new_stores. If the benefit covers a whole category ("בכל המסעדות"), set category instead. If it applies everywhere, leave store_id, new_store_index and category all null. Set at most one of the three. A benefit naming several stores becomes one item per store.
- type: percent_off (X% discount), fixed_off (X shekels off), cashback_percent (X% returned as money), points (points or miles), bogo (1+1, 2+1, second item discounted), gift (a free item or gift), installments (extra interest-free payments, "תשלומים ללא ריבית"), other.
- value: the number only - percent for percent_off and cashback_percent, shekels for fixed_off, otherwise null.
- min_spend / max_discount: shekel amounts when stated ("בקנייה מעל 300 ₪" -> min_spend 300; "עד 100 ₪ הנחה" -> max_discount 100).
- requires: pay_with_card when paying with the program's card is required ("בתשלום בכרטיס"); membership when showing or identifying as a member is enough ("בהצגת כרטיס חבר", "לחברי המועדון"); coupon_code when a code must be entered - put the code in coupon_code.
- timing: birthday_month for any birthday benefit (birthday month, birthday week or birthday day); otherwise always.
- channel: in_store, online, or both when not stated.
- valid_from / valid_until: YYYY-MM-DD when stated. A date without a year means its next occurrence on or after today.
- conditions: the remaining fine print in Hebrew, concise. description: one short Hebrew sentence or null.`;

export function buildContext(programName: string, stores: Store[], todayIso: string): string {
  const list = stores
    .map((s) => `${s.id} | ${s.name_he} | ${s.name_en} | ${s.aliases.join(', ')} | ${s.category}`)
    .join('\n');
  return [
    `Program: ${programName}`,
    `Today: ${todayIso}`,
    `Categories: ${CATEGORIES.join(', ')}`,
    '',
    'Known stores (id | Hebrew | English | aliases | category):',
    list || '(none yet)',
  ].join('\n');
}
```

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `npm test -- src/lib/fetchPage.test.ts src/lib/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 7: Claude call**

Create `src/lib/ai/extract.ts`. It uses the SDK's `messages.parse` with a zod output format (structured outputs), model `claude-opus-5-5` at effort `low` (extraction is mechanical; thinking cannot be turned off on this model, effort is the control). It checks `stop_reason` before trusting the output:
```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Extraction } from '@/lib/core/review';
import { SYSTEM_PROMPT } from './prompt';
import { ExtractionSchema } from './schema';

export const MODEL = 'claude-opus-5-5';

export class ExtractError extends Error {}

let client: Anthropic | null = null;

export async function extractBenefits(content: Anthropic.ContentBlockParam[], context: string): Promise<Extraction> {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: zodOutputFormat(ExtractionSchema) },
      messages: [{ role: 'user', content: [...content, { type: 'text', text: context }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw e;
    throw new ExtractError('invalid_output'); // output did not parse (e.g. cut off mid-JSON)
  }
  if (response.stop_reason === 'refusal') throw new ExtractError('refused');
  if (response.stop_reason === 'max_tokens') throw new ExtractError('too_long');
  if (!response.parsed_output) throw new ExtractError('invalid_output');
  return response.parsed_output;
}
```
If TypeScript reports `Anthropic.ContentBlockParam` as missing, use `Anthropic.Messages.ContentBlockParam`.

- [ ] **Step 8: Client helper**

Create `src/lib/startImport.ts`:
```ts
import { IMPORT_ERRORS } from './core/labels';

export interface ImportRequest {
  programId: string;
  mode: 'link' | 'text' | 'screenshot';
  url?: string;
  text?: string;
  paths?: string[]; // storage paths "<user_id>/<file>" in the "imports" bucket
  refresh?: boolean;
}

export async function startImport(body: ImportRequest): Promise<{ importId: string } | { error: string }> {
  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { importId?: string; error?: string };
    if (!res.ok || !json.importId) return { error: IMPORT_ERRORS[json.error ?? ''] ?? IMPORT_ERRORS.default };
    return { importId: json.importId };
  } catch {
    return { error: IMPORT_ERRORS.default };
  }
}
```

- [ ] **Step 9: API route**

Create `src/app/api/import/route.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { extractBenefits, ExtractError } from '@/lib/ai/extract';
import { buildContext } from '@/lib/ai/prompt';
import { israelToday } from '@/lib/core/dates';
import type { Store } from '@/lib/core/types';
import { fetchPageText, MAX_TEXT } from '@/lib/fetchPage';
import { selectAll } from '@/lib/selectAll';
import type { ImportRequest } from '@/lib/startImport';
import { supabaseServer } from '@/lib/supabase/server';

export const maxDuration = 300; // seconds; long pages take minutes to extract

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const fail = (error: string, status = 422) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized', 401);
  const body = (await req.json()) as ImportRequest;

  const { data: program } = await supabase.from('programs').select('id,name').eq('id', body.programId).maybeSingle();
  if (!program) return fail('program_not_found', 404);

  const markRefreshFailed = async () => {
    if (body.refresh) {
      await supabase.from('programs')
        .update({ last_refresh_status: 'failed', last_refreshed_at: new Date().toISOString() })
        .eq('id', program.id);
    }
  };

  const content: Anthropic.ContentBlockParam[] = [];
  let source: 'ai_link' | 'ai_text' | 'ai_screenshot';
  if (body.mode === 'link') {
    source = 'ai_link';
    const text = body.url ? await fetchPageText(body.url).catch(() => null) : null;
    if (!text) {
      await markRefreshFailed();
      return fail('unreadable');
    }
    content.push({ type: 'text', text: `Benefits page ${body.url}:\n\n${text}` });
  } else if (body.mode === 'text') {
    source = 'ai_text';
    const text = body.text?.trim() ?? '';
    if (!text) return fail('empty');
    content.push({ type: 'text', text });
  } else {
    source = 'ai_screenshot';
    const paths = body.paths ?? [];
    if (paths.length < 1 || paths.length > 5) return fail('bad_screenshots');
    for (const path of paths) {
      if (!path.startsWith(`${user.id}/`)) return fail('bad_screenshots', 403);
      const { data: file, error } = await supabase.storage.from('imports').download(path);
      if (error || !file || !IMAGE_TYPES.includes(file.type as ImageType)) return fail('bad_screenshots');
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: file.type as ImageType, data: Buffer.from(await file.arrayBuffer()).toString('base64') },
      });
    }
  }
  const textLength = content.reduce((n, c) => n + (c.type === 'text' ? c.text.length : 0), 0);
  if (textLength > MAX_TEXT) return fail('too_long');

  const stores = await selectAll<Store>((a, b) => supabase.from('stores').select('*').order('id').range(a, b));
  const raw_input = { url: body.url ?? null, text: body.mode === 'text' ? body.text ?? null : null, paths: body.paths ?? null };
  const base = { program_id: program.id, source, raw_input, is_refresh: !!body.refresh };

  try {
    const extracted = await extractBenefits(content, buildContext(program.name, stores, israelToday().iso));
    const { data: row, error } = await supabase.from('imports')
      .insert({ ...base, extracted, status: 'pending_review' }).select('id').single();
    if (error) throw error;
    return NextResponse.json({ importId: row.id });
  } catch (e) {
    const code = e instanceof ExtractError ? e.message : e instanceof Anthropic.APIError ? `api_${e.status}` : 'default';
    await supabase.from('imports').insert({ ...base, status: 'failed', error: code });
    await markRefreshFailed();
    return fail(code, 502);
  }
}
```

- [ ] **Step 10: AI regression harness (real API, run on demand)**

Create `vitest.ai.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/ai/**/*.test.ts'], env: loadEnv('', process.cwd(), ''), testTimeout: 300_000 },
});
```
Then: `npm pkg set scripts.test:ai="vitest run --config vitest.ai.config.ts"`

Create `tests/ai/fixtures/sample-club.txt`:
```
מועדון הדוגמה — ההטבות שלנו

אופנה
מנגו – 15% הנחה על כל הקולקציה בתשלום בכרטיס המועדון. בתוקף עד 31.12.2026.

מסעדות
מקדונלדס – 1+1 על ארוחות גדולות בהצגת כרטיס חבר באפליקציה.

פארם
סופר-פארם – 50 ₪ הנחה בקנייה מעל 300 ₪ בתשלום בכרטיס המועדון.

יום הולדת
בחודש יום ההולדת: 20% הנחה ברשת קסטרו בתשלום בכרטיס המועדון.
```

Create `tests/ai/fixtures/sample-club.expected.json`:
```json
{
  "program": "מועדון הדוגמה",
  "today": "2026-10-06",
  "stores": [
    { "id": "11111111-1111-1111-1111-111111111111", "name_he": "מנגו", "name_en": "Mango", "aliases": [], "category": "fashion", "channel": "both" }
  ],
  "benefits": [
    { "store": "Mango", "type": "percent_off", "value": 15, "timing": "always", "requires": "pay_with_card", "valid_until": "2026-12-31" },
    { "store": "McDonald's", "type": "bogo", "value": null, "timing": "always", "requires": "membership" },
    { "store": "Super-Pharm", "type": "fixed_off", "value": 50, "timing": "always", "requires": "pay_with_card", "min_spend": 300 },
    { "store": "Castro", "type": "percent_off", "value": 20, "timing": "birthday_month", "requires": "pay_with_card" }
  ]
}
```

Create `tests/ai/regression.test.ts`. Each fixture is a `.txt` page plus `.expected.json`; every expected benefit must appear, a store already in the known list must be matched by id (not re-created), and the other listed fields must be equal:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { extractBenefits } from '@/lib/ai/extract';
import { buildContext } from '@/lib/ai/prompt';
import { normalize } from '@/lib/core/normalize';
import type { Store } from '@/lib/core/types';

interface Expected {
  program: string;
  today: string;
  stores: Store[];
  benefits: ({ store: string | null } & Record<string, unknown>)[];
}

const dir = path.resolve('tests/ai/fixtures');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
  it(file, async () => {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const expected: Expected = JSON.parse(fs.readFileSync(path.join(dir, file.replace(/\.txt$/, '.expected.json')), 'utf8'));
    const out = await extractBenefits([{ type: 'text', text }], buildContext(expected.program, expected.stores, expected.today));

    const storeName = (b: (typeof out.benefits)[number]) =>
      b.store_id ? expected.stores.find((s) => s.id === b.store_id)?.name_en ?? 'UNKNOWN_ID'
        : b.new_store_index != null ? out.new_stores[b.new_store_index]?.name_en ?? 'BAD_INDEX' : null;

    for (const { store, ...fields } of expected.benefits) {
      const known = store != null && expected.stores.some((s) => normalize(s.name_en) === normalize(store));
      const found = out.benefits.some((b) => {
        const name = storeName(b);
        const storeOk = store == null ? name == null : name != null && normalize(name) === normalize(store) && (!known || b.store_id != null);
        return storeOk && Object.entries(fields).every(([k, v]) => b[k as keyof typeof b] === v);
      });
      expect(found, `missing: ${JSON.stringify({ store, ...fields })}\ngot: ${JSON.stringify(out, null, 2)}`).toBe(true);
    }
  });
}
```

- [ ] **Step 11: Run unit tests, build, and the AI regression once**

Run: `npm test && npm run build`
Expected: all PASS; build succeeds.

Run: `npm run test:ai`
Expected: PASS for `sample-club.txt` (one real API call, a few cents). If it fails, read the printed output; fix the prompt rules in `prompt.ts`, not the expectations, unless the expectation is wrong.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: Claude-based benefit extraction and import API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Import and review pages

**Files:**
- Create: `src/app/(tabs)/import/page.tsx`, `src/app/(tabs)/import/[id]/page.tsx`

**Interfaces:**
- Consumes: `startImport` (Task 16); `rowProblems`, `toIncoming`, `scopeValue`, `scopePatch`, `ImportRow`, `ReviewRow`, `NewStoreDraft` (Task 7); `mergeImport` (Task 6); `findStoreByName` (Task 1); `useSnap` (Task 10); labels (Task 7)
- Produces: `/import` (start an import, list imports waiting for review) and `/import/<id>` (review + save). Save order: new stores (reusing an existing store with the same normalized name) → inserts → updates → not-seen → import `saved` → program `last_refresh_status = 'ok'`. After a failed save the snapshot is reloaded so a retry creates no duplicates.

- [ ] **Step 1: Import page**

Create `src/app/(tabs)/import/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate, IMPORT_ERRORS } from '@/lib/core/labels';
import { startImport, type ImportRequest } from '@/lib/startImport';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MODES: [ImportRequest['mode'], string][] = [['link', 'קישור'], ['text', 'טקסט'], ['screenshot', 'צילומי מסך']];

export default function ImportPage() {
  const { snapshot, online } = useSnap();
  const router = useRouter();
  const [programId, setProgramId] = useState('');
  const [mode, setMode] = useState<ImportRequest['mode']>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; program_id: string; created_at: string }[]>([]);

  useEffect(() => {
    supabaseBrowser().from('imports').select('id,program_id,created_at').eq('status', 'pending_review')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setPending(data ?? []));
  }, []);

  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
  const ready = online && !busy && programId &&
    (mode === 'link' ? url.trim() : mode === 'text' ? text.trim() : files.length > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let paths: string[] | undefined;
      if (mode === 'screenshot') {
        if (files.length > 5 || files.some((f) => !IMAGE_TYPES.includes(f.type))) {
          setError(IMPORT_ERRORS.bad_screenshots);
          return;
        }
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error('unauthorized');
        paths = [];
        for (const f of files) {
          const path = `${user.id}/${crypto.randomUUID()}.${f.type.split('/')[1]}`;
          const { error } = await sb.storage.from('imports').upload(path, f, { contentType: f.type });
          if (error) throw error;
          paths.push(path);
        }
      }
      const result = await startImport({ programId, mode, url: url.trim(), text, paths });
      if ('error' in result) setError(result.error);
      else router.push(`/import/${result.importId}`);
    } catch {
      setError(IMPORT_ERRORS.default);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">ייבוא הטבות</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">ייבוא דורש חיבור לאינטרנט.</p>}

      <select aria-label="תוכנית" value={programId} onChange={(e) => setProgramId(e.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white p-3">
        <option value="">של איזו תוכנית ההטבות?</option>
        {snapshot.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div className="flex rounded-xl bg-gray-200 p-1" role="tablist">
        {MODES.map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex-1 rounded-lg p-2 text-sm ${mode === m ? 'bg-white font-semibold shadow' : ''}`}>{label}</button>
        ))}
      </div>

      {mode === 'link' && (
        <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
          aria-label="קישור לדף ההטבות" className="w-full rounded-xl border border-gray-300 p-3" />
      )}
      {mode === 'text' && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="הדביקו כאן את הטקסט מדף ההטבות"
          aria-label="טקסט" className="w-full rounded-xl border border-gray-300 p-3" />
      )}
      {mode === 'screenshot' && (
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="צילומי מסך"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="w-full" />
      )}

      <button disabled={!ready} onClick={submit}
        className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
        {busy ? 'מחלץ הטבות… זה יכול לקחת כמה דקות' : 'חילוץ הטבות'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">ממתינים לאישור</h2>
          <ul className="space-y-1">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={`/import/${p.id}`} className="block rounded-lg bg-white p-2 text-blue-700">
                  {programName.get(p.program_id) ?? 'תוכנית'} · {formatDate(p.created_at)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Review page**

Create `src/app/(tabs)/import/[id]/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { israelToday } from '@/lib/core/dates';
import { CATEGORY_LABELS, REQUIRES_LABELS, TIMING_LABELS, TYPE_LABELS } from '@/lib/core/labels';
import { mergeImport } from '@/lib/core/merge';
import { findStoreByName } from '@/lib/core/normalize';
import {
  rowProblems, scopePatch, scopeValue, toIncoming, type ImportRow, type NewStoreDraft, type ReviewRow,
} from '@/lib/core/review';
import { BENEFIT_TYPES, CATEGORIES, REQUIRES, TIMINGS, type BenefitType, type Category, type Requires, type Timing } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

const field = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm';
const num = (v: string) => (v.trim() === '' ? null : Number(v));

export default function ReviewImportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { snapshot, refresh } = useSnap();
  const [imp, setImp] = useState<ImportRow | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [newStores, setNewStores] = useState<NewStoreDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().from('imports').select('*').eq('id', id).single().then(({ data }) => {
      const row = data as ImportRow | null;
      setImp(row);
      if (row?.extracted) {
        setRows(row.extracted.benefits.map((b) => ({ ...b, approved: true })));
        setNewStores(row.extracted.new_stores);
      }
    });
  }, [id]);

  if (!snapshot || !imp) return <p className="p-4 text-gray-500">טוען…</p>;

  const program = snapshot.programs.find((p) => p.id === imp.program_id);
  const ctx = { storeIds: new Set(snapshot.stores.map((s) => s.id)), newStores, todayIso: israelToday().iso };
  const problems = rows.map((r) => (r.approved ? rowProblems(r, ctx) : []));
  const approvedCount = rows.filter((r) => r.approved).length;
  const canSave = imp.status === 'pending_review' && approvedCount > 0 && problems.every((p) => p.length === 0) && !busy;
  const stores = [...snapshot.stores].sort((a, b) => a.name_he.localeCompare(b.name_he, 'he'));
  const update = (i: number, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const updateStore = (i: number, patch: Partial<NewStoreDraft>) =>
    setNewStores((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    if (!snapshot || !imp) return;
    setBusy(true);
    setMessage(null);
    const sb = supabaseBrowser();
    try {
      const nowIso = new Date().toISOString();
      const approved = rows.filter((r) => r.approved);

      const newStoreIds: (string | undefined)[] = [];
      const usedIndexes = new Set(approved.map((r) => r.new_store_index).filter((i): i is number => i != null));
      for (const i of usedIndexes) {
        const draft = newStores[i];
        const existing = findStoreByName(snapshot.stores, draft.name_he) ?? findStoreByName(snapshot.stores, draft.name_en);
        if (existing) {
          newStoreIds[i] = existing.id;
          continue;
        }
        const { data, error } = await sb.from('stores').insert({
          name_he: draft.name_he.trim(), name_en: draft.name_en.trim(), aliases: draft.aliases,
          category: draft.category, channel: draft.channel,
        }).select('id').single();
        if (error) throw error;
        newStoreIds[i] = data.id;
      }

      const incoming = approved.map((r) => toIncoming(r, newStoreIds, imp.raw_input.url));
      const existing = snapshot.benefits.filter((b) => b.program_id === imp.program_id);
      const plan = mergeImport(existing, incoming, { isRefresh: imp.is_refresh, nowIso });

      if (plan.inserts.length > 0) {
        const { error } = await sb.from('benefits')
          .insert(plan.inserts.map((b) => ({ ...b, program_id: imp.program_id, last_verified_at: nowIso })));
        if (error) throw error;
      }
      for (const u of plan.updates) {
        const { error } = await sb.from('benefits').update(u.patch).eq('id', u.id);
        if (error) throw error;
      }
      if (plan.notSeen.length > 0) {
        const { error } = await sb.from('benefits').update({ status: 'not_seen' }).in('id', plan.notSeen);
        if (error) throw error;
      }
      await sb.from('imports').update({ status: 'saved' }).eq('id', imp.id);
      await sb.from('programs').update({ last_refreshed_at: nowIso, last_refresh_status: 'ok' }).eq('id', imp.program_id);
      await refresh();
      setImp({ ...imp, status: 'saved' });
      setMessage(
        `נשמר: ${plan.inserts.length} חדשות, ${plan.updates.length} עודכנו` +
          (plan.notSeen.length ? `, ${plan.notSeen.length} לא נמצאו בדף (לאישור בלשונית "מקורות")` : '') + '.',
      );
    } catch {
      await refresh(); // so a retry merges against what was already saved — no duplicates
      setMessage('השמירה נכשלה. אפשר לנסות שוב — לא ייווצרו כפילויות.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!imp) return;
    await supabaseBrowser().from('imports').update({ status: 'rejected' }).eq('id', imp.id);
    router.push('/import');
  }

  if (imp.status === 'failed' || !imp.extracted) {
    return <p className="p-4 text-red-700">הייבוא הזה נכשל ({imp.error ?? 'ללא פירוט'}). חזרו ללשונית "ייבוא" ונסו שוב.</p>;
  }

  return (
    <main className="space-y-4 p-4 pb-32">
      <h1 className="text-xl font-bold">בדיקת ייבוא · {program?.name}</h1>
      <p className="text-sm text-gray-600">
        {rows.length} הטבות נמצאו{imp.is_refresh ? ' (רענון)' : ''}. בדקו, תקנו או בטלו סימון לפני שמירה.
      </p>

      {newStores.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">חנויות חדשות</h2>
          {newStores.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-sm">
              <input aria-label="שם בעברית" value={s.name_he} onChange={(e) => updateStore(i, { name_he: e.target.value })} className={field} />
              <input aria-label="שם באנגלית" dir="ltr" value={s.name_en} onChange={(e) => updateStore(i, { name_en: e.target.value })} className={field} />
              <select aria-label="קטגוריה" value={s.category} onChange={(e) => updateStore(i, { category: e.target.value as Category })} className={field}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
          ))}
        </section>
      )}

      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className={`space-y-2 rounded-xl bg-white p-3 shadow-sm ${r.approved ? '' : 'opacity-50'}`}>
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={r.approved} onChange={(e) => update(i, { approved: e.target.checked })} />
              לשמור
            </label>
            <input aria-label="כותרת" value={r.title} onChange={(e) => update(i, { title: e.target.value })} className={field} />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="חנות או קטגוריה" value={scopeValue(r)} onChange={(e) => update(i, scopePatch(e.target.value))} className={field}>
                <option value="">כל החנויות</option>
                <optgroup label="חנויות חדשות">
                  {newStores.map((s, j) => <option key={j} value={`n:${j}`}>{s.name_he || s.name_en} (חדשה)</option>)}
                </optgroup>
                <optgroup label="קטגוריה">
                  {CATEGORIES.map((c) => <option key={c} value={`c:${c}`}>{CATEGORY_LABELS[c]}</option>)}
                </optgroup>
                <optgroup label="חנויות">
                  {stores.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name_he}</option>)}
                </optgroup>
              </select>
              <select aria-label="סוג" value={r.type} onChange={(e) => update(i, { type: e.target.value as BenefitType })} className={field}>
                {BENEFIT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
              <input aria-label="ערך (% או ₪)" inputMode="decimal" placeholder="ערך" value={r.value ?? ''}
                onChange={(e) => update(i, { value: num(e.target.value) })} className={field} />
              <input aria-label="מינימום קנייה ₪" inputMode="decimal" placeholder="מינימום ₪" value={r.min_spend ?? ''}
                onChange={(e) => update(i, { min_spend: num(e.target.value) })} className={field} />
              <input aria-label="תקרת הנחה ₪" inputMode="decimal" placeholder="תקרה ₪" value={r.max_discount ?? ''}
                onChange={(e) => update(i, { max_discount: num(e.target.value) })} className={field} />
              <select aria-label="דרישה" value={r.requires} onChange={(e) => update(i, { requires: e.target.value as Requires })} className={field}>
                {REQUIRES.map((q) => <option key={q} value={q}>{REQUIRES_LABELS[q]}</option>)}
              </select>
              <input aria-label="קוד קופון" dir="ltr" placeholder="קוד קופון" value={r.coupon_code ?? ''}
                onChange={(e) => update(i, { coupon_code: e.target.value || null })} className={field} />
              <select aria-label="מתי" value={r.timing} onChange={(e) => update(i, { timing: e.target.value as Timing })} className={field}>
                {TIMINGS.map((t) => <option key={t} value={t}>{TIMING_LABELS[t]}</option>)}
              </select>
              <label className="col-span-2 text-sm text-gray-600">
                בתוקף עד
                <input type="date" value={r.valid_until ?? ''} onChange={(e) => update(i, { valid_until: e.target.value || null })} className={field} />
              </label>
            </div>
            <textarea aria-label="תנאים" rows={2} placeholder="תנאים" value={r.conditions ?? ''}
              onChange={(e) => update(i, { conditions: e.target.value || null })} className={field} />
            {problems[i].length > 0 && (
              <ul className="text-sm text-red-700">{problems[i].map((p) => <li key={p}>⚠️ {p}</li>)}</ul>
            )}
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-16 mx-auto flex max-w-xl gap-2 bg-gray-50 p-3">
        {imp.status === 'pending_review' ? (
          <>
            <button disabled={!canSave} onClick={save} className="flex-1 rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
              {busy ? 'שומר…' : `שמירת ${approvedCount} הטבות`}
            </button>
            <button disabled={busy} onClick={reject} className="rounded-xl bg-gray-200 px-4">דחייה</button>
          </>
        ) : (
          <p className="flex-1 rounded-xl bg-green-50 p-3 text-green-800">{message ?? 'הייבוא הזה כבר טופל.'}</p>
        )}
      </div>
      {imp.status === 'pending_review' && message && <p className="text-sm text-red-700">{message}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Build and check end to end**

Run: `npm run build` → success.
In `npm run dev` → *ייבוא*: choose a program, tab *טקסט*, paste the content of `tests/ai/fixtures/sample-club.txt`, click *חילוץ הטבות*. Expected: after up to a few minutes, the review page lists 4 benefits and the new stores (McDonald's, Super-Pharm, Castro) with Hebrew and English names; Mango is matched to the existing store from Task 14. Clear the English name of one new store → its row shows "⚠️ לחנות חדשה חסר שם…" and *שמירה* is disabled; restore it and save → "נשמר: 4 חדשות, 0 עודכנו." Back on the import page, paste the same text again and save → "נשמר: 0 חדשות, 4 עודכנו." and no new stores in *Table Editor → stores*. Try *קישור* with `https://example.com` → "לא הצלחנו לקרוא את הדף…".

- [ ] **Step 4: Commit**

```bash
git add "src/app/(tabs)/import"
git commit -m "feat: import and review pages with merge-on-save" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Sources and settings page

**Files:**
- Create: `src/app/(tabs)/sources/page.tsx`

**Interfaces:**
- Consumes: `startImport` (Task 16); `useSnap` (Task 10); `idbClear` (Task 10); labels, `formatDate` (Task 7); `monthNameHe` (Task 2)
- Produces: per program — last refresh, status (⚠️ on failure), active benefit count, editable benefits link, *רענון* (refresh import → review page), delete; add program; "not seen" benefits with archive / restore; settings — birth month, email reminders on/off, logout (also clears the offline copy).

- [ ] **Step 1: Page**

Create `src/app/(tabs)/sources/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { monthNameHe } from '@/lib/core/dates';
import { formatDate, KIND_LABELS } from '@/lib/core/labels';
import { PROGRAM_KINDS, type Program, type ProgramKind } from '@/lib/core/types';
import { idbClear } from '@/lib/snapshot';
import { startImport } from '@/lib/startImport';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function SourcesPage() {
  const { snapshot, online, refresh } = useSnap();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProgramKind>('club');
  if (!snapshot) return <p className="p-4 text-gray-500">טוען…</p>;

  const sb = supabaseBrowser();
  const activeCount = (programId: string) =>
    snapshot.benefits.filter((b) => b.program_id === programId && b.status === 'active').length;
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
  const notSeen = snapshot.benefits.filter((b) => b.status === 'not_seen');

  async function write(op: PromiseLike<{ error: unknown }>) {
    const { error } = await op;
    if (error) setError('הפעולה נכשלה.');
    else {
      setError(null);
      await refresh();
    }
  }

  async function refreshProgram(p: Program) {
    if (!p.benefits_url) return;
    setBusyId(p.id);
    const result = await startImport({ programId: p.id, mode: 'link', url: p.benefits_url, refresh: true });
    setBusyId(null);
    if ('error' in result) {
      setError(`${p.name}: ${result.error}`);
      await refresh();
    } else router.push(`/import/${result.importId}`);
  }

  async function logout() {
    await sb.auth.signOut();
    await idbClear();
    location.href = '/login';
  }

  return (
    <main className="space-y-6 p-4">
      <h1 className="text-xl font-bold">מקורות והגדרות</h1>
      {!online && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">אין חיבור — אפשר רק לצפות.</p>}
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {PROGRAM_KINDS.map((kind) => {
        const list = snapshot.programs.filter((p) => p.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500">{KIND_LABELS[kind]}</h2>
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.id} className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{p.last_refresh_status === 'failed' ? '⚠️ ' : ''}{p.name}</p>
                    <p className="text-sm text-gray-600">
                      {activeCount(p.id)} הטבות · {p.last_refreshed_at ? `עודכן ${formatDate(p.last_refreshed_at)}` : 'טרם עודכן'}
                    </p>
                  </div>
                  <input dir="ltr" type="url" placeholder="קישור לדף ההטבות" defaultValue={p.benefits_url ?? ''} aria-label={`קישור להטבות של ${p.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== p.benefits_url) write(sb.from('programs').update({ benefits_url: v }).eq('id', p.id));
                    }}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                  <div className="flex gap-2">
                    <button disabled={!online || !p.benefits_url || busyId !== null} onClick={() => refreshProgram(p)}
                      className="flex-1 rounded-lg bg-blue-700 p-2 text-sm font-semibold text-white disabled:opacity-40">
                      {busyId === p.id ? 'מרענן… (עד כמה דקות)' : 'רענון'}
                    </button>
                    <button disabled={!online}
                      onClick={() => confirm(`למחוק את ${p.name} וכל ההטבות שלה?`) && write(sb.from('programs').delete().eq('id', p.id))}
                      className="rounded-lg bg-gray-100 px-3 text-sm text-red-700 disabled:opacity-40">מחיקה</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">הוספת תוכנית</h2>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם" aria-label="שם התוכנית"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 p-2" />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as ProgramKind)} aria-label="סוג"
            className="rounded-lg border border-gray-300 p-2">
            {PROGRAM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
          <button disabled={!online || !newName.trim()}
            onClick={async () => { await write(sb.from('programs').insert({ name: newName.trim(), kind: newKind })); setNewName(''); }}
            className="rounded-lg bg-gray-200 px-3 disabled:opacity-40">הוספה</button>
        </div>
      </section>

      {notSeen.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">לא נמצאו ברענון האחרון</h2>
          <ul className="space-y-2">
            {notSeen.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm">
                <p className="min-w-0 flex-1 text-sm">{b.title} · {programName.get(b.program_id)}</p>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'archived' }).eq('id', b.id))}
                  className="text-sm text-red-700">הסרה</button>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'active' }).eq('id', b.id))}
                  className="text-sm text-blue-700">עדיין קיימת</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {snapshot.profile && (
        <section className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <h2 className="font-semibold">הגדרות</h2>
          <label className="flex items-center justify-between gap-2">
            חודש יום ההולדת
            <select disabled={!online} value={snapshot.profile.birth_month}
              onChange={(e) => write(sb.from('profile').update({ birth_month: Number(e.target.value) }).eq('user_id', snapshot.profile!.user_id))}
              className="rounded-lg border border-gray-300 p-2">
              {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled={!online} checked={snapshot.profile.email_reminders}
              onChange={(e) => write(sb.from('profile').update({ email_reminders: e.target.checked }).eq('user_id', snapshot.profile!.user_id))} />
            תזכורת במייל בתחילת חודש יום ההולדת
          </label>
          <button onClick={logout} className="text-sm text-red-700">יציאה</button>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build and check**

Run: `npm run build` → success.
In `npm run dev` → *מקורות*: programs grouped by kind with benefit counts. Set a program's link to `https://example.com`, click *רענון* → error "…לא הצלחנו לקרוא את הדף…" and the program shows ⚠️. In SQL Editor run `update benefits set status = 'not_seen' where title like '%1+1%';` and reload → that benefit appears under "לא נמצאו ברענון האחרון"; *עדיין קיימת* restores it, *הסרה* hides it everywhere. Change the birth month to the current month → the home page shows the 🎂 banner when a birthday benefit exists. *יציאה* returns to `/login`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/sources"
git commit -m "feat: sources page with refresh, not-seen review and settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Birthday reminder email

**Files:**
- Create: `src/lib/email/birthdayEmail.ts`, `src/app/api/cron/birthday/route.ts`, `vercel.json`
- Test: `src/lib/email/birthdayEmail.test.ts`

**Interfaces:**
- Consumes: `birthdayBenefits` (Task 4); `israelToday`, `monthNameHe` (Task 2); `selectAll` (Task 10); `supabaseAdmin` (Task 9)
- Produces:
  - `buildBirthdayEmail(benefits: Benefit[], data: Pick<Snapshot,'programs'|'stores'>, appUrl: string, monthName: string): { subject: string; html: string }` — all page-derived text is HTML-escaped.
  - `GET /api/cron/birthday` (requires `Authorization: Bearer $CRON_SECRET`) → `{ sent: number }`. Sends at most once per year per user (`profile.last_reminder_year`); skips users with zero birthday benefits without marking them, so a later import in the same month still triggers it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/email/birthdayEmail.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Benefit } from '@/lib/core/types';
import { buildBirthdayEmail } from './birthdayEmail';

const benefit = (id: string, program_id: string, title: string, store_id: string | null = null) =>
  ({ id, program_id, title, store_id }) as Benefit;
const data = {
  programs: [
    { id: 'p1', name: 'רי-בר' }, { id: 'p2', name: 'דרים קארד' },
  ] as never,
  stores: [{ id: 's1', name_he: 'קסטרו' }] as never,
};

describe('buildBirthdayEmail', () => {
  const email = buildBirthdayEmail(
    [benefit('a', 'p1', 'שייק חינם'), benefit('b', 'p2', '20% הנחה', 's1'), benefit('c', 'p1', '<script>x</script>')],
    data, 'https://app.example', 'ספטמבר',
  );
  it('counts the benefits in the subject', () => {
    expect(email.subject).toContain('3 הטבות יום הולדת');
  });
  it('groups by program and names the store', () => {
    expect(email.html.indexOf('רי-בר')).toBeLessThan(email.html.indexOf('שייק חינם'));
    expect(email.html).toContain('20% הנחה — קסטרו');
  });
  it('escapes HTML coming from benefit pages', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
  it('links to the birthday filter and is right-to-left', () => {
    expect(email.html).toContain('href="https://app.example/benefits?birthday=1"');
    expect(email.html).toContain('dir="rtl"');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/email/birthdayEmail.test.ts`
Expected: FAIL — cannot resolve `./birthdayEmail`.

- [ ] **Step 3: Implement**

Create `src/lib/email/birthdayEmail.ts`:
```ts
import type { Benefit, Snapshot } from '@/lib/core/types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export function buildBirthdayEmail(
  benefits: Benefit[],
  data: Pick<Snapshot, 'programs' | 'stores'>,
  appUrl: string,
  monthName: string,
): { subject: string; html: string } {
  const programName = new Map(data.programs.map((p) => [p.id, p.name]));
  const storeName = new Map(data.stores.map((s) => [s.id, s.name_he]));
  const byProgram = new Map<string, Benefit[]>();
  for (const b of benefits) byProgram.set(b.program_id, [...(byProgram.get(b.program_id) ?? []), b]);

  const sections = [...byProgram]
    .map(([programId, list]) => {
      const items = list
        .map((b) => {
          const store = b.store_id ? storeName.get(b.store_id) : undefined;
          return `<li>${esc(b.title)}${store ? ` — ${esc(store)}` : ''}</li>`;
        })
        .join('');
      return `<h3>${esc(programName.get(programId) ?? '')}</h3><ul>${items}</ul>`;
    })
    .join('');

  return {
    subject: `🎂 חודש יום ההולדת שלך התחיל — ${benefits.length} הטבות יום הולדת`,
    html:
      `<div dir="rtl" style="font-family:Arial,sans-serif">` +
      `<p>מזל טוב! ${esc(monthName)} הוא חודש יום ההולדת שלך. אלה ההטבות שמחכות לך:</p>` +
      sections +
      `<p><a href="${esc(appUrl)}/benefits?birthday=1">לכל הטבות יום ההולדת באפליקציה</a></p></div>`,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/email/birthdayEmail.test.ts`
Expected: PASS.

- [ ] **Step 5: Cron route and schedule**

```bash
npm install resend
```

Create `src/app/api/cron/birthday/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { israelToday, monthNameHe } from '@/lib/core/dates';
import { birthdayBenefits } from '@/lib/core/rank';
import type { Benefit, Profile, Program, Store, WalletItem } from '@/lib/core/types';
import { buildBirthdayEmail } from '@/lib/email/birthdayEmail';
import { selectAll } from '@/lib/selectAll';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
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
```

Create `vercel.json` (06:00 UTC = 09:00 Israel summer time / 08:00 winter):
```json
{
  "crons": [{ "path": "/api/cron/birthday", "schedule": "0 6 * * *" }]
}
```

- [ ] **Step 6: Build and check manually**

Run: `npm test && npm run build` → all PASS; build succeeds.
With `npm run dev` running: in *מקורות* set the birth month to the **current** month and make sure at least one benefit has *מתי* = חודש יום ההולדת (edit one in an import review, or in SQL Editor `update benefits set timing = 'birthday_month' where id = '<id>'`). Then run (paste your `CRON_SECRET`):
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/birthday
```
Expected: `{"sent":1}` and the email arrives in Hebrew, right-to-left. Run it again → `{"sent":0}`. Without the header → `{"error":"unauthorized"}`. Afterwards, set your real birth month back and run in SQL Editor `update profile set last_reminder_year = null;`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/email src/app/api/cron vercel.json package.json package-lock.json
git commit -m "feat: daily cron that emails birthday-month benefits once a year" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: End-to-end smoke test

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: home page selectors from Task 14; env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `E2E_EMAIL`
- Produces: `npm run e2e` — logs in as a separate test user (no email is sent: the secret key generates the login token), seeds that user's data, and checks the best card is ranked first. Your own data is untouched (RLS + a different user).

- [ ] **Step 1: Install**

```bash
npm install -D @playwright/test
npx playwright install chromium
npm pkg set scripts.e2e="playwright test"
```

- [ ] **Step 2: Config**

Create `playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd()); // loads .env.local like Next.js does

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:3000', locale: 'he-IL' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000/login', reuseExistingServer: true, timeout: 120_000 },
});
```

- [ ] **Step 3: Test**

Create `tests/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { israelToday } from '../../src/lib/core/dates';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const EMAIL = process.env.E2E_EMAIL!;

async function check<T>(op: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await op;
  if (error) throw error;
  return data;
}

/** Signs the test user in without sending email and returns the auth cookies @supabase/ssr would set. */
async function signIn() {
  const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true }); // fails harmlessly if it exists
  const link = await check(admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL }));

  const jar = new Map<string, string>();
  const sb = createServerClient(URL, KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  await check(sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' }));
  const cookies = [...jar].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' }));
  return { sb: sb as SupabaseClient, cookies };
}

async function seed(sb: SupabaseClient) {
  const { data: { user } } = await sb.auth.getUser();
  const uid = user!.id;
  for (const table of ['benefits', 'imports', 'wallet_items', 'stores', 'programs', 'profile']) {
    await check(sb.from(table).delete().eq('user_id', uid));
  }
  const notThisMonth = (israelToday().month % 12) + 1;
  await check(sb.from('profile').insert({ user_id: uid, birth_month: notThisMonth }));
  const programs = await check(
    sb.from('programs').insert([{ name: 'כאל', kind: 'card_issuer' }, { name: 'חבר', kind: 'club' }]).select('id,name'),
  );
  const pid = (name: string) => programs.find((p: { name: string }) => p.name === name).id;
  await check(sb.from('wallet_items').insert([
    { name: 'כרטיס בדיקה א', type: 'card', program_ids: [pid('כאל')] },
    { name: 'כרטיס בדיקה ב', type: 'card', program_ids: [pid('חבר')] },
  ]));
  const store = await check(sb.from('stores').insert({ name_he: 'מנגו', name_en: 'Mango', category: 'fashion' }).select('id').single());
  await check(sb.from('benefits').insert([
    { program_id: pid('כאל'), store_id: store.id, title: '10% הנחה', type: 'percent_off', value: 10, requires: 'pay_with_card' },
    { program_id: pid('חבר'), store_id: store.id, title: '₪50 הנחה מעל ₪100', type: 'fixed_off', value: 50, min_spend: 100, requires: 'pay_with_card' },
  ]));
}

test('search a store in English and see the best card first', async ({ page, context }) => {
  const { sb, cookies } = await signIn();
  await seed(sb);
  await context.addCookies(cookies);

  await page.goto('/');
  await page.getByPlaceholder('איפה אתם קונים?').fill('mango');
  await page.getByRole('button', { name: /מנגו/ }).click();
  await page.getByLabel('כמה אתם מוציאים? (₪)').fill('400');

  const first = page.getByTestId('pay-results').getByRole('listitem').first();
  await expect(first).toContainText('כרטיס בדיקה ב'); // ₪50 beats 10% of ₪400 = ₪40
  await expect(first).toContainText('חיסכון ₪50');
});
```

- [ ] **Step 4: Run**

Run: `npm run e2e`
Expected: `1 passed`. If it fails at sign-in, check `SUPABASE_SECRET_KEY` and `E2E_EMAIL` in `.env.local`.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e package.json package-lock.json
git commit -m "test: end-to-end smoke test for store search and ranking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Deploy to Vercel and install on the phone

**Files:** none (configuration only). Each 👤 step is yours; the agent asks before anything that publishes (pushing to GitHub).

- [ ] **Step 1: Final local verification**

Run: `npm test && npm run build && npm run e2e`
Expected: all unit tests PASS, build succeeds, `1 passed`.

- [ ] **Step 2: 👤 Push to a private GitHub repository** (the agent asks for confirmation first)

```bash
gh repo create benefits-finder --private --source . --push
```

- [ ] **Step 3: 👤 Create the Vercel project**

On vercel.com: *Add New → Project* → import `benefits-finder`. Under *Environment Variables* add every variable from `.env.local` **except** `E2E_EMAIL`, with `APP_URL` set to the production URL (e.g. `https://benefits-finder.vercel.app`). Deploy.

- [ ] **Step 4: 👤 Allow the production URL in Supabase**

*Authentication → URL Configuration*: set Site URL to the production URL and add `https://<production-domain>/auth/callback` to redirect URLs.

- [ ] **Step 5: 👤 (Optional) Google login**

In Google Cloud Console create an OAuth client (type Web) with the redirect URI shown in Supabase *Authentication → Sign In / Providers → Google*; paste its client id and secret into that Supabase page and enable it.

- [ ] **Step 6: 👤 Check on the phone**

Open the production URL on the phone → log in with the email code → *Share → Add to Home Screen* (iPhone) or *Install app* (Android). Open it from the home screen, search a store, then turn on airplane mode and search again: results still appear with the "אין חיבור" banner. In Vercel *Settings → Cron Jobs* the `/api/cron/birthday` job is listed.

---

## Self-Review Notes

Spec coverage: §1 purpose/decisions → Global Constraints; §2 stack → Tasks 1, 9, 16, 19, 20; §3 data model → Tasks 1, 8; §4 pages → Tasks 11–15, 17, 18; onboarding → Task 12; §5.1–5.2 ranking → Task 4; §5.3 birthday → Tasks 2, 4; §5.4 search → Task 1; §5.5 merge → Task 6; §6 AI import → Tasks 16, 17; §7 email → Task 19; §8 offline → Tasks 10, 11, 14; §9 security → Tasks 8, 9 and Prerequisites; §10 errors → Tasks 16–18; §11 testing → unit tests in Tasks 1–7, 10, 16, 19, AI regression in Task 16, e2e in Task 20; §12 phase 2 scrapers and the scraper-failure email → out of scope for this plan (the `imports.source = 'scraper'` value and the review flow are ready for them).
