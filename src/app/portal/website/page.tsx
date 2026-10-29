import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { monthRange } from "@/lib/vercel";
import { clientWebsiteStats, statsSource } from "@/lib/site-stats";
import type { Client } from "@/lib/types";
import { EmptyState, buttonClass } from "@/components/ui";
import { Tabs } from "@/components/blocks";
import { WebsiteStatsView } from "@/components/website-stats";
import { WebsiteCard } from "./project";
import { Training } from "./training";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitePage(props: PageProps<"/portal/website">) {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const sp = await props.searchParams;
  const live = !company.website_package || company.website_stage === "live";
  const tab = sp.tab === "training" || sp.tab === "manage" ? "training" : sp.tab === "performance" || sp.tab === "analytics" ? "performance" : live ? "performance" : "training";
  const m = Number(sp.m === "last" ? -1 : sp.m);
  const offset = Number.isInteger(m) && m <= 0 && m >= -11 ? m : 0;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Website</h1>
      <WebsiteCard company={company} live={live} />
      <Tabs label="Website" items={[
        { href: "/portal/website?tab=performance", label: "Performance", active: tab === "performance" },
        { href: "/portal/website?tab=training", label: "Training", active: tab === "training" },
      ]} />
      {tab === "performance"
        ? <Analytics company={company} live={live} offset={offset} />
        : <TrainingTab />}
    </>
  );
}

async function TrainingTab() {
  const supabase = await createClient();
  const { data } = await supabase.from("tutorials").select("id, title, url").eq("topic", "website").order("sort").order("created_at");
  const videos = (data ?? []) as { id: string; title: string; url: string }[];
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="tr-h" className="flex flex-col gap-3">
        <h2 id="tr-h" className="text-[15px] font-semibold">Website training</h2>
        {videos.length
          ? <Training videos={videos} />
          : <p className="text-[13px] text-slate">Training videos will appear here once Safari Digital adds them.</p>}
      </section>
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-sidebar px-4 py-3.5">
        <span className="flex min-w-[260px] flex-1 flex-col">
          <span className="font-medium">Need a change on your website?</span>
          <span className="text-[13px] text-slate">Message Safari Digital and we&apos;ll take care of it.</span>
        </span>
        <Link href="/portal/requests" className={buttonClass("secondary", "h-9")}>Contact us</Link>
      </div>
    </div>
  );
}

async function Analytics({ company, live, offset }: { company: Client; live: boolean; offset: number }) {
  if (!live) {
    return (
      <div className="rounded-card border border-dashed border-field px-6 py-9 text-center text-slate">
        <span className="mb-1 block font-semibold text-ink">Visitor numbers start when your website launches</span>
        Until then, follow progress above.
      </div>
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
      <span className="rounded-full bg-[#E3F4EA] px-2.5 py-0.5 text-xs font-medium text-forest">Live from website analytics · updated hourly</span>
    </div>
  );
  const callout = (
    <div className="flex flex-wrap items-center gap-3 rounded-card bg-sidebar px-4 py-3">
      <span className="min-w-[240px] flex-1 text-[13px] text-body">
        <span className="font-semibold text-ink">{inq ?? 0} {inq === 1 ? "inquiry" : "inquiries"} came from your website.</span> They&apos;re in your Inquiries list with everything else.
      </span>
      <Link href="/portal/inquiries" className={buttonClass("secondary", "h-9")}>View website inquiries</Link>
    </div>
  );

  if (!statsSource(company)) {
    return (
      <>
        {picker}
        <EmptyState title="Visitor numbers aren't connected yet" body="Once Safari Digital connects your website, you'll see visitors, popular pages and where your visitors come from here." />
        {callout}
      </>
    );
  }
  const [s1, s0] = await Promise.all([clientWebsiteStats(company, range), clientWebsiteStats(company, prev)]);
  const stats = s1 ?? { ok: false as const, error: "" }, before = s0 ?? { ok: false as const, error: "" };
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
