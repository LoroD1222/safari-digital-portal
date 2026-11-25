"use server";
import { revalidatePath } from "next/cache";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { eatToIso, googleCalendarUrl, longWhen, type Appointment } from "@/lib/appointments";
import { firstName, signature } from "@/lib/followup-presets";
import { sendViaResend } from "@/lib/followup-mail";
import { sendingKey } from "@/lib/resend-keys";
import { unsubscribeUrl } from "@/lib/followups";

type R = { ok: true; message?: string; id?: string } | { ok: false; error: string };

async function ctx() {
  const { company } = await getPortalContext(true);
  if (!company?.is_internal) throw new Error("The calendar is only for Safari Digital's own account.");
  return { company, supabase: await createClient() };
}
const migrate = (m: string) => (/appointments|meeting_link|set_meeting_defaults/.test(m) ? "Run 0033_appointments.sql in Supabase first." : m);

export type AppointmentInput = {
  title: string; date: string; time: string; duration: number; kind: "online" | "in_person";
  meeting_link?: string; location?: string; notes?: string; inquiry_id?: string | null; invite?: boolean;
};

export async function saveAppointment(input: AppointmentInput, id?: string): Promise<R> {
  const { company, supabase } = await ctx();
  const title = input.title.trim().slice(0, 160);
  if (!title) return { ok: false, error: "Give the meeting a title, e.g. Intro call with Golden Trips." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: "Pick a date and time." };
  const duration = Math.round(Number(input.duration));
  if (!(duration >= 10 && duration <= 480)) return { ok: false, error: "Pick how long the meeting is." };
  const link = (input.meeting_link ?? "").trim();
  if (input.kind === "online" && link && !/^https?:\/\/\S+$/.test(link)) return { ok: false, error: "The meeting link should start with https://" };
  const row = {
    client_id: company.id, title, starts_at: eatToIso(input.date, input.time), duration_min: duration, kind: input.kind,
    meeting_link: input.kind === "online" ? link || null : null,
    location: input.kind === "in_person" ? (input.location ?? "").trim().slice(0, 300) || null : null,
    notes: (input.notes ?? "").trim().slice(0, 2000) || null, inquiry_id: input.inquiry_id || null, updated_at: new Date().toISOString(),
  };
  const res = id
    ? await supabase.from("appointments").update(row).eq("id", id).eq("client_id", company.id).select("*").single()
    : await supabase.from("appointments").insert(row).select("*").single();
  if (res.error) return { ok: false, error: migrate(res.error.message) };
  const appt = res.data as Appointment;

  // A booked meeting moves the lead to "Meeting booked" (unless it's already further along).
  if (appt.inquiry_id) {
    const { data: q } = await supabase.from("inquiries").select("status").eq("id", appt.inquiry_id).maybeSingle();
    if (q && ["new", "contacted", "no_answer", "no_show"].includes(q.status)) await supabase.rpc("set_inquiry_status", { inquiry_id: appt.inquiry_id, new_status: "meeting" });
  }
  let note = id ? "Saved." : "Meeting booked.";
  if (input.invite) {
    const sent = await sendInvite(appt, company.name);
    note += sent.ok ? ` Invite emailed to ${sent.to}.` : ` The invite wasn't sent: ${sent.error}`;
  }
  revalidatePath("/portal/calendar"); revalidatePath("/admin/calendar"); revalidatePath("/portal/pipeline"); revalidatePath("/admin/inquiries");
  return { ok: true, message: note, id: appt.id };
}

