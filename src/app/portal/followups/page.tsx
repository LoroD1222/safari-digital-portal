import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { FollowupsManager, type WhatsappDue, type RecentSend } from "@/components/followups-manager";
import {
  FOLLOWUP_STAGES, TEMPLATES, dueRule, fillTokens, firstName, tripLabel, waNumber,
  type FollowupRule, type FollowupSettings, type TemplateKey,
} from "@/lib/followup-presets";
import { INQUIRY_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowupsPage() {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const supabase = await createClient();

  const [settingsRes, rulesRes] = await Promise.all([
    supabase.from("followup_settings").select("*").eq("client_id", company.id).maybeSingle(),
    supabase.from("followup_rules").select("*").eq("client_id", company.id).order("days"),
  ]);
  if (settingsRes.error || rulesRes.error) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Follow-ups</h1>
        <EmptyState title="Follow-ups are almost ready" body="Safari Digital is finishing setting them up. Check back soon." />
      </>
    );
  }
  const settings = settingsRes.data as FollowupSettings | null;
  const template = (settings?.template ?? "standard") as TemplateKey;
  let rules = (rulesRes.data ?? []) as FollowupRule[];

  // First visit: start with the Standard template (switched off until the client turns follow-ups on).
  if (!rules.length) {
    const { data } = await supabase.from("followup_rules").insert(TEMPLATES[template].presets.map((p) => ({
      client_id: company.id, preset: p.key, stage: p.stage, days: p.days, name: p.name, subject: p.subject, body: p.body, enabled: p.on,
    }))).select("*");
    rules = ((data ?? []) as FollowupRule[]).sort((a, b) => a.days - b.days);
  }
  const enabled = !!settings?.enabled;

  const whatsapp = enabled ? await whatsappDue(supabase, company.id, company.name, rules) : [];

  const { data: recentData } = await supabase.from("followup_sends")
    .select("id, rule_name, subject, channel, status, created_at, inquiries(customer_name)")
    .eq("client_id", company.id).order("created_at", { ascending: false }).limit(15);
  const recent: RecentSend[] = (recentData ?? []).map((r) => {
    const q = r.inquiries as { customer_name?: string } | { customer_name?: string }[] | null;
    return {
      id: String(r.id), guest: (Array.isArray(q) ? q[0]?.customer_name : q?.customer_name) ?? "Guest",
      name: r.rule_name as string, channel: r.channel as "email" | "whatsapp", status: r.status as string, at: r.created_at as string,
    };
  });

  return (
    <FollowupsManager
      company={company.name}
      enabled={enabled}
      template={template}
      senderReady={!!settings?.sender_ready && !!settings?.from_email}
      fromEmail={settings?.from_email ?? null}
      rules={rules}
      whatsapp={whatsapp}
      recent={recent}
    />
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Guests with a WhatsApp number whose follow-up is due: one tap opens WhatsApp with the message ready.
async function whatsappDue(supabase: Supabase, clientId: string, companyName: string, rules: FollowupRule[]): Promise<WhatsappDue[]> {
  const onRules = rules.filter((r) => r.enabled);
  if (!onRules.length) return [];
  const now = Date.now();
  const maxDays = Math.max(...onRules.map((r) => r.days));
  const { data: inq } = await supabase.from("inquiries")
    .select("id, customer_name, phone, interested_in, status, stage_changed_at")
    .eq("client_id", clientId).in("status", FOLLOWUP_STAGES).not("phone", "is", null).is("followups_stopped_at", null)
    .gte("stage_changed_at", new Date(now - (maxDays + 7) * 86_400_000).toISOString())
    .order("stage_changed_at").limit(300);
  const ids = (inq ?? []).map((q) => q.id as string);
  const { data: sent } = ids.length
    ? await supabase.from("followup_sends").select("inquiry_id, rule_id, stage_since").eq("channel", "whatsapp").in("inquiry_id", ids)
    : { data: [] };
  const out: WhatsappDue[] = [];
  for (const q of inq ?? []) {
    const number = waNumber(q.phone as string);
    if (!number) continue;
    const since = new Date(q.stage_changed_at as string).getTime();
    const rule = dueRule(onRules, q.status as string, q.stage_changed_at as string,
      (id) => (sent ?? []).some((s) => s.inquiry_id === q.id && s.rule_id === id && new Date(s.stage_since as string).getTime() === since), now);
    if (!rule) continue;
    const trip = tripLabel(q.interested_in as string | null);
    const text = fillTokens(rule.body, { name: firstName(q.customer_name as string), trip, company: companyName });
    out.push({
      inquiryId: q.id as string, ruleId: rule.id, guest: q.customer_name as string, trip,
      stage: INQUIRY_LABEL[q.status as keyof typeof INQUIRY_LABEL], days: Math.floor((now - since) / 86_400_000), ruleName: rule.name,
      url: `https://wa.me/${number}?text=${encodeURIComponent(text)}`,
    });
  }
  return out.slice(0, 100);
}
