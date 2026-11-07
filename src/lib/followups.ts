import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "./supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TEMPLATES, TEMPLATE_VERSION, autoreplyDefault, composeEmail, firstName, travelDatesLabel, tripLabel,
  type FollowupRule, type FollowupSettings, type TemplateKey,
} from "./followup-presets";
import { MAX_ATTEMPTS, planFollowups, type Cycle, type Plan, type SendRow } from "./followup-plan";
import { sendViaResend, webhookAction } from "./followup-mail";

// Sends the automatic follow-up emails. Runs every hour from /api/cron/followups; each email goes
// inside Monday–Friday 9:00–17:00 in the guest's time zone. See followup-plan.ts for the rules.

const MAX_PER_RUN = 200;          // keeps one run inside the time limit
const GAP_MS = 600;               // Resend allows about 2 emails a second

function secret() {
  return process.env.FOLLOWUP_SECRET ?? process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";
}

export function unsubscribeToken(inquiryId: string) {
  return createHmac("sha256", secret()).update(`unsub:${inquiryId}`).digest("base64url").slice(0, 32);
}

export function validUnsubscribe(inquiryId: string, token: string) {
  if (!secret() || !/^[0-9a-f-]{36}$/i.test(inquiryId)) return false;
  const a = Buffer.from(unsubscribeToken(inquiryId));
  const b = Buffer.from(token ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function portalUrl() {
  const u = process.env.PORTAL_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return u.replace(/\/$/, "");
}

export function unsubscribeUrl(inquiryId: string) {
  return `${portalUrl()}/api/followups/unsubscribe?i=${inquiryId}&t=${unsubscribeToken(inquiryId)}`;
}

// Is the domain of this address verified in Resend? Then follow-ups can go from it.
export async function checkSenderDomain(email: string): Promise<{ ready: boolean; message: string; blocked?: boolean }> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { ready: false, message: "Enter a full email address." };
  // Listing domains needs a Full access key. RESEND_DOMAINS_KEY lets the sending key stay "Sending access" only.
  // Trim spaces, line breaks and quotes that often come along when a key is pasted into Vercel.
  const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const domainsKey = clean(process.env.RESEND_DOMAINS_KEY);
  const key = domainsKey || clean(process.env.RESEND_API_KEY);
  const which = domainsKey ? `RESEND_DOMAINS_KEY (${domainsKey.slice(0, 7)}…)` : "RESEND_API_KEY, because RESEND_DOMAINS_KEY isn't set in this deployment";
  if (!key) return { ready: false, message: "RESEND_API_KEY isn't set in Vercel, so nothing can be sent yet." };
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      const detail = (await res.text().catch(() => "")).slice(0, 160);
      return { ready: false, blocked: true, message: `Resend refused the domain check (${res.status}) with ${which}. ${detail ? `Resend says: ${detail}. ` : ""}The key needs Full access. In Vercel, check RESEND_DOMAINS_KEY is set for Production, then redeploy.` };
    }
    if (!res.ok) return { ready: false, message: `Couldn't reach Resend (${res.status}). Try again in a minute.` };
    const list = ((await res.json()) as { data?: { name: string; status: string }[] }).data ?? [];
    const d = list.find((x) => x.name.toLowerCase() === domain);
    if (!d) return { ready: false, message: `${domain} isn't in Resend yet. Add it under Domains in Resend, then add the DNS records to the client's domain.` };
    if (d.status !== "verified") return { ready: false, message: `${domain} is in Resend but not verified yet (${d.status}). DNS changes can take a few hours.` };
    return { ready: true, message: `${domain} is verified. Follow-ups can be sent from ${email}.` };
  } catch {
    return { ready: false, message: "Couldn't reach Resend. Try again." };
  }
}


// ───────────── Template rules ─────────────

// Puts the chosen template's emails in (the client's own follow-ups stay). Used on first visit,
// when the client switches template, and when Safari Digital updates the template copy.
export async function installTemplate(db: SupabaseClient, clientId: string, template: TemplateKey) {
  const del = await db.from("followup_rules").delete().eq("client_id", clientId).not("preset", "is", null);
  if (del.error) return del.error;
  const presets = TEMPLATES[template].presets;
  if (!presets.length) return null;
  const { error } = await db.from("followup_rules").insert(presets.map((x) => ({
    client_id: clientId, preset: x.key, step: x.step, stage: x.stage, days: x.days, name: x.step,
    subject: x.subject, body: x.body, enabled: true,
  })));
  return error;
}

