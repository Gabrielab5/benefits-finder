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
