import "server-only";
import { createSign } from "node:crypto";
import { createAdminClient } from "./supabase/admin";

// Google Search Console for SEO clients. The portal reads it with a Google service account:
// GOOGLE_SERVICE_ACCOUNT in Vercel holds the account's JSON key, and each client adds the account's
// email as a user of their Search Console property (Restricted is enough).

type Creds = { client_email: string; private_key: string };

function creds(): Creds | null {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT ?? "").trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

// The email clients add to Search Console (shown in onboarding and on the admin card).
export function searchConsoleEmail() {
  return creds()?.client_email ?? null;
}

let cached: { token: string; until: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const c = creds();
  if (!c) throw new Error("GOOGLE_SERVICE_ACCOUNT isn't set in Vercel.");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: c.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(c.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description ?? j.error ?? res.status}`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function google<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${await token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j?.error?.message ?? `Search Console said ${res.status}`;
    throw new Error(res.status === 403 ? `No access to this property yet. ${msg}` : msg);
  }
  return j as T;
}

// Properties the service account can read: the ones clients have shared with us.
export async function listSites(): Promise<string[]> {
  const j = await google<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>("/sites");
  return (j.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl).sort();
}

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
async function query(site: string, body: object): Promise<Row[]> {
  const j = await google<{ rows?: Row[] }>(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { type: "web", dataState: "final", ...body });
  return j.rows ?? [];
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400_000;

// Search Console is ~2-3 days behind. Periods end 3 days ago.
export function seoRanges(now = Date.now()) {
  const end = now - 3 * DAY;
  return {
    daily: { startDate: iso(end - 89 * DAY), endDate: iso(end) },
    top: { startDate: iso(end - 27 * DAY), endDate: iso(end) },
    topPrev: { startDate: iso(end - 55 * DAY), endDate: iso(end - 28 * DAY) },
    week: { startDate: iso(end - 6 * DAY), endDate: iso(end) },
    weekPrev: { startDate: iso(end - 13 * DAY), endDate: iso(end - 7 * DAY) },
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Current rows with last period's clicks and position next to them.
export function withPrevious(cur: Row[], prev: Row[]) {
  const p = new Map(prev.map((r) => [r.keys?.[0] ?? "", r]));
  return cur.map((r) => {
    const k = r.keys?.[0] ?? "";
    const o = p.get(k);
    return { key: k, clicks: r.clicks, impressions: r.impressions, position: r2(r.position), prev_clicks: o ? o.clicks : null, prev_position: o ? r2(o.position) : null };
  });
}

export async function syncSeoClient(clientId: string): Promise<{ ok: boolean; message: string }> {
  const db = createAdminClient();
  const { data: c } = await db.from("clients").select("id, gsc_site").eq("id", clientId).maybeSingle();
  if (!c?.gsc_site) return { ok: false, message: "Pick the client's Search Console property first." };
  const site = c.gsc_site as string;
  const R = seoRanges();
  try {
    const [daily, q, qPrev, pg, pgPrev] = await Promise.all([
      query(site, { ...R.daily, dimensions: ["date"], rowLimit: 200 }),
      query(site, { ...R.top, dimensions: ["query"], rowLimit: 50 }),
      query(site, { ...R.topPrev, dimensions: ["query"], rowLimit: 500 }),
      query(site, { ...R.top, dimensions: ["page"], rowLimit: 50 }),
      query(site, { ...R.topPrev, dimensions: ["page"], rowLimit: 500 }),
    ]);
    if (daily.length) {
      await db.from("seo_daily").upsert(daily.map((r) => ({ client_id: clientId, day: r.keys![0], clicks: r.clicks, impressions: r.impressions, position: r2(r.position) })), { onConflict: "client_id,day" });
    }
    await db.from("seo_top").delete().eq("client_id", clientId);
    const top = [
      ...withPrevious(q, qPrev).map((r) => ({ ...r, kind: "query" })),
      ...withPrevious(pg, pgPrev).map((r) => ({ ...r, kind: "page" })),
    ].map((r) => ({ client_id: clientId, ...r }));
    if (top.length) await db.from("seo_top").insert(top);

    // Tracked keywords: Google's position for that exact search, this week and last week.
    const { data: kws } = await db.from("seo_keywords").select("id, keyword").eq("client_id", clientId);
    for (const k of kws ?? []) {
      const filter = { dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "equals", expression: String(k.keyword).toLowerCase().trim() }] }] };
      const [now, before] = await Promise.all([
        query(site, { ...R.week, dimensions: ["page"], rowLimit: 5, ...filter }),
        query(site, { ...R.weekPrev, dimensions: ["query"], rowLimit: 1, ...filter }),
      ]);
      const clicks = now.reduce((n, r) => n + r.clicks, 0);
      const impressions = now.reduce((n, r) => n + r.impressions, 0);
      // Average position weighted by impressions, as Google reports it for the query.
      const position = impressions ? r2(now.reduce((n, r) => n + r.position * r.impressions, 0) / impressions) : null;
      const best = [...now].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)[0]?.keys?.[0] ?? null;
      await db.from("seo_keywords").update({
        position, clicks, impressions, best_page: best, prev_position: before[0] ? r2(before[0].position) : null, checked_at: new Date().toISOString(),
      }).eq("id", k.id);
    }
    await db.from("clients").update({ seo_synced_at: new Date().toISOString(), seo_sync_error: null }).eq("id", clientId);
    return { ok: true, message: `Synced: ${daily.length} days, ${q.length} searches, ${pg.length} pages, ${kws?.length ?? 0} keywords.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await db.from("clients").update({ seo_sync_error: message.slice(0, 300) }).eq("id", clientId);
    return { ok: false, message };
  }
}

export async function syncAllSeo() {
  const db = createAdminClient();
  const { data } = await db.from("clients").select("id").eq("seo_enabled", true).not("gsc_site", "is", null);
  const out: Record<string, string> = {};
  for (const c of data ?? []) out[c.id] = (await syncSeoClient(c.id)).message;
  return out;
}