// Clients on older template copy get the current emails (with the admin client).
async function upgradeTemplates(db: SupabaseClient, settings: FollowupSettings[]) {
  for (const s of settings.filter((x) => (x.template_version ?? 1) < TEMPLATE_VERSION)) {
    const err = await installTemplate(db, s.client_id, s.template);
    if (!err) {
      await db.from("followup_settings").update({ template_version: TEMPLATE_VERSION }).eq("client_id", s.client_id);
      s.template_version = TEMPLATE_VERSION;
    }
  }
}

// ───────────── Planning one inquiry ─────────────

export type InquiryLite = {
  id: string; client_id: string; customer_name: string; email: string | null; phone: string | null; interested_in: string | null;
  travel_dates: string | null; country: string | null; status: string; followups_stopped_at?: string | null;
};

export function planFor(o: {
  now: number; settings: FollowupSettings | null; rules: FollowupRule[]; cycle: Cycle | null; sends: SendRow[];
  inquiry: InquiryLite; suppressed: boolean;
}): Plan {
  const s = o.settings;
  return planFollowups({
    now: o.now,
    settings: { enabled: !!s?.enabled, enabled_at: s?.enabled_at ?? null, quote_valid_days: s?.quote_valid_days ?? null, senderReady: !!s?.sender_ready && !!s?.from_email },
    maxSends: o.rules.filter((r) => r.enabled).length,
    rules: o.rules, cycle: o.cycle, sends: o.sends,
    inquiry: { email: o.inquiry.email, stopped: !!o.inquiry.followups_stopped_at, suppressed: o.suppressed, travelDates: o.inquiry.travel_dates, country: o.inquiry.country },
    timezone: s?.send_timezone || "Africa/Dar_es_Salaam",
  });
}

// ───────────── The hourly run ─────────────

