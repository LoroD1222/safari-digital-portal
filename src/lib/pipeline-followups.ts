import "server-only";
import type { createClient } from "./supabase/server";
import { FOLLOWUP_STAGES, waNumber, type FollowupRule, type FollowupSettings } from "./followup-presets";
import type { Inquiry } from "./types";

// What the automatic follow-ups will do next for each card on the Pipeline.
export type FollowupBadge = { kind: "email" | "whatsapp" | "due" | "sent" | "stopped"; text: string };

const DAY = 86_400_000;
const SEND_HOUR_UTC = 6; // 09:00 Tanzania time, same as the cron

function inDays(n: number) {
  return n <= 1 ? "tomorrow" : `in ${n} days`;
}

export async function pipelineFollowups(
  supabase: Awaited<ReturnType<typeof createClient>>, clientId: string, inquiries: Inquiry[], now = Date.now(),
): Promise<{ on: boolean; badges: Record<string, FollowupBadge> }> {
  const [{ data: s }, { data: r }] = await Promise.all([
    supabase.from("followup_settings").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("followup_rules").select("*").eq("client_id", clientId).eq("enabled", true),
  ]);
  const settings = s as FollowupSettings | null;
  const rules = ((r ?? []) as FollowupRule[]).sort((a, b) => a.days - b.days);
  if (!settings?.enabled) return { on: false, badges: {} };
  const emailReady = !!settings.sender_ready && !!settings.from_email;
  const open = inquiries.filter((q) => (FOLLOWUP_STAGES as string[]).includes(q.status));
  const { data: sendData } = open.length
    ? await supabase.from("followup_sends").select("inquiry_id, rule_id, stage_since, channel, status, created_at").in("inquiry_id", open.map((q) => q.id))
    : { data: [] };
  const sends = sendData ?? [];
  const badges: Record<string, FollowupBadge> = {};

  for (const q of open) {
    if (q.followups_stopped_at) { badges[q.id] = { kind: "stopped", text: "Follow-ups stopped for this guest" }; continue; }
    const since = new Date(q.stage_changed_at ?? q.received_at).getTime();
    const mine = sends.filter((x) => x.inquiry_id === q.id && new Date(x.stage_since as string).getTime() === since && x.status !== "failed");
    const stageRules = rules.filter((x) => x.stage === q.status);
    const useEmail = emailReady && !!q.email;
    const useWa = !useEmail && !!waNumber(q.phone);
    const nextRule = stageRules.find((x) => !mine.some((m) => m.rule_id === x.id));
    if (!nextRule || (!useEmail && !useWa)) {
      const last = mine.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (last) badges[q.id] = { kind: "sent", text: `Follow-up sent ${new Date(last.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} by ${last.channel === "whatsapp" ? "WhatsApp" : "email"}` };
      continue;
    }
    const dueAt = since + nextRule.days * DAY;
    if (useEmail) {
      // The cron runs once a day at 06:00 UTC: work out which run picks it up.
      const run = new Date(dueAt);
      run.setUTCHours(SEND_HOUR_UTC, 0, 0, 0);
      if (run.getTime() < dueAt) run.setTime(run.getTime() + DAY);
      if (run.getTime() < now) run.setTime(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate(), SEND_HOUR_UTC) + (new Date(now).getUTCHours() >= SEND_HOUR_UTC ? DAY : 0));
      const days = Math.round((Date.UTC(run.getUTCFullYear(), run.getUTCMonth(), run.getUTCDate()) - Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())) / DAY);
      badges[q.id] = { kind: "email", text: `"${nextRule.name}" email goes ${days <= 0 ? "today" : inDays(days)} at 9:00` };
    } else if (dueAt <= now) {
      badges[q.id] = { kind: "due", text: `WhatsApp follow-up due: send it from Follow-ups` };
    } else {
      badges[q.id] = { kind: "whatsapp", text: `WhatsApp follow-up ${inDays(Math.ceil((dueAt - now) / DAY))}` };
    }
  }
  return { on: true, badges };
}
