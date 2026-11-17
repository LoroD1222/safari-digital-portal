// The SEO plan: month 1..N from a start month, each with its own name, price and backlinks cost.
// Pure helpers, used for invoices, MRR, the payments calendar and the SEO tabs.

export type SeoPlanMonth = { month_no: number; title: string; price: number; backlinks: number };
export type SeoPlan = { start: string | null; months: SeoPlanMonth[] }; // start = first day of month 1

// "2026-11-01" + 2 → "2027-01-01"
export function addMonths(day: string, n: number) {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

// The calendar month (first day) of plan month n.
export function planMonthStart(plan: SeoPlan, n: number) {
  return plan.start ? addMonths(plan.start.slice(0, 8) + "01", n - 1) : null;
}

// Which plan month a calendar month is (1-based), or null outside the plan.
export function planMonthNo(plan: SeoPlan, period: string) {
  if (!plan.start || !plan.months.length) return null;
  const [sy, sm] = plan.start.split("-").map(Number);
  const [py, pm] = period.split("-").map(Number);
  const n = (py - sy) * 12 + (pm - sm) + 1;
  return n >= 1 && n <= Math.max(...plan.months.map((m) => m.month_no)) ? n : null;
}

export function planMonth(plan: SeoPlan, period: string) {
  const n = planMonthNo(plan, period);
  return n === null ? null : plan.months.find((m) => m.month_no === n) ?? null;
}

// What the client pays for SEO in a calendar month (price plus backlinks); 0 outside the plan.
export function seoAmount(plan: SeoPlan | undefined, period: string) {
  const m = plan ? planMonth(plan, period) : null;
  return m ? Number(m.price) + Number(m.backlinks) : 0;
}

export function planTotal(plan: SeoPlan) {
  return plan.months.reduce((n, m) => n + Number(m.price) + Number(m.backlinks), 0);
}

// Group plan rows by client.
export function plansByClient(rows: (SeoPlanMonth & { client_id: string })[], starts: { client_id: string; seo_start?: string | null }[]) {
  const map = new Map<string, SeoPlan>();
  for (const s of starts) map.set(s.client_id, { start: s.seo_start ?? null, months: [] });
  for (const r of rows) {
    const p = map.get(r.client_id) ?? { start: null, months: [] };
    p.months.push({ month_no: r.month_no, title: r.title, price: Number(r.price), backlinks: Number(r.backlinks) });
    map.set(r.client_id, p);
  }
  for (const p of map.values()) p.months.sort((a, b) => a.month_no - b.month_no);
  return map;
}