export async function runFollowups(now = Date.now()) {
  const db = createAdminClient();
  const { data: list, error } = await db.from("followup_settings").select("*").eq("enabled", true);
  if (error) return { ok: false, error: error.message };
  const settingsList = (list ?? []) as FollowupSettings[];
  await upgradeTemplates(db, settingsList);
  const out: Record<string, { sent: number; failed: number; skipped: number }> = {};
  let total = 0;

  for (const s of settingsList) {
    if (total >= MAX_PER_RUN) break;
    if (!s.sender_ready || !s.from_email) continue;
    const [{ data: rulesData }, { data: client }, { data: cyclesData }, { data: supp }] = await Promise.all([
      db.from("followup_rules").select("*").eq("client_id", s.client_id),
      db.from("clients").select("name, account_status").eq("id", s.client_id).maybeSingle(),
      db.from("followup_cycles").select("*").eq("client_id", s.client_id).eq("status", "active").not("confirmed_at", "is", null).limit(2000),
      db.from("followup_suppressions").select("email").eq("client_id", s.client_id),
    ]);
    const rules = (rulesData ?? []) as FollowupRule[];
    const cycles = (cyclesData ?? []) as (Cycle & { inquiry_id: string })[];
    if (!client || client.account_status === "paused" || !rules.some((r) => r.enabled) || !cycles.length) continue;
    const ids = cycles.map((c) => c.inquiry_id);
    const [{ data: inqData }, { data: sendData }] = await Promise.all([
      db.from("inquiries").select("id, client_id, customer_name, email, phone, interested_in, travel_dates, country, status, followups_stopped_at").in("id", ids),
      db.from("followup_sends").select("id, inquiry_id, cycle_id, step_key, channel, status, attempts, sent_at, created_at, message_id").in("inquiry_id", ids),
    ]);
    const suppressed = new Set((supp ?? []).map((x) => String(x.email).toLowerCase()));
    const company = s.from_name?.trim() || client.name;
    const tally = { sent: 0, failed: 0, skipped: 0 };

    for (const c of cycles) {
      if (total >= MAX_PER_RUN) break;
      const q = ((inqData ?? []) as InquiryLite[]).find((x) => x.id === c.inquiry_id);
      if (!q) continue;
      const sends = ((sendData ?? []) as (SendRow & { id: number; inquiry_id: string; message_id: string | null })[]).filter((x) => x.inquiry_id === q.id);
      const plan = planFor({ now, settings: s, rules, cycle: c, sends, inquiry: q, suppressed: !!q.email && suppressed.has(q.email.trim().toLowerCase()) });

      // Record skipped steps so they're never sent late.
      if (plan.skip.length) {
        await db.from("followup_sends").upsert(plan.skip.map((k) => ({
          client_id: q.client_id, inquiry_id: q.id, cycle_id: c.id, step_key: k.rule.id, rule_id: k.rule.id, rule_name: k.rule.step ?? k.rule.name,
          stage: c.stage, stage_since: c.started_at, channel: "email", to_address: q.email ?? "", subject: k.rule.subject,
          template: s.template, status: "skipped", error: k.reason,
        })), { onConflict: "cycle_id,step_key,channel", ignoreDuplicates: true });
        tally.skipped += plan.skip.length;
      }
      if (!plan.next?.sendNow || !q.email) continue;
      const rule = plan.next.rule;
      const mail = composeEmail(rule, { firstName: firstName(q.customer_name), trip: tripLabel(q.interested_in), travelDates: travelDatesLabel(q.travel_dates), agent: s.agent_name, company });

      // Claim the step first: the unique (cycle, step, channel) key stops two runs sending it twice.
      const row = {
        client_id: q.client_id, inquiry_id: q.id, cycle_id: c.id, step_key: rule.id, rule_id: rule.id, rule_name: rule.step ?? rule.name,
        stage: c.stage, stage_since: c.started_at, channel: "email", to_address: q.email.trim(), subject: mail.subject,
        template: s.template, scheduled_for: new Date(plan.next.dueAt).toISOString(), status: "sending", attempts: plan.next.attempt,
      };
      let claimId: number | null = null;
      if (plan.next.attempt === 1) {
        const { data } = await db.from("followup_sends").insert(row).select("id").maybeSingle();
        claimId = (data?.id as number | undefined) ?? null;
      } else {
        const { data } = await db.from("followup_sends").update({ status: "sending", attempts: plan.next.attempt, error: null })
          .eq("cycle_id", c.id).eq("step_key", rule.id).eq("channel", "email").eq("status", "failed").lt("attempts", MAX_ATTEMPTS).select("id").maybeSingle();
        claimId = (data?.id as number | undefined) ?? null;
      }
      if (!claimId) continue;
      total++;

      const domain = s.from_email.split("@")[1] ?? "followups";
      const res = await sendViaResend({
        fromEmail: s.from_email, fromName: company, to: q.email.trim(), subject: mail.subject, body: mail.body, inquiryId: q.id,
        unsubscribeUrl: unsubscribeUrl(q.id), idempotencyKey: `followup-${c.id}-${rule.id}`, threadId: `<inquiry-${q.id}@${domain}>`,
      }, process.env.RESEND_API_KEY);
      if (res.ok) {
        await db.from("followup_sends").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: res.id, error: null }).eq("id", claimId);
        tally.sent++;
      } else {
        // Errors that won't fix themselves use up the attempts at once.
        await db.from("followup_sends").update({ status: "failed", error: res.error, attempts: res.retry ? plan.next.attempt : MAX_ATTEMPTS }).eq("id", claimId);
        tally.failed++;
      }
      await new Promise((ok) => setTimeout(ok, GAP_MS));
    }
    if (tally.sent || tally.failed || tally.skipped) out[company] = tally;
  }
  return { ok: true, total, clients: out };
}

// ───────────── Resend webhook: bounces and spam complaints stop follow-ups ─────────────

export async function handleResendEvent(event: Parameters<typeof webhookAction>[0]) {
  const action = webhookAction(event);
  if (action.kind === "ignore") return { ok: true, action: "ignored" };
  const db = createAdminClient();
  const { data: send } = await db.from("followup_sends").select("id, client_id, inquiry_id, to_address").eq("provider_id", action.providerId).maybeSingle();
  if (!send) {
    // An instant reply that bounced: don't send follow-ups to that address either.
    const { data: ar } = await db.from("inquiries").select("id, client_id, email").eq("autoreply_provider_id", action.providerId).maybeSingle();
    if (!ar) return { ok: true, action: "not a follow-up" };
    if (action.kind === "delivered") return { ok: true, action: "delivered" };
    const email = (action.email || String(ar.email ?? "")).toLowerCase();
    if (email) await db.from("followup_suppressions").upsert({ client_id: ar.client_id, email, reason: action.reason }, { onConflict: "client_id,email" });
    await db.from("inquiries").update({ autoreply_status: "failed", autoreply_error: action.reason, followups_stopped_at: new Date().toISOString(), followups_stop_reason: action.reason })
      .eq("id", ar.id);
    return { ok: true, action: "suppressed" };
  }
  if (action.kind === "delivered") return { ok: true, action: "delivered" };
  const email = (action.email || String(send.to_address)).toLowerCase();
  await db.from("followup_suppressions").upsert({ client_id: send.client_id, email, reason: action.reason }, { onConflict: "client_id,email" });
  await db.from("followup_sends").update({ status: "failed", error: action.reason, attempts: MAX_ATTEMPTS }).eq("id", send.id);
  await db.from("inquiries").update({ followups_stopped_at: new Date().toISOString(), followups_stop_reason: action.reason })
    .eq("client_id", send.client_id).ilike("email", email).is("followups_stopped_at", null);
  return { ok: true, action: "suppressed" };
}

