import { describe, expect, it } from 'vitest';
import { cardArtFor } from './cardArt';

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
