"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

export type InquiryFormState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string>; saved?: boolean };

const SOURCES = ["meta_ads", "meta_organic", "website", "direct", "unknown"];
const CHANNELS = ["website_form", "meta_lead_form", "whatsapp", "facebook_message", "instagram_message", "email", "phone", "other"];
const STATUSES = ["new", "contacted", "booked", "closed"];

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
    ...(received ? { received_at: new Date(received + "T09:00:00Z").toISOString() } : {}),
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("inquiries").update(row).eq("id", id);
    if (error) return { error: "Couldn't save. " + error.message, values: echo(form) };
    revalidatePath("/", "layout");
    return { saved: true };
  }
  const { data, error } = await supabase.from("inquiries").insert({ ...row, client_id: clientId, origin: "manual", created_by: viewer.id }).select("id").single();
  if (error || !data) return { error: "Couldn't add the inquiry. " + (error?.message ?? ""), values: echo(form) };
  await logActivity({ clientId: clientId!, actor: "admin", message: `Inquiry from ${name} added`, clientLink: `/portal/inquiries/${data.id}`, adminLink: `/admin/inquiries/${data.id}` });
  revalidatePath("/", "layout");
  redirect(`/admin/inquiries/${data.id}?created=1`);
}

export async function deleteInquiry(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("inquiries").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/admin/inquiries");
}
