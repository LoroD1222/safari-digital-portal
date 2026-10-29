import "server-only";
import { createAdminClient } from "./supabase/admin";
import { vercelConfigured, websiteStats, type MonthRange, type WebsiteStats } from "./vercel";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type SiteClient = { id: string; vercel_project_id?: string | null; tracking_since?: string | null };

// Visitor numbers from the Safari Digital snippet (page_views), in the same shape as Vercel's.
export async function trackerStats(clientId: string, range: MonthRange): Promise<Result<WebsiteStats>> {
  const admin = createAdminClient();
  const from = new Date(range.since + "T00:00:00+03:00").toISOString();
  const to = new Date(Date.parse(range.until + "T00:00:00+03:00") + 864e5).toISOString();
  const rows: { at: string; visitor: string; path: string; country: string | null }[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await admin.from("page_views").select("at, visitor, path, country")
      .eq("client_id", clientId).gte("at", from).lt("at", to).order("at").range(page * 1000, page * 1000 + 999);
    if (error) return { ok: false, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const day = (iso: string) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);
  const byDay = new Map<string, { v: Set<string>; p: number }>();
  const pages = new Map<string, number>();
  const countries = new Map<string, Set<string>>();
  const visitors = new Set<string>();
  for (const r of rows) {
    const d = day(r.at);
    const e = byDay.get(d) ?? { v: new Set(), p: 0 };
    e.v.add(r.visitor); e.p++; byDay.set(d, e);
    visitors.add(r.visitor);
    pages.set(r.path, (pages.get(r.path) ?? 0) + 1);
    if (r.country) { const s = countries.get(r.country) ?? new Set(); s.add(r.visitor); countries.set(r.country, s); }
  }
  return {
    ok: true,
    data: {
      visitors: visitors.size,
      pageviews: rows.length,
      daily: [...byDay.entries()].sort().map(([date, e]) => ({ date, visitors: e.v.size, pageviews: e.p })),
      pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([path, pageviews]) => ({ path, pageviews })),
      countries: [...countries.entries()].map(([country, s]) => ({ country, visitors: s.size })).sort((a, b) => b.visitors - a.visitors).slice(0, 6),
    },
  };
}

// Which source this client's website numbers come from: Vercel, the snippet, or none.
export function statsSource(c: SiteClient): "vercel" | "snippet" | null {
  if (c.vercel_project_id && vercelConfigured()) return "vercel";
  if (c.tracking_since) return "snippet";
  return null;
}

export async function clientWebsiteStats(c: SiteClient, range: MonthRange): Promise<Result<WebsiteStats> | null> {
  const src = statsSource(c);
  if (src === "vercel") return websiteStats(c.vercel_project_id!, range);
  if (src === "snippet") return trackerStats(c.id, range);
  return null;
}
