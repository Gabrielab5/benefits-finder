import { describe, expect, it } from 'vitest';
import type { Benefit } from '@/lib/core/types';
import { buildBirthdayEmail } from './birthdayEmail';

const benefit = (id: string, program_id: string, title: string, store_id: string | null = null) =>
  ({ id, program_id, title, store_id }) as Benefit;
const data = {
  programs: [
    { id: 'p1', name: 'רי-בר' }, { id: 'p2', name: 'דרים קארד' },
  ] as never,
  stores: [{ id: 's1', name_he: 'קסטרו' }] as never,
};

describe('buildBirthdayEmail', () => {
  const email = buildBirthdayEmail(
    [benefit('a', 'p1', 'שייק חינם'), benefit('b', 'p2', '20% הנחה', 's1'), benefit('c', 'p1', '<script>x</script>')],
    data, 'https://app.example', 'ספטמבר',
  );
  it('counts the benefits in the subject', () => {
    expect(email.subject).toContain('3 הטבות יום הולדת');
  });
  it('groups by program and names the store', () => {
    expect(email.html.indexOf('רי-בר')).toBeLessThan(email.html.indexOf('שייק חינם'));
    expect(email.html).toContain('20% הנחה — קסטרו');
  });
  it('escapes HTML coming from benefit pages', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
  it('links to the birthday filter and is right-to-left', () => {
    expect(email.html).toContain('href="https://app.example/benefits?birthday=1"');
    expect(email.html).toContain('dir="rtl"');
  });
});
