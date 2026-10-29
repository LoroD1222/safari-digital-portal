import "server-only";
import { createAdminClient } from "./supabase/admin";
import { clientEmails, emailConfigured, send } from "./email";
import { siteOrigin } from "./origin";
import { monthBounds } from "./dates";
import { adChats, formatMoney, SOURCE_LABEL, CHANNEL_LABEL, type Campaign, type InquirySource } from "./types";
import { monthRange } from "./vercel";
import { clientWebsiteStats } from "./site-stats";

// Emails to clients about their business: a new inquiry, and the monthly report.

type Business = { inquiry_dest?: string; inquiry_email?: string };

// New leads go to the inquiry email from onboarding, otherwise to everyone who logs in,
// otherwise to the contact email Safari Digital entered.
async function leadRecipients(clientId: string) {
  const admin = createAdminClient();
  const [{ data: ob }, { data: c }] = await Promise.all([
    admin.from("onboarding_responses").select("data").eq("client_id", clientId).maybeSingle(),
    admin.from("clients").select("contact_email").eq("id", clientId).single(),
  ]);
  const b = ((ob?.data as { business?: Business } | null)?.business) ?? {};
  const inquiry = b.inquiry_dest !== "whatsapp" ? b.inquiry_email?.trim() : undefined;
  if (inquiry && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry)) return [inquiry];
  const logins = await clientEmails(clientId);
  if (logins.length) return logins;
  return c?.contact_email ? [c.contact_email] : [];
}

async function reportRecipients(clientId: string) {
  const logins = await clientEmails(clientId);
  if (logins.length) return logins;
  const { data: c } = await createAdminClient().from("clients").select("contact_email").eq("id", clientId).single();
  return c?.contact_email ? [c.contact_email] : [];
}

// A new inquiry from the website form (or added by Safari Digital). Call inside after().
export async function emailNewInquiry(inquiryId: string) {
  if (!emailConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: q } = await admin.from("inquiries").select("*").eq("id", inquiryId).maybeSingle();
    if (!q) return;
    const to = await leadRecipients(q.client_id);
    if (!to.length) return;
    const phone = (q.phone as string | null)?.replace(/\D/g, "").replace(/^00/, "").replace(/^0(?=[67]\d{8}$)/, "255") ?? "";
    const first = String(q.customer_name).split(/\s+/)[0];
    const actions: { label: string; url: string }[] = [];
    if (phone.length >= 8) actions.push({ label: "Reply on WhatsApp", url: `https://wa.me/${phone}?text=${encodeURIComponent(`Hello ${first}, thank you for your safari inquiry!`)}` });
    if (q.email) actions.push({ label: "Reply by email", url: `mailto:${q.email}?subject=${encodeURIComponent("Your safari inquiry")}` });
    await send(to, {
      subject: `New inquiry: ${q.customer_name}${q.interested_in ? ` · ${q.interested_in}` : ""}`,
      heading: `New inquiry from ${q.customer_name}`,
      intro: "Reply quickly: guests who hear back within the hour book far more often.",
      rows: [
        ["Interested in", q.interested_in], ["Travel dates", q.travel_dates], ["Travellers", q.travellers],
        ["Country", q.country], ["WhatsApp / phone", q.phone], ["Email", q.email],
        ["Came from", `${SOURCE_LABEL[q.source as InquirySource] ?? "Unknown"} · via ${CHANNEL_LABEL[q.channel] ?? q.channel}`],
      ],
      detail: q.message,
      actions,
      path: `/portal/inquiries?open=${q.id}`, button: "Open in portal",
      replyTo: q.email,
      footer: "Replying to this email goes straight to the guest. Mark the inquiry Contacted or Booked in your portal so your ads learn what works.",
    }, await siteOrigin());
  } catch (e) {
    console.error("New inquiry email failed", e);
  }
}

// ─────────── Monthly report ───────────

export type ReportResult = { client: string; status: "sent" | "already sent" | "skipped" | "failed"; note?: string };

