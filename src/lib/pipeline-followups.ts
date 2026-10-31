import "server-only";
import type { createClient } from "./supabase/server";
import { FOLLOWUP_STAGES, TEMPLATES, waNumber, type FollowupRule, type FollowupSettings } from "./followup-presets";
import { DAY, type Cycle, type Plan, type SendRow } from "./followup-plan";
import { planFor, type InquiryLite } from "./followups";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// What the automatic follow-ups do next for each card on the Pipeline, and in the inquiry panel.
export type FollowupBadge = {
  kind: "email" | "whatsapp" | "due" | "sent" | "stopped" | "awaiting" | "paused" | "attention";
  text: string;
};

export function whenText(t: number, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
}

const STAGE_MESSAGE: Record<string, string> = { contacted: "your first reply", quoted: "the quote", negotiating: "your latest message" };

export function badgeFor(plan: Plan, q: InquiryLite, cycle: Cycle | null, tz: string): FollowupBadge | undefined {
  switch (plan.state) {
    case "off": case "none": return undefined;
    case "awaiting": return { kind: "awaiting", text: `Confirm you sent ${STAGE_MESSAGE[cycle?.stage ?? ""] ?? "the message"} to start follow-ups` };
    case "replied": case "paused": return { kind: "paused", text: plan.label };
    case "stopped": return { kind: "stopped", text: plan.label };
    case "trip_passed": case "quote_expired": return { kind: "attention", text: plan.label };
    case "done": case "limit": return { kind: "sent", text: plan.label };
    case "no_email": {
      if (!waNumber(q.phone) || !cycle?.confirmed_at) return undefined;
      return { kind: "whatsapp", text: "Follow-ups for this guest go on WhatsApp, from the Follow-ups page" };
    }
    case "scheduled": {
      const n = plan.next!;
      return { kind: "email", text: `Next email: "${n.rule.subject}", ${whenText(n.dueAt, tz)} (${tz.split("/").pop()?.replace(/_/g, " ")} time)` };
    }
  }
}

