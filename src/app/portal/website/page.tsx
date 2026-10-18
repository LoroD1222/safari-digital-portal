import type { Metadata } from "next";
import Link from "next/link";
import { getPortalContext } from "@/lib/portal";
import { monthRange, vercelConfigured, websiteStats } from "@/lib/vercel";
import { EmptyState, PageHeader } from "@/components/ui";
import { WebsiteStatsView } from "@/components/website-stats";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitePage(props: PageProps<"/portal/website">) {
  const { company } = await getPortalContext();
  const { m } = await props.searchParams;
  const offset = m === "last" ? -1 : 0;
  const range = monthRange(offset);
  const site = company?.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const header = (
    <PageHeader
      title="Website"
      subtitle={site ?? undefined}
      actions={
        <nav aria-label="Month" className="inline-flex rounded-control bg-[#F1F2F4] p-[3px]">
          {[[0, "This month"], [-1, "Last month"]].map(([o, label]) => (
            <Link key={label} href={o === 0 ? "/portal/website" : "/portal/website?m=last"} aria-current={o === offset ? "page" : undefined}
              className={"rounded-badge px-3 py-1 text-[13px] font-medium text-ink no-underline " + (o === offset ? "bg-white shadow-[0_1px_2px_rgba(0,3,33,0.12)]" : "")}>
              {label}
            </Link>
          ))}
        </nav>
      }
    />
  );

  if (!company?.vercel_project_id || !vercelConfigured()) {
    return (
      <>
        {header}
        <EmptyState title="Visitor numbers aren't connected yet" body="Once Safari Digital connects your website, you'll see visitors, popular pages and where your visitors come from here." />
      </>
    );
  }

  const stats = await websiteStats(company.vercel_project_id, range);
  return (
    <>
      {header}
      {stats.ok
        ? <WebsiteStatsView stats={stats.data} rangeLabel={range.label} />
        : <EmptyState title="We couldn't load your visitor numbers" body="Please try again in a few minutes. If it keeps happening, let Safari Digital know." />}
      <p className="text-xs text-slate">Live from your website&apos;s analytics. Updated every hour.</p>
    </>
  );
}
