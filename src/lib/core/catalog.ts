import type { CardProduct, ProgramKind, WalletItem } from './types';

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

export type ProductGroup = 'card' | 'club' | 'store_club';

/** Where a catalog product is listed for picking: credit cards, then memberships split by the kind of programs they unlock. */
export function productGroup(p: Pick<CardProduct, 'type' | 'program_ids'>, kindOf: (programId: string) => ProgramKind | undefined): ProductGroup {
  if (p.type === 'card') return 'card';
  return p.program_ids.length > 0 && p.program_ids.every((id) => kindOf(id) === 'store_club') ? 'store_club' : 'club';
}

export type AdminAction = 'remove' | 'demote';

/** Why an admin change is refused, or null when it is fine. There must always be at least one admin. */
export function adminGuard(action: AdminAction, actorId: string, targetId: string, adminIds: string[]): 'self' | 'last_admin' | null {
  if (action === 'remove' && targetId === actorId) return 'self';
  if (adminIds.includes(targetId) && adminIds.length <= 1) return 'last_admin';
  return null;
}
