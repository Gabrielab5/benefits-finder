/** Recently picked store ids, most recent first: `id` moves to the front, no duplicates, at most `max` kept. */
export function addRecent(ids: string[], id: string, max = 5): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, max);
}
