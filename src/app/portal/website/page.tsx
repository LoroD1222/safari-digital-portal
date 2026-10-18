import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { monthRange, vercelConfigured, websiteStats } from "@/lib/vercel";
import { STAGE_LABEL, WEBSITE_STAGES, type Client, type SupportRequest } from "@/lib/types";
import { Badge, EmptyState, PageHeader, Stat, buttonClass } from "@/components/ui";
import { Section, Tabs } from "@/components/blocks";
import { Icon } from "@/components/icons";
import { WebsiteStatsView } from "@/components/website-stats";
import { VideoEmbed } from "@/components/video-embed";
import { NewRequestForm } from "@/components/request-forms";
import { RequestList } from "@/components/request-list";
import { DesignReview } from "./design-review";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitePage(props: PageProps<"/portal/website">) {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const sp = await props.searchParams;
  const live = !company.website_package || company.website_stage === "live";
  const tab = sp.tab === "manage" || sp.tab === "performance" ? sp.tab : live ? "performance" : "manage";
  const site = company.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <>
      <PageHeader title="Website" subtitle={site ?? undefined}
        actions={company.website_url ? <a href={company.website_url.startsWith("http") ? company.website_url : `https://${company.website_url}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>Visit website<Icon name="external" size={15} /></a> : undefined} />
      <Tabs label="Website" items={[
        { href: "/portal/website?tab=performance", label: "Performance", active: tab === "performance" },
        { href: "/portal/website?tab=manage", label: "Management", active: tab === "manage", count: company.design_review === "pending" ? 1 : 0 },
      ]} />
      {tab === "performance" ? <Performance company={company} offset={sp.m === "last" ? -1 : 0} /> : <Management company={company} />}
    </>
  );
}

async function Performance({ company, offset }: { company: Client; offset: number }) {
  const range = monthRange(offset);
  const supabase = await createClient();
  const { count: formInquiries } = await supabase.from("inquiries").select("id", { count: "exact", head: true })
    .eq("client_id", company.id).eq("channel", "website_form").gte("received_at", range.since).lte("received_at", range.until + "T23:59:59Z");

  const months = (
    <nav aria-label="Month" className="inline-flex w-fit rounded-control bg-[#F1F2F4] p-[3px]">
      {[[0, "This month"], [-1, "Last month"]].map(([o, label]) => (
        <Link key={label} href={o === 0 ? "/portal/website?tab=performance" : "/portal/website?tab=performance&m=last"} aria-current={o === offset ? "page" : undefined} scroll={false}
          className={"rounded-badge px-3 py-1 text-[13px] font-medium text-ink no-underline " + (o === offset ? "bg-white shadow-[0_1px_2px_rgba(0,3,33,0.12)]" : "")}>
          {label}
        </Link>
      ))}
    </nav>
  );
  const inquiriesStat = (
    <section aria-label="Website inquiries" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
      <Stat label="Website form inquiries" value={formInquiries ?? 0} note={range.label} href="/portal/inquiries" />
    </section>
  );

  if (!company.vercel_project_id || !vercelConfigured()) {
    return (
      <>
        {months}
        {inquiriesStat}
        <EmptyState title="Visitor numbers aren't connected yet" body="Once Safari Digital connects your website, you'll see visitors, popular pages and where your visitors come from here." />
      </>
    );
  }
  const stats = await websiteStats(company.vercel_project_id, range);
  return (
    <>
      {months}
      {stats.ok
        ? <WebsiteStatsView stats={stats.data} rangeLabel={range.label} />
        : <EmptyState title="We couldn't load your visitor numbers" body="Please try again in a few minutes. If it keeps happening, let Safari Digital know." />}
      {inquiriesStat}
      <p className="text-xs text-slate">Live from your website&apos;s analytics. Updated every hour.</p>
    </>
  );
}

async function Management({ company }: { company: Client }) {
  const supabase = await createClient();
  const [{ data: tuts }, { data: reqs }] = await Promise.all([
    supabase.from("tutorials").select("id, title, url").eq("topic", "website").order("sort").order("created_at"),
    supabase.from("requests").select("*").eq("client_id", company.id).eq("category", "website_change").order("last_message_at", { ascending: false }).limit(20),
  ]);
  const stage = company.website_stage ?? "info_received";
  const live = !company.website_package || stage === "live";
  const current = WEBSITE_STAGES.findIndex((s) => s.key === stage);

  return (
    <>
      {company.website_package && (
        <section aria-labelledby="proj-h" className="flex flex-col gap-4 rounded-card border border-line px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="proj-h" className="text-[15px] font-semibold">{live ? "Your website" : "Website project"}</h2>
            <Badge tone={live ? "green" : "blue"}>{live ? "Live" : STAGE_LABEL[stage]}</Badge>
          </div>
          {!live && (
            <ol className="grid grid-cols-5 gap-1.5" aria-label="Progress">
              {WEBSITE_STAGES.map((s, i) => (
                <li key={s.key} className="flex flex-col gap-1.5" aria-current={i === current ? "step" : undefined}>
                  <span className={"h-1.5 rounded-full " + (i < current ? "bg-brand" : i === current ? "bg-mint" : "bg-line-soft")} />
                  <span className={"text-[11px] leading-tight sm:text-xs " + (i === current ? "font-semibold text-ink" : "text-slate")}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}
          {company.design_review === "pending" && company.website_preview_url && <DesignReview previewUrl={company.website_preview_url} />}
          {company.design_review === "changes_requested" && stage !== "live" && <p className="text-[13px] text-body">Thanks for your feedback. We&apos;re updating the design and will ask you to review it again.</p>}
        </section>
      )}

      <Section title="How to manage your website">
        {(tuts ?? []).length === 0 ? (
          <p className="text-[13px] text-slate">Training videos will appear here once your website is ready.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {(tuts ?? []).map((t) => (
              <li key={t.id} className="flex flex-col gap-2">
                <VideoEmbed url={t.url} title={t.title} />
                <span className="font-medium">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex flex-wrap gap-8">
        <div className="min-w-[280px] flex-[1_1_340px]">
          <Section title="Request a website change">
            <NewRequestForm clientId={company.id} categories={["website_change"]} submitLabel="Send request"
              placeholder="e.g. Change the price of the 5-day Tarangire safari to $1,850 from January." />
          </Section>
        </div>
        <div className="min-w-[260px] flex-[1_1_300px]">
          <Section title="Your website requests">
            {(reqs ?? []).length === 0 ? <p className="text-[13px] text-slate">No requests yet.</p> : <RequestList items={(reqs ?? []) as SupportRequest[]} hrefBase="/portal/requests" />}
          </Section>
        </div>
      </div>
    </>
  );
}
