"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listSites, syncSeoClient } from "@/lib/search-console";

type R = { ok: true; message?: string } | { ok: false; error: string };
const done = (id: string, message?: string): R => { revalidatePath(`/admin/clients/${id}`); revalidatePath("/portal/seo"); return { ok: true, message }; };
const migrate = (m: string) => (/seo_|gsc_site/.test(m) ? "Run 0032_seo.sql in Supabase first." : m);

export async function searchConsoleSites(): Promise<{ ok: true; sites: string[] } | { ok: false; error: string }> {
  await requireAdmin();
  try { return { ok: true, sites: await listSites() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't reach Search Console." }; }
}

// Connects the client's Search Console property and pulls the data straight away.
export async function setSearchConsoleSite(clientId: string, site: string): Promise<R> {
  await requireAdmin();
  const s = site.trim();
  if (s && !/^(sc-domain:[a-z0-9.-]+|https?:\/\/\S+)$/i.test(s)) return { ok: false, error: "Use the property exactly as Search Console shows it, e.g. sc-domain:asanja.com or https://www.asanja.com/." };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ gsc_site: s || null, seo_sync_error: null }).eq("id", clientId);
  if (error) return { ok: false, error: migrate(error.message) };
  if (!s) return done(clientId, "Disconnected.");
  const r = await syncSeoClient(clientId);
  return r.ok ? done(clientId, r.message) : { ok: false, error: r.message };
}

export async function syncSeoNow(clientId: string): Promise<R> {
  await requireAdmin();
  const r = await syncSeoClient(clientId);
  return r.ok ? done(clientId, r.message) : { ok: false, error: r.message };
}

// One keyword per line (or comma separated).
export async function addSeoKeywords(clientId: string, text: string): Promise<R> {
  await requireAdmin();
  const list = [...new Set(text.split(/[\n,]+/).map((k) => k.trim().replace(/\s+/g, " ")).filter(Boolean).map((k) => k.slice(0, 120)))];
  if (!list.length) return { ok: false, error: "Type at least one search, e.g. serengeti safari." };
  const supabase = await createClient();
  // One by one: a keyword already tracked (any capitalisation) is skipped by the unique index.
  let added = 0;
  for (const keyword of list) {
    const { error } = await supabase.from("seo_keywords").insert({ client_id: clientId, keyword });
    if (!error) added++;
    else if (!/duplicate|unique/.test(error.message)) return { ok: false, error: migrate(error.message) };
  }
  if (!added) return { ok: false, error: "Already tracking that." };
  if (added) await syncSeoClient(clientId).catch(() => null);
  return done(clientId, `${added === 1 ? "Keyword" : `${added} keywords`} added.`);
}

export async function removeSeoKeyword(clientId: string, id: string): Promise<R> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("seo_keywords").delete().eq("id", id).eq("client_id", clientId);
  return error ? { ok: false, error: error.message } : done(clientId);
}

// The monthly "What we did" note the client sees. Empty text removes the month.
export async function saveSeoWork(clientId: string, month: string, body: string): Promise<R> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Pick a month." };
  const supabase = await createClient();
  const text = body.trim().slice(0, 5000);
  const { error } = text
    ? await supabase.from("seo_work").upsert({ client_id: clientId, month: `${month}-01`, body: text, updated_at: new Date().toISOString() }, { onConflict: "client_id,month" })
    : await supabase.from("seo_work").delete().eq("client_id", clientId).eq("month", `${month}-01`);
  return error ? { ok: false, error: migrate(error.message) } : done(clientId, text ? "Saved. The client sees it on their SEO tab." : "Removed.");
}

export type BacklinkInput = { month: string; site: string; url?: string; anchor?: string; authority?: string; cost?: string; status?: string };

function readBacklink(b: BacklinkInput) {
  const site = (b.site ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").slice(0, 200);
  if (!/^\d{4}-\d{2}-01$/.test(b.month)) return { error: "Pick a month." };
  if (!site) return { error: "Add the website the backlink is on, e.g. safaribookings.com." };
  const url = (b.url ?? "").trim();
  if (url && !/^https?:\/\/\S+$/.test(url)) return { error: "The link should start with https://" };
  const authority = b.authority?.trim() ? Number(b.authority) : null;
  if (authority !== null && (!Number.isInteger(authority) || authority < 0 || authority > 100)) return { error: "Authority is a number from 0 to 100." };
  const cost = b.cost?.trim() ? Number(b.cost.replace(/[, ]/g, "")) : null;
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return { error: "The cost must be a number." };
  const status = ["planned", "live", "lost"].includes(b.status ?? "") ? b.status : "planned";
  return { row: { month: b.month, site, url: url || null, anchor: b.anchor?.trim().slice(0, 200) || null, authority, cost, status } };
}

export async function saveBacklink(clientId: string, b: BacklinkInput, id?: string): Promise<R> {
  await requireAdmin();
  const r = readBacklink(b);
  if ("error" in r) return { ok: false, error: r.error! };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("seo_backlinks").update(r.row).eq("id", id).eq("client_id", clientId)
    : await supabase.from("seo_backlinks").insert({ client_id: clientId, ...r.row });
  return error ? { ok: false, error: migrate(error.message) } : done(clientId, id ? "Saved." : "Backlink added.");
}

export async function setBacklinkStatus(clientId: string, id: string, status: "planned" | "live" | "lost"): Promise<R> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("seo_backlinks").update({ status }).eq("id", id).eq("client_id", clientId);
  return error ? { ok: false, error: error.message } : done(clientId);
}

export async function deleteBacklink(clientId: string, id: string): Promise<R> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("seo_backlinks").delete().eq("id", id).eq("client_id", clientId);
  return error ? { ok: false, error: error.message } : done(clientId, "Removed.");
}
