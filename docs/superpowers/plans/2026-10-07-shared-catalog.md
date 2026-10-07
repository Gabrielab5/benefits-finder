# Shared Catalog, Card Products and Special Dates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app invite-only multi-user: one shared benefits catalog plus private additions, card products that link to the right benefits automatically, special-date benefits (anniversary, children, club-specific birthday), and an admin screen.

**Architecture:** Rows in `programs`, `stores`, `benefits` and the new `card_products` with `user_id = null` are shared; Postgres RLS lets everyone read shared rows plus their own and lets only admins write shared rows. Pure logic stays in `src/lib/core/` (special-date windows, catalog helpers). Admin user management runs in a server route with the secret key.

**Tech Stack:** Next.js 16, Supabase (Postgres RLS, Auth admin API), TypeScript, Tailwind 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-shared-catalog-design.md`

**Code-block convention:** a line `<!-- file: path -->` before a fenced block means "write this exact file"; `<!-- patch -->` before a ```python block means "run this script from the repo root" (it edits files and fails loudly if an expected snippet is missing).

## Global Constraints

- Invite-only: public sign-up stays closed; only admins create users.
- `user_id = null` means shared; anything a normal user creates is private (DB default `auth.uid()`).
- Only admins write shared rows; nobody can set `is_admin` on themselves.
- Hebrew RTL UI, dark theme tokens from `src/app/globals.css`, shared components from `src/components/ui.tsx`.
- "Today" is the Israel date (`israelToday()`); dated benefits open for the whole month.
- Nothing reaches `benefits` without review approval (manual, chat, AI and monthly refresh).
- Test users must have "e2e" in their email; tests never touch the owner's data.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A normal user tries to change or delete a shared program or benefit** (the Sources delete button, or a crafted request): expected refused and the data unchanged → Task 10 RLS tests (update and delete).
2. **A user tries to make themselves admin** by updating their own profile: expected refused → Task 10.
3. **A private import attached to a shared program**: expected never to overwrite shared benefits or mark them "not seen" → Task 3 (`existingForImport`).
4. **Removing yourself or the last admin**: expected refused with a clear message → Task 3 (`adminGuard`).
5. **Two children born in the same month, or a child/anniversary benefit when no date is set**: expected the month listed once, and never open without a date → Task 1 (`openMonths`).

---

### Task 1: Special dates in the core logic

**Files:**
- Modify: `src/lib/core/types.ts`, `src/lib/core/dates.ts`, `src/lib/core/rank.ts`, `src/lib/core/browse.ts`, `src/lib/core/labels.ts`
- Create: `src/lib/core/specialDates.ts`
- Test: `src/lib/core/specialDates.test.ts`; update `dates.test.ts`, `rank.test.ts`, `browse.test.ts`

**Interfaces:**
- Produces:
  - Types: `Timing` adds `'anniversary_month' | 'child_birthday_month'`; `Child { name; birth_month }`; `Profile` gains optional `is_admin`, `anniversary_month`, `anniversary_day`, `children`, `reminded`; `Program`/`Store`/`Benefit` gain optional `user_id`; `WalletItem` gains optional `product_id`, `birthday_month`; `CardProduct`; `Snapshot.products?`.
  - `PersonalDates`, `datesOf(profile)`, `openMonths(timing, dates, itemBirthMonth?) → number[] | null`, `availability(b, dates, today, itemBirthMonth?) → 'available' | 'date_locked' | 'unavailable'`.
  - `itemAvailability(b, items, dates, today) → { state, lockedMonths }`; `Row`/`BrowseRow` use `dateLocked` + `lockedMonths` (was `birthdayLocked`).
  - `DateWindow { key; kind: 'birthday'|'anniversary'|'child'; label; month }`, `dateWindows(profile, wallet)`, `activeDateBenefits(snapshot, today) → { window, benefits }[]`.
  - Labels: `TIMING_ICON`, `WINDOW_ICON`, new `TIMING_LABELS` entries.
- Note: UI components still use the old prop names until Task 2, so `tsc`/`build` are red between Task 1 and Task 2; unit tests are green.

- [ ] **Step 1: Write the failing tests**

<!-- file: src/lib/core/specialDates.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { activeDateBenefits, dateWindows } from './specialDates';
import type { Benefit, Snapshot, WalletItem } from './types';

const day = (m: number) => ({ iso: `2026-${String(m).padStart(2, '0')}-15`, year: 2026, month: m });
const item = (id: string, type: WalletItem['type'], program_ids: string[], birthday_month: number | null = null): WalletItem =>
  ({ id, name: id, type, last4: null, nickname: null, color: null, program_ids, created_at: '', birthday_month });
const benefit = (id: string, program_id: string, timing: Benefit['timing'], requires: Benefit['requires'] = 'pay_with_card'): Benefit => ({
  id, program_id, store_id: null, category: null, title: id, description: null, type: 'percent_off', value: 10, min_spend: null,
  max_discount: null, requires, coupon_code: null, channel: 'both', timing, valid_from: null, valid_until: null, conditions: null,
  source_url: null, last_verified_at: '2026-10-01T00:00:00Z', status: 'active', created_at: '2026-10-01T00:00:00Z',
});
const profile = {
  user_id: 'u', birth_month: 9, email_reminders: true, last_reminder_year: null,
  anniversary_month: 6, children: [{ name: 'נועה', birth_month: 3 }],
};
const wallet = [item('cal', 'card', ['cal']), item('dream', 'membership', ['dream'], 3)];
const snapshot: Snapshot = {
  profile, programs: [], stores: [], wallet, fetchedAt: '',
  benefits: [
    benefit('calBday', 'cal', 'birthday_month'), benefit('dreamBday', 'dream', 'birthday_month', 'membership'),
    benefit('calKid', 'cal', 'child_birthday_month'), benefit('calAnniv', 'cal', 'anniversary_month'),
    benefit('calAlways', 'cal', 'always'),
  ],
};
const summary = (m: number) => activeDateBenefits(snapshot, day(m)).map((w) => [w.window.key, w.benefits.map((b) => b.id)]);

describe('dateWindows', () => {
  it('lists your birthday, club-specific birthdays, anniversary and each child', () => {
    expect(dateWindows(profile, wallet).map((w) => [w.key, w.month])).toEqual([
      ['birthday', 9], ['birthday:dream', 3], ['anniversary', 6], ['child:נועה', 3],
    ]);
  });
  it('skips a club birthday that equals your real birthday', () => {
    expect(dateWindows(profile, [item('x', 'card', [], 9)]).map((w) => w.key)).toEqual(['birthday', 'anniversary', 'child:נועה']);
  });
});

describe('activeDateBenefits', () => {
  it('in March opens the club-specific birthday and the child birthday', () => {
    expect(summary(3)).toEqual([['birthday:dream', ['dreamBday']], ['child:נועה', ['calKid']]]);
  });
  it('in your birth month opens only clubs without their own birthday month', () => {
    expect(summary(9)).toEqual([['birthday', ['calBday']]]);
  });
  it('in the anniversary month opens anniversary benefits', () => {
    expect(summary(6)).toEqual([['anniversary', ['calAnniv']]]);
  });
  it('opens nothing in other months', () => {
    expect(summary(11)).toEqual([]);
  });
});
```

<!-- patch -->
```python
import re
p = 'src/lib/core/dates.test.ts'
s = open(p, encoding='utf-8').read()
s = s.replace("  addDays, availability, isBirthdayMonth, isOutdated, isWithinValidity, israelToday, monthNameHe,",
              "  addDays, availability, datesOf, isBirthdayMonth, isOutdated, isWithinValidity, israelToday, monthNameHe, openMonths,")
s, n = re.subn(r"availability\((.+?), (\d+), day\(", r"availability(\1, datesOf({ birth_month: \2 }), day(", s)
assert n == 5, n
s = s.replace("'birthday_locked'", "'date_locked'")
s += """
describe('openMonths', () => {
  const dates = datesOf({ birth_month: 9, anniversary_month: 6, children: [{ name: 'a', birth_month: 3 }, { name: 'b', birth_month: 3 }] });
  it('always has no restriction', () => {
    expect(openMonths('always', dates)).toBeNull();
  });
  it('birthday uses the club-specific month when set', () => {
    expect(openMonths('birthday_month', dates)).toEqual([9]);
    expect(openMonths('birthday_month', dates, 2)).toEqual([2]);
  });
  it('anniversary, and children born in the same month listed once', () => {
    expect(openMonths('anniversary_month', dates)).toEqual([6]);
    expect(openMonths('child_birthday_month', dates)).toEqual([3]);
  });
  it('is never open when the date is not set', () => {
    expect(openMonths('anniversary_month', datesOf({ birth_month: 9 }))).toEqual([]);
    expect(availability({ status: 'active', timing: 'child_birthday_month', valid_from: null, valid_until: null },
      datesOf(null), day('2026-03-10'))).toBe('date_locked');
  });
});
"""
open(p, 'w', encoding='utf-8').write(s)

p = 'src/lib/core/rank.test.ts'
s = open(p, encoding='utf-8').read()
s = s.replace("import { birthdayBenefits, rankForStore } from './rank';", "import { rankForStore } from './rank';")
old = """describe('birthdayBenefits', () => {
  it('returns usable birthday benefits only in the birth month', () => {
    expect(birthdayBenefits(snapshot, SEP).map((b) => b.id)).toEqual(['calBirthday']);
    expect(birthdayBenefits(snapshot, OCT)).toEqual([]);
  });
});"""
assert old in s
s = s.replace(old, """describe('special dates in ranking', () => {
  it('reports the month a locked birthday benefit opens', () => {
    const r = rankForStore(snapshot, mango, 400, OCT);
    expect(r.pay.find((x) => x.benefit.id === 'calBirthday')?.lockedMonths).toEqual([9]);
  });
  it('uses a club-specific birthday month for that club', () => {
    const s = { ...snapshot, wallet: [{ ...snapshot.wallet[0], birthday_month: 10 }, snapshot.wallet[1]] };
    const row = rankForStore(s, mango, 400, OCT).pay.find((x) => x.benefit.id === 'calBirthday');
    expect(row?.dateLocked).toBe(false);
  });
});""")
assert s.count('birthdayLocked') >= 2
s = s.replace('birthdayLocked', 'dateLocked')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/lib/core/browse.test.ts'
s = open(p, encoding='utf-8').read()
assert 'birthdayLocked' in s
s = s.replace('birthdayLocked', 'dateLocked')
open(p, 'w', encoding='utf-8').write(s)
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `specialDates` cannot be resolved; `datesOf`/`openMonths` are not functions; `dateLocked` undefined.

- [ ] **Step 3: Implement**

<!-- file: src/lib/core/types.ts -->
```ts
export const PROGRAM_KINDS = ['card_issuer', 'club', 'store_club'] as const;
export const BENEFIT_TYPES = [
  'percent_off', 'fixed_off', 'cashback_percent', 'points', 'bogo', 'gift', 'installments', 'other',
] as const;
export const REQUIRES = ['pay_with_card', 'membership', 'coupon_code'] as const;
export const CHANNELS = ['in_store', 'online', 'both'] as const;
export const TIMINGS = ['always', 'birthday_month', 'anniversary_month', 'child_birthday_month'] as const;
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

export interface Child {
  name: string;
  birth_month: number; // 1-12
}

export interface Profile {
  user_id: string;
  birth_month: number; // 1-12
  email_reminders: boolean;
  last_reminder_year: number | null; // no longer used; see `reminded`
  is_admin?: boolean;
  anniversary_month?: number | null;
  anniversary_day?: number | null;
  children?: Child[];
  reminded?: string[]; // "<window key>:<year>" already e-mailed
}

/** `user_id`: null = shared catalog row, otherwise private to that user (optional in test fixtures). */
export interface Program {
  id: string;
  user_id?: string | null;
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
  product_id?: string | null; // card product it was created from
  birthday_month?: number | null; // the birthday month this club has on file ("fake" birthday)
}

export interface Store {
  id: string;
  user_id?: string | null;
  name_he: string;
  name_en: string;
  aliases: string[];
  category: Category;
  channel: Channel;
}

export interface Benefit {
  id: string;
  user_id?: string | null;
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

/** A ready-made card or membership that knows which programs it unlocks. */
export interface CardProduct {
  id: string;
  user_id?: string | null;
  name: string;
  type: 'card' | 'membership';
  program_ids: string[];
}

export interface Snapshot {
  profile: Profile | null;
  programs: Program[];
  wallet: WalletItem[];
  stores: Store[];
  benefits: Benefit[]; // never includes archived
  products?: CardProduct[];
  fetchedAt: string;
}
```

<!-- file: src/lib/core/dates.ts -->
```ts
import type { Benefit, Child, Timing } from './types';

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

export interface PersonalDates {
  birthMonth: number | null;
  anniversaryMonth: number | null;
  childMonths: number[];
}

export function datesOf(
  profile: { birth_month?: number | null; anniversary_month?: number | null; children?: Child[] } | null | undefined,
): PersonalDates {
  return {
    birthMonth: profile?.birth_month ?? null,
    anniversaryMonth: profile?.anniversary_month ?? null,
    childMonths: (profile?.children ?? []).map((c) => c.birth_month),
  };
}

/** Months in which a dated benefit is open; null = no date restriction; [] = date not set, never open. */
export function openMonths(timing: Timing, dates: PersonalDates, itemBirthMonth?: number | null): number[] | null {
  switch (timing) {
    case 'always':
      return null;
    case 'birthday_month': {
      const m = itemBirthMonth ?? dates.birthMonth;
      return m ? [m] : [];
    }
    case 'anniversary_month':
      return dates.anniversaryMonth ? [dates.anniversaryMonth] : [];
    case 'child_birthday_month':
      return [...new Set(dates.childMonths)].sort((a, b) => a - b);
  }
}

export type Availability = 'available' | 'date_locked' | 'unavailable';

export function availability(
  b: Pick<Benefit, 'status' | 'timing' | 'valid_from' | 'valid_until'>,
  dates: PersonalDates,
  today: IsraelDay,
  itemBirthMonth?: number | null,
): Availability {
  if (b.status !== 'active' || !isWithinValidity(b, today.iso)) return 'unavailable';
  const months = openMonths(b.timing, dates, itemBirthMonth);
  if (months === null || months.includes(today.month)) return 'available';
  return 'date_locked';
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

<!-- file: src/lib/core/rank.ts -->
```ts
import { availability, datesOf, openMonths, type Availability, type IsraelDay, type PersonalDates } from './dates';
import { computeSavings, type Savings } from './savings';
import { COMPUTABLE_TYPES, type Benefit, type Program, type Snapshot, type Store, type WalletItem } from './types';

