import { describe, expect, it } from "vitest";
import { monthGrid, paymentEvents, shiftMonth, type BillableClient } from "@/lib/payments-calendar";
import type { Invoice } from "@/lib/types";

const inv = (o: Partial<Invoice>): Invoice => ({
  id: "i", client_id: "a", number: "SD-1", kind: "monthly", period_month: "2026-11-01", status: "sent", currency: "USD",
  issue_date: "2026-11-01", due_date: "2026-11-15", items: [], total: 440, notes: null, sent_at: null, paid_at: null,
  payment_method: null, payment_ref: null, reminder_sent_at: null, overdue_sent_at: null, created_at: "", ...o,
});
const A: BillableClient = { id: "a", name: "Golden Trips", marketing_package: "growth", account_status: "active", discount_type: "percent", discount_value: 10 };
const B: BillableClient = { id: "b", name: "Chatama", marketing_package: "scale", account_status: "active" };
const I: BillableClient = { id: "c", name: "Safari Digital", marketing_package: "growth", account_status: "active", is_internal: true };

describe("payments calendar", () => {
  it("puts paid invoices on the paid date, unpaid on the due date, and overdue in red", () => {
    const ev = paymentEvents("2026-11", [
      inv({ id: "1", status: "paid", paid_at: "2026-11-09T10:00:00Z" }),
      inv({ id: "2", client_id: "b", due_date: "2026-11-05" }),
    ], [A, B], "2026-11-07");
    expect(ev.map((e) => [e.date, e.kind, e.client])).toEqual([["2026-11-05", "overdue", "Chatama"], ["2026-11-09", "paid", "Golden Trips"]]);
  });

  it("shows next month's fees as expected, with discounts, never for internal or paused clients", () => {
    const ev = paymentEvents("2026-12", [], [A, B, I, { ...B, id: "p", account_status: "paused" }], "2026-11-07");
    expect(ev.map((e) => [e.date, e.client, e.amount, e.kind])).toEqual([["2026-12-15", "Chatama", 770, "expected"], ["2026-12-15", "Golden Trips", 396, "expected"]]);
  });

  it("doesn't project past months, months before billing starts, or months already invoiced", () => {
    expect(paymentEvents("2026-10", [], [A], "2026-11-07")).toEqual([]);
    expect(paymentEvents("2026-12", [], [{ ...A, billing_start: "2027-01-01" }], "2026-11-07")).toEqual([]);
    expect(paymentEvents("2026-11", [inv({ status: "draft" })], [A], "2026-11-07").map((e) => e.kind)).toEqual(["draft"]);
  });

  it("builds Monday-first weeks", () => {
    const g = monthGrid("2026-11"); // 1 Nov 2026 is a Sunday
    expect(g[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
