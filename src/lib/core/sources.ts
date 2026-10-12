import { normalize } from './normalize';
import type { Category, Program, ProgramKind, Snapshot } from './types';

export type SourceSort = 'name' | 'benefits' | 'updated';

export interface SourceRow {
  program: Program;
  count: number; // active benefits
  category: Category | null; // the category most of its benefits are in
}

export interface SourceFilters {
  kind: ProgramKind;
  query: string;
  category: Category | null;
  sort: SourceSort;
}

/** Programs of one kind, matching the search and category, sorted. */
export function listSources(s: Snapshot, f: SourceFilters): SourceRow[] {
  const storeCategory = new Map(s.stores.map((st) => [st.id, st.category]));
  const counts = new Map<string, Map<Category | null, number>>();
  for (const b of s.benefits) {
    if (b.status !== 'active') continue;
    const cat = b.category ?? (b.store_id ? storeCategory.get(b.store_id) ?? null : null);
    const m = counts.get(b.program_id) ?? new Map<Category | null, number>();
    m.set(cat, (m.get(cat) ?? 0) + 1);
    counts.set(b.program_id, m);
  }
  const q = normalize(f.query);
  const rows = s.programs
    .filter((p) => p.kind === f.kind && (!q || normalize(p.name).includes(q)))
    .map((program): SourceRow => {
      const m = counts.get(program.id) ?? new Map<Category | null, number>();
      let count = 0;
      let category: Category | null = null;
      let top = 0;
      for (const [cat, k] of m) {
        count += k;
        if (cat && k > top) [category, top] = [cat, k];
      }
      return { program, count, category };
    })
    .filter((r) => !f.category || r.category === f.category);
  const byName = (a: SourceRow, b: SourceRow) => a.program.name.localeCompare(b.program.name, 'he');
  return rows.sort((a, b) =>
    f.sort === 'benefits' ? b.count - a.count || byName(a, b)
    : f.sort === 'updated' ? (b.program.last_refreshed_at ?? '').localeCompare(a.program.last_refreshed_at ?? '') || byName(a, b)
    : byName(a, b));
}
