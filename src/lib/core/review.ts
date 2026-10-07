import type { IncomingBenefit } from './merge';
import { findStoreByName, normalize } from './normalize';
import type { Benefit, Category, Channel, Store } from './types';

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
  source: 'ai_link' | 'ai_text' | 'ai_screenshot' | 'scraper' | 'manual' | 'chat';
  raw_input: { url: string | null; text: string | null; paths: string[] | null };
  is_refresh: boolean;
  extracted: Extraction | null;
  status: 'pending_review' | 'saved' | 'rejected' | 'failed';
  error: string | null;
  created_at: string;
  shared?: boolean; // admin import into the shared catalog
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
  if ([row.value, row.min_spend, row.max_discount].some((n) => n != null && !Number.isFinite(n))) p.push('ערך לא תקין');
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

export interface StoreGroup {
  indexes: number[]; // new_store_index values that are this one store
  existingId: string | null; // reuse this store instead of creating one
  draft: NewStoreDraft;
}

/**
 * One entry per distinct store among the used new-store drafts: drafts with the same Hebrew or English
 * name collapse into one, and a draft matching a store that already exists reuses it. `stores` must be
 * fresh from the database so a retry after a half-failed save reuses what that attempt created.
 */
export function planNewStores(usedIndexes: number[], drafts: NewStoreDraft[], stores: Store[]): StoreGroup[] {
  const groups: StoreGroup[] = [];
  for (const i of usedIndexes) {
    const draft = drafts[i];
    if (!draft) continue;
    const keys = [normalize(draft.name_he), normalize(draft.name_en)].filter(Boolean);
    const same = groups.find((g) => [g.draft.name_he, g.draft.name_en].map(normalize).some((k) => keys.includes(k)));
    if (same) {
      same.indexes.push(i);
      continue;
    }
    const existing = findStoreByName(stores, draft.name_he) ?? findStoreByName(stores, draft.name_en);
    groups.push({ indexes: [i], existingId: existing?.id ?? null, draft });
  }
  return groups;
}

/** An empty row for typing a benefit by hand (manual entry, no AI). */
export function blankRow(): ReviewRow {
  return {
    approved: true, title: '', description: null, store_id: null, new_store_index: null, category: null,
    type: 'percent_off', value: null, min_spend: null, max_discount: null, requires: 'pay_with_card',
    coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
  };
}

export function toIncoming(
  row: ReviewRow,
  newStoreIds: (string | undefined)[],
  sourceUrl: string | null,
): IncomingBenefit {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { approved, new_store_index, ...rest } = row;
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

/** Benefits an import may update: same program and same ownership (shared ↔ shared, private ↔ your own). */
export function existingForImport(benefits: Benefit[], programId: string, shared: boolean, userId: string): Benefit[] {
  return benefits.filter((b) =>
    b.program_id === programId && b.status !== 'archived' && (shared ? b.user_id == null : b.user_id === userId));
}

/** Stores an import may reuse: shared imports only shared stores (a private store would hide or cascade-delete
 * shared benefits); private imports prefer shared stores, then the user's own. */
export function storesForImport(stores: Store[], shared: boolean): Store[] {
  const sharedStores = stores.filter((s) => s.user_id == null);
  return shared ? sharedStores : [...sharedStores, ...stores.filter((s) => s.user_id != null)];
}
