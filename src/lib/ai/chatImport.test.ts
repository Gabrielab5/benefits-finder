import { describe, expect, it } from 'vitest';
import type { Store } from '@/lib/core/types';
import { buildChatPrompt, parseChatAnswer } from './chatImport';

const stores: Store[] = [{ id: 's1', name_he: 'מנגו', name_en: 'Mango', aliases: [], category: 'fashion', channel: 'both' }];

describe('buildChatPrompt', () => {
  it('includes the rules, my stores, today and the answer format', () => {
    const prompt = buildChatPrompt({ programName: 'חבר', stores, todayIso: '2026-10-06' });
    expect(prompt).toContain('s1 | מנגו | Mango');
    expect(prompt).toContain('Today: 2026-10-06');
    expect(prompt).toContain('"new_stores"');
    expect(prompt).toContain('```json');
  });
  it('asks the chatbot to open the link when one is given', () => {
    expect(buildChatPrompt({ programName: 'חבר', stores, todayIso: '2026-10-06', url: 'https://x.co/b' }))
      .toContain('https://x.co/b');
  });
});

const benefit = { title: '15% הנחה', store_id: 's1', type: 'percent_off', value: 15 };

describe('parseChatAnswer', () => {
  it('reads a JSON code block surrounded by chat text', () => {
    const answer = `Here you go:\n\`\`\`json\n${JSON.stringify({ new_stores: [], benefits: [benefit] })}\n\`\`\`\nAnything else?`;
    const result = parseChatAnswer(answer);
    expect(result.ok && result.extraction.benefits[0].value).toBe(15);
  });
  it('reads bare JSON', () => {
    expect(parseChatAnswer(JSON.stringify({ benefits: [benefit] })).ok).toBe(true);
  });
  it('fills in fields the chatbot left out', () => {
    const result = parseChatAnswer(JSON.stringify({ benefits: [{ title: '1+1', type: 'bogo' }] }));
    expect(result.ok && result.extraction).toEqual({
      new_stores: [],
      benefits: [{
        title: '1+1', description: null, store_id: null, new_store_index: null, category: null, type: 'bogo',
        value: null, min_spend: null, max_discount: null, requires: 'pay_with_card', coupon_code: null,
        channel: 'both', timing: 'always', valid_from: null, valid_until: null, conditions: null,
      }],
    });
  });
  it('accepts numbers written as text', () => {
    const result = parseChatAnswer(JSON.stringify({ benefits: [{ ...benefit, value: '15', min_spend: '300' }] }));
    expect(result.ok && [result.extraction.benefits[0].value, result.extraction.benefits[0].min_spend]).toEqual([15, 300]);
  });
  it('explains in Hebrew when there is no JSON', () => {
    expect(parseChatAnswer('Sorry, I cannot open that link.')).toEqual({
      ok: false, error: 'לא נמצאה בתשובה רשימת הטבות. ודאו שהעתקתם את כל התשובה של הצ׳אט.',
    });
  });
  it('explains in Hebrew when the format is wrong', () => {
    const result = parseChatAnswer(JSON.stringify({ benefits: [{ title: 'x', type: 'discount' }] }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('התשובה לא בפורמט הנכון');
  });
});
