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
  push_dates?: boolean;
  push_expiring?: boolean;
  push_new?: boolean;
  push_new_since?: string | null; // "new benefits" counts shared benefits created after this
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

export interface GiftCard {
  id: string;
  name: string;
  amount: number;
  balance: number;
  received_on: string | null; // YYYY-MM-DD
  expires_on: string | null; // YYYY-MM-DD, inclusive
  code: string | null;
  link: string | null;
  any_store: boolean;
  store_ids: string[];
  stores_url: string | null;
  notes: string | null;
  image_path?: string | null; // in the private "imports" storage bucket
  created_at: string;
}

export interface Snapshot {
  profile: Profile | null;
  programs: Program[];
  wallet: WalletItem[];
  stores: Store[];
  benefits: Benefit[]; // never includes archived
  products?: CardProduct[];
  giftCards?: GiftCard[];
  fetchedAt: string;
}
