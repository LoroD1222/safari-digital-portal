"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { sendInquiryEvent } from "@/lib/meta-events";
import { CAME_FROM, type CameFrom } from "./came-from";

export type AddInquiryState = { error?: string; fieldErrors?: Record<string, string>; saved?: boolean; name?: string };


function t(form: FormData, k: string, max = 300) {
  const v = form.get(k);
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
}

export async function addInquiry(_: AddInquiryState, form: FormData): Promise<AddInquiryState> {
  const viewer = await requireClient();
  if (!viewer.clientId) return { error: "Your account isn't linked to a company yet." };

  const fe: Record<string, string> = {};
  const name = t(form, "customer_name", 200);
  const phone = t(form, "phone", 60);
  const email = t(form, "email", 200);
  const from = t(form, "came_from", 30) as CameFrom | null;
  const date = t(form, "received_on", 10);
  if (!name) fe.customer_name = "Add their name.";
  // Instagram and Messenger chats can be answered there, so a name is enough for them.
  const dm = from === "instagram_ad" || from === "facebook_ad" || from === "instagram" || from === "facebook";
  if (!phone && !email && !dm) fe.phone = "Add a WhatsApp number or an email.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fe.email = "That email doesn't look right.";
  if (!from || !(from in CAME_FROM)) fe.came_from = "Choose where they came from.";
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fe.received_on = "Use a valid date.";
  if (Object.keys(fe).length) return { fieldErrors: fe };

  // Today keeps the real time; an earlier day is saved at midday Tanzania time.
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const received = !date || date >= today ? new Date().toISOString() : new Date(`${date}T09:00:00Z`).toISOString();
  const kind = CAME_FROM[from!];

  // Clients can only add to their own company; the service role writes the row.
  const admin = createAdminClient();
  const { data, error } = await admin.from("inquiries").insert({
    client_id: viewer.clientId,
    customer_name: name!, phone, email,
    country: t(form, "country", 100),
    interested_in: t(form, "interested_in"),
    travel_dates: t(form, "travel_dates", 200),
    travellers: t(form, "travellers", 100),
    message: t(form, "message", 5000),
    source: kind.source, channel: kind.channel, origin: "manual",
    received_at: received, created_by: viewer.id,
  }).select("id").single();
  if (error || !data) return { error: "Couldn't save the inquiry. Please try again." };

  const id = data.id;
  after(() => sendInquiryEvent(id, "Lead"));
  await logActivity({ clientId: viewer.clientId, actor: "client", message: `Inquiry from ${name} added (${kind.label})`, clientLink: `/portal/inquiries?open=${id}`, adminLink: `/admin/inquiries/${id}` });
  revalidatePath("/", "layout");
  return { saved: true, name: name! };
}

export type AdChatRow = { name: string; where: "whatsapp_ad" | "facebook_ad" | "instagram_ad"; phone: string; asked: string };

// Several chats from ads at once: a name is enough. Each becomes a New inquiry from Meta Ads.
export async function addAdChats(rows: AdChatRow[], receivedOn: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const viewer = await requireClient();
  if (!viewer.clientId) return { ok: false, error: "Your account isn't linked to a company yet." };
  const clean = (rows ?? []).slice(0, 50)
    .map((r) => ({ name: String(r.name ?? "").trim().slice(0, 200), where: r.where, phone: String(r.phone ?? "").trim().slice(0, 60), asked: String(r.asked ?? "").trim().slice(0, 300) }))
    .filter((r) => r.name);
  if (!clean.length) return { ok: false, error: "Add at least one name." };
  if (clean.some((r) => !["whatsapp_ad", "facebook_ad", "instagram_ad"].includes(r.where))) return { ok: false, error: "Choose where each chat happened." };
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const day = receivedOn && /^\d{4}-\d{2}-\d{2}$/.test(receivedOn) && receivedOn < today ? receivedOn : null;
  const received = day ? new Date(`${day}T09:00:00Z`).toISOString() : new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin.from("inquiries").insert(clean.map((r) => ({
    client_id: viewer.clientId, customer_name: r.name, phone: r.phone || null, interested_in: r.asked || null,
    source: CAME_FROM[r.where].source, channel: CAME_FROM[r.where].channel, origin: "manual",
    received_at: received, created_by: viewer.id,
  }))).select("id");
  if (error || !data) return { ok: false, error: "Couldn't save. Please try again." };
  for (const row of data) after(() => sendInquiryEvent(row.id as string, "Lead"));
  await logActivity({ clientId: viewer.clientId, actor: "client", message: `${data.length} ${data.length === 1 ? "chat" : "chats"} from ads added to inquiries`, clientLink: "/portal/inquiries", adminLink: "/admin/inquiries" });
  revalidatePath("/", "layout");
  return { ok: true, count: data.length };
}
