import { z } from 'zod';
import type { Extraction } from '@/lib/core/review';
import { BENEFIT_TYPES, CATEGORIES, CHANNELS, REQUIRES, TIMINGS, type Store } from '@/lib/core/types';
import { buildContext, SYSTEM_PROMPT } from './prompt';

/**
 * Free import: the app writes the instructions, the user runs them in any free chatbot
 * (Claude.ai, ChatGPT, Gemini) and pastes the answer back. No paid API involved.
 */
export function buildChatPrompt(opts: { programName: string; stores: Store[]; todayIso: string; url?: string }): string {
  const example = {
    new_stores: [{ name_he: 'קסטרו', name_en: 'Castro', aliases: [], category: 'fashion', channel: 'both' }],
    benefits: [{
      title: '15% הנחה על כל הקולקציה', description: null, store_id: null, new_store_index: 0, category: null,
      type: 'percent_off', value: 15, min_spend: null, max_discount: null, requires: 'pay_with_card',
      coupon_code: null, channel: 'both', timing: 'always', valid_from: null, valid_until: '2026-12-31', conditions: null,
    }],
  };
  return [
    'I am filling my personal benefits app. Follow these instructions exactly.',
    '',
    SYSTEM_PROMPT,
    '',
    buildContext(opts.programName, opts.stores, opts.todayIso),
    '',
    opts.url
      ? `The benefits page is: ${opts.url}\nOpen it and extract every benefit. If you cannot open it, say so and I will paste the text or screenshots instead.`
      : 'I will paste the benefits page text or screenshots right after this message.',
    '',
    'Answer format: reply with ONLY one ```json code block containing an object shaped exactly like this example (use null for anything not stated):',
    '```json',
    JSON.stringify(example, null, 2),
    '```',
    `Allowed values — type: ${BENEFIT_TYPES.join(', ')}; requires: ${REQUIRES.join(', ')}; channel: ${CHANNELS.join(', ')}; timing: ${TIMINGS.join(', ')}; category: ${CATEGORIES.join(', ')}.`,
  ].join('\n');
}

// Chatbots often leave out empty fields or write numbers as text, so the pasted answer is read leniently.
const text = z.string().nullable().default(null);
const num = z
  .preprocess((v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v), z.number().nullable())
  .default(null);

const AnswerSchema = z.object({
  new_stores: z.array(z.object({
    name_he: z.string(),
    name_en: z.string(),
    aliases: z.array(z.string()).default([]),
    category: z.enum(CATEGORIES).default('other'),
    channel: z.enum(CHANNELS).default('both'),
  })).default([]),
  benefits: z.array(z.object({
    title: z.string(),
    description: text,
    store_id: text,
    new_store_index: num,
    category: z.enum(CATEGORIES).nullable().default(null),
    type: z.enum(BENEFIT_TYPES),
    value: num,
    min_spend: num,
    max_discount: num,
    requires: z.enum(REQUIRES).default('pay_with_card'),
    coupon_code: text,
    channel: z.enum(CHANNELS).default('both'),
    timing: z.enum(TIMINGS).default('always'),
    valid_from: text,
    valid_until: text,
    conditions: text,
  })),
});

function findJson(answer: string): unknown {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const braces = answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1);
  for (const candidate of [fenced, braces]) {
    if (!candidate?.trim()) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

export function parseChatAnswer(answer: string): { ok: true; extraction: Extraction } | { ok: false; error: string } {
  const json = findJson(answer);
  if (json === undefined) {
    return { ok: false, error: 'לא נמצאה בתשובה רשימת הטבות. ודאו שהעתקתם את כל התשובה של הצ׳אט.' };
  }
  const parsed = AnswerSchema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') ?? '';
    return { ok: false, error: `התשובה לא בפורמט הנכון (${where}). בקשו מהצ׳אט לענות שוב בדיוק בפורמט שבהוראות.` };
  }
  return { ok: true, extraction: parsed.data };
}
