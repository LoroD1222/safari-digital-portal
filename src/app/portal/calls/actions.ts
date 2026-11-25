"use server";
import { revalidatePath } from "next/cache";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { signature } from "@/lib/followup-presets";
import { sendViaResend } from "@/lib/followup-mail";
import { sendingKey } from "@/lib/resend-keys";
import { unsubscribeUrl } from "@/lib/followups";
import {
  DEFAULT_BODY, DEFAULT_SUBJECT, OUTCOMES, cleanCountry, countryFromPhone, eatToIso, parsePhones, prettyPhone, whenLabel, fillTemplate, normalizePhone,
  type CallContact, type CallLog, type ImportRow, type Outcome,
} from "@/lib/calls";
import { saveAppointment } from "../calendar/actions";
import { allRows } from "@/lib/supabase/all-rows";

type R<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };
export type Current = { contact: CallContact; logs: CallLog[] };

async function ctx() {
  const { company, viewer } = await getPortalContext(true);
  if (!company?.is_internal) throw new Error("Cold calling is only for Safari Digital's own account.");
  return { company, viewer, supabase: await createClient() };
}
const migrate = (m: string) => (/position|other_phone/.test(m) && /column|schema cache/i.test(m) ? "Run 0037_call_order.sql in Supabase first."
  : /null value in column "phone"/.test(m) ? "Run 0037_call_order.sql in Supabase first, so rows without a phone number can be kept."
  : /country|address/.test(m) && /column|schema cache/i.test(m) ? "Run 0036_call_country.sql in Supabase first."
  : /call_|claim_|log_call|can_call/.test(m) && /exist|schema cache|function/i.test(m) ? "Run 0035_cold_calling.sql in Supabase first." : m);
const done = () => { revalidatePath("/portal/calls"); revalidatePath("/admin/calls"); };