// ───────────── Instant reply to a new website inquiry ─────────────

// Sends the operator's instant reply to the guest, once. Call inside after(). Never throws.
export async function sendAutoReply(inquiryId: string): Promise<{ status: "sent" | "failed" | "skipped"; note?: string }> {
  try {
    const db = createAdminClient();
    const { data: q } = await db.from("inquiries").select("id, client_id, customer_name, email, interested_in, travel_dates, autoreply_status").eq("id", inquiryId).maybeSingle();
    if (!q) return { status: "skipped", note: "No inquiry" };
    const email = String(q.email ?? "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "skipped", note: "No email address" };
    if (q.autoreply_status) return { status: "skipped", note: "Already sent" };
    const [{ data: s }, { data: client }, { data: supp }] = await Promise.all([
      db.from("followup_settings").select("*").eq("client_id", q.client_id).maybeSingle(),
      db.from("clients").select("name, account_status, is_internal").eq("id", q.client_id).maybeSingle(),
      db.from("followup_suppressions").select("email").eq("client_id", q.client_id).ilike("email", email).maybeSingle(),
    ]);
    const settings = s as FollowupSettings | null;
    if (!settings?.autoreply_enabled) return { status: "skipped", note: "Instant reply is off" };
    if (!settings.sender_ready || !settings.from_email) return { status: "skipped", note: "Email address not connected" };
    if (!client || client.account_status === "paused") return { status: "skipped", note: "Account paused" };
    if (supp) return { status: "skipped", note: "Address suppressed" };
    if (email.toLowerCase() === settings.from_email.toLowerCase()) return { status: "skipped", note: "Same as the sender" };

    // Claim it first, so a retry or a second call never sends twice.
    const { data: claimed } = await db.from("inquiries").update({ autoreply_status: "sending", autoreply_at: new Date().toISOString() })
      .eq("id", q.id).is("autoreply_status", null).select("id").maybeSingle();
    if (!claimed) return { status: "skipped", note: "Already sent" };

    const company = settings.from_name?.trim() || String(client.name).replace(/\s*\(internal\)\s*$/i, "");
    const base = autoreplyDefault(!!client.is_internal);
    const mail = composeEmail(
      { subject: settings.autoreply_subject || base.subject, body: settings.autoreply_body || base.body },
      { firstName: firstName(q.customer_name), trip: tripLabel(q.interested_in), travelDates: travelDatesLabel(q.travel_dates), agent: settings.agent_name, company },
    );
    const domain = settings.from_email.split("@")[1] ?? "followups";
    const res = await sendViaResend({
      fromEmail: settings.from_email, fromName: company, to: email, subject: mail.subject, body: mail.body, inquiryId: q.id,
      unsubscribeUrl: unsubscribeUrl(q.id), idempotencyKey: `autoreply-${q.id}`, threadId: `<inquiry-${q.id}@${domain}>`, kind: "autoreply",
    }, process.env.RESEND_API_KEY);
    if (res.ok) {
      await db.from("inquiries").update({ autoreply_status: "sent", autoreply_at: new Date().toISOString(), autoreply_provider_id: res.id, autoreply_error: null }).eq("id", q.id);
      return { status: "sent" };
    }
    await db.from("inquiries").update({ autoreply_status: "failed", autoreply_error: res.error.slice(0, 300) }).eq("id", q.id);
    return { status: "failed", note: res.error };
  } catch (e) {
    console.error("Instant reply failed", e);
    return { status: "failed", note: e instanceof Error ? e.message : "Error" };
  }
}
