import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "./supabase/admin";

// Sends inquiry stages to the client's Meta dataset with the Conversions API
// ("CRM events"), using Safari Digital's system user token. Contact details
// are normalised and SHA-256 hashed before they leave the portal.
// Docs: Meta "Conversions API for CRM" (action_source system_generated).

const VERSION = process.env.META_CAPI_VERSION || "v26.0";
const SOURCE_NAME = "Safari Digital Portal";
const MAX_ATTEMPTS = 5;
const MAX_AGE_DAYS = 7; // Meta refuses events older than 7 days

export type MetaEventName = "Lead" | "Contacted" | "Booked";
export const STATUS_EVENT: Record<string, MetaEventName | undefined> = { contacted: "Contacted", booked: "Booked" };

type InquiryRow = {
  id: string; client_id: string; customer_name: string; email: string | null; phone: string | null; country: string | null;
  origin: string; external_id: string | null; fbc: string | null; fbp: string | null; received_at: string;
};

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const COUNTRIES: Record<string, string> = {
  "united states": "us", usa: "us", america: "us", "united kingdom": "gb", uk: "gb", england: "gb", germany: "de", france: "fr",
  netherlands: "nl", italy: "it", spain: "es", tanzania: "tz", kenya: "ke", canada: "ca", australia: "au", switzerland: "ch",
  austria: "at", belgium: "be", sweden: "se", norway: "no", denmark: "dk", poland: "pl", "south africa": "za", india: "in",
  china: "cn", japan: "jp", israel: "il", ireland: "ie", portugal: "pt", "united arab emirates": "ae", uae: "ae", slovenia: "si", croatia: "hr",
};

function phoneDigits(raw: string) {
  let d = raw.replace(/\D/g, "").replace(/^00/, "");
  // Local Tanzanian numbers (07xx…) get the country code.
  if (/^0[67]\d{8}$/.test(d)) d = "255" + d.slice(1);
  return d.length >= 8 ? d : null;
}

export function userData(i: Pick<InquiryRow, "customer_name" | "email" | "phone" | "country" | "origin" | "external_id" | "fbc" | "fbp">) {
  const u: Record<string, unknown> = {};
  const email = i.email?.trim().toLowerCase();
  if (email) u.em = [sha(email)];
  const ph = i.phone ? phoneDigits(i.phone) : null;
  if (ph) u.ph = [sha(ph)];
  const parts = i.customer_name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length) u.fn = [sha(parts[0])];
  if (parts.length > 1) u.ln = [sha(parts[parts.length - 1])];
  const c = i.country?.trim().toLowerCase();
  const iso = c && (/^[a-z]{2}$/.test(c) ? c : COUNTRIES[c]);
  if (iso) u.country = [sha(iso)];
  if (i.origin === "meta_lead_form" && i.external_id && /^\d{15,17}$/.test(i.external_id)) u.lead_id = Number(i.external_id);
  if (i.fbc) u.fbc = i.fbc;
  if (i.fbp) u.fbp = i.fbp;
  return u;
}

// Something Meta can match on: Lead ID, click ID, email or phone.
const matchable = (u: Record<string, unknown>) => !!(u.lead_id || u.fbc || u.em || u.ph);

type Sent = { ok: true } | { ok: false; error: string };

// The client's own dataset token if one is saved, otherwise the system user token.
async function tokenFor(clientId: string) {
  const { data, error } = await createAdminClient().from("client_private").select("meta_capi_token").eq("client_id", clientId).maybeSingle();
  return (!error && data?.meta_capi_token) || process.env.META_SYSTEM_USER_TOKEN || null;
}

