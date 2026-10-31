import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { FollowupsManager, type WhatsappDue, type RecentSend } from "@/components/followups-manager";
import {
  FOLLOWUP_STAGES, TEMPLATE_VERSION, composeEmail, firstName, travelDatesLabel, tripLabel, waNumber,
  type FollowupRule, type FollowupSettings, type TemplateKey,
} from "@/lib/followup-presets";
import { installTemplate, planFor, type InquiryLite } from "@/lib/followups";
import { loadFollowups, whatsappDueFor } from "@/lib/pipeline-followups";
import { INQUIRY_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Follow-ups" };

type Supabase = Awaited<ReturnType<typeof createClient>>;

export default async function FollowupsPage() {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const supabase = await createClient();

  const [settingsRes, rulesRes] = await Promise.all([
    supabase.from("followup_settings").select("*").eq("client_id", company.id).maybeSingle(),
    supabase.from("followup_rules").select("*").eq("client_id", company.id).order("days"),
  ]);
  if (settingsRes.error || rulesRes.error || (settingsRes.data && !("template_version" in settingsRes.data))) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Follow-ups</h1>
        <EmptyState title="Follow-ups are almost ready" body="Safari Digital is finishing setting them up. Check back soon." />
      </>
    );
  }
  let settings = settingsRes.data as FollowupSettings | null;
  let rules = (rulesRes.data ?? []) as FollowupRule[];

  // First visit: Standard template, switched off. Clients on older template copy get the current emails (their own stay).
  if (!settings || (settings.template_version ?? 1) < TEMPLATE_VERSION) {
    const template = (settings?.template ?? "standard") as TemplateKey;
    if (!settings) await supabase.rpc("set_followups", { p_client_id: company.id, p_enabled: false, p_template: template });
    await installTemplate(supabase, company.id, template);
    await supabase.rpc("set_followup_template_version", { p_client_id: company.id, p_version: TEMPLATE_VERSION });
    const [s2, r2] = await Promise.all([
      supabase.from("followup_settings").select("*").eq("client_id", company.id).maybeSingle(),
      supabase.from("followup_rules").select("*").eq("client_id", company.id).order("days"),
    ]);
    settings = s2.data as FollowupSettings | null;
    rules = (r2.data ?? []) as FollowupRule[];
  }
  const enabled = !!settings?.enabled;
  const status = await overview(supabase, company.id, company.name, settings, rules);

  const { data: recentData } = await supabase.from("followup_sends")
    .select("id, subject, channel, status, error, created_at, sent_at, inquiries(customer_name)")
    .eq("client_id", company.id).in("status", ["sent", "failed"]).order("created_at", { ascending: false }).limit(12);
  const recent: RecentSend[] = (recentData ?? []).map((r) => {
    const q = r.inquiries as { customer_name?: string } | { customer_name?: string }[] | null;
    return {
      id: String(r.id), guest: (Array.isArray(q) ? q[0]?.customer_name : q?.customer_name) ?? "Guest",
      name: r.subject as string, channel: r.channel as "email" | "whatsapp", status: r.status as string,
      at: (r.sent_at ?? r.created_at) as string,
    };
  });

  return (
    <FollowupsManager
      company={company.name}
      enabled={enabled}
      template={(settings?.template ?? "standard") as TemplateKey}
      senderReady={!!settings?.sender_ready && !!settings?.from_email}
      fromEmail={settings?.from_email ?? null}
      prefs={{ agent_name: settings?.agent_name ?? "", timezone: settings?.send_timezone ?? "Africa/Dar_es_Salaam", quote_valid_days: settings?.quote_valid_days ?? null }}
      rules={rules}
      whatsapp={enabled ? status.whatsapp : []}
      scheduled={status.scheduled}
      awaiting={status.awaiting}
      recent={recent}
    />
  );
}

// Counts for the status bar, and the WhatsApp list (guests with a phone number whose follow-up is due).
async function overview(supabase: Supabase, clientId: string, companyName: string, settings: FollowupSettings | null, rules: FollowupRule[]) {
  const now = Date.now();
  const { data: inq } = await supabase.from("inquiries")
    .select("id, client_id, customer_name, email, phone, interested_in, travel_dates, country, status, followups_stopped_at")
    .eq("client_id", clientId).in("status", FOLLOWUP_STAGES).limit(500);
  const list = (inq ?? []) as InquiryLite[];
  const f = await loadFollowups(supabase, clientId, list.map((q) => q.id));
  let scheduled = 0, awaiting = 0;
  const whatsapp: WhatsappDue[] = [];
  for (const q of list) {
    const cycle = f.cycles.find((c) => c.inquiry_id === q.id) ?? null;
    const sends = f.sends.filter((x) => x.inquiry_id === q.id);
    const plan = planFor({ now, settings, rules, cycle, sends, inquiry: q, suppressed: !!q.email && f.suppressed.has(q.email.trim().toLowerCase()) });
    if (plan.state === "scheduled") scheduled++;
    if (plan.state === "awaiting") awaiting++;
    const number = waNumber(q.phone);
    if (!number || q.followups_stopped_at) continue;
    const rule = whatsappDueFor({ now, rules, cycle, sends });
    if (!rule || !cycle?.confirmed_at) continue;
    const mail = composeEmail(rule, { firstName: firstName(q.customer_name), trip: tripLabel(q.interested_in), travelDates: travelDatesLabel(q.travel_dates), agent: settings?.agent_name ?? null, company: companyName });
    const days = Math.floor((now - new Date(cycle.confirmed_at).getTime()) / 86_400_000);
    whatsapp.push({
      inquiryId: q.id, ruleId: rule.id, guest: q.customer_name, trip: tripLabel(q.interested_in) ?? "Tanzania safari",
      stage: INQUIRY_LABEL[q.status as keyof typeof INQUIRY_LABEL], days, ruleName: rule.subject,
      url: `https://wa.me/${number}?text=${encodeURIComponent(mail.body)}`,
    });
  }
  return { scheduled, awaiting, whatsapp: whatsapp.slice(0, 100) };
}
