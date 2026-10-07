import { normalize } from './normalize';

/** Brand-style look for a card or club, drawn by the app (approximate brand colours, no logo files). */
export interface CardArt {
  from: string; // gradient start
  to: string; // gradient end
  mark: string; // wordmark shown on the card
}

const BRANDS: { names: string[]; art: CardArt }[] = [
  { names: ['ישראכרט', 'isracard'], art: { from: '#0a2a66', to: '#2563eb', mark: 'ISRACARD' } },
  { names: ['מקס', 'max'], art: { from: '#831843', to: '#ec4899', mark: 'max' } },
  { names: ['כאל', 'cal'], art: { from: '#0c4a6e', to: '#0ea5e9', mark: 'CAL' } },
  { names: ['דיינרס', 'diners'], art: { from: '#0b0f19', to: '#64748b', mark: 'Diners Club' } },
  { names: ['אמריקן אקספרס', 'americanexpress', 'amex'], art: { from: '#0c4a6e', to: '#38bdf8', mark: 'AMEX' } },
  { names: ['דרים קארד', 'dreamcard'], art: { from: '#4c0519', to: '#e11d48', mark: 'DREAM CARD' } },
  { names: ['שופרסל', 'shufersal'], art: { from: '#7f1d1d', to: '#ef4444', mark: 'SHUFERSAL' } },
  { names: ['רי-בר', 'rebar'], art: { from: '#14532d', to: '#65a30d', mark: 'REBAR' } },
  { names: ['דלתא', 'delta'], art: { from: '#1e1b4b', to: '#6366f1', mark: 'DELTA+' } },
  { names: ['ביחד בשבילך', 'עובדים בריא', 'הסתדרות', 'histadrut'], art: { from: '#1e3a8a', to: '#dc2626', mark: 'ההסתדרות' } },
  { names: ['פלאי קארד', 'flycard'], art: { from: '#0f172a', to: '#0369a1', mark: 'FLY CARD' } },
  { names: ['חבר', 'hever'], art: { from: '#064e3b', to: '#10b981', mark: 'HEVER' } },
];

/** First name that matches a known brand wins: pass the wallet item name first, then its programs. */
export function cardArtFor(names: string[]): CardArt | null {
  for (const name of names) {
    const n = normalize(name);
    for (const brand of BRANDS) {
      if (brand.names.some((b) => n.includes(normalize(b)))) return brand.art;
    }
  }
  return null;
}
