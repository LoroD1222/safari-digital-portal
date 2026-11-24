// Supabase returns at most 1,000 rows per request. This keeps asking, page by page,
// until it has them all (or hits `max`). The query must have a stable order.
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50_000,
  size = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, Math.min(from + size, max) - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return { data: out, error: null };
}
