import "server-only";

// Website visitors from Vercel Web Analytics, via Safari Digital's own Vercel
// account. One token covers every client site hosted there.
const API = "https://api.vercel.com";

export function vercelConfigured() {
  return !!process.env.ANALYTICS_VERCEL_TOKEN;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(path: string, params: Record<string, string | string[] | undefined>, revalidate = 3600): Promise<Result<T>> {
  const token = process.env.ANALYTICS_VERCEL_TOKEN;
  if (!token) return { ok: false, error: "Vercel isn't connected yet." };
  const team = await teamParam();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...team })) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v) qs.set(k, v);
  }
  try {
    const res = await fetch(`${API}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` }, next: { revalidate } });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Vercel rejected the token. Create a new one and update ANALYTICS_VERCEL_TOKEN." };
    if (res.status === 402) return { ok: false, error: "Web Analytics isn't available for this project on its current Vercel plan." };
    if (!res.ok) return { ok: false, error: `Vercel returned an error (${res.status}). Check that Web Analytics is turned on for this project.` };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, error: "Couldn't reach Vercel. Try again in a minute." };
  }
}

// Which team to query: an explicit setting, otherwise the token's first team.
let teamCache: Record<string, string> | null = null;
async function teamParam(): Promise<Record<string, string>> {
  if (process.env.ANALYTICS_VERCEL_TEAM_ID) return { teamId: process.env.ANALYTICS_VERCEL_TEAM_ID };
  if (teamCache) return teamCache;
  try {
    const res = await fetch(`${API}/v2/teams?limit=1`, { headers: { Authorization: `Bearer ${process.env.ANALYTICS_VERCEL_TOKEN}` }, next: { revalidate: 86400 } });
    const json = (await res.json()) as { teams?: { id: string }[] };
    teamCache = json.teams?.[0]?.id ? { teamId: json.teams[0].id } : {};
  } catch {
    teamCache = {};
  }
  return teamCache;
}

export type VercelProject = { id: string; name: string };

export async function listProjects(): Promise<Result<VercelProject[]>> {
  const r = await call<{ projects: VercelProject[] }>("/v10/projects", { limit: "100" }, 300);
  if (!r.ok) return r;
  return { ok: true, data: r.data.projects.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export type MonthRange = { since: string; until: string; label: string; days: number };

// Calendar month in UTC. offset 0 = this month, -1 = last month.
export function monthRange(offset: number, now = new Date()): MonthRange {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const until = offset === 0 ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : end;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    since: iso(start), until: iso(until), days: until.getUTCDate(),
    label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) + (offset === 0 ? " (so far)" : ""),
  };
}

export type WebsiteStats = {
  visitors: number;
  pageviews: number;
  daily: { date: string; visitors: number; pageviews: number }[];
  pages: { path: string; pageviews: number }[];
  countries: { country: string; visitors: number }[];
};

type Row = Record<string, string | number | undefined>;

export async function websiteStats(projectId: string, range: MonthRange): Promise<Result<WebsiteStats>> {
  const base = { projectId, since: range.since, until: range.until };
  const [total, daily, pages, countries] = await Promise.all([
    call<{ data: { pageviews?: number; visitors?: number } }>("/v1/query/web-analytics/visits/count", base),
    call<{ data: Row[] }>("/v1/query/web-analytics/visits/aggregate", { ...base, by: "day", limit: "100" }),
    call<{ data: Row[] }>("/v1/query/web-analytics/visits/aggregate", { ...base, by: "requestPath", limit: "6" }),
    call<{ data: Row[] }>("/v1/query/web-analytics/visits/aggregate", { ...base, by: "country", limit: "6" }),
  ]);
  if (!total.ok) return total;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  return {
    ok: true,
    data: {
      visitors: num(total.data.data?.visitors),
      pageviews: num(total.data.data?.pageviews),
      daily: daily.ok ? daily.data.data.map((r) => ({ date: String(r.timestamp ?? "").slice(0, 10), visitors: num(r.visitors), pageviews: num(r.pageviews) })) : [],
      pages: pages.ok ? pages.data.data.filter((r) => r.requestPath !== "Others").map((r) => ({ path: String(r.requestPath), pageviews: num(r.pageviews) })) : [],
      countries: countries.ok ? countries.data.data.filter((r) => r.country !== "Others").map((r) => ({ country: String(r.country), visitors: num(r.visitors) })) : [],
    },
  };
}
