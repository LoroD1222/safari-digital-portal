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

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function get<T>(path: string, params: Record<string, string> = {}): Promise<Result<T>> {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return { ok: false, error: "Meta isn't connected yet." };
  const qs = new URLSearchParams({ ...params, access_token: token });
  try {
    const res = await fetch(`${GRAPH}${path}?${qs}`, { cache: "no-store" });
    const json = (await res.json()) as T & { error?: { message?: string; code?: number } };
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Meta returned an error (${res.status}).`;
      if (json.error?.code === 190) return { ok: false, error: "Meta rejected the token. Generate a new one for the system user and update META_SYSTEM_USER_TOKEN." };
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

// An "inquiry" from ads = leads (forms, website pixel) + WhatsApp/Messenger conversations started.
function inquiriesFrom(actions: Action[] | undefined) {
  const v = (t: string) => Number(actions?.find((a) => a.action_type === t)?.value ?? 0);
  const leads = v("lead") || v("onsite_conversion.lead_grouped") || v("offsite_conversion.fb_pixel_lead");
  const chats = v("onsite_conversion.messaging_conversation_started_7d");
  return Math.round(leads + chats);
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
    get<{ data: { id: string; effective_status: string }[] }>(`/${accountId}/campaigns`, { fields: "id,effective_status", limit: "200" }),
  ]);
  if (!ins.ok) return ins;
  const status = Object.fromEntries((camps.ok ? camps.data.data : []).map((c) => [c.id, c.effective_status]));
  const campaigns: Campaign[] = ins.data.data.map((r) => {
    const s = status[r.campaign_id ?? ""] ?? "";
    return {
      name: r.campaign_name ?? "Campaign",
      status: (s === "ACTIVE" ? "active" : s === "PAUSED" || s === "CAMPAIGN_PAUSED" ? "paused" : "ended") as Campaign["status"],
      spend: Math.round(Number(r.spend ?? 0) * 100) / 100,
      inquiries: inquiriesFrom(r.actions),
    };
  }).filter((c) => c.spend > 0 || c.inquiries > 0).sort((a, b) => b.spend - a.spend);
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

// Pull this month (and last month, so it ends on final numbers) into ad_reports.
export async function syncClient(clientId: string): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient();
  const { data: c } = await admin.from("clients").select("meta_ad_account_id").eq("id", clientId).single();
  if (!c?.meta_ad_account_id) return { ok: false, message: "Choose the client's ad account first." };
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
  return { ok: true, message: "Synced from Meta." };
}

export async function syncAll() {
  const admin = createAdminClient();
  const { data } = await admin.from("clients").select("id, name").not("meta_ad_account_id", "is", null).neq("account_status", "paused");
  const results: { client: string; ok: boolean; message: string }[] = [];
  for (const c of data ?? []) results.push({ client: c.name, ...(await syncClient(c.id)) });
  return results;
}
