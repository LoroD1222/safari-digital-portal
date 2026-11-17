import { describe, expect, it } from "vitest";
import { addMonths, planMonth, planMonthNo, planTotal, seoAmount, type SeoPlan } from "@/lib/seo-plan";
import { backlinkMonths, pctChange, positionMove, seoPeriods, seoTotals } from "@/lib/seo";
import { canFinish, tasksFor } from "@/lib/onboarding";
import { mrr, mrrHistory, type Client, type ClientPrivate } from "@/lib/types";

const asanja: SeoPlan = { start: "2026-11-01", months: [
  { month_no: 1, title: "Foundation & Authority Building", price: 2_000_000, backlinks: 300_000 },
  { month_no: 2, title: "Content Authority & Backlink Expansion", price: 2_500_000, backlinks: 400_000 },
  { month_no: 3, title: "Authority, International SEO & AI Search", price: 3_000_000, backlinks: 500_000 },
] };

describe("SEO plan", () => {
  it("knows which plan month a calendar month is", () => {
    expect(planMonthNo(asanja, "2026-10-01")).toBeNull();
    expect(planMonthNo(asanja, "2026-11-01")).toBe(1);
    expect(planMonth(asanja, "2027-01-01")?.title).toBe("Authority, International SEO & AI Search");
    expect(planMonthNo(asanja, "2027-02-01")).toBeNull();
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
  });
  it("charges each month's price plus its backlinks", () => {
    expect(seoAmount(asanja, "2026-12-01")).toBe(2_900_000);
    expect(seoAmount(asanja, "2027-03-01")).toBe(0);
    expect(planTotal(asanja)).toBe(8_700_000);
  });
  it("counts the plan in MRR: month 1 before it starts, then the current month, nothing after", () => {
    const c = [{ id: "a", account_status: "active", created_at: "2026-10-01", is_internal: false }] as Client[];
    const b = [{ client_id: "a", monthly_fee: null, currency: "TZS", billing_start: null, notes: null }] as ClientPrivate[];
    const plans = new Map([["a", asanja]]);
    expect(mrr(c, b, new Date("2026-10-15"), plans).totals.TZS).toBe(2_300_000);
    expect(mrr(c, b, new Date("2026-12-15"), plans).totals.TZS).toBe(2_900_000);
    expect(mrr(c, b, new Date("2027-03-15"), plans).totals.TZS).toBeUndefined();
    const h = mrrHistory(c, b, "TZS", 6, new Date("2027-02-10"), plans).map((x) => x.value);
    expect(h).toEqual([0, 0, 2_300_000, 2_900_000, 3_500_000, 0]);
  });
});

describe("SEO results", () => {
  const day = (d: string, clicks: number, impressions: number, position: number) => ({ day: d, clicks, impressions, position });
  it("weights position by impressions and compares 28-day periods", () => {
    expect(seoTotals([day("2026-11-01", 5, 100, 10), day("2026-11-02", 5, 300, 20)])).toMatchObject({ clicks: 10, impressions: 400, position: 17.5 });
    const days = Array.from({ length: 56 }, (_, i) => day(addMonths("2026-01-01", 0).slice(0, 8) + String((i % 28) + 1).padStart(2, "0") + `-${i}`, i < 28 ? 1 : 2, 10, 10))
      .map((d, i) => ({ ...d, day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10) }));
    const p = seoPeriods(days);
    expect(p.current.clicks).toBe(56);
    expect(pctChange(p.current.clicks, p.previous?.clicks)).toBe(100);
    expect(positionMove(8, 12)).toBe(4);
  });
  it("lists a backlinks month for every plan month", () => {
    const m = backlinkMonths(asanja, []);
    expect(m.map((x) => [x.no, x.month, x.budget])).toEqual([[1, "2026-11-01", 300_000], [2, "2026-12-01", 400_000], [3, "2027-01-01", 500_000]]);
  });
});

describe("SEO onboarding", () => {
  it("SEO-only clients get SEO tasks and no Meta or photos", () => {
    expect(tasksFor({ marketing: false, website: false, seo: true }).map((t) => t.key)).toEqual(["business", "seo_goals", "search_console", "site_access"]);
    expect(tasksFor({ marketing: false, website: false }).map((t) => t.key)).not.toContain("seo_goals");
  });
  it("access tasks need the client's confirmation", () => {
    expect(canFinish("search_console", { seo: { has_gsc: "yes" } })).toBe(false);
    expect(canFinish("search_console", { seo: { has_gsc: "yes", gsc_added: true } })).toBe(true);
    expect(canFinish("search_console", { seo: { has_gsc: "no" } })).toBe(true);
    expect(canFinish("site_access", { seo: { platform: "wordpress" } })).toBe(false);
    expect(canFinish("site_access", { seo: { platform: "safari_digital" } })).toBe(true);
  });
});
