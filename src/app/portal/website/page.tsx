import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { monthRange, vercelConfigured, websiteStats } from "@/lib/vercel";
import type { Client, SupportRequest } from "@/lib/types";
import { EmptyState, PageHeader, Stat, buttonClass } from "@/components/ui";
import { Section, Tabs } from "@/components/blocks";
import { Icon } from "@/components/icons";
import { WebsiteStatsView } from "@/components/website-stats";
import { VideoEmbed } from "@/components/video-embed";
import { NewRequestForm } from "@/components/request-forms";
import { RequestList } from "@/components/request-list";
import { ProjectStatus, ProjectTimeline } from "./project";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitePage(props: PageProps<"/portal/website">) {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const sp = await props.searchParams;
  const tab = sp.tab === "analytics" || sp.tab === "performance" ? "analytics" : "overview";
  const m = Number(sp.m === "last" ? -1 : sp.m);
  const offset = Number.isInteger(m) && m <= 0 && m >= -11 ? m : 0;
  const live = !company.website_package || company.website_stage === "live";

  return (
    <>
      <PageHeader title="Website" subtitle={company.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? undefined} />
      <Tabs label="Website" items={[
        { href: "/portal/website", label: live ? "Overview" : "Your project", active: tab === "overview", count: company.design_review === "pending" ? 1 : 0 },
        { href: "/portal/website?tab=analytics", label: "Analytics", active: tab === "analytics" },
      ]} />
      {tab === "analytics"
        ? <Analytics company={company} live={live} offset={offset} />
        : <Overview company={company} live={live} />}
    </>
  );
}

async function Overview({ company, live }: { company: Client; live: boolean }) {
  const supabase = await createClient();
  const [{ data: tuts }, { data: reqs }] = await Promise.all([
    supabase.from("tutorials").select("id, title, url").eq("topic", "website").order("sort").order("created_at"),
    supabase.from("requests").select("*").eq("client_id", company.id).eq("category", "website_change").order("last_message_at", { ascending: false }).limit(20),
  ]);
  const web = live && company.vercel_project_id && vercelConfigured() ? await websiteStats(company.vercel_project_id, monthRange(0)) : null;

  return (
    <>
      <ProjectStatus company={company} live={live} />
      {/* After launch: a quick look at visitors */}
      {live && web?.ok && (
        <section aria-label="This month" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          <Stat label="Visitors this month" value={web.data.visitors.toLocaleString("en-US")} href="/portal/website?tab=analytics" />
          <Stat label="Page views" value={web.data.pageviews.toLocaleString("en-US")} href="/portal/website?tab=analytics" />
        </section>
      )}

      {!live && <ProjectTimeline company={company} />}

      {(tuts ?? []).length > 0 && (
        <Section title="How to manage your website">
          <ul className="grid gap-4 sm:grid-cols-2">
            {(tuts ?? []).map((t) => (
              <li key={t.id} className="flex flex-col gap-2">
                <VideoEmbed url={t.url} title={t.title} />
                <span className="flex items-center gap-2 font-medium"><Icon name="play" size={16} className="text-brand" />{t.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex flex-wrap gap-8">
        <div className="min-w-[280px] flex-[1_1_340px]">
          <Section title={live ? "Request a website change" : "Questions or extra content?"}>
            <NewRequestForm clientId={company.id} categories={["website_change"]} submitLabel="Send"
              placeholder={live ? "e.g. Change the price of the 5-day Tarangire safari to $1,850 from January." : "e.g. Please add our new Zanzibar package. The itinerary is attached."} />
          </Section>
        </div>
        <div className="min-w-[260px] flex-[1_1_300px]">
          <Section title="Your website requests">
            {(reqs ?? []).length === 0
              ? <p className="flex items-center gap-2 text-[13px] text-slate"><Icon name="message" size={16} />No requests yet.</p>
              : <RequestList items={(reqs ?? []) as SupportRequest[]} hrefBase="/portal/requests" />}
          </Section>
        </div>
      </div>
    </>
  );
}

async function Analytics({ company, live, offset }: { company: Client; live: boolean; offset: number }) {
  if (!live) {
    return (
      <EmptyState title="Visitor numbers start when your website launches"
        body="Until then, follow your project's progress on the first tab."
        action={<Link href="/portal/website" className="font-medium text-brand no-underline">See your project</Link>} />
    );
  }
  const range = monthRange(offset);
  const prev = monthRange(offset - 1);
  const supabase = await createClient();
  const countInq = (r: typeof range) => supabase.from("inquiries").select("id", { count: "exact", head: true })
    .eq("client_id", company.id).eq("channel", "website_form").gte("received_at", r.since).lte("received_at", r.until + "T23:59:59Z");
  const [{ count: inq }, { count: inqPrev }] = await Promise.all([countInq(range), countInq(prev)]);
  const prevName = prev.label.split(" ")[0];
  const inqDelta = inqPrev === null ? null : `${(inq ?? 0) - inqPrev >= 0 ? "+" : ""}${(inq ?? 0) - inqPrev} vs ${prevName}`;

  const picker = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <form className="flex items-center gap-2 text-[13px] text-slate">
        <input type="hidden" name="tab" value="analytics" />
        <label htmlFor="m">Month</label>
        <select id="m" name="m" defaultValue={String(offset)} className="h-9 rounded-control border border-field bg-white px-2 text-sm text-ink">
          {[0, -1, -2, -3, -4, -5].map((o) => <option key={o} value={o}>{monthRange(o).label.replace(" (so far)", "")}</option>)}
        </select>
        <button className="h-9 rounded-control border border-field px-3 font-medium text-ink hover:bg-[#F4F5F2]">Show</button>
      </form>
      <span className="rounded-full bg-[#E3F4EA] px-2.5 py-0.5 text-xs font-medium text-forest">Live from Vercel · updated hourly</span>
    </div>
  );
  const callout = (
    <div className="flex flex-wrap items-center gap-3 rounded-card bg-sidebar px-4 py-3">
      <span className="min-w-[240px] flex-1 text-[13px] text-body">
        <span className="font-semibold text-ink">{inq ?? 0} {inq === 1 ? "inquiry" : "inquiries"} came from your website.</span> They&apos;re in your Inquiries list with everything else.
      </span>
      <Link href="/portal/inquiries" className={buttonClass("secondary", "h-9")}>View inquiries</Link>
    </div>
  );

  if (!company.vercel_project_id || !vercelConfigured()) {
    return (
      <>
        {picker}
        <EmptyState title="Visitor numbers aren't connected yet" body="Once Safari Digital connects your website, you'll see visitors, popular pages and where your visitors come from here." />
        {callout}
      </>
    );
  }
  const [stats, before] = await Promise.all([websiteStats(company.vercel_project_id, range), websiteStats(company.vercel_project_id, prev)]);
  return (
    <>
      {picker}
      {stats.ok ? (
        <WebsiteStatsView stats={stats.data} rangeLabel={range.label}
          previous={before.ok ? before.data : null} previousLabel={prevName}
          extra={{ label: "Website inquiries", value: inq ?? 0, delta: inqDelta }}
          between={callout} />
      ) : (
        <EmptyState title="We couldn't load your visitor numbers" body="Please try again in a few minutes. If it keeps happening, let Safari Digital know." />
      )}
    </>
  );
}
