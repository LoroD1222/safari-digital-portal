import type { Metadata } from "next";
import Link from "next/link";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { monthRange } from "@/lib/vercel";
import { clientWebsiteStats } from "@/lib/site-stats";
import { fmtDate, money, monthBounds } from "@/lib/dates";
import { planProgress } from "@/lib/content";
import { formatMoney, invoiceState, type Invoice, MARKETING_LABEL, STAGE_LABEL, WEBSITE_STAGES, type AdReport, type ContentItem, type SupportRequest } from "@/lib/types";
import { EmptyState, Stat } from "@/components/ui";
import { ActivityList, AttentionList, Progress, type AttentionItem } from "@/components/blocks";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const n = (v: number) => v.toLocaleString("en-US");

function Card({ title, sub, link, children, id }: { title: string; sub: React.ReactNode; link?: { href: string; label: string }; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 rounded-card border border-line px-5 py-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col"><h2 id={id} className="text-[15px] font-semibold">{title}</h2><span className="text-[13px] text-slate">{sub}</span></div>
        {link && <Link href={link.href} className="text-[13px] font-medium text-brand no-underline">{link.label}</Link>}
      </div>
      {children}
    </section>
  );
}

export default async function PortalOverview() {
  const { company } = await getPortalContext();
  if (!company) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Welcome</h1>
        <EmptyState title="Your account is almost ready"
          body="Safari Digital still needs to link your sign-in to your company. You'll see your dashboard here as soon as that's done." />
      </>
    );
  }
  const marketing = !!company.marketing_package;
  const website = !!company.website_package || !!company.vercel_project_id || !!company.tracking_since;
  const month = monthBounds(0);
  const supabase = await createClient();
  const [inq, rep, content, reqs, act, newInq] = await Promise.all([
    supabase.from("inquiries").select("id, channel").eq("client_id", company.id).gte("received_at", month.start),
    marketing ? supabase.from("ad_reports").select("*").eq("client_id", company.id).order("month", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    marketing ? supabase.from("content_items").select("id, title, kind, status, published_at").eq("client_id", company.id) : Promise.resolve({ data: [] }),
    supabase.from("requests").select("*").eq("client_id", company.id).neq("status", "completed").order("last_message_at", { ascending: false }),
    supabase.from("activity").select("id, message, created_at, client_link").eq("client_id", company.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("client_id", company.id).eq("status", "new"),
  ]);
  const report = rep.data as AdReport | null;
  const reportMonth = report ? monthBounds(0, new Date(report.month + "T00:00:00Z")).label : null;
  const items = (content.data ?? []) as ContentItem[];
  const awaiting = items.filter((i) => i.status === "awaiting_approval");
  const requests = (reqs.data ?? []) as SupportRequest[];
  const stage = company.website_stage ?? "info_received";
  const live = !company.website_package || stage === "live";
  const web = live ? await clientWebsiteStats(company, monthRange(0)) : null;
  const allInq = (inq.data ?? []) as { channel: string }[];
  const newCount = newInq.count ?? 0;

  // Results cards (same figures as the Advertising and Website pages).
  const stats: { label: string; value: string; note: string; href: string }[] = [];
  if (marketing) {
    const spend = report ? Number(report.meta_spend) : null;
    const cpi = report && report.meta_inquiries > 0 ? Number(report.meta_spend) / report.meta_inquiries : null;
    stats.push(
      { label: "Total inquiries", value: n(allInq.length), note: "All sources · from your Inquiries list", href: "/portal/inquiries" },
      { label: "Meta ad spend", value: spend === null ? "—" : money(spend), note: report ? `Facebook & Instagram · ${reportMonth}` : "Not reported yet", href: "/portal/marketing/advertising" },
      { label: "Cost per Meta inquiry", value: cpi === null ? "—" : money(Math.round(cpi * 100) / 100), note: report ? `${money(spend!)} ÷ ${report.meta_inquiries} Meta Ads inquiries` : "Not reported yet", href: "/portal/marketing/advertising" },
    );
    if (website) stats.push({ label: "Website visitors", value: web?.ok ? n(web.data.visitors) : "—", note: web?.ok ? `${n(web.data.pageviews)} page views` : live ? "Not connected yet" : "Starts when your website launches", href: "/portal/website?tab=analytics" });
  } else {
    stats.push(
      { label: "Website visitors", value: web?.ok ? n(web.data.visitors) : "—", note: web?.ok ? "Unique visitors" : live ? "Not connected yet" : "Starts at launch", href: "/portal/website?tab=analytics" },
      { label: "Website inquiries", value: n(allInq.filter((q) => q.channel === "website_form").length), note: "Source: your website", href: "/portal/inquiries" },
      { label: "Page views", value: web?.ok ? n(web.data.pageviews) : "—", note: "All pages", href: "/portal/website?tab=analytics" },
    );
  }

  const attention: AttentionItem[] = [];
  if (company.onboarding_note) attention.push({ key: "note", title: "Add the details we asked for", detail: "Requested by Safari Digital", href: "/onboarding", action: "Add" });
  else if (company.onboarding_status === "not_started" || company.onboarding_status === "in_progress") attention.push({ key: "ob", title: "Finish your onboarding", detail: "Your answers so far are saved", href: "/onboarding", action: "Continue" });
  const { data: dueInv } = await supabase.from("invoices").select("id, number, total, currency, due_date, status").eq("client_id", company.id).eq("status", "sent");
  for (const i of (dueInv ?? []) as Pick<Invoice, "id" | "number" | "total" | "currency" | "due_date" | "status">[]) {
    const late = invoiceState(i) === "overdue";
    attention.push({ key: `inv-${i.id}`, title: `${late ? "Overdue invoice" : "Invoice to pay"}: ${formatMoney(Number(i.total), i.currency)}`, detail: `${i.number} · ${late ? "was due" : "due"} ${fmtDate(i.due_date)} · M-Pesa`, href: "/portal/account#billing", action: "View" });
  }
  if (awaiting.length) attention.push({ key: "content", title: `Approve ${awaiting.length} new ${awaiting.length === 1 ? (awaiting[0].kind === "reel" ? "Reel" : "post") : awaiting.every((i) => i.kind === "reel") ? "Reels" : "posts"}`, detail: "Marketing · Content", href: awaiting.length === 1 ? `/portal/marketing/${awaiting[0].id}` : "/portal/marketing?show=approval", action: "Review" });
  if (company.design_review === "pending") attention.push({ key: "design", title: "Review your website design", detail: "Website", href: "/portal/website", action: "Review" });
  if (newCount) attention.push({ key: "inq", title: `${newCount} new ${newCount === 1 ? "inquiry" : "inquiries"} to contact`, detail: "Inquiries", href: "/portal/inquiries", action: "View" });
  for (const r of requests.filter((r) => r.status === "waiting_for_client" || r.last_message_role === "admin").slice(0, 3)) {
    attention.push({ key: r.id, title: r.subject, detail: r.status === "waiting_for_client" ? "Safari Digital needs your reply" : "New reply from Safari Digital", href: `/portal/requests/${r.id}`, action: "Reply" });
  }

  const progress = planProgress(items, month.start, month.next);
  const plan = [
    company.plan_reels ? { label: "Reels", done: progress.reels, total: company.plan_reels } : null,
    company.plan_posts ? { label: "Social posts", done: progress.posts, total: company.plan_posts } : null,
  ].filter(Boolean) as { label: string; done: number; total: number }[];
  const current = WEBSITE_STAGES.findIndex((s) => s.key === stage);
  const site = company.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{greeting()}, {company.name}</h1>
          <p className="text-slate">{marketing ? "Here's what's happening with your marketing." : "Here's how your website is doing."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[13px] font-medium text-body">{month.label}</span>
          {marketing && report && (
            <span className="rounded-full bg-[#E8F6EF] px-2.5 py-0.5 text-xs font-medium text-forest">
              Ad results {report.source === "synced" ? "synced from Meta" : `entered ${fmtDate(report.updated_at)}`}
            </span>
          )}
        </div>
      </header>

      <section aria-label="Results" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
        {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} note={s.note} href={s.href} />)}
      </section>

      {(marketing || company.website_package) && (
        <div className="flex flex-wrap gap-4">
          {marketing && (
            <Card id="plan-h" title="Your monthly plan"
              sub={<><span className="font-medium text-brand">{MARKETING_LABEL[company.marketing_package!]} Marketing package</span> · {month.label}</>}
              link={{ href: "/portal/marketing", label: "See content" }}>
              {plan.length ? (
                <>
                  {plan.map((p) => <Progress key={p.label} label={p.label} done={p.done} total={p.total} />)}
                  <span className="text-xs text-slate">A post counts once it&apos;s published.</span>
                </>
              ) : (
                <p className="text-[13px] text-slate">Your monthly Reels and posts will show here once Safari Digital sets up your plan.</p>
              )}
            </Card>
          )}
          {company.website_package && (
            <Card id="web-h" title="Your website" sub={site ?? "Your new website"} link={{ href: "/portal/website", label: "Open" }}>
              <ol aria-label="Website project" className="flex gap-1">
                {WEBSITE_STAGES.map((s, i) => <li key={s.key} title={s.label} className={"h-1.5 flex-1 rounded-full " + (i <= current ? "bg-brand" : "bg-line")} />)}
              </ol>
              <div className="flex flex-wrap justify-between gap-3 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-brand" />{STAGE_LABEL[stage]}</span>
                <span className="text-slate">
                  {live ? (web?.ok ? `${n(web.data.visitors)} visitors this month` : "Live") : company.design_review === "pending" ? "Design ready for your review" : `Step ${current + 1} of ${WEBSITE_STAGES.length}`}
                </span>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-8">
        <section aria-labelledby="att-h" className="flex min-w-0 flex-[3_1_360px] flex-col gap-3">
          <h2 id="att-h" className="text-[15px] font-semibold">Needs your attention</h2>
          <AttentionList items={attention} empty="You're all caught up!" emptyNote="We'll email you when something needs you." />
        </section>
        <section aria-labelledby="act-h" className="flex min-w-0 flex-[2_1_260px] flex-col gap-3">
          <h2 id="act-h" className="text-[15px] font-semibold">Recent activity</h2>
          <ActivityList items={(act.data ?? []).map((a) => ({ id: a.id, message: a.message, created_at: a.created_at, href: a.client_link }))}
            empty="Updates from Safari Digital will show up here." />
        </section>
      </div>
    </>
  );
}
