"use server";
import { revalidatePath } from "next/cache";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { FOLLOWUP_DAYS, FOLLOWUP_STAGES, ALL_TEMPLATE_KEYS, TEMPLATE_VERSION, autoreplyDefault, toDelay, type DelayUnit, composeEmail, presetByKey, type FollowupStage, type TemplateKey } from "@/lib/followup-presets";
import { installTemplate } from "@/lib/followups";
import { sendViaResend } from "@/lib/followup-mail";
import { sendingKey } from "@/lib/resend-keys";

type Result = { ok: true } | { ok: false; error: string };

async function ctx() {
  const { company } = await getPortalContext();
  if (!company) throw new Error("No company");
  return { clientId: company.id, supabase: await createClient() };
}

function fail(message: string): Result {
  return { ok: false, error: /followup|set_followups|log_whatsapp|schema cache/.test(message)
    ? "Follow-ups are almost ready. Safari Digital is finishing the setup." : "Couldn't save. " + message };
}

function done(): Result {
  revalidatePath("/portal/followups");
  return { ok: true };
}

export async function setFollowupsEnabled(enabled: boolean, template: TemplateKey): Promise<Result> {
  const { clientId, supabase } = await ctx();
  if (!ALL_TEMPLATE_KEYS.includes(template)) return { ok: false, error: "Unknown template." };
  const { error } = await supabase.rpc("set_followups", { p_client_id: clientId, p_enabled: enabled, p_template: template });
  return error ? fail(error.message) : done();
}

// Swap the template's emails in. The client's own follow-ups stay. The new emails are created now,
// so any step that would already be due is skipped rather than sent late (no backlog).
export async function chooseTemplate(template: TemplateKey, enabled: boolean): Promise<Result> {
  const { clientId, supabase } = await ctx();
  if (!ALL_TEMPLATE_KEYS.includes(template)) return { ok: false, error: "Unknown template." };
  const err = await installTemplate(supabase, clientId, template);
  if (err) return fail(err.message);
  const { error } = await supabase.rpc("set_followups", { p_client_id: clientId, p_enabled: enabled, p_template: template });
  if (error) return fail(error.message);
  await supabase.rpc("set_followup_template_version", { p_client_id: clientId, p_version: TEMPLATE_VERSION });
  return done();
}

// Who the emails are signed by, the fallback time zone, and how long quotes stay valid.
export async function saveFollowupPrefs(p: { agent_name: string; timezone: string; quote_valid_days: number | null }): Promise<Result> {
  const { clientId, supabase } = await ctx();
  let tzOk = true;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: p.timezone }); } catch { tzOk = false; }
  if (!tzOk) return { ok: false, error: "Pick a time zone." };
  const days = p.quote_valid_days ? Math.round(Number(p.quote_valid_days)) : null;
  if (days !== null && (days < 1 || days > 365)) return { ok: false, error: "Quotes can be valid for 1 to 365 days." };
  const { error } = await supabase.rpc("set_followup_prefs", { p_client_id: clientId, p_agent_name: p.agent_name ?? "", p_timezone: p.timezone, p_quote_valid_days: days });
  return error ? fail(error.message) : done();
}

export type RulePatch = { enabled?: boolean; days?: number; delay?: { value: number; unit: DelayUnit }; subject?: string; body?: string; name?: string; stage?: FollowupStage };

export async function saveRule(id: string, patch: RulePatch): Promise<Result> {
  const { clientId, supabase } = await ctx();
  const now = new Date().toISOString();
  const p: Record<string, unknown> = { updated_at: now };
  // Changing when an email goes (or switching it on) never sends an already-due step late.
  if (patch.enabled !== undefined || patch.days !== undefined || patch.delay !== undefined || patch.stage !== undefined) p.timing_changed_at = now;
  if (patch.enabled !== undefined) p.enabled = !!patch.enabled;
  if (patch.days !== undefined) {
    if (!FOLLOWUP_DAYS.includes(Number(patch.days))) return { ok: false, error: "Pick how many days to wait." };
    p.days = Number(patch.days);
    p.delay_minutes = null;
  }
  if (patch.delay !== undefined) {
    const d = toDelay(Number(patch.delay.value), patch.delay.unit);
    if ("error" in d) return { ok: false, error: d.error };
    p.days = d.days;
    p.delay_minutes = d.delay_minutes;
  }
  if (patch.stage !== undefined) {
    if (!FOLLOWUP_STAGES.includes(patch.stage)) return { ok: false, error: "Pick a stage." };
    p.stage = patch.stage;
  }
  for (const [k, max] of [["name", 80], ["subject", 150], ["body", 4000]] as const) {
    if (patch[k] === undefined) continue;
    const v = String(patch[k]).trim();
    if (!v) return { ok: false, error: k === "body" ? "Write a message." : k === "subject" ? "Add a subject." : "Add a name." };
    if (v.length > max) return { ok: false, error: `That ${k === "body" ? "message" : k} is too long.` };
    p[k] = v;
  }
  const { error } = await supabase.from("followup_rules").update(p).eq("id", id).eq("client_id", clientId);
  if (error && /delay_minutes|followup_rules_days/.test(error.message)) return { ok: false, error: "Minutes and hours need an update: Safari Digital has to run 0030_followup_delay_minutes.sql." };
  return error ? fail(error.message) : done();
}

