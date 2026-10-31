"use server";
import { revalidatePath } from "next/cache";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { FOLLOWUP_DAYS, FOLLOWUP_STAGES, TEMPLATES, TEMPLATE_KEYS, presetByKey, type FollowupStage, type TemplateKey } from "@/lib/followup-presets";

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
  if (!TEMPLATE_KEYS.includes(template)) return { ok: false, error: "Unknown template." };
  const { error } = await supabase.rpc("set_followups", { p_client_id: clientId, p_enabled: enabled, p_template: template });
  return error ? fail(error.message) : done();
}

// Swap the template's emails in. The client's own follow-ups stay.
export async function chooseTemplate(template: TemplateKey, enabled: boolean): Promise<Result> {
  const { clientId, supabase } = await ctx();
  if (!TEMPLATE_KEYS.includes(template)) return { ok: false, error: "Unknown template." };
  const del = await supabase.from("followup_rules").delete().eq("client_id", clientId).not("preset", "is", null);
  if (del.error) return fail(del.error.message);
  const presets = TEMPLATES[template].presets;
  if (presets.length) {
    const ins = await supabase.from("followup_rules").insert(presets.map((p) => ({
      client_id: clientId, preset: p.key, stage: p.stage, days: p.days, name: p.name, subject: p.subject, body: p.body, enabled: p.on,
    })));
    if (ins.error) return fail(ins.error.message);
  }
  const { error } = await supabase.rpc("set_followups", { p_client_id: clientId, p_enabled: enabled, p_template: template });
  return error ? fail(error.message) : done();
}

export type RulePatch = { enabled?: boolean; days?: number; subject?: string; body?: string; name?: string; stage?: FollowupStage };

export async function saveRule(id: string, patch: RulePatch): Promise<Result> {
  const { clientId, supabase } = await ctx();
  const p: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.enabled !== undefined) p.enabled = !!patch.enabled;
  if (patch.days !== undefined) {
    if (!FOLLOWUP_DAYS.includes(Number(patch.days))) return { ok: false, error: "Pick how many days to wait." };
    p.days = Number(patch.days);
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
  return error ? fail(error.message) : done();
}

// Put a template email back to Safari Digital's wording.
export async function resetRule(id: string): Promise<Result> {
  const { clientId, supabase } = await ctx();
  const { data } = await supabase.from("followup_rules").select("preset").eq("id", id).eq("client_id", clientId).maybeSingle();
  const preset = presetByKey(data?.preset ?? null);
  if (!preset) return { ok: false, error: "This follow-up isn't from a template." };
  const { error } = await supabase.from("followup_rules")
    .update({ name: preset.name, subject: preset.subject, body: preset.body, days: preset.days, updated_at: new Date().toISOString() })
    .eq("id", id).eq("client_id", clientId);
  return error ? fail(error.message) : done();
}

export async function addRule(stage: FollowupStage): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { clientId, supabase } = await ctx();
  if (!FOLLOWUP_STAGES.includes(stage)) return { ok: false, error: "Pick a stage." };
  const { data, error } = await supabase.from("followup_rules").insert({
    client_id: clientId, preset: null, stage, days: 5, enabled: false, name: "My follow-up",
    subject: "Your [Trip]", body: "Hi [First name],\n\n\n\nBest regards,\n[Company name]",
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