async function load(id: string): Promise<Current | null> {
  const supabase = await createClient();
  const [{ data: contact }, { data: logs }] = await Promise.all([
    supabase.from("call_contacts").select("*").eq("id", id).maybeSingle(),
    supabase.from("call_logs").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  return contact ? { contact: contact as CallContact, logs: (logs ?? []) as CallLog[] } : null;
}

// The next number in the shared queue. Numbers a colleague is calling are skipped.
export async function nextCall(listId: string | null, skip?: string | null, country?: string | null): Promise<R<{ current: Current | null }>> {
  const { company, supabase } = await ctx();
  const args: Record<string, string | null> = { p_client_id: company.id, p_list_id: listId || null, p_skip: skip || null };
  if (country != null) args.p_country = country; // "" = numbers without a country
  const { data, error } = await supabase.rpc("claim_next_call", args);
  if (error) return { ok: false, error: migrate(error.message) };
  return { ok: true, current: data ? await load(data as string) : null };
}

// Open one particular number from the queue.
export async function openCall(id: string): Promise<R<{ current: Current }>> {
  const { supabase } = await ctx();
  const { data, error } = await supabase.rpc("claim_call", { p_contact_id: id });
  if (error) return { ok: false, error: migrate(error.message) };
  if (!data) return { ok: false, error: "A colleague is calling this number right now. Pick another one." };
  const current = await load(id);
  return current ? { ok: true, current } : { ok: false, error: "Number not found." };
}

export async function releaseCalls(): Promise<void> {
  const { company, supabase } = await ctx();
  await supabase.rpc("release_calls", { p_client_id: company.id });
}

export type LogInput = {
  id: string; outcome: Outcome; note?: string;
  callbackDate?: string; callbackTime?: string; dnc?: boolean;
  // Interested
  name?: string; email?: string; sendEmail?: boolean;
  meeting?: { date: string; time: string; kind: "online" | "in_person"; duration?: number } | null;
};

export async function logCall(input: LogInput): Promise<R<{ status: string; inquiryId?: string }>> {
  const { company, viewer, supabase } = await ctx();
  if (!OUTCOMES.some((o) => o.key === input.outcome)) return { ok: false, error: "Pick how the call went." };
  let callbackAt: string | null = null;
  if (input.outcome === "callback") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.callbackDate ?? "") || !/^\d{2}:\d{2}$/.test(input.callbackTime ?? "")) return { ok: false, error: "Pick when to call back." };
    callbackAt = eatToIso(input.callbackDate!, input.callbackTime!);
    if (Date.parse(callbackAt) <= Date.now()) return { ok: false, error: "The call back time has already passed. Pick a later one." };
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (input.outcome === "interested" && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
  const note = (input.note ?? "").trim().slice(0, 2000);

  const { data: before } = await supabase.from("call_contacts").select("*").eq("id", input.id).maybeSingle();
  if (!before) return { ok: false, error: "Number not found." };
  const c = before as CallContact;
  const { data: status, error } = await supabase.rpc("log_call", {
    p_contact_id: c.id, p_outcome: input.outcome, p_note: note || null, p_callback_at: callbackAt, p_dnc: !!input.dnc,
  });
  if (error) return { ok: false, error: migrate(error.message) };
  if (input.outcome !== "interested") { done(); return { ok: true, status: status as string }; }

  // Interested: into the Pipeline as Contacted (its follow-ups start), then the email and the meeting.
  const name = (input.name ?? "").trim().slice(0, 200) || c.contact_name || c.company || "New lead";
  const admin = createAdminClient();
  // Already in the Pipeline from an earlier call? Use that lead instead of adding a second one.
  if (c.inquiry_id) {
    const { data: prev } = await admin.from("inquiries").select("id, status").eq("id", c.inquiry_id).eq("client_id", company.id).maybeSingle();
    if (prev) return interestedExtras({ inquiryId: prev.id as string, c, name, email, note, input, company, viewer, status: status as string, added: false });
  }
  const { data: q, error: qe } = await admin.from("inquiries").insert({
    client_id: company.id, customer_name: name, phone: c.phone, email: email || c.email || null,
    country: c.country, interested_in: c.company, message: [c.company && `Company: ${c.company}`, c.website && `Website: ${c.website}`, c.address && `Address: ${c.address}`, c.city && `City: ${c.city}`, note && `Call notes: ${note}`].filter(Boolean).join("\n") || null,
    source: "direct", channel: "phone", origin: "manual", status: "contacted",
    received_at: new Date().toISOString(), created_by: viewer.id,
  }).select("id").single();
  if (qe || !q) return { ok: true, status: status as string, message: "Saved, but it couldn't be added to the Pipeline. Add them under Inquiries." };
  return interestedExtras({ inquiryId: q.id as string, c, name, email, note, input, company, viewer, status: status as string, added: true });
}

// After "Interested": link the lead, email them, book the meeting.
async function interestedExtras(a: {
  inquiryId: string; c: CallContact; name: string; email: string; note: string; input: LogInput; status: string; added: boolean;
  company: NonNullable<Awaited<ReturnType<typeof getPortalContext>>["company"]>; viewer: Awaited<ReturnType<typeof getPortalContext>>["viewer"];
}): Promise<R<{ status: string; inquiryId?: string }>> {
  const { inquiryId, c, name, email, note, input, company, viewer, status } = a;
  const supabase = await createClient();
  await supabase.from("call_contacts").update({ inquiry_id: inquiryId, email: email || c.email }).eq("id", c.id);
  if (!a.added) {
    // Back from the dead: put the existing lead back to Contacted unless it's already further along.
    await createAdminClient().from("inquiries").update({ status: "contacted" }).eq("id", inquiryId).in("status", ["new", "no_answer", "no_show", "closed"]);
  } else await logActivity({ clientId: company.id, actor: "client", message: `${c.company ?? name} is interested (cold call)`, clientLink: `/portal/inquiries?open=${inquiryId}`, adminLink: `/admin/inquiries/${inquiryId}` });

  const notes: string[] = [a.added ? `${c.company ?? name} added to the Pipeline.` : `${c.company ?? name} was already in the Pipeline.`];
  if (input.sendEmail && (email || c.email)) {
    const sent = await sendInterestedEmail({ inquiryId, to: email || c.email!, contact: name, company: c.company, city: c.city, country: c.country, clientId: company.id, clientName: company.name, agentFallback: viewer.fullName ?? null });
    notes.push(sent.ok ? `Email sent to ${sent.to}.` : `The email wasn't sent: ${sent.error}`);
  }
  if (input.meeting?.date && input.meeting.time) {
    const m = await saveAppointment({
      title: `Intro call with ${c.company ?? name}`, date: input.meeting.date, time: input.meeting.time, duration: [30, 45, 60].includes(Number(input.meeting.duration)) ? Number(input.meeting.duration) : 30, kind: input.meeting.kind,
      meeting_link: company.meeting_link ?? "", location: company.meeting_address ?? "", notes: note, inquiry_id: inquiryId, invite: !!(email || c.email),
    });
    notes.push(m.ok ? (m.message ?? "Meeting booked.") : `The meeting wasn't booked: ${m.error}`);
  }
  done(); revalidatePath("/portal/pipeline"); revalidatePath("/admin/inquiries");
  return { ok: true, status: status as string, inquiryId, message: notes.join(" ") };
}

// "Great speaking with you" + the case study, from the email address connected under Follow-ups.
async function sendInterestedEmail(a: { inquiryId: string; to: string; contact: string; company: string | null; city: string | null; country: string | null; clientId: string; clientName: string; agentFallback: string | null }):
  Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const [{ data: s }, { data: cs }] = await Promise.all([
    supabase.from("followup_settings").select("*").eq("client_id", a.clientId).maybeSingle(),
    supabase.from("call_settings").select("*").eq("client_id", a.clientId).maybeSingle(),
  ]);
  if (!s?.sender_ready || !s?.from_email) return { ok: false, error: "connect the email address under Follow-ups first." };
  const ours = (s.from_name as string | null)?.trim() || a.clientName.replace(/\s*\(internal\)\s*$/i, "");
  const agent = (s.agent_name as string | null) ?? a.agentFallback;
  const vars = { contact: a.contact, company: a.company, agent, ourCompany: ours, city: a.city, country: a.country };
  const subject = fillTemplate((cs?.interested_subject as string | null) || DEFAULT_SUBJECT, vars);
  let body = fillTemplate((cs?.interested_body as string | null) || DEFAULT_BODY, vars);
  const url = cs?.case_study_url as string | null;
  const file = ((cs?.case_study_name as string | null) || "Case study.pdf").replace(/[\\/:*?"<>|]/g, "");
  // No case study: leave out the paragraph that mentions the attachment.
  if (!url) body = body.split(/\n{2,}/).filter((p) => !/\battach/i.test(p)).join("\n\n").trim();
  body = `${body}\n\n${signature({ agent, company: ours })}`;
  const domain = String(s.from_email).split("@")[1];
  const r = await sendViaResend({
    fromEmail: s.from_email as string, fromName: ours, to: a.to, subject, body,
    inquiryId: a.inquiryId, unsubscribeUrl: unsubscribeUrl(a.inquiryId), idempotencyKey: `coldcall-${a.inquiryId}`,
    threadId: `<inquiry-${a.inquiryId}@${domain}>`, kind: "cold_call",
    attachments: url ? [{ filename: /\.\w{2,4}$/.test(file) ? file : `${file}.pdf`, path: url }] : undefined,
  }, await sendingKey(a.clientId));
  return r.ok ? { ok: true, to: a.to } : { ok: false, error: r.error };
}

// ───────────── Lists ─────────────

export async function importList(input: { listId?: string | null; newName?: string; rows: ImportRow[] }): Promise<R<{ listId: string; added: number; skipped: number; noPhone: number }>> {
  const { company, supabase } = await ctx();
  const rows = (input.rows ?? []).slice(0, 2000);
  if (!rows.length) return { ok: false, error: "There are no rows to import." };
  let listId = input.listId || null;
  if (!listId) {
    const name = (input.newName ?? "").trim().slice(0, 120);
    if (!name) return { ok: false, error: "Give the list a name." };
    const { data, error } = await supabase.from("call_lists").insert({ client_id: company.id, name }).select("id").single();
    if (error || !data) return { ok: false, error: migrate(error?.message ?? "Couldn't create the list.") };
    listId = data.id as string;
  }
  // Skip numbers that are already in a list, on Do not call, or already a lead (all of them, not just the first 1,000).
  const [existing, dnc, leads, last, noPhoneRows] = await Promise.all([
    allRows<{ phone: string | null }>((f, t) => supabase.from("call_contacts").select("phone").eq("client_id", company.id).not("phone", "is", null).order("id").range(f, t)),
    allRows<{ phone: string }>((f, t) => supabase.from("call_dnc").select("phone").eq("client_id", company.id).order("phone").range(f, t)),
    allRows<{ phone: string | null }>((f, t) => supabase.from("inquiries").select("phone").eq("client_id", company.id).not("phone", "is", null).order("id").range(f, t)),
    supabase.from("call_contacts").select("position").eq("list_id", listId).not("position", "is", null).order("position", { ascending: false }).limit(1).maybeSingle(),
    // Rows without a phone already in this list, so uploading the same file twice doesn't add them again.
    allRows<{ company: string | null; email: string | null }>((f, t) => supabase.from("call_contacts").select("company, email").eq("list_id", listId).is("phone", null).order("id").range(f, t)),
  ]);
  const noPhoneKey = (company: string | null, email: string | null) => `${(company ?? "").trim().toLowerCase()}|${(email ?? "").trim().toLowerCase()}`;
  const knownNoPhone = new Set(noPhoneRows.data.map((r) => noPhoneKey(r.company, r.email)));
  if (existing.error) return { ok: false, error: migrate(existing.error.message) };
  const skip = new Set<string>([...existing.data, ...dnc.data].map((r) => r.phone as string));
  for (const l of leads.data) { const p = normalizePhone(l.phone); if (p) skip.add(p); }
  let pos = ((last.data?.position as number | null) ?? 0);
  const seen = new Set<string>();
  const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
  let noPhone = 0;
  const clean = rows.flatMap((r) => {
    const phone = normalizePhone(r.phone);
    const email = s(r.email, 200);
    const comp = s(r.company, 200);
    if (!phone && !comp && !email) return [];
    if (phone && (skip.has(phone) || seen.has(phone))) return [];
    if (!phone) {
      const k = noPhoneKey(comp, email);
      if (knownNoPhone.has(k)) return [];
      knownNoPhone.add(k);
      noPhone++;
    } else seen.add(phone);
    return [{
      client_id: company.id, list_id: listId, position: ++pos, phone, other_phone: s(r.other_phone, 120),
      company: comp, contact_name: s(r.contact_name, 200),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null, website: s(r.website, 300), address: s(r.address, 300), city: s(r.city, 120),
      country: cleanCountry(s(r.country, 80)) ?? (phone ? countryFromPhone(phone) : null),
    }];
  });
  for (let i = 0; i < clean.length; i += 500) {
    const { error } = await supabase.from("call_contacts").insert(clean.slice(i, i + 500));
    if (error) return { ok: false, error: migrate(error.message) };
  }
  done();
  const skipped = rows.length - clean.length;
  return { ok: true, listId: listId!, added: clean.length, skipped, noPhone };
}

export async function saveList(id: string, v: { name: string; script: string }): Promise<R> {
  const { company, supabase } = await ctx();
  const name = v.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "Give the list a name." };
  const script = v.script.trim().slice(0, 6000) || null;
  const { error } = await supabase.from("call_lists").update({ name, script }).eq("id", id).eq("client_id", company.id);
  done();
  return error ? { ok: false, error: migrate(error.message) } : { ok: true, message: "Saved." };
}

export async function archiveList(id: string, archived: boolean): Promise<R> {
  const { company, supabase } = await ctx();
  const { error } = await supabase.from("call_lists").update({ archived }).eq("id", id).eq("client_id", company.id);
  done();
  return error ? { ok: false, error: error.message } : { ok: true, message: archived ? "List archived. Its numbers are out of the queue." : "List is back in the queue." };
}

export async function deleteList(id: string): Promise<R> {
  const { company, supabase } = await ctx();
  const { error } = await supabase.from("call_lists").delete().eq("id", id).eq("client_id", company.id);
  done();
  return error ? { ok: false, error: error.message } : { ok: true, message: "List deleted." };
}

// Put a finished number back in the queue (e.g. a "not interested" who might be worth another try).
export async function reopenNumber(id: string): Promise<R> {
  const { company, supabase } = await ctx();
  const { data: c } = await supabase.from("call_contacts").select("phone").eq("id", id).eq("client_id", company.id).maybeSingle();
  if (!c) return { ok: false, error: "Number not found." };
  const { data: blocked } = await supabase.from("call_dnc").select("phone").eq("client_id", company.id).eq("phone", c.phone).maybeSingle();
  if (blocked) return { ok: false, error: "This number is on Do not call. Remove it there first." };
  const { error } = await supabase.from("call_contacts").update({ status: "retry", attempts: 0, next_call_at: null }).eq("id", id).eq("client_id", company.id);
  done();
  return error ? { ok: false, error: error.message } : { ok: true, message: "Back in the queue." };
}

// ───────────── Settings and Do not call ─────────────

export type SettingsInput = {
  default_script: string; daily_target: number; whatsapp_intro: string; interested_subject: string; interested_body: string; case_study_url: string; case_study_name: string;
};

export async function saveCallSettings(v: SettingsInput): Promise<R> {
  const { company, supabase } = await ctx();
  const target = Math.round(Number(v.daily_target));
  if (!(target >= 1 && target <= 500)) return { ok: false, error: "The daily target should be between 1 and 500." };
  const url = v.case_study_url.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) return { ok: false, error: "The case study link should start with https:// and open the file directly." };
  const t = (s: string, max: number) => s.trim().slice(0, max) || null;
  const { error } = await supabase.from("call_settings").upsert({
    client_id: company.id, daily_target: target, default_script: t(v.default_script, 6000), whatsapp_intro: t(v.whatsapp_intro, 2000),
    interested_subject: t(v.interested_subject, 200), interested_body: t(v.interested_body, 5000),
    case_study_url: url || null, case_study_name: t(v.case_study_name, 120), updated_at: new Date().toISOString(),
  });
  done();
  return error ? { ok: false, error: migrate(error.message) } : { ok: true, message: "Saved." };
}

