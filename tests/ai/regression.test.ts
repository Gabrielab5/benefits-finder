import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { extractBenefits } from '@/lib/ai/extract';
import { buildContext } from '@/lib/ai/prompt';
import { normalize } from '@/lib/core/normalize';
import type { Store } from '@/lib/core/types';

interface Expected {
  program: string;
  today: string;
  stores: Store[];
  benefits: ({ store: string | null } & Record<string, unknown>)[];
}

const dir = path.resolve('tests/ai/fixtures');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
  it(file, async () => {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const expected: Expected = JSON.parse(fs.readFileSync(path.join(dir, file.replace(/\.txt$/, '.expected.json')), 'utf8'));
    const out = await extractBenefits([{ type: 'text', text }], buildContext(expected.program, expected.stores, expected.today));

    const storeName = (b: (typeof out.benefits)[number]) =>
      b.store_id ? expected.stores.find((s) => s.id === b.store_id)?.name_en ?? 'UNKNOWN_ID'
        : b.new_store_index != null ? out.new_stores[b.new_store_index]?.name_en ?? 'BAD_INDEX' : null;

    for (const { store, ...fields } of expected.benefits) {
      const known = store != null && expected.stores.some((s) => normalize(s.name_en) === normalize(store));
      const found = out.benefits.some((b) => {
        const name = storeName(b);
        const storeOk = store == null ? name == null : name != null && normalize(name) === normalize(store) && (!known || b.store_id != null);
        return storeOk && Object.entries(fields).every(([k, v]) => b[k as keyof typeof b] === v);
      });
      expect(found, `missing: ${JSON.stringify({ store, ...fields })}\ngot: ${JSON.stringify(out, null, 2)}`).toBe(true);
    }
  });
}
