// SEO data for the client's SEO tab and the admin view. Pure helpers are tested.
import type { createClient } from "./supabase/server";
import { planMonthStart, type SeoPlan } from "./seo-plan";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SeoDay = { day: string; clicks: number; impressions: number; position: number | null };
export type SeoTop = { kind: "query" | "page"; key: string; clicks: number; impressions: number; position: number | null; prev_clicks: number | null; prev_position: number | null };
export type SeoKeyword = { id: string; keyword: string; position: number | null; prev_position: number | null; clicks: number | null; impressions: number | null; best_page: string | null; checked_at: string | null };
export type SeoWork = { id: string; month: string; body: string; updated_at: string };
export type Backlink = { id: string; month: string; site: string; url: string | null; anchor: string | null; authority: number | null; cost: number | null; status: "planned" | "live" | "lost"; created_at: string };
export const BACKLINK_STATUS: Record<Backlink["status"], string> = { planned: "In progress", live: "Live", lost: "Lost" };

export type SeoTotals = { clicks: number; impressions: number; ctr: number | null; position: number | null };

// Totals for a set of days. Position is weighted by impressions, as Google does.
export function seoTotals(days: SeoDay[]): SeoTotals {
  const clicks = days.reduce((n, d) => n + d.clicks, 0);
  const impressions = days.reduce((n, d) => n + d.impressions, 0);
  const weighted = days.reduce((n, d) => n + (d.position ?? 0) * d.impressions, 0);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : null, position: impressions ? Math.round((weighted / impressions) * 10) / 10 : null };
}

// The last 28 days with data and the 28 days before them.
export function seoPeriods(days: SeoDay[]) {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const cur = sorted.slice(-28);
  const prev = sorted.slice(-56, -28);
  return { cur, prev, current: seoTotals(cur), previous: prev.length ? seoTotals(prev) : null, from: cur[0]?.day ?? null, to: cur.at(-1)?.day ?? null };
}

// "+12%" style change; null when there's nothing to compare.
export function pctChange(now: number, before: number | null | undefined) {
  if (before === null || before === undefined || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// Position change: positive = moved up (a smaller number is better).
export function positionMove(now: number | null, before: number | null) {
  if (now === null || before === null) return null;
  return Math.round((before - now) * 10) / 10;
}

export async function loadSeo(supabase: Supabase, clientId: string) {
  const since = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10);
  const [d, t, k, w, b, pl, pv] = await Promise.all([
    supabase.from("seo_daily").select("day, clicks, impressions, position").eq("client_id", clientId).gte("day", since).order("day"),
    supabase.from("seo_top").select("*").eq("client_id", clientId).order("clicks", { ascending: false }),
    supabase.from("seo_keywords").select("*").eq("client_id", clientId).order("created_at"),
    supabase.from("seo_work").select("*").eq("client_id", clientId).order("month", { ascending: false }).limit(12),
    supabase.from("seo_backlinks").select("*").eq("client_id", clientId).order("created_at"),
    supabase.from("seo_plan").select("month_no, title, price, backlinks").eq("client_id", clientId).order("month_no"),
    supabase.from("clients").select("seo_start").eq("id", clientId).maybeSingle(),
  ]);
  const ready = !d.error;
  return {
    ready,
    days: (d.data ?? []).map((r) => ({ day: r.day as string, clicks: Number(r.clicks), impressions: Number(r.impressions), position: r.position === null ? null : Number(r.position) })) as SeoDay[],
    top: (t.data ?? []) as SeoTop[],
    keywords: (k.data ?? []).map((r) => ({ ...r, position: r.position === null ? null : Number(r.position), prev_position: r.prev_position === null ? null : Number(r.prev_position) })) as SeoKeyword[],
    work: (w.data ?? []) as SeoWork[],
    backlinks: (b.data ?? []).map((r) => ({ ...r, cost: r.cost === null ? null : Number(r.cost) })) as Backlink[],
    plan: { start: (pv.data?.seo_start as string | null) ?? null, months: (pl.data ?? []).map((r) => ({ month_no: r.month_no, title: r.title, price: Number(r.price), backlinks: Number(r.backlinks) })) } as SeoPlan,
  };
}
export type SeoData = Awaited<ReturnType<typeof loadSeo>>;

// The months to show backlinks for: each plan month (with its calendar month), plus any month that has backlinks.
export function backlinkMonths(plan: SeoPlan, links: Backlink[]) {
  const out = new Map<string, { month: string; no: number | null; title: string; budget: number }>();
  for (const m of plan.months) {
    const start = planMonthStart(plan, m.month_no);
    if (start) out.set(start, { month: start, no: m.month_no, title: m.title, budget: m.backlinks });
  }
  for (const l of links) if (!out.has(l.month)) out.set(l.month, { month: l.month, no: null, title: "", budget: 0 });
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month));
}
