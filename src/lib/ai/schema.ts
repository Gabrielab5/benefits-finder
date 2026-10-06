import { z } from 'zod';
import { BENEFIT_TYPES, CATEGORIES, CHANNELS, REQUIRES, TIMINGS } from '@/lib/core/types';

// Every field is required and nullable: structured outputs need every property listed.
export const ExtractionSchema = z.object({
  new_stores: z.array(
    z.object({
      name_he: z.string(),
      name_en: z.string(),
      aliases: z.array(z.string()),
      category: z.enum(CATEGORIES),
      channel: z.enum(CHANNELS),
    }),
  ),
  benefits: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
      store_id: z.string().nullable(),
      new_store_index: z.number().int().nullable(),
      category: z.enum(CATEGORIES).nullable(),
      type: z.enum(BENEFIT_TYPES),
      value: z.number().nullable(),
      min_spend: z.number().nullable(),
      max_discount: z.number().nullable(),
      requires: z.enum(REQUIRES),
      coupon_code: z.string().nullable(),
      channel: z.enum(CHANNELS),
      timing: z.enum(TIMINGS),
      valid_from: z.string().nullable(),
      valid_until: z.string().nullable(),
      conditions: z.string().nullable(),
    }),
  ),
});
