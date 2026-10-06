export const PAGE_SIZE = 1000; // Supabase's default max rows per request

/** Reads every page. `page` must apply a stable .order(...) and .range(from, to). */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return out;
  }
}