export async function loadFollowups(supabase: Supabase, clientId: string, inquiryIds: string[]) {
  const [{ data: s }, { data: r }, cyc, sends, { data: supp }] = await Promise.all([
    supabase.from("followup_settings").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("followup_rules").select("*").eq("client_id", clientId),
    inquiryIds.length ? supabase.from("followup_cycles").select("*").in("inquiry_id", inquiryIds).neq("status", "ended") : Promise.resolve({ data: [] }),
    inquiryIds.length ? supabase.from("followup_sends").select("*").in("inquiry_id", inquiryIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("followup_suppressions").select("email").eq("client_id", clientId),
  ]);
  return {
    settings: s as FollowupSettings | null,
    rules: (r ?? []) as FollowupRule[],
    cycles: ((cyc.data ?? []) as (Cycle & { inquiry_id: string })[]),
    sends: ((sends.data ?? []) as (SendRow & { inquiry_id: string; rule_name: string; subject: string; error: string | null; scheduled_for: string | null })[]),
    suppressed: new Set((supp ?? []).map((x) => String(x.email).toLowerCase())),
  };
}

export async function pipelineFollowups(supabase: Supabase, clientId: string, inquiries: InquiryLite[], now = Date.now()): Promise<{ on: boolean; badges: Record<string, FollowupBadge> }> {
  const open = inquiries.filter((q) => (FOLLOWUP_STAGES as string[]).includes(q.status));
  const f = await loadFollowups(supabase, clientId, open.map((q) => q.id));
  if (!f.settings?.enabled) return { on: false, badges: {} };
  const tz = f.settings.send_timezone || "Africa/Dar_es_Salaam";
  const badges: Record<string, FollowupBadge> = {};
  for (const q of open) {
    const cycle = f.cycles.find((c) => c.inquiry_id === q.id) ?? null;
    const plan = planFor({ now, settings: f.settings, rules: f.rules, cycle, sends: f.sends.filter((x) => x.inquiry_id === q.id), inquiry: q, suppressed: !!q.email && f.suppressed.has(q.email.trim().toLowerCase()) });
    const b = badgeFor(plan, q, cycle, tz);
    if (b) badges[q.id] = b;
  }
  return { on: true, badges };
}

// Everything the inquiry panel shows about follow-ups.
export type InquiryFollowupView = {
  on: boolean; template: string; state: Plan["state"]; label: string; stage: string | null; stageMessage: string;
  confirmed: boolean; canPause: boolean; canResume: boolean; stopped: boolean;
  next: { subject: string; when: string } | null; remaining: number;
  lastSent: { subject: string; when: string } | null;
  history: { id: string; subject: string; status: string; when: string; note: string | null; channel: string }[];
  upcoming: { subject: string; day: number }[];
};

export async function inquiryFollowupView(supabase: Supabase, q: InquiryLite, now = Date.now()): Promise<InquiryFollowupView> {
  const f = await loadFollowups(supabase, q.client_id, [q.id]);
  const tz = f.settings?.send_timezone || "Africa/Dar_es_Salaam";
  const cycle = f.cycles[0] ?? null;
  const plan = planFor({ now, settings: f.settings, rules: f.rules, cycle, sends: f.sends, inquiry: q, suppressed: !!q.email && f.suppressed.has(q.email.trim().toLowerCase()) });
  const sent = f.sends.filter((x) => x.status === "sent");
  const anchor = cycle?.confirmed_at ? new Date(cycle.confirmed_at).getTime() : null;
  const done = (id: string) => f.sends.some((x) => x.cycle_id === cycle?.id && x.step_key === id && x.channel === "email" && x.status !== "failed");
  const upcoming = cycle ? f.rules.filter((r) => r.enabled && r.stage === cycle.stage && !done(r.id)).sort((a, b) => a.days - b.days).map((r) => ({ subject: r.subject, day: r.days })) : [];
  const label = (s: string) => ({ sent: "Sent", sending: "Sending", failed: "Failed", canceled: "Canceled", skipped: "Skipped", scheduled: "Scheduled" })[s] ?? s;
  return {
    on: !!f.settings?.enabled, template: TEMPLATES[f.settings?.template ?? "standard"]?.title ?? "Standard",
    state: plan.state, label: plan.label, stage: cycle?.stage ?? null, stageMessage: STAGE_MESSAGE[cycle?.stage ?? ""] ?? "the message",
    confirmed: !!cycle?.confirmed_at,
    canPause: cycle?.status === "active" || cycle?.status === "awaiting",
    canResume: cycle?.status === "paused" || cycle?.status === "replied",
    stopped: !!q.followups_stopped_at,
    next: plan.next ? { subject: plan.next.rule.subject, when: whenText(plan.next.dueAt, tz) } : null,
    remaining: plan.remaining,
    lastSent: sent[0] ? { subject: sent[0].subject, when: whenText(new Date(sent[0].sent_at ?? sent[0].created_at).getTime(), tz) } : null,
    history: f.sends.slice(0, 30).map((x, i) => ({
      id: `${i}`, subject: x.subject, status: label(x.status), channel: x.channel,
      when: whenText(new Date(x.sent_at ?? x.created_at).getTime(), tz), note: x.status === "sent" ? null : x.error,
    })),
    upcoming: anchor ? upcoming : upcoming,
  };
}

// Guests with a WhatsApp number whose follow-up is due (manual: one tap each). Uses the same steps and the
// same confirmed start as the emails, but no sending window: the operator sends them by hand.
export function whatsappDueFor(o: { now: number; rules: FollowupRule[]; cycle: Cycle | null; sends: SendRow[] }) {
  const c = o.cycle;
  if (!c || c.status !== "active" || !c.confirmed_at) return null;
  const anchor = new Date(c.confirmed_at).getTime();
  const done = (id: string) => o.sends.some((s) => s.cycle_id === c.id && s.step_key === id && s.channel === "whatsapp");
  return o.rules.filter((r) => r.enabled && r.stage === c.stage && !done(r.id))
    .filter((r) => { const at = anchor + r.days * DAY; return at <= o.now && at >= o.now - 7 * DAY; })
    .sort((a, b) => b.days - a.days)[0] ?? null;
}
