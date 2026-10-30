import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "./supabase/admin";
import {
  FOLLOWUP_STAGES, fillTokens, firstName, tripLabel,
  type FollowupRule, type FollowupSettings, type FollowupStage,
} from "./followup-presets";

// Sends the automatic follow-up emails. Runs once a day from /api/cron/followups (09:00 Tanzania time).
// A follow-up goes out when an inquiry has sat in the same stage for the follow-up's number of days.
// Moving the card resets the clock, so a guest who replied (and was moved on) never gets one.

const DAY = 86_400_000;
const CATCH_UP_DAYS = 3;          // a follow-up that was due up to 3 days ago still goes (cron missed a day)
const MAX_PER_RUN = 250;          // keeps one run inside the time limit
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

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Plain and personal: reads like the agent wrote it. No Safari Digital branding.
function render(body: string, company: string, unsub: string) {
  const paras = body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const footer = `You're receiving this because you asked ${company} about a trip.`;
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d1f2b">
<div style="max-width:560px;padding:24px 20px">${paras}
<p style="margin:28px 0 0;font-size:11px;line-height:1.5;color:#8a8fa3">${esc(footer)} <a href="${esc(unsub)}" style="color:#8a8fa3">Unsubscribe</a></p>
</div></body></html>`;
  const text = `${body.trim()}\n\n--\n${footer} Unsubscribe: ${unsub}`;
  return { html, text };
}

export async function sendFollowupEmail(o: {
  fromEmail: string; fromName: string; to: string; subject: string; body: string; company: string; inquiryId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY is not set" };
  const unsub = unsubscribeUrl(o.inquiryId);
  const { html, text } = render(o.body, o.company, unsub);
  const name = o.fromName.replace(/["<>]/g, "").trim();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: name ? `${name} <${o.fromEmail}>` : o.fromEmail,
        to: [o.to], reply_to: o.fromEmail, subject: o.subject, html, text,
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

// Is the domain of this address verified in Resend? Then follow-ups can go from it.
export async function checkSenderDomain(email: string): Promise<{ ready: boolean; message: string }> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { ready: false, message: "Enter a full email address." };
  if (!process.env.RESEND_API_KEY) return { ready: false, message: "RESEND_API_KEY isn't set in Vercel, so nothing can be sent yet." };
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: "no-store" });
    if (!res.ok) return { ready: false, message: `Couldn't reach Resend (${res.status}). Check the API key has full access.` };
    const list = ((await res.json()) as { data?: { name: string; status: string }[] }).data ?? [];
    const d = list.find((x) => x.name.toLowerCase() === domain);
    if (!d) return { ready: false, message: `${domain} isn't in Resend yet. Add it under Domains in Resend, then add the DNS records to the client's domain.` };
    if (d.status !== "verified") return { ready: false, message: `${domain} is in Resend but not verified yet (${d.status}). DNS changes can take a few hours.` };
    return { ready: true, message: `${domain} is verified. Follow-ups can be sent from ${email}.` };
  } catch {
    return { ready: false, message: "Couldn't reach Resend. Try again." };
  }
}

type Due = { inquiry: InquiryRow; rule: FollowupRule; settings: FollowupSettings; company: string };
type InquiryRow = { id: string; client_id: string; customer_name: string; email: string; interested_in: string | null; status: FollowupStage; stage_changed_at: string };

export async function runFollowups(now = new Date()) {
  const admin = createAdminClient();
  const { data: list, error } = await admin.from("followup_settings").select("*")
    .eq("enabled", true).eq("sender_ready", true).not("from_email", "is", null);
  if (error) return { ok: false, error: error.message };
  const out: Record<string, { sent: number; failed: number }> = {};
  let total = 0;

  for (const s of (list ?? []) as FollowupSettings[]) {
    if (total >= MAX_PER_RUN) break;
    const [{ data: rulesData }, { data: client }] = await Promise.all([
      admin.from("followup_rules").select("*").eq("client_id", s.client_id).eq("enabled", true),
      admin.from("clients").select("name, account_status").eq("id", s.client_id).maybeSingle(),
    ]);
    const rules = (rulesData ?? []) as FollowupRule[];
    if (!rules.length || !client || client.account_status === "paused") continue;
    const stages = FOLLOWUP_STAGES.filter((st) => rules.some((r) => r.stage === st));
    const minDays = Math.min(...rules.map((r) => r.days));
    const maxDays = Math.max(...rules.map((r) => r.days));

    const { data: inqData } = await admin.from("inquiries")
      .select("id, client_id, customer_name, email, interested_in, status, stage_changed_at")
      .eq("client_id", s.client_id).in("status", stages).not("email", "is", null).is("followups_stopped_at", null)
      .lte("stage_changed_at", new Date(now.getTime() - minDays * DAY).toISOString())
      .gte("stage_changed_at", new Date(now.getTime() - (maxDays + CATCH_UP_DAYS) * DAY).toISOString())
      .limit(1000);
    const inquiries = ((inqData ?? []) as InquiryRow[]).filter((q) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.email.trim()));
    if (!inquiries.length) continue;

    const { data: sendData } = await admin.from("followup_sends").select("inquiry_id, rule_id, stage_since, created_at")
      .eq("channel", "email").in("inquiry_id", inquiries.map((q) => q.id));
    const sends = sendData ?? [];
    const company = s.from_name?.trim() || client.name;
    const due: Due[] = [];
    for (const q of inquiries) {
      const mine = sends.filter((x) => x.inquiry_id === q.id);
      // At most one follow-up per guest per day.
      if (mine.some((x) => now.getTime() - new Date(x.created_at).getTime() < 20 * 3_600_000)) continue;
      const since = new Date(q.stage_changed_at).getTime();
      const next = rules
        .filter((r) => r.stage === q.status)
        .filter((r) => {
          const at = since + r.days * DAY;
          return at <= now.getTime() && at >= now.getTime() - CATCH_UP_DAYS * DAY;
        })
        .filter((r) => !mine.some((x) => x.rule_id === r.id && new Date(x.stage_since).getTime() === since))
        .sort((a, b) => a.days - b.days)[0];
      if (next) due.push({ inquiry: q, rule: next, settings: s, company });
    }

    const tally = { sent: 0, failed: 0 };
    for (const d of due) {
      if (total >= MAX_PER_RUN) break;
      const v = { name: firstName(d.inquiry.customer_name), trip: tripLabel(d.inquiry.interested_in), company: d.company };
      const subject = fillTokens(d.rule.subject, v).slice(0, 200);
      const body = fillTokens(d.rule.body, v);
      // Claim it first: the unique key stops a second run sending the same email.
      const { data: claim, error: claimError } = await admin.from("followup_sends").insert({
        client_id: d.inquiry.client_id, inquiry_id: d.inquiry.id, rule_id: d.rule.id, rule_name: d.rule.name,
        stage: d.inquiry.status, stage_since: d.inquiry.stage_changed_at, channel: "email", to_address: d.inquiry.email.trim(), subject,
      }).select("id").single();
      if (claimError || !claim) continue;
      total++;
      const r = await sendFollowupEmail({
        fromEmail: d.settings.from_email!, fromName: d.company, to: d.inquiry.email.trim(),
        subject, body, company: d.company, inquiryId: d.inquiry.id,
      });
      await admin.from("followup_sends").update(r.ok ? { status: "sent" } : { status: "failed", error: r.error }).eq("id", claim.id);
      if (r.ok) tally.sent++; else tally.failed++;
      await new Promise((ok) => setTimeout(ok, GAP_MS));
    }
    if (tally.sent || tally.failed) out[company] = tally;
  }
  return { ok: true, total, clients: out };
}