export async function addDnc(text: string, reason: string): Promise<R<{ added: number }>> {
  const { company, supabase } = await ctx();
  const phones = [...new Set(text.split(/[\n,;]+/).map((x) => normalizePhone(x)).filter((x): x is string => !!x))].slice(0, 1000);
  if (!phones.length) return { ok: false, error: "Add at least one phone number." };
  const { error } = await supabase.from("call_dnc").upsert(phones.map((phone) => ({ client_id: company.id, phone, reason: reason.trim().slice(0, 200) || null })), { onConflict: "client_id,phone", ignoreDuplicates: true });
  done();
  return error ? { ok: false, error: migrate(error.message) } : { ok: true, added: phones.length, message: `${phones.length} ${phones.length === 1 ? "number" : "numbers"} on Do not call. They're out of every list.` };
}

export async function removeDnc(phone: string): Promise<R> {
  const { company, supabase } = await ctx();
  const { error } = await supabase.from("call_dnc").delete().eq("client_id", company.id).eq("phone", phone);
  done();
  return error ? { ok: false, error: error.message } : { ok: true, message: "Removed from Do not call. Reopen the number in its list to call it again." };
}

// ───────────── One number: edit or add by hand ─────────────

export type ContactInput = {
  company: string; contact_name: string; phone: string; other_phone: string; email: string; website: string; address: string; city: string; country: string;
};

