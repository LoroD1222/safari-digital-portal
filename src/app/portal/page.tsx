import type { Metadata } from "next";
import Link from "next/link";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { monthRange, vercelConfigured, websiteStats } from "@/lib/vercel";
import { monthBounds, money } from "@/lib/dates";
import { planProgress } from "@/lib/content";
import { MARKETING_LABEL, STAGE_LABEL, WEBSITE_STAGES, packageSummary, type AdReport, type ContentItem, type SupportRequest } from "@/lib/types";
import { ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { ActivityList, AttentionList, Progress, Section, type AttentionItem } from "@/components/blocks";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function PortalOverview() {
  const { company } = await getPortalContext();
  if (!company) {
    return (
      <>
        <PageHeader title="Welcome" />
        <EmptyState title="Your account is almost ready"
          body="Safari Digital still needs to link your sign-in to your company. You'll see your dashboard here as soon as that's done." />
      </>
    );
  }
  const marketing = !!company.marketing_package;
  const month = monthBounds(0);
  const supabase = await createClient();
  const [inq, rep, content, reqs, act] = await Promise.all([
    supabase.from("inquiries").select("id, status, received_at").eq("client_id", company.id).gte("received_at", month.start),
    marketing ? supabase.from("ad_reports").select("*").eq("client_id", company.id).eq("month", month.start).maybeSingle() : Promise.resolve({ data: null }),
    marketing ? supabase.from("content_items").select("id, title, kind, status, published_at").eq("client_id", company.id) : Promise.resolve({ data: [] }),
    supabase.from("requests").select("*").eq("client_id", company.id).neq("status", "completed").order("last_message_at", { ascending: false }),
    supabase.from("activity").select("id, message, created_at, client_link").eq("client_id", company.id).order("created_at", { ascending: false }).limit(5),
  ]);
  const { count: newInquiries } = await supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("client_id", company.id).eq("status", "new");
  const report = rep.data as AdReport | null;
  const items = (content.data ?? []) as ContentItem[];
  const awaiting = items.filter((i) => i.status === "awaiting_approval");
  const requests = (reqs.data ?? []) as SupportRequest[];
  const web = company.vercel_project_id && vercelConfigured() ? await websiteStats(company.vercel_project_id, monthRange(0)) : null;

  const attention: AttentionItem[] = [];
  if (company.onboarding_note) attention.push({ key: "note", title: "Safari Digital needs a few more details", detail: company.onboarding_note, href: "/onboarding" });
  else if (company.onboarding_status === "not_started" || company.onboarding_status === "in_progress") attention.push({ key: "ob", title: "Finish your onboarding", detail: "Your answers so far are saved.", href: "/onboarding" });
  if (awaiting.length) attention.push({ key: "content", title: `Approve ${awaiting.length} ${awaiting.length === 1 ? (awaiting[0].kind === "reel" ? "Reel" : "post") : "posts and Reels"}`, detail: awaiting.slice(0, 3).map((i) => i.title).join(", "), href: awaiting.length === 1 ? `/portal/marketing/${awaiting[0].id}` : "/portal/marketing?show=approval" });
  if (company.design_review === "pending") attention.push({ key: "design", title: "Review your new website design", href: "/portal/website?tab=manage" });
  for (const r of requests.filter((r) => r.status === "waiting_for_client" || r.last_message_role === "admin").slice(0, 3)) {
    attention.push({ key: r.id, title: r.status === "waiting_for_client" ? `Reply needed: ${r.subject}` : `New reply: ${r.subject}`, href: `/portal/requests/${r.id}`, tone: "blue" });
  }
  if (newInquiries) attention.push({ key: "inq", title: `${newInquiries} new ${newInquiries === 1 ? "inquiry" : "inquiries"} to follow up`, detail: "Mark them as Contacted once you've replied.", href: "/portal/inquiries?status=new", tone: "blue" });

  const progress = planProgress(items, month.start, month.next);
  const spend = report ? Number(report.meta_spend) : null;
  const cpi = report && report.meta_inquiries > 0 ? Number(report.meta_spend) / report.meta_inquiries : null;
  const stage = company.website_stage ?? "info_received";
  const building = !!company.website_package && stage !== "live";

  return (
    <>
      <PageHeader title={`${greeting()}, ${company.name}`} subtitle={<>Here&apos;s what&apos;s happening · <span className="text-ink">{month.label}</span></>} />

      <section aria-label="This month" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Stat label="Inquiries" value={(inq.data ?? []).length} note="All sources this month" href="/portal/inquiries" />
        {marketing && <Stat label="Meta ad spend" value={spend === null ? "—" : money(spend)} note={report ? "Entered by Safari Digital" : "Not reported yet"} href="/portal/marketing/advertising" />}
        {marketing && <Stat label="Cost per Meta inquiry" value={cpi === null ? "—" : money(Math.round(cpi * 100) / 100)} note={report ? `${report.meta_inquiries} inquiries from ads` : "Not reported yet"} href="/portal/marketing/advertising" />}
        {web?.ok && <Stat label="Website visitors" value={web.data.visitors.toLocaleString("en-US")} note="This month, live" href="/portal/website" />}
      </section>

      {building && (
        <Link href="/portal/website?tab=manage" className="flex flex-col gap-3 rounded-card border border-line px-5 py-4 text-ink no-underline hover:bg-[#FAFAF8]">
          <span className="flex justify-between gap-3"><span className="font-semibold">Your website</span><span className="text-[13px] text-slate">{STAGE_LABEL[stage]}</span></span>
          <span className="grid grid-cols-5 gap-1.5" aria-hidden="true">
            {WEBSITE_STAGES.map((s, i) => {
              const cur = WEBSITE_STAGES.findIndex((x) => x.key === stage);
              return <span key={s.key} className={"h-1.5 rounded-full " + (i < cur ? "bg-brand" : i === cur ? "bg-mint" : "bg-line-soft")} />;
            })}
          </span>
        </Link>
      )}

      <div className="flex flex-wrap gap-8">
        <div className="flex min-w-[280px] flex-[1_1_380px] flex-col gap-8">
          <Section title="Needs your attention">
            <AttentionList items={attention} empty="You're all caught up!" />
          </Section>
          {marketing && (company.plan_reels || company.plan_posts) ? (
            <Section title="Your monthly plan">
              <div className="flex flex-col gap-4 rounded-card border border-line px-5 py-4">
                <p className="text-[13px] text-slate"><span className="font-medium text-ink">{MARKETING_LABEL[company.marketing_package!]} Marketing</span> · {month.label}</p>
                {!!company.plan_reels && <Progress label="Reels" done={progress.reels} total={company.plan_reels} />}
                {!!company.plan_posts && <Progress label="Social posts" done={progress.posts} total={company.plan_posts} />}
              </div>
            </Section>
          ) : null}
        </div>
        <div className="flex min-w-[260px] flex-[1_1_280px] flex-col gap-8">
          <Section title="Recent activity">
            <ActivityList items={(act.data ?? []).map((a) => ({ id: a.id, message: a.message, created_at: a.created_at, href: a.client_link }))}
              empty="Updates from Safari Digital will show up here." />
          </Section>
          <div className="flex flex-col gap-1 border-t border-line-soft pt-4 text-[13px]">
            <span className="text-slate">Your package</span>
            <span className="font-medium">{packageSummary(company)}</span>
            {company.onboarding_status !== "not_started" && <Link href="/onboarding" className="w-fit font-medium text-brand no-underline">Your onboarding answers</Link>}
          </div>
        </div>
      </div>
      {!attention.length && company.onboarding_status === "not_started" && <ButtonLink href="/onboarding">Start onboarding</ButtonLink>}
    </>
  );
}