async function post(token: string | null, datasetId: string, event: Record<string, unknown>, testCode?: string): Promise<Sent> {
  if (!token) return { ok: false, error: "No token: add META_SYSTEM_USER_TOKEN in Vercel, or a dataset access token for this client." };
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${datasetId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event], ...(testCode ? { test_event_code: testCode } : {}) }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } };
    if (res.ok && !json.error) return { ok: true };
    const e = json.error;
    if (e?.code === 190) return { ok: false, error: "Meta rejected the token. Generate a new system user token and update META_SYSTEM_USER_TOKEN." };
    if (e?.code === 10 || e?.code === 200 || /permission/i.test(e?.message ?? "")) {
      return { ok: false, error: "No permission for this dataset. Assign it to the Safari Portal system user (full control), or save a dataset access token from Events Manager for this client." };
    }
    if (e?.code === 100 && /does not exist|cannot be loaded/i.test(e.message ?? "")) return { ok: false, error: "Meta can't find this dataset ID, or the system user can't see it." };
    return { ok: false, error: e?.error_user_msg || e?.message || `Meta returned an error (${res.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach Meta." };
  }
}

function buildEvent(name: MetaEventName, at: Date, u: Record<string, unknown>, eventId: string) {
  return {
    event_name: name,
    event_time: Math.floor(at.getTime() / 1000),
    event_id: eventId,
    action_source: "system_generated",
    user_data: u,
    custom_data: { event_source: "crm", lead_event_source: SOURCE_NAME },
  };
}

async function deliver(rowId: string) {
  const admin = createAdminClient();
  const { data: ev } = await admin.from("meta_events").select("id, client_id, inquiry_id, event_name, event_key, event_time, attempts, status").eq("id", rowId).single();
  if (!ev || ev.status === "sent" || ev.status === "skipped") return;
  const finish = (patch: Record<string, unknown>) => admin.from("meta_events").update(patch).eq("id", rowId);

  const [{ data: client }, { data: inq }] = await Promise.all([
    admin.from("clients").select("meta_dataset_id").eq("id", ev.client_id).single(),
    admin.from("inquiries").select("id, client_id, customer_name, email, phone, country, origin, external_id, fbc, fbp, received_at").eq("id", ev.inquiry_id).maybeSingle(),
  ]);
  const dataset = client?.meta_dataset_id;
  if (!dataset) return finish({ status: "skipped", error: "No Meta dataset ID for this client." });
  if (!inq) return finish({ status: "skipped", error: "The inquiry was deleted." });
  const at = new Date(ev.event_time);
  if (Date.now() - at.getTime() > MAX_AGE_DAYS * 864e5) return finish({ status: "skipped", error: "Older than 7 days, Meta won't accept it." });
  const u = userData(inq as InquiryRow);
  if (!matchable(u)) return finish({ status: "skipped", error: "No email, phone or ad click to match on." });

  const res = await post(await tokenFor(ev.client_id), dataset, buildEvent(ev.event_name as MetaEventName, at, u, ev.event_key));
  const attempts = (ev.attempts ?? 0) + 1;
  if (res.ok) return finish({ status: "sent", attempts, error: null, sent_at: new Date().toISOString() });
  return finish({ status: "failed", attempts, error: res.error });
}

// Record an inquiry stage and send it to Meta. Never throws: a Meta problem
// must never stop an inquiry from being saved. Call it inside after().
export async function sendInquiryEvent(inquiryId: string, name: MetaEventName, at?: string | Date) {
  try {
    const admin = createAdminClient();
    const { data: inq } = await admin.from("inquiries").select("client_id, received_at").eq("id", inquiryId).maybeSingle();
    if (!inq) return;
    const { data: client } = await admin.from("clients").select("meta_dataset_id").eq("id", inq.client_id).single();
    if (!client?.meta_dataset_id) return; // not set up for this client
    const time = at ? new Date(at) : name === "Lead" ? new Date(inq.received_at) : new Date();
    const { data: row } = await admin.from("meta_events")
      .upsert({ client_id: inq.client_id, inquiry_id: inquiryId, event_name: name, event_key: `${inquiryId}:${name}`, event_time: time.toISOString() },
        { onConflict: "event_key", ignoreDuplicates: true })
      .select("id").maybeSingle();
    if (row) await deliver(row.id); // null when this stage was already recorded
  } catch (e) {
    console.error("Meta event not sent", e);
  }
}

// Daily: resend anything that failed or never went out.
export async function retryMetaEvents() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - (MAX_AGE_DAYS - 1) * 864e5).toISOString();
  const { data } = await admin.from("meta_events").select("id").in("status", ["pending", "failed"]).lt("attempts", MAX_ATTEMPTS).gte("event_time", since).limit(200);
  let sent = 0;
  for (const r of data ?? []) {
    await deliver(r.id);
    const { data: after } = await admin.from("meta_events").select("status").eq("id", r.id).single();
    if (after?.status === "sent") sent++;
  }
  return { tried: data?.length ?? 0, sent };
}

// A test event with a made-up contact. Shows under Test events in Events Manager.
export async function sendTestEvent(clientId: string, datasetId: string, testCode: string): Promise<Sent> {
  const u = userData({ customer_name: "Test Lead", email: "test@safaridigital.co.tz", phone: "+255700000000", country: "Tanzania", origin: "manual", external_id: null, fbc: null, fbp: null });
  return post(await tokenFor(clientId), datasetId, buildEvent("Lead", new Date(), u, `test-${Date.now()}`), testCode);
}
