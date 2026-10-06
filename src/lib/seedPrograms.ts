import type { ProgramKind } from './core/types';

export interface SeedProgram {
  key: string;
  name: string;
  kind: ProgramKind;
}

/**
 * Wallet items for the picked programs: card issuers become cards, clubs and store clubs memberships.
 * `links[cardKey]` lists the club / store-club keys that card also unlocks (e.g. a Cal card of Dream Card).
 */
export function buildWalletItems(
  picked: SeedProgram[],
  links: Record<string, string[]>,
  idOf: (p: SeedProgram) => string,
): { name: string; type: 'card' | 'membership'; program_ids: string[] }[] {
  return picked.map((p) => ({
    name: p.name,
    type: p.kind === 'card_issuer' ? 'card' : 'membership',
    program_ids: [idOf(p), ...(links[p.key] ?? []).flatMap((k) => picked.filter((c) => c.key === k)).map(idOf)],
  }));
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
