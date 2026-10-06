import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Extraction } from '@/lib/core/review';
import { SYSTEM_PROMPT } from './prompt';
import { ExtractionSchema } from './schema';

export const MODEL = 'claude-opus-5-5';

export type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

export class ExtractError extends Error {}

let client: Anthropic | null = null;

export async function extractBenefits(content: ContentBlock[], context: string): Promise<Extraction> {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // Backup: if this model declines a page, Anthropic re-runs it on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ExtractionSchema) },
      messages: [{ role: 'user', content: [...content, { type: 'text', text: context }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw e;
    throw new ExtractError('invalid_output'); // output did not parse (e.g. cut off mid-JSON)
  }
  if (response.stop_reason === 'refusal') throw new ExtractError('refused'); // the backup model declined too
  if (response.stop_reason === 'max_tokens') throw new ExtractError('too_long');
  if (!response.parsed_output) throw new ExtractError('invalid_output');
  return response.parsed_output;
}
