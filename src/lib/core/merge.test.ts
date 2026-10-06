import { describe, expect, it } from 'vitest';
import { mergeImport, type IncomingBenefit } from './merge';
import type { Benefit } from './types';

const NOW = '2026-10-06T10:00:00.000Z';
const incoming = (o: Partial<IncomingBenefit> = {}): IncomingBenefit => ({
  store_id: 'mango', category: null, title: '10% הנחה', description: null, type: 'percent_off', value: 10,
  min_spend: null, max_discount: null, requires: 'pay_with_card', coupon_code: null, channel: 'both',
  timing: 'always', valid_from: null, valid_until: null, conditions: null, source_url: null, ...o,
});
const existing = (id: string, o: Partial<Benefit> = {}): Benefit => ({
  ...incoming(), id, program_id: 'cal', last_verified_at: '2026-01-01T00:00:00Z', status: 'active',
  created_at: '2026-01-01T00:00:00Z', ...o,
});

describe('mergeImport', () => {
  it('inserts a new benefit', () => {
    const plan = mergeImport([], [incoming()], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toEqual([]);
  });
  it('updates a benefit with the same store, type, value and timing', () => {
    const plan = mergeImport([existing('e1')], [incoming({ title: 'כותרת חדשה' })], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([
      { id: 'e1', patch: expect.objectContaining({ title: 'כותרת חדשה', last_verified_at: NOW, status: 'active' }) },
    ]);
  });
  it('restores a not_seen benefit that appears again', () => {
    const plan = mergeImport([existing('e1', { status: 'not_seen' })], [incoming()], { isRefresh: true, nowIso: NOW });
    expect(plan.updates[0].patch.status).toBe('active');
    expect(plan.notSeen).toEqual([]);
  });
  it('treats a different value as a different benefit', () => {
    const plan = mergeImport([existing('e1')], [incoming({ value: 15 })], { isRefresh: true, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.notSeen).toEqual(['e1']);
  });
  it('ignores archived benefits', () => {
    const plan = mergeImport([existing('e1', { status: 'archived' })], [incoming()], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
  });
  it('saves a benefit listed twice on the same page once', () => {
    const plan = mergeImport([], [incoming(), incoming({ title: 'שוב' })], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(1);
  });
  it('marks missing benefits as not seen only on a refresh', () => {
    const other = existing('e2', { store_id: 'castro' });
    expect(mergeImport([other], [incoming()], { isRefresh: true, nowIso: NOW }).notSeen).toEqual(['e2']);
    expect(mergeImport([other], [incoming()], { isRefresh: false, nowIso: NOW }).notSeen).toEqual([]);
  });
  it('is idempotent: saving the same import again creates nothing new', () => {
    const first = mergeImport([], [incoming(), incoming({ store_id: null, category: 'food', value: 5 })], { isRefresh: false, nowIso: NOW });
    const saved = first.inserts.map((b, i) => existing(`e${i}`, b));
    const second = mergeImport(saved, [incoming(), incoming({ store_id: null, category: 'food', value: 5 })], { isRefresh: false, nowIso: NOW });
    expect(second.inserts).toEqual([]);
    expect(second.updates).toHaveLength(2);
  });
  it('keeps two different gifts of the same program apart', () => {
    const gift = (title: string) => incoming({ store_id: null, type: 'gift', value: null, title });
    expect(mergeImport([], [gift('כוס קפה'), gift('מטריה')], { isRefresh: false, nowIso: NOW }).inserts).toHaveLength(2);
  });
  it('keeps the same percent with a different requirement or channel apart', () => {
    const plan = mergeImport([], [incoming(), incoming({ requires: 'coupon_code', coupon_code: 'X' }), incoming({ channel: 'online' })], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(3);
  });
  it('still updates a retitled percent benefit instead of duplicating it', () => {
    const plan = mergeImport([existing('e1')], [incoming({ title: 'עכשיו 10% על הכל' })], { isRefresh: false, nowIso: NOW });
    expect(plan.updates.map((u) => u.id)).toEqual(['e1']);
  });
  it('keeps category and general benefits apart', () => {
    const plan = mergeImport([], [incoming({ store_id: null, category: 'food' }), incoming({ store_id: null })], { isRefresh: false, nowIso: NOW });
    expect(plan.inserts).toHaveLength(2);
  });
});
