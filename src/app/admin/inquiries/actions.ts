"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { after } from "next/server";
import { logActivity } from "@/lib/activity";
import { STATUS_EVENT, sendInquiryEvent } from "@/lib/meta-events";
import { emailNewInquiry } from "@/lib/client-emails";

export type InquiryFormState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string>; saved?: boolean };

const SOURCES = ["meta_ads", "meta_organic", "website", "direct", "unknown"];
const CHANNELS = ["website_form", "meta_lead_form", "whatsapp", "facebook_message", "instagram_message", "email", "phone", "other"];
const STATUSES: string[] = ["new", "contacted", "quoted", "negotiating", "booked", "closed"];

function t(form: FormData, k: string, max = 500) {
  const v = form.get(k);
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
}
function echo(form: FormData) {
  const out: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string" && !k.startsWith("$")) out[k] = v; });
  return out;
}

export async function saveInquiry(id: string | null, _: InquiryFormState, form: FormData): Promise<InquiryFormState> {
  const viewer = await requireAdmin();
  const fe: Record<string, string> = {};
  const clientId = id ? null : t(form, "client_id");
  if (!id && !clientId) fe.client_id = "Choose the client.";
  const name = t(form, "customer_name", 200);
  if (!name) fe.customer_name = "Add the person's name.";
  const email = t(form, "email", 200);
  const phone = t(form, "phone", 60);
  if (!email && !phone) fe.email = "Add an email or a phone number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fe.email = "That doesn't look like an email address.";
  const received = t(form, "received_at", 10);
  if (received && !/^\d{4}-\d{2}-\d{2}$/.test(received)) fe.received_at = "Use a valid date.";
  const rawValue = t(form, "trip_value", 30)?.replace(/[$,\s]/g, "") ?? null;
  const tripValue = rawValue === null ? null : Number(rawValue);
  if (tripValue !== null && (!Number.isFinite(tripValue) || tripValue < 0)) fe.trip_value = "Enter a number of US dollars, e.g. 4200.";
  const follow = t(form, "follow_up_on", 10);
  if (Object.keys(fe).length) return { fieldErrors: fe, values: echo(form) };

  const pickOne = (k: string, allowed: string[], d: string) => { const v = t(form, k); return v && allowed.includes(v) ? v : d; };
  const row = {
    customer_name: name!,
    email, phone,
    country: t(form, "country", 100),
    interested_in: t(form, "interested_in", 300),
    travel_dates: t(form, "travel_dates", 200),
    travellers: t(form, "travellers", 100),
    message: t(form, "message", 5000),
    source: pickOne("source", SOURCES, "unknown"),
    channel: pickOne("channel", CHANNELS, "other"),
    campaign: t(form, "campaign", 200),
    status: pickOne("status", STATUSES, "new"),
    trip_value: tripValue === null ? null : Math.round(tripValue * 100) / 100,
    follow_up_on: follow && /^\d{4}-\d{2}-\d{2}$/.test(follow) ? follow : null,
    notes: t(form, "notes", 5000),
    lost_reason: t(form, "lost_reason", 200),
    ...(received ? { received_at: new Date(received + "T09:00:00Z").toISOString() } : {}),
  };

  const supabase = await createClient();
  if (id) {
    const { data: before } = await supabase.from("inquiries").select("status").eq("id", id).single();
    const { error } = await supabase.from("inquiries").update(row).eq("id", id);
    if (error) return { error: /trip_value|follow_up_on|lost_reason|notes|quoted|negotiating/.test(error.message) ? "Run 0018_pipeline.sql in Supabase to use the pipeline." : "Couldn't save. " + error.message, values: echo(form) };
    const event = before?.status !== row.status ? STATUS_EVENT[row.status] : undefined;
    if (event) after(() => sendInquiryEvent(id, event));
    revalidatePath("/", "layout");
    return { saved: true };
  }
  const { data, error } = await supabase.from("inquiries").insert({ ...row, client_id: clientId, origin: "manual", created_by: viewer.id }).select("id").single();
  if (error || !data) return { error: error && /trip_value|follow_up_on|lost_reason|notes|quoted|negotiating/.test(error.message) ? "Run 0018_pipeline.sql in Supabase to use the pipeline." : "Couldn't add the inquiry. " + (error?.message ?? ""), values: echo(form) };
  const stage = STATUS_EVENT[row.status];
  after(async () => { await sendInquiryEvent(data.id, "Lead"); if (stage) await sendInquiryEvent(data.id, stage); });
  if (row.status === "new") after(() => emailNewInquiry(data.id));
  await logActivity({ clientId: clientId!, actor: "admin", message: `Inquiry from ${name} added`, clientLink: `/portal/inquiries/${data.id}`, adminLink: `/admin/inquiries/${data.id}` });
  revalidatePath("/", "layout");
  redirect(`/admin/inquiries/${data.id}?created=1`);
}

export async function deleteInquiry(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) return { error: "Couldn't delete it. " + error.message };
  revalidatePath("/", "layout");
  redirect("/admin/inquiries?deleted=1");
}

// Several at once, from the Inquiries list (test or spam inquiries).
export async function deleteInquiries(ids: string[]): Promise<{ error?: string; deleted?: number }> {
  await requireAdmin();
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!clean.length) return { error: "Nothing selected." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("inquiries").delete({ count: "exact" }).in("id", clean);
  if (error) return { error: "Couldn't delete them. " + error.message };
  revalidatePath("/", "layout");
  return { deleted: count ?? clean.length };
}
