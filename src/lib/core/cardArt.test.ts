import { describe, expect, it } from 'vitest';
import { cardArtFor, cardMatches, faceArt } from './cardArt';

describe('faceArt', () => {
  it('uses the brand art when the name is a known brand', () => {
    expect(faceArt(['מקס', 'ביחד בשבילך']).mark).toBe('max');
  });
  it('uses the colour the user picked, with the name as the wordmark', () => {
    expect(faceArt(['הכרטיס שלי'], '#ff0000')).toEqual({ from: '#ff0000', to: '#0e1424', mark: 'הכרטיס שלי' });
  });
  it('draws an unknown club from its name: same name, same colours', () => {
    const a = faceArt(['קום איל פו']);
    expect(a.mark).toBe('קום איל פו');
    expect(faceArt(['קום איל פו'])).toEqual(a);
    expect(a.from).toMatch(/^#[0-9a-f]{6}$/);
    const colours = new Set(['קסטרו', 'גולף', 'ארומה אספרסו בר', 'למטייל', 'זסט', 'אניפט'].map((n) => faceArt([n]).from));
    expect(colours.size).toBeGreaterThan(1);
  });
});

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
