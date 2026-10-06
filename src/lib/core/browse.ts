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
