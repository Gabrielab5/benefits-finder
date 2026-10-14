import { describe, expect, it } from 'vitest';
import { cardArtFor, cardMatches } from './cardArt';

describe('cardArtFor', () => {
  it('recognises card companies and clubs by Hebrew or English name', () => {
    expect(cardArtFor(['ישראכרט'])?.mark).toBe('ISRACARD');
    expect(cardArtFor(['Isracard Gold'])?.mark).toBe('ISRACARD');
    expect(cardArtFor(['כאל'])?.mark).toBe('CAL');
    expect(cardArtFor(['עובדים בריא'])?.mark).toBe('ההסתדרות');
  });
  it('uses the wallet item name before the programs it unlocks', () => {
    expect(cardArtFor(['דרים קארד – כרטיס אשראי', 'דרים קארד'])?.mark).toBe('DREAM CARD');
    expect(cardArtFor(['מקס', 'ביחד בשבילך'])?.mark).toBe('max');
  });
  it('falls back to the programs when the item name is unknown', () => {
    expect(cardArtFor(['הכרטיס הכחול שלי', 'כאל'])?.mark).toBe('CAL');
  });
  it('returns null for unknown names', () => {
    expect(cardArtFor(['מועדון השכונה'])).toBeNull();
  });
});

describe('cardMatches', () => {
  it('finds a card by its own name, ignoring case, spaces and final letters', () => {
    expect(cardMatches('מקס - כרטיס אשראי', 'מקס')).toBe(true);
    expect(cardMatches('Isracard Gold', 'isracard')).toBe(true);
    expect(cardMatches('דרים קארד', 'דריםקארד')).toBe(true);
  });
  it('finds a Hebrew-named card by its brand name in English, and the other way round', () => {
    expect(cardMatches('מקס - כרטיס אשראי', 'max')).toBe(true);
    expect(cardMatches('מקס - כרטיס אשראי', 'MA')).toBe(true);
    expect(cardMatches('Shufersal Online', 'שופרסל')).toBe(true);
  });
  it('matches everything for an empty query and nothing unrelated', () => {
    expect(cardMatches('כאל', '  ')).toBe(true);
    expect(cardMatches('מקס - כרטיס אשראי', 'cal')).toBe(false);
    expect(cardMatches('מועדון השכונה', 'max')).toBe(false);
  });
});