// Put a template email back to Safari Digital's wording.
export async function resetRule(id: string): Promise<Result> {
  const { clientId, supabase } = await ctx();
  const { data } = await supabase.from("followup_rules").select("*").eq("id", id).eq("client_id", clientId).maybeSingle();
  const preset = presetByKey(data?.preset ?? null);
  if (!preset) return { ok: false, error: "This follow-up isn't from a template." };
  const { error } = await supabase.from("followup_rules")
    .update({ name: preset.step, subject: preset.subject, body: preset.body, days: preset.days, ...(data && "delay_minutes" in data ? { delay_minutes: null } : {}), updated_at: new Date().toISOString(), timing_changed_at: new Date().toISOString() })
    .eq("id", id).eq("client_id", clientId);
  return error ? fail(error.message) : done();
}

export async function addRule(stage: FollowupStage): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { clientId, supabase } = await ctx();
  if (!FOLLOWUP_STAGES.includes(stage)) return { ok: false, error: "Pick a stage." };
  const { data, error } = await supabase.from("followup_rules").insert({
    client_id: clientId, preset: null, stage, days: 5, enabled: false, name: "My follow-up",
    subject: "Your {{trip_name}}", body: "Hi {{first_name}},\n\n",
  }).select("id").single();
  if (error || !data) return fail(error?.message ?? "unknown error") as { ok: false; error: string };
  revalidatePath("/portal/followups");
  return { ok: true, id: data.id as string };
}

// Only the client's own follow-ups can be deleted; template ones can be switched off.
export async function deleteRule(id: string): Promise<Result> {
  const { clientId, supabase } = await ctx();
  const { error } = await supabase.from("followup_rules").delete().eq("id", id).eq("client_id", clientId).is("preset", null);
  return error ? fail(error.message) : done();
}

// The client tapped "Send on WhatsApp" for a guest.
export async function logWhatsappFollowup(inquiryId: string, ruleId: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await supabase.rpc("log_whatsapp_followup", { p_inquiry_id: inquiryId, p_rule_id: ruleId });
  return error ? fail(error.message) : done();
}

// ───────────── One inquiry (pipeline card and inquiry panel) ─────────────

// "I sent it": follow-ups for this stage count from now. Later it logs a manual message, which pushes the next email back.
export async function confirmFollowupMessage(inquiryId: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await supabase.rpc("confirm_followup_message", { p_inquiry_id: inquiryId });
  revalidatePath("/", "layout");
  return error ? fail(error.message) : { ok: true };
}

// Pause, guest replied, or resume.
export async function setFollowupState(inquiryId: string, state: "paused" | "replied" | "active"): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await supabase.rpc("set_followup_cycle_state", { p_inquiry_id: inquiryId, p_state: state });
  revalidatePath("/", "layout");
  return error ? fail(error.message) : { ok: true };
}

// The instant reply to new website inquiries. Empty subject or message = Safari Digital's wording.
export async function saveAutoReply(p: { enabled: boolean; subject: string; body: string }): Promise<Result> {
  const { clientId, supabase } = await ctx();
  const subject = String(p.subject ?? "").trim();
  const body = String(p.body ?? "").trim();
  if (subject.length > 150) return { ok: false, error: "That subject is too long." };
  if (body.length > 4000) return { ok: false, error: "That message is too long." };
  const { error } = await supabase.rpc("set_followup_autoreply", { p_client_id: clientId, p_enabled: !!p.enabled, p_subject: subject, p_body: body });
  return error ? fail(/set_followup_autoreply|autoreply/.test(error.message) ? "followup " + error.message : error.message) : done();
}

// Sends the instant reply, as a guest called Sarah would get it, to the person signed in.
export async function sendAutoReplyTest(p: { subject: string; body: string }): Promise<Result & { to?: string }> {
  const { viewer, company } = await getPortalContext();
  if (!company) return { ok: false, error: "No company." };
  const supabase = await createClient();
  const { data: s } = await supabase.from("followup_settings").select("*").eq("client_id", company.id).maybeSingle();
  if (!s?.sender_ready || !s?.from_email) return { ok: false, error: "Your email address isn't connected yet, so nothing can be sent. Ask Safari Digital to connect it." };
  const to = viewer.email;
  if (!to) return { ok: false, error: "Your login has no email address." };
  const base = autoreplyDefault(!!company.is_internal);
  const name = (s.from_name as string | null)?.trim() || company.name.replace(/\s*\(internal\)\s*$/i, "");
  const mail = composeEmail({ subject: p.subject.trim() || base.subject, body: p.body.trim() || base.body },
    { firstName: "Sarah", trip: "Kilimanjaro climb", travelDates: "July 2027", agent: s.agent_name as string | null, company: name });
  const res = await sendViaResend({
    fromEmail: s.from_email as string, fromName: name, to, subject: `[Test] ${mail.subject}`, body: mail.body, inquiryId: "test",
    unsubscribeUrl: "https://example.com", idempotencyKey: `autoreply-test-${company.id}-${Date.now()}`, threadId: `<test-${Date.now()}@${String(s.from_email).split("@")[1]}>`, kind: "autoreply",
  }, await sendingKey(company.id));
  return res.ok ? { ok: true, to } : { ok: false, error: `Resend didn't send it. ${res.error}` };
}