async function buildReport(clientId: string, offset: number) {
  const admin = createAdminClient();
  const m = monthBounds(offset);
  const monthName = m.label.split(" ")[0];
  const [{ data: c }, { data: rep }, { data: inq }, { count: posts }] = await Promise.all([
    admin.from("clients").select("id, name, marketing_package, vercel_project_id, tracking_since").eq("id", clientId).single(),
    admin.from("ad_reports").select("meta_spend, meta_inquiries, campaigns").eq("client_id", clientId).eq("month", m.start).maybeSingle(),
    admin.from("inquiries").select("status, source").eq("client_id", clientId).gte("received_at", m.start).lt("received_at", m.next),
    admin.from("content_items").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("published_at", m.start).lt("published_at", m.next),
  ]);
  if (!c) return null;
  const list = inq ?? [];
  const booked = list.filter((i) => i.status === "booked").length;
  const spend = rep ? Number(rep.meta_spend) : null;
  const adInq = rep?.meta_inquiries ?? null;
  const chats = rep ? adChats(rep.campaigns as Campaign[]) : null;
  let visitors: number | null = null;
  const s = await clientWebsiteStats(c, monthRange(offset));
  if (s?.ok) visitors = s.data.visitors;
  const hasAnything = list.length > 0 || (spend ?? 0) > 0 || (posts ?? 0) > 0 || (visitors ?? 0) > 0;
  const rows: [string, string | null][] = [
    ["Inquiries", `${list.length}`],
    ["Confirmed bookings", `${booked}${list.length ? ` (${Math.round((booked / list.length) * 100)}%)` : ""}`],
    ["Ad spend", spend !== null && spend > 0 ? formatMoney(spend, "USD") : null],
    ["Inquiries from ads", adInq ? `${adInq}${chats ? ` (incl. ${chats} chats)` : ""}` : null],
    ["Cost per inquiry from ads", spend && adInq ? formatMoney(Math.round((spend / adInq) * 100) / 100, "USD") : null],
    ["Posts and Reels published", posts ? `${posts}` : null],
    ["Website visitors", visitors !== null ? visitors.toLocaleString("en-US") : null],
  ];
  return {
    name: c.name as string, hasAnything, month: m,
    message: {
      subject: `Your ${monthName} results · ${list.length} ${list.length === 1 ? "inquiry" : "inquiries"}, ${booked} booked`,
      heading: `Your ${monthName} results`,
      intro: `Here's how ${c.name} did in ${m.label}.`,
      rows,
      path: c.marketing_package ? "/portal/marketing/advertising" : "/portal/inquiries",
      button: "See the full report",
      footer: "Sent on the 1st of every month by Safari Digital. Questions? Just reply on WhatsApp.",
    },
  };
}

// Sends last month's report to every client that isn't paused, once per month.
export async function sendMonthlyReports(offset = -1, only?: string): Promise<ReportResult[]> {
  if (!emailConfigured()) return [{ client: "all", status: "skipped", note: "Email isn't set up (RESEND_API_KEY / EMAIL_FROM)." }];
  const admin = createAdminClient();
  let q = admin.from("clients").select("id, name").neq("account_status", "paused");
  if (only) q = q.eq("id", only);
  const { data: clients } = await q;
  const origin = await siteOrigin();
  const out: ReportResult[] = [];
  for (const c of clients ?? []) {
    const r = await buildReport(c.id, offset);
    if (!r) continue;
    const key = `monthly:${r.month.start.slice(0, 7)}:${c.id}`;
    const { data: done, error: logErr } = await admin.from("email_log").select("key").eq("key", key).maybeSingle();
    if (logErr) { out.push({ client: c.name, status: "failed", note: "Run 0011_email_log.sql in Supabase." }); continue; }
    if (done) { out.push({ client: c.name, status: "already sent" }); continue; }
    if (!r.hasAnything) { out.push({ client: c.name, status: "skipped", note: "No activity that month" }); continue; }
    const to = await reportRecipients(c.id);
    if (!to.length) { out.push({ client: c.name, status: "skipped", note: "No email address" }); continue; }
    const ok = await send(to, r.message, origin);
    if (ok) await admin.from("email_log").insert({ key, client_id: c.id, sent_to: to });
    out.push({ client: c.name, status: ok ? "sent" : "failed", note: ok ? to.join(", ") : "Resend refused it. Check Resend → Logs." });
  }
  return out;
}

// Admin preview: send a client's report to Safari Digital's own address, without logging it.
export async function sendReportPreview(clientId: string, to: string[], offset = -1) {
  const r = await buildReport(clientId, offset);
  if (!r) return false;
  return send(to, { ...r.message, subject: `[Preview] ${r.message.subject} · ${r.name}` }, await siteOrigin());
}