function cleanContact(v: ContactInput): { ok: true; row: Record<string, string | null> } | { ok: false; error: string } {
  const phones = parsePhones(v.phone);
  const phone = phones[0] ?? null;
  if (String(v.phone ?? "").trim() && !phone) return { ok: false, error: "That phone number doesn't look right. Use e.g. 0754 123 456 or +44 7700 900123." };
  const others = parsePhones(v.other_phone);
  if (String(v.other_phone ?? "").trim() && !others.length) return { ok: false, error: "The second phone number doesn't look right." };
  const t = (s: string, max: number) => String(s ?? "").trim().slice(0, max) || null;
  const email = t(v.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
  const website = t(v.website, 300);
  if (website && /\s/.test(website)) return { ok: false, error: "The website shouldn't have spaces, e.g. kibosafaris.com" };
  if (!phone && !String(v.company ?? "").trim() && !String(v.email ?? "").trim()) return { ok: false, error: "Add at least a phone number, a company or an email." };
  return { ok: true, row: {
    phone, other_phone: [...phones.slice(1), ...others].filter((p) => p !== phone).map(prettyPhone).join(", ").slice(0, 120) || null, email: email?.toLowerCase() ?? null, website, company: t(v.company, 200), contact_name: t(v.contact_name, 200),
    address: t(v.address, 300), city: t(v.city, 120), country: cleanCountry(v.country) ?? (phone ? countryFromPhone(phone) : null),
  } };
}

export async function updateContact(id: string, v: ContactInput): Promise<R<{ contact: CallContact }>> {
  const { company, supabase } = await ctx();
  const c = cleanContact(v);
  if (!c.ok) return c;
  const { data: blocked } = c.row.phone ? await supabase.from("call_dnc").select("phone").eq("client_id", company.id).eq("phone", c.row.phone).maybeSingle() : { data: null };
  const { data, error } = await supabase.from("call_contacts").update(c.row).eq("id", id).eq("client_id", company.id).select("*").single();
  if (error) return { ok: false, error: /call_contacts_list_phone|duplicate/.test(error.message) ? "That phone number is already in this list." : migrate(error.message) };
  done();
  return { ok: true, contact: data as CallContact, message: blocked ? "Saved. Note: this number is on Do not call." : "Saved." };
}

export async function addContact(listId: string, v: ContactInput): Promise<R> {
  const { company, supabase } = await ctx();
  const c = cleanContact(v);
  if (!c.ok) return c;
  const { data: blocked } = c.row.phone ? await supabase.from("call_dnc").select("phone").eq("client_id", company.id).eq("phone", c.row.phone).maybeSingle() : { data: null };
  if (blocked) return { ok: false, error: "That number is on Do not call." };
  const { data: last } = await supabase.from("call_contacts").select("position").eq("list_id", listId).not("position", "is", null).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("call_contacts").insert({ ...c.row, client_id: company.id, list_id: listId, position: ((last?.position as number | null) ?? 0) + 1 });
  done();
  if (error) return { ok: false, error: /call_contacts_list_phone|duplicate/.test(error.message) ? "That phone number is already in this list." : migrate(error.message) };
  return { ok: true, message: c.row.phone ? "Number added to the queue." : "Added. It goes into the queue once it has a phone number." };
}

// Change when a retry or call back comes up, or bring it forward to now.
export async function rescheduleCall(id: string, when: { date: string; time: string } | "now"): Promise<R> {
  const { company, supabase } = await ctx();
  let at: string;
  if (when === "now") at = new Date().toISOString();
  else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when.date) || !/^\d{2}:\d{2}$/.test(when.time)) return { ok: false, error: "Pick a day and a time." };
    at = eatToIso(when.date, when.time);
    if (Date.parse(at) <= Date.now()) return { ok: false, error: "That time has already passed. Pick a later one, or use Call now." };
  }
  const { data, error } = await supabase.from("call_contacts").update({ next_call_at: at })
    .eq("id", id).eq("client_id", company.id).in("status", ["retry", "callback"]).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "This number isn't waiting for a call any more." };
  done();
  return { ok: true, message: when === "now" ? "Moved to the top of the queue." : `Moved to ${whenLabel(at)}.` };
}
