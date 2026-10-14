import { describe, expect, it } from 'vitest';
import type { DateWindow } from '@/lib/core/specialDates';
import type { Benefit } from '@/lib/core/types';
import { buildDateEmail } from './birthdayEmail';

const benefit = (id: string, program_id: string, title: string, store_id: string | null = null) =>
  ({ id, program_id, title, store_id }) as Benefit;
const win = (key: string, kind: DateWindow['kind'], label: string): DateWindow => ({ key, kind, label, month: 9 });
const data = {
  programs: [{ id: 'p1', name: 'רי-בר' }, { id: 'p2', name: 'דרים קארד' }] as never,
  stores: [{ id: 's1', name_he: 'קסטרו' }] as never,
};

describe('buildDateEmail', () => {
  const email = buildDateEmail([
    { window: win('birthday', 'birthday', 'יום ההולדת שלכם'), benefits: [benefit('a', 'p1', 'שייק חינם'), benefit('c', 'p1', '<script>x</script>')] },
    { window: win('child:נועה', 'child', 'יום ההולדת של נועה'), benefits: [benefit('b', 'p2', '20% הנחה', 's1')] },
  ], data, 'https://app.example');

  it('counts all benefits in the subject', () => {
    expect(email.subject).toContain('3 הטבות');
  });
  it('has a section per date with its icon', () => {
    expect(email.html).toContain('🎂 יום ההולדת שלכם');
    expect(email.html).toContain('🎈 יום ההולדת של נועה');
  });
  it('groups by program and names the store', () => {
    expect(email.html.indexOf('רי-בר')).toBeLessThan(email.html.indexOf('שייק חינם'));
    expect(email.html).toContain('20% הנחה — קסטרו');
  });
  it('escapes HTML coming from benefit pages', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
  it('links to the special-dates filter and is right-to-left', () => {
    expect(email.html).toContain('href="https://app.example/benefits?birthday=1"');
    expect(email.html).toContain('dir="rtl"');
  });
});