export interface Row {
  benefit: Benefit;
  program: Program;
  items: WalletItem[]; // wallet items to pay with / show
  savings: Savings | null; // null when not computable or no amount entered
  dateLocked: boolean; // a dated benefit outside its month
  lockedMonths: number[]; // when it opens (empty = date not set)
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

/** A dated benefit can open in different months per wallet item (club-specific birthday). Open if any item is open. */
export function itemAvailability(
  b: Benefit,
  items: WalletItem[],
  dates: PersonalDates,
  today: IsraelDay,
): { state: Availability; lockedMonths: number[] } {
  const targets = items.length ? items.map((i) => i.birthday_month ?? null) : [null];
  const states = targets.map((m) => availability(b, dates, today, m));
  if (states.includes('available')) return { state: 'available', lockedMonths: [] };
  if (!states.includes('date_locked')) return { state: 'unavailable', lockedMonths: [] };
  const months = new Set<number>();
  for (const m of targets) for (const x of openMonths(b.timing, dates, m) ?? []) months.add(x);
  return { state: 'date_locked', lockedMonths: [...months].sort((x, y) => x - y) };
}

const OTHER_ORDER = ['bogo', 'gift', 'installments', 'points', 'other'];

/** [group, value]: percent types first by value, then fixed by value, then the rest grouped by type. */
function headline(b: Benefit): [number, number] {
  if (b.type === 'percent_off' || b.type === 'cashback_percent') return [0, b.value ?? 0];
  if (b.type === 'fixed_off') return [1, b.value ?? 0];
  return [2 + OTHER_ORDER.indexOf(b.type), 0];
}

function compareRows(a: Row, b: Row): number {
  if (a.dateLocked !== b.dateLocked) return a.dateLocked ? 1 : -1;
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
  const dates = datesOf(snapshot.profile);
  const result: RankResult = { pay: [], other: [], show: [] };

  for (const benefit of snapshot.benefits) {
    if (!appliesToStore(benefit, store)) continue;
    if (channel && benefit.channel !== 'both' && benefit.channel !== channel) continue;
    const program = programs.get(benefit.program_id);
    if (!program) continue;
    const items = eligibleItems(benefit, snapshot.wallet);
    if (items.length === 0) continue;
    const { state, lockedMonths } = itemAvailability(benefit, items, dates, today);
    if (state === 'unavailable') continue;

    const computable = COMPUTABLE_TYPES.includes(benefit.type);
    const row: Row = {
      benefit,
      program,
      items,
      savings: computable && amount != null && amount > 0 ? computeSavings(benefit, amount) : null,
      dateLocked: state === 'date_locked',
      lockedMonths,
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

/** Kept until Task 2 replaces its callers with `activeDateBenefits`. */
export function birthdayBenefits(snapshot: Snapshot, today: IsraelDay): Benefit[] {
  const dates = datesOf(snapshot.profile);
  return snapshot.benefits.filter((b) => {
    if (b.timing !== 'birthday_month') return false;
    const items = eligibleItems(b, snapshot.wallet);
    return items.length > 0 && itemAvailability(b, items, dates, today).state === 'available';
  });
}

/** The single best ₪ saving for the entered amount, across "pay with" and "show" benefits; null without an amount. */
export function bestRowId(result: RankResult): string | null {
  let best: Row | null = null;
  for (const row of [...result.pay, ...result.show]) {
    if (row.dateLocked || !row.savings || row.savings.spendMore > 0 || row.savings.saved <= 0) continue;
    if (!best || row.savings.saved > best.savings!.saved) best = row;
  }
  return best?.benefit.id ?? null;
}
```

<!-- file: src/lib/core/specialDates.ts -->
```ts
import { availability, datesOf, type IsraelDay } from './dates';
import { eligibleItems } from './rank';
import type { Benefit, Profile, Snapshot, Timing, WalletItem } from './types';

export interface DateWindow {
  key: string; // stable id used for "already reminded" bookkeeping
  kind: 'birthday' | 'anniversary' | 'child';
  label: string;
  month: number;
}

const TIMING_OF: Record<DateWindow['kind'], Timing> = {
  birthday: 'birthday_month',
  anniversary: 'anniversary_month',
  child: 'child_birthday_month',
};

/** Your birthday, each club that has a different birthday on file, your anniversary, and each child. */
export function dateWindows(profile: Profile | null, wallet: WalletItem[]): DateWindow[] {
  const windows: DateWindow[] = [];
  if (profile?.birth_month) windows.push({ key: 'birthday', kind: 'birthday', label: 'יום ההולדת שלך', month: profile.birth_month });
  for (const item of wallet) {
    if (item.birthday_month && item.birthday_month !== profile?.birth_month) {
      windows.push({ key: `birthday:${item.id}`, kind: 'birthday', label: `יום ההולדת שלך ב${item.nickname || item.name}`, month: item.birthday_month });
    }
  }
  if (profile?.anniversary_month) windows.push({ key: 'anniversary', kind: 'anniversary', label: 'יום הנישואין', month: profile.anniversary_month });
  for (const child of profile?.children ?? []) {
    windows.push({ key: `child:${child.name}`, kind: 'child', label: `יום ההולדת של ${child.name}`, month: child.birth_month });
  }
  return windows;
}

/** Windows open this month with the benefits each one unlocks right now. */
export function activeDateBenefits(snapshot: Snapshot, today: IsraelDay): { window: DateWindow; benefits: Benefit[] }[] {
  const dates = datesOf(snapshot.profile);
  const out: { window: DateWindow; benefits: Benefit[] }[] = [];
  for (const window of dateWindows(snapshot.profile, snapshot.wallet)) {
    if (window.month !== today.month) continue;
    const benefits = snapshot.benefits.filter((b) => {
      if (b.timing !== TIMING_OF[window.kind]) return false;
      let items = eligibleItems(b, snapshot.wallet);
      if (window.kind === 'birthday') {
        items = window.key === 'birthday'
          ? items.filter((i) => !i.birthday_month || i.birthday_month === window.month)
          : items.filter((i) => `birthday:${i.id}` === window.key);
      }
      return items.some((i) => availability(b, dates, today, i.birthday_month) === 'available');
    });
    if (benefits.length) out.push({ window, benefits });
  }
  return out;
}
```

<!-- file: src/lib/core/browse.ts -->
```ts
import { addDays, datesOf, type IsraelDay } from './dates';
import { normalize } from './normalize';
import { eligibleItems, itemAvailability } from './rank';
import type { Benefit, BenefitType, Category, Program, Snapshot, Store, WalletItem } from './types';

export interface BrowseFilters {
  q: string;
  programId: string | null;
  walletItemId: string | null;
  category: Category | null;
  type: BenefitType | null;
  channel: 'in_store' | 'online' | null;
  birthday: boolean; // any special-date benefit (birthday, anniversary, child)
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
  dateLocked: boolean;
  lockedMonths: number[];
}

const RECENT_MS = 14 * 86_400_000;

export function browseBenefits(snapshot: Snapshot, f: BrowseFilters, today: IsraelDay, now: Date): BrowseRow[] {
  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));
  const stores = new Map(snapshot.stores.map((s) => [s.id, s]));
  const dates = datesOf(snapshot.profile);
  const q = normalize(f.q);
  const weekEnd = addDays(today.iso, 7);
  const rows: BrowseRow[] = [];

  for (const b of snapshot.benefits) {
    const program = programs.get(b.program_id);
    if (!program) continue;
    const items = eligibleItems(b, snapshot.wallet);
    const { state, lockedMonths } = itemAvailability(b, items, dates, today);
    if (state === 'unavailable') continue;
    const store = b.store_id ? stores.get(b.store_id) ?? null : null;

    if (f.onlyMine && items.length === 0) continue;
    if (f.programId && b.program_id !== f.programId) continue;
    if (f.walletItemId && !items.some((i) => i.id === f.walletItemId)) continue;
    if (f.category && (store?.category ?? b.category) !== f.category) continue;
    if (f.type && b.type !== f.type) continue;
    if (f.channel && b.channel !== 'both' && b.channel !== f.channel) continue;
    if (f.birthday && b.timing === 'always') continue;
    if (f.expiringThisWeek && !(b.valid_until && b.valid_until <= weekEnd)) continue;
    if (f.recent && now.getTime() - new Date(b.created_at).getTime() > RECENT_MS) continue;
    if (q) {
      const texts = [b.title, program.name, store?.name_he, store?.name_en, ...(store?.aliases ?? [])];
      if (!texts.some((t) => t && normalize(t).includes(q))) continue;
    }
    rows.push({ benefit: b, program, store, items, dateLocked: state === 'date_locked', lockedMonths });
  }
  return rows.sort((a, b) => b.benefit.created_at.localeCompare(a.benefit.created_at));
}
```

<!-- patch -->
```python
p = 'src/lib/core/labels.ts'
s = open(p, encoding='utf-8').read()
old = "export const TIMING_LABELS: Record<Timing, string> = { always: 'תמיד', birthday_month: 'חודש יום ההולדת' };"
assert old in s
s = s.replace(old, """export const TIMING_LABELS: Record<Timing, string> = {
  always: 'תמיד', birthday_month: 'חודש יום ההולדת', anniversary_month: 'חודש יום הנישואין',
  child_birthday_month: 'חודש יום הולדת של ילד',
};
export const TIMING_ICON: Record<Timing, string> = {
  always: '', birthday_month: '🎂', anniversary_month: '💍', child_birthday_month: '🎈',
};
export const WINDOW_ICON: Record<'birthday' | 'anniversary' | 'child', string> = { birthday: '🎂', anniversary: '💍', child: '🎈' };""")
open(p, 'w', encoding='utf-8').write(s)
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/core
git commit -m "feat: special-date windows (anniversary, children, club birthday) in core logic" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Special dates in the screens, email and import rules

**Files:**
- Modify: `src/components/BenefitCard.tsx`, `src/app/(tabs)/page.tsx`, `src/app/(tabs)/benefits/page.tsx`, `src/lib/core/rank.ts` (remove `birthdayBenefits`), `src/lib/ai/prompt.ts`
- Replace: `src/lib/email/birthdayEmail.ts` (now `buildDateEmail`), `src/app/api/cron/birthday/route.ts`
- Test: `src/lib/email/birthdayEmail.test.ts`

**Interfaces:**
- Consumes: Task 1 (`activeDateBenefits`, `DateWindow`, `Row.dateLocked/lockedMonths`, `TIMING_ICON`, `WINDOW_ICON`).
- Produces: `<BenefitCard … dateLocked lockedMonths best? />` (props `birthdayLocked`/`birthMonth` removed; shows "פרטי" for private benefits); `buildDateEmail(sections, data, appUrl) → { subject, html }`.

- [ ] **Step 1: Write the failing test**

<!-- file: src/lib/email/birthdayEmail.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import type { DateWindow } from '@/lib/core/specialDates';
import type { Benefit } from '@/lib/core/types';
import { buildDateEmail } from './birthdayEmail';

const benefit = (id: string, program_id: string, title: string, store_id: string | null = null) =>
  ({ id, program_id, title, store_id }) as Benefit;
const win = (key: string, kind: DateWindow['kind'], label: string): DateWindow => ({ key, kind, label, month: 9 });
const data = {
  programs: [{ id: 'p1', name: 'רי-בר' }, { id: 'p2', name: 'דרים קארד' }] as never,
  stores: [{ id: 's1', name_he: 'קסטרו' }] as never,
};

describe('buildDateEmail', () => {
  const email = buildDateEmail([
    { window: win('birthday', 'birthday', 'יום ההולדת שלך'), benefits: [benefit('a', 'p1', 'שייק חינם'), benefit('c', 'p1', '<script>x</script>')] },
    { window: win('child:נועה', 'child', 'יום ההולדת של נועה'), benefits: [benefit('b', 'p2', '20% הנחה', 's1')] },
  ], data, 'https://app.example');

  it('counts all benefits in the subject', () => {
    expect(email.subject).toContain('3 הטבות');
  });
  it('has a section per date with its icon', () => {
    expect(email.html).toContain('🎂 יום ההולדת שלך');
    expect(email.html).toContain('🎈 יום ההולדת של נועה');
  });
  it('groups by program and names the store', () => {
    expect(email.html.indexOf('רי-בר')).toBeLessThan(email.html.indexOf('שייק חינם'));
    expect(email.html).toContain('20% הנחה — קסטרו');
  });
  it('escapes HTML coming from benefit pages', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
  it('links to the special-dates filter and is right-to-left', () => {
    expect(email.html).toContain('href="https://app.example/benefits?birthday=1"');
    expect(email.html).toContain('dir="rtl"');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/email`
Expected: FAIL — `buildDateEmail is not a function`.

- [ ] **Step 3: Implement**

<!-- file: src/lib/email/birthdayEmail.ts -->
```ts
import { WINDOW_ICON } from '@/lib/core/labels';
import type { DateWindow } from '@/lib/core/specialDates';
import type { Benefit, Snapshot } from '@/lib/core/types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** One e-mail for every special date that opened this month (birthday, club birthday, anniversary, children). */
export function buildDateEmail(
  sections: { window: DateWindow; benefits: Benefit[] }[],
  data: Pick<Snapshot, 'programs' | 'stores'>,
  appUrl: string,
): { subject: string; html: string } {
  const programName = new Map(data.programs.map((p) => [p.id, p.name]));
  const storeName = new Map(data.stores.map((s) => [s.id, s.name_he]));
  const total = sections.reduce((n, s) => n + s.benefits.length, 0);

  const body = sections
    .map(({ window, benefits }) => {
      const byProgram = new Map<string, Benefit[]>();
      for (const b of benefits) byProgram.set(b.program_id, [...(byProgram.get(b.program_id) ?? []), b]);
      const groups = [...byProgram]
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
      return `<h2>${WINDOW_ICON[window.kind]} ${esc(window.label)}</h2>${groups}`;
    })
    .join('');

  return {
    subject: `🎉 ${total} הטבות לתאריכים מיוחדים מחכות לך החודש`,
    html:
      `<div dir="rtl" style="font-family:Arial,sans-serif">` +
      `<p>החודש נפתחו הטבות לתאריכים המיוחדים שלך:</p>` +
      body +
      `<p><a href="${esc(appUrl)}/benefits?birthday=1">לכל ההטבות באפליקציה</a></p></div>`,
  };
}
```

<!-- file: src/app/api/cron/birthday/route.ts -->
```ts
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
```

<!-- file: src/components/BenefitCard.tsx -->
```tsx
'use client';
import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { cardArtFor } from '@/lib/core/cardArt';
import { isOutdated, monthNameHe } from '@/lib/core/dates';
import {
  CHANNEL_LABELS, REQUIRES_LABELS, TIMING_ICON, TIMING_LABELS, formatDate, headlineText, shekel,
} from '@/lib/core/labels';
import type { Savings } from '@/lib/core/savings';
import type { Benefit, Program, Store, WalletItem } from '@/lib/core/types';

interface Props {
  benefit: Benefit;
  program: Program;
  items: WalletItem[];
  store: Store | null;
  savings: Savings | null;
  dateLocked: boolean;
  lockedMonths: number[];
  best?: boolean;
}

export default function BenefitCard({ benefit, program, items, store, savings, dateLocked, lockedMonths, best = false }: Props) {
  const [copied, setCopied] = useState(false);
  const who = items.map((i) => i.nickname || i.name).join(' / ');
  const action = benefit.requires === 'pay_with_card' ? 'שלמו עם' : 'הציגו';
  const art = cardArtFor([items[0]?.name ?? '', program.name]);
  const swatch = items[0]?.color ?? '#5d6782';
  const swatchBg = art ? `linear-gradient(135deg, ${art.from}, ${art.to})` : `linear-gradient(135deg, ${swatch}, ${swatch}99)`;
  const met = savings !== null && savings.spendMore === 0 && savings.saved > 0;
  const outdated = isOutdated(benefit.last_verified_at, new Date());
  const isPrivate = Boolean(benefit.user_id);

  async function copyCode() {
    if (!benefit.coupon_code) return;
    await navigator.clipboard.writeText(benefit.coupon_code);
    setCopied(true);
  }

  return (
    <li className={`rounded-2xl border bg-panel p-3.5 transition ${best ? 'border-mint' : 'border-line'} ${dateLocked ? 'opacity-50' : ''}`}>
      {best && (
        <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-mint">
          <Sparkles size={14} aria-hidden /> הכי משתלם
        </p>
      )}
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid h-7 w-11 shrink-0 place-items-center overflow-hidden rounded-md px-0.5 text-[6px] font-black leading-none tracking-wider text-white/90"
          style={{ background: swatchBg }}>{art?.mark}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-fg">
            {benefit.timing !== 'always' && <span aria-label={TIMING_LABELS[benefit.timing]}>{TIMING_ICON[benefit.timing]} </span>}
            {benefit.title}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {action} <span className="text-fg">{who}</span> · {program.name}
            {store ? ` · ${store.name_he}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-end">
          {met ? (
            <>
              <p className="text-lg font-bold leading-none text-mint">{shekel(savings.saved)}</p>
              <p className="mt-1 text-[11px] text-dim">חיסכון</p>
            </>
          ) : (
            <span className="rounded-lg bg-panel-2 px-2 py-1 text-xs font-semibold text-fg">{headlineText(benefit)}</span>
          )}
        </div>
      </div>

      {(dateLocked || (savings && savings.spendMore > 0) || benefit.coupon_code || outdated || isPrivate) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
          {dateLocked && (
            <span className="rounded-full bg-party/10 px-2 py-1 text-party">
              {lockedMonths.length ? `זמין ב${lockedMonths.map(monthNameHe).join(' / ')}` : 'הוסיפו את התאריך בהגדרות'}
            </span>
          )}
          {savings && savings.spendMore > 0 && (
            <span className="rounded-full bg-warn/10 px-2 py-1 text-warn">
              הוסיפו {shekel(savings.spendMore)} לקנייה כדי לחסוך {shekel(savings.potential)}
            </span>
          )}
          {benefit.coupon_code && (
            <button onClick={copyCode} dir="ltr"
              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 font-mono text-fg">
              {benefit.coupon_code} {copied ? <Check size={12} aria-label="הועתק" /> : <Copy size={12} aria-label="העתקה" />}
            </button>
          )}
          {isPrivate && <span className="rounded-full border border-line px-2 py-1 text-dim">פרטי</span>}
          {outdated && <span className="rounded-full bg-panel-2 px-2 py-1 text-dim">ייתכן שלא מעודכן</span>}
        </div>
      )}

      <details className="group mt-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-dim hover:text-muted">
          פרטים <ChevronDown size={14} className="transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2 space-y-1.5 border-t border-line pt-2 text-muted">
          {benefit.description && <p>{benefit.description}</p>}
          {benefit.conditions && <p>{benefit.conditions}</p>}
          <p className="text-xs text-dim">
            {REQUIRES_LABELS[benefit.requires]} · {CHANNEL_LABELS[benefit.channel]}
            {benefit.min_spend ? ` · מינימום ${shekel(benefit.min_spend)}` : ''}
            {benefit.max_discount ? ` · עד ${shekel(benefit.max_discount)}` : ''}
            {benefit.valid_until ? ` · בתוקף עד ${formatDate(benefit.valid_until)}` : ''}
          </p>
          {benefit.source_url && (
            <a href={benefit.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-mint">
              למקור <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </div>
      </details>
    </li>
  );
}
```

<!-- patch -->
```python
def sub(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)

# Home: banner from all active special dates; new BenefitCard props.
sub('src/app/(tabs)/page.tsx', [
    ("import { Cake, ChevronLeft, Search, Store as StoreIcon, WifiOff, X } from 'lucide-react';",
     "import { ChevronLeft, Search, Store as StoreIcon, WifiOff, X } from 'lucide-react';"),
    ("import { isBirthdayMonth, israelToday } from '@/lib/core/dates';", "import { israelToday } from '@/lib/core/dates';"),
    ("import { CATEGORY_LABELS } from '@/lib/core/labels';", "import { CATEGORY_LABELS, WINDOW_ICON } from '@/lib/core/labels';"),
    ("import { bestRowId, birthdayBenefits, rankForStore, type Row } from '@/lib/core/rank';",
     "import { bestRowId, rankForStore, type Row } from '@/lib/core/rank';"),
    ("import { parseAmount } from '@/lib/core/savings';",
     "import { parseAmount } from '@/lib/core/savings';\nimport { activeDateBenefits } from '@/lib/core/specialDates';"),
    ("  const birthMonth = snapshot.profile?.birth_month ?? null;\n", ""),
    ("  const birthdayCount = isBirthdayMonth(birthMonth, today) ? birthdayBenefits(snapshot, today).length : 0;",
     "  const windows = activeDateBenefits(snapshot, today);"),
    ("<BenefitCard key={r.benefit.id} {...r} store={store} birthMonth={birthMonth} best={r.benefit.id === best} />",
     "<BenefitCard key={r.benefit.id} {...r} store={store} best={r.benefit.id === best} />"),
    ("""      {birthdayCount > 0 && (
        <Link href="/benefits?birthday=1"
          className="flex items-center gap-3 rounded-2xl border border-party/30 bg-party/10 p-3.5 text-party">
          <Cake size={22} aria-hidden />
          <span className="flex-1 font-semibold">חודש יום ההולדת — {birthdayCount} הטבות מחכות לכם</span>
          <ChevronLeft size={18} aria-hidden />
        </Link>
      )}""",
     """      {windows.length > 0 && (
        <Link href="/benefits?birthday=1"
          className="flex items-center gap-3 rounded-2xl border border-party/30 bg-party/10 p-3.5 text-party">
          <span className="flex-1 space-y-1">
            {windows.map(({ window, benefits }) => (
              <span key={window.key} className="flex items-center gap-2 font-semibold">
                <span aria-hidden>{WINDOW_ICON[window.kind]}</span> {window.label} — {benefits.length} הטבות פעילות החודש
              </span>
            ))}
          </span>
          <ChevronLeft size={18} aria-hidden />
        </Link>
      )}"""),
])

# All benefits: new props, filter label covers every special date.
sub('src/app/(tabs)/benefits/page.tsx', [
    ("  ['birthday', '🎂 יום הולדת'],", "  ['birthday', '🎉 תאריכים מיוחדים'],"),
    ("  const birthMonth = snapshot.profile?.birth_month ?? null;\n", ""),
    ("savings={null} birthdayLocked={r.birthdayLocked} birthMonth={birthMonth} />",
     "savings={null} dateLocked={r.dateLocked} lockedMonths={r.lockedMonths} />"),
])

# Remove the temporary helper; every caller now uses activeDateBenefits.
p = 'src/lib/core/rank.ts'
s = open(p, encoding='utf-8').read()
start = s.index('/** Kept until Task 2 replaces its callers')
end = s.index('/** The single best')
s = s[:start] + s[end:]
open(p, 'w', encoding='utf-8').write(s)

# Teach the importers the new date kinds.
sub('src/lib/ai/prompt.ts', [
    ("- timing: birthday_month for any birthday benefit (birthday month, birthday week or birthday day); otherwise always.",
     "- timing: birthday_month for any birthday benefit (birthday month, birthday week or birthday day); anniversary_month for wedding-anniversary benefits (\"יום נישואין\"); child_birthday_month for benefits for a child's birthday (\"יום הולדת לילד\"); otherwise always."),
])
```

- [ ] **Step 4: Run tests, typecheck and build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all PASS, no type errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: special dates in screens, reminder e-mail and import rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Catalog helpers

**Files:**
- Create: `src/lib/core/catalog.ts`
- Modify: `src/lib/core/review.ts` (`existingForImport`, `ImportRow.shared`)
- Test: `src/lib/core/catalog.test.ts`; extend `src/lib/core/review.test.ts`

**Interfaces:**
- Produces: `isShared(row)`, `walletItemFromProduct(product) → { name, type, program_ids, product_id }`, `needsCatalogUpdate(item, product)`, `adminGuard(action: 'remove'|'demote', actorId, targetId, adminIds) → 'self'|'last_admin'|null`, `existingForImport(benefits, programId, shared, userId)`.

- [ ] **Step 1: Write the failing tests**

<!-- file: src/lib/core/catalog.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { adminGuard, isShared, needsCatalogUpdate, walletItemFromProduct } from './catalog';
import type { CardProduct } from './types';

const product: CardProduct = { id: 'prod-max-histadrut', user_id: null, name: 'מקס של ביחד בשבילך', type: 'card', program_ids: ['max', 'histadrut'] };

describe('isShared', () => {
  it('treats rows without an owner as shared', () => {
    expect(isShared({ user_id: null })).toBe(true);
    expect(isShared({})).toBe(true);
    expect(isShared({ user_id: 'u1' })).toBe(false);
  });
});

describe('walletItemFromProduct', () => {
  it('copies the name, type and programs and remembers the product', () => {
    expect(walletItemFromProduct(product)).toEqual({ name: 'מקס של ביחד בשבילך', type: 'card', program_ids: ['max', 'histadrut'], product_id: 'prod-max-histadrut' });
  });
  it('does not share the programs list with the product', () => {
    const item = walletItemFromProduct(product);
    item.program_ids.push('x');
    expect(product.program_ids).toEqual(['max', 'histadrut']);
  });
});

describe('needsCatalogUpdate', () => {
  it('is false when the programs match in any order', () => {
    expect(needsCatalogUpdate({ product_id: product.id, program_ids: ['histadrut', 'max'] }, product)).toBe(false);
  });
  it('is true when the product gained or lost a program', () => {
    expect(needsCatalogUpdate({ product_id: product.id, program_ids: ['max'] }, product)).toBe(true);
  });
  it('is false for items from another product or without one', () => {
    expect(needsCatalogUpdate({ product_id: 'other', program_ids: [] }, product)).toBe(false);
    expect(needsCatalogUpdate({ product_id: product.id, program_ids: [] }, undefined)).toBe(false);
  });
});

describe('adminGuard', () => {
  it('refuses removing yourself', () => {
    expect(adminGuard('remove', 'me', 'me', ['me', 'other'])).toBe('self');
  });
  it('refuses removing or demoting the last admin', () => {
    expect(adminGuard('demote', 'me', 'me', ['me'])).toBe('last_admin');
    expect(adminGuard('remove', 'me', 'solo', ['solo'])).toBe('last_admin');
  });
  it('allows other changes', () => {
    expect(adminGuard('remove', 'me', 'friend', ['me'])).toBeNull();
    expect(adminGuard('demote', 'me', 'other', ['me', 'other'])).toBeNull();
  });
});
```

<!-- patch -->
```python
p = 'src/lib/core/review.test.ts'
s = open(p, encoding='utf-8').read()
old = "import { blankRow, planNewStores, rowProblems, scopePatch, scopeValue, toIncoming, type NewStoreDraft, type ReviewRow } from './review';\nimport type { Store } from './types';"
assert old in s
s = s.replace(old, "import { blankRow, existingForImport, planNewStores, rowProblems, scopePatch, scopeValue, toIncoming, type NewStoreDraft, type ReviewRow } from './review';\nimport type { Benefit, Store } from './types';")
s += """
describe('existingForImport', () => {
  const b = (id: string, program_id: string, user_id: string | null, status: Benefit['status'] = 'active') =>
    ({ id, program_id, user_id, status }) as Benefit;
  const all = [b('shared1', 'max', null), b('mine1', 'max', 'me'), b('theirs', 'max', 'other'), b('old', 'max', null, 'archived'), b('cal1', 'cal', null)];
  it('a shared import merges only with shared benefits of that program', () => {
    expect(existingForImport(all, 'max', true, 'me').map((x) => x.id)).toEqual(['shared1']);
  });
  it('a private import never touches shared benefits', () => {
    expect(existingForImport(all, 'max', false, 'me').map((x) => x.id)).toEqual(['mine1']);
  });
});
"""
open(p, 'w', encoding='utf-8').write(s)
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/core/catalog.test.ts src/lib/core/review.test.ts`
Expected: FAIL — cannot resolve `./catalog`; `existingForImport is not a function`.

- [ ] **Step 3: Implement**

<!-- file: src/lib/core/catalog.ts -->
```ts
import type { CardProduct, WalletItem } from './types';

/** A row without an owner belongs to the shared catalog. */
export const isShared = (row: { user_id?: string | null }): boolean => row.user_id == null;

export function walletItemFromProduct(p: CardProduct): {
  name: string;
  type: CardProduct['type'];
  program_ids: string[];
  product_id: string;
} {
  return { name: p.name, type: p.type, program_ids: [...p.program_ids], product_id: p.id };
}

/** True when the catalog product now unlocks different programs than this wallet item copied. */
export function needsCatalogUpdate(item: Pick<WalletItem, 'program_ids' | 'product_id'>, product: CardProduct | undefined): boolean {
  if (!product || item.product_id !== product.id) return false;
  const key = (ids: string[]) => [...new Set(ids)].sort().join(',');
  return key(item.program_ids) !== key(product.program_ids);
}

export type AdminAction = 'remove' | 'demote';

/** Why an admin change is refused, or null when it is fine. There must always be at least one admin. */
export function adminGuard(action: AdminAction, actorId: string, targetId: string, adminIds: string[]): 'self' | 'last_admin' | null {
  if (action === 'remove' && targetId === actorId) return 'self';
  if (adminIds.includes(targetId) && adminIds.length <= 1) return 'last_admin';
  return null;
}
```

<!-- patch -->
```python
p = 'src/lib/core/review.ts'
s = open(p, encoding='utf-8').read()
s = s.replace("import type { Category, Channel, Store } from './types';", "import type { Benefit, Category, Channel, Store } from './types';")
old = "  error: string | null;\n  created_at: string;\n}"
assert old in s
s = s.replace(old, "  error: string | null;\n  created_at: string;\n  shared?: boolean; // admin import into the shared catalog\n}")
s += """
/** Benefits an import may update: same program and same ownership (shared ↔ shared, private ↔ your own). */
export function existingForImport(benefits: Benefit[], programId: string, shared: boolean, userId: string): Benefit[] {
  return benefits.filter((b) =>
    b.program_id === programId && b.status !== 'archived' && (shared ? b.user_id == null : b.user_id === userId));
}
"""
open(p, 'w', encoding='utf-8').write(s)
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core
git commit -m "feat: catalog helpers — product to wallet item, catalog updates, admin guard, ownership-safe merge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Well-known stores list

**Files:**
- Create: `src/lib/seedStores.ts`
- Test: `src/lib/seedStores.test.ts`

**Interfaces:**
- Produces: `SEED_STORES: { name_he; name_en; aliases: string[]; category: Category; channel: Channel }[]`.

- [ ] **Step 1: Write the failing test**

<!-- file: src/lib/seedStores.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { normalize, searchStores } from './core/normalize';
import { CATEGORIES, type Store } from './core/types';
import { SEED_STORES } from './seedStores';

const asStores: Store[] = SEED_STORES.map((s, i) => ({ id: `s${i}`, ...s }));

describe('SEED_STORES', () => {
  it('has well over 150 stores, each with both names and a valid category', () => {
    expect(SEED_STORES.length).toBeGreaterThan(150);
    for (const s of SEED_STORES) {
      expect(s.name_he.trim(), JSON.stringify(s)).not.toBe('');
      expect(s.name_en.trim(), JSON.stringify(s)).not.toBe('');
      expect(CATEGORIES).toContain(s.category);
    }
  });
  it('never uses the same name or alias for two stores', () => {
    const seen = new Map<string, string>();
    for (const s of SEED_STORES) {
      for (const key of new Set([s.name_he, s.name_en, ...s.aliases].map(normalize))) {
        expect(seen.get(key), `"${key}" used by ${seen.get(key)} and ${s.name_en}`).toBeUndefined();
        seen.set(key, s.name_en);
      }
    }
  });
  it.each([['סופרפארם', 'Super-Pharm'], ['zara', 'Zara'], ['מקדונלדס', "McDonald's"], ['ikea', 'IKEA'], ['yellow', 'Paz']])(
    '"%s" finds %s',
    (q, en) => {
      expect(searchStores(asStores, q)[0]?.name_en).toBe(en);
    },
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/seedStores.test.ts`
Expected: FAIL — cannot resolve `./seedStores`.

- [ ] **Step 3: Implement**

<!-- file: src/lib/seedStores.ts -->
```ts
import type { Category, Channel } from './core/types';

type Row = [name_he: string, name_en: string, category: Category, aliases?: string[], channel?: Channel];

/** Well-known Israeli chains, loaded once into the shared catalog so search and category benefits find them. */
const ROWS: Row[] = [
  // Food & supermarkets
  ['שופרסל', 'Shufersal', 'food', ['שופרסל דיל', 'שופרסל אקספרס', 'שופרסל שלי', 'שופרסל אונליין', 'Shufersal Deal']],
  ['רמי לוי', 'Rami Levy', 'food', ['רמי לוי שיווק השקמה']],
  ['ויקטורי', 'Victory', 'food'],
  ['יוחננוף', 'Yochananof', 'food'],
  ['אושר עד', 'Osher Ad', 'food'],
  ['יינות ביתן', 'Yeinot Bitan', 'food'],
  ['טיב טעם', 'Tiv Taam', 'food'],
  ['חצי חינם', 'Hatzi Hinam', 'food'],
  ['קרפור', 'Carrefour', 'food', ['קרפור מרקט', 'קרפור סיטי']],
  ['איי אם פי אם', 'AM:PM', 'food', ['am pm', 'איי.אם.פי.אם']],
  ['סטופ מרקט', 'Stop Market', 'food'],
  ['מחסני השוק', 'Mahsanei HaShuk', 'food'],
  ['קשת טעמים', 'Keshet Teamim', 'food'],
  ['פרשמרקט', 'Freshmarket', 'food', ['פרש מרקט']],
  ['זול ובגדול', 'Zol Ubegadol', 'food'],
  ['יש חסד', 'Yesh Hesed', 'food'],
  ['נתיב החסד', 'Netiv HaHesed', 'food'],
  ['קואופ שופ', 'Coop Shop', 'food', ['קואופ']],
  ['סופר יודה', 'Super Yuda', 'food'],
  ['היפר כהן', 'Hyper Cohen', 'food'],
  ['שוק העיר', 'Shuk HaIr', 'food'],
  ['מקס סטוק', 'Max Stock', 'home'],
  // Fuel
  ['פז', 'Paz', 'fuel', ['פז ילו', 'ילו', 'Yellow']],
  ['דלק', 'Delek', 'fuel', ['מנטה', 'Menta']],
  ['סונול', 'Sonol', 'fuel'],
  ['דור אלון', 'Dor Alon', 'fuel', ['אלונית', 'Alonit']],
  ['טן', 'Ten', 'fuel', ['Ten Petroleum', 'טן דלק']],
  // Pharmacy & beauty
  ['סופר-פארם', 'Super-Pharm', 'pharmacy_beauty', ['סופר פארם', 'Super Pharm', 'לייף', 'LIFE']],
  ['בי', 'Be', 'pharmacy_beauty', ['בי פארם', 'Be Pharm']],
  ['גוד פארם', 'Good Pharm', 'pharmacy_beauty', ['גודפארם']],
  ['ניו פארם', 'New Pharm', 'pharmacy_beauty', ['ניופארם']],
  ['לאליין', 'Laline', 'pharmacy_beauty'],
  ['מאק', 'MAC Cosmetics', 'pharmacy_beauty', ['MAC']],
  ['בודי שופ', 'The Body Shop', 'pharmacy_beauty', ['Body Shop']],
  ['באת׳ אנד בודי וורקס', 'Bath & Body Works', 'pharmacy_beauty'],
  ['סבון של פעם', 'Savon de Paris', 'pharmacy_beauty'],
  // Fashion & shoes
  ['פוקס', 'Fox', 'fashion'],
  ['קסטרו', 'Castro', 'fashion'],
  ['רנואר', 'Renuar', 'fashion'],
  ['גולף', 'Golf', 'fashion'],
  ['אייץ׳ אנד או', 'H&O', 'fashion'],
  ['זארה', 'Zara', 'fashion'],
  ['ברשקה', 'Bershka', 'fashion'],
  ['פול אנד בר', 'Pull&Bear', 'fashion', ['Pull and Bear']],
  ['מסימו דוטי', 'Massimo Dutti', 'fashion'],
  ['סטרדיבריוס', 'Stradivarius', 'fashion'],
  ['מנגו', 'Mango', 'fashion'],
  ['אייץ׳ אנד אם', 'H&M', 'fashion'],
  ['אמריקן איגל', 'American Eagle', 'fashion', ['AE']],
  ['טוונטי פור סבן', 'Twentyfourseven', 'fashion', ['24/7', 'Twenty Four Seven']],
  ['הוניגמן', 'Honigman', 'fashion'],
  ['נייקי', 'Nike', 'fashion'],
  ['אדידס', 'Adidas', 'fashion'],
  ['פומה', 'Puma', 'fashion'],
  ['פוט לוקר', 'Foot Locker', 'fashion'],
  ['שילב', 'Shilav', 'fashion'],
  ['גולברי', 'Golbary', 'fashion'],
  ['דלתא', 'Delta', 'fashion'],
  ['פיקס', 'Fix', 'fashion'],
  ['ויקטוריה׳ס סיקרט', "Victoria's Secret", 'fashion'],
  ['טומי הילפיגר', 'Tommy Hilfiger', 'fashion'],
  ['ליווייס', "Levi's", 'fashion', ['ליוויס']],
  ['סקצ׳רס', 'Skechers', 'fashion'],
  ['קרוקס', 'Crocs', 'fashion'],
  ['נאוטיקה', 'Nautica', 'fashion'],
  ['גאפ', 'GAP', 'fashion'],
  ['אורבניקה', 'Urbanica', 'fashion'],
  ['בנטון', 'Benetton', 'fashion', ['יונייטד קולורס אוף בנטון']],
  ['לי קופר', 'Lee Cooper', 'fashion'],
  ['יאנגה', 'Yanga', 'fashion'],
  ['אינטימה', 'Intima', 'fashion'],
  ['סטיב מאדן', 'Steve Madden', 'fashion'],
  ['אלדו', 'Aldo', 'fashion'],
  ['טרמינל איקס', 'Terminal X', 'online', ['טרמינל X'], 'online'],
  ['אדיקה', 'Adika', 'online', [], 'online'],
  // Electronics
  ['באג', 'Bug', 'electronics'],
  ['קיי אס פי', 'KSP', 'electronics'],
  ['אייבורי', 'Ivory', 'electronics'],
  ['מחסני חשמל', 'Mahsanei Hashmal', 'electronics'],
  ['שקם אלקטריק', 'Shekem Electric', 'electronics'],
  ['אייסטור', 'iStore', 'electronics'],
  ['אי דיגיטל', 'iDigital', 'electronics', ['איידיגיטל']],
  ['פיינגו', 'Payngo', 'electronics'],
  ['טרקלין חשמל', 'Traklin', 'electronics'],
  ['א.ל.מ', 'ALM', 'electronics', ['אלמ']],
  ['סמסונג', 'Samsung', 'electronics'],
  // Home
  ['איקאה', 'IKEA', 'home'],
  ['הום סנטר', 'Home Center', 'home'],
  ['אייס', 'ACE', 'home'],
  ['נעמן', 'Naaman', 'home'],
  ['פוקס הום', 'Fox Home', 'home'],
  ['ורדינון', 'Vardinon', 'home'],
  ['גולף אנד קו', 'Golf & Co', 'home'],
  ['עמינח', 'Aminach', 'home'],
  ['טמבור', 'Tambour', 'home'],
  ['ביתילי', 'Beitili', 'home'],
  ['קרביץ', 'Kravitz', 'other'],
  ['אופיס דיפו', 'Office Depot', 'other'],
  // Restaurants & cafés
  ['מקדונלדס', "McDonald's", 'restaurants', ['מק׳']],
  ['בורגר קינג', 'Burger King', 'restaurants'],
  ['ארומה', 'Aroma', 'restaurants'],
  ['קפה קפה', 'Cafe Cafe', 'restaurants'],
  ['קפה גרג', 'Cafe Greg', 'restaurants', ['גרג']],
  ['לנדוור', 'Landwer', 'restaurants'],
  ['רולדין', 'Roladin', 'restaurants'],
  ['דומינוס', "Domino's", 'restaurants', ['דומינוס פיצה']],
  ['פיצה האט', 'Pizza Hut', 'restaurants'],
  ['קנטאקי', 'KFC', 'restaurants'],
  ['בי בי בי', 'BBB', 'restaurants'],
  ['מוזס', 'Moses', 'restaurants'],
  ['רי-בר', 'Rebar', 'restaurants', ['ריבר']],
  ['גולדה', 'Golda', 'restaurants'],
  ['בן אנד ג׳ריס', "Ben & Jerry's", 'restaurants'],
  ['ביג אפל פיצה', 'Big Apple Pizza', 'restaurants'],
  ['קופי בין', 'Coffee Bean', 'restaurants'],
  ['ארקפה', 'Arcaffe', 'restaurants'],
  ['בנדיקט', 'Benedict', 'restaurants'],
  ['אגדיר', 'Agadir', 'restaurants'],
  ['מקס ברנר', 'Max Brenner', 'restaurants'],
  ['בורגרס בר', 'Burgers Bar', 'restaurants'],
  ['ג׳פניקה', 'Japanika', 'restaurants'],
  ['פאפא ג׳ונס', "Papa John's", 'restaurants'],
  ['קפולסקי', 'Kapulsky', 'restaurants'],
  ['וולט', 'Wolt', 'online', [], 'online'],
  ['תן ביס', '10bis', 'online', ['10ביס', 'Ten Bis'], 'online'],
  // Entertainment & sport
  ['סינמה סיטי', 'Cinema City', 'entertainment'],
  ['יס פלאנט', 'Yes Planet', 'entertainment', ['פלאנט']],
  ['רב חן', 'Rav Chen', 'entertainment'],
  ['לב סינמה', 'Lev Cinema', 'entertainment'],
  ['הולמס פלייס', 'Holmes Place', 'entertainment'],
  ['גו אקטיב', 'Go Active', 'entertainment'],
  ['סטימצקי', 'Steimatzky', 'entertainment'],
  ['צומת ספרים', 'Tzomet Sfarim', 'entertainment'],
  ['לונה פארק', 'Luna Park', 'entertainment'],
  ['ספארי רמת גן', 'Safari Ramat Gan', 'entertainment', ['ספארי']],
  ['טויס אר אס', 'Toys R Us', 'entertainment'],
  // Travel
  ['אל על', 'El Al', 'travel'],
  ['ישראייר', 'Israir', 'travel'],
  ['ארקיע', 'Arkia', 'travel'],
  ['פתאל', 'Fattal', 'travel', ['לאונרדו', 'Leonardo']],
  ['ישרוטל', 'Isrotel', 'travel'],
  ['מלונות דן', 'Dan Hotels', 'travel'],
  ['שלמה סיקסט', 'Shlomo Sixt', 'travel', ['סיקסט', 'Sixt']],
  ['אלדן', 'Eldan', 'travel'],
  ['הרץ', 'Hertz', 'travel'],
  ['באדג׳ט', 'Budget', 'travel'],
  ['איסתא', 'Issta', 'travel'],
  ['אופיר טורס', 'Ophir Tours', 'travel'],
  ['רכבת ישראל', 'Israel Railways', 'travel'],
  ['אגד', 'Egged', 'travel'],
  ['בוקינג', 'Booking.com', 'online', ['Booking'], 'online'],
  ['אגודה', 'Agoda', 'online', [], 'online'],
  // Online shops
  ['אמזון', 'Amazon', 'online', [], 'online'],
  ['עלי אקספרס', 'AliExpress', 'online', ['אליאקספרס'], 'online'],
  ['איביי', 'eBay', 'online', [], 'online'],
  ['אייהרב', 'iHerb', 'online', [], 'online'],
  ['שיין', 'Shein', 'online', [], 'online'],
  ['טמו', 'Temu', 'online', [], 'online'],
  ['אסוס', 'ASOS', 'online', [], 'online'],
  ['נקסט', 'Next', 'online', [], 'online'],
  // Services & other
  ['פנגו', 'Pango', 'other'],
  ['סלקום', 'Cellcom', 'other'],
  ['פרטנר', 'Partner', 'other'],
  ['פלאפון', 'Pelephone', 'other'],
  ['גולן טלקום', 'Golan Telecom', 'other'],
  ['הוט', 'HOT', 'other'],
  ['יס', 'yes', 'other'],
  ['בזק', 'Bezeq', 'other'],
  ['חברת החשמל', 'Israel Electric', 'other', ['IEC']],
  ['אופטיקנה', 'Opticana', 'other'],
  ['אופטיקה הלפרין', 'Optica Halperin', 'other', ['הלפרין']],
];

export const SEED_STORES = ROWS.map(([name_he, name_en, category, aliases = [], channel = 'both']) => ({
  name_he, name_en, aliases, category, channel,
}));
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/seedStores.test.ts`
Expected: PASS. If the duplicate test names a clash, rename or drop the alias it reports.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seedStores.ts src/lib/seedStores.test.ts
git commit -m "feat: list of ~170 well-known Israeli chains for the shared catalog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Database switchover — migration, data script, snapshot, scripts

**Files:**
- Create: `supabase/migrations/20261007000000_shared_catalog.sql`, `scripts/migrate-to-shared.mts`, `scripts/list-shared-programs.mjs`
- Modify: `src/lib/snapshot.ts` (fetch `card_products`), `scripts/load-researched-benefits.mjs`, `.gitignore` (`/backups/`)
- Replace: `scripts/approve-pending.mts`

**Interfaces:**
- Consumes: `SEED_STORES` (Task 4), `findStoreByName`, `existingForImport`, `planNewStores`, `mergeImport`, `toIncoming`.
- Produces: DB as in spec §3; `fetchSnapshot()` fills `snapshot.products`; scripts target the admin and the shared catalog.

- [ ] **Step 1: Write the migration**

<!-- file: supabase/migrations/20261007000000_shared_catalog.sql -->
```sql
-- Shared catalog: programs, stores, benefits and card products with user_id NULL are shared with everyone;
-- rows with a user_id are private to that user. Only admins write shared rows. Run once in the SQL editor.
begin;

create table card_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete cascade, -- null = shared
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('card', 'membership')),
  program_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table programs alter column user_id drop not null;
alter table stores alter column user_id drop not null;
alter table benefits alter column user_id drop not null;

alter table profile
  add column is_admin boolean not null default false,
  add column anniversary_month int check (anniversary_month between 1 and 12),
  add column anniversary_day int check (anniversary_day between 1 and 31),
  add column children jsonb not null default '[]'::jsonb,
  add column reminded text[] not null default '{}';

alter table wallet_items
  add column product_id uuid references card_products on delete set null,
  add column birthday_month int check (birthday_month between 1 and 12);

alter table imports add column shared boolean not null default false;

alter table benefits drop constraint benefits_timing_check;
alter table benefits add constraint benefits_timing_check
  check (timing in ('always', 'birthday_month', 'anniversary_month', 'child_birthday_month'));

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce((select p.is_admin from public.profile p where p.user_id = auth.uid()), false) $$;

grant select, insert, update, delete on card_products to authenticated, service_role;
alter table card_products enable row level security;

do $$
declare t text;
begin
  foreach t in array array['programs', 'stores', 'benefits'] loop
    execute format('drop policy "own rows" on public.%I', t);
  end loop;
  foreach t in array array['programs', 'stores', 'benefits', 'card_products'] loop
    execute format('create policy "read shared and own" on public.%I for select to authenticated
      using (user_id is null or user_id = (select auth.uid()))', t);
    execute format('create policy "insert own, or shared as admin" on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))', t);
    execute format('create policy "update own, or shared as admin" on public.%I for update to authenticated
      using (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))
      with check (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))', t);
    execute format('create policy "delete own, or shared as admin" on public.%I for delete to authenticated
      using (user_id = (select auth.uid()) or (user_id is null and (select public.is_admin())))', t);
  end loop;
end $$;

-- Nobody can make themselves admin: profile writes are limited to these columns (admin changes use the secret key).
revoke insert, update on profile from authenticated;
grant insert (user_id, birth_month, email_reminders, anniversary_month, anniversary_day, children) on profile to authenticated;
grant update (user_id, birth_month, email_reminders, anniversary_month, anniversary_day, children, reminded) on profile to authenticated;

commit;
```

- [ ] **Step 2: Data script (backup, move to shared, admin, products, stores)**

<!-- file: scripts/migrate-to-shared.mts -->
```ts
// One-off switchover to the shared catalog. Run AFTER supabase/migrations/20261007000000_shared_catalog.sql.
// Usage: npx tsx scripts/migrate-to-shared.mts        (safe to re-run)
import fs from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { findStoreByName } from '../src/lib/core/normalize';
import type { Store } from '../src/lib/core/types';
import { SEED_STORES } from '../src/lib/seedStores';
import { selectAll } from '../src/lib/selectAll';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const probe = await sb.from('card_products').select('id').limit(1);
if (probe.error) throw new Error(`Run the SQL migration first (${probe.error.message})`);

const { data: { users } } = await sb.auth.admin.listUsers();
const owners = users.filter((u) => !/e2e/i.test(u.email ?? ''));
if (owners.length !== 1) throw new Error(`expected exactly one real user (the owner), found ${owners.length}`);
const uid = owners[0].id;

// 1. Backup everything the owner has, before changing anything.
const backup: Record<string, unknown[]> = {};
for (const t of ['profile', 'programs', 'wallet_items', 'stores', 'benefits', 'imports']) {
  backup[t] = await selectAll((a, b) => sb.from(t).select('*').eq('user_id', uid).range(a, b));
}
fs.mkdirSync('backups', { recursive: true });
const file = `backups/before-shared-catalog-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(backup, null, 2));
console.log(`backup: ${file}`);

// 2. The owner's catalog becomes the shared catalog; the owner becomes admin.
for (const t of ['programs', 'stores', 'benefits']) {
  const { error } = await sb.from(t).update({ user_id: null }).eq('user_id', uid);
  if (error) throw error;
}
await sb.from('profile').update({ is_admin: true }).eq('user_id', uid);

// 3. Starting card products.
const programs = await selectAll<{ id: string; name: string }>((a, b) => sb.from('programs').select('id,name').is('user_id', null).range(a, b));
const pid = (name: string) => {
  const p = programs.find((x) => x.name === name);
  if (!p) throw new Error(`missing shared program "${name}"`);
  return p.id;
};
const PRODUCTS: [string, 'card' | 'membership', string[]][] = [
  ['ישראכרט', 'card', ['ישראכרט']],
  ['מקס', 'card', ['מקס']],
  ['מקס של ביחד בשבילך', 'card', ['מקס', 'ביחד בשבילך']],
  ['כאל', 'card', ['כאל']],
  ['דיינרס', 'card', ['דיינרס']],
  ['דרים קארד – כרטיס אשראי', 'card', ['דרים קארד']],
  ['שופרסל – כרטיס אשראי', 'card', ['שופרסל']],
  ['מועדון דרים קארד', 'membership', ['דרים קארד']],
  ['רי-בר', 'membership', ['רי-בר']],
  ['דלתא פלוס', 'membership', ['דלתא פלוס']],
  ['מועדון שופרסל', 'membership', ['שופרסל']],
  ['ביחד בשבילך', 'membership', ['ביחד בשבילך']],
  ['עובדים בריא', 'membership', ['עובדים בריא']],
];
const existingProducts = await selectAll<{ id: string; name: string }>((a, b) => sb.from('card_products').select('id,name').is('user_id', null).range(a, b));
for (const [name, type, progs] of PRODUCTS) {
  if (existingProducts.some((p) => p.name === name)) continue;
  const { error } = await sb.from('card_products').insert({ user_id: null, name, type, program_ids: progs.map(pid) });
  if (error) throw error;
}

// 4. Link the owner's wallet items to their products (programs stay as they are).
const LINKS: Record<string, string> = {
  'ישראכרט': 'ישראכרט', 'מקס': 'מקס של ביחד בשבילך', 'כאל': 'כאל', 'דיינרס': 'דיינרס',
  'דרים קארד – כרטיס אשראי': 'דרים קארד – כרטיס אשראי', 'שופרסל – כרטיס אשראי': 'שופרסל – כרטיס אשראי',
  'דרים קארד': 'מועדון דרים קארד', 'שופרסל': 'מועדון שופרסל', 'רי-בר': 'רי-בר', 'דלתא פלוס': 'דלתא פלוס',
  'ביחד בשבילך': 'ביחד בשבילך', 'עובדים בריא': 'עובדים בריא',
};
const products = await selectAll<{ id: string; name: string }>((a, b) => sb.from('card_products').select('id,name').is('user_id', null).range(a, b));
const { data: wallet } = await sb.from('wallet_items').select('id,name,product_id').eq('user_id', uid);
let linked = 0;
for (const w of wallet ?? []) {
  const product = products.find((p) => p.name === LINKS[w.name]);
  if (product && !w.product_id) {
    await sb.from('wallet_items').update({ product_id: product.id }).eq('id', w.id);
    linked++;
  }
}

// 5. Well-known stores (skip ones that already exist under any spelling).
const shared = await selectAll<Store>((a, b) => sb.from('stores').select('*').is('user_id', null).order('id').range(a, b));
const toAdd = SEED_STORES.filter((s) => !findStoreByName(shared, s.name_he) && !findStoreByName(shared, s.name_en));
for (let i = 0; i < toAdd.length; i += 100) {
  const { error } = await sb.from('stores').insert(toAdd.slice(i, i + 100).map((s) => ({ ...s, user_id: null })));
  if (error) throw error;
}

console.log(`shared programs: ${programs.length}; products: ${products.length}; wallet items linked: ${linked}; stores added: ${toAdd.length}`);
```

<!-- file: scripts/list-shared-programs.mjs -->
```js
// Prints the shared programs (name + benefits link) as JSON — used by the monthly refresh.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.from('programs').select('name,kind,benefits_url').is('user_id', null).order('name');
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
```

<!-- patch -->
```python
def sub(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)

sub('scripts/load-researched-benefits.mjs', [
    ("""const { data: { users } } = await sb.auth.admin.listUsers();
const owner = users.filter((u) => !/e2e/i.test(u.email ?? ''));
if (owner.length !== 1) throw new Error(`expected exactly one real user, found ${owner.length}`);
const uid = owner[0].id;
const { data: programs } = await sb.from('programs').select('id,name,benefits_url').eq('user_id', uid);""",
     """// Imports go to an admin's "waiting for approval" list, as shared-catalog imports.
const { data: admins } = await sb.from('profile').select('user_id').eq('is_admin', true);
if (!admins?.length) throw new Error('no admin user');
const uid = admins[0].user_id;
const { data: programs } = await sb.from('programs').select('id,name,benefits_url').is('user_id', null);"""),
    ("user_id: uid, program_id: program.id, source: 'chat', is_refresh: false, status: 'pending_review',",
     "user_id: uid, program_id: program.id, source: 'chat', is_refresh: false, status: 'pending_review', shared: true,"),
])

sub('src/lib/snapshot.ts', [
    ("import type { Benefit, Profile, Program, Snapshot, Store, WalletItem } from './core/types';",
     "import type { Benefit, CardProduct, Profile, Program, Snapshot, Store, WalletItem } from './core/types';"),
    ("  const [profile, programs, wallet, stores, benefits] = await Promise.all([",
     "  const [profile, programs, wallet, stores, benefits, products] = await Promise.all(["),
    ("    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').neq('status', 'archived').order('id').range(a, b)),\n  ]);",
     "    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').neq('status', 'archived').order('id').range(a, b)),\n"
     "    selectAll<CardProduct>((a, b) => sb.from('card_products').select('*').order('name').order('id').range(a, b)),\n  ]);"),
    ("    programs, wallet, stores, benefits,\n", "    programs, wallet, stores, benefits, products,\n"),
])

s = open('.gitignore', encoding='utf-8').read()
if '/backups/' not in s:
    open('.gitignore', 'a', encoding='utf-8').write('\n# local data backups\n/backups/\n')
```

<!-- file: scripts/approve-pending.mts -->
```ts
// Approves every "waiting for approval" import of the admin, exactly like tapping Save on the review screen:
// same validation, same store de-duplication, same merge rule, and the import's shared/private choice.
// Usage: npx tsx scripts/approve-pending.mts
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { israelToday } from '../src/lib/core/dates';
import { mergeImport } from '../src/lib/core/merge';
import { existingForImport, planNewStores, rowProblems, toIncoming, type ImportRow, type ReviewRow } from '../src/lib/core/review';
import type { Benefit, Store } from '../src/lib/core/types';
import { selectAll } from '../src/lib/selectAll';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data: admins } = await sb.from('profile').select('user_id').eq('is_admin', true);
if (!admins?.length) throw new Error('no admin user');
const uid = admins[0].user_id as string;
const visible = `user_id.is.null,user_id.eq.${uid}`;

const { data: imports, error } = await sb.from('imports').select('*, programs(name)')
  .eq('user_id', uid).eq('status', 'pending_review').order('created_at');
if (error) throw error;

for (const imp of imports as (ImportRow & { programs: { name: string } })[]) {
  const name = imp.programs.name;
  if (!imp.extracted) { console.log(`${name}: no data, skipped`); continue; }
  const shared = !!imp.shared;
  const nowIso = new Date().toISOString();

  // Read fresh every time so stores created by the previous import are reused.
  const [stores, programBenefits] = await Promise.all([
    selectAll<Store>((a, b) => sb.from('stores').select('*').or(visible).order('id').range(a, b)),
    selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('program_id', imp.program_id).order('id').range(a, b)),
  ]);
  const existing = existingForImport(programBenefits, imp.program_id, shared, uid);

  const ctx = { storeIds: new Set(stores.map((s) => s.id)), newStores: imp.extracted.new_stores, todayIso: israelToday().iso };
  const approved: ReviewRow[] = [];
  for (const b of imp.extracted.benefits) {
    const row: ReviewRow = { ...b, approved: true };
    // A cashback/discount whose rate isn't published (e.g. "varies by site") is kept as "other" instead of guessing.
    if ((row.type === 'percent_off' || row.type === 'cashback_percent') && row.value == null) row.type = 'other';
    const problems = rowProblems(row, ctx);
    if (problems.length) console.log(`  ${name}: skipped "${row.title}" — ${problems.join(', ')}`);
    else approved.push(row);
  }

  const owner = shared ? null : uid;
  const newStoreIds: (string | undefined)[] = [];
  const used = [...new Set(approved.map((r) => r.new_store_index).filter((i): i is number => i != null))];
  let created = 0;
  for (const group of planNewStores(used, imp.extracted.new_stores, stores)) {
    let id = group.existingId;
    if (!id) {
      const { data, error: e } = await sb.from('stores').insert({
        user_id: owner, name_he: group.draft.name_he.trim(), name_en: group.draft.name_en.trim(),
        aliases: group.draft.aliases, category: group.draft.category, channel: group.draft.channel,
      }).select('id').single();
      if (e) throw e;
      id = data.id as string;
      created++;
    }
    for (const i of group.indexes) newStoreIds[i] = id;
  }

  const plan = mergeImport(existing, approved.map((r) => toIncoming(r, newStoreIds, imp.raw_input.url)), { isRefresh: imp.is_refresh, nowIso });
  if (plan.inserts.length) {
    const { error: e } = await sb.from('benefits').insert(plan.inserts.map((b) => ({ ...b, user_id: owner, program_id: imp.program_id, last_verified_at: nowIso })));
    if (e) throw e;
  }
  for (const u of plan.updates) {
    const { error: e } = await sb.from('benefits').update(u.patch).eq('id', u.id);
    if (e) throw e;
  }
  if (plan.notSeen.length) await sb.from('benefits').update({ status: 'not_seen' }).in('id', plan.notSeen);
  await sb.from('imports').update({ status: 'saved' }).eq('id', imp.id);
  await sb.from('programs').update({ last_refreshed_at: nowIso, last_refresh_status: 'ok' }).eq('id', imp.program_id);
  console.log(`${name} (${shared ? 'shared' : 'private'}): saved ${plan.inserts.length} new, ${plan.updates.length} updated, ${plan.notSeen.length} not seen, ${created} new stores`);
}
```

- [ ] **Step 3: 👤 You — run the migration**

The agent copies the SQL file to the clipboard. In Supabase → *SQL Editor* → *New query*, paste and click *Run*. Expected: "Success. No rows returned".

- [ ] **Step 4: Run the data script**

Run: `npx tsx scripts/migrate-to-shared.mts`
Expected: `backup: backups/before-shared-catalog-….json` and a summary line with products 13, wallet items linked 12, stores added > 100.

- [ ] **Step 5: Verify, then commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

```bash
git add -A
git commit -m "feat: shared-catalog migration, switchover script, snapshot loads card products" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Onboarding — your dates and your cards

**Files:**
- Create: `src/components/DatesForm.tsx`
- Replace: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `walletItemFromProduct` (Task 3), `cardArtFor`, `normalize`, `card_products` table (Task 5).
- Produces: `<DatesForm value onChange />`, `DatesValue`, `datesValid(value)`, `MONTHS` — reused by Sources (Task 8). Onboarding labels used by Task 10's e2e: select "חודש יום ההולדת"; product checkboxes labelled by product name; buttons "המשך" / "סיום".

- [ ] **Step 1: Dates form**

<!-- file: src/components/DatesForm.tsx -->
```tsx
'use client';
import { Plus, X } from 'lucide-react';
import { field } from '@/components/ui';
import { monthNameHe } from '@/lib/core/dates';
import type { Child } from '@/lib/core/types';

export interface DatesValue {
  birth_month: number | null;
  anniversary_month: number | null;
  anniversary_day: number | null;
  children: Child[];
}

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function datesValid(v: DatesValue): boolean {
  return v.birth_month != null && v.children.every((c) => c.name.trim() !== '' && c.birth_month >= 1 && c.birth_month <= 12);
}

const num = (v: string) => (v ? Number(v) : null);

export default function DatesForm({ value, onChange }: { value: DatesValue; onChange: (v: DatesValue) => void }) {
  const set = (patch: Partial<DatesValue>) => onChange({ ...value, ...patch });
  const setChild = (i: number, patch: Partial<Child>) =>
    set({ children: value.children.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm text-muted">🎂 חודש יום ההולדת שלך</span>
        <select aria-label="חודש יום ההולדת" value={value.birth_month ?? ''} onChange={(e) => set({ birth_month: num(e.target.value) })}
          className={`${field} mt-1`}>
          <option value="">בחרו חודש</option>
          {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
        </select>
      </label>

      <fieldset>
        <legend className="text-sm text-muted">💍 יום נישואין (לא חובה)</legend>
        <div className="mt-1 flex gap-2">
          <select aria-label="חודש יום הנישואין" value={value.anniversary_month ?? ''}
            onChange={(e) => set({ anniversary_month: num(e.target.value), ...(e.target.value ? {} : { anniversary_day: null }) })}
            className={`${field} min-w-0 flex-1`}>
            <option value="">אין / לא לציין</option>
            {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
          </select>
          <input aria-label="יום בחודש" inputMode="numeric" placeholder="יום" value={value.anniversary_day ?? ''}
            disabled={!value.anniversary_month}
            onChange={(e) => {
              const d = Number(e.target.value.replace(/\D/g, ''));
              set({ anniversary_day: d >= 1 && d <= 31 ? d : null });
            }}
            className={`${field} w-20! shrink-0`} />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">🎈 ימי הולדת של ילדים (לא חובה)</legend>
        {value.children.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input aria-label={`שם ילד/ה ${i + 1}`} placeholder="שם" value={c.name}
              onChange={(e) => setChild(i, { name: e.target.value })} className={`${field} min-w-0 flex-1`} />
            <select aria-label={`חודש יום ההולדת של ילד/ה ${i + 1}`} value={c.birth_month || ''}
              onChange={(e) => setChild(i, { birth_month: Number(e.target.value) })} className={`${field} w-32! shrink-0`}>
              <option value="">חודש</option>
              {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
            </select>
            <button type="button" aria-label={`הסרת ילד/ה ${i + 1}`} onClick={() => set({ children: value.children.filter((_, j) => j !== i) })}
              className="grid w-10 shrink-0 place-items-center rounded-xl border border-line text-dim hover:text-bad">
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ children: [...value.children, { name: '', birth_month: 0 }] })}
          className="flex items-center gap-1 text-sm text-mint">
          <Plus size={14} aria-hidden /> הוספת ילד/ה
        </button>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 2: Onboarding page**

<!-- file: src/app/onboarding/page.tsx -->
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import DatesForm, { datesValid, type DatesValue } from '@/components/DatesForm';
import { Button, Notice, field } from '@/components/ui';
import { walletItemFromProduct } from '@/lib/core/catalog';
import { cardArtFor } from '@/lib/core/cardArt';
import { normalize } from '@/lib/core/normalize';
import type { CardProduct } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Extra = { name: string; type: 'card' | 'membership' };
const TYPE_TITLE = { card: 'כרטיסי אשראי', membership: 'מועדונים וחברויות' } as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dates, setDates] = useState<DatesValue>({ birth_month: null, anniversary_month: null, anniversary_day: null, children: [] });
  const [products, setProducts] = useState<CardProduct[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraName, setExtraName] = useState('');
  const [extraType, setExtraType] = useState<Extra['type']>('membership');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().from('card_products').select('*').order('name')
      .then(({ data }) => setProducts((data ?? []) as CardProduct[]));
  }, []);

  const q = normalize(query);
  const visible = products.filter((p) => !q || normalize(p.name).includes(q));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function addExtra() {
    const name = extraName.trim();
    if (!name) return;
    setExtras((x) => [...x, { name, type: extraType }]);
    setExtraName('');
  }

  async function finish() {
    if (!datesValid(dates)) return;
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('not signed in');

      const { count, error: e1 } = await sb.from('wallet_items').select('id', { count: 'exact', head: true });
      if (e1) throw e1;
      if (!count) { // only on the first run, so a retry after a failure never duplicates the wallet
        const items: { name: string; type: Extra['type']; program_ids: string[]; product_id: string | null }[] =
          products.filter((p) => picked.has(p.id)).map(walletItemFromProduct);
        if (extras.length) {
          const { data: mine } = await sb.from('programs').select('id,name').eq('user_id', user.id);
          for (const x of extras) {
            let id = (mine ?? []).find((p) => p.name === x.name)?.id as string | undefined;
            if (!id) {
              const { data, error } = await sb.from('programs')
                .insert({ name: x.name, kind: x.type === 'card' ? 'card_issuer' : 'club' }).select('id').single();
              if (error) throw error;
              id = data.id as string;
            }
            items.push({ name: x.name, type: x.type, program_ids: [id], product_id: null });
          }
        }
        if (items.length) {
          const { error } = await sb.from('wallet_items').insert(items);
          if (error) throw error;
        }
      }

      const { error: e2 } = await sb.from('profile').upsert({
        user_id: user.id,
        birth_month: dates.birth_month,
        anniversary_month: dates.anniversary_month,
        anniversary_day: dates.anniversary_day,
        children: dates.children.map((c) => ({ name: c.name.trim(), birth_month: c.birth_month })),
      });
      if (e2) throw e2;
      router.replace('/');
    } catch {
      setError('השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div className="space-y-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel text-2xl font-bold text-mint">₪</div>
        <h1 className="text-2xl font-bold">ברוכים הבאים</h1>
        <div className="flex gap-1.5" aria-label={`שלב ${step} מתוך 3`}>
          {[1, 2, 3].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-mint' : 'bg-line'}`} />)}
        </div>
      </div>

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="font-semibold">התאריכים שלכם</h2>
          <p className="text-sm text-muted">הטבות לימי הולדת ולימי נישואין תקפות לכל החודש.</p>
          <DatesForm value={dates} onChange={setDates} />
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-semibold">אילו כרטיסים ומועדונים יש לכם?</h2>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש: מקס, דרים קארד…"
              aria-label="חיפוש כרטיס או מועדון" className={`${field} ps-10`} />
          </div>
          {products.length === 0 && <Notice>טוען את רשימת הכרטיסים…</Notice>}
          {(['card', 'membership'] as const).map((type) => {
            const list = visible.filter((p) => p.type === type);
            if (list.length === 0) return null;
            return (
              <fieldset key={type} className="space-y-2">
                <legend className="mb-2 text-xs font-semibold text-dim">{TYPE_TITLE[type]}</legend>
                {list.map((p) => {
                  const art = cardArtFor([p.name]);
                  const on = picked.has(p.id);
                  return (
                    <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${on ? 'border-mint bg-mint/10' : 'border-line bg-panel'}`}>
                      <input type="checkbox" className="h-4 w-4 accent-mint" checked={on} onChange={() => toggle(p.id)} />
                      <span aria-hidden className="h-6 w-10 shrink-0 rounded"
                        style={{ background: art ? `linear-gradient(135deg, ${art.from}, ${art.to})` : '#2a3550' }} />
                      <span className="flex-1">{p.name}</span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
          <p className="text-sm text-dim">נבחרו {picked.size}</p>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h2 className="font-semibold">משהו חסר?</h2>
          <p className="text-sm text-muted">כרטיס או מועדון שלא ברשימה (למשל מועדון של מקום העבודה). הוא יופיע רק אצלכם, ותוכלו לייבא את ההטבות שלו.</p>
          {extras.map((x, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-3">
              <span className="flex-1">{x.name} <span className="text-xs text-dim">· {x.type === 'card' ? 'כרטיס אשראי' : 'מועדון'} · פרטי</span></span>
              <button type="button" aria-label={`הסרת ${x.name}`} onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}
                className="text-dim hover:text-bad"><X size={16} aria-hidden /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="שם" aria-label="שם כרטיס או מועדון"
              className={`${field} min-w-0 flex-1`} />
            <select value={extraType} onChange={(e) => setExtraType(e.target.value as Extra['type'])} aria-label="סוג"
              className={`${field} w-36! shrink-0`}>
              <option value="membership">מועדון</option>
              <option value="card">כרטיס אשראי</option>
            </select>
            <button type="button" onClick={addExtra} aria-label="הוספה" className="grid w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel-2">
              <Plus size={16} aria-hidden />
            </button>
          </div>
        </section>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)}>חזרה</Button>}
        <Button disabled={busy || (step === 1 && !datesValid(dates))} onClick={step === 3 ? finish : () => setStep(step + 1)} className="flex-1 py-3">
          {step === 3 ? 'סיום' : 'המשך'}
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds. (Behaviour is covered by Task 10's onboarding e2e test.)

- [ ] **Step 4: Commit**

```bash
git add src/components/DatesForm.tsx src/app/onboarding/page.tsx
git commit -m "feat: onboarding with personal dates and card products from the shared catalog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wallet — add from catalog, club birthday, update from catalog

**Files:**
- Replace: `src/app/(tabs)/wallet/page.tsx`

**Interfaces:**
- Consumes: `snapshot.products` (Task 5), `walletItemFromProduct`, `needsCatalogUpdate` (Task 3), `cardArtFor`, `MONTHS` (Task 6).

- [ ] **Step 1: Wallet page**

<!-- file: src/app/(tabs)/wallet/page.tsx -->
```tsx
'use client';
import { useState } from 'react';
import { CreditCard, Pencil, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react';
import { MONTHS } from '@/components/DatesForm';
import { Button, Card, Loading, Notice, PageHeader, SectionTitle, field } from '@/components/ui';
import { needsCatalogUpdate, walletItemFromProduct } from '@/lib/core/catalog';
import { cardArtFor } from '@/lib/core/cardArt';
import { monthNameHe } from '@/lib/core/dates';
import { KIND_LABELS } from '@/lib/core/labels';
import { normalize } from '@/lib/core/normalize';
import type { CardProduct, WalletItem } from '@/lib/core/types';
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
  birthday_month: number | null;
}
const EMPTY: Draft = { name: '', type: 'card', last4: '', nickname: '', color: '#3b5bdb', program_ids: [], birthday_month: null };

export default function WalletPage() {
  const { snapshot, online, refresh } = useSnap();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!snapshot) return <Loading />;

  const programs = new Map(snapshot.programs.map((p) => [p.id, p]));
  const products = snapshot.products ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const q = normalize(query);

  async function run(op: PromiseLike<{ error: unknown }>, fail: string): Promise<boolean> {
    const { error } = await op;
    if (error) {
      setError(fail);
      return false;
    }
    setError(null);
    await refresh();
    return true;
  }

  async function save(d: Draft) {
    if (!d.name.trim()) return setError('חסר שם.');
    if (d.last4 && !/^\d{4}$/.test(d.last4)) return setError('אפשר לשמור רק 4 ספרות אחרונות.');
    const row = {
      name: d.name.trim(), type: d.type, last4: d.last4 || null, nickname: d.nickname.trim() || null,
      color: d.color, program_ids: d.program_ids, birthday_month: d.birthday_month,
    };
    const sb = supabaseBrowser();
    const ok = await run(d.id ? sb.from('wallet_items').update(row).eq('id', d.id) : sb.from('wallet_items').insert(row), 'השמירה נכשלה.');
    if (ok) setDraft(null);
  }

  async function addProduct(p: CardProduct) {
    if (await run(supabaseBrowser().from('wallet_items').insert(walletItemFromProduct(p)), 'ההוספה נכשלה.')) {
      setPicking(false);
      setQuery('');
    }
  }

  async function remove(item: WalletItem) {
    if (!confirm(`למחוק את "${item.name}" מהארנק?`)) return;
    await run(supabaseBrowser().from('wallet_items').delete().eq('id', item.id), 'המחיקה נכשלה.');
  }

  const syncFromCatalog = (item: WalletItem, product: CardProduct) =>
    run(supabaseBrowser().from('wallet_items').update({ program_ids: product.program_ids }).eq('id', item.id), 'העדכון נכשל.');

  const edit = (w: WalletItem) =>
    setDraft({
      id: w.id, name: w.name, type: w.type, last4: w.last4 ?? '', nickname: w.nickname ?? '',
      color: w.color ?? EMPTY.color, program_ids: w.program_ids, birthday_month: w.birthday_month ?? null,
    });
  const toggleProgram = (id: string) =>
    setDraft((d) => d && {
      ...d,
      program_ids: d.program_ids.includes(id) ? d.program_ids.filter((x) => x !== id) : [...d.program_ids, id],
    });

  return (
    <main className="space-y-6">
      <PageHeader title="הארנק שלי" subtitle="הכרטיסים והחברויות שלכם" icon={Wallet} />
      {!online && <Notice tone="warn">אין חיבור — אפשר רק לצפות.</Notice>}

      {(['card', 'membership'] as const).map((type) => {
        const list = snapshot.wallet.filter((w) => w.type === type);
        if (list.length === 0) return null;
        return (
          <section key={type} className="space-y-3">
            <SectionTitle>{type === 'card' ? 'כרטיסי אשראי' : 'חברויות ומועדונים'}</SectionTitle>
            <ul className="grid grid-cols-2 gap-3">
              {list.map((w) => {
                const color = w.color ?? '#3b5bdb';
                const art = cardArtFor([w.name, ...w.program_ids.map((id) => programs.get(id)?.name ?? '')]);
                const background = art
                  ? `linear-gradient(140deg, ${art.from}, ${art.to})`
                  : `linear-gradient(140deg, ${color}, ${color}88 60%, #0e1424)`;
                const product = w.product_id ? productById.get(w.product_id) : undefined;
                return (
                  <li key={w.id} className="space-y-1.5">
                    <div className="aspect-[1.6] overflow-hidden rounded-2xl p-3 text-white shadow-lg shadow-black/30" style={{ background }}>
                      <div className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {art && <p className="whitespace-nowrap text-[10px] font-black tracking-[0.08em] opacity-90" dir="auto">{art.mark}</p>}
                            <p className="line-clamp-2 text-sm font-bold drop-shadow">{w.nickname || w.name}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button disabled={!online} onClick={() => edit(w)} aria-label={`עריכת ${w.name}`}
                              className="grid h-7 w-7 place-items-center rounded-lg bg-black/25 backdrop-blur disabled:opacity-40">
                              <Pencil size={13} aria-hidden />
                            </button>
                            <button disabled={!online} onClick={() => remove(w)} aria-label={`מחיקת ${w.name}`}
                              className="grid h-7 w-7 place-items-center rounded-lg bg-black/25 backdrop-blur disabled:opacity-40">
                              <Trash2 size={13} aria-hidden />
                            </button>
                          </div>
                        </div>
                        <p className="mt-auto line-clamp-1 text-[11px] opacity-80">
                          {w.birthday_month ? `🎂 ${monthNameHe(w.birthday_month)} · ` : ''}
                          {w.program_ids.map((id) => programs.get(id)?.name).filter(Boolean).join(' · ') || 'לא משויך לתוכנית'}
                        </p>
                        <div className="flex items-center justify-between">
                          {type === 'card' ? <CreditCard size={16} className="opacity-70" aria-hidden /> : <span />}
                          <p className="font-mono text-xs tracking-widest opacity-90" dir="ltr">{w.last4 ? `•••• ${w.last4}` : ''}</p>
                        </div>
                      </div>
                    </div>
                    {product && needsCatalogUpdate(w, product) && (
                      <button disabled={!online} onClick={() => syncFromCatalog(w, product)}
                        className="flex w-full items-center justify-center gap-1 rounded-xl border border-mint/40 py-1.5 text-xs text-mint">
                        <RefreshCw size={12} aria-hidden /> עדכון מהקטלוג
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!draft && !picking && (
        <Button disabled={!online} onClick={() => setPicking(true)} className="w-full py-3">
          <Plus size={18} aria-hidden /> הוספה לארנק
        </Button>
      )}

      {picking && (
        <Card className="space-y-3">
          <h2 className="font-semibold">מה להוסיף?</h2>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש כרטיס או מועדון"
              aria-label="חיפוש כרטיס או מועדון" className={`${field} ps-10`} />
          </div>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {products.filter((p) => !q || normalize(p.name).includes(q)).map((p) => {
              const art = cardArtFor([p.name]);
              return (
                <li key={p.id}>
                  <button onClick={() => addProduct(p)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 p-2.5 text-start hover:border-mint">
                    <span aria-hidden className="h-6 w-10 shrink-0 rounded" style={{ background: art ? `linear-gradient(135deg, ${art.from}, ${art.to})` : '#2a3550' }} />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-dim">{p.type === 'card' ? 'כרטיס' : 'מועדון'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setPicking(false); setDraft(EMPTY); }} className="flex-1">משהו אחר (פרטי)</Button>
            <Button variant="ghost" onClick={() => { setPicking(false); setQuery(''); }}>ביטול</Button>
          </div>
        </Card>
      )}

      {draft && (
        <Card className="space-y-4">
          <h2 className="font-semibold">{draft.id ? 'עריכה' : 'הוספה לארנק'}</h2>
          <label className="block">
            <span className="text-sm text-muted">שם</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="סוג">
            {(['card', 'membership'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={draft.type === t} onClick={() => setDraft({ ...draft, type: t })}
                className={`rounded-xl border p-2.5 text-sm ${draft.type === t ? 'border-mint bg-mint/10 text-mint' : 'border-line text-muted'}`}>
                {t === 'card' ? 'כרטיס אשראי' : 'חברות במועדון'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-sm text-muted">כינוי</span>
              <input value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="w-28">
              <span className="text-sm text-muted">4 ספרות</span>
              <input inputMode="numeric" maxLength={4} dir="ltr" value={draft.last4}
                onChange={(e) => setDraft({ ...draft, last4: e.target.value.replace(/\D/g, '') })} className={`${field} mt-1`} />
            </label>
            <label className="w-16">
              <span className="text-sm text-muted">צבע</span>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="mt-1 h-[46px] w-full cursor-pointer rounded-xl border border-line bg-panel-2 p-1" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-muted">🎂 חודש יום הולדת במועדון הזה</span>
            <select value={draft.birthday_month ?? ''} onChange={(e) => setDraft({ ...draft, birthday_month: e.target.value ? Number(e.target.value) : null })}
              aria-label="חודש יום הולדת במועדון הזה" className={`${field} mt-1`}>
              <option value="">כמו יום ההולדת שלי</option>
              {MONTHS.map((m) => <option key={m} value={m}>{monthNameHe(m)}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted">אילו הטבות זה פותח?</legend>
            {snapshot.programs.length === 0 && <p className="text-sm text-dim">הוסיפו תוכנית בלשונית &quot;מקורות&quot;.</p>}
            <div className="flex flex-wrap gap-2">
              {snapshot.programs.map((p) => {
                const on = draft.program_ids.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleProgram(p.id)} title={KIND_LABELS[p.kind]}
                    className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-mint bg-mint/10 text-mint' : 'border-line text-muted'}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button onClick={() => save(draft)} className="flex-1">שמירה</Button>
            <Button variant="secondary" onClick={() => { setDraft(null); setError(null); }}>ביטול</Button>
          </div>
        </Card>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/wallet/page.tsx"
git commit -m "feat: wallet adds cards from the catalog, club-specific birthday, update from catalog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin tools and Sources

**Files:**
- Create: `src/app/api/admin/users/route.ts`, `src/components/AdminPanel.tsx`
- Replace: `src/app/(tabs)/sources/page.tsx`

**Interfaces:**
- Consumes: `adminGuard`, `isShared` (Task 3), `DatesForm` (Task 6), `supabaseAdmin`, `supabaseServer`.
- Produces: `GET/POST/PATCH/DELETE /api/admin/users` (admin only; errors `forbidden | invalid_email | exists | self | last_admin | not_onboarded | failed`).

- [ ] **Step 1: Admin route**

<!-- file: src/app/api/admin/users/route.ts -->
```ts
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
```

- [ ] **Step 2: Admin panel**

<!-- file: src/components/AdminPanel.tsx -->
```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Mail, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { Button, Notice, SectionTitle, field } from '@/components/ui';
import { isShared } from '@/lib/core/catalog';
import type { CardProduct, Program } from '@/lib/core/types';
import { supabaseBrowser } from '@/lib/supabase/browser';

interface AdminUser {
  id: string;
  email: string;
  last_sign_in_at: string | null;
  onboarded: boolean;
  is_admin: boolean;
}

const ERRORS: Record<string, string> = {
  exists: 'לכתובת הזו כבר יש גישה.',
  invalid_email: 'כתובת אימייל לא תקינה.',
  self: 'אי אפשר להסיר את עצמכם.',
  last_admin: 'חייב להישאר לפחות מנהל אחד.',
  not_onboarded: 'המשתמש עוד לא סיים הרשמה.',
  forbidden: 'אין הרשאה.',
};

function inviteMail(to: string): string {
  const body = `היי! הזמנתי אותך לאפליקציה שמראה באיזה כרטיס כדאי לשלם בכל חנות.\nנכנסים כאן עם Google או עם קוד שנשלח למייל:\n${window.location.origin}/login`;
  return `mailto:${to}?subject=${encodeURIComponent('הזמנה לאפליקציית ההטבות')}&body=${encodeURIComponent(body)}`;
}

export default function AdminPanel({ programs, products, onChange }: {
  programs: Program[];
  products: CardProduct[];
  onChange: () => Promise<void>;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState('');
  const [invited, setInvited] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CardProduct['type']>('card');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (res.ok) setUsers(((await res.json()) as { users: AdminUser[] }).users);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(method: string, body?: object, query = ''): Promise<boolean> {
    const res = await fetch(`/api/admin/users${query}`, {
      method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(ERRORS[result.error ?? ''] ?? 'הפעולה נכשלה.');
      return false;
    }
    setMessage(null);
    await load();
    return true;
  }

  async function invite() {
    const to = email.trim();
    if (await call('POST', { email: to })) {
      setInvited(to);
      setEmail('');
    }
  }

  const sb = supabaseBrowser();
  async function write(op: PromiseLike<{ error: unknown }>) {
    const { error } = await op;
    if (error) setMessage('השמירה נכשלה.');
    else {
      setMessage(null);
      await onChange();
    }
  }
  const sharedPrograms = programs.filter(isShared);
  const sharedProducts = products.filter(isShared);

  return (
    <section className="space-y-5 rounded-2xl border border-mint/30 bg-panel p-4">
      <h2 className="flex items-center gap-2 font-semibold text-mint"><ShieldCheck size={18} aria-hidden /> ניהול</h2>
      {message && <Notice tone="error">{message}</Notice>}

      <div className="space-y-2">
        <SectionTitle>הזמנת משתמש</SectionTitle>
        <div className="flex gap-2">
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
            aria-label="אימייל להזמנה" className={`${field} min-w-0 flex-1`} />
          <Button onClick={invite} disabled={!email.trim()}><UserPlus size={16} aria-hidden /> הזמנה</Button>
        </div>
        {invited && (
          <Notice tone="success">
            {invited} יכול/ה להיכנס עכשיו. <a href={inviteMail(invited)} className="underline">שליחת הזמנה במייל</a>
          </Notice>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle>משתמשים עם גישה</SectionTitle>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate" dir="ltr">{u.email}</span>
              <span className="text-xs text-dim">{u.onboarded ? 'הצטרף/ה' : 'טרם נכנס/ה'}{u.is_admin ? ' · מנהל/ת' : ''}</span>
              {!u.onboarded && (
                <a href={inviteMail(u.email)} aria-label={`שליחת הזמנה ל-${u.email}`} className="text-mint"><Mail size={15} aria-hidden /></a>
              )}
              {u.onboarded && (
                <button onClick={() => call('PATCH', { id: u.id, is_admin: !u.is_admin })} className="text-xs text-mint">
                  {u.is_admin ? 'הסרת ניהול' : 'הפיכה למנהל/ת'}
                </button>
              )}
              <button onClick={() => confirm(`להסיר את הגישה של ${u.email}? המידע הפרטי שלו/ה יימחק.`) && call('DELETE', undefined, `?id=${u.id}`)}
                aria-label={`הסרת ${u.email}`} className="text-bad"><Trash2 size={15} aria-hidden /></button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <SectionTitle>כרטיסים ומועדונים בקטלוג</SectionTitle>
        <p className="text-xs text-dim">משתמשים בוחרים מהרשימה הזו בהרשמה, וכל פריט פותח את ההטבות של התוכניות שמסומנות בו.</p>
        <ul className="space-y-2">
          {sharedProducts.map((p) => (
            <li key={p.id} className="space-y-2 rounded-xl border border-line bg-panel-2 p-3">
              <div className="flex gap-2">
                <input defaultValue={p.name} aria-label="שם" className={`${field} min-w-0 flex-1`}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name &&
                    write(sb.from('card_products').update({ name: e.target.value.trim() }).eq('id', p.id))} />
                <select value={p.type} aria-label="סוג" className={`${field} w-28! shrink-0`}
                  onChange={(e) => write(sb.from('card_products').update({ type: e.target.value }).eq('id', p.id))}>
                  <option value="card">כרטיס</option>
                  <option value="membership">מועדון</option>
                </select>
                <button aria-label={`מחיקת ${p.name}`} className="text-bad"
                  onClick={() => confirm(`למחוק את "${p.name}" מהקטלוג?`) && write(sb.from('card_products').delete().eq('id', p.id))}>
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sharedPrograms.map((prog) => {
                  const on = p.program_ids.includes(prog.id);
                  const next = on ? p.program_ids.filter((x) => x !== prog.id) : [...p.program_ids, prog.id];
                  return (
                    <button key={prog.id} aria-pressed={on} onClick={() => write(sb.from('card_products').update({ program_ids: next }).eq('id', p.id))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-mint bg-mint/10 text-mint' : 'border-line text-dim'}`}>
                      {prog.name}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="כרטיס או מועדון חדש" aria-label="שם פריט חדש"
            className={`${field} min-w-0 flex-1`} />
          <select value={newType} onChange={(e) => setNewType(e.target.value as CardProduct['type'])} aria-label="סוג פריט חדש"
            className={`${field} w-28! shrink-0`}>
            <option value="card">כרטיס</option>
            <option value="membership">מועדון</option>
          </select>
          <button aria-label="הוספה לקטלוג" disabled={!newName.trim()}
            onClick={async () => { await write(sb.from('card_products').insert({ user_id: null, name: newName.trim(), type: newType })); setNewName(''); }}
            className="grid w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 disabled:opacity-40">
            <Plus size={16} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Sources page**

<!-- file: src/app/(tabs)/sources/page.tsx -->
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, RefreshCw, Settings, Trash2, TriangleAlert } from 'lucide-react';
import AdminPanel from '@/components/AdminPanel';
import DatesForm, { datesValid, type DatesValue } from '@/components/DatesForm';
import { Button, Loading, Notice, PageHeader, SectionTitle, field } from '@/components/ui';
import { isShared } from '@/lib/core/catalog';
import { formatDate, KIND_LABELS } from '@/lib/core/labels';
import { PROGRAM_KINDS, type Program, type ProgramKind } from '@/lib/core/types';
import { idbClear } from '@/lib/snapshot';
import { startImport } from '@/lib/startImport';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSnap } from '@/lib/useSnapshot';

export default function SourcesPage() {
  const { snapshot, online, refresh } = useSnap();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProgramKind>('club');
  const [newShared, setNewShared] = useState(true);
  const [dates, setDates] = useState<DatesValue | null>(null);
  const [saved, setSaved] = useState(false);
  if (!snapshot) return <Loading />;

  const sb = supabaseBrowser();
  const profile = snapshot.profile;
  const isAdmin = Boolean(profile?.is_admin);
  const currentDates: DatesValue = dates ?? {
    birth_month: profile?.birth_month ?? null,
    anniversary_month: profile?.anniversary_month ?? null,
    anniversary_day: profile?.anniversary_day ?? null,
    children: profile?.children ?? [],
  };
  const activeCount = (programId: string) =>
    snapshot.benefits.filter((b) => b.program_id === programId && b.status === 'active').length;
  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));
  const notSeen = snapshot.benefits.filter((b) => b.status === 'not_seen' && (isAdmin || !isShared(b)));

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
    if (process.env.NEXT_PUBLIC_AI_API !== 'on') {
      // Free mode: refresh through a chatbot on the import page, with the link and refresh flag filled in.
      router.push(`/import?program=${p.id}&refresh=1&url=${encodeURIComponent(p.benefits_url)}`);
      return;
    }
    setBusyId(p.id);
    const result = await startImport({ programId: p.id, mode: 'link', url: p.benefits_url, refresh: true });
    setBusyId(null);
    if ('error' in result) {
      setError(`${p.name}: ${result.error}`);
      await refresh();
    } else router.push(`/import/${result.importId}`);
  }

  async function saveDates() {
    if (!profile || !datesValid(currentDates)) return;
    await write(sb.from('profile').update({
      birth_month: currentDates.birth_month,
      anniversary_month: currentDates.anniversary_month,
      anniversary_day: currentDates.anniversary_day,
      children: currentDates.children.map((c) => ({ name: c.name.trim(), birth_month: c.birth_month })),
    }).eq('user_id', profile.user_id));
    setDates(null);
    setSaved(true);
  }

  async function addProgram() {
    const row = { name: newName.trim(), kind: newKind, ...(isAdmin && newShared ? { user_id: null } : {}) };
    await write(sb.from('programs').insert(row));
    setNewName('');
  }

  async function logout() {
    await sb.auth.signOut();
    await idbClear();
    location.href = '/login';
  }

  return (
    <main className="space-y-6">
      <PageHeader title="מקורות והגדרות" subtitle="מאיפה מגיעות ההטבות" icon={Settings} />
      {!online && <Notice tone="warn">אין חיבור — אפשר רק לצפות.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {PROGRAM_KINDS.map((kind) => {
        const list = snapshot.programs.filter((p) => p.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="space-y-2">
            <SectionTitle>{KIND_LABELS[kind]}</SectionTitle>
            <ul className="space-y-2">
              {list.map((p) => {
                const editable = !isShared(p) || isAdmin;
                return (
                  <li key={p.id} className="space-y-2.5 rounded-2xl border border-line bg-panel p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 font-semibold">
                        {p.last_refresh_status === 'failed' && <TriangleAlert size={15} className="text-warn" aria-label="הרענון האחרון נכשל" />}
                        {p.name}
                        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-normal text-dim">{isShared(p) ? 'משותף' : 'פרטי'}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {activeCount(p.id)} הטבות · {p.last_refreshed_at ? `עודכן ${formatDate(p.last_refreshed_at)}` : 'טרם עודכן'}
                      </p>
                    </div>
                    {editable && (
                      <>
                        <input dir="ltr" type="url" placeholder="קישור לדף ההטבות" defaultValue={p.benefits_url ?? ''}
                          aria-label={`קישור להטבות של ${p.name}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== p.benefits_url) write(sb.from('programs').update({ benefits_url: v }).eq('id', p.id));
                          }}
                          className={`${field} text-sm`} />
                        <div className="flex gap-2">
                          <button disabled={!online || !p.benefits_url || busyId !== null} onClick={() => refreshProgram(p)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-mint py-2 text-sm font-semibold text-mint-ink disabled:opacity-40">
                            <RefreshCw size={14} aria-hidden />
                            {busyId === p.id ? 'מרענן… (עד כמה דקות)' : 'רענון'}
                          </button>
                          <button disabled={!online}
                            onClick={() => {
                              if (confirm(`למחוק את ${p.name} וכל ההטבות שלה?`)) write(sb.from('programs').delete().eq('id', p.id));
                            }}
                            aria-label={`מחיקת ${p.name}`} className="grid w-10 place-items-center rounded-xl border border-line text-bad disabled:opacity-40">
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="space-y-2">
        <SectionTitle>הוספת תוכנית</SectionTitle>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם" aria-label="שם התוכנית"
            className={`${field} min-w-0 flex-1`} />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as ProgramKind)} aria-label="סוג"
            className={`${field} w-36! shrink-0`}>
            {PROGRAM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
          <button disabled={!online || !newName.trim()} onClick={addProgram}
            className="rounded-xl border border-line bg-panel-2 px-3 disabled:opacity-40">הוספה</button>
        </div>
        {isAdmin ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4 accent-mint" checked={newShared} onChange={(e) => setNewShared(e.target.checked)} />
            משותף לכל המשתמשים
          </label>
        ) : (
          <p className="text-xs text-dim">תוכניות שתוסיפו יופיעו רק אצלכם.</p>
        )}
      </section>

      {notSeen.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>לא נמצאו ברענון האחרון</SectionTitle>
          <ul className="space-y-2">
            {notSeen.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-3">
                <p className="min-w-0 flex-1 text-sm">{b.title} · {programName.get(b.program_id)}</p>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'archived' }).eq('id', b.id))}
                  className="text-sm text-bad">הסרה</button>
                <button disabled={!online} onClick={() => write(sb.from('benefits').update({ status: 'active' }).eq('id', b.id))}
                  className="text-sm text-mint">עדיין קיימת</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile && (
        <section className="space-y-4 rounded-2xl border border-line bg-panel p-4">
          <h2 className="font-semibold">הגדרות</h2>
          <DatesForm value={currentDates} onChange={(v) => { setDates(v); setSaved(false); }} />
          {dates && (
            <Button disabled={!online || !datesValid(currentDates)} onClick={saveDates} className="w-full">שמירת התאריכים</Button>
          )}
          {saved && !dates && <Notice tone="success">התאריכים נשמרו.</Notice>}
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-mint" disabled={!online} checked={profile.email_reminders}
              onChange={(e) => write(sb.from('profile').update({ email_reminders: e.target.checked }).eq('user_id', profile.user_id))} />
            תזכורת במייל כשמתחיל חודש של תאריך מיוחד
          </label>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-bad"><LogOut size={15} aria-hidden /> יציאה</button>
        </section>
      )}

      {isAdmin && <AdminPanel programs={snapshot.programs} products={snapshot.products ?? []} onChange={refresh} />}
    </main>
  );
}
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: admin tools (invite, access list, admins, catalog products) and shared/private Sources" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Shared or private imports

**Files:**
- Modify: `src/app/(tabs)/import/page.tsx`, `src/app/(tabs)/import/[id]/page.tsx`

**Interfaces:**
- Consumes: `isShared` (Task 3), `existingForImport`, `ImportRow.shared` (Task 3), `imports.shared` column (Task 5).

- [ ] **Step 1: Apply the edits**

<!-- patch -->
```python
def sub(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)

# Import page: admins choose shared/private (only for shared programs); everyone else imports privately.
sub('src/app/(tabs)/import/page.tsx', [
    ("import { israelToday } from '@/lib/core/dates';",
     "import { isShared } from '@/lib/core/catalog';\nimport { israelToday } from '@/lib/core/dates';"),
    ("  const [isRefresh, setIsRefresh] = useState(false);",
     "  const [isRefresh, setIsRefresh] = useState(false);\n  const [shareChoice, setShareChoice] = useState(true);"),
    ("  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));",
     "  const programName = new Map(snapshot.programs.map((p) => [p.id, p.name]));\n"
     "  const isAdmin = Boolean(snapshot.profile?.is_admin);\n"
     "  const selected = snapshot.programs.find((p) => p.id === programId);\n"
     "  const toShared = isAdmin && shareChoice && Boolean(selected && isShared(selected));"),
    ("      program_id: programId, source: 'manual', raw_input: { url: null, text: null, paths: null },",
     "      program_id: programId, source: 'manual', shared: toShared, raw_input: { url: null, text: null, paths: null },"),
    ("      program_id: programId, source: 'chat', raw_input: { url: url.trim() || null, text: null, paths: null },",
     "      program_id: programId, source: 'chat', shared: toShared, raw_input: { url: url.trim() || null, text: null, paths: null },"),
    ("""          {snapshot.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>""",
     """          {snapshot.programs.map((p) => <option key={p.id} value={p.id}>{p.name}{isShared(p) ? '' : ' (פרטי)'}</option>)}
        </select>
      </label>
      {isAdmin && selected && isShared(selected) && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-mint" checked={shareChoice} onChange={(e) => setShareChoice(e.target.checked)} />
          לקטלוג המשותף (כל המשתמשים יראו)
        </label>
      )}"""),
])

# Review page: merge and write with the import's ownership.
sub('src/app/(tabs)/import/[id]/page.tsx', [
    ("  blankRow, planNewStores, rowProblems, scopePatch, scopeValue, toIncoming, type ImportRow, type NewStoreDraft, type ReviewRow,",
     "  blankRow, existingForImport, planNewStores, rowProblems, scopePatch, scopeValue, toIncoming, type ImportRow, type NewStoreDraft, type ReviewRow,"),
    ("""      const [stores, existing] = await Promise.all([
        selectAll<Store>((a, b) => sb.from('stores').select('*').order('id').range(a, b)),
        selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('program_id', imp.program_id)
          .neq('status', 'archived').order('id').range(a, b)),
      ]);""",
     """      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('not signed in');
      const shared = Boolean(imp.shared);
      const [stores, programBenefits] = await Promise.all([
        selectAll<Store>((a, b) => sb.from('stores').select('*').order('id').range(a, b)),
        selectAll<Benefit>((a, b) => sb.from('benefits').select('*').eq('program_id', imp.program_id).order('id').range(a, b)),
      ]);
      // Shared imports merge with shared benefits only; private ones with your own only.
      const existing = existingForImport(programBenefits, imp.program_id, shared, user.id);"""),
    ("          const { data, error } = await sb.from('stores').insert({\n",
     "          const { data, error } = await sb.from('stores').insert({\n            ...(shared ? { user_id: null } : {}),\n"),
    (".insert(plan.inserts.map((b) => ({ ...b, program_id: imp.program_id, last_verified_at: nowIso })));",
     ".insert(plan.inserts.map((b) => ({ ...b, program_id: imp.program_id, last_verified_at: nowIso, ...(shared ? { user_id: null } : {}) })));"),
    ("<PageHeader title={`בדיקת ייבוא · ${program?.name ?? ''}`} icon={ClipboardCheck} />",
     "<PageHeader title={`בדיקת ייבוא · ${program?.name ?? ''}`} icon={ClipboardCheck} />\n"
     "      <p className=\"text-xs text-dim\">{imp.shared ? 'לקטלוג המשותף — כל המשתמשים יראו' : 'פרטי — רק אתם תראו'}</p>"),
])
```

- [ ] **Step 2: Typecheck, test, build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/import"
git commit -m "feat: imports are shared (admin choice) or private, and merge only with the same ownership" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Database privacy tests and end-to-end onboarding

**Files:**
- Create: `vitest.db.config.ts`, `tests/db/rls.test.ts`, `tests/e2e/onboarding.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts` (use a store name that cannot clash with the shared catalog), `package.json` (`test:db`)

**Interfaces:**
- Consumes: the migrated database (Task 5), onboarding labels (Task 6), home page selectors.

- [ ] **Step 1: Database privacy tests**

<!-- file: vitest.db.config.ts -->
```ts
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

// Runs against the real Supabase project with throwaway "e2e" users: npm run test:db
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/db/**/*.test.ts'], env: loadEnv('', process.cwd(), ''), testTimeout: 60_000, fileParallelism: false },
});
```

<!-- file: tests/db/rls.test.ts -->
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type TestUser = { sb: SupabaseClient; id: string };

async function signIn(email: string): Promise<TestUser> {
  if (!/e2e/i.test(email)) throw new Error('test users must contain "e2e"');
  await admin.auth.admin.createUser({ email, email_confirm: true }); // fails harmlessly if it exists
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: e2 } = await sb.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' });
  if (e2) throw e2;
  return { sb, id: session.user!.id };
}

let a: TestUser;
let b: TestUser;
let sharedId: string;

beforeAll(async () => {
  a = await signIn('e2e-rls-a@example.com');
  b = await signIn('e2e-rls-b@example.com');
  for (const u of [a, b]) {
    await admin.from('programs').delete().eq('user_id', u.id);
    await admin.from('wallet_items').delete().eq('user_id', u.id);
    await admin.from('profile').upsert({ user_id: u.id, birth_month: 1, is_admin: false });
  }
  const { data, error } = await admin.from('programs').insert({ user_id: null, name: 'RLS shared', kind: 'club' }).select('id').single();
  if (error) throw error;
  sharedId = data.id;
});

afterAll(async () => {
  if (sharedId) await admin.from('programs').delete().eq('id', sharedId);
  for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
});

const names = async (u: TestUser) =>
  ((await u.sb.from('programs').select('name').like('name', 'RLS%')).data ?? []).map((r) => r.name as string).sort();

describe('row level security', () => {
  it('a user reads shared rows and only their own private rows', async () => {
    const { error } = await a.sb.from('programs').insert({ name: 'RLS-A private', kind: 'club' });
    expect(error).toBeNull();
    expect(await names(a)).toEqual(['RLS shared', 'RLS-A private']);
    expect(await names(b)).toEqual(['RLS shared']);
  });

  it('a normal user cannot create, change or delete shared rows', async () => {
    const insert = await a.sb.from('programs').insert({ user_id: null, name: 'RLS hack', kind: 'club' });
    expect(insert.error).not.toBeNull();
    await a.sb.from('programs').update({ name: 'RLS changed' }).eq('id', sharedId);
    await a.sb.from('programs').delete().eq('id', sharedId);
    const { data } = await admin.from('programs').select('name').eq('id', sharedId).single();
    expect(data?.name).toBe('RLS shared');
  });

  it('a user cannot make themselves admin', async () => {
    const { error } = await a.sb.from('profile').update({ is_admin: true }).eq('user_id', a.id);
    expect(error).not.toBeNull();
    const { data } = await admin.from('profile').select('is_admin').eq('user_id', a.id).single();
    expect(data?.is_admin).toBe(false);
  });

  it("a user cannot see another user's wallet", async () => {
    await b.sb.from('wallet_items').insert({ name: 'RLS-B card', type: 'card' });
    const { data } = await a.sb.from('wallet_items').select('name');
    expect((data ?? []).map((r) => r.name)).not.toContain('RLS-B card');
  });

  it('an admin can change shared rows', async () => {
    await admin.from('profile').update({ is_admin: true }).eq('user_id', a.id);
    const { error } = await a.sb.from('programs').update({ name: 'RLS shared 2' }).eq('id', sharedId);
    expect(error).toBeNull();
    const { data } = await admin.from('programs').select('name').eq('id', sharedId).single();
    expect(data?.name).toBe('RLS shared 2');
    await admin.from('profile').update({ is_admin: false }).eq('user_id', a.id);
  });
});
```

Then: `npm pkg set "scripts.test:db=vitest run --config vitest.db.config.ts"`

- [ ] **Step 2: Run the database tests**

Run: `npm run test:db`
Expected: 5 passed. (Requires Task 5's migration.)

- [ ] **Step 3: End-to-end onboarding test and smoke-test fix**

<!-- file: tests/e2e/onboarding.spec.ts -->
```ts
import { expect, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const EMAIL = 'e2e-onboard@example.com';
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function deleteUser() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === EMAIL);
  if (user) await admin.auth.admin.deleteUser(user.id);
}

test('a new user ticks a card in onboarding and immediately sees its shared benefit', async ({ page, context }) => {
  const created: { table: string; id: string }[] = [];
  const add = async (table: string, row: object) => {
    const { data, error } = await admin.from(table).insert(row).select('id').single();
    if (error) throw error;
    created.push({ table, id: data.id });
    return data.id as string;
  };
  await deleteUser();
  try {
    // Shared test fixtures, removed again at the end.
    const programId = await add('programs', { user_id: null, name: 'תוכנית בדיקה E2E', kind: 'card_issuer' });
    const storeId = await add('stores', { user_id: null, name_he: 'חנות בדיקה', name_en: 'E2E Test Store', category: 'other' });
    await add('benefits', {
      user_id: null, program_id: programId, store_id: storeId, title: '20% הנחת בדיקה', type: 'percent_off', value: 20,
      requires: 'pay_with_card', timing: 'always',
    });
    await add('card_products', { user_id: null, name: 'כרטיס בדיקה E2E', type: 'card', program_ids: [programId] });

    await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
    if (error) throw error;
    const jar = new Map<string, string>();
    const sb = createServerClient(URL, KEY, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    });
    await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' })));

    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel('חודש יום ההולדת', { exact: true }).selectOption('5');
    await page.getByRole('button', { name: 'המשך' }).click();
    await page.getByLabel('כרטיס בדיקה E2E').check();
    await page.getByRole('button', { name: 'המשך' }).click();
    await page.getByRole('button', { name: 'סיום' }).click();

    await page.getByPlaceholder('איפה אתם קונים?').fill('E2E Test Store');
    await page.getByRole('button', { name: /חנות בדיקה/ }).click();
    await page.getByLabel('כמה אתם מוציאים? (₪)').fill('100');
    const first = page.getByTestId('pay-results').getByRole('listitem').first();
    await expect(first).toContainText('כרטיס בדיקה E2E');
    await expect(first).toContainText('₪20');
  } finally {
    for (const { table, id } of created.reverse()) await admin.from(table).delete().eq('id', id);
    await deleteUser();
  }
});
```

<!-- patch -->
```python
p = 'tests/e2e/smoke.spec.ts'
s = open(p, encoding='utf-8').read()
for a, b in [
    ("sb.from('stores').insert({ name_he: 'מנגו', name_en: 'Mango', category: 'fashion' })",
     "sb.from('stores').insert({ name_he: 'מנגו בדיקה', name_en: 'Mango E2E', category: 'fashion' })"),
    ("await page.getByPlaceholder('איפה אתם קונים?').fill('mango');", "await page.getByPlaceholder('איפה אתם קונים?').fill('mango e2e');"),
    ("await page.getByRole('button', { name: /מנגו/ }).click();", "await page.getByRole('button', { name: /מנגו בדיקה/ }).click();"),
]:
    assert a in s, a
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8').write(s)
```

- [ ] **Step 4: Run the end-to-end tests**

Run: `npm run e2e`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: database privacy rules and new-user onboarding end to end" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Monthly refresh of the shared catalog

**Files:**
- Create: `scripts/monthly-refresh.md`
- External: a scheduled task in the Claude desktop app (1st of each month)

**Interfaces:**
- Consumes: `scripts/list-shared-programs.mjs`, `scripts/load-researched-benefits.mjs` (Task 5), extraction rules in `src/lib/ai/prompt.ts`.

- [ ] **Step 1: Instructions for the scheduled run**

<!-- file: scripts/monthly-refresh.md -->
````markdown
# Monthly refresh of the shared benefits catalog

Run by a scheduled task on the 1st of each month. Work in `C:\Users\gabri\my projects\benefits-finder`.

1. Run `node scripts/list-shared-programs.mjs` to get the shared programs (name, kind, benefits link).
2. For every program, research its **current** benefits on the web, official site first. Use one subagent per program, in parallel, model `sonnet`.
   - Follow the extraction rules in `SYSTEM_PROMPT` in `src/lib/ai/prompt.ts` exactly.
   - The known-store list is empty: put stores in `new_stores` and point to them with `new_store_index`; `store_id` is always null.
   - Never invent values, dates or codes; skip anything expired or unverifiable.
3. Save each program as `{ "source_url", "new_stores", "benefits" }` JSON in one temporary folder, file name = a short ASCII key (e.g. `max.json`).
4. Run `node scripts/load-researched-benefits.mjs <folder> <key>=<program name> …` for every file. This puts each program into the admin's "waiting for approval" list as a **shared** import. Do not approve anything.
5. End with one line per program: benefits found, and anything skipped and why.
````

- [ ] **Step 2: Create the scheduled task**

Create a scheduled task named "Monthly benefits refresh", cron `0 9 1 * *` (09:00 on the 1st, local time), whose prompt is: "Follow the instructions in C:\Users\gabri\my projects\benefits-finder\scripts\monthly-refresh.md."

- [ ] **Step 3: Commit**

```bash
git add scripts/monthly-refresh.md
git commit -m "chore: monthly shared-catalog refresh instructions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verify and deploy

- [ ] **Step 1: Full verification**

Run: `npm test && npx tsc --noEmit && npm run build && npm run test:db && npm run e2e`
Expected: everything passes.

- [ ] **Step 2: Phone-size screenshots** of onboarding (3 steps), wallet (product picker, club birthday), Sources (dates, badges, admin panel), home banner with a special date, import with the shared switch. Fix any layout problem found, then re-run Step 1.

- [ ] **Step 3: Deploy**

Run: `npx vercel@latest deploy --prod --yes`
Expected: `readyState: READY`; `/login` returns 200 on https://benefits-finder-swart.vercel.app.

---

## Self-Review Notes

Spec coverage: §3 data model → Tasks 1, 5; RLS and admin-proof profile → Task 5, tested in Task 10; §4 special dates → Tasks 1–2; catalog helpers → Task 3; ownership-safe merge → Tasks 3, 9; §5 screens → Tasks 2, 6, 7, 8, 9; §6 invites → Task 8; §7 catalog content (products, stores, owner data, monthly refresh) → Tasks 4, 5, 11; §8 switchover → Task 5; §9 errors → Tasks 3, 8, 10; §10 testing → unit tests in Tasks 1–4, database tests and e2e in Task 10, screenshots in Task 12.