// Email the guest the meeting details, from Safari Digital's connected follow-up address.
async function sendInvite(a: Appointment, companyName: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (!a.inquiry_id) return { ok: false, error: "pick the lead it's with, so we know their email." };
  const supabase = await createClient();
  const [{ data: q }, { data: s }] = await Promise.all([
    supabase.from("inquiries").select("customer_name, email").eq("id", a.inquiry_id).maybeSingle(),
    supabase.from("followup_settings").select("*").eq("client_id", a.client_id).maybeSingle(),
  ]);
  const to = String(q?.email ?? "").trim();
  if (!to) return { ok: false, error: "this lead has no email address." };
  if (!s?.sender_ready || !s?.from_email) return { ok: false, error: "connect the email address under Follow-ups first." };
  const company = (s.from_name as string | null)?.trim() || companyName.replace(/\s*\(internal\)\s*$/i, "");
  const where = a.kind === "online"
    ? (a.meeting_link ? `Join here: ${a.meeting_link}` : "I'll send you the meeting link before we start.")
    : `Where: ${a.location ?? "I'll confirm the address"}`;
  const body = [
    `Hi ${firstName(q?.customer_name) ?? "there"},`,
    `Looking forward to our meeting. Here are the details:`,
    `When: ${longWhen(a.starts_at, a.duration_min)}\n${where}`,
    `Add it to your calendar: ${googleCalendarUrl(a)}`,
    `If the time doesn't work for you, just reply to this email and we'll find another one.`,
    signature({ agent: s.agent_name as string | null, company }),
  ].join("\n\n");
  const domain = String(s.from_email).split("@")[1];
  const r = await sendViaResend({
    fromEmail: s.from_email as string, fromName: company, to, subject: `Our meeting: ${longWhen(a.starts_at, a.duration_min).replace(/ \(Tanzania time, EAT\)$/, " EAT")}`, body,
    inquiryId: a.inquiry_id, unsubscribeUrl: unsubscribeUrl(a.inquiry_id), idempotencyKey: `appt-${a.id}-${Date.parse(a.starts_at)}`,
    threadId: `<inquiry-${a.inquiry_id}@${domain}>`, kind: "appointment",
  }, await sendingKey(a.client_id));
  if (!r.ok) return { ok: false, error: r.error };
  await supabase.from("appointments").update({ invite_sent_at: new Date().toISOString() }).eq("id", a.id);
  return { ok: true, to };
}

export async function sendAppointmentInvite(id: string): Promise<R> {
  const { company, supabase } = await ctx();
  const { data } = await supabase.from("appointments").select("*").eq("id", id).eq("client_id", company.id).maybeSingle();
  if (!data) return { ok: false, error: "Meeting not found." };
  const r = await sendInvite(data as Appointment, company.name);
  revalidatePath("/portal/calendar"); revalidatePath("/admin/calendar");
  return r.ok ? { ok: true, message: `Invite emailed to ${r.to}.` } : { ok: false, error: `Not sent: ${r.error}` };
}

// Done / No show / Canceled. A no-show moves the lead to No show, which starts its follow-ups.
export async function setAppointmentStatus(id: string, status: Appointment["status"]): Promise<R> {
  const { company, supabase } = await ctx();
  const { data, error } = await supabase.from("appointments").update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("client_id", company.id).select("inquiry_id").single();
  if (error) return { ok: false, error: migrate(error.message) };
  if (status === "no_show" && data?.inquiry_id) await supabase.rpc("set_inquiry_status", { inquiry_id: data.inquiry_id, new_status: "no_show" });
  revalidatePath("/portal/calendar"); revalidatePath("/admin/calendar"); revalidatePath("/portal/pipeline"); revalidatePath("/admin/inquiries");
  return { ok: true, message: status === "no_show" && data?.inquiry_id ? "Marked as no show. The lead moved to No show and its follow-ups start." : undefined };
}

export async function deleteAppointment(id: string): Promise<R> {
  const { company, supabase } = await ctx();
  const { error } = await supabase.from("appointments").delete().eq("id", id).eq("client_id", company.id);
  revalidatePath("/portal/calendar"); revalidatePath("/admin/calendar");
  return error ? { ok: false, error: error.message } : { ok: true, message: "Deleted." };
}

export async function saveMeetingDefaults(link: string, address: string): Promise<R> {
  const { company, supabase } = await ctx();
  const l = link.trim();
  if (l && !/^https?:\/\/\S+$/.test(l)) return { ok: false, error: "The meeting link should start with https://" };
  const { error } = await supabase.rpc("set_meeting_defaults", { p_client_id: company.id, p_link: l, p_address: address.trim().slice(0, 300) });
  revalidatePath("/portal/calendar"); revalidatePath("/admin/calendar");
  return error ? { ok: false, error: migrate(error.message) } : { ok: true, message: "Saved." };
}
