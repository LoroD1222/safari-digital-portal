import "server-only";
import { createAdminClient } from "./supabase/admin";
import { monthBounds } from "./dates";
import type { Campaign } from "./types";

// Facebook & Instagram ad results through the Meta Marketing API, read with
// Safari Digital's system user token (META_SYSTEM_USER_TOKEN). Read-only.
const VERSION = process.env.META_API_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

export function metaConfigured() {
  return !!process.env.META_SYSTEM_USER_TOKEN;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function get<T>(path: string, params: Record<string, string> = {}): Promise<Result<T>> {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return { ok: false, error: "Meta isn't connected yet." };
  const qs = new URLSearchParams({ ...params, access_token: token });
  try {
    const res = await fetch(`${GRAPH}${path}?${qs}`, { cache: "no-store" });
    const json = (await res.json()) as T & { error?: { message?: string; code?: number } };
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Meta returned an error (${res.status}).`;
      if (json.error?.code === 190) return { ok: false, error: "Meta rejected the token. Generate a new one for the system user and update META_SYSTEM_USER_TOKEN." };
      if (/api access blocked/i.test(msg)) {
        return { ok: false, error: "Meta blocked the portal's app (API access blocked). Check developers.facebook.com → your app for a restriction or required check, then generate a new system user token." };
      }
      if (json.error?.code === 10 || json.error?.code === 200 || /permission/i.test(msg)) {
        return { ok: false, error: "Meta didn't allow access to this ad account. Check it's assigned to the system user (View performance). " + msg };
      }
      return { ok: false, error: msg };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "Couldn't reach Meta. Try again in a minute." };
  }
}

export type AdAccount = { id: string; name: string; currency?: string };

// Ad accounts the system user can see (assigned in Business Suite).
export async function listAdAccounts(): Promise<Result<AdAccount[]>> {
  const r = await get<{ data: AdAccount[] }>("/me/adaccounts", { fields: "id,name,currency", limit: "200" });
  if (!r.ok) return r;
  return { ok: true, data: r.data.data.sort((a, b) => a.name.localeCompare(b.name)) };
}

type Action = { action_type: string; value: string };
type InsightRow = { campaign_id?: string; campaign_name?: string; spend?: string; actions?: Action[] };

// An "inquiry" from ads = leads (forms, website pixel) + chats started (Instagram, Messenger, WhatsApp).
export function resultsFrom(actions: Action[] | undefined) {
  const v = (t: string) => Number(actions?.find((a) => a.action_type === t)?.value ?? 0);
  const leads = Math.round(v("lead") || v("onsite_conversion.lead_grouped") || v("offsite_conversion.fb_pixel_lead"));
  const chats = Math.round(v("onsite_conversion.messaging_conversation_started_7d"));
  return { leads, chats, inquiries: leads + chats };
}

export async function monthResults(accountId: string, offset = 0): Promise<Result<{ month: string; spend: number; inquiries: number; campaigns: Campaign[] }>> {
  const m = monthBounds(offset);
  const lastDay = new Date(new Date(m.next + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const until = lastDay < today ? lastDay : today;
  const [ins, camps] = await Promise.all([
    get<{ data: InsightRow[] }>(`/${accountId}/insights`, {
      level: "campaign", fields: "campaign_id,campaign_name,spend,actions",
      time_range: JSON.stringify({ since: m.start, until }), limit: "200",
    }),
    get<{ data: { id: string; name: string; effective_status: string }[] }>(`/${accountId}/campaigns`, { fields: "id,name,effective_status", limit: "200" }),
  ]);
  if (!ins.ok) return ins;
  const status = Object.fromEntries((camps.ok ? camps.data.data : []).map((c) => [c.id, c.effective_status]));
  const campaigns: Campaign[] = ins.data.data.map((r) => {
    const s = status[r.campaign_id ?? ""] ?? "";
    return {
      name: r.campaign_name ?? "Campaign",
      status: (s === "ACTIVE" ? "active" : s === "PAUSED" || s === "CAMPAIGN_PAUSED" ? "paused" : "ended") as Campaign["status"],
      spend: Math.round(Number(r.spend ?? 0) * 100) / 100,
      ...resultsFrom(r.actions),
    };
  }).filter((c) => c.spend > 0 || c.inquiries > 0);
  // This month: also show campaigns that are live or in review but haven't spent yet.
  if (offset === 0 && camps.ok) {
    const seen = new Set(ins.data.data.map((r) => r.campaign_id));
    for (const c of camps.data.data) {
      if (seen.has(c.id) || !["ACTIVE", "IN_PROCESS", "WITH_ISSUES"].includes(c.effective_status)) continue;
      campaigns.push({ name: c.name || "Campaign", status: "active", spend: 0, leads: 0, chats: 0, inquiries: 0 } as Campaign);
    }
  }
  campaigns.sort((a, b) => b.spend - a.spend);
  return {
    ok: true,
    data: {
      month: m.start,
      spend: Math.round(campaigns.reduce((s, c) => s + c.spend, 0) * 100) / 100,
      inquiries: campaigns.reduce((s, c) => s + c.inquiries, 0),
      campaigns,
    },
  };
}

// Pull this month (and last month, so it ends on final numbers) into ad_reports,
// plus the ads themselves (creatives and results) into meta_ads.
export async function syncClient(clientId: string): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient();
  const { data: c } = await admin.from("clients").select("meta_ad_account_id").eq("id", clientId).single();
  if (!c?.meta_ad_account_id) return { ok: false, message: "Choose the client's ad account first." };
  const { syncAds } = await import("./meta-ads");
  const ads = await syncAds(clientId, c.meta_ad_account_id).catch((e: Error) => ({ ok: false, count: 0, error: e.message }));
  const now = new Date();
  const offsets = now.getUTCDate() <= 7 ? [0, -1] : [0];
  for (const o of offsets) {
    const r = await monthResults(c.meta_ad_account_id, o);
    if (!r.ok) return { ok: false, message: r.error };
    const { error } = await admin.from("ad_reports").upsert({
      client_id: clientId, month: r.data.month, meta_spend: r.data.spend, meta_inquiries: r.data.inquiries,
      campaigns: r.data.campaigns, source: "synced",
    }, { onConflict: "client_id,month" });
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true, message: ads.ok ? `Synced from Meta, including ${ads.count} ${ads.count === 1 ? "ad" : "ads"}.` : `Results synced from Meta. Ads couldn't be synced: ${ads.error}` };
}

export async function syncAll() {
  const admin = createAdminClient();
  const { data } = await admin.from("clients").select("id, name").not("meta_ad_account_id", "is", null).neq("account_status", "paused");
  const results: { client: string; ok: boolean; message: string }[] = [];
  for (const c of data ?? []) results.push({ client: c.name, ...(await syncClient(c.id)) });
  return results;
}
