// The admin payments calendar: what was paid, what falls due, and the monthly fees still to be invoiced.
import { MARKETING_PRICE, discounted, invoiceState, type DiscountType, type Invoice, type MarketingPackage } from "./types";

export type PayKind = "paid" | "due" | "overdue" | "draft" | "expected";
export type PayEvent = {
  date: string; kind: PayKind; clientId: string; client: string; amount: number; currency: string;
  label: string; href: string;
  invoiceId?: string; // set for real invoices: these can be moved on the calendar
};
export type BillableClient = {
  id: string; name: string; marketing_package: MarketingPackage | null; account_status: string | null; is_internal?: boolean | null;
  monthly_fee?: number | null; discount_type?: DiscountType | null; discount_value?: number | null; billing_start?: string | null;
};

// Monthly invoices are prepared on the 1st and due 14 days later.
export const MONTHLY_DUE_DAY = 15;

export function monthlyAmount(c: BillableClient) {
  if (!c.marketing_package) return 0;
  const list = MARKETING_PRICE[c.marketing_package];
  if (list === null) return Number(c.monthly_fee ?? 0);
  return discounted(list, (c.discount_type ?? "percent") as DiscountType, Number(c.discount_value ?? 0));
}

/** month = "YYYY-MM"; today = Tanzania date "YYYY-MM-DD". */
export function paymentEvents(month: string, invoices: Invoice[], clients: BillableClient[], today: string): PayEvent[] {
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const out: PayEvent[] = [];
  const now = new Date(today + "T12:00:00Z");
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const state = invoiceState(inv, new Date(now.getTime() - 3 * 3600e3));
    const date = state === "paid" ? (inv.paid_at ?? inv.due_date).slice(0, 10) : inv.due_date;
    if (!date.startsWith(month)) continue;
    const kind: PayKind = state === "paid" ? "paid" : state === "overdue" ? "overdue" : state === "draft" ? "draft" : "due";
    out.push({ date, kind, clientId: inv.client_id, client: names.get(inv.client_id) ?? "Client", amount: Number(inv.total), currency: inv.currency, label: inv.number, href: `/admin/invoices/${inv.id}`, invoiceId: inv.id });
  }
  // Fees not invoiced yet: this month (until the draft exists) and later months.
  if (month >= today.slice(0, 7)) {
    const period = `${month}-01`;
    for (const c of clients) {
      if (!c.marketing_package || c.is_internal || c.account_status === "paused") continue;
      if (c.billing_start && c.billing_start.slice(0, 7) > month) continue;
      const has = invoices.some((i) => i.client_id === c.id && i.kind === "monthly" && i.period_month === period && i.status !== "cancelled");
      const amount = Math.round(monthlyAmount(c) * 100) / 100;
      if (has || amount <= 0) continue;
      out.push({ date: `${month}-${String(MONTHLY_DUE_DAY).padStart(2, "0")}`, kind: "expected", clientId: c.id, client: c.name, amount, currency: "USD", label: "Monthly fee, not invoiced yet", href: `/admin/clients/${c.id}` });
    }
  }
  const order: Record<PayKind, number> = { overdue: 0, due: 1, draft: 2, expected: 3, paid: 4 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || a.client.localeCompare(b.client));
}

// Weeks (Monday first) covering the month, as ISO dates; null = outside the month.
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
